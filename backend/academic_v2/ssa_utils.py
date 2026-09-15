import io
import os
import datetime
from django.conf import settings
from django.core.files.base import ContentFile
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.colors import HexColor, black
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
import openpyxl
try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    try:
        from PyPDF2 import PdfReader, PdfWriter
    except ImportError:
        PdfReader = None
        PdfWriter = None
import logging

logger = logging.getLogger(__name__)

def get_student_topics_from_excel(ssa_assignment, reg_no):
    """
    Extract student's topic(s) from the uploaded Excel template.
    Returns list of topic strings.
    """
    topics = []
    if not ssa_assignment.student_topic_file or not ssa_assignment.student_topic_file.name:
        return topics
        
    try:
        # Open workbook from the stored file
        wb = openpyxl.load_workbook(ssa_assignment.student_topic_file.file, data_only=True)
        sheet = wb.active
        
        # Assume Row 1 is headers: Reg No, Student Name, Topic 1, Topic 2, etc.
        # Find which column contains Reg No. Usually it's col 1.
        reg_no = str(reg_no).strip().lower()
        
        for row in sheet.iter_rows(min_row=2, values_only=True):
            if row[0] and str(row[0]).strip().lower() == reg_no:
                # Topics start from column 3 (index 2)
                for val in row[2:]:
                    if val:
                        topics.append(str(val).strip())
                break
    except Exception as e:
        logger.error(f"Error reading topics from excel for {reg_no}: {e}")
        
    return topics

def generate_cover_page_pdf(student_data: dict) -> bytes:
    """
    Generate a professional cover page PDF with student details matching the college template.
    """
    buffer = io.BytesIO()
    
    # Setup canvas
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    # 1. College Header Image
    header_path = os.path.join(os.path.dirname(__file__), 'static', 'ssa', 'college_logo_header.png')
    if os.path.exists(header_path):
        # Image is 730x214
        img_w = width * 0.85
        img_h = img_w * (214 / 730)
        c.drawImage(header_path, (width - img_w) / 2, height - img_h - 1*cm, width=img_w, height=img_h)
    
    current_y = height - 2*inch - 1*cm
    
    # 2. Department Name
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2.0, current_y, f"DEPARTMENT OF {student_data.get('department', 'ARTIFICIAL INTELLIGENCE AND DATA SCIENCE').upper()}")
    current_y -= 1*cm
    
    # 3. SSA Title
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(width / 2.0, current_y, student_data.get('assignment_type', 'SELF STUDY ASSIGNMENT – I').upper())
    current_y -= 1.2*cm
    
    # 4. Course Code - Course Name Box
    box_w = width * 0.85
    box_h = 1*cm
    box_x = (width - box_w) / 2
    c.rect(box_x, current_y - box_h/2, box_w, box_h)
    
    course_str = f"{student_data.get('course_code', 'N/A')} - {student_data.get('course_name', 'N/A')}"
    if student_data.get('class_type'):
        course_str += f" ({student_data.get('class_type').title()})"
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(width / 2.0, current_y - 0.15*cm, course_str.upper())
    
    current_y -= 2*cm
    
    # 5. Student Details Box
    details_box_w = width * 0.85
    details_box_h = 4.5*cm
    details_box_y = current_y - details_box_h
    c.rect((width - details_box_w) / 2, details_box_y, details_box_w, details_box_h)
    
    labels = ["Name", "Register No.", "Year / Semester", "Date of Submission"]
    values = [
        student_data.get('student_name', ''),
        student_data.get('register_number', ''),
        f"{student_data.get('year', '')} / {student_data.get('semester', '')}",
        student_data.get('submission_date', '')
    ]
    
    text_y = current_y - 1*cm
    for label, val in zip(labels, values):
        c.setFont("Helvetica-Bold", 12)
        c.drawString(box_x + 1*cm, text_y, label)
        c.drawString(box_x + 4.5*cm, text_y, ":")
        c.setFont("Helvetica", 12)
        c.drawString(box_x + 5*cm, text_y, str(val))
        text_y -= 1*cm
        
    current_y = details_box_y - 1.5*cm
    
    # 6. Marks Awarded
    c.setFont("Helvetica-Bold", 12)
    c.drawString(box_x, current_y, "Marks Awarded:")
    current_y -= 0.5*cm
    
    # 7. Marks Table
    marks_data = [
        ["CO", "Why this stack chosen for\nIDCS (5 Marks)", "Benefits, Pros and Cons\n(5 Marks)", "Comparison with Other Stack\n(5 Marks)", "Technical Explanation and\nPractical Relevance (5 Marks)", f"Total\n({student_data.get('max_marks', 20)})"],
        ["", "", "", "", "", ""]
    ]
    t = Table(marks_data, colWidths=[1.5*cm, 3.5*cm, 3.5*cm, 3.5*cm, 4*cm, 2*cm], rowHeights=[2*cm, 1*cm])
    t.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('GRID', (0,0), (-1,-1), 1, black),
        ('BACKGROUND', (0,0), (-1,0), HexColor('#e0ebf0')), # Light blue header
    ]))
    t.wrapOn(c, width, height)
    t.drawOn(c, box_x, current_y - 3*cm)
    
    current_y -= 4.5*cm
    
    # 8. Assignment Topic Table
    topics = student_data.get('topics', [])
    if not topics:
        topics = [""]
        
    topic_data = [["Assignment Topic", "CO", "POs\naddressed"]]
    for topic in topics:
        topic_data.append([topic, "", ""])
        
    t2 = Table(topic_data, colWidths=[box_w - 4*cm, 2*cm, 2*cm])
    t2.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('GRID', (0,0), (-1,-1), 1, black),
    ]))
    
    # Calculate required height for topics table (header row ~1cm + topic rows ~1cm each)
    t2_h = 1*cm + len(topics)*1*cm
    
    t2.wrapOn(c, width, height)
    t2.drawOn(c, box_x, current_y - t2_h)
    
    current_y -= (t2_h + 3*cm)
    
    # 9. Signatures
    c.setFont("Helvetica-Bold", 12)
    c.drawString(box_x, current_y, "Student Signature")
    c.drawRightString(box_x + box_w, current_y, "Staff Signature")
    
    c.showPage()
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes

def merge_cover_with_submission(cover_pdf_bytes: bytes, submission_file) -> bytes:
    """
    Merge the generated cover page with the student's uploaded PDF.
    """
    try:
        cover_reader = PdfReader(io.BytesIO(cover_pdf_bytes))
        
        # Check if submission_file is bytes or file-like
        if hasattr(submission_file, 'read'):
            submission_file.seek(0)
            submission_bytes = submission_file.read()
        else:
            submission_bytes = submission_file
            
        submission_reader = PdfReader(io.BytesIO(submission_bytes))
        
        writer = PdfWriter()
        
        # Add cover page
        for page in cover_reader.pages:
            writer.add_page(page)
            
        # Add submission pages
        for page in submission_reader.pages:
            writer.add_page(page)
            
        output_buffer = io.BytesIO()
        writer.write(output_buffer)
        
        merged_bytes = output_buffer.getvalue()
        output_buffer.close()
        
        return merged_bytes
    except Exception as e:
        logger.error(f"Error merging PDFs: {e}")
        # Return submission bytes or handle gracefully if merge fails
        if hasattr(submission_file, 'read'):
            submission_file.seek(0)
            return submission_file.read()
        return submission_file if isinstance(submission_file, bytes) else b''


def create_student_submission_pdf(student_profile, ssa_assignment, submission_file, topics=None) -> ContentFile:
    """
    Main entry point: create the final submission PDF with cover page.
    """
    try:
        # Extract section information from ssa_assignment relation
        exam_assignment = ssa_assignment.exam_assignment
        section = exam_assignment.section
        teaching_assignment = section.teaching_assignment if hasattr(section, 'teaching_assignment') else None
        
        # Try to extract semester info
        semester = section.semester if hasattr(section, 'semester') else None
        if not semester and teaching_assignment and hasattr(teaching_assignment, 'semester'):
            semester = teaching_assignment.semester
            
        course = section.course if hasattr(section, 'course') else (teaching_assignment.course if teaching_assignment and hasattr(teaching_assignment, 'course') else None)
        
        # Safely get department
        department_name = "N/A"
        if hasattr(student_profile, 'home_department') and student_profile.home_department:
            department_name = student_profile.home_department.name
        else:
            try:
                # Based on requirement: student_profile.section.batch.course.department as fallback
                if hasattr(student_profile, 'section') and student_profile.section:
                    department_name = student_profile.section.batch.course.department.name
                elif course and hasattr(course, 'department') and course.department:
                    department_name = course.department.name
            except Exception:
                pass
                
        # Get faculty name safely
        faculty_name = "N/A"
        if teaching_assignment and hasattr(teaching_assignment, 'faculty_user') and teaching_assignment.faculty_user:
            faculty_user = teaching_assignment.faculty_user
            faculty_name = f"{getattr(faculty_user, 'first_name', '')} {getattr(faculty_user, 'last_name', '')}".strip()
            if not faculty_name:
                faculty_name = str(faculty_user)
        
        # Get year mapping based on semester
        sem_num = getattr(semester, 'semester_number', None) if semester else None
        year_val = (sem_num + 1) // 2 if sem_num else "N/A"
        
        exam_name = "SSA Assignment"
        if hasattr(exam_assignment, 'exam'):
            exam_name = getattr(exam_assignment.exam, 'name', str(exam_assignment.exam))
                
        # Gather data
        student_data = {
            'student_name': str(student_profile.user) if hasattr(student_profile, 'user') else "N/A",
            'register_number': getattr(student_profile, 'reg_no', 'N/A'),
            'department': department_name,
            'year': year_val,
            'semester': sem_num if sem_num else "N/A",
            'section': getattr(section, 'name', str(section)) if section else "N/A",
            'course_code': getattr(course, 'subject_code', "N/A") if hasattr(course, 'subject_code') else getattr(course, 'code', 'N/A'),
            'course_name': getattr(course, 'subject_name', "N/A") if hasattr(course, 'subject_name') else getattr(course, 'name', 'N/A'),
            'class_type': getattr(course, 'class_type_name', '') if hasattr(course, 'class_type_name') else '',
            'faculty_name': faculty_name,
            'academic_year': getattr(semester, 'academic_year', 'N/A') if semester else "N/A",
            'assignment_type': exam_name,
            'submission_date': datetime.datetime.now().strftime("%d-%m-%Y"),
            'max_marks': exam_assignment.max_marks,
            'topics': topics or []
        }
        
        cover_pdf_bytes = generate_cover_page_pdf(student_data)
        merged_pdf_bytes = merge_cover_with_submission(cover_pdf_bytes, submission_file)
        
        file_name = f"SSA_{student_data['register_number']}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
        
        return ContentFile(merged_pdf_bytes, name=file_name)
    except Exception as e:
        logger.error(f"Error creating student submission PDF: {e}")
        # On total failure, just return the uploaded file wrapped as ContentFile
        if hasattr(submission_file, 'read'):
            submission_file.seek(0)
            return ContentFile(submission_file.read(), name=getattr(submission_file, 'name', 'submission.pdf'))
        return None
