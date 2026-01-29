from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from .models import CurriculumMaster, CurriculumDepartment
from .serializers import CurriculumMasterSerializer, CurriculumDepartmentSerializer
from .permissions import IsIQACOrReadOnly
from accounts.utils import get_user_permissions
import logging
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        response.data['status_code'] = response.status_code
        response.data['detail'] = str(exc)

    return response

class CurriculumMasterViewSet(viewsets.ModelViewSet):
    queryset = CurriculumMaster.objects.all().order_by('-created_at')
    serializer_class = CurriculumMasterSerializer
    permission_classes = [IsIQACOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[IsIQACOrReadOnly])
    def propagate(self, request, pk=None):
        obj = self.get_object()
        obj.save()  # triggers post_save propagation
        return Response({'status': 'propagation triggered'})


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

        # compute user's effective department (staff or student)
        dept = None
        staff = getattr(user, 'staff_profile', None)
        if staff:
            try:
                dept = getattr(staff, 'current_department', None) or staff.get_current_department()
            except Exception:
                dept = getattr(staff, 'department', None)

        if dept is None:
            student = getattr(user, 'student_profile', None)
            if student:
                try:
                    section = getattr(student, 'current_section', None) or student.get_current_section()
                    if section and getattr(section, 'semester', None) and getattr(section.semester, 'course', None):
                        dept = section.semester.course.department
                except Exception:
                    dept = None

        # Users with global access (superuser, IQAC/HAA groups, or explicit wide perms) see all
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists():
            logger.debug('get_queryset: user is superuser or IQAC/HAA; user=%s groups=%s', user.username, [g.name for g in user.groups.all()])
            return qs

        perms = get_user_permissions(user)
        logger.debug('get_queryset: user=%s computed dept=%r perms=%s', getattr(user, 'username', None), dept, perms)
        wide_perms = {'curriculum_master_edit', 'curriculum_master_publish', 'CURRICULUM_MASTER_EDIT', 'CURRICULUM_MASTER_PUBLISH'}
        if perms & wide_perms:
            logger.debug('get_queryset: user has wide_perms, returning all; user=%s', user.username)
            return qs

        # If we found a department for the user, restrict to it
        if dept is not None:
            logger.debug('get_queryset: restricting to department=%s for user=%s', dept, user.username)
            return qs.filter(department=dept)

        # otherwise no rows
        logger.debug('get_queryset: no department found, returning none for user=%s', user.username)
        return qs.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        # Log the incoming data for debugging
        logger.debug('perform_update: incoming data=%s', serializer.validated_data)

        user = self.request.user
        privileged = user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists()
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
                serializer.save()

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
        privileged = user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists()
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
