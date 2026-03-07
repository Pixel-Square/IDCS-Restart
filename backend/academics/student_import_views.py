import csv
import io
import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.utils import get_user_permissions

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.worksheet.datavalidation import DataValidation
    EXCEL_SUPPORT = True
except ImportError:
    EXCEL_SUPPORT = False

User = get_user_model()

STUDENT_STATUS_CHOICES = ['ACTIVE', 'INACTIVE', 'ALUMNI', 'DEBAR']
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _has_import_permission(user, perms):
    return user.is_superuser or user.is_staff or 'students.view_all_students' in perms


class StudentImportTemplateDownloadView(APIView):
    """Download an Excel (or CSV fallback) template for bulk student import."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        perms = get_user_permissions(request.user)
        if not _has_import_permission(request.user, perms):
            return Response(
                {'error': 'You do not have permission to download the student import template.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not EXCEL_SUPPORT:
            # Fallback: return a CSV template
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['student_reg_no', 'name', 'department', 'section', 'email', 'batch', 'status'])
            writer.writerow(['REG2024001', 'John Doe', 'AI&DS', 'A', 'john.doe@example.com', '2024', 'ACTIVE'])
            response = HttpResponse(output.getvalue(), content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="students_import_template.csv"'
            return response

        try:
            from academics.models import Department

            departments = list(
                Department.objects.order_by('short_name')
                .values_list('short_name', flat=True)
            )
            departments = [d for d in departments if d]

            wb = Workbook()
            ws = wb.active
            ws.title = 'Students Import'

            headers = ['student_reg_no', 'name', 'department', 'section', 'email', 'batch', 'status']
            ws.append(headers)

            sample_dept = departments[0] if departments else 'AI&DS'
            ws.append(['REG2024001', 'John Doe', sample_dept, 'A', 'john.doe@example.com', '2024', 'ACTIVE'])

            # Department dropdown
            if departments:
                dept_list = ','.join(departments)
                dv_dept = DataValidation(
                    type='list', formula1=f'"{dept_list}"', allow_blank=True,
                )
                dv_dept.error = 'Select a department from the dropdown'
                dv_dept.errorTitle = 'Invalid Department'
                dv_dept.prompt = 'Select a department'
                dv_dept.promptTitle = 'Department'
                ws.add_data_validation(dv_dept)
                dv_dept.add('C2:C1000')

            # Status dropdown — column G (status moved after batch)
            status_list = ','.join(STUDENT_STATUS_CHOICES)
            dv_status = DataValidation(
                type='list', formula1=f'"{ status_list}"', allow_blank=False,
            )
            dv_status.error = f'Must be one of: {", ".join(STUDENT_STATUS_CHOICES)}'
            dv_status.errorTitle = 'Invalid Status'
            dv_status.prompt = 'Select a status'
            dv_status.promptTitle = 'Status'
            ws.add_data_validation(dv_status)
            dv_status.add('G2:G1000')

            # Column widths
            ws.column_dimensions['A'].width = 20  # student_reg_no
            ws.column_dimensions['B'].width = 25  # name
            ws.column_dimensions['C'].width = 15  # department
            ws.column_dimensions['D'].width = 12  # section
            ws.column_dimensions['E'].width = 32  # email
            ws.column_dimensions['F'].width = 12  # batch
            ws.column_dimensions['G'].width = 12  # status

            from io import BytesIO
            buf = BytesIO()
            wb.save(buf)
            buf.seek(0)

            response = HttpResponse(
                buf.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = (
                'attachment; filename="students_import_template.xlsx"'
            )
            return response

        except Exception as exc:
            return Response(
                {'error': f'Failed to generate template: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class StudentBulkImportView(APIView):
    """Bulk-import students from a CSV or Excel file.

    Existing students (matched by ``student_reg_no``) are updated; new ones are
    created.  A default *unusable* password is set so the account cannot be used
    until an admin assigns a password.
    """
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        perms = get_user_permissions(request.user)
        if not _has_import_permission(request.user, perms):
            return Response(
                {'error': 'You do not have permission to import students.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        filename = uploaded_file.name.lower()
        is_excel = filename.endswith(('.xlsx', '.xls'))
        is_csv = filename.endswith('.csv')

        if not (is_csv or is_excel):
            return Response(
                {'error': 'File must be CSV (.csv) or Excel (.xlsx).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Parse file ──────────────────────────────────────────────────────────
        rows = []  # list of (row_number, dict)

        if is_excel:
            if not EXCEL_SUPPORT:
                return Response(
                    {'error': 'Excel support unavailable on this server. Please use CSV.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                wb = load_workbook(uploaded_file, read_only=True, data_only=True)
                ws = wb.active
                raw_headers = [cell.value for cell in ws[1]]
                headers = [str(h).strip() if h is not None else '' for h in raw_headers]
                for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                    row_dict = {
                        headers[i]: (str(v).strip() if v is not None else '')
                        for i, v in enumerate(row)
                        if i < len(headers) and headers[i]
                    }
                    if any(row_dict.values()):
                        rows.append((row_idx, row_dict))
            except Exception as exc:
                return Response(
                    {'error': f'Failed to parse Excel file: {exc}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            try:
                decoded = uploaded_file.read().decode('utf-8-sig')
                reader = csv.DictReader(io.StringIO(decoded))
                rows = [
                    (idx, {k: (v or '').strip() for k, v in row.items()})
                    for idx, row in enumerate(reader, start=2)
                ]
            except Exception as exc:
                return Response(
                    {'error': f'Failed to parse CSV file: {exc}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not rows:
            return Response(
                {'error': 'The uploaded file is empty or has no data rows.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Import ──────────────────────────────────────────────────────────────
        from academics.models import Department, Section, StudentProfile, StudentSectionAssignment

        created_count = 0
        updated_count = 0
        errors = []

        # Pre-fetch departments once
        dept_map = {
            d.short_name.upper(): d
            for d in Department.objects.all()
            if d.short_name
        }

        with transaction.atomic():
            for row_idx, row in rows:
                try:
                    reg_no = row.get('student_reg_no', '').strip()
                    name = row.get('name', '').strip()
                    dept_name = row.get('department', '').strip()
                    section_name = row.get('section', '').strip()
                    email = row.get('email', '').strip()
                    batch_year = row.get('batch', '').strip()
                    row_status = row.get('status', 'ACTIVE').strip().upper()

                    # Required field
                    if not reg_no:
                        errors.append(f'Row {row_idx}: student_reg_no is required.')
                        continue

                    # Status validation
                    if row_status not in STUDENT_STATUS_CHOICES:
                        errors.append(
                            f'Row {row_idx}: Invalid status "{row_status}". '
                            f'Must be one of: {", ".join(STUDENT_STATUS_CHOICES)}'
                        )
                        continue

                    # Email format validation
                    if email and not _EMAIL_RE.match(email):
                        errors.append(f'Row {row_idx}: Invalid email format "{email}".')
                        continue

                    # Resolve department
                    department = None
                    if dept_name:
                        department = dept_map.get(dept_name.upper())
                        if not department:
                            errors.append(
                                f'Row {row_idx}: Department "{dept_name}" not found.'
                            )
                            continue

                    # Resolve section
                    section = None
                    if section_name and department:
                        qs = Section.objects.filter(
                            name__iexact=section_name,
                        ).filter(
                            Q(batch__course__department=department)
                            | Q(batch__department=department)
                        )
                        if batch_year:
                            # Prefer exact start_year match when batch_year is numeric
                            if batch_year.isdigit():
                                by_year = qs.filter(batch__start_year=int(batch_year))
                                if by_year.exists():
                                    qs = by_year
                                else:
                                    # fall back to name contains
                                    qs = qs.filter(
                                        Q(batch__name__icontains=batch_year)
                                        | Q(batch__batch_year__name__icontains=batch_year)
                                    )
                            else:
                                qs = qs.filter(
                                    Q(batch__name__icontains=batch_year)
                                    | Q(batch__batch_year__name__icontains=batch_year)
                                )
                        section = qs.order_by('-batch__start_year').first()

                        if not section:
                            errors.append(
                                f'Row {row_idx}: Section "{section_name}" not found '
                                f'for department "{dept_name}"'
                                + (f' and batch "{batch_year}"' if batch_year else '') + '.'
                            )
                            continue

                    # ── Update existing student ──────────────────────────────
                    existing = StudentProfile.objects.filter(reg_no=reg_no).first()
                    if existing:
                        existing.status = row_status
                        if department:
                            existing.home_department = department
                        if section:
                            existing.section = section
                        if batch_year:
                            existing.batch = batch_year
                        existing.save(update_fields=['status', 'home_department', 'section', 'batch'])

                        # Create/update active section assignment so student appears in list
                        if section:
                            active = StudentSectionAssignment.objects.filter(
                                student=existing, end_date__isnull=True
                            ).first()
                            if not active or active.section_id != section.id:
                                # save() auto-closes previous active assignment
                                StudentSectionAssignment.objects.create(
                                    student=existing,
                                    section=section,
                                )

                        if existing.user:
                            user_obj = existing.user
                            changed = False
                            if email and user_obj.email != email:
                                user_obj.email = email
                                changed = True
                            if name:
                                parts = name.split()
                                user_obj.first_name = parts[0]
                                user_obj.last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
                                changed = True
                            if changed:
                                user_obj.save(update_fields=['email', 'first_name', 'last_name'])
                        updated_count += 1

                    # ── Create new student ───────────────────────────────────
                    else:
                        # Generate a unique username from the reg_no
                        base_username = re.sub(r'[^a-zA-Z0-9]', '', reg_no).lower() or 'student'
                        username = base_username
                        counter = 1
                        while User.objects.filter(username=username).exists():
                            username = f'{base_username}{counter}'
                            counter += 1

                        if name:
                            parts = name.split()
                            first_name = parts[0]
                            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
                        else:
                            first_name = ''
                            last_name = ''

                        new_user = User(
                            username=username,
                            email=email,
                            first_name=first_name,
                            last_name=last_name,
                        )
                        new_user.set_unusable_password()
                        new_user.save()

                        new_profile = StudentProfile.objects.create(
                            user=new_user,
                            reg_no=reg_no,
                            status=row_status,
                            home_department=department,
                            section=section,
                            batch=batch_year,
                        )

                        # Create active section assignment so student appears in list
                        if section:
                            StudentSectionAssignment.objects.create(
                                student=new_profile,
                                section=section,
                            )

                        created_count += 1

                except Exception as exc:
                    errors.append(f'Row {row_idx}: Unexpected error — {exc}')

        return Response({
            'message': 'Import completed.',
            'created': created_count,
            'updated': updated_count,
            'errors': errors[:50],
            'total_errors': len(errors),
        })
