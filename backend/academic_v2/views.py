"""
Academic 2.1 API Views
"""

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.db.models import Q

from .models import (
    AcV2SemesterConfig,
    AcV2ClassType,
    AcV2QpPattern,
    AcV2Course,
    AcV2Section,
    AcV2ExamAssignment,
    AcV2StudentMark,
    AcV2UserPatternOverride,
    AcV2EditRequest,
    AcV2InternalMark,
)
from .serializers import (
    AcV2SemesterConfigSerializer,
    AcV2ClassTypeSerializer,
    AcV2QpPatternSerializer,
    AcV2CourseSerializer,
    AcV2SectionSerializer,
    AcV2ExamAssignmentSerializer,
    AcV2StudentMarkSerializer,
    AcV2StudentMarkBulkSerializer,
    AcV2EditRequestSerializer,
    AcV2InternalMarkSerializer,
    AcV2UserPatternOverrideSerializer,
)
from .services.publish_control import check_publish_control, create_edit_request
from .services.mark_calculation import compute_section_internal_marks


# ============================================================================
# SEMESTER CONFIG (Admin)
# ============================================================================

class AcV2SemesterConfigViewSet(viewsets.ModelViewSet):
    """
    Semester configuration CRUD.
    Admin only.
    """
    queryset = AcV2SemesterConfig.objects.all()
    serializer_class = AcV2SemesterConfigSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        semester_id = self.request.query_params.get('semester')
        if semester_id:
            qs = qs.filter(semester_id=semester_id)
        return qs.select_related('semester')
    
    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


# ============================================================================
# CLASS TYPE (Admin)
# ============================================================================

class AcV2ClassTypeViewSet(viewsets.ModelViewSet):
    """
    Class type CRUD.
    Admin only.
    """
    queryset = AcV2ClassType.objects.filter(is_active=True)
    serializer_class = AcV2ClassTypeSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        college_id = self.request.query_params.get('college')
        if college_id:
            qs = qs.filter(college_id=college_id)
        return qs.order_by('name')
    
    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save()


# ============================================================================
# QP PATTERN (Admin - Table Creator)
# ============================================================================

class AcV2QpPatternViewSet(viewsets.ModelViewSet):
    """
    QP Pattern CRUD.
    Admin only.
    """
    queryset = AcV2QpPattern.objects.filter(is_active=True)
    serializer_class = AcV2QpPatternSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        qp_type = self.request.query_params.get('qp_type')
        class_type_id = self.request.query_params.get('class_type')
        batch_id = self.request.query_params.get('batch')
        
        if qp_type:
            qs = qs.filter(qp_type=qp_type)
        if class_type_id:
            qs = qs.filter(class_type_id=class_type_id)
        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        
        return qs.select_related('class_type', 'batch')
    
    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


# ============================================================================
# COURSE / SECTION
# ============================================================================

class AcV2CourseViewSet(viewsets.ModelViewSet):
    queryset = AcV2Course.objects.all()
    serializer_class = AcV2CourseSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        semester_id = self.request.query_params.get('semester')
        if semester_id:
            qs = qs.filter(semester_id=semester_id)
        return qs.select_related('class_type', 'semester', 'subject')


class AcV2SectionViewSet(viewsets.ModelViewSet):
    queryset = AcV2Section.objects.all()
    serializer_class = AcV2SectionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        course_id = self.request.query_params.get('course')
        faculty_id = self.request.query_params.get('faculty')
        
        if course_id:
            qs = qs.filter(course_id=course_id)
        if faculty_id:
            qs = qs.filter(faculty_user_id=faculty_id)
        
        return qs.select_related('course', 'faculty_user', 'teaching_assignment')


# ============================================================================
# EXAM ASSIGNMENT
# ============================================================================

