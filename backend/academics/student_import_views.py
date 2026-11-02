import csv
import datetime
import io
import logging
import re
import uuid
import zipfile

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.utils import get_user_permissions

logger = logging.getLogger(__name__)

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.comments import Comment
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
    EXCEL_SUPPORT = True
except ImportError:
    EXCEL_SUPPORT = False

User = get_user_model()

STUDENT_STATUS_CHOICES = ['ACTIVE', 'INACTIVE', 'ALUMNI', 'DEBAR']
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_XLSX_PARTS = 500
MAX_XLSX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024

KNOWN_MOT_NAMES = ('Hosteller', 'Day Scholar', 'College Bus', 'Out Bus')

TEMPLATE_HEADERS = [
    'student_reg_no',
    'name',
    'department',
    'section',
    'email',
    'password',
    'batch',
    'status',
    'core_department',
    'M/F',
    'deptrollno',
    'secrollnum',
    'fathername',
    'DOB',
    'DD',
    'MM',
    'YYYY',
    'ADD1',
    'ADD2',
    'ADD3',
    'ADDRES4',
    'pincode',
    'fathermobile',
    'bloodgroup',
    'Dept',
    'degree',
    'MOT',
    'Boardingpoint',
    'batch',
    'MENTOR',
]

# Accept common header variants from CSV/Excel imports.
_HEADER_ALIASES = {
    'studentregno': 'student_reg_no',
    'student_reg_no': 'student_reg_no',
    'regno': 'student_reg_no',
    'register_no': 'student_reg_no',
    'register_number': 'student_reg_no',
    'rollno': 'student_reg_no',
    'roll_no': 'student_reg_no',
    'studentname': 'name',
    'student_name': 'name',
    'name': 'name',
    'dept': 'dept',
    'department': 'department',
    'dept_name': 'department',
    'section': 'section',
    'section_name': 'section',
    'sec': 'section',
    'mail': 'email',
    'email': 'email',
    'emailid': 'email',
    'email_id': 'email',
    'password': 'password',
    'passwords': 'password',
    'pwd': 'password',
    'batch': 'batch',
    'batchyear': 'batch',
    'batch_year': 'batch',
    'status': 'status',
    'student_status': 'status',
    'coredept': 'core_department',
    'coredepartment': 'core_department',
    'core_department': 'core_department',
    'core_dept': 'core_department',
    'mf': 'm_f',
    'm_f': 'm_f',
    'gender': 'm_f',
    'sex': 'm_f',
    'deptrollno': 'deptrollno',
    'dept_roll_no': 'deptrollno',
    'dept_rollno': 'deptrollno',
    'departmentrollno': 'deptrollno',
    'department_roll_no': 'deptrollno',
    'secrollnum': 'secrollnum',
    'sec_roll_num': 'secrollnum',
    'secrollno': 'secrollnum',
    'sec_roll_no': 'secrollnum',
    'sectionrollno': 'secrollnum',
    'section_roll_no': 'secrollnum',
    'section_roll_num': 'secrollnum',
    'fathername': 'fathername',
    'father_name': 'fathername',
    'fathersname': 'fathername',
    'father': 'fathername',
    'dob': 'dob',
    'dateofbirth': 'dob',
    'date_of_birth': 'dob',
    'dd': 'dd',
    'day': 'dd',
    'mm': 'mm',
    'month': 'mm',
    'yyyy': 'yyyy',
    'year': 'yyyy',
    'add1': 'add1',
    'address1': 'add1',
    'address_line1': 'add1',
    'address_line_1': 'add1',
    'add2': 'add2',
    'address2': 'add2',
    'address_line2': 'add2',
    'address_line_2': 'add2',
    'add3': 'add3',
    'address3': 'add3',
    'address_line3': 'add3',
    'address_line_3': 'add3',
    'addres4': 'addres4',
    'address4': 'addres4',
    'add4': 'addres4',
    'address_line4': 'addres4',
    'address_line_4': 'addres4',
    'district': 'addres4',
    'pincode': 'pincode',
    'pin': 'pincode',
    'postal_code': 'pincode',
    'zip': 'pincode',
    'fathermobile': 'fathermobile',
    'father_mobile': 'fathermobile',
    'father_phone': 'fathermobile',
    'fathermobileno': 'fathermobile',
    'bloodgroup': 'bloodgroup',
    'blood_group': 'bloodgroup',
    'blood': 'bloodgroup',
    'degree': 'degree',
    'degree_name': 'degree',
    'program': 'degree',
    'programme': 'degree',
    'mot': 'mot',
    'mode_of_transportation': 'mot',
    'modeoftransportation': 'mot',
    'mode_of_transport': 'mot',
    'transport': 'mot',
    'transport_mode': 'mot',
    'boardingpoint': 'boardingpoint',
    'boarding_point': 'boardingpoint',
    'boarding': 'boardingpoint',
    'bus_stop': 'boardingpoint',
    'mentor': 'mentor',
    'mentorname': 'mentor',
    'mentor_name': 'mentor',
    'mentor_id': 'mentor',
    'mentor_staff_id': 'mentor',
}


