from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import CreateAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone

from django.contrib.auth import get_user_model
from accounts.models import Role
from academics.models import Department as AcademicDepartment
from academics.models import StaffProfile, StudentProfile, StudentMentorMap
from college.models import College

User = get_user_model()

from .models import PBASCustomDepartment, PBASNode, PBASSubmission, PBASVerificationTicket, PBASNodeApproverHistory
from .permissions import IsIQACManager, IsAuthenticatedSubmitter
from .serializers import (
    CollegeSerializer,
    PBASCustomDepartmentSerializer,
    PBASNodeTreeSerializer,
    PBASSubmissionSerializer,
)
from .utils import (
    allowed_audiences_for_viewer,
    resolve_viewer_from_user,
    user_student_reg_no,
    user_staff_id,
)


def _staff_public_dict(sp: StaffProfile | None) -> dict:
    if not sp:
        return {}
    u = getattr(sp, 'user', None)
    return {
        'id': sp.id,
        'staff_id': getattr(sp, 'staff_id', None),
        'username': getattr(u, 'username', None),
        'email': getattr(u, 'email', None),
    }


def _student_public_dict(user) -> dict:
    sp = getattr(user, 'student_profile', None)
    return {
        'id': getattr(sp, 'id', None),
        'reg_no': getattr(sp, 'reg_no', None),
        'username': getattr(user, 'username', None),
        'email': getattr(user, 'email', None),
    }


def _resolve_department_access_staffs(dept: PBASCustomDepartment) -> list[dict]:
    out: list[dict] = []
    accesses = dept.accesses or []
    seen = set()
    for token in accesses:
        t = str(token).strip()
        if not t or t in seen:
            continue
        seen.add(t)
        sp = StaffProfile.objects.filter(staff_id=t).select_related('user').first()
        if sp:
            out.append(_staff_public_dict(sp))
        else:
            out.append({'staff_id': t})
    return out


def _can_view_submission_report(user, submission: PBASSubmission) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    if submission.user_id == user.id:
        return True
    if _is_iqac_manager(user):
        return True

    # Mentor can view if mapped to student (active)
    try:
        staff = getattr(user, 'staff_profile', None)
        student = getattr(submission.user, 'student_profile', None)
        if staff and student:
            if StudentMentorMap.objects.filter(student=student, mentor=staff, is_active=True).exists():
                return True
    except Exception:
        pass

    # Department access staff can view
    try:
        sid = user_staff_id(user)
        if sid:
            if (
                PBASCustomDepartment.objects.filter(id=submission.node.department_id)
                .filter(Q(accesses=[]) | Q(accesses__isnull=True) | Q(accesses__contains=[sid]))
                .exists()
            ):
                return True
    except Exception:
        pass

    return False


def _build_submission_report(submission: PBASSubmission, request) -> dict:
    node = submission.node
    dept = node.department
    college = submission.college

    file_url = None
    try:
        if submission.file:
            file_url = submission.file.url
    except Exception:
        file_url = None

    ticket = getattr(submission, 'verification_ticket', None)

    mentor_dict = {}
    try:
        if getattr(submission.user, 'student_profile', None) is not None:
            m = StudentMentorMap.objects.filter(student=submission.user.student_profile, is_active=True).select_related('mentor__user').first()
            if m and m.mentor:
                mentor_dict = _staff_public_dict(m.mentor)
    except Exception:
        mentor_dict = {}

    return {
        'submission': {
            'id': str(submission.id),
            'created_at': submission.created_at,
            'submission_type': submission.submission_type,
            'link': submission.link,
            'file_url': file_url,
            'file_name': submission.file_name,
            'college': {
                'id': college.id,
                'code': getattr(college, 'code', None),
                'name': getattr(college, 'name', None),
            }
            if college
            else None,
            'node': {
                'id': str(node.id),
                'label': node.label,
                'input_mode': node.input_mode,
            },
        },
        'department': {
            'id': str(dept.id),
            'title': dept.title,
            'department_id': getattr(dept.academic_department, 'id', None),
            'department_code': getattr(dept.academic_department, 'code', None),
            'department_short_name': getattr(dept.academic_department, 'short_name', None),
            'department_name': getattr(dept.academic_department, 'name', None),
            'accesses': dept.accesses or [],
            'access_staffs': _resolve_department_access_staffs(dept),
        },
        'student': _student_public_dict(submission.user),
        'mentor': mentor_dict,
        'ticket': {
            'id': str(ticket.id),
            'status': ticket.status,
        }
        if ticket
        else None,
    }


class PBASSubmissionReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, submission_id):
        submission = (
            PBASSubmission.objects.filter(pk=submission_id)
            .select_related('user', 'user__student_profile', 'node', 'node__department', 'node__department__academic_department', 'college')
            .first()
        )
        if not submission:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not _can_view_submission_report(request.user, submission):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(_build_submission_report(submission, request))


class PBASVerifierTicketsMyListView(ListAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        staff = getattr(request.user, 'staff_profile', None)
        if not staff:
            return Response({'results': []})
        qs = (
            PBASVerificationTicket.objects.filter(mentor=staff)
            .select_related(
                'submission',
                'submission__user',
                'submission__user__student_profile',
                'submission__node',
                'submission__node__department',
                'submission__node__department__academic_department',
                'submission__college',
                'student',
                'mentor',
            )
            .order_by('-created_at')
        )

        # Only show ones that have been forwarded to mentor or beyond
        qs = qs.exclude(status=PBASVerificationTicket.Status.DRAFT)

        results = []
        for t in qs[:200]:
            results.append(
                {
                    'id': str(t.id),
                    'status': t.status,
                    'created_at': t.created_at,
                    'report': _build_submission_report(t.submission, request),
                }
            )
        return Response({'results': results})


class PBASVerifierTicketForwardToMentorView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_id):
        t = (
            PBASVerificationTicket.objects.filter(pk=ticket_id)
            .select_related('submission', 'submission__user', 'student', 'mentor', 'department', 'submission__node')
            .first()
        )
        if not t:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if t.submission.user_id != request.user.id:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        if t.status != PBASVerificationTicket.Status.DRAFT:
            return Response({'detail': 'Already forwarded.'}, status=status.HTTP_400_BAD_REQUEST)

        t.status = PBASVerificationTicket.Status.MENTOR_PENDING
        t.forwarded_to_mentor_at = timezone.now()
        t.save(update_fields=['status', 'forwarded_to_mentor_at', 'updated_at'])
        return Response({'id': str(t.id), 'status': t.status})


class PBASVerifierTicketForwardToDepartmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_id):
        t = (
            PBASVerificationTicket.objects.filter(pk=ticket_id)
            .select_related('mentor', 'mentor__user', 'submission', 'submission__user', 'submission__node')
            .first()
        )
        if not t:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        staff = getattr(request.user, 'staff_profile', None)
        if not staff or staff.id != t.mentor_id:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        if t.status != PBASVerificationTicket.Status.MENTOR_PENDING:
            return Response({'detail': 'Invalid state.'}, status=status.HTTP_400_BAD_REQUEST)

        t.status = PBASVerificationTicket.Status.DEPT_PENDING
        t.forwarded_to_department_at = timezone.now()
        t.save(update_fields=['status', 'forwarded_to_department_at', 'updated_at'])
        return Response({'id': str(t.id), 'status': t.status})


def _viewer_or_403(request, viewer_param: str | None) -> str:
    derived = resolve_viewer_from_user(request.user)
    viewer = (viewer_param or derived or '').strip().lower()

    if viewer not in ('faculty', 'student'):
        return derived or 'faculty'

    # If viewer is explicitly passed and mismatches authenticated profile,
    # prefer the derived profile to avoid returning empty data due to
    # frontend route/query mismatch.
    if derived and viewer != derived:
        return derived

    return viewer


def _is_iqac_manager(user) -> bool:
    try:
        if getattr(user, 'is_superuser', False):
            return True
        # Be case-insensitive to match permissions.IsIQACManager behavior
        for n in ['IQAC', 'ADMIN', 'PRINCIPAL', 'PS', 'PBAS_ADMIN', 'PBAS_MANAGER', 'PBASADMIN']:
            if user.roles.filter(name__iexact=n).exists():
                return True
        return False
    except Exception:
        return False


def _filter_departments_for_user(qs, user, viewer: str):
    # IQAC managers should see all departments for management.
    if _is_iqac_manager(user):
        return qs

    # Submission users should see departments explicitly saved/configured or having nodes.
    return qs.filter(Q(show_in_submission=True) | Q(nodes__isnull=False)).distinct()


