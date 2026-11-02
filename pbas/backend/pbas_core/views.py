from __future__ import annotations
import uuid
from datetime import date
from django.db import transaction
from django.http import FileResponse, Http404
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.generics import CreateAPIView, ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from accounts.models import User, Role, Department as AcademicDepartment, College, StaffProfile, StudentProfile, StudentMentorMap
from .models import (
    PBASCustomDepartment,
    PBASNode,
    PBASSubmission,
    PBASApprovalFlow,
    PBASNodeApproverHistory,
    PBASVerificationTicket,
    PBASDuration,
)
from .permissions import IsIQACManager, IsApprover, IsAuthenticatedSubmitter
from .serializers import (
    PBASCustomDepartmentSerializer,
    PBASNodeTreeSerializer,
    PBASSubmissionSerializer,
    PBASDurationSerializer,
)
from .utils import (
    allowed_audiences_for_viewer,
    resolve_viewer_from_user,
    user_staff_id,
    user_student_reg_no,
)

MASTER_DEPT_ID = 'master'

def _ensure_default_approval_flow():
    flow = PBASApprovalFlow.objects.first()
    if not flow:
        flow = PBASApprovalFlow.objects.create(
            staff_flow=["HOD", "PRINCIPAL"],
            student_flow=["MENTOR", "HOD", "PRINCIPAL"],
        )
    return flow

def _ensure_master_department():
    dept = PBASCustomDepartment.objects.filter(id='00000000-0000-0000-0000-000000000001').first()
    if not dept:
        dept, _ = PBASCustomDepartment.objects.get_or_create(
            title='Master PBAS Framework',
            defaults={
                'id': uuid.UUID('00000000-0000-0000-0000-000000000001'),
                'show_in_submission': True,
                'accesses': [],
            }
        )
    return dept

class PBASCustomDepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = PBASCustomDepartmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PBASCustomDepartment.objects.all().order_by('title')
        _ensure_master_department()
        viewer = self.request.query_params.get('viewer')
        if viewer:
            # show departments visible to this viewer
            qs = qs.filter(show_in_submission=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

class PBASCustomDepartmentTreeView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_department(self, dept_id: str):
        if str(dept_id).lower() == MASTER_DEPT_ID or dept_id == '00000000-0000-0000-0000-000000000001':
            return _ensure_master_department()
        try:
            return PBASCustomDepartment.objects.get(id=dept_id)
        except Exception:
            return _ensure_master_department()

    def get(self, request, dept_id: str):
        dept = self._get_department(dept_id)
        viewer = request.query_params.get('viewer') or resolve_viewer_from_user(request.user)
        allowed_audiences = allowed_audiences_for_viewer(viewer)

        roots = dept.nodes.filter(parent__isnull=True).order_by('position', 'created_at')
        if allowed_audiences:
            roots = roots.filter(audience__in=allowed_audiences)

        serializer = PBASNodeTreeSerializer(
            roots,
            many=True,
            context={'request': request, 'audience_filter': allowed_audiences}
        )
        return Response({
            'department_id': str(dept.id),
            'title': dept.title,
            'nodes': serializer.data,
        })

    def put(self, request, dept_id: str):
        if not IsIQACManager().has_permission(request, self):
            return Response({'detail': 'Permission denied. Only IQAC/Admins can modify the PBAS tree.'}, status=status.HTTP_403_FORBIDDEN)

        dept = self._get_department(dept_id)
        nodes_data = request.data if isinstance(request.data, list) else request.data.get('nodes', [])

        with transaction.atomic():
            dept.nodes.all().delete()

            def create_recursive(data_list, parent=None):
                for idx, item in enumerate(data_list):
                    node = PBASNode.objects.create(
                        department=dept,
                        parent=parent,
                        label=item.get('label', ''),
                        audience=item.get('audience', 'both'),
                        input_mode=item.get('input_mode', 'upload'),
                        form_schema=item.get('form_schema', []),
                        link=item.get('link') or None,
                        uploaded_name=item.get('uploaded_name') or None,
                        limit=item.get('limit') if item.get('limit') is not None else None,
                        pbas_credit=item.get('pbas_credit') if item.get('pbas_credit') is not None else None,
                        mentor_credit=item.get('mentor_credit') if item.get('mentor_credit') is not None else None,
                        college_required=bool(item.get('college_required')),
                        position=item.get('position', idx),
                    )
                    children = item.get('children') or []
                    if children:
                        create_recursive(children, parent=node)

            create_recursive(nodes_data)

        roots = dept.nodes.filter(parent__isnull=True).order_by('position', 'created_at')
        serializer = PBASNodeTreeSerializer(roots, many=True, context={'request': request})
        return Response({
            'department_id': str(dept.id),
            'title': dept.title,
            'nodes': serializer.data,
        })

class PBASCustomDepartmentNodesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, dept_id: str):
        if str(dept_id).lower() == MASTER_DEPT_ID:
            dept = _ensure_master_department()
        else:
            try:
                dept = PBASCustomDepartment.objects.get(id=dept_id)
            except PBASCustomDepartment.DoesNotExist:
                dept = _ensure_master_department()

        nodes = PBASNode.objects.filter(department=dept).values('id', 'label', 'pbas_credit', 'parent_id', 'input_mode')
        return Response(list(nodes))