def _normalize_header(header: str) -> str:
    cleaned = re.sub(r'[^a-z0-9]+', '_', str(header or '').strip().lower()).strip('_')
    if not cleaned:
        return ''
    no_underscore = cleaned.replace('_', '')
    if no_underscore in _HEADER_ALIASES:
        return _HEADER_ALIASES[no_underscore]
    if cleaned in _HEADER_ALIASES:
        return _HEADER_ALIASES[cleaned]
    return cleaned


BULK_IMPORT_PERMISSION = 'students.bulk_import'


def _has_import_permission(user, perms):
    return user.is_superuser or BULK_IMPORT_PERMISSION in perms


def _parse_dob(raw_dob: str, dd: str, mm: str, yyyy: str):
    """Parse date of birth from DOB string or DD/MM/YYYY components."""
    if raw_dob:
        s = raw_dob.strip()
        # Handle string like '2004-05-15 00:00:00'
        if ' ' in s:
            s = s.split(' ', 1)[0]
        for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d', '%d.%m.%Y', '%m/%d/%Y'):
            try:
                return datetime.datetime.strptime(s, fmt).date()
            except (ValueError, TypeError):
                pass
    if dd and mm and yyyy:
        try:
            d_int = int(float(dd))
            m_int = int(float(mm))
            y_int = int(float(yyyy))
            if y_int < 100:
                y_int += 2000 if y_int < 50 else 1900
            return datetime.date(y_int, m_int, d_int)
        except (ValueError, TypeError):
            pass
    return None


def _validate_xlsx_upload(uploaded_file):
    """Return an error message when the upload is not a sane .xlsx archive."""
    try:
        uploaded_file.seek(0)
        with zipfile.ZipFile(uploaded_file) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_XLSX_PARTS:
                return 'Excel file contains too many internal parts.'
            if sum(info.file_size for info in infos) > MAX_XLSX_UNCOMPRESSED_BYTES:
                return 'Excel file expands to an unreasonable size.'
    except (zipfile.BadZipFile, OSError):
        return 'The uploaded file is not a valid .xlsx workbook.'
    finally:
        try:
            uploaded_file.seek(0)
        except (OSError, ValueError):
            pass
    return None


