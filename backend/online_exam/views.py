import logging
from datetime import datetime, time
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from .models import OnlineExam, OnlineExamIncharge, OnlineExamQuestion, OnlineExamSubmission, OnlineExamQuestionBank
from .serializers import (
    OnlineExamListSerializer,
    OnlineExamQuestionSerializer,
    OnlineExamStudentQuestionSerializer,
    OnlineExamInchargeSerializer
)
from academics.models import Department, Batch, BatchYear, Section, StudentProfile, StaffProfile, Subject
from curriculum.models import CurriculumMaster

logger = logging.getLogger(__name__)
User = get_user_model()


class OnlineExamMetaView(APIView):
    """Returns dropdown options for course search, department, batch, sections, staff, and saved question banks."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # 1. Courses (combine Subjects and CurriculumMaster)
        courses_dict = {}
        for s in Subject.objects.exclude(code__isnull=True).exclude(code='').only('code', 'name'):
            code = (s.code or '').strip().upper()
            name = (s.name or '').strip()
            if code and code not in courses_dict:
                courses_dict[code] = name

        for cm in CurriculumMaster.objects.exclude(course_code__isnull=True).exclude(course_code='').only('course_code', 'course_name'):
            code = (cm.course_code or '').strip().upper()
            name = (cm.course_name or '').strip()
            if code and code not in courses_dict:
                courses_dict[code] = name

        courses = [{'code': k, 'name': v, 'display': f"{k} - {v}"} for k, v in sorted(courses_dict.items())]

        # 2. Departments
        departments = []
        for d in Department.objects.filter(is_teaching=True).order_by('code'):
            short = d.short_name or d.code
            departments.append({
                'id': d.id,
                'code': d.code,
                'name': d.name,
                'short_name': short,
                'label': f"{d.code} - {short}"
            })

        # 3. Batches
        batches = []
        for b in BatchYear.objects.order_by('-name'):
            batches.append({
                'id': b.id,
                'name': b.name,
                'label': b.name
            })
        if not batches:
            for b in Batch.objects.filter(is_active=True).order_by('-name'):
                batches.append({
                    'id': b.id,
                    'name': b.name,
                    'label': b.name
                })

        # 4. Sections
        sections_qs = Section.objects.select_related(
            'batch',
            'batch__department',
            'batch__course__department',
            'managing_department'
        ).all().order_by('name')

        sections = []
        for s in sections_qs:
            dept = getattr(s, 'managing_department', None) or getattr(getattr(s, 'batch', None), 'department', None) or getattr(getattr(getattr(s, 'batch', None), 'course', None), 'department', None)
            dept_id = dept.id if dept else None
            dept_code = getattr(dept, 'short_name', '') or getattr(dept, 'code', '')
            batch_id = s.batch_id
            batch_name = getattr(s.batch, 'name', '') if s.batch else ''

            label = f"{dept_code} - {s.name} ({batch_name})".strip(' -()') if dept_code else f"{s.name} ({batch_name})"

            sections.append({
                'id': s.id,
                'name': s.name,
                'batch_id': batch_id,
                'batch_name': batch_name,
                'department_id': dept_id,
                'department_code': dept_code,
                'label': label
            })

        # 5. Staff
        staff_qs = StaffProfile.objects.select_related('user', 'department').filter(status='ACTIVE')
        staff_list = []
        for sp in staff_qs:
            if not sp.user:
                continue
            full_name = sp.user.get_full_name() or sp.user.username
            dept_name = sp.department.short_name or sp.department.code if sp.department else ''
            staff_list.append({
                'id': sp.user.id,
                'staff_id': sp.staff_id,
                'name': full_name,
                'department': dept_name,
                'designation': sp.designation or 'Faculty',
                'display': f"{full_name} ({sp.staff_id}) - {dept_name}".strip(' -')
            })

        # 6. Previous Question Banks
        question_banks = []
        for qb in OnlineExamQuestionBank.objects.all().order_by('-created_at'):
            question_banks.append({
                'id': qb.id,
                'title': qb.title,
                'course_code': qb.course_code,
                'course_name': qb.course_name,
                'questions_count': qb.questions_count,
                'questions_data': qb.questions_data,
                'created_at': qb.created_at.strftime('%Y-%m-%d %H:%M'),
            })

        return Response({
            'courses': courses,
            'departments': departments,
            'batches': batches,
            'sections': sections,
            'staff': staff_list,
            'question_banks': question_banks,
        })


class OnlineExamQuestionBankListView(APIView):
    """List all saved online exam question banks or save a new one."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qbs = OnlineExamQuestionBank.objects.all().order_by('-created_at')
        data = [
            {
                'id': qb.id,
                'title': qb.title,
                'course_code': qb.course_code,
                'course_name': qb.course_name,
                'questions_count': qb.questions_count,
                'questions_data': qb.questions_data,
                'created_at': qb.created_at.strftime('%Y-%m-%d %H:%M'),
            }
            for qb in qbs
        ]
        return Response(data)

    def post(self, request):
        title = (request.data.get('title') or '').strip()
        course_code = (request.data.get('course_code') or '').strip().upper()
        course_name = (request.data.get('course_name') or '').strip()
        questions = request.data.get('questions') or []

        if not title:
            return Response({'error': 'Title is required for question bank.'}, status=status.HTTP_400_BAD_REQUEST)
        if not questions:
            return Response({'error': 'Please provide at least one question.'}, status=status.HTTP_400_BAD_REQUEST)

        qb = OnlineExamQuestionBank.objects.create(
            title=title,
            course_code=course_code,
            course_name=course_name,
            questions_count=len(questions),
            questions_data=questions,
            created_by=request.user
        )
        return Response({
            'id': qb.id,
            'title': qb.title,
            'course_code': qb.course_code,
            'course_name': qb.course_name,
            'questions_count': qb.questions_count,
            'created_at': qb.created_at.strftime('%Y-%m-%d %H:%M'),
        }, status=status.HTTP_201_CREATED)


