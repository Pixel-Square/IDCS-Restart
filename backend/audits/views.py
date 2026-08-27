import logging

from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import Department, StaffProfile

from .models import AuditATR, AuditCycle, AuditDepartmentAssignment, AuditQuestion, AuditQuestionSet, AuditRubric, AuditScore
from .permissions import IsIQACOrSuperuser
from .serializers import (
    AuditAssignmentSerializer,
    AuditCycleSerializer,
    AuditQuestionSerializer,
    AuditQuestionSetSerializer,
    AuditRubricSerializer,
)
from .services import (
    build_question_rows,
    can_manage_assignments,
    can_view_assignment,
    get_assignment_questions,
    get_assignment_totals,
    get_atr_required_scores,
    get_user_department_ids,
    get_user_staff_profile,
    user_is_auditor_for_assignment,
    user_is_hod_for_assignment,
    user_is_iqac,
    validate_password,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Departments & staff lookups (faculty data from staff roll)
# ─────────────────────────────────────────────────────────────────────────────


class AuditDepartmentsView(APIView):
    """Departments available for audit assignment (teaching departments)."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        if user_is_iqac(user):
            qs = Department.objects.filter(parent__isnull=True, is_teaching=True)
        else:
            ids = get_user_department_ids(user)
            qs = Department.objects.filter(id__in=ids, is_teaching=True) if ids else Department.objects.none()

        results = [
            {'id': d.id, 'code': d.code, 'name': d.name, 'short_name': d.short_name}
            for d in qs.order_by('code')
        ]
        return Response({'results': results})


class AuditStaffView(APIView):
    """Faculty list from staff roll. Optional filters: ?staff_id=, ?department_id=, ?q=."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        qs = StaffProfile.objects.filter(status='ACTIVE').select_related('user', 'department')

        staff_id = request.query_params.get('staff_id')
        if staff_id:
            qs = qs.filter(staff_id__iexact=str(staff_id).strip())

        department_id = request.query_params.get('department_id')
        if department_id:
            try:
                qs = qs.filter(Q(department_id=int(department_id)) |
                               Q(department_assignments__department_id=int(department_id),
                                 department_assignments__end_date__isnull=True)).distinct()
            except (TypeError, ValueError):
                pass

        q = request.query_params.get('q')
        if q:
            q = str(q).strip()
            qs = qs.filter(Q(user__first_name__icontains=q) |
                           Q(user__last_name__icontains=q) |
                           Q(user__username__icontains=q) |
                           Q(staff_id__icontains=q))

        # Limit result size for safety
        qs = qs.order_by('user__first_name', 'user__last_name')[:500]

        results = []
        for s in qs:
            full_name = ''
            username = ''
            if s.user:
                full_name = f'{s.user.first_name} {s.user.last_name}'.strip() or s.user.username
                username = s.user.username
            dept = None
            if s.department:
                dept = {
                    'id': s.department.id,
                    'code': s.department.code,
                    'name': s.department.name,
                    'short_name': s.department.short_name,
                }
            results.append({
                'id': s.id,
                'staff_id': s.staff_id,
                'name': full_name or s.staff_id,
                'username': username,
                'designation': s.designation or '',
                'department': dept,
            })
        return Response({'results': results})


# ─────────────────────────────────────────────────────────────────────────────
# Questions
# ─────────────────────────────────────────────────────────────────────────────


class AuditQuestionListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        qs = AuditQuestion.objects.filter(is_active=True).order_by('sl_no')
        data = AuditQuestionSerializer(qs, many=True).data
        return Response({'results': data})

    def post(self, request):
        """Create a new audit question (IQAC only)."""
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can create audit questions.'},
                            status=status.HTTP_403_FORBIDDEN)
        serializer = AuditQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.save()
        return Response(AuditQuestionSerializer(question).data, status=status.HTTP_201_CREATED)