class StudentImportTemplateDownloadView(APIView):
    """Download an Excel (or CSV fallback) template for bulk student import."""
    permission_classes = (IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = 'student_import'

    def get(self, request):
        perms = get_user_permissions(request.user)
        if not _has_import_permission(request.user, perms):
            return Response(
                {'error': 'You do not have permission to download the student import template.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        sample_row = [
            'REG2024001',
            'John Doe',
            'AI&DS',
            'A',
            'john.doe@example.com',
            '',
            '2024',
            'ACTIVE',
            '',
            'M',
            '24CS001',
            'A01',
            'Robert Doe',
            '2004-05-15',
            '15',
            '05',
            '2004',
            '123 Anna Salai',
            'Opposite Gandhi Park',
            'Anna Nagar',
            'Chennai',
            '600001',
            '9876543210',
            'O+',
            'AI&DS',
            'B.E.',
            'Hosteller',
            '',
            '2024',
            '',
        ]

        if not EXCEL_SUPPORT:
            # Fallback: return a CSV template
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(TEMPLATE_HEADERS)
            writer.writerow(sample_row)
            response = HttpResponse(output.getvalue(), content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="students_import_template.csv"'
            return response

        try:
            from io import BytesIO
            from academics.models import Department, ModeOfTransportation

            departments = list(
                Department.objects.order_by('short_name')
                .values_list('short_name', flat=True)
            )
            departments = [d for d in departments if d]
            if not departments:
                departments = ['AI&DS', 'CSE', 'ECE', 'EEE', 'MECH', 'IT']

            mots = list(
                ModeOfTransportation.objects.filter(is_active=True).values_list('name', flat=True)
            )
            if not mots:
                mots = ['Hosteller', 'Day Scholar', 'College Bus']
            else:
                for default_mot in ['Hosteller', 'Day Scholar', 'College Bus']:
                    if default_mot not in mots:
                        mots.append(default_mot)

            blood_groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
            genders = ['M', 'F']

            wb = Workbook()
            ws = wb.active
            ws.title = 'Students Import'

            # Header styling
            header_fill = PatternFill(start_color='1E3A8A', end_color='1E3A8A', fill_type='solid')
            header_font = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
            header_alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

            ws.append(TEMPLATE_HEADERS)

            for col_idx in range(1, len(TEMPLATE_HEADERS) + 1):
                cell = ws.cell(row=1, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = header_alignment

            ws['F1'].comment = Comment(
                'Required for new students. Must pass the password policy: at least 10 characters, '
                'not a common password, not purely numeric, and not similar to the student name or email.',
                'IDCS',
            )

            sample_dept = departments[0] if departments else 'AI&DS'
            sample_row[2] = sample_dept
            sample_row[24] = sample_dept
            ws.append(sample_row)

            # Build a hidden "_Lists" sheet for dropdown reference data
            lists_ws = wb.create_sheet(title='_Lists')
            lists_ws.sheet_state = 'hidden'

            # Col A: Departments
            for i, dept in enumerate(departments, start=1):
                lists_ws.cell(row=i, column=1, value=dept)
            # Col B: Statuses
            for i, s in enumerate(STUDENT_STATUS_CHOICES, start=1):
                lists_ws.cell(row=i, column=2, value=s)
            # Col C: Genders (M/F)
            for i, g in enumerate(genders, start=1):
                lists_ws.cell(row=i, column=3, value=g)
            # Col D: Blood Groups
            for i, bg in enumerate(blood_groups, start=1):
                lists_ws.cell(row=i, column=4, value=bg)
            # Col E: Modes of Transportation
            for i, m in enumerate(mots, start=1):
                lists_ws.cell(row=i, column=5, value=m)

            dept_ref = f"_Lists!$A$1:$A${len(departments)}"
            dv_dept = DataValidation(type='list', formula1=dept_ref, allow_blank=True)
            ws.add_data_validation(dv_dept)
            dv_dept.add('C2:C2000')  # department (col 3)
            dv_dept.add('I2:I2000')  # core_department (col 9)
            dv_dept.add('Y2:Y2000')  # Dept (col 25)

            status_ref = f"_Lists!$B$1:$B${len(STUDENT_STATUS_CHOICES)}"
            dv_status = DataValidation(type='list', formula1=status_ref, allow_blank=False)
            ws.add_data_validation(dv_status)
            dv_status.add('H2:H2000')  # status (col 8)

            gender_ref = f"_Lists!$C$1:$C${len(genders)}"
            dv_gender = DataValidation(type='list', formula1=gender_ref, allow_blank=True)
            ws.add_data_validation(dv_gender)
            dv_gender.add('J2:J2000')  # M/F (col 10)

            bg_ref = f"_Lists!$D$1:$D${len(blood_groups)}"
            dv_bg = DataValidation(type='list', formula1=bg_ref, allow_blank=True)
            ws.add_data_validation(dv_bg)
            dv_bg.add('X2:X2000')  # bloodgroup (col 24)

            mot_ref = f"_Lists!$E$1:$E${len(mots)}"
            dv_mot = DataValidation(type='list', formula1=mot_ref, allow_blank=True)
            ws.add_data_validation(dv_mot)
            dv_mot.add('AA2:AA2000')  # MOT (col 27)

            col_widths = {
                'A': 20,  # student_reg_no
                'B': 24,  # name
                'C': 16,  # department
                'D': 12,  # section
                'E': 30,  # email
                'F': 18,  # password
                'G': 12,  # batch
                'H': 14,  # status
                'I': 20,  # core_department
                'J': 10,  # M/F
                'K': 16,  # deptrollno
                'L': 16,  # secrollnum
                'M': 22,  # fathername
                'N': 16,  # DOB
                'O': 8,   # DD
                'P': 8,   # MM
                'Q': 10,  # YYYY
                'R': 24,  # ADD1
                'S': 24,  # ADD2
                'T': 22,  # ADD3
                'U': 18,  # ADDRES4
                'V': 12,  # pincode
                'W': 18,  # fathermobile
                'X': 14,  # bloodgroup
                'Y': 16,  # Dept
                'Z': 14,  # degree
                'AA': 16, # MOT
                'AB': 22, # Boardingpoint
                'AC': 12, # batch
                'AD': 22, # MENTOR
            }
            for col_letter, width in col_widths.items():
                ws.column_dimensions[col_letter].width = width

            ws.row_dimensions[1].height = 28
            ws.row_dimensions[2].height = 20

            raw_buf = BytesIO()
            wb.save(raw_buf)
            raw_buf.seek(0)

            # Post-process: strip <workbookProtection/> which WPS rejects
            cleaned_buf = BytesIO()
            with zipfile.ZipFile(raw_buf, 'r') as zin:
                with zipfile.ZipFile(cleaned_buf, 'w', zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.infolist():
                        data = zin.read(item.filename)
                        if item.filename == 'xl/workbook.xml':
                            data = data.replace(b'<workbookProtection/>', b'')
                        zout.writestr(item, data)

            xlsx_bytes = cleaned_buf.getvalue()
            response = HttpResponse(
                xlsx_bytes,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = 'attachment; filename="students_import_template.xlsx"'
            response['Content-Length'] = str(len(xlsx_bytes))
            return response

        except Exception:
            logger.exception('Failed to generate student import template')
            return Response(
                {'error': 'Could not generate the import template. Contact support if this persists.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class StudentBulkImportView(APIView):
    """Bulk-import students from a CSV or Excel file.

    Existing students (matched by ``student_reg_no``) are updated; new ones are
    created. Sets academic details, roll numbers, address details, parent details,
    transport mode, mentor mapping, and auto-provisions Hosteller students in the
    hostel portal for room allocation.
    """
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = 'student_import'

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

        use_dept_roll_as_reg_no = str(
            request.data.get('use_dept_roll_as_reg_no', '')
        ).lower() in ('1', 'true', 'yes', 'on')

        filename = uploaded_file.name.lower()
        is_excel = filename.endswith('.xlsx')
        is_csv = filename.endswith('.csv')

        if filename.endswith('.xls') and not is_excel:
            return Response(
                {'error': 'Legacy .xls files are not supported. Save the workbook as .xlsx or CSV.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (is_csv or is_excel):
            return Response(
                {'error': 'File must be CSV (.csv) or Excel (.xlsx).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if uploaded_file.size > MAX_IMPORT_FILE_BYTES:
            return Response(
                {
                    'error': 'File is too large (maximum '
                    f'{MAX_IMPORT_FILE_BYTES // (1024 * 1024)} MB). Split it into smaller files.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # -- Parse file --
        rows = []  # list of (row_number, dict)

        def _format_cell_value(val):
            if val is None:
                return ''
            if isinstance(val, (datetime.datetime, datetime.date)):
                return val.strftime('%Y-%m-%d')
            return str(val).strip()

        if is_excel:
            if not EXCEL_SUPPORT:
                return Response(
                    {'error': 'Excel support unavailable on this server. Please use CSV.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            problem = _validate_xlsx_upload(uploaded_file)
            if problem:
                return Response({'error': problem}, status=status.HTTP_400_BAD_REQUEST)
            try:
                wb = load_workbook(uploaded_file, read_only=True, data_only=True)
                ws = wb.active
                raw_headers = [cell.value for cell in ws[1]]
                headers = [_normalize_header(str(h)) if h is not None else '' for h in raw_headers]
                for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                    if len(rows) >= MAX_IMPORT_ROWS:
                        return Response(
                            {
                                'error': f'File contains more than {MAX_IMPORT_ROWS} data rows. '
                                'Split it into smaller files.'
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    row_dict = {}
                    for i, v in enumerate(row):
                        if i < len(headers) and headers[i]:
                            h = headers[i]
                            val = _format_cell_value(v)
                            # If column already set, prefer non-empty value
                            if h not in row_dict or (not row_dict[h] and val):
                                row_dict[h] = val
                    if any(row_dict.values()):
                        rows.append((row_idx, row_dict))
            except Exception:
                logger.exception('Failed to parse student import Excel upload')
                return Response(
                    {'error': 'Could not read the Excel file. Check that it is a valid .xlsx workbook.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            try:
                uploaded_file.seek(0)
                text_stream = io.TextIOWrapper(uploaded_file.file, encoding='utf-8-sig', newline='')
                reader = csv.DictReader(text_stream)
                for idx, row in enumerate(reader, start=2):
                    if len(rows) >= MAX_IMPORT_ROWS:
                        return Response(
                            {
                                'error': f'File contains more than {MAX_IMPORT_ROWS} data rows. '
                                'Split it into smaller files.'
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    row_dict = {}
                    for k, v in row.items():
                        nk = _normalize_header(k)
                        if not nk:
                            continue
                        val = (v or '').strip()
                        if nk not in row_dict or (not row_dict[nk] and val):
                            row_dict[nk] = val
                    if any(row_dict.values()):
                        rows.append((idx, row_dict))
            except UnicodeDecodeError:
                return Response(
                    {'error': 'The CSV file must be UTF-8 encoded.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except Exception:
                logger.exception('Failed to parse student import CSV upload')
                return Response(
                    {'error': 'Could not read the CSV file. Check that it is a valid CSV document.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not rows:
            return Response(
                {'error': 'The uploaded file is empty or has no data rows.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # -- Import --
        from academics.models import (
            Department, Section, StudentProfile, StudentSectionAssignment,
            ModeOfTransportation, StaffProfile, StudentMentorMap,
        )

        created_count = 0
        updated_count = 0
        errors = []
        warnings = []
        duplicate_reg_rows = []
        seen_reg_numbers = {}

        # Pre-fetch reference maps
        dept_map = {
            d.short_name.upper(): d
            for d in Department.objects.all()
            if d.short_name
        }
        for d in Department.objects.all():
            if d.name:
                dept_map[d.name.upper()] = d
            if d.code:
                dept_map[d.code.upper()] = d

        with transaction.atomic():
            for row_idx, row in rows:
                try:
                    with transaction.atomic():
                        raw_reg_no = row.get('student_reg_no', '').strip()
                        name = row.get('name', '').strip()
                        dept_name = (row.get('department') or row.get('dept') or '').strip()
                        section_name = row.get('section', '').strip()
                        email = row.get('email', '').strip()
                        password = row.get('password', '').strip()
                        batch_year = (row.get('batch') or '').strip()
                        row_status = (row.get('status') or 'ACTIVE').strip().upper()
                        core_dept_name = row.get('core_department', '').strip()

                        # Gender (M/F)
                        raw_gender = (row.get('m_f') or '').strip().upper()
                        gender = ''
                        if raw_gender in ('M', 'MALE', 'BOY', 'BOYS', '1'):
                            gender = 'MALE'
                        elif raw_gender in ('F', 'FEMALE', 'GIRL', 'GIRLS', '2'):
                            gender = 'FEMALE'
                        elif raw_gender in ('O', 'OTHER'):
                            gender = 'OTHER'

                        dept_roll_no = row.get('deptrollno', '').strip()
                        section_roll_no = row.get('secrollnum', '').strip()
                        father_name = row.get('fathername', '').strip()

                        # Excel can round 16-digit registration numbers, collapsing
                        # many students onto the same reg_no. When requested, use the
                        # (always unique) department roll number as the reg_no.
                        reg_no = dept_roll_no if (use_dept_roll_as_reg_no and dept_roll_no) else raw_reg_no

                        if reg_no:
                            if reg_no in seen_reg_numbers:
                                duplicate_reg_rows.append(
                                    f'Row {row_idx}: reg_no "{reg_no}" already used by row '
                                    f'{seen_reg_numbers[reg_no]}; this row will update that student.'
                                )
                            else:
                                seen_reg_numbers[reg_no] = row_idx

                        # Date of birth
                        raw_dob = row.get('dob', '').strip()
                        dd = row.get('dd', '').strip()
                        mm = row.get('mm', '').strip()
                        yyyy = row.get('yyyy', '').strip()
                        dob_val = _parse_dob(raw_dob, dd, mm, yyyy)

                        add1 = row.get('add1', '').strip()
                        add2 = row.get('add2', '').strip()
                        add3 = row.get('add3', '').strip()
                        addres4 = row.get('addres4', '').strip()
                        pincode = row.get('pincode', '').strip()
                        father_mobile = row.get('fathermobile', '').strip()
                        blood_group = row.get('bloodgroup', '').strip()
                        degree = row.get('degree', '').strip()
                        mot_raw = row.get('mot', '').strip()
                        boarding_point = row.get('boardingpoint', '').strip()
                        mentor_raw = row.get('mentor', '').strip()

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

                        # Resolve core_department
                        core_department = None
                        if core_dept_name:
                            core_department = dept_map.get(core_dept_name.upper())
                            if not core_department:
                                errors.append(
                                    f'Row {row_idx}: core_department "{core_dept_name}" not found.'
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
                                if batch_year.isdigit():
                                    by_year = qs.filter(batch__start_year=int(batch_year))
                                    if by_year.exists():
                                        qs = by_year
                                    else:
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

                        # Resolve Mode of Transportation & Hosteller flag
                        mode_of_transportation = None
                        is_hosteller = False
                        if mot_raw:
                            mot_lower = mot_raw.lower()
                            if (
                                'hostel' in mot_lower
                                or 'hostler' in mot_lower
                                or mot_lower in ('h', 'hosteller', 'hostler', 'boarder')
                            ):
                                is_hosteller = True
                                mot_canonical = 'Hosteller'
                            elif 'out bus' in mot_lower or 'private bus' in mot_lower:
                                mot_canonical = 'Out Bus'
                            elif 'college bus' in mot_lower or mot_lower in ('b', 'bus', 'college'):
                                mot_canonical = 'College Bus'
                            elif 'bus' in mot_lower:
                                mot_canonical = 'College Bus'
                            elif 'day' in mot_lower or mot_lower in ('d', 'ds', 'dayscholar', 'day scholar'):
                                mot_canonical = 'Day Scholar'
                            else:
                                errors.append(
                                    f'Row {row_idx}: unrecognised mode of transportation "{mot_raw}". '
                                    f'Allowed values: {", ".join(KNOWN_MOT_NAMES)}.'
                                )
                                continue

                            mode_of_transportation = ModeOfTransportation.objects.filter(name__iexact=mot_canonical).first()
                            if not mode_of_transportation:
                                mode_of_transportation = ModeOfTransportation.objects.create(name=mot_canonical)

                        # Resolve Mentor (by staff_id, username, email, full name)
                        mentor_staff = None
                        if mentor_raw:
                            mentor_staff = StaffProfile.objects.filter(staff_id__iexact=mentor_raw).first()
                            if not mentor_staff:
                                mentor_staff = StaffProfile.objects.filter(user__username__iexact=mentor_raw).first()
                            if not mentor_staff:
                                mentor_staff = StaffProfile.objects.filter(user__email__iexact=mentor_raw).first()
                            if not mentor_staff:
                                mentor_staff = StaffProfile.objects.filter(
                                    Q(user__first_name__iexact=mentor_raw) |
                                    Q(user__last_name__iexact=mentor_raw)
                                ).first()

                        # -- Update existing student --
                        existing = StudentProfile.objects.filter(reg_no=reg_no).first()
                        if existing:
                            # Validate credentials before any write so a rejected row
                            # cannot leave the profile partially updated.
                            if password:
                                try:
                                    validate_password(password, user=existing.user)
                                except ValidationError as exc:
                                    errors.append(
                                        f'Row {row_idx}: password rejected for reg_no "{reg_no}": '
                                        + ' '.join(exc.messages)
                                    )
                                    continue
                            elif existing.user and not existing.user.has_usable_password():
                                errors.append(
                                    f'Row {row_idx}: password is required for reg_no "{reg_no}" because this user has no usable password.'
                                )
                                continue

                            existing.status = row_status
                            if core_department:
                                existing.home_department = core_department
                            elif department:
                                existing.home_department = department
                            if section:
                                existing.section = section
                            if batch_year:
                                existing.batch = batch_year
                            if gender:
                                existing.gender = gender
                            if dept_roll_no:
                                existing.dept_roll_no = dept_roll_no
                            if section_roll_no:
                                existing.section_roll_no = section_roll_no
                            if father_name:
                                existing.father_name = father_name
                            if dob_val:
                                existing.dob = dob_val
                            if add1:
                                existing.address_line1 = add1
                            if add2:
                                existing.address_line2 = add2
                            if add3:
                                existing.address_line3 = add3
                            if addres4:
                                existing.address_line4 = addres4
                                if not existing.district:
                                    existing.district = addres4
                            if pincode:
                                existing.pincode = pincode
                            if father_mobile:
                                existing.father_mobile = father_mobile
                            if blood_group:
                                existing.blood_group = blood_group
                            if degree:
                                existing.degree = degree
                            if mode_of_transportation:
                                existing.mode_of_transportation = mode_of_transportation
                            if boarding_point:
                                existing.boarding_point = boarding_point
                            if mentor_staff:
                                existing.mentor = mentor_staff

                            existing.save()

                            # Section assignment sync
                            if section:
                                active = StudentSectionAssignment.objects.filter(
                                    student=existing,
                                    end_date__isnull=True,
                                    section_type=StudentSectionAssignment.SECTION_TYPE_PRIMARY,
                                ).first()
                                if not active or active.section_id != section.id:
                                    StudentSectionAssignment.objects.create(
                                        student=existing,
                                        section=section,
                                        section_type=StudentSectionAssignment.SECTION_TYPE_PRIMARY,
                                    )

                            # Mentor assignment sync
                            if mentor_staff:
                                StudentMentorMap.objects.filter(student=existing, is_active=True).update(is_active=False)
                                StudentMentorMap.objects.update_or_create(
                                    student=existing,
                                    is_active=True,
                                    defaults={'mentor': mentor_staff}
                                )

                            # Hostel facility sync
                            if is_hosteller or mot_raw:
                                try:
                                    from hostel.models import (
                                        StudentFacilityProfile,
                                        RESIDENCE_HOSTELLER,
                                        RESIDENCE_DAY_SCHOLAR,
                                        FACILITY_STATUS_APPROVED,
                                    )
                                    facility, _ = StudentFacilityProfile.objects.get_or_create(student=existing)
                                    if is_hosteller:
                                        facility.residence_category = RESIDENCE_HOSTELLER
                                        facility.status = FACILITY_STATUS_APPROVED
                                        facility.profile_verified = True
                                        facility.save()
                                    elif mot_raw:
                                        facility.residence_category = RESIDENCE_DAY_SCHOLAR
                                        college_bus = (
                                            'college bus' in mot_raw.lower()
                                            or mot_raw.strip().lower() in ('b', 'bus', 'college')
                                        )
                                        facility.uses_college_bus = bool(college_bus)
                                        facility.status = FACILITY_STATUS_APPROVED
                                        facility.profile_verified = True
                                        facility.save()
                                except Exception:
                                    pass

                            # User details sync
                            if existing.user:
                                user_obj = existing.user
                                changed_fields = []
                                if email and user_obj.email != email:
                                    warnings.append(
                                        f'Row {row_idx}: email for reg_no "{reg_no}" was not changed. '
                                        'Email changes require the verified profile-change flow.'
                                    )
                                if name:
                                    parts = name.split()
                                    first_name = parts[0]
                                    last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
                                    if user_obj.first_name != first_name:
                                        user_obj.first_name = first_name
                                        changed_fields.append('first_name')
                                    if user_obj.last_name != last_name:
                                        user_obj.last_name = last_name
                                        changed_fields.append('last_name')
                                if password:
                                    user_obj.set_password(password)
                                    changed_fields.append('password')
                                if changed_fields:
                                    user_obj.save(update_fields=sorted(set(changed_fields)))
                                try:
                                    from accounts.models import Role, UserRole
                                    student_role = Role.objects.filter(name='STUDENT').first()
                                    if student_role:
                                        UserRole.objects.get_or_create(user=user_obj, role=student_role)
                                except Exception:
                                    pass

                            updated_count += 1

                        # -- Create new student --
                        else:
                            if not name:
                                errors.append(
                                    f'Row {row_idx}: name is required for new student (reg_no: "{reg_no}").'
                                )
                                continue

                            if not password:
                                errors.append(
                                    f'Row {row_idx}: password is required for new student (reg_no: "{reg_no}").'
                                )
                                continue

                            base_username = name
                            username = base_username
                            counter = 1
                            while counter <= 20 and User.objects.filter(username=username).exists():
                                username = f'{base_username}{counter}'
                                counter += 1

                            parts = name.split()
                            first_name = parts[0]
                            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

                            new_user = User(
                                username=username,
                                email=email,
                                first_name=first_name,
                                last_name=last_name,
                            )
                            try:
                                validate_password(password, user=new_user)
                            except ValidationError as exc:
                                errors.append(
                                    f'Row {row_idx}: password rejected for reg_no "{reg_no}": '
                                    + ' '.join(exc.messages)
                                )
                                continue
                            new_user.set_password(password)
                            try:
                                with transaction.atomic():
                                    new_user.save()
                            except IntegrityError:
                                errors.append(
                                    f'Row {row_idx}: username "{username}" was taken while importing. '
                                    'Run the import again to add this student.'
                                )
                                continue

                            new_profile = StudentProfile.objects.create(
                                user=new_user,
                                reg_no=reg_no,
                                status=row_status,
                                home_department=core_department if core_department else department,
                                section=section,
                                batch=batch_year,
                                gender=gender,
                                dept_roll_no=dept_roll_no,
                                section_roll_no=section_roll_no,
                                father_name=father_name,
                                dob=dob_val,
                                address_line1=add1,
                                address_line2=add2,
                                address_line3=add3,
                                address_line4=addres4,
                                district=addres4 if addres4 else '',
                                pincode=pincode,
                                father_mobile=father_mobile,
                                blood_group=blood_group,
                                degree=degree,
                                mode_of_transportation=mode_of_transportation,
                                boarding_point=boarding_point,
                                mentor=mentor_staff,
                            )

                            if section:
                                StudentSectionAssignment.objects.create(
                                    student=new_profile,
                                    section=section,
                                    section_type=StudentSectionAssignment.SECTION_TYPE_PRIMARY,
                                )

                            if mentor_staff:
                                StudentMentorMap.objects.update_or_create(
                                    student=new_profile,
                                    is_active=True,
                                    defaults={'mentor': mentor_staff}
                                )

                            if is_hosteller or mot_raw:
                                try:
                                    from hostel.models import (
                                        StudentFacilityProfile,
                                        RESIDENCE_HOSTELLER,
                                        RESIDENCE_DAY_SCHOLAR,
                                        FACILITY_STATUS_APPROVED,
                                    )
                                    facility, _ = StudentFacilityProfile.objects.get_or_create(student=new_profile)
                                    if is_hosteller:
                                        facility.residence_category = RESIDENCE_HOSTELLER
                                        facility.status = FACILITY_STATUS_APPROVED
                                        facility.profile_verified = True
                                        facility.save()
                                    elif mot_raw:
                                        facility.residence_category = RESIDENCE_DAY_SCHOLAR
                                        college_bus = (
                                            'college bus' in mot_raw.lower()
                                            or mot_raw.strip().lower() in ('b', 'bus', 'college')
                                        )
                                        facility.uses_college_bus = bool(college_bus)
                                        facility.status = FACILITY_STATUS_APPROVED
                                        facility.profile_verified = True
                                        facility.save()
                                except Exception:
                                    pass

                            try:
                                from accounts.models import Role, UserRole
                                student_role = Role.objects.filter(name='STUDENT').first()
                                if student_role:
                                    UserRole.objects.get_or_create(user=new_user, role=student_role)
                            except Exception:
                                pass

                            created_count += 1

                except Exception:
                    error_ref = uuid.uuid4().hex[:12]
                    logger.exception(f'Row {row_idx}: import error (ref {error_ref})')
                    errors.append(
                        f'Row {row_idx}: unexpected server error (ref {error_ref}). '
                        'Contact support with this reference.'
                    )

        return Response({
            'message': 'Import completed.',
            'created': created_count,
            'updated': updated_count,
            'errors': errors[:50],
            'total_errors': len(errors),
            'warnings': warnings[:50],
            'total_warnings': len(warnings),
            'duplicate_reg_count': len(duplicate_reg_rows),
            'duplicate_reg_rows': duplicate_reg_rows[:20],
            'used_dept_roll_as_reg_no': use_dept_roll_as_reg_no,
        })