class PBASApprovalFlowView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        flow = _ensure_default_approval_flow()
        return Response({
            'staff_flow': flow.staff_flow or ["HOD", "PRINCIPAL"],
            'student_flow': flow.student_flow or ["MENTOR", "HOD", "PRINCIPAL"],
            'updated_at': flow.updated_at,
        })

    def put(self, request):
        if not IsIQACManager().has_permission(request, self):
            return Response({'detail': 'Only IQAC managers can update approval flows.'}, status=403)
        flow = _ensure_default_approval_flow()
        flow.staff_flow = request.data.get('staff_flow', flow.staff_flow)
        flow.student_flow = request.data.get('student_flow', flow.student_flow)
        flow.save()
        return Response({
            'staff_flow': flow.staff_flow,
            'student_flow': flow.student_flow,
            'updated_at': flow.updated_at,
        })

class PBASSubmissionCreateView(CreateAPIView):
    serializer_class = PBASSubmissionSerializer
    permission_classes = [IsAuthenticatedSubmitter]

    def perform_create(self, serializer):
        user = self.request.user
        flow = _ensure_default_approval_flow()
        is_student = hasattr(user, 'student_profile') and user.student_profile is not None
        steps = flow.student_flow if is_student else flow.staff_flow
        initial_step = steps[0] if steps else 'PBAS_APPROVER'

        instance = serializer.save(
            user=user,
            status=PBASSubmission.Status.PENDING,
            current_step=initial_step,
            approval_history=[{
                'step': 'Submitted',
                'action': 'submitted',
                'by_user_id': user.id,
                'by_name': user.get_full_name() or user.username,
                'timestamp': timezone.now().isoformat(),
                'remarks': 'Submission entered into appraisal queue',
            }]
        )

class PBASSubmissionMineView(ListAPIView):
    serializer_class = PBASSubmissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PBASSubmission.objects.filter(user=self.request.user).select_related('node', 'college').order_by('-created_at')