class AuditQuestionDetailView(APIView):
    """View, update or deactivate a single audit question (IQAC only)."""
    permission_classes = (IsAuthenticated,)

    def _get_question(self, request, pk):
        question = get_object_or_404(AuditQuestion, pk=pk)
        if not can_manage_assignments(request.user):
            raise PermissionDenied('Only IQAC can manage audit questions.')
        return question

    def get(self, request, pk):
        question = self._get_question(request, pk)
        return Response(AuditQuestionSerializer(question).data)

    def patch(self, request, pk):
        question = self._get_question(request, pk)
        serializer = AuditQuestionSerializer(question, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        q = serializer.save()
        return Response(AuditQuestionSerializer(q).data)

    def delete(self, request, pk):
        """Soft-delete: hide the question from all active lists (scores/ATRs kept)."""
        question = self._get_question(request, pk)
        err = validate_password(request.user, request.data.get('password'))
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)
        question.is_active = False
        question.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuditQuestionImportView(APIView):
    """Import audit questions from the Cycle Audit Excel workbook (IQAC only)."""
    permission_classes = (IsAuthenticated, IsIQACOrSuperuser)

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'Please upload an Excel (.xlsx) file.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            import openpyxl
        except ImportError:
            return Response({'detail': 'openpyxl is not installed.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            wb = openpyxl.load_workbook(file_obj, data_only=True)
        except Exception as exc:
            return Response({'detail': f'Could not read workbook: {exc}'},
                            status=status.HTTP_400_BAD_REQUEST)

        imported = 0
        skipped = 0
        errors = []
        for ws in wb.worksheets:
            for row in ws.iter_rows(min_row=2, values_only=True):
                if row is None or len(row) < 2:
                    continue
                sl_no = row[0]
                details = row[1]
                if sl_no is None or details is None:
                    continue
                try:
                    sl_no = int(sl_no)
                except (TypeError, ValueError):
                    skipped += 1
                    continue

                details = str(details).strip()
                if not details:
                    skipped += 1
                    continue

                documents = str(row[2] or '').strip() if len(row) > 2 else ''
                description = str(row[3] or '').strip() if len(row) > 3 else ''
                max_marks = 10.0
                if len(row) > 4 and row[4] is not None:
                    try:
                        max_marks = float(row[4])
                    except (TypeError, ValueError):
                        max_marks = 10.0

                AuditQuestion.objects.update_or_create(
                    sl_no=sl_no,
                    defaults={
                        'details': details[:300],
                        'documents_checklist': documents,
                        'detailed_description': description,
                        'max_marks': max_marks,
                        'is_active': True,
                    },
                )
                imported += 1

        return Response({
            'imported': imported,
            'skipped': skipped,
            'errors': errors,
            'total_questions': AuditQuestion.objects.filter(is_active=True).count(),
        })


# ─────────────────────────────────────────────────────────────────────────────
# Question Sets (IQAC only)
# ─────────────────────────────────────────────────────────────────────────────


class AuditQuestionSetListView(APIView):
    """List all active question sets or create a new one (IQAC only)."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        qs = AuditQuestionSet.objects.filter(is_active=True).prefetch_related('questions')
        data = AuditQuestionSetSerializer(qs, many=True).data
        return Response({'results': data})

    def post(self, request):
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can create question sets.'},
                            status=status.HTTP_403_FORBIDDEN)
        serializer = AuditQuestionSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question_set = serializer.save(created_by=request.user)
        return Response(AuditQuestionSetSerializer(question_set).data, status=status.HTTP_201_CREATED)


class AuditQuestionSetDetailView(APIView):
    """Retrieve, update or soft-delete a question set (IQAC only)."""
    permission_classes = (IsAuthenticated,)

    def _get_qs(self, request, pk):
        question_set = get_object_or_404(AuditQuestionSet, pk=pk)
        if not can_manage_assignments(request.user):
            raise PermissionDenied('Only IQAC can manage question sets.')
        return question_set

    def get(self, request, pk):
        question_set = self._get_qs(request, pk)
        return Response(AuditQuestionSetSerializer(question_set).data)

    def patch(self, request, pk):
        question_set = self._get_qs(request, pk)
        serializer = AuditQuestionSetSerializer(question_set, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AuditQuestionSetSerializer(question_set).data)

    def delete(self, request, pk):
        question_set = self._get_qs(request, pk)
        err = validate_password(request.user, request.data.get('password'))
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)
        question_set.is_active = False
        question_set.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuditQuestionSetInitDefaultView(APIView):
    """Create (or return existing) 'Set 1' containing all currently active questions (IQAC only).

    Safe to call multiple times — it is idempotent; if 'Set 1' already exists it
    just adds any questions that are not yet members.
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can initialise default question sets.'},
                            status=status.HTTP_403_FORBIDDEN)
        active_questions = list(AuditQuestion.objects.filter(is_active=True))
        if not active_questions:
            return Response({'detail': 'No active questions found. Import questions first.'},
                            status=status.HTTP_400_BAD_REQUEST)

        question_set, created = AuditQuestionSet.objects.get_or_create(
            name='Set 1',
            defaults={'description': 'Default question set — all active audit questions.', 'created_by': request.user},
        )
        # Ensure set is active and has all current questions
        if not question_set.is_active:
            question_set.is_active = True
            question_set.save(update_fields=['is_active'])
        question_set.questions.set(active_questions)

        return Response({
            'created': created,
            'question_set': AuditQuestionSetSerializer(question_set).data,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# Rubrics (IQAC upload, auditor download)
# ─────────────────────────────────────────────────────────────────────────────


class AuditRubricListView(APIView):
    """List rubrics (all authenticated) or upload a new one (IQAC only)."""
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    def get(self, request):
        qs = AuditRubric.objects.filter(is_active=True).select_related('uploaded_by')
        data = AuditRubricSerializer(qs, many=True, context={'request': request}).data
        return Response({'results': data})

    def post(self, request):
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can upload audit rubrics.'},
                            status=status.HTTP_403_FORBIDDEN)
        name = request.data.get('name', '').strip()
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'Please upload a PDF file.'}, status=status.HTTP_400_BAD_REQUEST)
        if not name:
            name = file_obj.name
        rubric = AuditRubric.objects.create(
            name=name,
            file=file_obj,
            uploaded_by=request.user,
        )
        return Response(AuditRubricSerializer(rubric, context={'request': request}).data,
                        status=status.HTTP_201_CREATED)


