from rest_framework import viewsets, status, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from .models import CurriculumMaster, CurriculumDepartment, ElectiveSubject
from .serializers import CurriculumMasterSerializer, CurriculumDepartmentSerializer, ElectiveSubjectSerializer
from .permissions import IsIQACOrReadOnly
from accounts.utils import get_user_permissions
from academics.utils import get_user_effective_departments
import logging
from rest_framework.views import exception_handler, APIView

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        response.data['status_code'] = response.status_code
        response.data['detail'] = str(exc)

    return response

class CurriculumMasterViewSet(viewsets.ModelViewSet):
    # Order master curriculum entries by semester (ascending) so subjects
    # are arranged sem-wise starting from 1. Tie-break by course_code.
    queryset = CurriculumMaster.objects.all().order_by('semester', 'course_code')
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

        # compute user's effective department ids (includes HOD mappings)
        dept_ids = get_user_effective_departments(user)
        if not dept_ids:
            # fallback: try student section
            student = getattr(user, 'student_profile', None)
            if student:
                try:
                    section = getattr(student, 'current_section', None) or student.get_current_section()
                    if section and getattr(section, 'batch', None) and getattr(section.batch, 'course', None):
                        dept_ids = [section.batch.course.department_id]
                except Exception:
                    dept_ids = []

        # Users with global access (superuser, IQAC/HAA groups, or explicit wide perms) see all
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists():
            logger.debug('get_queryset: user is superuser or IQAC/HAA; user=%s groups=%s', user.username, [g.name for g in user.groups.all()])
            return qs

        perms = get_user_permissions(user)
        logger.debug('get_queryset: user=%s computed dept_ids=%r perms=%s', getattr(user, 'username', None), dept_ids, perms)
        wide_perms = {'curriculum_master_edit', 'curriculum_master_publish', 'CURRICULUM_MASTER_EDIT', 'CURRICULUM_MASTER_PUBLISH'}
        if perms & wide_perms:
            logger.debug('get_queryset: user has wide_perms, returning all; user=%s', user.username)
            return qs

        # If we found a department for the user, restrict to it
        if dept_ids:
            logger.debug('get_queryset: restricting to departments=%s for user=%s', dept_ids, user.username)
            return qs.filter(department_id__in=dept_ids)

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
                # capture returned instance so we can include it in the response
                instance = serializer.save()

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


class ElectiveSubjectViewSet(viewsets.ModelViewSet):
    queryset = ElectiveSubject.objects.all().select_related('department', 'parent', 'semester')
    serializer_class = ElectiveSubjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ElectiveSubject.objects.all().select_related('department', 'parent', 'semester')
        req = self.request
        dept_id = req.query_params.get('department_id')
        regulation = req.query_params.get('regulation')
        semester = req.query_params.get('semester')
        if dept_id:
            try:
                qs = qs.filter(department_id=int(dept_id))
            except Exception:
                pass
        if regulation:
            qs = qs.filter(regulation=regulation)
        if semester:
            try:
                qs = qs.filter(semester__number=int(semester))
            except Exception:
                pass
        return qs.order_by('semester', 'course_code')

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        # allow if superuser or IQAC/HAA groups or explicit permission
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists() or 'academics.change_elective_teaching' in perms or 'academics.manage_curriculum' in perms:
            serializer.save(created_by=user)
            return
        # allow HOD of the department
        try:
            staff_profile = getattr(user, 'staff_profile', None)
            if staff_profile:
                hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True)
                dept = serializer.validated_data.get('department') or None
                dept_id = getattr(dept, 'id', None) if dept else None
                if dept_id and dept_id in list(hod_depts):
                    serializer.save(created_by=user)
                    return
        except Exception:
            pass
        raise PermissionDenied('You do not have permission to create elective subjects')

    def perform_update(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        if user.is_superuser or user.groups.filter(name__in=['IQAC', 'HAA']).exists() or 'academics.change_elective_teaching' in perms or 'academics.manage_curriculum' in perms:
            return serializer.save()
        # allow HOD of the department
        try:
            staff_profile = getattr(user, 'staff_profile', None)
            if staff_profile:
                hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True)
                inst = getattr(serializer, 'instance', None)
                dept_id = getattr(getattr(inst, 'department', None), 'id', None)
                if dept_id and dept_id in list(hod_depts):
                    return serializer.save()
        except Exception:
            pass
        raise PermissionDenied('You do not have permission to change this elective subject')


class ElectiveChoicesView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        # Accept either elective_subject_id or parent_id (CurriculumDepartment id)
        es_id = request.query_params.get('elective_subject_id') or request.query_params.get('elective')
        parent_id = request.query_params.get('parent_id') or request.query_params.get('parent')
        results = []
        try:
            from .models import ElectiveChoice
            qs = ElectiveChoice.objects.filter(is_active=True).select_related('student__user', 'elective_subject', 'academic_year')
            if es_id:
                try:
                    qs = qs.filter(elective_subject_id=int(es_id))
                except Exception:
                    return Response({'results': []})
            elif parent_id:
                try:
                    qs = qs.filter(elective_subject__parent_id=int(parent_id))
                except Exception:
                    return Response({'results': []})
            else:
                return Response({'results': []})

            for c in qs:
                st = getattr(c, 'student', None)
                if not st:
                    continue
                results.append({
                    'id': st.pk,
                    'reg_no': getattr(st, 'reg_no', None),
                    'username': getattr(getattr(st, 'user', None), 'username', None),
                    'section_id': getattr(st, 'section_id', None),
                    'section_name': str(getattr(st, 'section', '')),
                    'academic_year': getattr(getattr(c, 'academic_year', None), 'name', None),
                })
        except Exception:
            return Response({'results': []})

        return Response({'results': results})
