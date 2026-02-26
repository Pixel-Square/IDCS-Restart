from rest_framework import viewsets, status, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q
from django.http import HttpResponse
from .models import CurriculumMaster, CurriculumDepartment, ElectiveSubject
from .serializers import CurriculumMasterSerializer, CurriculumDepartmentSerializer, ElectiveSubjectSerializer
from .permissions import IsIQACOrReadOnly
from accounts.utils import get_user_permissions
from academics.utils import get_user_effective_departments
import logging
from rest_framework.views import exception_handler, APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
import csv, io, re

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.worksheet.datavalidation import DataValidation
    EXCEL_SUPPORT = True
except ImportError:
    EXCEL_SUPPORT = False

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        response.data['status_code'] = response.status_code
        response.data['detail'] = str(exc)

    return response

class CurriculumMasterViewSet(viewsets.ModelViewSet):
    # Order master curriculum entries by semester (ascending) so subjects
    # are arranged sem-wise starting from 1. Tie-break by course_code.
    queryset = CurriculumMaster.objects.all().order_by('semester', 'course_code')
    serializer_class = CurriculumMasterSerializer
    permission_classes = [IsIQACOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[IsIQACOrReadOnly])
    def propagate(self, request, pk=None):
        obj = self.get_object()
        obj.save()  # triggers post_save propagation
        return Response({'status': 'propagation triggered'})