class AuditRubricDetailView(APIView):
    """Delete (soft) a rubric (IQAC only)."""
    permission_classes = (IsAuthenticated,)

    def delete(self, request, pk):
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can delete audit rubrics.'},
                            status=status.HTTP_403_FORBIDDEN)
        err = validate_password(request.user, request.data.get('password'))
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)
        rubric = get_object_or_404(AuditRubric, pk=pk)
        rubric.is_active = False
        rubric.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuditRubricDownloadView(APIView):
    """Serve the rubric PDF file inline."""
    permission_classes = (IsAuthenticated,)

    def get(self, request, pk):
        rubric = get_object_or_404(AuditRubric, pk=pk, is_active=True)
        try:
            return FileResponse(rubric.file.open('rb'), content_type='application/pdf',
                                as_attachment=False, filename=rubric.name)
        except Exception:
            return Response({'detail': 'File not found.'}, status=status.HTTP_404_NOT_FOUND)


# ─────────────────────────────────────────────────────────────────────────────
# Cycles
# ─────────────────────────────────────────────────────────────────────────────


class AuditCycleListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        qs = AuditCycle.objects.all().order_by('cycle')
        data = []
        for c in qs:
            d = AuditCycleSerializer(c).data
            d['assignment_count'] = c.assignments.count()
            data.append(d)
        return Response({'results': data})

    def post(self, request):
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can manage cycles.'}, status=403)
        serializer = AuditCycleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# Assignments
# ─────────────────────────────────────────────────────────────────────────────


class AuditAssignmentListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        qs = AuditDepartmentAssignment.objects.select_related('cycle', 'department').prefetch_related('auditors__user')

        if not user_is_iqac(user):
            staff = get_user_staff_profile(user)
            staff_id = staff.id if staff else None
            dept_ids = get_user_department_ids(user)
            scope = str(request.query_params.get('scope', '')).strip().lower()
            if scope == 'auditor':
                qs = qs.filter(auditors__id=staff_id)
            elif scope == 'hod':
                qs = qs.filter(department_id__in=dept_ids)
            else:
                qs = qs.filter(
                    Q(auditors__id=staff_id) | Q(department_id__in=dept_ids)
                )
            qs = qs.distinct()

        cycle_id = request.query_params.get('cycle_id')
        if cycle_id:
            qs = qs.filter(cycle_id=cycle_id)

        results = []
        for a in qs.order_by('cycle__cycle', 'department__code'):
            serialized = AuditAssignmentSerializer(a).data
            total, maximum, pct, below = get_assignment_totals(a)
            serialized['total_marks'] = round(total, 2)
            serialized['max_marks'] = round(maximum, 2)
            serialized['percentage'] = pct
            serialized['below_60_count'] = below
            serialized['can_view'] = can_view_assignment(user, a)
            results.append(serialized)
        return Response({'results': results})

    def post(self, request):
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can create audit assignments.'}, status=403)

        cycle_id = request.data.get('cycle_id')
        department_id = request.data.get('department_id')
        auditor_ids = request.data.get('auditor_ids') or []
        remarks = request.data.get('remarks') or ''
        question_set_id = request.data.get('question_set_id')

        if not cycle_id or not department_id:
            return Response({'detail': 'cycle_id and department_id are required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not auditor_ids:
            return Response({'detail': 'At least one auditor must be assigned.'},
                            status=status.HTTP_400_BAD_REQUEST)

        cycle = get_object_or_404(AuditCycle, pk=cycle_id)
        department = get_object_or_404(Department, pk=department_id)

        if AuditDepartmentAssignment.objects.filter(cycle=cycle, department=department).exists():
            return Response({'detail': 'An assignment already exists for this department and cycle.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Resolve optional question set
        question_set = None
        if question_set_id:
            question_set = get_object_or_404(AuditQuestionSet, pk=question_set_id, is_active=True)

        assignment = AuditDepartmentAssignment.objects.create(
            cycle=cycle,
            department=department,
            assigned_by=request.user,
            remarks=remarks,
            question_set=question_set,
        )
        assignment.auditors.set(auditor_ids)

        # Pre-create score rows — use question set if specified, else all active questions
        if question_set:
            questions_qs = question_set.questions.filter(is_active=True)
        else:
            questions_qs = AuditQuestion.objects.filter(is_active=True)
        for q in questions_qs:
            AuditScore.objects.get_or_create(assignment=assignment, question=q)

        serialized = AuditAssignmentSerializer(assignment).data
        total, maximum, pct, below = get_assignment_totals(assignment)
        serialized['total_marks'] = round(total, 2)
        serialized['max_marks'] = round(maximum, 2)
        serialized['percentage'] = pct
        serialized['below_60_count'] = below
        return Response(serialized, status=201)


class AuditAssignmentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def _get_assignment(self, request, pk):
        assignment = get_object_or_404(
            AuditDepartmentAssignment.objects.select_related('cycle', 'department').prefetch_related('auditors__user'),
            pk=pk,
        )
        if not can_view_assignment(request.user, assignment):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have access to this audit assignment.')
        return assignment

    def get(self, request, pk):
        assignment = self._get_assignment(request, pk)
        rows = build_question_rows(assignment, include_atr=True)
        serialized = AuditAssignmentSerializer(assignment).data
        total, maximum, pct, below = get_assignment_totals(assignment)
        is_iqac = user_is_iqac(request.user)
        is_auditor = user_is_auditor_for_assignment(request.user, assignment)
        is_hod = user_is_hod_for_assignment(request.user, assignment)
        can_edit = is_iqac or (is_auditor and assignment.status != 'SUBMITTED')

        serialized['total_marks'] = round(total, 2)
        serialized['max_marks'] = round(maximum, 2)
        serialized['percentage'] = pct
        serialized['below_60_count'] = below
        serialized['questions'] = rows
        serialized['is_auditor'] = is_auditor
        serialized['is_hod'] = is_hod
        serialized['is_iqac'] = is_iqac
        serialized['can_edit'] = can_edit
        return Response(serialized)

    def delete(self, request, pk):
        """Delete an audit assignment (IQAC/superuser only). Requires login password; cascades scores & ATRs."""
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can delete audit assignments.'},
                            status=status.HTTP_403_FORBIDDEN)
        err = validate_password(request.user, request.data.get('password'))
        if err:
            return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)
        assignment = get_object_or_404(AuditDepartmentAssignment, pk=pk)
        assignment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuditAssignmentAuditorRemoveView(APIView):
    """Remove an assigned auditor from an assignment (IQAC only)."""
    permission_classes = (IsAuthenticated,)

    def delete(self, request, pk, staff_id):
        if not can_manage_assignments(request.user):
            return Response({'detail': 'Only IQAC can manage assigned auditors.'},
                            status=status.HTTP_403_FORBIDDEN)
        assignment = get_object_or_404(AuditDepartmentAssignment, pk=pk)
        assignment.auditors.remove(staff_id)
        return Response({'detail': 'Auditor removed from the assignment.'})


class AuditScoreSaveView(APIView):
    """Bulk save/auto-save of scores & comments by auditors and IQAC."""
    permission_classes = (IsAuthenticated,)

    def _get_assignment(self, request, pk):
        assignment = get_object_or_404(
            AuditDepartmentAssignment.objects.select_related('cycle', 'department'),
            pk=pk,
        )
        is_iqac = user_is_iqac(request.user)
        is_auditor = user_is_auditor_for_assignment(request.user, assignment)
        if not (is_iqac or is_auditor):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only assigned auditors or IQAC can enter/edit scores.')

        # If the audit is already submitted, auditors are not allowed to edit
        if assignment.status == 'SUBMITTED' and not is_iqac:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('This audit has been finalized and submitted. Auditors cannot edit submitted audits.')

        return assignment

    def post(self, request, pk):
        assignment = self._get_assignment(request, pk)
        entries = request.data.get('scores') or []
        submit = bool(request.data.get('submit', False))
        is_iqac = user_is_iqac(request.user)

        if not isinstance(entries, list):
            return Response({'detail': 'scores must be a list.'}, status=400)

        # Only questions within the assignment's scope (assigned set, or all active) are valid.
        question_ids = set(get_assignment_questions(assignment).values_list('id', flat=True))
        saved = 0
        errors = []
        with transaction.atomic():
            for entry in entries:
                question_id = entry.get('question_id')
                if question_id not in question_ids:
                    errors.append(f'Unknown question id: {question_id}')
                    continue
                question = AuditQuestion.objects.get(pk=question_id)
                marks = entry.get('marks')
                if marks in (None, ''):
                    marks = None
                else:
                    try:
                        marks = float(marks)
                    except (TypeError, ValueError):
                        errors.append(f'Invalid marks for Q{question.sl_no}')
                        continue
                    if marks < 0 or marks > float(question.max_marks):
                        errors.append(
                            f'Marks for Q{question.sl_no} must be between 0 and {question.max_marks}.'
                        )
                        continue

                comments = str(entry.get('comments') or '')[:2000]
                AuditScore.objects.update_or_create(
                    assignment=assignment,
                    question=question,
                    defaults={'marks': marks, 'comments': comments, 'updated_by': request.user},
                )
                saved += 1

            custom_status = request.data.get('status')
            if is_iqac and custom_status in ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED'):
                assignment.status = custom_status
                assignment.save(update_fields=['status', 'updated_at'])
            elif submit:
                assignment.status = 'SUBMITTED'
                assignment.save(update_fields=['status', 'updated_at'])
                # Materialize ATR rows for below-60% questions (set-scoped).
                for q in get_assignment_questions(assignment):
                    score = AuditScore.objects.filter(assignment=assignment, question=q).first()
                    if score and score.marks is not None and float(score.marks) < float(q.max_marks) * 0.6:
                        AuditATR.objects.get_or_create(assignment=assignment, question=q)
            elif assignment.status == 'NOT_STARTED':
                assignment.status = 'IN_PROGRESS'
                assignment.save(update_fields=['status', 'updated_at'])
            elif assignment.status == 'SUBMITTED' and is_iqac:
                # IQAC edited a submitted audit - ensure ATR rows stay synced
                for q in get_assignment_questions(assignment):
                    score = AuditScore.objects.filter(assignment=assignment, question=q).first()
                    if score and score.marks is not None and float(score.marks) < float(q.max_marks) * 0.6:
                        AuditATR.objects.get_or_create(assignment=assignment, question=q)
                assignment.save(update_fields=['updated_at'])

        total, maximum, pct, below = get_assignment_totals(assignment)
        return Response({
            'saved': saved,
            'errors': errors,
            'status': assignment.status,
            'total_marks': round(total, 2),
            'max_marks': round(maximum, 2),
            'percentage': pct,
            'below_60_count': below,
        })


class AuditReportView(APIView):
    """Structured report data for PDF generation."""
    permission_classes = (IsAuthenticated,)

    def get(self, request, pk):
        assignment = get_object_or_404(
            AuditDepartmentAssignment.objects.select_related('cycle', 'department').prefetch_related('auditors__user'),
            pk=pk,
        )
        if not can_view_assignment(request.user, assignment):
            return Response({'detail': 'You do not have access to this report.'}, status=403)

        rows = build_question_rows(assignment, include_atr=True)
        total, maximum, pct, below = get_assignment_totals(assignment)

        auditors = []
        for a in assignment.auditors.all():
            name = ''
            if a.user:
                name = f'{a.user.first_name} {a.user.last_name}'.strip() or a.user.username
            auditors.append({'staff_id': a.staff_id, 'name': name, 'designation': a.designation or ''})

        # Date of entry (latest marks entry / ATR submission)
        marks_dates = [
            s.updated_at for s in assignment.scores.all()
            if s.marks is not None and s.updated_at
        ]
        atr_dates = [
            a.submitted_at for a in assignment.atrs.all()
            if a.submitted_at
        ]

        return Response({
            'assignment_id': assignment.id,
            'cycle': assignment.cycle.cycle,
            'cycle_label': assignment.cycle.label or assignment.cycle.name or f'Cycle {assignment.cycle.cycle}',
            'department': {
                'id': assignment.department.id,
                'code': assignment.department.code,
                'name': assignment.department.name,
                'short_name': assignment.department.short_name,
            },
            'auditors': auditors,
            'status': assignment.status,
            'remarks': assignment.remarks,
            'total_marks': round(total, 2),
            'max_marks': round(maximum, 2),
            'percentage': pct,
            'below_60_count': below,
            'marks_submitted_on': max(marks_dates).isoformat() if marks_dates else None,
            'atr_submitted_on': max(atr_dates).isoformat() if atr_dates else None,
            'questions': rows,
        })


# ─────────────────────────────────────────────────────────────────────────────
# ATR (Action Taken Report)
# ─────────────────────────────────────────────────────────────────────────────


class AuditATRView(APIView):
    permission_classes = (IsAuthenticated,)

    def _get_assignment(self, request, pk):
        assignment = get_object_or_404(
            AuditDepartmentAssignment.objects.select_related('cycle', 'department'),
            pk=pk,
        )
        can_edit = user_is_iqac(request.user) or user_is_hod_for_assignment(request.user, assignment)
        if not can_edit:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the department HOD (or IQAC) can manage the ATR.')
        return assignment

    def get(self, request, pk):
        assignment = self._get_assignment(request, pk)
        required_scores = get_atr_required_scores(assignment)
        atrs = {a.question_id: a for a in assignment.atrs.all()}
        all_questions = list(get_assignment_questions(assignment))
        q_index_map = {q.id: idx for idx, q in enumerate(all_questions, start=1)}
        rows = []
        for score in required_scores:
            atr = atrs.get(score.question_id)
            q = score.question
            rows.append({
                'question_id': q.id,
                'sl_no': q_index_map.get(q.id, q.sl_no),
                'details': q.details,
                'max_marks': str(q.max_marks),
                'marks': str(score.marks) if score.marks is not None else None,
                'comments': score.comments,
                'action_taken': atr.action_taken if atr else '',
                'status': atr.status if atr else 'PENDING',
                'submitted_at': atr.submitted_at.isoformat() if atr and atr.submitted_at else None,
            })
        return Response({
            'assignment': AuditAssignmentSerializer(assignment).data,
            'atr_questions': rows,
            'below_60_count': len(rows),
        })

    def post(self, request, pk):
        assignment = self._get_assignment(request, pk)
        entries = request.data.get('atrs') or []
        submit = bool(request.data.get('submit', False))

        if not isinstance(entries, list):
            return Response({'detail': 'atrs must be a list.'}, status=400)

        required = {s.question_id: s for s in get_atr_required_scores(assignment)}
        saved = 0
        with transaction.atomic():
            for entry in entries:
                question_id = entry.get('question_id')
                if question_id not in required:
                    continue
                action_taken = str(entry.get('action_taken') or '')[:2000]
                if submit and not action_taken.strip():
                    continue
                AuditATR.objects.update_or_create(
                    assignment=assignment,
                    question_id=question_id,
                    defaults={
                        'action_taken': action_taken,
                        'submitted_by': request.user,
                        'status': 'SUBMITTED' if submit else 'PENDING',
                        'submitted_at': timezone.now() if submit else None,
                    },
                )
                saved += 1

        return Response({'saved': saved, 'submit': submit})


# ─────────────────────────────────────────────────────────────────────────────
# Consolidated review (IQAC)
# ─────────────────────────────────────────────────────────────────────────────


class AuditConsolidatedView(APIView):
    """Per-cycle, per-department consolidated scores for IQAC review."""
    permission_classes = (IsAuthenticated, IsIQACOrSuperuser)

    def get(self, request):
        cycle_id = request.query_params.get('cycle_id')
        cycles = AuditCycle.objects.all().order_by('cycle')
        if cycle_id:
            cycles = cycles.filter(id=cycle_id)

        result = []
        for cycle in cycles:
            dept_rows = []
            for assignment in cycle.assignments.select_related('department').prefetch_related('auditors__user').order_by('department__code'):
                total, maximum, pct, below = get_assignment_totals(assignment)
                atr_submitted = assignment.atrs.filter(status='SUBMITTED').count()
                atr_pending = assignment.atrs.exclude(status='SUBMITTED').count()
                dept_rows.append({
                    'assignment_id': assignment.id,
                    'department_id': assignment.department.id,
                    'department_code': assignment.department.code,
                    'department_name': assignment.department.name,
                    'department_short_name': assignment.department.short_name,
                    'status': assignment.status,
                    'auditors': [
                        {
                            'id': a.id,
                            'staff_id': a.staff_id,
                            'name': (f'{a.user.first_name} {a.user.last_name}'.strip() or a.user.username) if a.user else a.staff_id,
                        } for a in assignment.auditors.all()
                    ],
                    'total_marks': round(total, 2),
                    'max_marks': round(maximum, 2),
                    'percentage': pct,
                    'below_60_count': below,
                    'atr_submitted': atr_submitted,
                    'atr_pending': atr_pending,
                })
            result.append({
                'cycle_id': cycle.id,
                'cycle': cycle.cycle,
                'label': cycle.label or cycle.name or f'Cycle {cycle.cycle}',
                'departments': dept_rows,
            })
        return Response({'results': result})