class OnlineExamListView(APIView):
    """List exams (upcoming or past) for IQAC Admin."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Update auto-start exams
        scheduled_auto = OnlineExam.objects.filter(status='SCHEDULED', start_mode='AUTO')
        for ex in scheduled_auto:
            ex.check_and_update_auto_status()

        exam_type = request.GET.get('type', 'all').lower()

        qs = OnlineExam.objects.prefetch_related('sections', 'incharges', 'questions').all()

        if exam_type == 'upcoming':
            qs = qs.filter(status__in=['SCHEDULED', 'RUNNING']).order_by('exam_date', 'created_at')
        elif exam_type == 'past':
            qs = qs.filter(status='ENDED').order_by('-exam_date', '-actual_end_time')
        else:
            qs = qs.order_by('-created_at')

        serializer = OnlineExamListSerializer(qs, many=True)
        return Response(serializer.data)


class OnlineExamCreateView(APIView):
    """Create a new Online Exam with questions, sections, and incharge faculty."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = request.data
        title = (data.get('title') or '').strip()
        exam_date_str = (data.get('exam_date') or '').strip()
        start_mode = (data.get('start_mode') or 'MANUAL').upper()
        auto_start_time_str = (data.get('auto_start_time') or '').strip()
        duration_minutes = int(data.get('duration_minutes') or 60)
        course_code = (data.get('course_code') or '').strip().upper()
        course_name = (data.get('course_name') or '').strip()
        section_ids = data.get('section_ids') or []
        incharges_data = data.get('incharges') or []
        questions_data = data.get('questions') or []

        if not title:
            return Response({'error': 'Exam title is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not exam_date_str:
            return Response({'error': 'Exam date is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not course_code:
            return Response({'error': 'Course selection is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not section_ids:
            return Response({'error': 'Please select at least one section.'}, status=status.HTTP_400_BAD_REQUEST)
        if not questions_data:
            return Response({'error': 'Please import at least one question.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exam_date = datetime.strptime(exam_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        auto_start_time = None
        if start_mode == 'AUTO':
            if not auto_start_time_str:
                return Response({'error': 'Start time is required for auto start mode.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                parts = auto_start_time_str.split(':')
                auto_start_time = time(int(parts[0]), int(parts[1]))
            except Exception:
                return Response({'error': 'Invalid time format for auto start time. Use HH:MM.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cooldown_seconds = int(data.get('cooldown_seconds') or 30)
        except Exception:
            cooldown_seconds = 30
        try:
            max_violations = int(data.get('max_violations') or 3)
        except Exception:
            max_violations = 3

        with transaction.atomic():
            exam = OnlineExam.objects.create(
                title=title,
                exam_date=exam_date,
                start_mode=start_mode,
                auto_start_time=auto_start_time,
                duration_minutes=duration_minutes,
                course_code=course_code,
                course_name=course_name,
                created_by=request.user,
                status='SCHEDULED',
                cooldown_seconds=cooldown_seconds,
                max_violations=max_violations,
            )

            # Sections
            sections = Section.objects.filter(id__in=section_ids)
            exam.sections.set(sections)

            # Incharges
            for inc in incharges_data:
                staff_user_id = inc.get('user_id') or inc.get('staff_user_id')
                staff_user = User.objects.filter(id=staff_user_id).first() if staff_user_id else None
                OnlineExamIncharge.objects.create(
                    exam=exam,
                    staff=staff_user,
                    faculty_id=inc.get('staff_id') or inc.get('faculty_id') or '',
                    staff_name=inc.get('staff_name') or (staff_user.get_full_name() if staff_user else ''),
                    role=inc.get('role') or 'Exam Incharge'
                )

            # Questions
            bank_title = (data.get('question_bank_title') or title).strip()
            raw_bank_questions = []
            for idx, q in enumerate(questions_data, start=1):
                q_num = int(q.get('question_number') or q.get('sno') or idx)
                q_text = (q.get('question_text') or q.get('question') or '').strip()
                opt_a = (q.get('option_a') or q.get('A') or '').strip()
                opt_b = (q.get('option_b') or q.get('B') or '').strip()
                opt_c = (q.get('option_c') or q.get('C') or '').strip()
                opt_d = (q.get('option_d') or q.get('D') or '').strip()
                correct = (q.get('correct_answer') or q.get('answer') or 'A').strip().upper()
                try:
                    co = int(q.get('co') or 1)
                except Exception:
                    co = 1
                try:
                    marks = int(q.get('marks') or 1)
                except Exception:
                    marks = 1

                if not q_text:
                    continue

                OnlineExamQuestion.objects.create(
                    exam=exam,
                    question_number=q_num,
                    question_text=q_text,
                    option_a=opt_a,
                    option_b=opt_b,
                    option_c=opt_c,
                    option_d=opt_d,
                    correct_answer=correct,
                    co=co,
                    marks=marks
                )

                raw_bank_questions.append({
                    'question_number': q_num,
                    'question_text': q_text,
                    'option_a': opt_a,
                    'option_b': opt_b,
                    'option_c': opt_c,
                    'option_d': opt_d,
                    'correct_answer': correct,
                    'co': co,
                    'marks': marks
                })

            # Automatically save Question Bank for future reuse in import
            if raw_bank_questions:
                OnlineExamQuestionBank.objects.create(
                    title=bank_title,
                    course_code=course_code,
                    course_name=course_name,
                    questions_count=len(raw_bank_questions),
                    questions_data=raw_bank_questions,
                    created_by=request.user
                )

        serializer = OnlineExamListSerializer(exam)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class OnlineExamStartView(APIView):
    """Start exam with password confirmation."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        password = request.data.get('password', '')
        if not password:
            return Response({'error': 'Password is required to start the exam.'}, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.check_password(password):
            return Response({'error': 'Incorrect password. Verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

        exam = OnlineExam.objects.filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        if exam.status == 'RUNNING':
            return Response({'error': 'Exam is already running.'}, status=status.HTTP_400_BAD_REQUEST)
        if exam.status == 'ENDED':
            return Response({'error': 'Exam has already ended.'}, status=status.HTTP_400_BAD_REQUEST)

        exam.status = 'RUNNING'
        exam.actual_start_time = timezone.now()
        exam.save(update_fields=['status', 'actual_start_time', 'updated_at'])

        serializer = OnlineExamListSerializer(exam)
        return Response(serializer.data)


class OnlineExamEndView(APIView):
    """End exam with password confirmation."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        password = request.data.get('password', '')
        if not password:
            return Response({'error': 'Password is required to end the exam.'}, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.check_password(password):
            return Response({'error': 'Incorrect password. Verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

        exam = OnlineExam.objects.filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        if exam.status == 'ENDED':
            return Response({'error': 'Exam is already ended.'}, status=status.HTTP_400_BAD_REQUEST)

        exam.status = 'ENDED'
        exam.actual_end_time = timezone.now()
        exam.save(update_fields=['status', 'actual_end_time', 'updated_at'])

        serializer = OnlineExamListSerializer(exam)
        return Response(serializer.data)


class OnlineExamStudentExamsView(APIView):
    """Returns active and past exams for the logged-in student based on their section."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sp = StudentProfile.objects.filter(user=request.user).first()
        if not sp:
            return Response({'has_exams': False, 'active': [], 'past': [], 'message': 'No student profile found.'})

        # Collect student sections (primary and any active secondary section assignments)
        section_ids = set()
        if sp.section_id:
            section_ids.add(sp.section_id)
        try:
            active_assignments = sp.section_assignments.filter(end_date__isnull=True).values_list('section_id', flat=True)
            section_ids.update(active_assignments)
        except Exception:
            pass

        if not section_ids:
            return Response({'has_exams': False, 'student_section': 'No Section Assigned', 'active': [], 'past': [], 'message': 'No section assigned.'})

        # Auto-update scheduled exams
        for ex in OnlineExam.objects.filter(status='SCHEDULED', start_mode='AUTO'):
            ex.check_and_update_auto_status()

        exams = OnlineExam.objects.filter(sections__id__in=section_ids).distinct().prefetch_related('submissions', 'questions', 'incharges')

        # Submissions by this student
        submissions = {sub.exam_id: sub for sub in OnlineExamSubmission.objects.filter(student=request.user)}

        active_exams = []
        past_exams = []

        for ex in exams:
            sub = submissions.get(ex.id)
            serialized = OnlineExamListSerializer(ex).data
            is_published = bool(ex.is_results_published)
            is_kicked = bool(sub and sub.status == 'KICKED')
            is_retest = bool(sub and sub.is_retest_allowed)

            serialized['submission'] = {
                'submitted': bool(sub and sub.status == 'SUBMITTED'),
                'is_kicked': is_kicked,
                'status': sub.status if sub else 'NOT_STARTED',
                'kicked_reason': sub.kicked_reason if sub else '',
                'kicked_at': sub.kicked_at.strftime('%Y-%m-%d %H:%M') if (sub and sub.kicked_at) else None,
                'violations_count': sub.violations_count if sub else 0,
                'is_retest_allowed': is_retest,
                'score': (sub.score if is_published else None) if sub else None,
                'total_questions': sub.total_questions if sub else ex.questions.count(),
                'is_results_published': is_published,
                'submitted_at': sub.submitted_at.strftime('%Y-%m-%d %H:%M') if (sub and sub.submitted_at) else None
            } if sub else None

            # If student was kicked and re-test is granted -> active exams with retest flag
            if is_kicked and is_retest:
                serialized['is_retest'] = True
                active_exams.append(serialized)
            # If student was kicked and no retest -> past exams in red
            elif is_kicked:
                past_exams.append(serialized)
            # If student has submitted or exam has ended -> past exams
            elif ex.status == 'ENDED' or (sub and sub.status == 'SUBMITTED'):
                past_exams.append(serialized)
            else:
                active_exams.append(serialized)

        section_display = sp.section.name if sp.section else 'Assigned Section'

        return Response({
            'has_exams': bool(len(active_exams) > 0 or len(past_exams) > 0),
            'student_section': section_display,
            'active': active_exams,
            'past': past_exams
        })


class OnlineExamStudentDetailView(APIView):
    """Retrieve exam details (instructions/meta) for a student."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        sp = StudentProfile.objects.filter(user=request.user).first()
        if not sp:
            return Response({'error': 'Student profile not found.'}, status=status.HTTP_403_FORBIDDEN)

        exam = OnlineExam.objects.prefetch_related('sections', 'questions', 'incharges').filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        section_ids = set()
        if sp.section_id:
            section_ids.add(sp.section_id)
        try:
            active_assignments = sp.section_assignments.filter(end_date__isnull=True).values_list('section_id', flat=True)
            section_ids.update(active_assignments)
        except Exception:
            pass

        if not exam.sections.filter(id__in=section_ids).exists():
            return Response({'error': 'You are not assigned to take this exam.'}, status=status.HTTP_403_FORBIDDEN)

        # Check for auto-start
        exam.check_and_update_auto_status()

        sub = OnlineExamSubmission.objects.filter(exam=exam, student=request.user).first()
        serialized = OnlineExamListSerializer(exam).data
        is_published = bool(exam.is_results_published)
        is_kicked = bool(sub and sub.status == 'KICKED')
        is_retest = bool(sub and sub.is_retest_allowed)

        serialized['submission'] = {
            'submitted': bool(sub and sub.status == 'SUBMITTED'),
            'is_kicked': is_kicked,
            'status': sub.status if sub else 'NOT_STARTED',
            'kicked_reason': sub.kicked_reason if sub else '',
            'kicked_at': sub.kicked_at.strftime('%Y-%m-%d %H:%M') if (sub and sub.kicked_at) else None,
            'violations_count': sub.violations_count if sub else 0,
            'is_retest_allowed': is_retest,
            'score': (sub.score if is_published else None) if sub else None,
            'total_questions': sub.total_questions if sub else exam.questions.count(),
            'is_results_published': is_published,
            'submitted_at': sub.submitted_at.strftime('%Y-%m-%d %H:%M') if (sub and sub.submitted_at) else None
        } if sub else None

        return Response(serialized)


def get_shuffled_options_for_student(student_id, exam_id, question):
    """
    Returns deterministically shuffled options for a specific student, exam, and question.
    Returns:
        opts: list of tuples [('A_orig', text_a), ('B_orig', text_b), ...]
        display_to_original: dict mapping display position ('A', 'B', 'C', 'D') -> original letter ('A', 'B', 'C', 'D')
        original_to_display: dict mapping original letter -> display position
    """
    import random
    opts = [
        ('A', question.option_a or ''),
        ('B', question.option_b or ''),
        ('C', question.option_c or ''),
        ('D', question.option_d or ''),
    ]
    rng = random.Random(f"{student_id}_{exam_id}_{question.id}_options")
    rng.shuffle(opts)

    pos_letters = ['A', 'B', 'C', 'D']
    display_to_original = {}
    original_to_display = {}
    for idx, (orig_letter, text) in enumerate(opts):
        disp_letter = pos_letters[idx]
        display_to_original[disp_letter] = orig_letter
        original_to_display[orig_letter] = disp_letter

    return opts, display_to_original, original_to_display


class OnlineExamStudentTakeView(APIView):
    """Retrieve exam questions (shuffled questions and options per student) and submit responses for student."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        sp = StudentProfile.objects.filter(user=request.user).first()
        if not sp:
            return Response({'error': 'Student profile not found.'}, status=status.HTTP_403_FORBIDDEN)

        exam = OnlineExam.objects.prefetch_related('questions', 'sections').filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        section_ids = set()
        if sp.section_id:
            section_ids.add(sp.section_id)
        try:
            active_assignments = sp.section_assignments.filter(end_date__isnull=True).values_list('section_id', flat=True)
            section_ids.update(active_assignments)
        except Exception:
            pass

        if not exam.sections.filter(id__in=section_ids).exists():
            return Response({'error': 'You are not assigned to take this exam.'}, status=status.HTTP_403_FORBIDDEN)

        # Check auto status
        exam.check_and_update_auto_status()

        if exam.status != 'RUNNING':
            return Response({'error': f'Exam is not currently active (Status: {exam.status}).', 'exam_status': exam.status}, status=status.HTTP_400_BAD_REQUEST)

        # Existing submission
        sub = OnlineExamSubmission.objects.filter(exam=exam, student=request.user).first()
        if sub and sub.status == 'KICKED' and not sub.is_retest_allowed:
            return Response({
                'error': f'You were kicked from this examination: {sub.kicked_reason or "Proctoring violations exceeded"}.',
                'is_kicked': True,
                'kicked_reason': sub.kicked_reason
            }, status=status.HTTP_400_BAD_REQUEST)

        if sub and sub.status == 'SUBMITTED':
            return Response({'error': 'You have already submitted this exam.'}, status=status.HTTP_400_BAD_REQUEST)

        # Shuffled questions per student (deterministic per student + exam)
        import random
        questions = list(exam.questions.all())
        rng = random.Random(f"{request.user.id}_{exam.id}")
        rng.shuffle(questions)

        # Shuffle options per question deterministically per student + exam + question
        shuffled_questions = []
        for q in questions:
            opts, disp_to_orig, orig_to_disp = get_shuffled_options_for_student(request.user.id, exam.id, q)
            shuffled_questions.append({
                'id': q.id,
                'question_number': q.question_number,
                'question_text': q.question_text,
                'option_a': opts[0][1],
                'option_b': opts[1][1],
                'option_c': opts[2][1],
                'option_d': opts[3][1],
                'co': getattr(q, 'co', 1),
                'marks': getattr(q, 'marks', 1),
            })

        # Remaining time calculation
        remaining_seconds = 0
        if exam.actual_start_time:
            elapsed = (timezone.now() - exam.actual_start_time).total_seconds()
            total_duration_secs = exam.duration_minutes * 60
            remaining_seconds = max(0, int(total_duration_secs - elapsed))
        else:
            remaining_seconds = exam.duration_minutes * 60

        profile_img = None
        if sp and sp.profile_image:
            profile_img = getattr(sp.profile_image, 'url', None)
        if not profile_img and getattr(request.user, 'profile_image', None):
            profile_img = f"/media/{str(request.user.profile_image).lstrip('/')}"

        dept = getattr(sp, 'home_department', None)
        dept_name = getattr(dept, 'short_name', '') or getattr(dept, 'code', '') if dept else ''

        student_info = {
            'id': request.user.id,
            'name': request.user.get_full_name() or request.user.username,
            'reg_no': sp.reg_no if sp else request.user.username,
            'profile_image': profile_img,
            'department': dept_name,
            'section': sp.section.name if (sp and sp.section) else '',
        }

        return Response({
            'exam_id': exam.id,
            'title': exam.title,
            'course_code': exam.course_code,
            'course_name': exam.course_name,
            'duration_minutes': exam.duration_minutes,
            'remaining_seconds': remaining_seconds,
            'cooldown_seconds': exam.cooldown_seconds or 30,
            'max_violations': exam.max_violations or 3,
            'status': exam.status,
            'is_retest': bool(sub and sub.is_retest_allowed),
            'questions': shuffled_questions,
            'saved_answers': sub.answers if sub else {},
            'student': student_info
        })

    def post(self, request, pk):
        sp = StudentProfile.objects.filter(user=request.user).first()
        if not sp:
            return Response({'error': 'Student profile not found.'}, status=status.HTTP_403_FORBIDDEN)

        exam = OnlineExam.objects.prefetch_related('questions', 'sections').filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        answers = request.data.get('answers', {})
        req_status = request.data.get('status', 'SUBMITTED')
        kicked_reason = request.data.get('kicked_reason', '')
        violations_count = int(request.data.get('violations_count') or 0)
        questions = exam.questions.all()
        total_questions = questions.count()

        # Grade answers (translating student's display option choice back to original question bank option)
        score = 0
        for q in questions:
            user_display_ans = str(
                answers.get(str(q.id)) or
                answers.get(str(q.question_number)) or
                answers.get(q.id) or
                answers.get(q.question_number) or
                ''
            ).strip().upper()

            _, disp_to_orig, _ = get_shuffled_options_for_student(request.user.id, exam.id, q)
            chosen_orig = disp_to_orig.get(user_display_ans, user_display_ans)

            correct = str(q.correct_answer or '').strip().upper()
            if chosen_orig and (chosen_orig == correct or (correct in ['A', 'B', 'C', 'D'] and chosen_orig.startswith(correct))):
                score += 1

        defaults_payload = {
            'student_reg_no': sp.reg_no,
            'student_name': request.user.get_full_name() or request.user.username,
            'answers': answers,
            'score': score,
            'total_questions': total_questions,
            'status': req_status,
            'submitted_at': timezone.now()
        }
        if req_status == 'KICKED':
            defaults_payload['kicked_reason'] = kicked_reason or 'Exceeded malpractice violations.'
            defaults_payload['kicked_at'] = timezone.now()
            defaults_payload['violations_count'] = violations_count
            defaults_payload['is_retest_allowed'] = False

        sub, created = OnlineExamSubmission.objects.update_or_create(
            exam=exam,
            student=request.user,
            defaults=defaults_payload
        )

        return Response({
            'success': True,
            'total_questions': total_questions,
            'status': sub.status,
            'submitted_at': sub.submitted_at
        })


class OnlineExamStudentSaveDraftView(APIView):
    """Save student answers periodically as draft without submitting."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        sp = StudentProfile.objects.filter(user=request.user).first()
        if not sp:
            return Response({'error': 'Student profile not found.'}, status=status.HTTP_403_FORBIDDEN)

        exam = OnlineExam.objects.prefetch_related('questions', 'sections').filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        answers = request.data.get('answers', {})
        total_questions = exam.questions.count()

        sub = OnlineExamSubmission.objects.filter(exam=exam, student=request.user).first()
        if sub and sub.status == 'SUBMITTED':
            return Response({'error': 'Exam has already been submitted.'}, status=status.HTTP_400_BAD_REQUEST)

        if sub and (sub.status == 'KICKED' or sub.is_kicked):
            return Response({
                'success': False,
                'error': 'You have been disqualified from this examination.',
                'is_kicked': True,
                'kicked_reason': sub.kicked_reason or 'Disqualified due to malpractice violation.',
                'exam_status': exam.status,
            }, status=status.HTTP_200_OK)

        if not sub:
            sub = OnlineExamSubmission.objects.create(
                exam=exam,
                student=request.user,
                student_reg_no=sp.reg_no,
                student_name=request.user.get_full_name() or request.user.username,
                answers=answers,
                status='IN_PROGRESS',
                total_questions=total_questions,
            )
        else:
            sub.answers = answers
            sub.status = 'IN_PROGRESS'
            sub.total_questions = total_questions
            sub.save(update_fields=['answers', 'status', 'total_questions'])

        # Check auto status
        exam.check_and_update_auto_status()

        answered_count = len([k for k, v in answers.items() if v])
        return Response({
            'success': True,
            'answered_count': answered_count,
            'exam_status': exam.status,
            'is_kicked': bool(sub.is_kicked),
            'kicked_reason': sub.kicked_reason or '',
        })


class OnlineExamPublishResultsView(APIView):
    """Publish results of an exam so students can view their scores."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        exam = OnlineExam.objects.filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        exam.is_results_published = True
        exam.results_published_at = timezone.now()
        exam.save(update_fields=['is_results_published', 'results_published_at', 'updated_at'])

        serializer = OnlineExamListSerializer(exam)
        return Response({
            'success': True,
            'message': 'Results published successfully.',
            'exam': serializer.data
        })


class OnlineExamLiveSubmissionsView(APIView):
    """Returns live submission status for an exam: both Submitted and Not Submitted students."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        exam = OnlineExam.objects.prefetch_related('sections', 'questions', 'submissions').filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Update auto start if scheduled
        exam.check_and_update_auto_status()

        section_ids = list(exam.sections.values_list('id', flat=True))
        student_profiles = StudentProfile.objects.select_related(
            'user',
            'section',
            'section__batch',
            'section__batch__department',
            'home_department'
        ).filter(
            Q(section_id__in=section_ids) | Q(section_assignments__section_id__in=section_ids, section_assignments__end_date__isnull=True),
            status='ACTIVE'
        ).distinct().order_by('reg_no')

        submissions_map = {sub.student_id: sub for sub in OnlineExamSubmission.objects.filter(exam=exam)}

        total_questions = exam.questions.count()
        submitted_list = []
        not_submitted_list = []
        kicked_list = []

        for sp in student_profiles:
            user = sp.user
            if not user:
                continue

            sub = submissions_map.get(user.id)

            # Profile image url helper
            profile_img = None
            if sp.profile_image:
                profile_img = getattr(sp.profile_image, 'url', None)
            if not profile_img and getattr(user, 'profile_image', None):
                profile_img = f"/media/{str(user.profile_image).lstrip('/')}"

            dept = sp.home_department or getattr(sp.section.batch, 'department', None) if (sp.section and sp.section.batch) else None
            dept_name = getattr(dept, 'short_name', '') or getattr(dept, 'code', '') or ''
            batch_name = sp.batch or (getattr(sp.section.batch, 'name', '') if (sp.section and sp.section.batch) else '')
            sec_name = sp.section.name if sp.section else ''
            sec_id = sp.section_id

            if sub and sub.status == 'KICKED':
                answered_c = len([k for k, v in (sub.answers or {}).items() if v])
                kicked_list.append({
                    'student_id': user.id,
                    'reg_no': sp.reg_no,
                    'name': user.get_full_name() or user.username,
                    'profile_image': profile_img,
                    'department': dept_name,
                    'batch': batch_name,
                    'section': sec_name,
                    'section_id': sec_id,
                    'score': sub.score,
                    'total_questions': sub.total_questions or total_questions,
                    'percentage': round((sub.score / max(1, sub.total_questions or total_questions)) * 100),
                    'status': 'KICKED',
                    'kicked_reason': sub.kicked_reason or 'Proctoring violations exceeded limit',
                    'kicked_at': sub.kicked_at.strftime('%Y-%m-%d %H:%M:%S') if sub.kicked_at else (sub.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if sub.submitted_at else None),
                    'violations_count': sub.violations_count,
                    'is_retest_allowed': sub.is_retest_allowed,
                    'retest_granted_at': sub.retest_granted_at.strftime('%Y-%m-%d %H:%M:%S') if sub.retest_granted_at else None,
                    'answered_count': answered_c
                })
            elif sub and sub.status == 'SUBMITTED':
                answered_c = len([k for k, v in (sub.answers or {}).items() if v])
                submitted_list.append({
                    'student_id': user.id,
                    'reg_no': sp.reg_no,
                    'name': user.get_full_name() or user.username,
                    'profile_image': profile_img,
                    'department': dept_name,
                    'batch': batch_name,
                    'section': sec_name,
                    'section_id': sec_id,
                    'score': sub.score,
                    'total_questions': sub.total_questions or total_questions,
                    'percentage': round((sub.score / max(1, sub.total_questions or total_questions)) * 100),
                    'status': 'SUBMITTED',
                    'submitted_at': sub.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if sub.submitted_at else None,
                    'answered_count': answered_c
                })
            else:
                answered_c = len([k for k, v in (sub.answers or {}).items() if v]) if sub else 0
                not_submitted_list.append({
                    'student_id': user.id,
                    'reg_no': sp.reg_no,
                    'name': user.get_full_name() or user.username,
                    'profile_image': profile_img,
                    'department': dept_name,
                    'batch': batch_name,
                    'section': sec_name,
                    'section_id': sec_id,
                    'status': sub.status if sub else 'NOT_STARTED',
                    'started_at': sub.started_at.strftime('%Y-%m-%d %H:%M:%S') if (sub and sub.started_at) else None,
                    'answered_count': answered_c,
                    'total_questions': total_questions
                })

        exam_data = OnlineExamListSerializer(exam).data

        # Available sections for filtering
        assigned_sections = [
            {'id': s.id, 'name': s.name, 'label': s.name}
            for s in exam.sections.all()
        ]

        return Response({
            'exam': exam_data,
            'sections': assigned_sections,
            'submitted_count': len(submitted_list),
            'not_submitted_count': len(not_submitted_list),
            'kicked_count': len(kicked_list),
            'total_students_count': len(student_profiles),
            'submitted': submitted_list,
            'not_submitted': not_submitted_list,
            'kicked': kicked_list,
        })


class OnlineExamStudentLogView(APIView):
    """Returns question-by-question answered log for a student in an exam."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, student_id):
        exam = OnlineExam.objects.prefetch_related('questions').filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        student_user = User.objects.filter(id=student_id).first()
        if not student_user:
            return Response({'error': 'Student user not found.'}, status=status.HTTP_404_NOT_FOUND)

        sp = StudentProfile.objects.select_related('section', 'section__batch', 'home_department').filter(user=student_user).first()
        sub = OnlineExamSubmission.objects.filter(exam=exam, student=student_user).first()

        profile_img = None
        if sp and sp.profile_image:
            profile_img = getattr(sp.profile_image, 'url', None)
        if not profile_img and getattr(student_user, 'profile_image', None):
            profile_img = f"/media/{str(student_user.profile_image).lstrip('/')}"

        dept = sp.home_department if sp else None
        dept_name = getattr(dept, 'short_name', '') or getattr(dept, 'code', '') or ''
        batch_name = sp.batch if sp else ''
        sec_name = sp.section.name if (sp and sp.section) else ''

        student_info = {
            'id': student_user.id,
            'reg_no': sp.reg_no if sp else student_user.username,
            'name': student_user.get_full_name() or student_user.username,
            'profile_image': profile_img,
            'department': dept_name,
            'batch': batch_name,
            'section': sec_name
        }

        answers_map = sub.answers if (sub and sub.answers) else {}
        questions_log = []

        for q in exam.questions.order_by('question_number'):
            # Find student's answer by question id or question number
            user_display_ans = str(
                answers_map.get(str(q.id)) or
                answers_map.get(str(q.question_number)) or
                answers_map.get(q.id) or
                answers_map.get(q.question_number) or
                ''
            ).strip().upper()

            _, disp_to_orig, _ = get_shuffled_options_for_student(student_user.id, exam.id, q)
            chosen_orig = disp_to_orig.get(user_display_ans, user_display_ans)

            correct = str(q.correct_answer or '').strip().upper()
            is_answered = bool(user_display_ans)
            is_correct = bool(is_answered and (chosen_orig == correct or (correct in ['A', 'B', 'C', 'D'] and chosen_orig.startswith(correct))))

            questions_log.append({
                'id': q.id,
                'question_number': q.question_number,
                'question_text': q.question_text,
                'option_a': q.option_a,
                'option_b': q.option_b,
                'option_c': q.option_c,
                'option_d': q.option_d,
                'correct_answer': correct,
                'selected_answer': chosen_orig,
                'is_answered': is_answered,
                'is_correct': is_correct,
                'co': getattr(q, 'co', 1),
                'marks': getattr(q, 'marks', 1),
            })

        submission_info = {
            'score': sub.score if sub else 0,
            'total_questions': sub.total_questions if sub else exam.questions.count(),
            'percentage': round((sub.score / max(1, sub.total_questions or exam.questions.count())) * 100) if sub else 0,
            'status': sub.status if sub else 'NOT_STARTED',
            'submitted_at': sub.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if (sub and sub.submitted_at) else None,
            'answered_count': len([k for k, v in answers_map.items() if v])
        }

        return Response({
            'exam': {
                'id': exam.id,
                'title': exam.title,
                'course_code': exam.course_code,
                'course_name': exam.course_name,
                'duration_minutes': exam.duration_minutes,
            },
            'student': student_info,
            'submission': submission_info,
            'questions': questions_log,
        })


class OnlineExamStudentKickView(APIView):
    """Marks a candidate's attempt as KICKED when malpractice limits are violated or warning timeout expires."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        sp = StudentProfile.objects.filter(user=request.user).first()
        if not sp:
            return Response({'error': 'Student profile not found.'}, status=status.HTTP_403_FORBIDDEN)

        exam = OnlineExam.objects.filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        reason = request.data.get('reason', 'Exceeded maximum malpractice violations.')
        violations_count = int(request.data.get('violations_count') or exam.max_violations)
        answers = request.data.get('answers', {})

        # Grade partial answers (translating student's shuffled display options)
        score = 0
        questions = exam.questions.all()
        total_questions = questions.count()
        for q in questions:
            user_display_ans = str(
                answers.get(str(q.id)) or
                answers.get(str(q.question_number)) or
                ''
            ).strip().upper()
            _, disp_to_orig, _ = get_shuffled_options_for_student(request.user.id, exam.id, q)
            chosen_orig = disp_to_orig.get(user_display_ans, user_display_ans)
            correct = str(q.correct_answer or '').strip().upper()
            if chosen_orig and (chosen_orig == correct or (correct in ['A', 'B', 'C', 'D'] and chosen_orig.startswith(correct))):
                score += 1

        sub, created = OnlineExamSubmission.objects.update_or_create(
            exam=exam,
            student=request.user,
            defaults={
                'student_reg_no': sp.reg_no,
                'student_name': request.user.get_full_name() or request.user.username,
                'answers': answers,
                'score': score,
                'total_questions': total_questions,
                'status': 'KICKED',
                'kicked_reason': reason,
                'kicked_at': timezone.now(),
                'violations_count': violations_count,
                'is_retest_allowed': False,
            }
        )

        return Response({
            'success': True,
            'message': 'Candidate has been kicked from the exam due to proctoring violation.',
            'status': 'KICKED',
            'kicked_reason': reason
        })


class OnlineExamAllowRetestView(APIView):
    """Allows an administrator to grant a Re-Test for a kicked candidate."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, student_id):
        exam = OnlineExam.objects.filter(pk=pk).first()
        if not exam:
            return Response({'error': 'Exam not found.'}, status=status.HTTP_404_NOT_FOUND)

        student_user = User.objects.filter(id=student_id).first()
        if not student_user:
            return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        sub = OnlineExamSubmission.objects.filter(exam=exam, student=student_user).first()
        if not sub:
            return Response({'error': 'No submission record found for this candidate.'}, status=status.HTTP_404_NOT_FOUND)

        # Allow re-test and reset state
        sub.is_retest_allowed = True
        sub.retest_granted_at = timezone.now()
        sub.retest_granted_by = request.user
        sub.status = 'IN_PROGRESS'
        sub.violations_count = 0
        sub.kicked_reason = ''
        sub.answers = {}
        sub.score = 0
        sub.save()

        return Response({
            'success': True,
            'message': f'Re-test successfully granted for {sub.student_name} ({sub.student_reg_no}).',
            'is_retest_allowed': True
        })

