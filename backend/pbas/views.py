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

from academics.models import Department as AcademicDepartment
from academics.models import StaffProfile, StudentMentorMap
from college.models import College

from .models import PBASCustomDepartment, PBASNode, PBASSubmission, PBASVerificationTicket
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
        for n in ['IQAC', 'ADMIN', 'PRINCIPAL', 'PS']:
            if user.roles.filter(name__iexact=n).exists():
                return True
        return False
    except Exception:
        return False


def _filter_departments_for_user(qs, user, viewer: str):
    # IQAC managers should see all departments for management.
    if _is_iqac_manager(user):
        return qs

    # Submission users should only see departments explicitly saved/configured.
    return qs.filter(show_in_submission=True)


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


class PBASCustomDepartmentTreeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, dept_id):
        dept = PBASCustomDepartment.objects.filter(pk=dept_id).first()
        if not dept:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Only IQAC managers can see full tree; others must use /nodes/
        if not _is_iqac_manager(request.user):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

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

        dept = PBASCustomDepartment.objects.filter(pk=dept_id).first()
        if not dept:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

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
        dept = PBASCustomDepartment.objects.filter(pk=dept_id).first()
        if not dept:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

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

