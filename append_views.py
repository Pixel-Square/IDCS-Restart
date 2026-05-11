with open("backend/curriculum/views.py", "a", encoding="utf-8") as f:
    f.write("""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q
from .models import ElectivePoll, ElectivePollSubject, ElectiveChoice, DepartmentGroupMapping
from .serializers import ElectivePollSerializer

class ElectivePollView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        polls = ElectivePoll.objects.all().order_by('-created_at')
        return Response(ElectivePollSerializer(polls, many=True).data)

    def post(self, request):
        serializer = ElectivePollSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ElectivePollDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return ElectivePoll.objects.get(pk=pk)
        except ElectivePoll.DoesNotExist:
            return None

    def get(self, request, pk):
        poll = self.get_object(pk)
        if not poll:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ElectivePollSerializer(poll).data)

    def patch(self, request, pk):
        poll = self.get_object(pk)
        if not poll:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ElectivePollSerializer(poll, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        poll = self.get_object(pk)
        if not poll:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        poll.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class ActiveStudentPollsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            student_profile = getattr(request.user, 'student_profile', None)
            if not student_profile:
                return Response({'detail': 'User is not a student'}, status=status.HTTP_403_FORBIDDEN)

            section = student_profile.get_current_section()
            if not section:
                return Response([], status=status.HTTP_200_OK)

            batch = section.batch
            semester = section.semester
            
            home_dept = student_profile.home_department
            if not home_dept and getattr(section, 'batch', None) and getattr(section.batch, 'course', None):
                home_dept = section.batch.course.department

            # Find applicable department groups
            dept_groups = []
            if home_dept:
                dept_groups = list(DepartmentGroupMapping.objects.filter(
                    department=home_dept, is_active=True
                ).values_list('group_id', flat=True))

            # Start with active polls
            query = Q(is_active=True)
            
            # Match batch year if set
            if batch and getattr(batch, 'batch_year_id', None):
                query &= (Q(batch_year_id__isnull=True) | Q(batch_year_id=batch.batch_year_id))
            
            # Match semester if set
            if semester and getattr(semester, 'number', None):
                query &= (Q(semester__isnull=True) | Q(semester=semester.number))
                
            # Match department group if set
            if dept_groups:
                query &= (Q(department_group_id__isnull=True) | Q(department_group_id__in=dept_groups))
            else:
                # If student has no department group mapping, only show polls without group restrictions
                query &= Q(department_group_id__isnull=True)

            polls = ElectivePoll.objects.filter(query).distinct()
            return Response(ElectivePollSerializer(polls, many=True).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class SubmitElectiveChoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            student_profile = getattr(request.user, 'student_profile', None)
            if not student_profile:
                return Response({'detail': 'User is not a student'}, status=status.HTTP_403_FORBIDDEN)

            poll = ElectivePoll.objects.get(id=pk, is_active=True)
            poll_subject_id = request.data.get('poll_subject_id')
            if not poll_subject_id:
                return Response({'detail': 'poll_subject_id is required'}, status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                poll_subject = ElectivePollSubject.objects.select_for_update().get(id=poll_subject_id, poll=poll)
                
                # Check if the student has already chosen an elective for this poll
                existing_choice = ElectiveChoice.objects.filter(
                    student=student_profile,
                    elective_subject__poll_associations__poll=poll
                ).first()
                if existing_choice:
                    return Response({'detail': 'You have already submitted a choice for this poll'}, status=status.HTTP_400_BAD_REQUEST)
                
                # Check seats
                if poll_subject.seats is not None:
                    if poll_subject.seats <= 0:
                        return Response({'detail': 'Seats full for this subject'}, status=status.HTTP_400_BAD_REQUEST)
                    poll_subject.seats -= 1
                    poll_subject.save()
                
                # Get the active academic year to associate with the choice
                from academics.models import AcademicYear
                current_year = AcademicYear.objects.filter(is_active=True).first()

                ElectiveChoice.objects.create(
                    student=student_profile,
                    elective_subject=poll_subject.elective_subject,
                    academic_year=current_year,
                    created_by=request.user
                )
            
            return Response({'detail': 'Choice submitted successfully'}, status=status.HTTP_201_CREATED)
        except ElectivePoll.DoesNotExist:
            return Response({'detail': 'Active poll not found'}, status=status.HTTP_404_NOT_FOUND)
        except ElectivePollSubject.DoesNotExist:
            return Response({'detail': 'Subject not found in this poll'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
""")
