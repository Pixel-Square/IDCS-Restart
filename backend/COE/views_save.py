from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from .models import CoeExamDummy
from academics.models import StudentProfile

class CoeSaveExamDummies(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Receives a list of { reg_no, dummy, semester, qp_type } and saves them.
        Updates existing if (student, semester) matches or if dummy matches?
        Requirement: "map the barcode for that respective student in db".
        Since dummy is unique, we should handle potential conflicts.
        """
        password = str((request.data or {}).get('password') or '').strip()
        if not password:
            return Response({"message": "Password is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(password):
            return Response({"message": "Incorrect password"}, status=status.HTTP_400_BAD_REQUEST)

        records = request.data.get('records', [])
        if not records:
             return Response({"message": "No records provided"}, status=status.HTTP_400_BAD_REQUEST)

        # Basic validation
        # We can do bulk create or update.
        # Given "save" button on list, it sends current view.
        # Strategy: iterate and update_or_create.
        
        # Pre-fetch students to minimize DB hits
        reg_nos = [r.get('reg_no') for r in records if r.get('reg_no')]
        students = {s.reg_no: s for s in StudentProfile.objects.filter(reg_no__in=reg_nos)}

        created_count = 0
        updated_count = 0
        errors = []

        with transaction.atomic():
            for rec in records:
                reg_no = rec.get('reg_no')
                dummy = rec.get('dummy')
                semester = rec.get('semester')
                qp_type = str(rec.get('qp_type') or 'QP1').strip().upper()

                if qp_type not in ('QP1', 'QP2', 'TCPR'):
                    qp_type = 'QP1'

                if not (reg_no and dummy and semester):
                    continue
                
                student = students.get(reg_no)
                if not student:
                    errors.append(f"Student {reg_no} not found")
                    continue

                # Check if dummy exists for another student
                existing = CoeExamDummy.objects.filter(dummy_number=dummy).first()
                existing_student_pk = getattr(getattr(existing, 'student', None), 'pk', None) if existing else None
                student_pk = getattr(student, 'pk', None)
                if existing and existing_student_pk != student_pk:
                    # Conflict: This dummy is already assigned to someone else
                    # For now, let's update it to this student, assuming the new list is the source of truth
                    existing.student = student
                    existing.semester = semester
                    existing.qp_type = qp_type
                    existing.save()
                    updated_count += 1
                else:
                    # Update or Create for this student + semester?
                    # Actually dummy is the unique identifier for the exam paper.
                    # We should use update_or_create on dummy_number.
                    obj, created = CoeExamDummy.objects.update_or_create(
                        dummy_number=dummy,
                        defaults={
                            'student': student,
                            'semester': semester,
                            'qp_type': qp_type,
                        }
                    )
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

        return Response({
            "message": "Saved successfully",
            "created": created_count,
            "updated": updated_count,
            "errors": errors
        }, status=status.HTTP_200_OK)


class CoeResetExamDummies(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        password = str((request.data or {}).get('password') or '').strip()
        if not password:
            return Response({"message": "Password is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(password):
            return Response({"message": "Incorrect password"}, status=status.HTTP_400_BAD_REQUEST)

        semester = str((request.data or {}).get('semester') or '').strip().upper()
        dummies = request.data.get('dummies', [])

        if not semester:
            return Response({"message": "Semester is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(dummies, list) or not dummies:
            return Response({"message": "Dummies list is required"}, status=status.HTTP_400_BAD_REQUEST)

        sanitized_dummies = [str(d or '').strip() for d in dummies if str(d or '').strip()]
        if not sanitized_dummies:
            return Response({"message": "No valid dummies provided"}, status=status.HTTP_400_BAD_REQUEST)

        deleted_count, _ = CoeExamDummy.objects.filter(
            semester=semester,
            dummy_number__in=sanitized_dummies,
        ).delete()

        return Response(
            {
                "message": "Reset completed",
                "deleted": int(deleted_count),
            },
            status=status.HTTP_200_OK,
        )