def _dept_title_from_academics(dept: AcademicDepartment) -> str:
    code = (dept.code or '').strip()
    short = (dept.short_name or '').strip()
    name = (dept.name or '').strip()
    left = short or code or name
    if left and name and left != name:
        title = f"{left} - {name}"
    else:
        title = left or name or code or 'Department'

    # PBASCustomDepartment.title is max_length=255; avoid sync failures.
    if title and len(title) > 255:
        return title[:255]
    return title


def _ensure_pbas_departments_from_academics():
    """Best-effort sync: ensure there is a PBASCustomDepartment row for each
    Academics Department. Safe to call on every list request (uses set/bulk create).
    """
    try:
        existing_ids = set(
            PBASCustomDepartment.objects.filter(academic_department__isnull=False).values_list(
                'academic_department_id', flat=True
            )
        )
        missing = AcademicDepartment.objects.exclude(id__in=existing_ids).only('id', 'code', 'short_name', 'name')
        to_create = [
            PBASCustomDepartment(
                title=_dept_title_from_academics(d),
                academic_department=d,
                accesses=[],
                show_in_submission=False,
            )
            for d in missing
        ]
        if to_create:
            PBASCustomDepartment.objects.bulk_create(to_create, ignore_conflicts=True)
    except Exception:
        # Never break list calls if sync fails.
        return


class PBASCustomDepartmentViewSet(viewsets.ModelViewSet):
    queryset = PBASCustomDepartment.objects.all()
    serializer_class = PBASCustomDepartmentSerializer
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_permissions(self):
        if self.action in ('create', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsIQACManager()]
        return [IsAuthenticated()]

    def get_queryset(self):
        req = self.request
        viewer = None
        try:
            viewer = _viewer_or_403(req, req.query_params.get('viewer'))
        except PermissionError:
            return PBASCustomDepartment.objects.none()

        # Best-effort: keep PBAS departments in sync with the Academics department master.
        # Do this only for list calls, and never hide custom departments.
        if getattr(self, 'action', None) == 'list':
            _ensure_pbas_departments_from_academics()

        qs = PBASCustomDepartment.objects.all().select_related('academic_department')
        qs = _filter_departments_for_user(qs, req.user, viewer)

        # Do not hide departments just because they currently have no visible nodes.
        # Node visibility is enforced by the /nodes/ endpoint.
        qs = qs.distinct()
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, show_in_submission=True)

    def perform_update(self, serializer):
        # When manager clicks Save on department metadata, publish it to submission list.
        serializer.save(show_in_submission=True)


def _get_or_create_master_dept() -> PBASCustomDepartment:
    dept = PBASCustomDepartment.objects.filter(title='PBAS Master Tree').first()
    if not dept:
        dept = PBASCustomDepartment.objects.create(title='PBAS Master Tree', show_in_submission=True)
    elif not dept.show_in_submission:
        dept.show_in_submission = True
        dept.save(update_fields=['show_in_submission'])
    return dept


class PBASCustomDepartmentTreeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, dept_id):
        if str(dept_id).lower() in ('master', 'default'):
            dept = _get_or_create_master_dept()
        else:
            dept = PBASCustomDepartment.objects.filter(pk=dept_id).first() or _get_or_create_master_dept()

        roots = PBASNode.objects.filter(department=dept, parent__isnull=True).order_by('position', 'created_at')
        data = {
            'id': str(dept.id),
            'title': dept.title,
            'nodes': PBASNodeTreeSerializer(roots, many=True).data,
        }
        return Response(data)

    def put(self, request, dept_id):
        if not _is_iqac_manager(request.user):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        if str(dept_id).lower() in ('master', 'default'):
            dept = _get_or_create_master_dept()
        else:
            dept = PBASCustomDepartment.objects.filter(pk=dept_id).first() or _get_or_create_master_dept()

        payload = request.data
        nodes_payload = payload.get('nodes') if isinstance(payload, dict) else payload
        if not isinstance(nodes_payload, list):
            return Response({'detail': 'Expected a list of root nodes or {nodes: [...]}.'}, status=status.HTTP_400_BAD_REQUEST)

        def create_nodes(items, parent=None):
            for idx, raw in enumerate(items):
                if not isinstance(raw, dict):
                    continue
                children = raw.get('children') or []

                node = PBASNode.objects.create(
                    department=dept,
                    parent=parent,
                    label=raw.get('label') or '',
                    audience=(raw.get('audience') or 'both'),
                    input_mode=(raw.get('input_mode') or 'upload'),
                    link=raw.get('link') or None,
                    uploaded_name=raw.get('uploaded_name') or None,
                    limit=raw.get('limit') if raw.get('limit') not in ('', None) else None,
                    pbas_credit=raw.get('pbas_credit') if raw.get('pbas_credit') not in ('', None) else None,
                    college_required=bool(raw.get('college_required') or False),
                    position=int(raw.get('position') if raw.get('position') not in (None, '') else idx),
                )
                if isinstance(children, list) and children:
                    create_nodes(children, parent=node)

        with transaction.atomic():
            PBASNode.objects.filter(department=dept).delete()
            create_nodes(nodes_payload, parent=None)
            if not dept.show_in_submission:
                dept.show_in_submission = True
                dept.save(update_fields=['show_in_submission'])

        roots = PBASNode.objects.filter(department=dept, parent__isnull=True).order_by('position', 'created_at')
        return Response({'nodes': PBASNodeTreeSerializer(roots, many=True).data})


class PBASCustomDepartmentNodesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, dept_id):
        if str(dept_id).lower() in ('master', 'default'):
            dept = _get_or_create_master_dept()
        else:
            dept = PBASCustomDepartment.objects.filter(pk=dept_id).first() or _get_or_create_master_dept()

        try:
            viewer = _viewer_or_403(request, request.query_params.get('viewer'))
        except PermissionError:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        # department-level access filter
        visible = _filter_departments_for_user(PBASCustomDepartment.objects.filter(pk=dept.pk), request.user, viewer).exists()
        if not visible:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        allowed = allowed_audiences_for_viewer(viewer)
        roots = PBASNode.objects.filter(department=dept, parent__isnull=True, audience__in=allowed).order_by('position', 'created_at')
        return Response({'nodes': PBASNodeTreeSerializer(roots, many=True, context={'audience_filter': allowed}).data})


class PBASCollegeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CollegeSerializer
    queryset = College.objects.all().order_by('code')


class PBASSubmissionCreateView(CreateAPIView):
    permission_classes = [IsAuthenticatedSubmitter]
    serializer_class = PBASSubmissionSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        node = serializer.validated_data.get('node')
        request = self.request

        # Validate dept visibility for current user
        viewer = resolve_viewer_from_user(request.user) or 'faculty'
        dept_qs = PBASCustomDepartment.objects.filter(pk=node.department_id)
        if not _filter_departments_for_user(dept_qs, request.user, viewer).exists():
            raise PermissionError('forbidden')

        # Validate node audience for viewer
        allowed = allowed_audiences_for_viewer(viewer)
        if node.audience not in allowed:
            raise PermissionError('forbidden')

        submission = serializer.save(user=request.user)

        # For student submissions, prepare a verification ticket (draft) addressed to their active mentor.
        try:
            student_profile = getattr(request.user, 'student_profile', None)
            if student_profile is not None:
                mapping = (
                    StudentMentorMap.objects.filter(student=student_profile, is_active=True)
                    .select_related('mentor')
                    .first()
                )
                if mapping and mapping.mentor:
                    PBASVerificationTicket.objects.get_or_create(
                        submission=submission,
                        defaults={
                            'student': student_profile,
                            'mentor': mapping.mentor,
                            'department': node.department,
                            'status': PBASVerificationTicket.Status.DRAFT,
                        },
                    )
        except Exception:
            pass

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except PermissionError:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)


class PBASSubmissionMineView(ListAPIView):
    permission_classes = [IsAuthenticatedSubmitter]
    serializer_class = PBASSubmissionSerializer

    def get_queryset(self):
        return PBASSubmission.objects.filter(user=self.request.user).select_related('node', 'college').order_by('-created_at')


class PBASStaffListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        dept_id = request.query_params.get('department')

        qs = StaffProfile.objects.select_related('user', 'department')
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__username__icontains=search)
                | Q(staff_id__icontains=search)
            )

        items = []
        for sp in qs[:100]:
            u = sp.user
            full_name = u.get_full_name().strip() or u.username
            dept_name = sp.department.name if sp.department else 'N/A'
            img_url = sp.profile_image.url if sp.profile_image else None
            items.append({
                'user_id': u.id,
                'name': full_name,
                'username': u.username,
                'staff_id': sp.staff_id,
                'department_name': dept_name,
                'profile_image': img_url,
            })
        return Response({'staff': items})


class PBASNodeApproversView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, node_id):
        node = PBASNode.objects.filter(pk=node_id).first()
        if not node:
            return Response({'detail': 'Node not found.'}, status=status.HTTP_404_NOT_FOUND)

        approvers = [
            {
                'id': u.id,
                'name': u.get_full_name() or u.username,
                'username': u.username,
            }
            for u in node.approvers.all()
        ]

        # Return recent approver history as audit trail
        history_qs = node.approver_history.select_related('user', 'changed_by').all()[:200]
        history = []
        for h in history_qs:
            history.append(
                {
                    'id': h.id,
                    'user_id': h.user.id,
                    'user_name': h.user.get_full_name() or h.user.username,
                    'user_username': h.user.username,
                    'action': h.action,
                    'changed_by_id': h.changed_by.id if h.changed_by else None,
                    'changed_by_name': h.changed_by.get_full_name() if h.changed_by else None,
                    'timestamp': h.timestamp.isoformat() if h.timestamp else None,
                }
            )

        return Response({'approvers': approvers, 'history': history})

    def post(self, request, node_id):
        if not _is_iqac_manager(request.user):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        node = PBASNode.objects.filter(pk=node_id).first()
        if not node:
            return Response({'detail': 'Node not found.'}, status=status.HTTP_404_NOT_FOUND)

        approver_ids = request.data.get('approver_ids') or []
        if not isinstance(approver_ids, list):
            return Response({'detail': 'Expected approver_ids array.'}, status=status.HTTP_400_BAD_REQUEST)

        # Compute diffs so we can record history
        prev_ids = set(node.approvers.values_list('id', flat=True))
        new_ids = set([int(x) for x in approver_ids if x is not None])

        users = User.objects.filter(pk__in=new_ids)
        node.approvers.set(users)

        # Auto-assign PBAS_APPROVER role to all assigned users
        role, _ = Role.objects.get_or_create(name='PBAS_APPROVER', defaults={'description': 'PBAS Submissions Approver'})
        for u in users:
            u.roles.add(role)

        # Record history entries for added and removed users
        added = new_ids - prev_ids
        removed = prev_ids - new_ids
        history_objs = []
        for uid in added:
            try:
                u = User.objects.get(pk=uid)
                history_objs.append(
                    PBASNodeApproverHistory(node=node, user=u, action=PBASNodeApproverHistory.Action.ASSIGNED, changed_by=request.user)
                )
            except User.DoesNotExist:
                continue
        for uid in removed:
            try:
                u = User.objects.get(pk=uid)
                history_objs.append(
                    PBASNodeApproverHistory(node=node, user=u, action=PBASNodeApproverHistory.Action.REMOVED, changed_by=request.user)
                )
            except User.DoesNotExist:
                continue

        if history_objs:
            PBASNodeApproverHistory.objects.bulk_create(history_objs)

        approvers = [
            {
                'id': u.id,
                'name': u.get_full_name() or u.username,
                'username': u.username,
            }
            for u in node.approvers.all()
        ]
        return Response({'status': 'ok', 'approvers': approvers})


def _get_node_parent_path(node: PBASNode) -> str:
    parts = []
    curr = node.parent
    while curr:
        parts.append(curr.label)
        curr = curr.parent
    parts.reverse()
    return ' > '.join(parts) if parts else 'Root Category'


def _get_user_accessible_submissions(user, status_filter='pending'):
    is_manager = _is_iqac_manager(user)

    if is_manager:
        qs = PBASSubmission.objects.all()
    else:
        # Find all nodes where user is assigned as approver directly or on parent/ancestors
        nodes_with_user_approver = list(PBASNode.objects.filter(approvers=user))
        if not nodes_with_user_approver:
            return PBASSubmission.objects.none()

        def get_all_descendants_ids(node):
            ids = [node.id]
            for child in node.children.all():
                ids.extend(get_all_descendants_ids(child))
            return ids

        all_accessible_node_ids = set()
        for n in nodes_with_user_approver:
            all_accessible_node_ids.update(get_all_descendants_ids(n))

        qs = PBASSubmission.objects.filter(node_id__in=all_accessible_node_ids)

    if status_filter and status_filter != 'all':
        qs = qs.filter(status=status_filter)

    return qs.select_related('node', 'user', 'college', 'approved_by').order_by('-created_at')


class PBASApprovalsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_param = (request.query_params.get('status') or 'pending').lower()
        submissions = _get_user_accessible_submissions(request.user, status_param)

        items = []
        for sub in submissions:
            u = sub.user
            full_name = u.get_full_name().strip() or u.username
            reg_or_staff = user_student_reg_no(u) or user_staff_id(u) or u.username

            # Get user avatar
            profile_img = None
            sp = getattr(u, 'staff_profile', None)
            stp = getattr(u, 'student_profile', None)
            if sp and sp.profile_image:
                profile_img = request.build_absolute_uri(sp.profile_image.url)
            elif stp and stp.profile_image:
                profile_img = request.build_absolute_uri(stp.profile_image.url)

            file_url = request.build_absolute_uri(sub.file.url) if sub.file else None

            items.append({
                'id': str(sub.id),
                'user': {
                    'id': u.id,
                    'name': full_name,
                    'reg_or_staff_id': reg_or_staff,
                    'username': u.username,
                    'profile_image': profile_img,
                },
                'leaf_title': sub.node.label,
                'parent_path': _get_node_parent_path(sub.node),
                'submission_type': sub.submission_type,
                'link': sub.link,
                'file_url': file_url,
                'file_name': sub.file_name or (sub.file.name if sub.file else None),
                'pbas_credit': sub.node.pbas_credit if sub.node.pbas_credit is not None else 0,
                'status': sub.status,
                'created_at': sub.created_at.isoformat() if sub.created_at else None,
                'reviewed_at': sub.reviewed_at.isoformat() if sub.reviewed_at else None,
                'approved_by_name': sub.approved_by.get_full_name() if sub.approved_by else None,
                'rejection_reason': sub.rejection_reason,
            })

        return Response({'submissions': items})


class PBASSubmissionActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, submission_id):
        sub = PBASSubmission.objects.filter(pk=submission_id).select_related('node', 'user').first()
        if not sub:
            return Response({'detail': 'Submission not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Check authorization over this submission
        is_manager = _is_iqac_manager(request.user)
        if not is_manager:
            accessible_ids = set()
            approver_nodes = list(PBASNode.objects.filter(approvers=request.user))
            def get_all_descendants(node):
                ids = [node.id]
                for child in node.children.all():
                    ids.extend(get_all_descendants(child))
                return ids
            for n in approver_nodes:
                accessible_ids.update(get_all_descendants(n))

            if sub.node.id not in accessible_ids:
                return Response({'detail': 'You are not an authorized approver for this submission.'}, status=status.HTTP_403_FORBIDDEN)

        action = (request.data.get('action') or '').lower()
        reason = (request.data.get('reason') or '').strip()

        if action not in ('approve', 'reject'):
            return Response({'detail': 'Action must be "approve" or "reject".'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            if action == 'approve':
                sub.status = PBASSubmission.Status.APPROVED
                sub.approved_by = request.user
                sub.reviewed_at = timezone.now()
                sub.save()

                # Accumulate PBAS Credit to StaffProfile or StudentProfile
                credit_points = sub.node.pbas_credit or 0
                if credit_points > 0:
                    submitter = sub.user
                    sp = getattr(submitter, 'staff_profile', None)
                    stp = getattr(submitter, 'student_profile', None)

                    if sp:
                        sp.pbas_credit = (sp.pbas_credit or 0) + credit_points
                        sp.save(update_fields=['pbas_credit'])
                    elif stp:
                        stp.pbas_credit = (stp.pbas_credit or 0) + credit_points
                        stp.save(update_fields=['pbas_credit'])

            elif action == 'reject':
                sub.status = PBASSubmission.Status.REJECTED
                sub.approved_by = request.user
                sub.reviewed_at = timezone.now()
                sub.rejection_reason = reason
                sub.save()

        return Response({
            'status': sub.status,
            'detail': f'Submission successfully {sub.status}.',
        })


