import re

with open("academic_performance_views.py", "r") as f:
    content = f.read()

replacement = """class StudentReportPDFView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id=None):
        \"\"\"Generate a one-page PDF report for a student.
        Uses the shared marks_helper for normalized percentage and remarks.
        \"\"\"
        # Resolve student identifier strictly; return 404 if missing or invalid
        if not student_id:
            return Response({"detail": "student_id parameter is required"}, status=status.HTTP_404_NOT_FOUND)
        student = StudentProfile.objects.filter(
            Q(id=student_id) if str(student_id).isdigit() else Q(reg_no__iexact=str(student_id))
        ).select_related('user', 'home_department', 'section', 'section__batch', 'section__semester').first()
        if not student:
            return Response({"detail": "Student not found"}, status=status.HTTP_404_NOT_FOUND)
        # Authorization check
        scope = get_performance_scope(request.user)
        try:
            assert_student_in_scope(scope, student)
        except PermissionDenied:
            return Response({"detail": "Requested student is outside your authorized scope."}, status=status.HTTP_403_FORBIDDEN)

        # Determine exam type and subject filter
        exam_type = request.query_params.get('exam', 'CIA 1').strip()
        subject_filter = request.query_params.get('subject', '').strip()
        from .marks_helper import get_student_marks_data
        try:
            marks_data = get_student_marks_data(student, exam_type, subject_filter)
        except Exception:
            logger.exception("Failed to gather marks for student report PDF (student=%s)", student_id)
            marks_data = []

        # Calculate Summary Ribbon
        _score_pcts = [m.get("score_pct") for m in marks_data if m.get("score_pct") is not None]
        avg_pct = round(sum(_score_pcts) / len(_score_pcts), 1) if _score_pcts else 0.0
        from .marks_helper import get_remark
        remarks = get_remark(avg_pct)

        # Generate PDF with ReportLab
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import mm
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageTemplate, Frame, KeepTogether
            from reportlab.lib import colors
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
            from django.http import HttpResponse
            import io, os
        except ImportError:
            return Response({"detail": "reportlab not installed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        buffer = io.BytesIO()
        
        # Determine logos
        krct_logo = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'frontend', 'src', 'assets', 'krlogo.png')
        idcs_logo = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'frontend', 'src', 'assets', 'idcs-logo.png')
        
        def on_page(canvas, doc):
            canvas.saveState()
            # Draw border
            canvas.setStrokeColor(colors.HexColor('#CBD5E1'))
            canvas.setLineWidth(1)
            canvas.rect(10*mm, 10*mm, A4[0] - 20*mm, A4[1] - 20*mm)
            
            # Header
            y_pos = A4[1] - 15*mm
            if os.path.exists(krct_logo):
                canvas.drawImage(krct_logo, 15*mm, y_pos - 15*mm, width=50*mm, height=15*mm, preserveAspectRatio=True, anchor='nw')
            if os.path.exists(idcs_logo):
                canvas.drawImage(idcs_logo, A4[0] - 45*mm, y_pos - 15*mm, width=30*mm, height=15*mm, preserveAspectRatio=True, anchor='ne')
            
            # Draw line under header
            canvas.setStrokeColor(colors.HexColor('#E2E8F0'))
            canvas.line(10*mm, y_pos - 18*mm, A4[0] - 10*mm, y_pos - 18*mm)
            canvas.restoreState()

        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            leftMargin=15*mm, rightMargin=15*mm,
            topMargin=40*mm, bottomMargin=15*mm,
        )
        frame = Frame(10*mm, 10*mm, A4[0] - 20*mm, A4[1] - 50*mm, id='normal')
        template = PageTemplate(id='test', frames=frame, onPage=on_page)
        doc.addPageTemplates([template])

        elements = []
        styles = getSampleStyleSheet()
        primary_color = colors.HexColor('#4F46E5')

        # --- Title ---
        title_style = ParagraphStyle('PDFTitle', parent=styles['Title'], fontSize=16, alignment=TA_CENTER, textColor=primary_color, spaceAfter=2, fontName='Helvetica-Bold')
        elements.append(Paragraph('Individual Student Analysis Report', title_style))
        subtitle_style = ParagraphStyle('PDFSubtitle', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, textColor=colors.grey, spaceAfter=14)
        elements.append(Paragraph(f'Assessment: {exam_type or "All Assessments"}', subtitle_style))

        # --- Student Details ---
        dept_lbl = student.home_department.short_name if student.home_department else 'N/A'
{ _ble_edit_exec_gexec__save_lastarg "$@"; } 4>&1 5>&2 &>/dev/null
