from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .models import StudentProfile
from django.apps import apps

class StudentBarcodeLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        """
        Lookup student by reg_no (barcode) or rfid_uid or CoeExamDummy number.
        """
        # 1. Try finding by reg_no first (case-insensitive)
        student = StudentProfile.objects.filter(reg_no__iexact=code).select_related('user', 'section', 'home_department', 'section__batch').first()
        matched_dummy = None
        matched_qp_type = 'QP1'
        
        # 2. Try rfid_uid if applicable
        if not student:
             student = StudentProfile.objects.filter(rfid_uid__iexact=code).select_related('user', 'section', 'home_department', 'section__batch').first()

        # 3. Try CoeExamDummy number
        if not student:
            try:
                CoeExamDummy = apps.get_model('COE', 'CoeExamDummy')
                # Use case-insensitive exact match for robustness
                dummy_record = CoeExamDummy.objects.filter(dummy_number__iexact=code).select_related('student__user', 'student__section', 'student__home_department', 'student__section__batch').first()
                if dummy_record:
                    student = dummy_record.student
                    matched_dummy = dummy_record.dummy_number
                    matched_qp_type = str(dummy_record.qp_type or 'QP1').strip().upper()
            except LookupError:
                # COE app not installed or model not found
                pass

        if student and matched_dummy is None:
            try:
                CoeExamDummy = apps.get_model('COE', 'CoeExamDummy')
                latest_dummy = CoeExamDummy.objects.filter(student=student).order_by('-created_at').first()
                if latest_dummy:
                    matched_dummy = latest_dummy.dummy_number
                    matched_qp_type = str(latest_dummy.qp_type or 'QP1').strip().upper()
            except LookupError:
                pass

        if not student:
            return Response({"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        # Basic student info
        department_name = student.home_department.name if student.home_department else ""
        if not department_name and student.section:
             # Fallback to section's department if home not set
             try:
                 department_name = student.section.batch.course.department.name
             except:
                 pass

        current_sem = "N/A"
        try:
             # Try to infer semester from batch/section if logic exists, otherwise just return batch
             pass 
        except:
             pass

        data = {
            "id": student.id,
            "reg_no": student.reg_no,
            "name": f"{student.user.first_name} {student.user.last_name}".strip(),
            "department": department_name,
            "batch": student.batch,
            "section": student.section.name if student.section else "N/A",
            "status": student.status,
            "mobile": student.mobile_number,
            "email": student.user.email,
            "profile_image": student.profile_image.url if student.profile_image else None,
            "dummy_number": matched_dummy,
            "qp_type": matched_qp_type if matched_qp_type in ('QP1', 'QP2', 'TCPR', 'TCPL', 'OE') else 'QP1',
        }
        return Response(data)
