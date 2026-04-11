from rest_framework import viewsets, status, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q
from django.http import HttpResponse
from django.core.paginator import Paginator, EmptyPage
from .models import CurriculumMaster, CurriculumDepartment, ElectiveSubject, DepartmentGroup, DepartmentGroupMapping, QuestionPaperType
from .serializers import CurriculumMasterSerializer, CurriculumDepartmentSerializer, ElectiveSubjectSerializer, ElectiveChoiceSerializer, DepartmentGroupSerializer
from .permissions import IsIQACOrReadOnly, IsIQACOnly
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

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            import traceback
            logging.getLogger(__name__).error('Error creating CurriculumMaster: %s\n%s', e, traceback.format_exc())
            return Response(
                {'detail': 'Failed to create master entry', 'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def update(self, request, *args, **kwargs):
        try:
            return super().update(request, *args, **kwargs)
        except Exception as e:
            import traceback
            logging.getLogger(__name__).error('Error updating CurriculumMaster: %s\n%s', e, traceback.format_exc())
            return Response(
                {'detail': 'Failed to update master entry', 'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_create(self, serializer):
        try:
            serializer.save(created_by=self.request.user)
        except Exception as e:
            logging.getLogger(__name__).exception('Error in perform_create: %s', e)
            raise

    def perform_update(self, serializer):
        try:
            serializer.save()
        except Exception as e:
            logging.getLogger(__name__).exception('Error in perform_update: %s', e)
            raise

    @action(detail=True, methods=['post'], permission_classes=[IsIQACOrReadOnly])
    def propagate(self, request, pk=None):
        try:
            obj = self.get_object()
            obj.save()  # triggers post_save propagation
            return Response({'status': 'propagation triggered'})
        except Exception as e:
            logging.getLogger(__name__).exception('Error in propagate: %s', e)
            return Response(
                {'detail': 'Failed to propagate', 'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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

        # Users with global access (superuser, IQAC/HAA groups, custom roles, or explicit wide perms) see all
        try:
            role_names = {r.name.upper() for r in user.roles.all()}
        except Exception:
            role_names = set()
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists() or bool(role_names & {'IQAC', 'HAA', 'IQAC_HEAD', 'OBE_MASTER'}):
            logger.debug('get_queryset: user is superuser or IQAC/HAA; user=%s groups=%s roles=%s', user.username, [g.name for g in user.groups.all()], role_names)
            return qs

        perms = get_user_permissions(user)
        logger.debug('get_queryset: user=%s computed dept_ids=%r perms=%s', getattr(user, 'username', None), dept_ids, perms)
        wide_perms = {'curriculum_master_edit', 'curriculum_master_publish', 'CURRICULUM_MASTER_EDIT', 'CURRICULUM_MASTER_PUBLISH', 'obe.master.manage'}
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
        try:
            _role_names = {r.name.upper() for r in user.roles.all()}
        except Exception:
            _role_names = set()
        privileged = user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists() or bool(_role_names & {'IQAC', 'HAA', 'IQAC_HEAD', 'OBE_MASTER'})
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
        try:
            _role_names = {r.name.upper() for r in user.roles.all()}
        except Exception:
            _role_names = set()
        privileged = user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists() or bool(_role_names & {'IQAC', 'HAA', 'IQAC_HEAD', 'OBE_MASTER'})
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
    queryset = ElectiveSubject.objects.all().select_related('department', 'parent', 'semester', 'department_group')
    serializer_class = ElectiveSubjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ElectiveSubject.objects.all().select_related('department', 'parent', 'semester', 'department_group')
        qs = qs.annotate(student_count=Count('choices', filter=Q(choices__is_active=True)))
        req = self.request
        dept_id = req.query_params.get('department_id')
        regulation = req.query_params.get('regulation')
        semester = req.query_params.get('semester')
        
        if dept_id:
            try:
                dept_id_int = int(dept_id)
                # Find all department groups that this department is mapped to
                group_ids = DepartmentGroupMapping.objects.filter(
                    department_id=dept_id_int,
                    is_active=True
                ).values_list('group_id', flat=True)
                
                # Filter electives that either:
                # 1. Belong directly to this department, OR
                # 2. Have a department_group that this department is mapped to
                qs = qs.filter(
                    Q(department_id=dept_id_int) | 
                    Q(department_group_id__in=list(group_ids))
                )
            except Exception as e:
                logger.error('Error filtering electives by department_id: %s', e)
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


class CurriculumDepartmentsView(APIView):
    """Return departments filtered by curriculum permissions.
    
    Uses same permission logic as CurriculumDepartmentViewSet:
    - Superusers, IQAC/HAA groups: see all departments
    - Users with curriculum_master_edit/publish: see all departments
    - HODs/regular staff: see only their effective departments
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        from academics.models import Department
        include_non_teaching = str(request.query_params.get('include_non_teaching', 'false')).strip().lower() in {'1', 'true', 'yes'}
        
        # Users with global access see all departments
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists():
            qs = Department.objects.all()
        else:
            perms = get_user_permissions(user)
            wide_perms = {'curriculum_master_edit', 'curriculum_master_publish', 
                         'CURRICULUM_MASTER_EDIT', 'CURRICULUM_MASTER_PUBLISH'}
            if perms & wide_perms:
                # Users with wide curriculum permissions see all
                qs = Department.objects.all()
            else:
                # Regular users see only their effective departments
                dept_ids = get_user_effective_departments(user)
                if not dept_ids:
                    # Try student fallback
                    student = getattr(user, 'student_profile', None)
                    if student:
                        try:
                            section = getattr(student, 'current_section', None) or student.get_current_section()
                            if section and getattr(section, 'batch', None) and getattr(section.batch, 'course', None):
                                dept_ids = [section.batch.course.department_id]
                        except Exception:
                            pass
                
                if not dept_ids:
                    return Response({'results': []})
                
                qs = Department.objects.filter(id__in=dept_ids)

        can_include_non_teaching = bool(
            user.is_superuser
            or user.groups.filter(name__in=['IQAC', 'HAA']).exists()
            or (get_user_permissions(user) & {'curriculum_master_edit', 'curriculum_master_publish', 'CURRICULUM_MASTER_EDIT', 'CURRICULUM_MASTER_PUBLISH'})
        )
        if not (include_non_teaching and can_include_non_teaching):
            qs = qs.filter(is_teaching=True)
        
        results = []
        for d in qs:
            results.append({
                'id': d.id, 
                'code': getattr(d, 'code', None), 
                'name': getattr(d, 'name', None), 
                'short_name': getattr(d, 'short_name', None)
            })
        return Response({'results': results})


class CurriculumPendingCountView(APIView):
    """Return IQAC-only pending counts for department curriculum rows."""

    permission_classes = (IsAuthenticated, IsIQACOnly)

    def get(self, request):
        pending_qs = CurriculumDepartment.objects.filter(
            approval_status=CurriculumDepartment.APPROVAL_PENDING,
            is_elective=False,
        )

        total_pending = pending_qs.count()
        department_counts_qs = (
            pending_qs
            .values('department_id', 'department__code', 'department__short_name', 'department__name')
            .annotate(count=Count('id'))
            .order_by('department__code', 'department__name')
        )

        department_counts = []
        for row in department_counts_qs:
            dept_label = row.get('department__short_name') or row.get('department__code') or row.get('department__name') or 'Unknown'
            department_counts.append({
                'departmentId': row.get('department_id'),
                'department': dept_label,
                'count': row.get('count', 0),
            })

        return Response({
            'totalPending': total_pending,
            'departmentCounts': department_counts,
        })


class ElectiveChoicesView(APIView):
    permission_classes = (IsAuthenticated,)

    def _can_manage(self, user):
        perms = get_user_permissions(user)
        return bool(
            user.is_superuser
            or user.groups.filter(name__in=['IQAC', 'HAA']).exists()
            or 'curriculum.import_elective_choices' in perms
            or 'academics.manage_curriculum' in perms
            or 'academics.change_elective_teaching' in perms
        )

    def get(self, request):
        try:
            from .models import ElectiveChoice
            qs = ElectiveChoice.objects.select_related(
                'student__user',
                'student__section',
                'elective_subject',
                'elective_subject__department',
                'elective_subject__parent',
                'academic_year',
            )

            es_id = request.query_params.get('elective_subject_id') or request.query_params.get('elective')
            parent_id = request.query_params.get('parent_id') or request.query_params.get('parent')
            parent_name = request.query_params.get('parent_name')
            department_id = request.query_params.get('department_id')
            regulation = request.query_params.get('regulation')
            semester = request.query_params.get('semester')
            section_id = request.query_params.get('section_id')
            student_reg_no = request.query_params.get('student_reg_no')
            search = request.query_params.get('search') or request.query_params.get('q')
            academic_year = request.query_params.get('academic_year')
            is_active = request.query_params.get('is_active')
            include_inactive = str(request.query_params.get('include_inactive', '')).strip().lower() in {'1', 'true', 'yes', 'y'}
            page_raw = request.query_params.get('page', '1')
            page_size_raw = request.query_params.get('page_size', '10')

            if es_id:
                try:
                    qs = qs.filter(elective_subject_id=int(es_id))
                except Exception:
                    return Response({'results': []})
            if parent_id:
                try:
                    qs = qs.filter(elective_subject__parent_id=int(parent_id))
                except Exception:
                    return Response({'results': []})
            if parent_name:
                qs = qs.filter(elective_subject__parent__course_name__iexact=str(parent_name).strip())
            if department_id:
                try:
                    dept_id = int(department_id)
                    qs = qs.filter(Q(elective_subject__department_id=dept_id) | Q(elective_subject__parent__department_id=dept_id))
                except Exception:
                    return Response({'results': []})
            if regulation:
                qs = qs.filter(elective_subject__regulation__iexact=regulation)
            if semester:
                try:
                    qs = qs.filter(elective_subject__semester__number=int(semester))
                except Exception:
                    return Response({'results': []})
            if section_id:
                try:
                    qs = qs.filter(student__section_id=int(section_id))
                except Exception:
                    return Response({'results': []})
            if student_reg_no:
                qs = qs.filter(student__reg_no__iexact=str(student_reg_no).strip())
            if academic_year:
                qs = qs.filter(academic_year__name__icontains=academic_year)
            if not include_inactive and (is_active is None or str(is_active).strip() == ''):
                qs = qs.filter(is_active=True)
            elif is_active is not None and str(is_active).strip() != '':
                active_value = str(is_active).strip().lower() in {'1', 'true', 'yes', 'y'}
                qs = qs.filter(is_active=active_value)
            if search:
                qs = qs.filter(
                    Q(student__reg_no__icontains=search)
                    | Q(student__user__username__icontains=search)
                    | Q(student__user__first_name__icontains=search)
                    | Q(student__user__last_name__icontains=search)
                    | Q(elective_subject__course_code__icontains=search)
                    | Q(elective_subject__course_name__icontains=search)
                )

            ordered_qs = qs.order_by('student__section__name', 'student__reg_no', 'elective_subject__course_code')

            try:
                page = max(1, int(page_raw))
            except Exception:
                page = 1
            try:
                page_size = max(1, min(100, int(page_size_raw)))
            except Exception:
                page_size = 10

            paginator = Paginator(ordered_qs, page_size)
            total_count = paginator.count
            total_pages = max(1, paginator.num_pages)
            try:
                page_obj = paginator.page(page)
            except EmptyPage:
                page = total_pages
                page_obj = paginator.page(page)

            results = ElectiveChoiceSerializer(page_obj.object_list, many=True).data
        except Exception:
            return Response({'results': [], 'count': 0, 'page': 1, 'page_size': 10, 'total_pages': 1})

        return Response({
            'results': results,
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        })

    def patch(self, request):
        if not self._can_manage(request.user):
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        choice_id = request.data.get('choice_id') or request.data.get('id')
        if not choice_id:
            return Response({'detail': 'choice_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .models import ElectiveChoice
            choice = ElectiveChoice.objects.select_related('student__user', 'student__section', 'elective_subject', 'academic_year').get(pk=int(choice_id))
        except (ValueError, TypeError, ElectiveChoice.DoesNotExist):
            return Response({'detail': 'Elective choice not found'}, status=status.HTTP_404_NOT_FOUND)

        elective_subject_id = request.data.get('elective_subject_id')
        academic_year_id = request.data.get('academic_year_id')
        is_active_raw = request.data.get('is_active')

        if elective_subject_id not in (None, '', 'null'):
            try:
                choice.elective_subject_id = int(elective_subject_id)
            except (ValueError, TypeError):
                return Response({'detail': 'Invalid elective_subject_id'}, status=status.HTTP_400_BAD_REQUEST)

        if academic_year_id not in (None, '', 'null'):
            try:
                choice.academic_year_id = int(academic_year_id)
            except (ValueError, TypeError):
                return Response({'detail': 'Invalid academic_year_id'}, status=status.HTTP_400_BAD_REQUEST)

        if is_active_raw not in (None, ''):
            choice.is_active = str(is_active_raw).strip().lower() in {'1', 'true', 'yes', 'y'}

        duplicate = ElectiveChoice.objects.filter(
            student_id=choice.student_id,
            elective_subject_id=choice.elective_subject_id,
            academic_year_id=choice.academic_year_id,
        ).exclude(pk=choice.pk).exists()
        if duplicate:
            return Response({'detail': 'An elective choice already exists for this student and academic year.'}, status=status.HTTP_400_BAD_REQUEST)

        choice.created_by = choice.created_by or request.user
        choice.save()
        return Response(ElectiveChoiceSerializer(choice).data)

    def post(self, request):
        if not self._can_manage(request.user):
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        student_reg_no = str(request.data.get('student_reg_no', '')).strip()
        elective_subject_id = request.data.get('elective_subject_id')
        if not student_reg_no:
            return Response({'detail': 'student_reg_no is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not elective_subject_id:
            return Response({'detail': 'elective_subject_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .models import ElectiveChoice, ElectiveSubject
            from academics.models import StudentProfile, AcademicYear

            student = StudentProfile.objects.select_related('user').get(reg_no=student_reg_no)
            elective_subject = ElectiveSubject.objects.select_related('parent', 'semester').get(pk=int(elective_subject_id))
        except StudentProfile.DoesNotExist:
            return Response({'detail': f'Student with reg_no "{student_reg_no}" not found'}, status=status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError, ElectiveSubject.DoesNotExist):
            return Response({'detail': 'Invalid elective_subject_id'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalize parent group names so validation works with variants like
        # "Open Elective II", "OE-II", "oe 2", etc.
        def _parent_bucket(parent_name):
            raw = str(parent_name or '').strip().upper()
            compact = re.sub(r'[^A-Z0-9]', '', raw)

            is_oe = compact.startswith('OE') or 'OPENELECTIVE' in compact
            is_pe = compact.startswith('PE') or 'PROFESSIONALELECTIVE' in compact
            is_ee = compact.startswith('EE') or 'EMERGINGELECTIVE' in compact

            if is_oe and ('II' in compact or '2' in compact):
                return 'OE-II'
            if is_pe and ('II' in compact or '2' in compact):
                return 'PE-II'
            if is_ee and ('III' in compact or '3' in compact):
                return 'EE-III'
            if is_ee and ('II' in compact or '2' in compact):
                return 'EE-II'
            if is_ee and ('I' in compact or '1' in compact):
                return 'EE-I'

            return compact or 'UNKNOWN'

        reg_digits = ''.join(ch for ch in student_reg_no if ch.isdigit())
        target_parent_name = getattr(getattr(elective_subject, 'parent', None), 'course_name', '')
        target_bucket = _parent_bucket(target_parent_name)

        # Batch-wise allowed groups based on reg no prefix.
        allowed_buckets = None
        if reg_digits.startswith('2303'):
            allowed_buckets = {'OE-II', 'PE-II', 'EE-III'}
        elif reg_digits.startswith('2403'):
            allowed_buckets = {'EE-I'}

        if allowed_buckets is not None and target_bucket not in allowed_buckets:
            allowed_text = ', '.join(sorted(allowed_buckets))
            return Response(
                {'detail': f'This student can be mapped only to: {allowed_text}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce one elective choice per parent bucket for active mappings.
        existing_active = ElectiveChoice.objects.select_related('elective_subject__parent').filter(
            student=student,
            is_active=True,
        )

        existing_same_bucket = []
        for ch in existing_active:
            ch_parent_name = getattr(getattr(getattr(ch, 'elective_subject', None), 'parent', None), 'course_name', '')
            if _parent_bucket(ch_parent_name) == target_bucket:
                existing_same_bucket.append(ch)

        if any(ch.elective_subject_id == elective_subject.id for ch in existing_same_bucket):
            return Response(
                {'detail': 'This student is already mapped to this elective subject.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if existing_same_bucket:
            return Response(
                {'detail': f'This student already has one elective in {target_bucket}. Only one is allowed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Pick active academic year by semester parity if possible.
        sem_number = getattr(getattr(elective_subject, 'semester', None), 'number', None)
        academic_year = None
        if sem_number:
            parity = 'ODD' if int(sem_number) % 2 == 1 else 'EVEN'
            academic_year = AcademicYear.objects.filter(is_active=True, parity=parity).first()
        if not academic_year:
            academic_year = AcademicYear.objects.filter(is_active=True).first()

        duplicate = ElectiveChoice.objects.filter(
            student=student,
            elective_subject=elective_subject,
            academic_year=academic_year,
        ).first()
        if duplicate:
            if not duplicate.is_active:
                duplicate.is_active = True
                duplicate.created_by = duplicate.created_by or request.user
                duplicate.save(update_fields=['is_active', 'created_by', 'updated_at'])
            return Response(ElectiveChoiceSerializer(duplicate).data, status=status.HTTP_200_OK)

        choice = ElectiveChoice.objects.create(
            student=student,
            elective_subject=elective_subject,
            academic_year=academic_year,
            is_active=True,
            created_by=request.user,
        )
        return Response(ElectiveChoiceSerializer(choice).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        if not self._can_manage(request.user):
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        choice_id = request.data.get('choice_id') or request.data.get('id') or request.query_params.get('choice_id')
        if not choice_id:
            return Response({'detail': 'choice_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .models import ElectiveChoice
            choice = ElectiveChoice.objects.get(pk=int(choice_id))
        except (ValueError, TypeError, ElectiveChoice.DoesNotExist):
            return Response({'detail': 'Elective choice not found'}, status=status.HTTP_404_NOT_FOUND)

        choice.delete()
        return Response({'message': 'Elective choice deleted successfully'}, status=status.HTTP_200_OK)


class DepartmentGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing department groups. Read-only for now."""
    queryset = DepartmentGroup.objects.filter(is_active=True).order_by('code')
    serializer_class = DepartmentGroupSerializer
    permission_classes = [IsAuthenticated]



class QuestionPaperTypeListView(APIView):
    """Return list of active Question Paper Types.

    GET /api/curriculum/qp-types/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = QuestionPaperType.objects.filter(is_active=True).order_by('sort_order', 'code')
        data = [{'id': q.id, 'code': q.code, 'label': q.label} for q in qs]
        return Response(data)
