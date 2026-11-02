import io
import json
import html
from rest_framework.views import APIView
from .permissions import IsCoeUser
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from academics.models import Department, StudentProfile
from django.contrib.auth import get_user_model
try:
    from curriculum.models import ElectiveSubject
except ImportError:
    ElectiveSubject = None

User = get_user_model()

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch, mm
pt = 1
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY


def seat_positions_for_pattern(rows, cols, pattern):
    """Return (row, col) positions in the order this pattern fills seats.
    Must stay in sync with hall_allocation_views.py seat_positions_for_pattern()."""
    positions = []
    seen = set()

    def add_pos(r, c):
        if 0 <= r < rows and 0 <= c < cols and (r, c) not in seen:
            seen.add((r, c))
            positions.append((r, c))

    if pattern == 'Straight':
        for r in range(rows):
            for c in range(cols):
                add_pos(r, c)

    elif pattern in (None, '', 'Zigzag'):
        for c in range(cols):
            row_order = list(range(rows)) if c % 2 == 0 else list(reversed(range(rows)))
            for r in row_order:
                add_pos(r, c)

    elif pattern == 'Alternate Zigzag':
        for pair_start in range(0, cols, 2):
            pair_cols = list(range(pair_start, min(pair_start + 2, cols)))
            if len(pair_cols) == 2:
                c1, c2 = pair_cols[0], pair_cols[1]
                for r in range(rows):
                    if r % 2 == 0:
                        add_pos(r, c1)
                        add_pos(r, c2)
                    else:
                        add_pos(r, c2)
                        add_pos(r, c1)
            else:
                c1 = pair_cols[0]
                for r in range(rows):
                    add_pos(r, c1)

    elif pattern == 'U-Shape':
        top, bottom, left, right = 0, rows - 1, 0, cols - 1
        while top <= bottom and left <= right:
            for r in range(top, bottom + 1):
                add_pos(r, left)
            for c in range(left + 1, right + 1):
                add_pos(bottom, c)
            if left < right:
                for r in range(bottom - 1, top - 1, -1):
                    add_pos(r, right)
            if top < bottom:
                for c in range(right - 1, left, -1):
                    add_pos(top, c)
            top += 1
            bottom -= 1
            left += 1
            right -= 1

    elif pattern == 'Circle':
        center_r = (rows - 1) / 2.0
        center_c = (cols - 1) / 2.0
        cells = []
        for r in range(rows):
            for c in range(cols):
                dist = (r - center_r) ** 2 + (c - center_c) ** 2
                cells.append((dist, r, c))
        cells.sort(key=lambda item: (item[0], item[1], item[2]))
        for _, r, c in cells:
            add_pos(r, c)

    elif pattern == 'Clustered':
        for block_r in range(0, rows, 2):
            for block_c in range(0, cols, 2):
                for r in range(block_r, min(block_r + 2, rows)):
                    for c in range(block_c, min(block_c + 2, cols)):
                        add_pos(r, c)

    elif pattern == 'Mixed':
        for c in range(cols):
            if c % 4 == 0:
                for r in range(rows):
                    add_pos(r, c)
            elif c % 4 == 1:
                for r in range(0, rows, 2):
                    add_pos(r, c)
                for r in range(1, rows, 2):
                    add_pos(r, c)
            elif c % 4 == 2:
                for r in range(rows - 1, -1, -1):
                    add_pos(r, c)
            else:
                for r in range(1, rows, 2):
                    add_pos(r, c)
                for r in range(0, rows, 2):
                    add_pos(r, c)

    # Fallback to guarantee 100% seat coverage
    for r in range(rows):
        for c in range(cols):
            add_pos(r, c)

    return positions


