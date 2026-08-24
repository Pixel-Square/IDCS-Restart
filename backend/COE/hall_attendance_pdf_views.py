import io
import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from academics.models import Department, StudentProfile
from django.contrib.auth import get_user_model

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


class HallAttendancePdfView(APIView):
    """
    Generates a printable Hall Attendance Sheet PDF.
    - Official Controller of Examinations Header
    - Hall Number, Exam Title, Semester, Date, Session
    - Department-wise student breakdown with 3 main columns: Reg No, Name, Signature
    - Footer with Hall Invigilator & Controller of Examinations signature blocks
    - Strict 2-page max limit per hall
    """

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

        if not halls:
            return Response({'error': 'No hall data provided for attendance PDF generation.'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Collect all non-empty student register numbers
        all_reg_nos = set()
        for hall in halls:
            for s in hall.get('students', []):
                s_clean = str(s).strip()
                if s_clean:
                    all_reg_nos.add(s_clean)

        # 2. Pre-fetch student profiles for names and home departments
        student_profiles = (
            StudentProfile.objects.filter(reg_no__in=all_reg_nos)
            .select_related('user', 'home_department')
        )
        db_student_info = {}
        for sp in student_profiles:
            full_name = f"{sp.user.first_name} {sp.user.last_name}".strip()
            if not full_name:
                full_name = sp.user.username
            dept_name = sp.home_department.short_name or sp.home_department.code if sp.home_department else ''
            db_student_info[sp.reg_no] = {
                'name': full_name,
                'dept': dept_name,
            }

        # Pre-cache department codes for register number slicing
        dept_mapping = {d.code: (d.short_name or d.code) for d in Department.objects.all()}

        def resolve_student_details(reg, idx, student_depts, hall_dept):
            reg = str(reg).strip()
            name = ''
            dept = ''

            # Check DB lookup
            if reg in db_student_info:
                name = db_student_info[reg]['name']
                dept = db_student_info[reg]['dept']

            # Check frontend passed names map
            if not name and reg in student_names_map:
                name = str(student_names_map[reg]).strip()

            # Check register number department slice
            if not dept and len(reg) >= 11:
                code_slice = reg[8:11]
                if code_slice in dept_mapping:
                    dept = dept_mapping[code_slice]

            # Check student_depts list
            if not dept and idx < len(student_depts):
                cand = str(student_depts[idx]).strip()
                if cand and " / " not in cand:
                    dept = cand

            # Fallback to hall department
            if not dept:
                dept = hall_dept if (" / " not in hall_dept and hall_dept) else 'General'

            if not name:
                name = '—'

            return name, dept

        # 3. Build PDF with ReportLab
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

        # Custom typography styles
        inst_title_style = ParagraphStyle(
            'InstTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=13,
            leading=16,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#4a0404'),  # Maroon
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

        dept_banner_style = ParagraphStyle(
            'DeptBanner',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor('#ffffff'),
            alignment=TA_LEFT,
        )

        cell_sno_style = ParagraphStyle(
            'CellSno',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#334155'),
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
            student_depts = hall.get('student_depts') or hall.get('studentDepts') or []
            hall_dept = hall.get('department', '')

            # Collect active students in this hall
            hall_students = []
            for i, s in enumerate(students):
                s_clean = str(s).strip()
                if s_clean:
                    s_name, s_dept = resolve_student_details(s_clean, i, student_depts, hall_dept)
                    hall_students.append({
                        'reg_no': s_clean,
                        'name': s_name,
                        'dept': s_dept,
                    })

            total_hall_students = len(hall_students)
            if total_hall_students == 0:
                continue

            # Group students department-wise
            dept_grouped = {}
            for st in hall_students:
                d = st['dept']
                if d not in dept_grouped:
                    dept_grouped[d] = []
                dept_grouped[d].append(st)

            # Sort students inside each department by register number
            for d in dept_grouped:
                dept_grouped[d].sort(key=lambda x: (x['reg_no'][-3:] if len(x['reg_no']) >= 3 else x['reg_no'], x['reg_no']))

            # If not first hall, add page break
            if hall_index > 0:
                story.append(PageBreak())

            # -------------------------------------------------------------
            # 1. Official Header & Title
            # -------------------------------------------------------------
            story.append(Paragraph("OFFICE OF THE CONTROLLER OF EXAMINATIONS", inst_title_style))
            story.append(Spacer(1, 2 * pt))
            story.append(Paragraph("SEATING ATTENDANCE SHEET", sub_title_style))
            story.append(Spacer(1, 2 * pt))
            exam_header_text = f"{exam_title}  {f'— {semester_text}' if semester_text else ''}"
            story.append(Paragraph(exam_header_text, exam_title_style))
            story.append(Spacer(1, 5 * pt))

            # -------------------------------------------------------------
            # 2. Metadata Box Table
            # -------------------------------------------------------------
            session_full = f"{session} ({'09:30 AM – 12:30 PM' if session == 'FN' else '01:30 PM – 04:30 PM'})"
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

            # -------------------------------------------------------------
            # 3. Department-wise Student Tables
            # -------------------------------------------------------------
            sno_counter = 1
            col_widths = [32 * pt, 140 * pt, 225 * pt, 150 * pt]  # Sum = 547pt

            for dept_name in sorted(dept_grouped.keys()):
                dept_list = dept_grouped[dept_name]

                # Department Banner Header
                banner_data = [[
                    Paragraph(f"<b>Department: {dept_name}</b>  ({len(dept_list)} Candidates)", dept_banner_style)
                ]]
                banner_table = Table(banner_data, colWidths=[printable_width])
                banner_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#4a0404')),
                    ('TOPPADDING', (0, 0), (-1, -1), 3 * pt),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * pt),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6 * pt),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6 * pt),
                    ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#4a0404')),
                ]))
                story.append(banner_table)

                # Column Headers
                table_rows = [
                    [
                        Paragraph("<b>S.No</b>", cell_sno_style),
                        Paragraph("<b>Register Number</b>", cell_reg_style),
                        Paragraph("<b>Student Name</b>", cell_name_style),
                        Paragraph("<b>Student Signature</b>", cell_sno_style),
                    ]
                ]

                for st in dept_list:
                    table_rows.append([
                        Paragraph(str(sno_counter), cell_sno_style),
                        Paragraph(st['reg_no'], cell_reg_style),
                        Paragraph(st['name'], cell_name_style),
                        Paragraph("", cell_sno_style),  # Empty signature space
                    ])
                    sno_counter += 1

                student_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
                
                # Compact table styling for max 2-page fit
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

            # -------------------------------------------------------------
            # 4. Invigilator & COE Signature Footer (Always at bottom of Hall)
            # -------------------------------------------------------------
            footer_data = [
                [
                    Paragraph("<br/><br/>________________________________________<br/><b>Name & Signature of Hall Invigilator</b><br/><font size=7 color='#64748b'>Date: ________________________</font>", sig_title_style),
                    Paragraph("<br/><br/>________________________________________<br/><b>Controller of Examinations</b><br/><font size=7 color='#64748b'>Date: ________________________</font>", sig_title_style),
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