def _build_approval_item(sub: PBASSubmission) -> dict:
    node = sub.node
    applicant_type = 'student' if hasattr(sub.user, 'student_profile') and sub.user.student_profile else 'staff'
    reg_or_staff_id = ''
    dept_code = ''
    dept_name = ''

    if applicant_type == 'staff' and hasattr(sub.user, 'staff_profile') and sub.user.staff_profile:
        reg_or_staff_id = sub.user.staff_profile.staff_id
        if sub.user.staff_profile.department:
            dept_code = sub.user.staff_profile.department.code
            dept_name = sub.user.staff_profile.department.name
    elif applicant_type == 'student' and hasattr(sub.user, 'student_profile') and sub.user.student_profile:
        reg_or_staff_id = sub.user.student_profile.reg_no
        if sub.user.student_profile.home_department:
            dept_code = sub.user.student_profile.home_department.code
            dept_name = sub.user.student_profile.home_department.name

    # Path & Category
    path_parts = []
    curr = node.parent if node else None
    category = 'General'
    while curr:
        path_parts.append(curr.label)
        curr = curr.parent
    path_parts.reverse()
    if path_parts:
        category = path_parts[0]

    ancestor_ids = []
    c = node
    while c:
        ancestor_ids.append(str(c.id))
        c = c.parent

    file_url = None
    if sub.file:
        try:
            file_url = sub.file.url
        except Exception:
            file_url = f"/api/pbas/submissions/{sub.id}/document/"

    return {
        'id': str(sub.id),
        'node_id': str(node.id) if node else '',
        'node_ancestor_ids': ancestor_ids,
        'applicant_type': applicant_type,
        'category': category,
        'department_code': dept_code,
        'department_name': dept_name,
        'user': {
            'id': sub.user.id,
            'name': sub.user.get_full_name() or sub.user.username,
            'reg_or_staff_id': reg_or_staff_id,
            'username': sub.user.username,
            'profile_image': sub.user.profile_image or None,
        },
        'leaf_title': node.label if node else '',
        'parent_path': ' > '.join(path_parts) if path_parts else 'Root',
        'submission_type': sub.submission_type,
        'form_data': sub.form_data or {},
        'form_schema': node.form_schema if (node and node.form_schema) else [],
        'link': sub.link,
        'file_url': file_url,
        'file_name': sub.file_name or (sub.file.name if sub.file else None),
        'pbas_credit': node.pbas_credit if (node and node.pbas_credit is not None) else 0,
        'status': sub.status,
        'current_step': sub.current_step,
        'approval_history': sub.approval_history or [],
        'created_at': sub.created_at.isoformat() if sub.created_at else None,
        'reviewed_at': sub.reviewed_at.isoformat() if sub.reviewed_at else None,
        'approved_by_name': sub.approved_by.get_full_name() if sub.approved_by else None,
        'rejection_reason': sub.rejection_reason or '',
    }

class PBASApprovalsListView(APIView):
    permission_classes = [IsApprover]

    def get(self, request):
        user = request.user
        tab = request.query_params.get('tab', 'pending').lower()

        qs = PBASSubmission.objects.all().select_related('node', 'user', 'college').order_by('-created_at')

        # Role filtering
        user_roles = set(user.get_role_names()) if hasattr(user, 'get_role_names') else set()
        is_manager = bool(user_roles & {'IQAC', 'ADMIN', 'PBAS_ADMIN', 'PBAS_MANAGER'}) or user.is_superuser

        if not is_manager:
            # Check if user is HOD: filter to own department
            user_dept = None
            if hasattr(user, 'staff_profile') and user.staff_profile:
                user_dept = user.staff_profile.department

            # Approvers can see submissions targeting their step or node
            assigned_nodes = user.pbas_approver_nodes.all()
            q_filter = Q(node__in=assigned_nodes)

            if 'HOD' in user_roles and user_dept:
                q_filter |= Q(current_step='HOD', user__staff_profile__department=user_dept)
                q_filter |= Q(current_step='HOD', user__student_profile__home_department=user_dept)

            if 'PRINCIPAL' in user_roles:
                q_filter |= Q(current_step='PRINCIPAL')

            if 'PBAS_APPROVER' in user_roles:
                q_filter |= Q(current_step='PBAS_APPROVER')

            if tab == 'pending':
                qs = qs.filter(q_filter)

        if tab in ['pending', 'approved', 'rejected']:
            qs = qs.filter(status=tab)

        items = [_build_approval_item(s) for s in qs[:200]]
        return Response(items)