class HallAttendancePdfView(APIView):
    """
    Generates a printable Hall Attendance Sheet PDF.
    - Official Controller of Examinations Header
    - Hall Number, Exam Title, Semester, Date, Session
    - Regular mode: Department-wise student tables (sorted dept-wise)
    - First Year mode: Section-wise student tables (Sec A, Sec B... with dark-navy banners)
    - Each group gets its own table with: S.No, Seat, Register Number, Student Name, Signature
    - Footer with Hall Invigilator & Controller of Examinations signature blocks
    """
    permission_classes = [IsCoeUser]

    def post(self, request, *args, **kwargs):
        try:
            payload = request.data if isinstance(request.data, dict) else json.loads(request.body)
        except Exception:
            return Response({'error': 'Invalid JSON payload'}, status=status.HTTP_400_BAD_REQUEST)

        exam_title = payload.get('exam_title', 'Semester Examinations').strip()
        semester_text = payload.get('semester_text', '').strip()
        date_str = payload.get('date_str', '').strip()
        session = payload.get('session', 'FN').strip().upper()
        halls = payload.get('halls', [])
        student_names_map = payload.get('student_names_map', {})
        student_order = payload.get('student_order', [])

        # ── Detect First Year mode ───────────────────────────────────────────
        # STRICT: Section changes are ONLY for First Year mode. Regular mode MUST always be department-wise.
        plan_mode = str(payload.get('plan_mode') or '').strip().lower()
        is_first_year_flag = payload.get('is_first_year')
        if plan_mode == 'regular' or is_first_year_flag is False or str(is_first_year_flag).lower() in ('false', '0'):
            is_first_year = False
        elif plan_mode == 'first_year' or is_first_year_flag is True or str(is_first_year_flag).lower() in ('true', '1'):
            is_first_year = True
        else:
            is_first_year = False

        student_order_index = {
            str(reg).strip(): idx
            for idx, reg in enumerate(student_order)
            if str(reg).strip()
        }

        def student_selection_sort_key(st):
            reg = str(st.get('reg_no', '') or '').strip()
            if reg in student_order_index:
                return (0, student_order_index[reg], reg)
            last3 = reg[-3:] if len(reg) >= 3 else reg
            try:
                num = int(last3)
                return (1, num, reg)
            except ValueError:
                return (2, 0, reg)

        if not halls:
            return Response({'error': 'No hall data provided for attendance PDF generation.'}, status=status.HTTP_400_BAD_REQUEST)

        # ── 1. Collect all non-empty student register numbers ────────────────
        all_reg_nos = set()
        for hall in halls:
            for s in hall.get('students', []):
                s_clean = str(s).strip()
                if s_clean:
                    all_reg_nos.add(s_clean)

        # ── 2. Pre-fetch student profiles (names + home departments + section) ─
        student_profiles = (
            StudentProfile.objects.filter(reg_no__in=all_reg_nos)
            .select_related('user', 'home_department', 'section__batch__course__department', 'section')
        )
        db_student_info = {}
        db_student_section = {}  # reg_no -> section name (for first year mode)
        for sp in student_profiles:
            full_name = f"{sp.user.first_name} {sp.user.last_name}".strip()
            if not full_name:
                full_name = sp.user.username
            dept_name = ''
            if sp.home_department:
                dept_name = sp.home_department.short_name or sp.home_department.code or sp.home_department.name
            elif sp.section and sp.section.batch and sp.section.batch.course and sp.section.batch.course.department:
                c_dept = sp.section.batch.course.department
                dept_name = c_dept.short_name or c_dept.code or c_dept.name
            db_student_info[sp.reg_no] = {
                'name': full_name,
                'dept': dept_name or '',
            }
            # Cache section name for first year grouping
            if sp.section and sp.section.name:
                db_student_section[sp.reg_no] = sp.section.name

        # ── 3. Pre-cache department codes ────────────────────────────────────
        dept_mapping = {}
        known_dept_names = set()
        for d in Department.objects.all():
            val = d.short_name or d.code or d.name
            dept_mapping[d.code] = val
            if d.short_name:
                known_dept_names.add(d.short_name.strip().upper())
            if d.name:
                known_dept_names.add(d.name.strip().upper())
            if d.code and not d.code.isdigit():
                known_dept_names.add(d.code.strip().upper())

        course_to_dept = {}
        if ElectiveSubject:
            try:
                for es in ElectiveSubject.objects.select_related('department').all():
                    if es.course_code and es.department:
                        d_val = es.department.short_name or es.department.code or es.department.name
                        if d_val:
                            course_to_dept[es.course_code.strip().upper()] = d_val
            except Exception:
                pass

        def _is_dept_name(s):
            """Return True only if s looks like a real department label (no digits, not a course code)."""
            if not s:
                return False
            s_clean = str(s).strip()
            if not s_clean or ' / ' in s_clean:
                return False
            if s_clean.upper().startswith('SEC') or 'SECTION' in s_clean.upper():
                return False
            if any(ch.isdigit() for ch in s_clean):
                return False
            if s_clean.upper() in known_dept_names:
                return True
            return len(s_clean) >= 2

        def get_dept_from_reg_no(reg):
            reg_str = str(reg or '').strip()
            for start, end in [(8, 11), (7, 10), (6, 9)]:
                if len(reg_str) >= end:
                    code_slice = reg_str[start:end]
                    if code_slice in dept_mapping:
                        return dept_mapping[code_slice]
            return ''

        def resolve_student_name(reg):
            """Resolve only the student name — dept is taken from the seating plan."""
            reg = str(reg).strip()
            name = ''
            # 1. DB lookup
            if reg in db_student_info:
                name = db_student_info[reg]['name']
            # 2. Frontend passed names map
            if not name and reg in student_names_map:
                name = str(student_names_map[reg]).strip()
            if not name:
                name = '—'
            return name

        def resolve_dept_label(raw_dept, reg, idx, student_depts, hall_dept):
            """
            Resolve a clean, human-readable department label.
            Priority: DB home_department / reg_no prefix slice → frontend student_depts → raw_dept → hall_dept.
            Matches exact department resolution order of seating arrangement excel export.
            """
            reg_clean = str(reg or '').strip()

            # 1. Authoritative: DB profile home_department or register number slice (106->ECE, 243->AI&DS)
            if reg_clean in db_student_info:
                cand = db_student_info[reg_clean]['dept']
                if _is_dept_name(cand):
                    return cand

            from_reg = get_dept_from_reg_no(reg_clean)
            if _is_dept_name(from_reg):
                return from_reg

            # 2. Frontend student_depts array passed for this seat slot
            if idx < len(student_depts):
                cand = str(student_depts[idx] or '').strip()
                if _is_dept_name(cand):
                    return cand
                if cand.upper() in course_to_dept:
                    return course_to_dept[cand.upper()]

            # 3. raw_dept passed for this student
            if raw_dept and _is_dept_name(raw_dept):
                return raw_dept
            if raw_dept and str(raw_dept).upper() in course_to_dept:
                return course_to_dept[str(raw_dept).upper()]

            # 4. Hall-level department label
            if _is_dept_name(hall_dept):
                return hall_dept
            if str(hall_dept or '').strip().upper() in course_to_dept:
                return course_to_dept[str(hall_dept).strip().upper()]

            return 'General'

        def format_section_label(sec):
            """Normalise a raw section value to 'Sec X' form."""
            if not sec:
                return ''
            s = str(sec).strip()
            if not s or s.upper() in ('NONE', 'NULL', 'ALL', 'UNDEFINED', 'GENERAL'):
                return ''
            if s.upper().startswith('SEC'):
                body = s[3:].strip()
                return f'Sec {body}' if body else s
            return f'Sec {s}'

        def resolve_student_section_label(reg, idx, student_sections_arr):
            """
            Return a clean 'Sec X' label for a student.
            Priority: frontend student_sections array -> DB section.
            """
            if student_sections_arr and idx < len(student_sections_arr):
                cand = str(student_sections_arr[idx] or '').strip()
                if cand and cand.upper() not in ('NONE', 'NULL', 'ALL', 'UNDEFINED'):
                    lbl = format_section_label(cand)
                    if lbl:
                        return lbl
            reg_clean = str(reg or '').strip()
            if reg_clean in db_student_section:
                lbl = format_section_label(db_student_section[reg_clean])
                if lbl:
                    return lbl
            return ''

        # ── 4. Build PDF ─────────────────────────────────────────────────────
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=24 * pt,
            rightMargin=24 * pt,
            topMargin=20 * pt,
            bottomMargin=20 * pt,
        )

        styles = getSampleStyleSheet()

        inst_title_style = ParagraphStyle(
            'InstTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=13,
            leading=16,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#4a0404'),
        )

        sub_title_style = ParagraphStyle(
            'SubTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10.5,
            leading=13,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1e293b'),
        )

        exam_title_style = ParagraphStyle(
            'ExamTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9.5,
            leading=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#334155'),
        )

        meta_label_style = ParagraphStyle(
            'MetaLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor('#1e293b'),
        )

        group_banner_style = ParagraphStyle(
            'GroupBanner',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor('#ffffff'),
            alignment=TA_LEFT,
        )
        # Aliases kept for backward-compat in case any downstream code references it
        dept_banner_style = group_banner_style

        # First Year: dark navy banners; Regular: dark red banners
        banner_bg_color = colors.HexColor('#1e3a5f') if is_first_year else colors.HexColor('#4a0404')
        banner_label_prefix = "Section" if is_first_year else "Department"
        summary_label = "Section-wise count" if is_first_year else "Dept-wise count"

        cell_sno_style = ParagraphStyle(
            'CellSno',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#334155'),
        )

        cell_seat_style = ParagraphStyle(
            'CellSeat',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8,
            leading=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1e3a5f'),
        )

        cell_reg_style = ParagraphStyle(
            'CellReg',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=10.5,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#0f172a'),
        )

        cell_name_style = ParagraphStyle(
            'CellName',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#1e293b'),
        )

        sig_title_style = ParagraphStyle(
            'SigTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1e293b'),
        )

        printable_width = A4[0] - 48 * pt  # ~547.27 pt
        story = []

        for hall_index, hall in enumerate(halls):
            hall_name = hall.get('hall_name', f'Hall {hall_index + 1}')
            students = hall.get('students', [])
            # student_subjects carries the course/subject code per seat slot
            student_subjects = hall.get('student_subjects') or hall.get('studentSubjects') or []
            # student_depts carries the department label per seat slot (regular mode)
            student_depts_raw = hall.get('student_depts') or hall.get('studentDepts') or []
            # student_sections carries the section label per seat slot (first year mode)
            student_sections_raw = hall.get('student_sections') or hall.get('studentSections') or []
            hall_dept = hall.get('department', '')
            rows_count = int(hall.get('rows', 1))
            cols_count = int(hall.get('cols', 1))
            pattern = hall.get('pattern', 'Zigzag')

            # Build seat-position grid matching the Excel export
            seat_positions = seat_positions_for_pattern(rows_count, cols_count, pattern)
            seat_grid = {}
            for flat_idx, (r, c) in enumerate(seat_positions):
                if flat_idx < len(students):
                    s_val = str(students[flat_idx] or '').strip()
                    if s_val:
                        seat_grid[(r, c)] = (flat_idx, s_val)

            # Collect active students in row-major order so seat labels match the Excel grid
            hall_students_ordered = []
            for r in range(rows_count):
                for c in range(cols_count):
                    entry = seat_grid.get((r, c))
                    if entry is None:
                        continue
                    flat_idx, s_clean = entry
                    seat_label = f"{chr(65 + c)}{r + 1}"  # e.g. A1, B3

                    name = resolve_student_name(s_clean)

                    if is_first_year:
                        group_key = resolve_student_section_label(s_clean, flat_idx, student_sections_raw)
                        if not group_key:
                            group_key = 'General'
                    else:
                        group_key = resolve_dept_label(
                            student_depts_raw[flat_idx] if flat_idx < len(student_depts_raw) else '',
                            s_clean,
                            flat_idx,
                            student_depts_raw,
                            hall_dept,
                        )

                    hall_students_ordered.append({
                        'reg_no': s_clean,
                        'name': name,
                        'group': group_key,
                        'dept': group_key,  # kept for backward compat
                        'seat_label': seat_label,
                    })

            total_hall_students = len(hall_students_ordered)
            if total_hall_students == 0:
                continue

            # ── Group students by section (first year) or department (regular) ──
            groups: dict = {}
            for st in hall_students_ordered:
                g = st['group']
                if g not in groups:
                    groups[g] = []
                groups[g].append(st)
            # Kept for backward compat (used in legacy summary below)
            dept_grouped = groups

            sorted_depts = sorted(groups.keys())
            sorted_groups = sorted_depts

            for g in sorted_groups:
                groups[g].sort(key=student_selection_sort_key)

            # Page break between halls
            if hall_index > 0:
                story.append(PageBreak())

            # ── Header ───────────────────────────────────────────────────────
            import os
            from reportlab.platypus import Image as RLImage
            logo_path = '/home/iqac/IDCS-Restart/coe/src/assets/krlogo.png'
            banner_path = '/home/iqac/IDCS-Restart/coe/src/assets/newban.jpeg'

            exam_header_text = f"{exam_title}  {f'— {semester_text}' if semester_text else ''}"
            header_text_elements = [
                Paragraph("OFFICE OF THE CONTROLLER OF EXAMINATIONS", inst_title_style),
                Spacer(1, 2 * pt),
                Paragraph("SEATING ATTENDANCE SHEET", sub_title_style),
                Spacer(1, 2 * pt),
                Paragraph(exam_header_text, exam_title_style)
            ]

            img_logo = RLImage(logo_path, width=60*pt, height=60*pt) if os.path.exists(logo_path) else ""
            img_banner = RLImage(banner_path, width=200*pt, height=55*pt) if os.path.exists(banner_path) else ""

            header_table = Table([[img_banner, header_text_elements, img_logo]], colWidths=[210*pt, 260*pt, 70*pt])
            header_table.setStyle(TableStyle([
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('LEFTPADDING', (0,0), (-1,-1), 0),
                ('RIGHTPADDING', (0,0), (-1,-1), 0),
                ('BOTTOMPADDING', (0,0), (-1,-1), 10*pt),
            ]))
            story.append(header_table)
            story.append(Spacer(1, 5 * pt))

            # ── Metadata Box ─────────────────────────────────────────────────
            session_clean = str(session or 'FN').strip().upper()
            session_full = f"{session_clean} ({'10:00 AM – 12:00 PM' if session_clean == 'FN' else '02:40 PM – 04:40 PM'})"
            meta_data = [
                [
                    Paragraph(f"<b>Hall Number:</b> {hall_name}", meta_label_style),
                    Paragraph(f"<b>Date:</b> {date_str}", meta_label_style),
                    Paragraph(f"<b>Session:</b> {session_full}", meta_label_style),
                ],
                [
                    Paragraph(f"<b>Total Candidates:</b> {total_hall_students}", meta_label_style),
                    Paragraph("<b>Present:</b> ________", meta_label_style),
                    Paragraph("<b>Absent:</b> ________", meta_label_style),
                ],
            ]

            meta_col_widths = [printable_width / 3.0, printable_width / 3.0, printable_width / 3.0]
            meta_table = Table(meta_data, colWidths=meta_col_widths)
            meta_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#94a3b8')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('TOPPADDING', (0, 0), (-1, -1), 3.5 * pt),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5 * pt),
                ('LEFTPADDING', (0, 0), (-1, -1), 6 * pt),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6 * pt),
            ]))
            story.append(meta_table)
            story.append(Spacer(1, 6 * pt))

            # ── Summary count line (section-wise or dept-wise) ───────────────
            summary_parts = [f"{g_key}: {len(groups[g_key])}" for g_key in sorted_groups]
            summary_text = " | ".join(summary_parts)
            group_summary_style = ParagraphStyle(
                'GroupSummary',
                parent=styles['Normal'],
                fontName='Helvetica',
                fontSize=8,
                leading=10,
                textColor=colors.HexColor('#334155'),
            )
            story.append(Paragraph(f"<b>{summary_label}:</b> {summary_text}", group_summary_style))
            story.append(Spacer(1, 4 * pt))

            # ── Group-wise Student Tables (section or dept) ───────────────────
            # S.No is continuous within the hall across all group tables
            # Columns: S.No | Seat | Register Number | Student Name | Signature
            # col widths: 28 | 38 | 135 | 210 | 136 = ~547 pt
            col_widths = [28 * pt, 38 * pt, 135 * pt, 210 * pt, 136 * pt]
            sno_counter = 1  # reset per hall, continuous across groups

            for group_key in sorted_groups:
                group_list = groups[group_key]

                if is_first_year:
                    display_name = group_key  # Already 'Sec A', 'Sec B', etc.
                else:
                    # Sanitize dept_name so a course code never appears as the dept label
                    display_name = group_key
                    if not _is_dept_name(display_name):
                        if display_name.upper() in course_to_dept:
                            display_name = course_to_dept[display_name.upper()]
                        else:
                            first_reg = group_list[0]['reg_no'] if group_list else ''
                            resolved = get_dept_from_reg_no(first_reg)
                            display_name = resolved if _is_dept_name(resolved) else 'General'

                # Group Banner
                banner_data = [[
                    Paragraph(
                        f"<b>{banner_label_prefix}: {html.escape(display_name)}</b>  ({len(group_list)} Candidates)",
                        group_banner_style
                    )
                ]]
                banner_table = Table(banner_data, colWidths=[printable_width])
                banner_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), banner_bg_color),
                    ('TOPPADDING', (0, 0), (-1, -1), 3 * pt),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * pt),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6 * pt),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6 * pt),
                    ('BOX', (0, 0), (-1, -1), 0.5, banner_bg_color),
                ]))
                story.append(banner_table)

                # Column Headers
                table_rows = [
                    [
                        Paragraph("<b>S.No</b>", cell_sno_style),
                        Paragraph("<b>Seat</b>", cell_seat_style),
                        Paragraph("<b>Register Number</b>", cell_reg_style),
                        Paragraph("<b>Student Name</b>", cell_name_style),
                        Paragraph("<b>Signature</b>", cell_sno_style),
                    ]
                ]

                for st in group_list:
                    table_rows.append([
                        Paragraph(str(sno_counter), cell_sno_style),
                        Paragraph(st.get('seat_label', ''), cell_seat_style),
                        Paragraph(st['reg_no'], cell_reg_style),
                        Paragraph(html.escape(st['name']), cell_name_style),
                        Paragraph("", cell_sno_style),  # Empty signature space
                    ])
                    sno_counter += 1

                student_table = Table(table_rows, colWidths=col_widths, repeatRows=1)

                table_style = [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
                    ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#475569')),
                    ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 3 * pt),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * pt),
                    ('LEFTPADDING', (0, 0), (-1, -1), 4 * pt),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 4 * pt),
                ]

                for r_idx in range(1, len(table_rows)):
                    if r_idx % 2 == 0:
                        table_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), colors.HexColor('#f8fafc')))

                student_table.setStyle(TableStyle(table_style))
                story.append(student_table)
                story.append(Spacer(1, 5 * pt))

            # ── Footer Signature Block ────────────────────────────────────────
            footer_data = [
                [
                    Paragraph(
                        "<br/><br/>________________________________________<br/>"
                        "<b>Name &amp; Signature of Hall Invigilator</b><br/>"
                        "<font size=7 color='#64748b'>Date: ________________________</font>",
                        sig_title_style
                    ),
                    Paragraph(
                        "<br/><br/>________________________________________<br/>"
                        "<b>Controller of Examinations</b><br/>"
                        "<font size=7 color='#64748b'>Date: ________________________</font>",
                        sig_title_style
                    ),
                ]
            ]
            footer_table = Table(footer_data, colWidths=[printable_width / 2.0, printable_width / 2.0])
            footer_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 6 * pt),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4 * pt),
            ]))

            story.append(KeepTogether([
                Spacer(1, 6 * pt),
                HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#94a3b8'), spaceBefore=2, spaceAfter=4),
                footer_table,
            ]))

        # Build PDF document
        doc.build(story)
        buffer.seek(0)

        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        filename = f"attendance_sheet_{date_str.replace('/', '-')}_{session}.pdf" if date_str else "hall_attendance_sheet.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