class MasterImportView(APIView):
    """API endpoint to import CurriculumMaster CSV using token/JWT auth.

    Expects multipart/form-data with field `csv_file` containing the CSV.
    Only users with IQAC/HAA group membership or superusers are allowed.
    """
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        # permission: superuser or IQAC/HAA groups
        if not (user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists()):
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        uploaded = request.FILES.get('csv_file')
        if not uploaded:
            return Response({'detail': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            data = uploaded.read().decode('utf-8')
            reader = csv.DictReader(io.StringIO(data))
        except Exception as e:
            return Response({'detail': f'Failed to read CSV: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        created = 0
        updated = 0
        errors = []
        from academics.models import Semester
        from academics.models import Department

        with transaction.atomic():
            for idx, row in enumerate(reader, start=1):
                try:
                    reg = row.get('regulation') or ''
                    sem_raw = (row.get('semester') or '').strip()
                    m = re.search(r"(\d+)", sem_raw)
                    sem_num = int(m.group(1)) if m else 0
                    if not reg or sem_num <= 0:
                        raise ValueError('regulation and semester required')

                    semester_obj, _ = Semester.objects.get_or_create(number=sem_num)

                    cc = row.get('course_code') or None
                    cname = (row.get('course_name') or '').strip() or None
                    instance = None
                    if cc:
                        instance = CurriculumMaster.objects.filter(regulation=reg, semester__number=sem_num, course_code=cc).first()
                    else:
                        if cname:
                            instance = CurriculumMaster.objects.filter(regulation=reg, semester__number=sem_num, course_code__isnull=True, course_name__iexact=cname).first()

                    vals = {
                        'regulation': reg,
                        'semester': semester_obj,
                        'course_code': cc,
                        'course_name': row.get('course_name') or None,
                        'category': row.get('category') or '',
                        'class_type': row.get('class_type') or 'THEORY',
                        'l': int(row.get('l') or 0),
                        't': int(row.get('t') or 0),
                        'p': int(row.get('p') or 0),
                        's': int(row.get('s') or 0),
                        'c': int(row.get('c') or 0),
                        'internal_mark': int(row.get('internal_mark') or 0),
                        'external_mark': int(row.get('external_mark') or 0),
                        'for_all_departments': (str(row.get('for_all_departments') or '').strip().lower() in ('1','true','yes')),
                        'editable': (str(row.get('editable') or '').strip().lower() in ('1','true','yes')),
                    }

                    if instance:
                        for k, v in vals.items():
                            setattr(instance, k, v)
                        instance.save()
                        updated += 1
                    else:
                        instance = CurriculumMaster.objects.create(**vals)
                        created += 1

                    deps = (row.get('departments') or '')
                    if deps:
                        raw = deps.strip().strip('"').strip("'")
                        dep_list = [d.strip() for d in re.split(r'[;,]\s*', raw) if d.strip()]
                        dep_objs = []
                        unmatched = []
                        for d in dep_list:
                            dep = Department.objects.filter(code__iexact=d).first()
                            if not dep and d.isdigit():
                                dep = Department.objects.filter(id=int(d)).first()
                            if dep:
                                dep_objs.append(dep)
                            else:
                                unmatched.append(d)
                        if dep_objs:
                            instance.departments.set(dep_objs)
                            instance.for_all_departments = False
                            instance.save()
                        if unmatched:
                            errors.append(f'Row {idx}: unmatched departments: {",".join(unmatched)}')
                except Exception as e:
                    errors.append(f'Row {idx}: {e}')

        resp = {'created': created, 'updated': updated, 'errors': errors}
        return Response(resp)

class CurriculumDepartmentViewSet(viewsets.ModelViewSet):
    queryset = CurriculumDepartment.objects.all().select_related('department', 'master')
    serializer_class = CurriculumDepartmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Restrict department rows based on user's profile and role.
        user = self.request.user
        qs = CurriculumDepartment.objects.all().select_related('department', 'master')
        if not user or not user.is_authenticated:
            return qs.none()

        # Log the user and their groups for debugging
        logger.debug('get_queryset: user=%s, groups=%s', user.username, [g.name for g in user.groups.all()])

        # compute user's effective department ids (includes HOD mappings)
        dept_ids = get_user_effective_departments(user)
        if not dept_ids:
            # fallback: try student section
            student = getattr(user, 'student_profile', None)
            if student:
                try:
                    section = getattr(student, 'current_section', None) or student.get_current_section()
                    if section and getattr(section, 'batch', None) and getattr(section.batch, 'course', None):
                        dept_ids = [section.batch.course.department_id]
                except Exception:
                    dept_ids = []

        # Users with global access (superuser, IQAC/HAA groups, or explicit wide perms) see all
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists():
            logger.debug('get_queryset: user is superuser or IQAC/HAA; user=%s groups=%s', user.username, [g.name for g in user.groups.all()])
            return qs

        perms = get_user_permissions(user)
        logger.debug('get_queryset: user=%s computed dept_ids=%r perms=%s', getattr(user, 'username', None), dept_ids, perms)
        wide_perms = {'curriculum_master_edit', 'curriculum_master_publish', 'CURRICULUM_MASTER_EDIT', 'CURRICULUM_MASTER_PUBLISH'}
        if perms & wide_perms:
            logger.debug('get_queryset: user has wide_perms, returning all; user=%s', user.username)
            return qs

        # If we found a department for the user, restrict to it
        if dept_ids:
            logger.debug('get_queryset: restricting to departments=%s for user=%s', dept_ids, user.username)
            return qs.filter(department_id__in=dept_ids)

        # otherwise no rows
        logger.debug('get_queryset: no department found, returning none for user=%s', user.username)
        return qs.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        # Log the incoming data for debugging
        logger.debug('perform_update: incoming data=%s', serializer.validated_data)

        user = self.request.user
        privileged = user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists()
        perms = get_user_permissions(user)
        if perms & {'curriculum_department_approve', 'CURRICULUM_DEPARTMENT_APPROVE', 'curriculum.department.approve'}:
            privileged = True

        try:
            if privileged:
                # set approval on update
                instance = serializer.save()
                instance.approval_status = instance.APPROVAL_APPROVED
                instance.approved_by = user
                from django.utils import timezone
                instance.approved_at = timezone.now()
                instance.save(update_fields=['approval_status', 'approved_by', 'approved_at'])
            else:
                # non-privileged -> handled by serializer to mark PENDING
                # capture returned instance so we can include it in the response
                instance = serializer.save()

            # Return the updated instance as a response
            return Response({
                'status': 'success',
                'data': self.get_serializer(instance).data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error('Error during perform_update: %s', str(e))
            raise serializers.ValidationError({'detail': str(e)})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def approve(self, request, pk=None):
        """Approve or reject a department row. Body: {"action": "approve"|"reject"} """
        obj = self.get_object()
        user = request.user
        # permission: IQAC/HAA or role-permission 'curriculum.department.approve'
        privileged = user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists()
        perms = get_user_permissions(user)
        if perms & {'curriculum.department.approve', 'CURRICULUM_DEPARTMENT_APPROVE'}:
            privileged = True
        if not privileged:
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        action = (request.data or {}).get('action')
        from django.utils import timezone
        if action == 'approve':
            obj.approval_status = obj.APPROVAL_APPROVED
            obj.approved_by = user
            obj.approved_at = timezone.now()
            obj.overridden = False
            obj.save()
            return Response({'status': 'approved'})
        elif action == 'reject':
            obj.approval_status = obj.APPROVAL_REJECTED
            obj.approved_by = user
            obj.approved_at = timezone.now()
            obj.save()
            return Response({'status': 'rejected'})
        else:
            return Response({'detail': 'action must be "approve" or "reject"'}, status=status.HTTP_400_BAD_REQUEST)


class ElectiveSubjectViewSet(viewsets.ModelViewSet):
    queryset = ElectiveSubject.objects.all().select_related('department', 'parent', 'semester')
    serializer_class = ElectiveSubjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ElectiveSubject.objects.all().select_related('department', 'parent', 'semester')
        qs = qs.annotate(student_count=Count('choices', filter=Q(choices__is_active=True)))
        req = self.request
        dept_id = req.query_params.get('department_id')
        regulation = req.query_params.get('regulation')
        semester = req.query_params.get('semester')
        if dept_id:
            try:
                qs = qs.filter(department_id=int(dept_id))
            except Exception:
                pass
        if regulation:
            qs = qs.filter(regulation=regulation)
        if semester:
            try:
                qs = qs.filter(semester__number=int(semester))
            except Exception:
                pass
        return qs.order_by('semester', 'course_code')

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        # allow if superuser or IQAC/HAA groups or explicit permission
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists() or 'academics.change_elective_teaching' in perms or 'academics.manage_curriculum' in perms:
            serializer.save(created_by=user)
            return
        # allow HOD of the department
        try:
            staff_profile = getattr(user, 'staff_profile', None)
            if staff_profile:
                hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True)
                dept = serializer.validated_data.get('department') or None
                dept_id = getattr(dept, 'id', None) if dept else None
                if dept_id and dept_id in list(hod_depts):
                    serializer.save(created_by=user)
                    return
        except Exception:
            pass
        raise PermissionDenied('You do not have permission to create elective subjects')

    def perform_update(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists() or 'academics.change_elective_teaching' in perms or 'academics.manage_curriculum' in perms:
            return serializer.save()
        # allow HOD of the department
        try:
            staff_profile = getattr(user, 'staff_profile', None)
            if staff_profile:
                hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True)
                inst = getattr(serializer, 'instance', None)
                dept_id = getattr(getattr(inst, 'department', None), 'id', None)
                if dept_id and dept_id in list(hod_depts):
                    return serializer.save()
        except Exception:
            pass
        raise PermissionDenied('You do not have permission to change this elective subject')


class ElectiveChoicesView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        # Accept either elective_subject_id or parent_id (CurriculumDepartment id)
        es_id = request.query_params.get('elective_subject_id') or request.query_params.get('elective')
        parent_id = request.query_params.get('parent_id') or request.query_params.get('parent')
        results = []
        try:
            from .models import ElectiveChoice
            qs = ElectiveChoice.objects.filter(is_active=True).select_related('student__user', 'elective_subject', 'academic_year')
            if es_id:
                try:
                    qs = qs.filter(elective_subject_id=int(es_id))
                except Exception:
                    return Response({'results': []})
            elif parent_id:
                try:
                    qs = qs.filter(elective_subject__parent_id=int(parent_id))
                except Exception:
                    return Response({'results': []})
            else:
                return Response({'results': []})

            for c in qs:
                st = getattr(c, 'student', None)
                if not st:
                    continue
                results.append({
                    'id': st.pk,
                    'reg_no': getattr(st, 'reg_no', None),
                    'username': getattr(getattr(st, 'user', None), 'username', None),
                    'section_id': getattr(st, 'section_id', None),
                    'section_name': str(getattr(st, 'section', '')),
                    'academic_year': getattr(getattr(c, 'academic_year', None), 'name', None),
                })
        except Exception:
            return Response({'results': []})

        return Response({'results': results})


class ElectiveChoiceTemplateDownloadView(APIView):
    """Download a CSV or Excel template for importing elective student mappings."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        
        # Check permission
        if not ('curriculum.import_elective_choices' in perms or user.is_staff or user.is_superuser):
            return Response({'error': 'You do not have permission to download elective import template'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Get all departments for dropdown
        from academics.models import Department
        departments = Department.objects.all().order_by('short_name')
        dept_short_names = [dept.short_name if dept.short_name else dept.code for dept in departments]
        
        # Check if Excel format is requested
        format_type = request.query_params.get('format', 'csv').lower()
        
        if format_type == 'excel' and EXCEL_SUPPORT:
            # Create Excel template
            wb = Workbook()
            ws = wb.active
            ws.title = "Elective Choices"
            
            # Headers
            headers = ['student_reg_no', 'elective_subject_code', 'department', 'academic_year', 'is_active']
            ws.append(headers)
            
            # Sample row
            sample_dept = dept_short_names[0] if dept_short_names else 'CSE'
            ws.append(['REG001', 'ELEC001', sample_dept, '2025-2026', 'TRUE'])
            
            # Add dropdown validation for department column (column C)
            if dept_short_names:
                dept_list = ','.join(dept_short_names)
                dv = DataValidation(type="list", formula1=f'"{dept_list}"', allow_blank=False)
                dv.error = 'Please select a department from the list'
                dv.errorTitle = 'Invalid Department'
                dv.prompt = 'Select a department'
                dv.promptTitle = 'Department Selection'
                # Apply validation to column C (department) from row 2 to 1000
                ws.add_data_validation(dv)
                dv.add(f'C2:C1000')
            
            # Save to bytes
            from io import BytesIO
            excel_file = BytesIO()
            wb.save(excel_file)
            excel_file.seek(0)
            
            response = HttpResponse(
                excel_file.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = 'attachment; filename="elective_choices_template.xlsx"'
            return response
        else:
            # Create CSV template (default)
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="elective_choices_template.csv"'
            
            writer = csv.writer(response)
            writer.writerow([
                'student_reg_no',
                'elective_subject_code',
                'department',
                'academic_year',
                'is_active'
            ])
            
            # Add sample row
            sample_dept = dept_short_names[0] if dept_short_names else 'CSE'
            writer.writerow([
                'REG001',
                'ELEC001',
                sample_dept,
                '2025-2026',
                'TRUE'
            ])
            
            # Add comment row showing available departments
            if dept_short_names:
                writer.writerow([
                    '# Available departments:',
                    '',
                    ', '.join(dept_short_names),
                    '',
                    ''
                ])
            
            return response


class ElectiveChoiceBulkImportView(APIView):
    """Bulk import elective student mappings from CSV or Excel file."""
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        perms = get_user_permissions(user)
        
        # Check permission
        if not ('curriculum.import_elective_choices' in perms or user.is_staff or user.is_superuser):
            return Response({'error': 'You do not have permission to import elective choices'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        uploaded_file = request.FILES.get('csv_file')
        if not uploaded_file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        filename = uploaded_file.name.lower()
        is_excel = filename.endswith(('.xlsx', '.xls'))
        is_csv = filename.endswith('.csv')
        
        if not (is_csv or is_excel):
            return Response({'error': 'File must be CSV or Excel (.xlsx, .xls)'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Parse file based on format
        rows = []
        if is_excel:
            if not EXCEL_SUPPORT:
                return Response({'error': 'Excel support not available. Please install openpyxl or use CSV format.'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            try:
                wb = load_workbook(uploaded_file, read_only=True)
                ws = wb.active
                
                # Get headers from first row
                headers = []
                for cell in ws[1]:
                    headers.append(cell.value)
                
                # Read data rows
                for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                    row_dict = {}
                    for idx, value in enumerate(row):
                        if idx < len(headers) and headers[idx]:
                            row_dict[headers[idx]] = str(value) if value is not None else ''
                    if any(row_dict.values()):  # Skip empty rows
                        rows.append((row_idx, row_dict))
            except Exception as e:
                return Response({'error': f'Failed to parse Excel file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Parse CSV
            try:
                decoded_file = uploaded_file.read().decode('utf-8-sig')
                io_string = io.StringIO(decoded_file)
                reader = csv.DictReader(io_string)
                rows = [(idx, row) for idx, row in enumerate(reader, start=2)]
            except Exception as e:
                return Response({'error': f'Failed to parse CSV file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Process rows
        try:
            from .models import ElectiveChoice, ElectiveSubject
            from academics.models import StudentProfile, AcademicYear, Department
            
            created_count = 0
            updated_count = 0
            errors = []
            
            with transaction.atomic():
                for idx, row in rows:
                    try:
                        student_reg = row.get('student_reg_no', '').strip()
                        elective_code = row.get('elective_subject_code', '').strip()
                        department_short = row.get('department', '').strip()
                        ay_name = row.get('academic_year', '').strip()
                        is_active_str = row.get('is_active', 'TRUE').strip().upper()
                        
                        if not student_reg or not elective_code:
                            errors.append(f'Row {idx}: Missing required fields (student_reg_no or elective_subject_code)')
                            continue
                        
                        # Find student
                        try:
                            student = StudentProfile.objects.get(reg_no=student_reg)
                        except StudentProfile.DoesNotExist:
                            errors.append(f'Row {idx}: Student with reg_no "{student_reg}" not found')
                            continue
                        
                        # Find department if provided
                        department = None
                        if department_short:
                            try:
                                department = Department.objects.filter(short_name=department_short).first()
                                if not department:
                                    # Try finding by code as fallback
                                    department = Department.objects.filter(code=department_short).first()
                                if not department:
                                    errors.append(f'Row {idx}: Department with short_name or code "{department_short}" not found')
                                    continue
                            except Exception as e:
                                errors.append(f'Row {idx}: Error finding department: {str(e)}')
                                continue
                        
                        # Find elective subject
                        try:
                            elective_query = ElectiveSubject.objects.filter(course_code=elective_code)
                            
                            # Filter by department if provided
                            if department:
                                elective_query = elective_query.filter(department=department)
                            
                            elective = elective_query.first()
                            
                            if not elective:
                                dept_info = f' in department "{department_short}"' if department_short else ''
                                errors.append(f'Row {idx}: Elective subject with code "{elective_code}"{dept_info} not found')
                                continue
                        except Exception as e:
                            errors.append(f'Row {idx}: Error finding elective subject: {str(e)}')
                            continue
                        
                        # Find academic year
                        academic_year = None
                        if ay_name:
                            try:
                                academic_year = AcademicYear.objects.filter(name=ay_name).first()
                                if not academic_year:
                                    errors.append(f'Row {idx}: Academic year "{ay_name}" not found')
                                    continue
                            except Exception as e:
                                errors.append(f'Row {idx}: Error finding academic year: {str(e)}')
                                continue
                        else:
                            # Use active academic year
                            academic_year = AcademicYear.objects.filter(is_active=True).first()
                            if not academic_year:
                                errors.append(f'Row {idx}: No active academic year found. Please specify academic_year in CSV.')
                                continue
                        
                        is_active = is_active_str in ('TRUE', '1', 'YES', 'Y')
                        
                        # Create or update choice
                        choice, created = ElectiveChoice.objects.update_or_create(
                            student=student,
                            elective_subject=elective,
                            academic_year=academic_year,
                            defaults={
                                'is_active': is_active,
                                'created_by': user
                            }
                        )
                        
                        if created:
                            created_count += 1
                        else:
                            updated_count += 1
                            
                    except Exception as e:
                        errors.append(f'Row {idx}: {str(e)}')
            
            result = {
                'message': 'Import completed',
                'created': created_count,
                'updated': updated_count,
                'errors': errors[:50]  # Limit error messages
            }
            
            if errors:
                result['warning'] = f'Import completed with {len(errors)} errors'
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': f'Failed to process file: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