class PBASSubmissionActionView(APIView):
    permission_classes = [IsApprover]

    def post(self, request, submission_id: str):
        try:
            sub = PBASSubmission.objects.select_related('node', 'user').get(id=submission_id)
        except PBASSubmission.DoesNotExist:
            return Response({'error': 'Submission not found'}, status=404)

        action = request.data.get('action')
        reason = request.data.get('reason', '').strip()
        user = request.user

        if action not in ['approve', 'reject']:
            return Response({'error': 'Invalid action. Must be approve or reject.'}, status=400)

        history = sub.approval_history or []
        now_iso = timezone.now().isoformat()

        if action == 'reject':
            sub.status = PBASSubmission.Status.REJECTED
            sub.rejection_reason = reason or 'Rejected by approver'
            sub.reviewed_at = timezone.now()
            history.append({
                'step': sub.current_step or 'Review',
                'action': 'rejected',
                'by_user_id': user.id,
                'by_name': user.get_full_name() or user.username,
                'timestamp': now_iso,
                'remarks': reason,
            })
            sub.approval_history = history
            sub.save()
            return Response({'message': 'Submission rejected', 'status': sub.status})

        if action == 'approve':
            flow = _ensure_default_approval_flow()
            is_student = hasattr(sub.user, 'student_profile') and sub.user.student_profile is not None
            steps = flow.student_flow if is_student else flow.staff_flow

            # Check if there is a next step
            current_step = sub.current_step
            next_step = None
            if current_step in steps:
                curr_idx = steps.index(current_step)
                if curr_idx + 1 < len(steps):
                    next_step = steps[curr_idx + 1]

            history.append({
                'step': current_step or 'Review',
                'action': 'approved',
                'by_user_id': user.id,
                'by_name': user.get_full_name() or user.username,
                'timestamp': now_iso,
                'remarks': reason or 'Approved',
            })
            sub.approval_history = history

            if next_step:
                sub.current_step = next_step
                sub.save()
                return Response({'message': f'Approved and forwarded to {next_step}', 'status': sub.status, 'current_step': next_step})
            else:
                # Final approval
                sub.status = PBASSubmission.Status.APPROVED
                sub.current_step = 'Completed'
                sub.approved_by = user
                sub.reviewed_at = timezone.now()
                sub.save()

                # Add credits to applicant
                credit = sub.node.pbas_credit or 0
                if credit > 0:
                    if hasattr(sub.user, 'staff_profile') and sub.user.staff_profile:
                        sp = sub.user.staff_profile
                        sp.pbas_credit += credit
                        # also update category credit based on parent path
                        path_str = (sub.node.parent.label if sub.node.parent else '').lower()
                        if 'academic' in path_str:
                            sp.pbas_academics_credit += credit
                        elif 'student' in path_str:
                            sp.pbas_student_development_credit += credit
                        elif 'research' in path_str or 'development' in path_str:
                            sp.pbas_research_development_credit += credit
                        elif 'institution' in path_str or 'contribution' in path_str:
                            sp.pbas_institutional_contribution_credit += credit
                        sp.save()
                    elif hasattr(sub.user, 'student_profile') and sub.user.student_profile:
                        stu = sub.user.student_profile
                        stu.pbas_credit += credit
                        stu.save()

                return Response({'message': 'Submission fully approved!', 'status': sub.status, 'credit_awarded': credit})

class PBASSubmissionDocumentView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, submission_id: str):
        try:
            sub = PBASSubmission.objects.get(id=submission_id)
        except PBASSubmission.DoesNotExist:
            raise Http404('Document not found')

        if not sub.file:
            raise Http404('No file attached to this submission')

        return FileResponse(sub.file.open('rb'), content_type='application/octet-stream')

class PBASDurationViewSet(viewsets.ModelViewSet):
    queryset = PBASDuration.objects.all().order_by('-start_date')
    serializer_class = PBASDurationSerializer
    permission_classes = [IsAuthenticated]

class PBASSubmissionLogsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PBASSubmission.objects.all().select_related('node', 'user').order_by('-created_at')
        logs = []
        for s in qs[:100]:
            category = 'General'
            if s.node and s.node.parent:
                category = s.node.parent.label
            logs.append({
                'id': str(s.id),
                'leaf_title': s.node.label if s.node else '',
                'category': category,
                'user_name': s.user.get_full_name() or s.user.username,
                'status': s.status,
                'pbas_credit': s.node.pbas_credit if (s.node and s.node.pbas_credit is not None) else 0,
                'created_at': s.created_at.isoformat() if s.created_at else None,
                'reviewed_at': s.reviewed_at.isoformat() if s.reviewed_at else None,
                'approved_by': s.approved_by.get_full_name() if s.approved_by else None,
            })
        return Response({'results': logs, 'count': len(logs)})

class PBASUserActivityListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        staffs = StaffProfile.objects.all().select_related('user', 'department').order_by('-pbas_credit')
        results = []
        for sp in staffs:
            sub_count = PBASSubmission.objects.filter(user=sp.user).count()
            approved_count = PBASSubmission.objects.filter(user=sp.user, status='approved').count()
            results.append({
                'user_id': sp.user.id,
                'name': sp.user.get_full_name() or sp.user.username,
                'email': sp.user.email,
                'staff_id': sp.staff_id,
                'department_name': sp.department.name if sp.department else 'N/A',
                'designation': sp.designation,
                'total_credit': sp.pbas_credit,
                'academics_credit': sp.pbas_academics_credit,
                'student_dev_credit': sp.pbas_student_development_credit,
                'rd_credit': sp.pbas_research_development_credit,
                'inst_credit': sp.pbas_institutional_contribution_credit,
                'submissions_count': sub_count,
                'approved_count': approved_count,
            })
        return Response({'results': results})

class PBASUserActivityDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id: int):
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=404)

        subs = PBASSubmission.objects.filter(user=target_user).select_related('node').order_by('-created_at')
        sub_list = [_build_approval_item(s) for s in subs]
        return Response({
            'user_id': target_user.id,
            'name': target_user.get_full_name() or target_user.username,
            'email': target_user.email,
            'submissions': sub_list,
        })

class PBASNodeApproversView(APIView):
    permission_classes = [IsIQACManager]

    def get(self, request, node_id: str):
        try:
            node = PBASNode.objects.get(id=node_id)
        except PBASNode.DoesNotExist:
            return Response({'error': 'Node not found'}, status=404)
        approvers = [
            {'id': u.id, 'username': u.username, 'name': u.get_full_name() or u.username}
            for u in node.approvers.all()
        ]
        return Response(approvers)

    def post(self, request, node_id: str):
        try:
            node = PBASNode.objects.get(id=node_id)
        except PBASNode.DoesNotExist:
            return Response({'error': 'Node not found'}, status=404)

        user_ids = request.data.get('user_ids', [])
        users = User.objects.filter(id__in=user_ids)
        node.approvers.set(users)
        return Response({'message': 'Node approvers updated successfully'})

class PBASStaffListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        staffs = StaffProfile.objects.all().select_related('user', 'department')
        data = [
            {
                'user_id': s.user.id,
                'name': s.user.get_full_name() or s.user.username,
                'username': s.user.username,
                'staff_id': s.staff_id,
                'department_name': s.department.name if s.department else '',
            }
            for s in staffs
        ]
        return Response(data)

class PBASMenteesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        mentees = []
        if hasattr(user, 'staff_profile') and user.staff_profile:
            mappings = StudentMentorMap.objects.filter(mentor=user.staff_profile, is_active=True).select_related('student__user')
            mentees = [
                {
                    'id': m.student.id,
                    'reg_no': m.student.reg_no,
                    'name': m.student.user.get_full_name() or m.student.user.username,
                }
                for m in mappings
            ]
        return Response(mentees)