class AcV2ExamAssignmentViewSet(viewsets.ModelViewSet):
    queryset = AcV2ExamAssignment.objects.all()
    serializer_class = AcV2ExamAssignmentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        section_id = self.request.query_params.get('section')
        course_id = self.request.query_params.get('course')
        status_filter = self.request.query_params.get('status')
        
        if section_id:
            qs = qs.filter(section_id=section_id)
        if course_id:
            qs = qs.filter(section__course_id=course_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        
        return qs.select_related('section__course__class_type')
    
    @action(detail=True, methods=['post'])
    def save_marks(self, request, pk=None):
        """Save draft marks."""
        exam = self.get_object()
        
        if not exam.is_editable():
            return Response(
                {'error': 'This exam is locked and cannot be edited.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        marks_data = request.data.get('marks', {})
        question_btls = request.data.get('question_btls', None)

        # Preserve existing draft_data structure; update marks and optional btls
        draft = exam.draft_data if isinstance(exam.draft_data, dict) else {}
        draft['marks'] = marks_data
        if question_btls is not None:
            draft['question_btls'] = question_btls
        
        with transaction.atomic():
            exam.draft_data = draft
            exam.last_saved_at = timezone.now()
            exam.last_saved_by = request.user
            exam.save(update_fields=['draft_data', 'last_saved_at', 'last_saved_by'])
        
        return Response({
            'success': True,
            'last_saved_at': exam.last_saved_at.isoformat(),
        })
    
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """Publish marks."""
        exam = self.get_object()
        
        if not exam.is_editable():
            return Response(
                {'error': 'This exam is locked and cannot be edited.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        semester_config = exam.get_semester_config()
        
        with transaction.atomic():
            exam.published_data = exam.draft_data
            exam.published_at = timezone.now()
            exam.published_by = request.user
            
            # Set status based on publish control
            if semester_config and semester_config.publish_control_enabled:
                exam.status = 'PUBLISHED'
            else:
                exam.status = 'DRAFT'  # Keep as draft if no publish control
            
            exam.save()
            
            # Recompute internal marks
            compute_section_internal_marks(exam.section)
        
        return Response({
            'success': True,
            'status': exam.status,
            'published_at': exam.published_at.isoformat(),
        })
    
    @action(detail=True, methods=['post'])
    def request_edit(self, request, pk=None):
        """Request edit access for published exam."""
        exam = self.get_object()
        reason = request.data.get('reason', '')
        
        if not reason:
            return Response(
                {'error': 'Reason is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = create_edit_request(exam, request.user, reason)
        
        if result['success']:
            return Response(result)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def reset_marks(self, request, pk=None):
        """Reset all marks for this exam."""
        exam = self.get_object()
        
        if not exam.is_editable():
            return Response(
                {'error': 'This exam is locked and cannot be edited.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        with transaction.atomic():
            exam.draft_data = {}
            exam.last_saved_at = timezone.now()
            exam.last_saved_by = request.user
            exam.save(update_fields=['draft_data', 'last_saved_at', 'last_saved_by'])
            
            # Delete student marks
            AcV2StudentMark.objects.filter(exam_assignment=exam).delete()
        
        return Response({'success': True})


# ============================================================================
# STUDENT MARKS
# ============================================================================

class AcV2StudentMarkViewSet(viewsets.ModelViewSet):
    queryset = AcV2StudentMark.objects.all()
    serializer_class = AcV2StudentMarkSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        exam_id = self.request.query_params.get('exam_assignment')
        if exam_id:
            qs = qs.filter(exam_assignment_id=exam_id)
        return qs.select_related('exam_assignment', 'student')
    
    @action(detail=False, methods=['post'])
    def bulk_save(self, request):
        """Bulk save student marks."""
        exam_id = request.data.get('exam_assignment')
        marks_list = request.data.get('marks', [])
        
        if not exam_id:
            return Response(
                {'error': 'exam_assignment is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        exam = get_object_or_404(AcV2ExamAssignment, id=exam_id)
        
        if not exam.is_editable():
            return Response(
                {'error': 'This exam is locked.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        qp_pattern = exam.get_qp_pattern()
        
        with transaction.atomic():
            for mark_data in marks_list:
                student_id = mark_data.get('student_id')
                if not student_id:
                    continue
                
                defaults = {
                    'reg_no': mark_data.get('reg_no', ''),
                    'student_name': mark_data.get('student_name', ''),
                    'question_marks': mark_data.get('question_marks', {}),
                    'is_absent': mark_data.get('is_absent', False),
                    'is_exempted': mark_data.get('is_exempted', False),
                    'remarks': mark_data.get('remarks', ''),
                }
                
                sm, created = AcV2StudentMark.objects.update_or_create(
                    exam_assignment=exam,
                    student_id=student_id,
                    defaults=defaults
                )
                
                # Calculate CO marks and total
                sm.calculate_co_marks(qp_pattern)
                sm.calculate_total()
                sm.save()
            
            # Update draft data on exam
            exam.last_saved_at = timezone.now()
            exam.last_saved_by = request.user
            exam.save(update_fields=['last_saved_at', 'last_saved_by'])
        
        return Response({'success': True, 'count': len(marks_list)})


# ============================================================================
# EDIT REQUESTS
# ============================================================================

class AcV2EditRequestViewSet(viewsets.ModelViewSet):
    queryset = AcV2EditRequest.objects.all()
    serializer_class = AcV2EditRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        requested_by = self.request.query_params.get('requested_by')
        
        if status_filter:
            qs = qs.filter(status=status_filter)

        user = getattr(self.request, 'user', None)

        if requested_by:
            # Non-admin users can only query their own requests
            if not self._has_any_role(user, ['ADMIN']) and not getattr(user, 'is_superuser', False):
                if str(requested_by) != str(getattr(user, 'id', '')):
                    return qs.none()
            qs = qs.filter(requested_by_id=requested_by)

        qs = qs.select_related(
            'exam_assignment__section__course',
            'exam_assignment__section__teaching_assignment__section__batch__department',
            'exam_assignment__section__teaching_assignment__section__managing_department',
            'requested_by',
        )

        # Inbox forwarding: only show items for the *current* approver stage.
        # This is computed from (semester_config.approval_workflow + current_stage).
        if self.action == 'list' and not requested_by:
            if not user:
                return qs.none()

            # Only pending-ish items belong in approval inboxes.
            qs = qs.filter(status__in=['PENDING', 'HOD_PENDING', 'IQAC_PENDING'])

            allowed_ids: list[int] = []
            for er in qs:
                required_role = self._current_required_role(er)
                if not required_role:
                    continue
                # Enforce exact role membership (do NOT treat superuser as all roles)
                if self._has_role_exact(user, required_role):
                    allowed_ids.append(er.id)

            if not allowed_ids:
                return qs.none()
            return qs.filter(id__in=allowed_ids)

        return qs

    def _has_role_exact(self, user, role_name: str) -> bool:
        """Check role membership without superuser override (used for inbox gating)."""
        if not user:
            return False
        role_u = str(role_name or '').strip()
        if not role_u:
            return False
        try:
            if hasattr(user, 'roles'):
                return user.roles.filter(name__iexact=role_u).exists()
        except Exception:
            pass
        try:
            if hasattr(user, 'user_roles'):
                return user.user_roles.filter(role__name__iexact=role_u).exists()
        except Exception:
            pass
        return False

    def _current_required_role(self, edit_request) -> str | None:
        wf_roles = self._workflow_roles(edit_request)
        if not wf_roles:
            return None
        stage_index = max(0, int(getattr(edit_request, 'current_stage', 1) or 1) - 1)
        if stage_index < len(wf_roles):
            return wf_roles[stage_index]
        return wf_roles[-1]

    def _has_any_role(self, user, role_names: list[str]) -> bool:
        if not user:
            return False
        if getattr(user, 'is_superuser', False):
            return True
        wanted = [str(r).strip() for r in (role_names or []) if str(r).strip()]
        if not wanted:
            return False
        try:
            if hasattr(user, 'roles'):
                q = Q()
                for r in wanted:
                    q |= Q(name__iexact=str(r))
                return user.roles.filter(q).exists()
        except Exception:
            pass
        try:
            if hasattr(user, 'user_roles'):
                q = Q()
                for r in wanted:
                    q |= Q(role__name__iexact=str(r))
                return user.user_roles.filter(q).exists()
        except Exception:
            pass
        return False

    def _workflow_roles(self, edit_request) -> list[str]:
        cfg = None
        try:
            cfg = edit_request.exam_assignment.get_semester_config()
        except Exception:
            cfg = None
        wf = getattr(cfg, 'approval_workflow', None) if cfg else None
        roles: list[str] = []
        raw = wf or []
        for item in raw:
            if isinstance(item, str):
                role = item
            elif isinstance(item, dict):
                role = item.get('role')
            else:
                role = None
            role_u = str(role or '').strip().upper()
            if role_u and role_u not in roles:
                roles.append(role_u)
        return roles
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve edit request."""
        edit_request = self.get_object()
        notes = request.data.get('notes', '')

        wf_roles = self._workflow_roles(edit_request)
        if wf_roles:
            required_role = self._current_required_role(edit_request)
            if not required_role:
                return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
            if not (getattr(request.user, 'is_superuser', False) or self._has_role_exact(request.user, required_role)):
                return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        else:
            # Fallback legacy behavior when no workflow is configured
            if not self._has_any_role(request.user, ['HOD', 'IQAC', 'ADMIN']):
                return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)

        if edit_request.status not in ['PENDING', 'HOD_PENDING', 'IQAC_PENDING']:
            return Response(
                {'error': 'This request cannot be approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        history = edit_request.approval_history or []

        # If workflow is configured, enforce stage order strictly (no skipping).
        if wf_roles:
            stage_index = max(0, int(getattr(edit_request, 'current_stage', 1) or 1) - 1)
            required_role = wf_roles[stage_index] if stage_index < len(wf_roles) else wf_roles[-1]

            # Determine acting role for this request/stage
            acting_role = None
            if getattr(request.user, 'is_superuser', False) or self._has_role_exact(request.user, required_role):
                acting_role = required_role

            if acting_role != required_role:
                return Response({'detail': f'Awaiting {required_role} approval.'}, status=status.HTTP_400_BAD_REQUEST)

            history.append({
                'stage': int(getattr(edit_request, 'current_stage', 1) or 1),
                'role': required_role,
                'user_id': getattr(request.user, 'id', None),
                'user_name': str(request.user),
                'action': 'APPROVED',
                'at': now.isoformat(),
                'notes': notes,
            })

            # If there is a next stage, move to it
            if stage_index + 1 < len(wf_roles):
                next_role = wf_roles[stage_index + 1]
                edit_request.current_stage = stage_index + 2
                if next_role == 'HOD':
                    edit_request.status = 'HOD_PENDING'
                elif next_role == 'IQAC':
                    edit_request.status = 'IQAC_PENDING'
                else:
                    edit_request.status = 'PENDING'
                edit_request.approval_history = history
                edit_request.save(update_fields=['current_stage', 'status', 'approval_history'])
                return Response({'success': True, 'status': edit_request.status, 'current_stage': edit_request.current_stage})

        # Final approve (no workflow or last stage)
        cfg = None
        try:
            cfg = edit_request.exam_assignment.get_semester_config()
        except Exception:
            cfg = None

        approval_until_publish = bool(getattr(cfg, 'approval_until_publish', False)) if cfg else False
        try:
            window_minutes = int(request.data.get('window_minutes') or (getattr(cfg, 'approval_window_minutes', 120) if cfg else 120))
        except Exception:
            window_minutes = int(getattr(cfg, 'approval_window_minutes', 120) if cfg else 120)

        # Persist approval history before final approve
        edit_request.approval_history = history
        edit_request.save(update_fields=['approval_history'])

        if approval_until_publish:
            # Grant unlimited edit until next publish
            with transaction.atomic():
                edit_request.status = 'APPROVED'
                edit_request.reviewed_by = request.user
                edit_request.reviewed_at = now
                edit_request.approved_until = None
                edit_request.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'approved_until'])

                ea = edit_request.exam_assignment
                ea.edit_window_until = None
                ea.edit_window_until_publish = True
                ea.has_pending_edit_request = False
                ea.save(update_fields=['edit_window_until', 'edit_window_until_publish', 'has_pending_edit_request'])

            return Response({'success': True, 'status': edit_request.status, 'approved_until': None, 'edit_mode': 'UNTIL_PUBLISH'})

        edit_request.approve(request.user, window_minutes, notes)
        return Response({'success': True, 'status': edit_request.status, 'approved_until': edit_request.approved_until.isoformat() if edit_request.approved_until else None})
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject edit request."""
        edit_request = self.get_object()
        reason = request.data.get('reason', '')

        wf_roles = self._workflow_roles(edit_request)
        if wf_roles:
            required_role = self._current_required_role(edit_request)
            if not required_role:
                return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
            if not (getattr(request.user, 'is_superuser', False) or self._has_role_exact(request.user, required_role)):
                return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        else:
            if not self._has_any_role(request.user, ['HOD', 'IQAC', 'ADMIN']):
                return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        
        if edit_request.status not in ['PENDING', 'HOD_PENDING', 'IQAC_PENDING']:
            return Response(
                {'error': 'This request cannot be rejected.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # If workflow is configured, enforce stage order strictly (no skipping).
        if wf_roles:
            stage_index = max(0, int(getattr(edit_request, 'current_stage', 1) or 1) - 1)
            required_role = wf_roles[stage_index] if stage_index < len(wf_roles) else wf_roles[-1]

            # Determine acting role for this request/stage
            acting_role = None
            if getattr(request.user, 'is_superuser', False) or self._has_role_exact(request.user, required_role):
                acting_role = required_role
            if acting_role != required_role:
                return Response({'detail': f'Awaiting {required_role} action.'}, status=status.HTTP_400_BAD_REQUEST)

        # Add role into history as well
        now = timezone.now()
        stage_index = max(0, int(getattr(edit_request, 'current_stage', 1) or 1) - 1)
        required_role = wf_roles[stage_index] if (wf_roles and stage_index < len(wf_roles)) else None
        history = edit_request.approval_history or []
        history.append({
            'stage': int(getattr(edit_request, 'current_stage', 1) or 1),
            'role': required_role,
            'user_id': getattr(request.user, 'id', None),
            'user_name': str(request.user),
            'action': 'REJECTED',
            'at': now.isoformat(),
            'reason': reason,
        })
        edit_request.approval_history = history
        edit_request.save(update_fields=['approval_history'])

        edit_request.reject(request.user, reason)
        return Response({'success': True, 'status': edit_request.status})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel an edit request (requester only)."""
        edit_request = self.get_object()

        # Only requester (or superuser) can cancel
        if not getattr(request.user, 'is_superuser', False):
            if getattr(edit_request, 'requested_by_id', None) != getattr(request.user, 'id', None):
                return Response({'detail': 'Only the requester can cancel this request.'}, status=status.HTTP_403_FORBIDDEN)

        if edit_request.status not in ['PENDING', 'HOD_PENDING', 'IQAC_PENDING']:
            return Response({'error': 'This request cannot be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        history = edit_request.approval_history or []
        history.append({
            'stage': int(getattr(edit_request, 'current_stage', 1) or 1),
            'role': None,
            'user_id': getattr(request.user, 'id', None),
            'user_name': str(request.user),
            'action': 'CANCELLED',
            'at': now.isoformat(),
        })

        with transaction.atomic():
            edit_request.status = 'CANCELLED'
            edit_request.approval_history = history
            edit_request.save(update_fields=['status', 'approval_history'])

            ea = edit_request.exam_assignment
            ea.has_pending_edit_request = False
            ea.save(update_fields=['has_pending_edit_request'])

        return Response({'success': True, 'status': edit_request.status})


# ============================================================================
# INTERNAL MARKS (Read-Only)
# ============================================================================

class AcV2InternalMarkViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AcV2InternalMark.objects.all()
    serializer_class = AcV2InternalMarkSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        section_id = self.request.query_params.get('section')
        course_id = self.request.query_params.get('course')
        
        if section_id:
            qs = qs.filter(section_id=section_id)
        if course_id:
            qs = qs.filter(section__course_id=course_id)
        
        return qs.select_related('section__course').order_by('reg_no')
    
    @action(detail=False, methods=['post'])
    def recompute(self, request):
        """Recompute internal marks for a section."""
        section_id = request.data.get('section')
        if not section_id:
            return Response(
                {'error': 'section is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        section = get_object_or_404(AcV2Section, id=section_id)
        results = compute_section_internal_marks(section)
        
        return Response({
            'success': True,
            'count': len(results),
        })


# ============================================================================
# USER PATTERN OVERRIDE
# ============================================================================

class AcV2UserPatternOverrideViewSet(viewsets.ModelViewSet):
    queryset = AcV2UserPatternOverride.objects.all()
    serializer_class = AcV2UserPatternOverrideSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        course_id = self.request.query_params.get('course')
        exam_type = self.request.query_params.get('exam_type')
        
        # Only show user's own overrides
        qs = qs.filter(created_by=self.request.user)
        
        if course_id:
            qs = qs.filter(course_id=course_id)
        if exam_type:
            qs = qs.filter(exam_type=exam_type)
        
        return qs
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


# ============================================================================
# HELPER ENDPOINTS
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def course_internal_summary(request, course_id):
    """
    Get internal mark summary for a course.
    Shows class type, exam assignments, CO coverage, weight matrix.
    """
    course = get_object_or_404(AcV2Course, id=course_id)
    
    # Get class type info
    class_type = course.class_type
    class_type_data = None
    if class_type:
        class_type_data = AcV2ClassTypeSerializer(class_type).data
    
    # Get all sections for this course
    sections = course.sections.all()
    
    # Get exam assignments
    exam_assignments = []
    for section in sections:
        for ea in section.exam_assignments.all():
            exam_assignments.append({
                'id': str(ea.id),
                'exam': ea.exam,
                'exam_display_name': ea.exam_display_name,
                'qp_type': ea.qp_type,
                'weight': float(ea.weight),
                'covered_cos': ea.covered_cos,
                'status': ea.status,
                'section_id': str(section.id),
                'section_name': section.section_name,
            })
    
    # Build CO coverage matrix
    co_coverage = {}
    for ea in exam_assignments:
        for co in ea['covered_cos']:
            co_key = f"CO{co}"
            if co_key not in co_coverage:
                co_coverage[co_key] = []
            co_coverage[co_key].append({
                'exam': ea['exam'],
                'weight': ea['weight'],
            })
    
    # Build weight matrix
    weight_matrix = {}
    exam_types = set(ea['qp_type'] for ea in exam_assignments)
    for et in exam_types:
        weight_matrix[et] = {}
        for co in range(1, course.co_count + 1):
            co_key = f"CO{co}"
            total_weight = sum(
                ea['weight'] / len(ea['covered_cos'])
                for ea in exam_assignments
                if ea['qp_type'] == et and co in ea['covered_cos']
            )
            weight_matrix[et][co_key] = round(total_weight, 2)
    
    return Response({
        'course': AcV2CourseSerializer(course).data,
        'class_type': class_type_data,
        'exam_assignments': exam_assignments,
        'co_coverage': co_coverage,
        'weight_matrix': weight_matrix,
        'total_internal_marks': float(class_type.total_internal_marks) if class_type else 40,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_pattern_for_exam(request, course_id, exam_type):
    """
    Get resolved QP pattern for an exam.
    Follows priority: User Override → Batch Override → Global Pattern
    """
    course = get_object_or_404(AcV2Course, id=course_id)
    user = request.user
    
    # 1. Check user override (if allow_customize_questions)
    if course.class_type and course.class_type.allow_customize_questions:
        user_pattern = AcV2UserPatternOverride.objects.filter(
            course=course,
            exam_type=exam_type,
            created_by=user
        ).first()
        if user_pattern:
            return Response({
                'source': 'user_override',
                'pattern': user_pattern.pattern,
            })
    
    # 2. Check batch override
    # (Need to determine batch from course/semester - simplified here)
    
    # 3. Global pattern
    pattern = AcV2QpPattern.objects.filter(
        qp_type=exam_type,
        class_type=course.class_type,
        is_active=True
    ).first()
    
    if not pattern:
        # Fallback to global without class type
        pattern = AcV2QpPattern.objects.filter(
            qp_type=exam_type,
            class_type__isnull=True,
            is_active=True
        ).first()
    
    if pattern:
        return Response({
            'source': 'global',
            'pattern': pattern.pattern,
        })
    
    return Response({
        'source': 'none',
        'pattern': {},
    })


# ============================================================================
# FACULTY COURSE INFO (for InternalMarkPage)
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def faculty_course_info(request, ta_id):
    """Return course information for a teaching assignment, including exam
    assignments configured for the class type. Used by the faculty
    InternalMarkPage."""
    from academics.models import TeachingAssignment, StudentSectionAssignment

    ta = get_object_or_404(
        TeachingAssignment.objects.select_related(
            'curriculum_row', 'elective_subject', 'section',
            'section__semester', 'section__managing_department',
            'staff',
        ),
        id=ta_id,
        staff__user=request.user,
        is_active=True,
    )

    cr = ta.curriculum_row
    es = ta.elective_subject
    sec = ta.section

    course_code = (cr.course_code if cr else None) or (getattr(es, 'course_code', None)) or '-'
    course_name = (cr.course_name if cr else None) or (getattr(es, 'course_name', None)) or '-'
    class_type_code = (cr.class_type if cr else None) or 'THEORY'

    # Look up AcV2ClassType - curriculum class_type_code is authoritative:
    # 1. Match by short_code or name against the curriculum class_type_code
    # 2. Final fallback: first active class type
    acv2_ct = (
        AcV2ClassType.objects.filter(is_active=True, short_code__iexact=class_type_code).first()
        or AcV2ClassType.objects.filter(is_active=True, name__iexact=class_type_code).first()
        or AcV2ClassType.objects.filter(is_active=True).first()
    )
    # NOTE: Always show curriculum class_type_code for consistency with course list
    # Use AcV2ClassType only for exam configurations and total_internal_marks
    class_type_info = {
        'id': str(acv2_ct.id) if acv2_ct else '',
        'name': class_type_code,  # Display curriculum code, not AcV2 display_name
        'total_internal_marks': float(acv2_ct.total_internal_marks) if acv2_ct else 40,
    }

    # Count students in this section
    student_count = 0
    if sec:
        student_count = StudentSectionAssignment.objects.filter(
            section=sec, end_date__isnull=True
        ).count()

    # Build exam list from AcV2ExamAssignment records linked to this TA via AcV2Section
    exams = []
    acv2_sections = AcV2Section.objects.filter(teaching_assignment=ta)
    exam_assignments = AcV2ExamAssignment.objects.filter(
        section__in=acv2_sections
    ).order_by('created_at')

    # Build weight lookup from ClassType config (single source of truth)
    ct_weight_lookup = {}
    ct_co_weights_lookup = {}  # exam -> {co: weight}
    if acv2_ct and acv2_ct.exam_assignments:
        for ea_conf in acv2_ct.exam_assignments:
            exam_code = ea_conf.get('exam', '')
            ct_weight_lookup[exam_code] = ea_conf.get('weight', 0)
            co_weights = ea_conf.get('co_weights', {})
            if co_weights:
                ct_co_weights_lookup[exam_code] = {int(k): v for k, v in co_weights.items()}

    for ea in exam_assignments:
        ea_weight = float(ea.weight) if ea.weight else 0
        # Resolve weight from ClassType config if ea.weight is 0
        if ea_weight == 0 and ea.exam in ct_weight_lookup and ct_weight_lookup[ea.exam]:
            ea_weight = float(ct_weight_lookup[ea.exam])
            ea.weight = ea_weight
            ea.save(update_fields=['weight'])

        # Get per-CO weights from class type config
        co_weights = ct_co_weights_lookup.get(ea.exam, {})

        draft = ea.draft_data if isinstance(ea.draft_data, dict) else {}
        marks = draft.get('marks', {})
        entered_count = sum(1 for v in marks.values() if v is not None and v != '')
        is_locked = ea.status in ('PUBLISHED', 'APPROVED')

        if is_locked:
            sm_status = 'COMPLETED'
        elif marks:
            sm_status = 'IN_PROGRESS'
        else:
            sm_status = 'NOT_STARTED'

        exams.append({
            'id': str(ea.id),
            'name': ea.exam_display_name or ea.exam or ea.qp_type,
            'short_name': ea.exam or ea.qp_type or '',
            'max_marks': ea.max_marks or 0,
            'weight': ea_weight,
            'co_weights': co_weights,  # Per-CO weights
            'entered_count': entered_count,
            'total_students': student_count,
            'is_locked': is_locked,
            'due_date': None,
            'status': sm_status,
        })

    # Sync exam assignments from ClassType config.
    # Auto-create AcV2Section + missing AcV2ExamAssignment records.
    if acv2_ct and acv2_ct.exam_assignments and sec:
        from academics.models import Subject as AcademicsSubject
        # Find or create AcV2Course
        subject = ta.subject or (
            AcademicsSubject.objects.filter(code=course_code).first()
            if course_code and course_code != '-' else None
        )
        semester = sec.semester if sec else None
        acv2_course = None
        if subject and semester:
            acv2_course, created = AcV2Course.objects.get_or_create(
                subject=subject,
                semester=semester,
                defaults={
                    'subject_code': course_code,
                    'subject_name': course_name,
                    'class_type': acv2_ct,
                    'class_type_name': acv2_ct.display_name,
                },
            )
            # Correct class_type if it was previously set to the wrong one
            if not created and acv2_ct and acv2_course.class_type_id != acv2_ct.id:
                acv2_course.class_type = acv2_ct
                acv2_course.class_type_name = acv2_ct.display_name
                acv2_course.save(update_fields=['class_type', 'class_type_name'])
                # Delete stale exam assignments that have no marks entered
                for acv2_sec_obj in acv2_course.sections.all():
                    stale_eas = AcV2ExamAssignment.objects.filter(section=acv2_sec_obj)
                    for stale_ea in stale_eas:
                        draft = stale_ea.draft_data if isinstance(stale_ea.draft_data, dict) else {}
                        marks = draft.get('marks', {})
                        has_marks = any(v is not None and v != '' for v in marks.values())
                        if not has_marks and stale_ea.status == 'DRAFT':
                            stale_ea.delete()
                # Clear the exams list so they get rebuilt from correct class type
                exams.clear()
        if acv2_course:
            # Create AcV2Section
            acv2_sec, _ = AcV2Section.objects.get_or_create(
                course=acv2_course,
                teaching_assignment=ta,
                defaults={
                    'section_name': sec.name if sec else 'A',
                    'faculty_user': request.user,
                },
            )
            # Track which exam codes already exist
            existing_exam_codes = set(e['short_name'] for e in exams)

            # Create/sync exam assignments from class type config
            for ea_conf in acv2_ct.exam_assignments:
                exam_code_val = ea_conf.get('exam', '')
                display_name = ea_conf.get('exam_display_name', exam_code_val)
                weight = ea_conf.get('weight', 0)
                qp_type_val = ea_conf.get('qp_type', exam_code_val)

                # Always derive covered_cos and max_marks from QP pattern
                covered_cos = []
                qp_match = AcV2QpPattern.objects.filter(
                    qp_type=qp_type_val, is_active=True
                ).first()
                derived_max = 0
                if qp_match and isinstance(qp_match.pattern, dict):
                    qp_marks = qp_match.pattern.get('marks', [])
                    qp_cos = qp_match.pattern.get('cos', [])
                    qp_enabled = qp_match.pattern.get('enabled', [True] * len(qp_marks))
                    derived_max = sum(
                        m for i, m in enumerate(qp_marks)
                        if i < len(qp_enabled) and qp_enabled[i]
                    )
                    covered_cos = sorted(set(
                        c for i, c in enumerate(qp_cos)
                        if c is not None and isinstance(c, int)
                        and i < len(qp_enabled) and qp_enabled[i]
                    ))
                if not covered_cos:
                    covered_cos = ea_conf.get('default_cos', [])

                final_max = derived_max or weight or 50

                if exam_code_val in existing_exam_codes:
                    # Already in the exams list, skip
                    continue

                ea_obj, created = AcV2ExamAssignment.objects.get_or_create(
                    section=acv2_sec,
                    exam=exam_code_val,
                    defaults={
                        'exam_display_name': display_name,
                        'qp_type': qp_type_val,
                        'max_marks': final_max,
                        'weight': weight,
                        'covered_cos': covered_cos,
                    },
                )
                # Get per-CO weights from class type config
                co_weights_for_new = ea_conf.get('co_weights', {})
                if co_weights_for_new:
                    co_weights_for_new = {int(k): v for k, v in co_weights_for_new.items()}
                exams.append({
                    'id': str(ea_obj.id),
                    'name': display_name,
                    'short_name': exam_code_val,
                    'max_marks': ea_obj.max_marks or 0,
                    'weight': ea_obj.weight or 0,
                    'co_weights': co_weights_for_new,  # Per-CO weights
                    'entered_count': 0,
                    'total_students': student_count,
                    'is_locked': False,
                    'due_date': None,
                    'status': 'NOT_STARTED',
                })

    semester_num = sec.semester.number if sec and sec.semester else 0
    dept_name = ''
    if sec and sec.managing_department:
        dept_name = (getattr(sec.managing_department, 'short_name', '')
                     or getattr(sec.managing_department, 'name', ''))

    return Response({
        'id': str(ta.id),
        'course_code': course_code,
        'course_name': course_name,
        'class_name': sec.name if sec else '',
        'section': sec.name if sec else '',
        'semester': semester_num,
        'department': dept_name,
        'student_count': student_count,
        'is_elective': bool(ta.elective_subject_id),
        'class_type': class_type_info,
        'exams': exams,
    })


# ============================================================================
# FACULTY EXAM INFO (for MarkEntryPage)
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def faculty_exam_info(request, exam_id):
    """Return exam information for a specific AcV2ExamAssignment."""
    from academics.models import TeachingAssignment

    ea = get_object_or_404(
        AcV2ExamAssignment.objects.select_related(
            'section__teaching_assignment__section',
            'section__teaching_assignment__section__semester',
            'section__teaching_assignment__section__managing_department',
            'section__teaching_assignment__curriculum_row',
            'section__teaching_assignment__elective_subject',
        ),
        id=exam_id,
        section__faculty_user=request.user,
    )

    ta = ea.section.teaching_assignment
    acad_sec = ta.section
    cr = ta.curriculum_row
    es = ta.elective_subject

    course_code = (cr.course_code if cr else None) or (getattr(es, 'course_code', None)) or '-'
    course_name = (cr.course_name if cr else None) or (getattr(es, 'course_name', None)) or '-'

    # Publish control / editability (semester open window, due date, publish lock, edit window)
    ctrl = check_publish_control(ea)
    # JSON-safe conversion (timedelta is not serializable)
    if ctrl.get('time_remaining') is not None:
        try:
            ctrl['time_remaining_seconds'] = int(ctrl['time_remaining'].total_seconds())
        except Exception:
            ctrl['time_remaining_seconds'] = None
        try:
            del ctrl['time_remaining']
        except Exception:
            pass
    semester_config = ea.get_semester_config()
    open_from = getattr(semester_config, 'open_from', None) if semester_config else None
    due_at = getattr(semester_config, 'due_at', None) if semester_config else None

    open_remaining_seconds = None
    due_remaining_seconds = None
    try:
        now = timezone.now()
        if open_from and now < open_from:
            open_remaining_seconds = int((open_from - now).total_seconds())
        if due_at:
            if now > due_at:
                due_remaining_seconds = 0
            else:
                due_remaining_seconds = int((due_at - now).total_seconds())
    except Exception:
        open_remaining_seconds = None
        due_remaining_seconds = None

    is_locked = bool(ctrl.get('is_locked', False))

    dept_name = ''
    if acad_sec and acad_sec.managing_department:
        dept_name = (getattr(acad_sec.managing_department, 'short_name', '')
                     or getattr(acad_sec.managing_department, 'name', ''))

    draft = ea.draft_data if isinstance(ea.draft_data, dict) else {}
    question_btls = draft.get('question_btls', {})

    # Check if user has a course-specific pattern (from Mark Manager)
    user_pattern = draft.get('user_pattern')

    # Build qp_pattern with questions array
    qp_pattern_response = None
    mark_manager = None

    if user_pattern and isinstance(user_pattern, dict):
        # Use course-specific pattern from Mark Manager (stored in draft_data)
        p = user_pattern
        titles = p.get('titles', [])
        marks_list = p.get('marks', [])
        cos = p.get('cos', [])
        btls = p.get('btls', [])
        enabled = p.get('enabled', [])
        questions = []
        for i in range(len(titles)):
            if i < len(enabled) and not enabled[i]:
                continue
            questions.append({
                'id': f'q{i}',
                'question_number': titles[i] if i < len(titles) else str(i + 1),
                'max_marks': marks_list[i] if i < len(marks_list) else 0,
                'btl_level': btls[i] if i < len(btls) else None,
                'co_number': cos[i] if i < len(cos) else 0,
            })
        if questions:
            qp_pattern_response = {
                'id': 'user_defined',
                'name': 'User Defined',
                'questions': questions,
            }
        # Mark manager config from user's pattern
        mm = p.get('mark_manager')
        if mm and isinstance(mm, dict):
            mark_manager = mm
    else:
        # Fall back to global QP pattern
        qp_type = ea.qp_type or ea.exam or ''
        matched_pattern = AcV2QpPattern.objects.filter(
            qp_type=qp_type, is_active=True
        ).first()
        if matched_pattern and isinstance(matched_pattern.pattern, dict):
            p = matched_pattern.pattern
            titles = p.get('titles', [])
            marks_list = p.get('marks', [])
            cos = p.get('cos', [])
            btls = p.get('btls', [])
            enabled = p.get('enabled', [])
            questions = []
            for i in range(len(titles)):
                if i < len(enabled) and not enabled[i]:
                    continue
                questions.append({
                    'id': f'q{i}',
                    'question_number': titles[i] if i < len(titles) else str(i + 1),
                    'max_marks': marks_list[i] if i < len(marks_list) else 0,
                    'btl_level': btls[i] if i < len(btls) else None,
                    'co_number': cos[i] if i < len(cos) else 0,
                })
            if questions:
                qp_pattern_response = {
                    'id': str(matched_pattern.id),
                    'name': matched_pattern.name,
                    'questions': questions,
                }
            # Include mark_manager config from QP pattern for user_define mode
            mm = p.get('mark_manager')
            if mm and isinstance(mm, dict) and mm.get('enabled'):
                mark_manager = mm

    return Response({
        'id': str(ea.id),
        'name': ea.exam_display_name or ea.exam or ea.qp_type or '',
        'max_marks': float(ea.max_marks) if ea.max_marks else 0,
        'course_code': course_code,
        'course_name': course_name,
        'class_name': str(acad_sec) if acad_sec else '',
        'section': acad_sec.name if acad_sec else '',
        'department': dept_name,
        'due_date': ea.edit_window_until.isoformat() if ea.edit_window_until else None,
        'status': ea.status,
        'is_locked': is_locked,
        'has_pending_edit_request': bool(getattr(ea, 'has_pending_edit_request', False)),
        'publish_control': {
            **ctrl,
            'open_from': open_from.isoformat() if open_from else None,
            'due_at': due_at.isoformat() if due_at else None,
            'is_open': semester_config.is_open() if semester_config else True,
            'open_remaining_seconds': open_remaining_seconds,
            'due_remaining_seconds': due_remaining_seconds,
        },
        'qp_pattern': qp_pattern_response,
        'question_btls': question_btls,
        'mark_manager': mark_manager,
    })


# ==========================================================================
# FACULTY EXAM PUBLISH + REQUEST EDIT (for MarkEntryPage publish control)
# ==========================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def faculty_exam_publish(request, exam_id):
    """Publish an exam (locks if publish control is enabled)."""
    ea = get_object_or_404(
        AcV2ExamAssignment.objects.select_related('section__course__semester'),
        id=exam_id,
        section__faculty_user=request.user,
    )

    if not ea.is_editable():
        return Response({'detail': 'This exam is locked and cannot be published.'}, status=403)

    semester_config = ea.get_semester_config()
    with transaction.atomic():
        ea.published_data = ea.draft_data if isinstance(ea.draft_data, dict) else {}
        ea.published_at = timezone.now()
        ea.published_by = request.user
        if semester_config and semester_config.publish_control_enabled:
            ea.status = 'PUBLISHED'
        else:
            ea.status = 'DRAFT'
        # Any approved edit window is consumed by publishing
        ea.edit_window_until = None
        ea.edit_window_until_publish = False
        ea.save(update_fields=['published_data', 'published_at', 'published_by', 'status', 'edit_window_until', 'edit_window_until_publish'])

        # Recompute internal marks for this section
        try:
            compute_section_internal_marks(ea.section)
        except Exception:
            pass

    return Response({'success': True, 'status': ea.status, 'published_at': ea.published_at.isoformat()})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def faculty_exam_request_edit(request, exam_id):
    """Request edit access for a published/locked exam."""
    ea = get_object_or_404(
        AcV2ExamAssignment.objects.select_related('section__course__semester'),
        id=exam_id,
        section__faculty_user=request.user,
    )

    reason = request.data.get('reason', '')
    if not reason:
        return Response({'detail': 'Reason is required.'}, status=400)

    result = create_edit_request(ea, request.user, reason)
    if result.get('success'):
        return Response(result)

    # Ensure failures are returned as a proper JSON response
    # (previously this view could fall through and return None, causing a 500)
    return Response(
        {
            'success': False,
            'request_id': result.get('request_id'),
            'error': result.get('error') or 'Request failed',
        },
        status=status.HTTP_400_BAD_REQUEST,
    )
    return Response(result, status=400)


# ============================================================================
# FACULTY EXAM MARKS (GET + POST for MarkEntryPage)
# ============================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def faculty_exam_marks(request, exam_id):
    """GET: List students with current marks. POST: Save marks."""
    from academics.models import TeachingAssignment, StudentSectionAssignment

    ea = get_object_or_404(
        AcV2ExamAssignment.objects.select_related(
            'section__teaching_assignment__section',
        ),
        id=exam_id,
        section__faculty_user=request.user,
    )

    ta = ea.section.teaching_assignment
    acad_sec = ta.section

    if request.method == 'GET':
        # Get all active students in the section
        assignments = (
            StudentSectionAssignment.objects
            .filter(section=acad_sec, end_date__isnull=True)
            .select_related('student__user')
            .order_by('student__reg_no')
        )

        # Load existing marks for this exam
        existing = {
            str(sm.student_id): sm
            for sm in AcV2StudentMark.objects.filter(exam_assignment=ea)
        }

        students = []
        for sa in assignments:
            sp = sa.student
            sm = existing.get(str(sp.id))
            students.append({
                'id': str(sp.id),
                'roll_number': sp.reg_no or '',
                'name': str(sp.user) if sp.user else sp.reg_no or '',
                'mark': float(sm.total_mark) if sm and sm.total_mark is not None else None,
                'co_marks': sm.question_marks if sm and isinstance(sm.question_marks, dict) else {},
                'is_absent': sm.is_absent if sm else False,
                'saved': True,
            })

        return Response({'students': students})

    # POST — save marks
    if not ea.is_editable():
        return Response({'detail': 'Exam is locked'}, status=403)

    marks_data = request.data.get('marks', [])
    question_btls = request.data.get('question_btls', {})
    # Note: publish action is handled via /exams/<id>/publish/ (publish control)

    # Resolve pattern for CO calculation - check user_pattern first (course-specific)
    draft = ea.draft_data if isinstance(ea.draft_data, dict) else {}
    user_pattern = draft.get('user_pattern')

    qp_cos = []
    qp_enabled = []
    qp_titles = []
    mm_config = None
    if user_pattern and isinstance(user_pattern, dict):
        # Use course-specific pattern from Mark Manager
        qp_cos = user_pattern.get('cos', [])
        qp_enabled = user_pattern.get('enabled', [True] * len(qp_cos))
        qp_titles = user_pattern.get('titles', [])
        mm_config = user_pattern.get('mark_manager') if isinstance(user_pattern.get('mark_manager'), dict) else None
    else:
        # Fall back to global QP pattern
        qp_type_val = ea.qp_type or ea.exam or ''
        matched_pattern = AcV2QpPattern.objects.filter(
            qp_type=qp_type_val, is_active=True
        ).first()
        if matched_pattern and isinstance(matched_pattern.pattern, dict):
            p = matched_pattern.pattern
            qp_cos = p.get('cos', [])
            qp_enabled = p.get('enabled', [True] * len(qp_cos))

    for entry in marks_data:
        student_id = entry.get('student_id')
        if not student_id:
            continue

        total_mark = entry.get('mark')
        co_marks = entry.get('co_marks', {})
        is_absent = entry.get('is_absent', False)

        try:
            from academics.models import StudentProfile
            sp = StudentProfile.objects.get(id=student_id)
        except Exception:
            continue

        sm, _ = AcV2StudentMark.objects.update_or_create(
            exam_assignment=ea,
            student=sp,
            defaults={
                'reg_no': sp.reg_no or '',
                'student_name': str(sp.user) if sp.user else sp.reg_no or '',
                'total_mark': total_mark,
                'question_marks': co_marks,
                'is_absent': is_absent,
            }
        )

        # Compute CO marks from question_marks using QP pattern CO mapping
        # Frontend sends keys q0, q1, ... (0-indexed)
        if qp_cos and co_marks and not is_absent:
            co_totals = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            for i, co in enumerate(qp_cos):
                if i < len(qp_enabled) and not qp_enabled[i]:
                    continue
                q_key = f'q{i}'  # 0-indexed keys from frontend
                q_mark = co_marks.get(q_key, 0) or 0
                if isinstance(q_mark, (int, float)) and co is not None:
                    if isinstance(co, int) and 1 <= co <= 5:
                        co_totals[co] += q_mark
                    elif isinstance(co, str) and '&' in co:
                        co_nums = [int(c.strip()) for c in co.split('&')]
                        for c in co_nums:
                            if 1 <= c <= 5:
                                co_totals[c] += q_mark / len(co_nums)

            # Mark Manager rule: if Exam column is enabled, split Exam marks equally
            # across the enabled COs in Mark Manager (no separate CO mapping for Exam).
            if mm_config and mm_config.get('cia_enabled'):
                # Determine which COs are enabled in Mark Manager
                enabled_cos = []
                for co_key, co_cfg in (mm_config.get('cos', {}) or {}).items():
                    try:
                        co_num = int(co_key)
                    except Exception:
                        continue
                    if isinstance(co_cfg, dict) and co_cfg.get('enabled') and 1 <= co_num <= 5:
                        enabled_cos.append(co_num)
                enabled_cos = sorted(set(enabled_cos))

                # Find the Exam question index in the pattern to read its mark.
                exam_index = None
                if qp_titles and isinstance(qp_titles, list):
                    for idx, t in enumerate(qp_titles):
                        if isinstance(t, str) and t.strip().lower() == 'exam':
                            exam_index = idx
                # Fallback: last column if it exists and has no CO mapping
                if exam_index is None and qp_cos:
                    last_idx = len(qp_cos) - 1
                    if last_idx >= 0 and (last_idx >= len(qp_enabled) or qp_enabled[last_idx]) and qp_cos[last_idx] is None:
                        exam_index = last_idx

                if exam_index is not None and enabled_cos:
                    exam_mark = co_marks.get(f'q{exam_index}', 0) or 0
                    if isinstance(exam_mark, (int, float)) and exam_mark > 0:
                        share = exam_mark / len(enabled_cos)
                        for c in enabled_cos:
                            co_totals[c] += share

            sm.co1_mark = round(co_totals[1], 2)
            sm.co2_mark = round(co_totals[2], 2)
            sm.co3_mark = round(co_totals[3], 2)
            sm.co4_mark = round(co_totals[4], 2)
            sm.co5_mark = round(co_totals[5], 2)
            sm.save(update_fields=['co1_mark', 'co2_mark', 'co3_mark', 'co4_mark', 'co5_mark'])

    # Save question_btls in draft_data
    draft = ea.draft_data if isinstance(ea.draft_data, dict) else {}
    draft['question_btls'] = question_btls
    ea.draft_data = draft
    ea.save(update_fields=['draft_data'])

    return Response({'status': 'saved'})


# ============================================================================
# FACULTY CONFIRM MARK MANAGER (user_define mode)
# ============================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def faculty_exam_confirm_mark_manager(request, exam_id):
    """
    Faculty confirms their Mark Manager CO setup (user_define mode).
    Generates question rows from their config and updates the QP pattern + ExamAssignment.
    """
    ea = get_object_or_404(
        AcV2ExamAssignment.objects.select_related('section'),
        id=exam_id,
        section__faculty_user=request.user,
    )

    if ea.status in ('PUBLISHED', 'APPROVED'):
        return Response({'detail': 'Exam is locked'}, status=400)

    config = request.data.get('mark_manager')
    if not config or not isinstance(config, dict):
        return Response({'detail': 'mark_manager config required'}, status=400)

    # Build question rows from the faculty's config
    cos_config = config.get('cos', {})
    cia_enabled = config.get('cia_enabled', False)
    cia_max_marks = config.get('cia_max_marks', 0)

    titles = []
    marks = []
    cos_list = []
    btls = []
    enabled = []

    # CO rows first
    total_max = 0
    covered_cos = []
    for co_str in sorted(cos_config.keys(), key=lambda x: int(x)):
        co_num = int(co_str)
        co_cfg = cos_config[co_str]
        if not co_cfg.get('enabled'):
            continue
        covered_cos.append(co_num)
        num_items = co_cfg.get('num_items', 1)
        per_item_max = co_cfg.get('max_marks', 0)  # max marks PER item
        total_max += per_item_max * num_items
        for i in range(num_items):
            titles.append(f'CO{co_num} - Item {i + 1}')
            marks.append(per_item_max)
            cos_list.append(co_num)
            btls.append(None)
            enabled.append(True)

    # Exam column after all CO items, before Total
    if cia_enabled and cia_max_marks > 0:
        titles.append('Exam')
        marks.append(cia_max_marks)
        cos_list.append(None)
        btls.append(None)
        enabled.append(True)
        total_max += cia_max_marks

    # Store the user-defined pattern in ExamAssignment draft_data (NOT in global QP pattern!)
    # This keeps Mark Manager config per-course/per-exam, independent from other courses.
    new_pattern = {
        'titles': titles,
        'marks': marks,
        'cos': cos_list,
        'btls': btls,
        'enabled': enabled,
        'mark_manager': {
            **config,
            'confirmed': True,
        },
    }

    # Save to draft_data so it's course-specific
    draft = ea.draft_data if isinstance(ea.draft_data, dict) else {}
    draft['user_pattern'] = new_pattern  # Store pattern here, NOT in global QP pattern
    ea.draft_data = draft

    # Update ExamAssignment max_marks and covered_cos
    ea.max_marks = total_max
    ea.covered_cos = covered_cos
    ea.save(update_fields=['draft_data', 'max_marks', 'covered_cos'])

    # Build questions for the response
    questions = []
    for i in range(len(titles)):
        questions.append({
            'id': f'q{i}',
            'question_number': titles[i],
            'max_marks': marks[i],
            'btl_level': btls[i],
            'co_number': cos_list[i] if cos_list[i] is not None else 0,
        })

    return Response({
        'ok': True,
        'max_marks': total_max,
        'questions': questions,
    })


# ============================================================================
# FACULTY CO-WISE SUMMARY (for InternalMarkPage consolidated view)
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def faculty_course_co_summary(request, ta_id):
    """
    Return CO-wise, exam-wise mark summary for all students.
    Shows raw marks per CO per exam, weighted marks, CO totals, final mark.
    """
    from academics.models import TeachingAssignment, StudentSectionAssignment, StudentProfile
    from decimal import Decimal

    ta = get_object_or_404(
        TeachingAssignment.objects.select_related(
            'curriculum_row', 'elective_subject', 'section',
            'section__semester', 'section__managing_department',
            'staff',
        ),
        id=ta_id,
        staff__user=request.user,
        is_active=True,
    )

    cr = ta.curriculum_row
    es = ta.elective_subject
    sec = ta.section

    course_code = (cr.course_code if cr else None) or (getattr(es, 'course_code', None)) or '-'
    course_name = (cr.course_name if cr else None) or (getattr(es, 'course_name', None)) or '-'

    # Get AcV2Section(s) for this TA
    acv2_sections = AcV2Section.objects.filter(teaching_assignment=ta).select_related('course__class_type')
    if not acv2_sections.exists():
        return Response({
            'course_code': course_code,
            'course_name': course_name,
            'co_count': 5,
            'total_internal_marks': 40,
            'exams': [],
            'students': [],
        })

    acv2_section = acv2_sections.first()
    acv2_course = acv2_section.course
    class_type = acv2_course.class_type
    co_count = acv2_course.co_count or 5
    total_internal = float(class_type.total_internal_marks) if class_type else 40

    # Get all exam assignments for this section
    exam_assignments = AcV2ExamAssignment.objects.filter(
        section=acv2_section
    ).order_by('created_at')

    # Build weight lookup from ClassType config (single source of truth)
    ct_weight_map = {}
    ct_co_weights_map = {}  # exam -> {co_num: weight}
    # Mark Manager conditional weights (admin-defined)
    ct_mm_co_weights_with_exam_map = {}  # exam -> {co_num: weight}
    ct_mm_co_weights_without_exam_map = {}  # exam -> {co_num: weight}
    ct_mm_exam_weight_map = {}  # exam -> exam_weight
    if class_type and class_type.exam_assignments:
        for ea_conf in class_type.exam_assignments:
            exam_code = ea_conf.get('exam', '')
            ct_weight_map[exam_code] = ea_conf.get('weight', 0)
            # Get per-CO weights if defined
            co_weights = ea_conf.get('co_weights', {})
            if co_weights:
                ct_co_weights_map[exam_code] = {int(k): v for k, v in co_weights.items()}

            # Mark Manager conditional config (optional)
            mm_on = ea_conf.get('mm_co_weights_with_exam')
            mm_off = ea_conf.get('mm_co_weights_without_exam')
            mm_exam_weight = ea_conf.get('mm_exam_weight')
            # Backward compatibility: allow nested keys
            if not mm_on and isinstance(ea_conf.get('mm_with_exam'), dict):
                mm_on = ea_conf.get('mm_with_exam', {}).get('co_weights')
                mm_exam_weight = ea_conf.get('mm_with_exam', {}).get('exam_weight', mm_exam_weight)
            if not mm_off and isinstance(ea_conf.get('mm_without_exam'), dict):
                mm_off = ea_conf.get('mm_without_exam', {}).get('co_weights')

            if isinstance(mm_on, dict) and mm_on:
                ct_mm_co_weights_with_exam_map[exam_code] = {int(k): v for k, v in mm_on.items()}
            if isinstance(mm_off, dict) and mm_off:
                ct_mm_co_weights_without_exam_map[exam_code] = {int(k): v for k, v in mm_off.items()}
            if mm_exam_weight is not None:
                try:
                    ct_mm_exam_weight_map[exam_code] = float(mm_exam_weight) or 0
                except Exception:
                    ct_mm_exam_weight_map[exam_code] = 0

    exams_data = []
    exam_map = {}  # exam_id -> exam info
    for ea in exam_assignments:
        covered_cos = ea.covered_cos or []
        weight = float(ea.weight) if ea.weight else 0
        max_marks = float(ea.max_marks) if ea.max_marks else 0

        # Resolve weight from ClassType config if ea.weight is 0
        if weight == 0 and ea.exam in ct_weight_map and ct_weight_map[ea.exam]:
            weight = float(ct_weight_map[ea.exam])
            # Sync back to DB record
            ea.weight = weight
            ea.save(update_fields=['weight'])

        # Check for course-specific pattern from Mark Manager first
        draft = ea.draft_data if isinstance(ea.draft_data, dict) else {}
        user_pattern = draft.get('user_pattern')
        
        co_max_map = {}  # {co_num: total_marks_for_that_co}
        co_weights = {}  # Effective per-CO weights
        cia_enabled = False  # Whether Mark Manager has Exam enabled
        cia_weight = 0  # Exam component weight (admin-defined)
        exam_max_marks = 0  # Exam component max marks (only when Mark Manager Exam is enabled)
        exam_q_index = None  # Internal: index of Exam question in question_marks (q{index})
        
        if user_pattern and isinstance(user_pattern, dict):
            # Use course-specific pattern from Mark Manager
            p = user_pattern
            qp_marks = p.get('marks', [])
            qp_cos = p.get('cos', [])
            qp_enabled = p.get('enabled', [True] * len(qp_marks))
            # Derive max_marks from user pattern
            derived_max = sum(
                m for i, m in enumerate(qp_marks)
                if i < len(qp_enabled) and qp_enabled[i]
            )
            if derived_max > 0:
                max_marks = derived_max
            # Derive covered_cos from user pattern
            derived_cos = sorted(set(
                c for i, c in enumerate(qp_cos)
                if c is not None and isinstance(c, int)
                and i < len(qp_enabled) and qp_enabled[i]
            ))
            if derived_cos:
                covered_cos = derived_cos
            # Build per-CO max marks from user pattern
            for i, c in enumerate(qp_cos):
                if c is not None and isinstance(c, int) and i < len(qp_enabled) and qp_enabled[i]:
                    co_max_map[c] = co_max_map.get(c, 0) + (qp_marks[i] if i < len(qp_marks) else 0)
            
            # Get Mark Manager config for condition handling
            mm_config = p.get('mark_manager', {}) if isinstance(p.get('mark_manager'), dict) else {}
            cia_enabled = bool(mm_config.get('cia_enabled', False))
            mm_cos_config = mm_config.get('cos', {}) if isinstance(mm_config.get('cos'), dict) else {}

            # Enabled COs (authoritative for Mark Manager)
            enabled_cos = []
            for co_str, co_cfg in mm_cos_config.items():
                try:
                    co_num = int(co_str)
                except Exception:
                    continue
                if isinstance(co_cfg, dict) and co_cfg.get('enabled') and 1 <= co_num <= 50:
                    enabled_cos.append(co_num)
            enabled_cos = sorted(set(enabled_cos))
            if enabled_cos:
                covered_cos = enabled_cos

            # Find Exam max marks in user pattern (needed to scale redistributed Exam marks)
            exam_max = 0
            titles = p.get('titles', []) if isinstance(p.get('titles'), list) else []
            for i, t in enumerate(titles):
                if isinstance(t, str) and t.strip().lower() == 'exam':
                    if i < len(qp_marks) and i < len(qp_enabled) and qp_enabled[i]:
                        try:
                            exam_max = float(qp_marks[i] or 0)
                        except Exception:
                            exam_max = 0
                        exam_q_index = i
            if exam_max == 0 and qp_marks and qp_cos and len(qp_marks) == len(qp_cos):
                last_idx = len(qp_cos) - 1
                if last_idx >= 0 and qp_cos[last_idx] is None and (last_idx < len(qp_enabled) and qp_enabled[last_idx]):
                    try:
                        exam_max = float(qp_marks[last_idx] or 0)
                    except Exception:
                        exam_max = 0
                    exam_q_index = last_idx

            exam_max_marks = float(exam_max or 0)

            if cia_enabled:
                # CONDITION A: WITH Exam -> use admin-defined Mark Manager "with exam" weights
                base = ct_mm_co_weights_with_exam_map.get(ea.exam) or ct_co_weights_map.get(ea.exam, {})
                cia_weight = float(ct_mm_exam_weight_map.get(ea.exam, 0) or 0)

                # Base CO weights
                for co_num in covered_cos:
                    co_weights[int(co_num)] = float(base.get(int(co_num), 0) or 0)

                # IMPORTANT UX RULE:
                # In CO Summary tables, "Direct CO" columns should NOT include the Exam split.
                # Exam is displayed as a separate column, and its split affects only the right-side
                # CO totals (and DB co1..co5 persistence), not the left-table CO cells.
                weight = sum(float(v or 0) for v in co_weights.values()) + float(cia_weight or 0)
            else:
                # CONDITION B: WITHOUT Exam -> use admin-defined Mark Manager "without exam" weights
                base = ct_mm_co_weights_without_exam_map.get(ea.exam) or ct_co_weights_map.get(ea.exam, {})
                for co_num in covered_cos:
                    co_weights[int(co_num)] = float(base.get(int(co_num), 0) or 0)
                weight = sum(float(v or 0) for v in co_weights.values())
        else:
            # Fall back to global QP pattern (no Mark Manager)
            qp_type_val = ea.qp_type or ea.exam or ''
            qp_match = AcV2QpPattern.objects.filter(
                qp_type=qp_type_val, is_active=True
            ).first()
            if qp_match and isinstance(qp_match.pattern, dict):
                p = qp_match.pattern
                qp_marks = p.get('marks', [])
                qp_cos = p.get('cos', [])
                qp_enabled = p.get('enabled', [True] * len(qp_marks))
                # Derive max_marks from pattern
                derived_max = sum(
                    m for i, m in enumerate(qp_marks)
                    if i < len(qp_enabled) and qp_enabled[i]
                )
                if derived_max > 0:
                    max_marks = derived_max
                # Always derive covered_cos from QP pattern (authoritative source)
                derived_cos = sorted(set(
                    c for i, c in enumerate(qp_cos)
                    if c is not None and isinstance(c, int)
                    and i < len(qp_enabled) and qp_enabled[i]
                ))
                if derived_cos:
                    covered_cos = derived_cos
                # Also build per-CO max marks from the actual question pattern
                for i, c in enumerate(qp_cos):
                    if c is not None and isinstance(c, int) and i < len(qp_enabled) and qp_enabled[i]:
                        co_max_map[c] = co_max_map.get(c, 0) + (qp_marks[i] if i < len(qp_marks) else 0)
            
            # For non-Mark Manager exams, use admin-defined co_weights from ClassType
            co_weights = ct_co_weights_map.get(ea.exam, {})

        # weight_per_co: for even split fallback when no per-CO weights defined
        if not co_weights and covered_cos:
            weight_per_co = round(weight / len(covered_cos), 2) if covered_cos else 0
        else:
            weight_per_co = 0  # Will use co_weights instead
        # max_per_co: fallback when co_max_map not available
        max_per_co = round(max_marks / len(covered_cos), 2) if covered_cos else max_marks

        exam_info = {
            'id': str(ea.id),
            'name': ea.exam_display_name or ea.exam or ea.qp_type or '',
            'short_name': ea.exam or ea.qp_type or '',
            'max_marks': max_marks,
            'weight': weight,
            'co_weights': co_weights,  # Per-CO weights (from Mark Manager or admin config)
            'cia_enabled': cia_enabled,  # Whether Mark Manager Exam checkbox is enabled
            'cia_weight': cia_weight,  # Weight for Exam component from Mark Manager
            'exam_max_marks': exam_max_marks,
            'covered_cos': covered_cos,
            'weight_per_co': weight_per_co,
            'max_per_co': max_per_co,
            'co_max_map': co_max_map,
            'status': ea.status,
        }
        exams_data.append(exam_info)
        # Keep internal fields for per-student recomputation from question_marks.
        # This avoids relying on stale co1..co5 columns when Mark Manager logic changes.
        internal = {
            '_exam_q_index': exam_q_index,
        }
        if user_pattern and isinstance(user_pattern, dict):
            internal['_qp_cos'] = qp_cos
            internal['_qp_enabled'] = qp_enabled
        exam_map[str(ea.id)] = {**exam_info, **internal}

    # Get all active students in the academic section
    student_assignments = (
        StudentSectionAssignment.objects
        .filter(section=sec, end_date__isnull=True)
        .select_related('student__user')
        .order_by('student__reg_no')
    )

    # Get all student marks across all exams at once
    all_marks = AcV2StudentMark.objects.filter(
        exam_assignment__in=exam_assignments
    ).select_related('exam_assignment')

    # Build mark lookup: student_id -> exam_id -> mark object
    mark_lookup = {}
    for sm in all_marks:
        sid = str(sm.student_id)
        eid = str(sm.exam_assignment_id)
        if sid not in mark_lookup:
            mark_lookup[sid] = {}
        mark_lookup[sid][eid] = sm

    students_data = []
    for sa in student_assignments:
        sp = sa.student
        sid = str(sp.id)
        student_entry = {
            'reg_no': sp.reg_no or '',
            'name': str(sp.user) if sp.user else sp.reg_no or '',
            'exam_marks': {},
            'weighted_marks': {},
            'co_totals': [0.0] * co_count,
            'final_mark': 0.0,
        }

        student_marks = mark_lookup.get(sid, {})

        for ea in exam_assignments:
            eid = str(ea.id)
            einfo = exam_map[eid]
            sm = student_marks.get(eid)

            exam_entry = {
                'is_absent': sm.is_absent if sm else False,
            }

            # For Mark Manager exams, recompute CO marks from question_marks so "Exam" split
            # always applies only to the enabled COs (and stays correct even if older DB rows exist).
            direct_raw = None  # type: ignore
            effective_for_db = None  # type: ignore
            exam_raw_for_split = 0.0
            computed_total_from_questions = None  # type: ignore
            if sm and not sm.is_absent and isinstance(sm.question_marks, dict) and isinstance(einfo.get('_qp_cos'), list):
                qp_cos_local = einfo.get('_qp_cos') or []
                qp_enabled_local = einfo.get('_qp_enabled') or [True] * len(qp_cos_local)
                qmarks = sm.question_marks

                # Base totals from CO-mapped questions
                co_totals_direct = {c: 0.0 for c in range(1, co_count + 1)}
                total_from_questions = 0.0
                for i, co in enumerate(qp_cos_local):
                    if i < len(qp_enabled_local) and not qp_enabled_local[i]:
                        continue
                    q_key = f'q{i}'
                    q_mark = qmarks.get(q_key, 0) or 0
                    if not isinstance(q_mark, (int, float)):
                        continue

                    # Total mark should reflect all enabled question marks (including Exam)
                    total_from_questions += float(q_mark)

                    if co is None:
                        continue
                    if isinstance(co, int) and 1 <= co <= co_count:
                        co_totals_direct[co] += float(q_mark)
                    elif isinstance(co, str) and '&' in co:
                        try:
                            co_nums = [int(x.strip()) for x in co.split('&')]
                        except Exception:
                            co_nums = []
                        co_nums = [c for c in co_nums if 1 <= c <= co_count]
                        if co_nums:
                            share = float(q_mark) / len(co_nums)
                            for c in co_nums:
                                co_totals_direct[c] += share

                # Exam split (only when Mark Manager Exam is enabled)
                if einfo.get('cia_enabled'):
                    exam_idx = einfo.get('_exam_q_index')
                    raw_exam = 0.0
                    if isinstance(exam_idx, int) and exam_idx >= 0:
                        v = qmarks.get(f'q{exam_idx}', 0) or 0
                        if isinstance(v, (int, float)):
                            raw_exam = float(v)
                    exam_entry['exam'] = round(raw_exam, 2)
                    exam_raw_for_split = float(raw_exam or 0)

                    covered = einfo.get('covered_cos') or []
                    enabled_cos = [int(c) for c in covered if isinstance(c, int) and 1 <= int(c) <= co_count]
                else:
                    # Ensure the key exists for UI columns when configured
                    if einfo.get('cia_enabled'):
                        exam_entry['exam'] = 0

                # What we show in the table (direct-only)
                direct_raw = co_totals_direct

                # What we persist to DB (direct + Exam split), so downstream reports remain correct.
                co_totals_effective = dict(co_totals_direct)
                if einfo.get('cia_enabled'):
                    covered = einfo.get('covered_cos') or []
                    enabled_cos = [int(c) for c in covered if isinstance(c, int) and 1 <= int(c) <= co_count]
                    if exam_raw_for_split and enabled_cos:
                        share = float(exam_raw_for_split) / len(enabled_cos)
                        for c in enabled_cos:
                            co_totals_effective[c] = float(co_totals_effective.get(c, 0.0) + share)

                effective_for_db = co_totals_effective
                computed_total_from_questions = round(total_from_questions, 2)

                # Persist back to DB to keep co1..co5 in sync (best-effort)
                try:
                    new_vals = [round(co_totals_effective.get(i, 0.0), 2) for i in range(1, 6)]
                    old_vals = [
                        round(float(getattr(sm, f'co{i}_mark', 0) or 0), 2)
                        for i in range(1, 6)
                    ]
                    if new_vals != old_vals:
                        sm.co1_mark, sm.co2_mark, sm.co3_mark, sm.co4_mark, sm.co5_mark = new_vals
                        sm.save(update_fields=['co1_mark', 'co2_mark', 'co3_mark', 'co4_mark', 'co5_mark'])
                except Exception:
                    pass
            else:
                # If Mark Manager Exam is enabled, still expose exam key for UI
                if einfo.get('cia_enabled'):
                    exam_entry['exam'] = 0

            # Raw CO marks from AcV2StudentMark co1..co5 fields
            for co_num in range(1, co_count + 1):
                co_field = f'co{co_num}_mark'
                if direct_raw is not None:
                    raw_val = float(direct_raw.get(co_num, 0) or 0)
                else:
                    raw_val = float(getattr(sm, co_field, None) or 0) if sm else 0
                exam_entry[f'co{co_num}'] = raw_val

            # Total raw mark
            if computed_total_from_questions is not None:
                exam_entry['total'] = float(computed_total_from_questions)
            else:
                exam_entry['total'] = float(sm.total_mark) if sm and sm.total_mark is not None else 0

            student_entry['exam_marks'][einfo['short_name']] = exam_entry

            # Compute weighted marks for each covered CO
            if sm and not sm.is_absent:
                covered_cos = einfo['covered_cos']
                max_per_co = einfo['max_per_co']
                weight_per_co = einfo['weight_per_co']
                co_weights = einfo.get('co_weights', {})

                # Direct-only weighted marks (for left-side per-exam CO columns)

                for co_num in covered_cos:
                    if co_num < 1 or co_num > co_count:
                        continue
                    co_field = f'co{co_num}_mark'
                    if direct_raw is not None:
                        raw = float(direct_raw.get(co_num, 0) or 0)
                    else:
                        raw = float(getattr(sm, co_field, None) or 0)
                    # Use per-CO max from QP pattern if available, else fall back
                    co_max = einfo['co_max_map'].get(co_num, max_per_co)
                    # Use per-CO weight if defined, else fall back to even split
                    co_weight = co_weights.get(co_num, weight_per_co)
                    if co_max > 0:
                        weighted = round((raw / co_max) * co_weight, 2)
                    else:
                        weighted = 0
                    key = f"{einfo['short_name']}_CO{co_num}"
                    student_entry['weighted_marks'][key] = weighted
                    student_entry['co_totals'][co_num - 1] += weighted

                # Exam split weighted contribution (ONLY to right-side CO totals)
                if einfo.get('cia_enabled') and exam_raw_for_split:
                    enabled_cos = [
                        int(c) for c in (covered_cos or [])
                        if isinstance(c, int) and 1 <= int(c) <= co_count
                    ]
                    exam_max_marks_local = float(einfo.get('exam_max_marks') or 0)
                    exam_weight_local = float(einfo.get('cia_weight') or 0)
                    if enabled_cos and exam_max_marks_local > 0 and exam_weight_local > 0:
                        share_raw = float(exam_raw_for_split) / len(enabled_cos)
                        share_max = float(exam_max_marks_local) / len(enabled_cos)
                        share_wt = float(exam_weight_local) / len(enabled_cos)
                        if share_max > 0:
                            for c in enabled_cos:
                                add_w = round((share_raw / share_max) * share_wt, 2)
                                student_entry['co_totals'][c - 1] += add_w

        # Round CO totals
        student_entry['co_totals'] = [round(v, 2) for v in student_entry['co_totals']]
        student_entry['final_mark'] = round(sum(student_entry['co_totals']), 2)

        students_data.append(student_entry)

    return Response({
        'course_code': course_code,
        'course_name': course_name,
        'co_count': co_count,
        'total_internal_marks': total_internal,
        'exams': exams_data,
        'students': students_data,
    })


# ============================================================================
# EXPORT EXCEL TEMPLATE (for import)
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def faculty_exam_export_template(request, exam_id):
    """Export an Excel template with student roster and question columns."""
    from academics.models import StudentSectionAssignment
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    from django.http import HttpResponse

    ea = get_object_or_404(
        AcV2ExamAssignment.objects.select_related(
            'section__teaching_assignment__section',
            'section__teaching_assignment__curriculum_row',
            'section__teaching_assignment__elective_subject',
        ),
        id=exam_id,
        section__faculty_user=request.user,
    )

    ta = ea.section.teaching_assignment
    acad_sec = ta.section
    cr = ta.curriculum_row
    es = ta.elective_subject
    course_code = (cr.course_code if cr else None) or (getattr(es, 'course_code', None)) or '-'
    course_name = (cr.course_name if cr else None) or (getattr(es, 'course_name', None)) or '-'

    # Build question columns from QP pattern
    qp_type = ea.qp_type or ea.exam or ''
    matched_pattern = AcV2QpPattern.objects.filter(qp_type=qp_type, is_active=True).first()
    question_cols = []
    if matched_pattern and isinstance(matched_pattern.pattern, dict):
        p = matched_pattern.pattern
        titles = p.get('titles', [])
        marks_list = p.get('marks', [])
        cos = p.get('cos', [])
        enabled = p.get('enabled', [])
        for i in range(len(titles)):
            if i < len(enabled) and not enabled[i]:
                continue
            question_cols.append({
                'key': f'q{i}',
                'title': titles[i] if i < len(titles) else str(i + 1),
                'max_marks': marks_list[i] if i < len(marks_list) else 0,
                'co': cos[i] if i < len(cos) else 0,
            })

    # Students
    assignments = (
        StudentSectionAssignment.objects
        .filter(section=acad_sec, end_date__isnull=True)
        .select_related('student__user')
        .order_by('student__reg_no')
    )
    existing = {
        str(sm.student_id): sm
        for sm in AcV2StudentMark.objects.filter(exam_assignment=ea)
    }

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Mark Entry'

    # Styles
    header_font = Font(bold=True, color='FFFFFF', size=10)
    header_fill = PatternFill(start_color='2563EB', end_color='2563EB', fill_type='solid')
    sub_font = Font(bold=False, color='6B7280', size=8, italic=True)
    sub_fill = PatternFill(start_color='F3F4F6', end_color='F3F4F6', fill_type='solid')
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB'),
    )
    locked_fill = PatternFill(start_color='E5E7EB', end_color='E5E7EB', fill_type='solid')

    # Row 1: Info header
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=4)
    info_cell = ws.cell(row=1, column=1, value=f'{course_code} — {course_name} | {ea.exam_display_name or ea.exam or qp_type} | Max: {ea.max_marks}')
    info_cell.font = Font(bold=True, size=11)

    # Row 2: Headers
    base_headers = ['Sl No', 'Register Number', 'Student Name']
    q_headers = [q['title'] for q in question_cols]
    all_headers = base_headers + q_headers + ['Total', 'Absent']

    # Row 3: Sub-header (max marks / CO info)
    sub_headers = ['', '', '']
    for q in question_cols:
        co_label = f'CO{q["co"]}' if q['co'] else ''
        sub_headers.append(f'Max:{q["max_marks"]} {co_label}')
    sub_headers += [f'Max:{ea.max_marks}', 'Yes/No']

    for col_idx, header in enumerate(all_headers, 1):
        cell = ws.cell(row=2, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = thin_border

    for col_idx, sub in enumerate(sub_headers, 1):
        cell = ws.cell(row=3, column=col_idx, value=sub)
        cell.font = sub_font
        cell.fill = sub_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border

    # Data rows
    row_num = 4
    for idx, sa in enumerate(assignments):
        sp = sa.student
        sm = existing.get(str(sp.id))
        reg_no = sp.reg_no or ''
        name = str(sp.user) if sp.user else reg_no

        ws.cell(row=row_num, column=1, value=idx + 1).border = thin_border
        ws.cell(row=row_num, column=1).alignment = Alignment(horizontal='center')

        reg_cell = ws.cell(row=row_num, column=2, value=reg_no)
        reg_cell.border = thin_border
        reg_cell.font = Font(bold=True, size=10)
        reg_cell.fill = locked_fill

        name_cell = ws.cell(row=row_num, column=3, value=name)
        name_cell.border = thin_border
        name_cell.fill = locked_fill

        # Question marks
        co_marks = sm.question_marks if sm and isinstance(sm.question_marks, dict) else {}
        for q_idx, q in enumerate(question_cols):
            val = co_marks.get(q['key'])
            cell = ws.cell(row=row_num, column=4 + q_idx, value=val if val is not None else '')
            cell.border = thin_border
            cell.alignment = Alignment(horizontal='center')

        # Total
        total_val = float(sm.total_mark) if sm and sm.total_mark is not None else ''
        total_cell = ws.cell(row=row_num, column=4 + len(question_cols), value=total_val)
        total_cell.border = thin_border
        total_cell.alignment = Alignment(horizontal='center')
        total_cell.font = Font(bold=True)

        # Absent
        absent_val = 'Yes' if sm and sm.is_absent else ''
        absent_cell = ws.cell(row=row_num, column=5 + len(question_cols), value=absent_val)
        absent_cell.border = thin_border
        absent_cell.alignment = Alignment(horizontal='center')

        row_num += 1

    # Column widths
    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 18
    ws.column_dimensions['C'].width = 28
    for i in range(len(question_cols)):
        col_letter = openpyxl.utils.get_column_letter(4 + i)
        ws.column_dimensions[col_letter].width = 12
    ws.column_dimensions[openpyxl.utils.get_column_letter(4 + len(question_cols))].width = 10
    ws.column_dimensions[openpyxl.utils.get_column_letter(5 + len(question_cols))].width = 10

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    response = HttpResponse(
        buf.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    safe_name = f'{course_code}_{ea.exam_display_name or ea.exam or qp_type}'.replace(' ', '_')
    response['Content-Disposition'] = f'attachment; filename="{safe_name}.xlsx"'
    return response


# ============================================================================
# IMPORT MARKS FROM EXCEL
# ============================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def faculty_exam_import_marks(request, exam_id):
    """Import marks from uploaded Excel file, matching by register number."""
    from academics.models import StudentSectionAssignment, StudentProfile
    import openpyxl
    from io import BytesIO

    ea = get_object_or_404(
        AcV2ExamAssignment.objects.select_related(
            'section__teaching_assignment__section',
        ),
        id=exam_id,
        section__faculty_user=request.user,
    )

    if ea.status in ('PUBLISHED', 'APPROVED'):
        return Response({'detail': 'Exam is locked'}, status=403)

    uploaded = request.FILES.get('file')
    if not uploaded:
        return Response({'detail': 'No file uploaded'}, status=400)

    # Validate file extension
    name = uploaded.name.lower()
    if not name.endswith(('.xlsx', '.xls')):
        return Response({'detail': 'Only .xlsx or .xls files supported'}, status=400)

    # Limit file size (10 MB)
    if uploaded.size > 10 * 1024 * 1024:
        return Response({'detail': 'File too large (max 10 MB)'}, status=400)

    try:
        wb = openpyxl.load_workbook(BytesIO(uploaded.read()), data_only=True)
        ws = wb.active
    except Exception:
        return Response({'detail': 'Failed to read Excel file'}, status=400)

    # Find header row (look for 'Register Number' in first 5 rows)
    header_row = None
    reg_col = None
    for r in range(1, 6):
        for c in range(1, ws.max_column + 1):
            val = str(ws.cell(row=r, column=c).value or '').strip().lower()
            if val in ('register number', 'reg no', 'reg_no', 'regno', 'registration number', 'roll no', 'roll_no', 'roll number'):
                header_row = r
                reg_col = c
                break
        if header_row:
            break

    if not header_row or not reg_col:
        return Response({'detail': 'Could not find "Register Number" column in the header'}, status=400)

    # Read headers from header_row
    headers = []
    for c in range(1, ws.max_column + 1):
        val = str(ws.cell(row=header_row, column=c).value or '').strip()
        headers.append(val)

    # Build question columns from QP pattern
    qp_type = ea.qp_type or ea.exam or ''
    matched_pattern = AcV2QpPattern.objects.filter(qp_type=qp_type, is_active=True).first()
    question_cols = []
    if matched_pattern and isinstance(matched_pattern.pattern, dict):
        p = matched_pattern.pattern
        titles = p.get('titles', [])
        marks_list = p.get('marks', [])
        enabled = p.get('enabled', [])
        for i in range(len(titles)):
            if i < len(enabled) and not enabled[i]:
                continue
            question_cols.append({
                'key': f'q{i}',
                'title': titles[i] if i < len(titles) else str(i + 1),
                'max_marks': marks_list[i] if i < len(marks_list) else 0,
            })

    # Map header titles to column indices (0-based)
    q_title_to_key = {q['title']: q['key'] for q in question_cols}
    q_title_to_max = {q['title']: q['max_marks'] for q in question_cols}
    header_q_map = {}  # col_index -> question key
    total_col = None
    absent_col = None

    for c_idx, h in enumerate(headers):
        h_lower = h.lower().strip()
        if h in q_title_to_key:
            header_q_map[c_idx] = q_title_to_key[h]
        elif h_lower in ('total', 'marks', 'total marks'):
            total_col = c_idx
        elif h_lower in ('absent', 'abs'):
            absent_col = c_idx

    # Get students in section, build reg_no -> student map
    ta = ea.section.teaching_assignment
    acad_sec = ta.section
    assignments = (
        StudentSectionAssignment.objects
        .filter(section=acad_sec, end_date__isnull=True)
        .select_related('student__user')
    )
    reg_to_student = {}
    for sa in assignments:
        rn = (sa.student.reg_no or '').strip().upper()
        if rn:
            reg_to_student[rn] = sa.student

    # Read data rows (skip header and any sub-header row right after)
    start_row = header_row + 1
    # Skip sub-header row if present (check if it starts with non-numeric)
    first_reg = ws.cell(row=start_row, column=reg_col).value
    if first_reg and str(first_reg).strip().lower().startswith(('max', '')):
        first_val = str(first_reg).strip()
        if not first_val or first_val.lower().startswith('max') or not any(c.isdigit() for c in first_val):
            start_row += 1

    matched = 0
    skipped = 0
    imported_students = []

    for r in range(start_row, ws.max_row + 1):
        reg_val = ws.cell(row=r, column=reg_col).value
        if not reg_val:
            continue
        reg_no = str(reg_val).strip().upper()
        if not reg_no or not any(c.isdigit() for c in reg_no):
            continue

        sp = reg_to_student.get(reg_no)
        if not sp:
            skipped += 1
            continue

        # Read question marks
        co_marks = {}
        for c_idx, q_key in header_q_map.items():
            cell_val = ws.cell(row=r, column=c_idx + 1).value  # +1 for openpyxl 1-indexed
            if cell_val is not None:
                try:
                    num = float(cell_val)
                    # Validate against max marks
                    title_for_key = next((q['title'] for q in question_cols if q['key'] == q_key), None)
                    max_m = q_title_to_max.get(title_for_key, 999)
                    if 0 <= num <= max_m:
                        co_marks[q_key] = num
                except (ValueError, TypeError):
                    pass

        # Read total (only if no question cols, or as fallback)
        total_mark = None
        if total_col is not None:
            tv = ws.cell(row=r, column=total_col + 1).value
            if tv is not None:
                try:
                    total_mark = float(tv)
                    if total_mark < 0 or total_mark > float(ea.max_marks or 999):
                        total_mark = None
                except (ValueError, TypeError):
                    total_mark = None

        # Calculate total from question marks if present
        if co_marks:
            total_mark = round(sum(co_marks.values()), 2)

        # Read absent
        is_absent = False
        if absent_col is not None:
            av = ws.cell(row=r, column=absent_col + 1).value
            if av and str(av).strip().lower() in ('yes', 'y', '1', 'true', 'absent'):
                is_absent = True
                total_mark = None
                co_marks = {}

        imported_students.append({
            'student_id': str(sp.id),
            'roll_number': sp.reg_no or '',
            'name': str(sp.user) if sp.user else sp.reg_no or '',
            'mark': total_mark,
            'co_marks': co_marks,
            'is_absent': is_absent,
        })
        matched += 1

    return Response({
        'status': 'preview',
        'matched': matched,
        'skipped': skipped,
        'total_in_file': matched + skipped,
        'total_in_class': len(reg_to_student),
        'students': imported_students,
    })

