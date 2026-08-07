"""
IDCS Coder - Views

All API views with proper authentication, role, and resource ownership checks.
Every endpoint verifies:
1. Authentication (JWT)
2. Role
3. Resource ownership (incharge can only access their own courses)
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.contrib.auth import get_user_model

from .models import (
    CodeCourse, CodeCourseIncharge, CodeClass, CodeSectionIncharge,
    CodeEnrollment, CodeSession, CodeAssessment, MCQQuestion,
    CodingProject, ProjectFolder, ProjectFile, LockedCodeRegion,
    TestCase, CodeSubmission, MCQSubmission, StudentProgress,
    CodeExecutionSession,
    CODER_ROLE_ADMIN, CODER_ROLE_COURSE_INCHARGE, CODER_ROLE_SECTION_INCHARGE,
)
from .serializers import (
    CodeCourseSerializer, CodeCourseDetailSerializer,
    CodeCourseInchargeSerializer, CodeClassSerializer,
    CodeSectionInchargeSerializer, CodeSessionSerializer,
    CodeAssessmentSerializer, MCQQuestionAdminSerializer, MCQQuestionStudentSerializer,
    CodingProjectSerializer, ProjectFileSerializer, ProjectFolderSerializer,
    TestCaseAdminSerializer, TestCasePublicSerializer,
    CodeSubmissionSerializer, MCQSubmissionSerializer,
    StudentProgressSerializer, LockedCodeRegionSerializer,
    CodeExecutionSessionSerializer,
)
from .permissions import (
    IsCodeAdmin, IsCodeCourseIncharge, IsCodeSectionIncharge,
    IsCodeAdminOrCourseIncharge, IsAuthenticatedCoder, get_user_coder_role,
)
from .services import (
    import_mcq_from_excel, evaluate_mcq_submission,
    execute_code_in_sandbox, process_submission,
    validate_locked_regions,
)
from .language_config import get_execution_commands, normalise_filename

User = get_user_model()


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def log_api_call(view_name, request, pk_or_id):
    try:
        with open("/home/iqac2/IDCS-Restart/backend/db_diagnostic_extended.log", "a") as f:
            f.write(f"\nAPI CALL view={view_name} path={request.path} method={request.method} pk_or_id={pk_or_id} user={request.user.username}\n")
    except Exception:
        pass

def _get_student_profile(user):
    try:
        return user.student_profile
    except Exception:
        return None


def _get_incharge_courses(user):
    """Return queryset of CodeCourses where user is an active incharge."""
    return CodeCourse.objects.filter(
        incharge_assignments__user=user,
        incharge_assignments__is_active=True,
    ).distinct()


def _get_section_incharge_classes(user):
    """Return queryset of CodeClass where user is an active section incharge."""
    return CodeClass.objects.filter(
        section_incharge_assignments__user=user,
        section_incharge_assignments__is_active=True,
    ).distinct()


def _get_student_accessible_courses(student_profile):
    """Return courses accessible to a student based on their enrollments."""
    return CodeCourse.objects.filter(
        classes__enrollments__student=student_profile,
        classes__enrollments__is_active=True,
        status='ACTIVE',
    ).distinct()


# ---------------------------------------------------------------------------
# /api/coder/me/ — Current user's coder context
# ---------------------------------------------------------------------------

class CoderMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        coder_role = get_user_coder_role(user)
        data = {
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'full_name': f"{user.first_name} {user.last_name}".strip() or user.username,
            'coder_role': coder_role,
        }

        # Add student profile info
        sp = _get_student_profile(user)
        if sp:
            data['student_profile'] = {
                'reg_no': sp.reg_no,
                'section': str(sp.get_current_section()) if sp.get_current_section() else None,
            }

        return Response(data)


# ---------------------------------------------------------------------------
# CODE ADMIN VIEWS
# ---------------------------------------------------------------------------

class AdminCourseListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request):
        courses = CodeCourse.objects.all()
        status_filter = request.query_params.get('status')
        if status_filter:
            courses = courses.filter(status=status_filter)
        serializer = CodeCourseSerializer(courses, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CodeCourseSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminCourseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get_object(self, pk):
        return get_object_or_404(CodeCourse, pk=pk)

    def get(self, request, pk):
        course = self.get_object(pk)
        serializer = CodeCourseDetailSerializer(course)
        return Response(serializer.data)

    def put(self, request, pk):
        course = self.get_object(pk)
        serializer = CodeCourseSerializer(course, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        course = self.get_object(pk)
        course.status = 'ARCHIVED'
        course.save(update_fields=['status'])
        return Response({'detail': 'Course archived.'})


class AdminCourseInchargeView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request):
        course_id = request.query_params.get('course_id')
        qs = CodeCourseIncharge.objects.select_related('user', 'course')
        if course_id:
            qs = qs.filter(course_id=course_id)
        serializer = CodeCourseInchargeSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CodeCourseInchargeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(assigned_by=request.user)
            # Ensure user has CODE_COURSE_INCHARGE role
            _ensure_coder_role(serializer.validated_data['user'], CODER_ROLE_COURSE_INCHARGE)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request):
        incharge_id = request.query_params.get('id')
        if not incharge_id:
            return Response({'detail': 'id required'}, status=400)
        obj = get_object_or_404(CodeCourseIncharge, pk=incharge_id)
        obj.is_active = False
        obj.save(update_fields=['is_active'])
        return Response({'detail': 'Incharge removed.'})


def _sync_section_enrollments(code_class):
    """Syncs IDCS section students into CodeEnrollment."""
    if not code_class.idcs_section:
        return 0
    from academics.models import StudentProfile
    students = StudentProfile.objects.filter(
        section=code_class.idcs_section,
        status='ACTIVE',
    )
    created_count = 0
    for sp in students:
        _, created = CodeEnrollment.objects.get_or_create(
            student=sp,
            code_class=code_class,
            defaults={'is_active': True},
        )
        if created:
            created_count += 1
    return created_count

class AdminUserSearchView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query or len(query) < 2:
            return Response([])
            
        from django.contrib.auth import get_user_model
        from django.db.models import Q
        User = get_user_model()
        
        # Searching staff users by username, email, or name
        users = User.objects.filter(
            Q(username__icontains=query) |
            Q(email__icontains=query) |
            Q(first_name__icontains=query) |
            Q(last_name__icontains=query)
        ).filter(is_active=True).distinct()[:20]
        
        data = [
            {
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'full_name': f"{u.first_name} {u.last_name}".strip() or u.username
            } for u in users
        ]
        return Response(data)

class AdminSectionListView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request):
        from academics.models import Section
        # Only returning active/recent sections (this logic varies per college, we return all for now)
        qs = Section.objects.select_related('batch', 'batch__department').order_by('-batch__start_year', 'batch__department__short_name', 'name')
        
        data = [
            {
                'id': s.id,
                'name': f"{str(s.batch)} - {s.name}"
            } for s in qs
        ]
        return Response(data)

class AdminClassListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request):
        course_id = request.query_params.get('course_id')
        qs = CodeClass.objects.select_related('course', 'idcs_section')
        if course_id:
            qs = qs.filter(course_id=course_id)
        serializer = CodeClassSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CodeClassSerializer(data=request.data)
        if serializer.is_valid():
            code_class = serializer.save()
            _sync_section_enrollments(code_class)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminClassDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request, pk):
        obj = get_object_or_404(CodeClass, pk=pk)
        serializer = CodeClassSerializer(obj)
        return Response(serializer.data)

    def put(self, request, pk):
        obj = get_object_or_404(CodeClass, pk=pk)
        serializer = CodeClassSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            code_class = serializer.save()
            _sync_section_enrollments(code_class)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminSectionInchargeView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request):
        class_id = request.query_params.get('class_id')
        qs = CodeSectionIncharge.objects.select_related('user', 'code_class')
        if class_id:
            qs = qs.filter(code_class_id=class_id)
        serializer = CodeSectionInchargeSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CodeSectionInchargeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(assigned_by=request.user)
            _ensure_coder_role(serializer.validated_data['user'], CODER_ROLE_SECTION_INCHARGE)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminEnrollmentView(APIView):
    """Bulk-sync enrollments from IDCS section to CodeClass."""
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def post(self, request):
        class_id = request.data.get('class_id')
        code_class = get_object_or_404(CodeClass, pk=class_id)

        if not code_class.idcs_section:
            return Response({'detail': 'CodeClass has no linked IDCS section.'}, status=400)

        from academics.models import StudentProfile
        students = StudentProfile.objects.filter(
            section=code_class.idcs_section,
            status='ACTIVE',
        )

        created_count = 0
        for sp in students:
            _, created = CodeEnrollment.objects.get_or_create(
                student=sp,
                code_class=code_class,
                defaults={'is_active': True},
            )
            if created:
                created_count += 1

        return Response({
            'detail': f'Sync complete. {created_count} new enrollments created.',
            'total_students': students.count(),
        })


class AdminAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdmin]

    def get(self, request):
        from django.db.models import Count, Avg
        data = {
            'total_courses': CodeCourse.objects.filter(status='ACTIVE').count(),
            'total_classes': CodeClass.objects.filter(is_active=True).count(),
            'total_enrollments': CodeEnrollment.objects.filter(is_active=True).count(),
            'total_submissions': CodeSubmission.objects.count(),
            'total_mcq_submissions': MCQSubmission.objects.count(),
            'courses': [],
        }
        for course in CodeCourse.objects.filter(status='ACTIVE'):
            data['courses'].append({
                'id': course.id,
                'name': course.name,
                'code': course.code,
                'enrollment_count': CodeEnrollment.objects.filter(
                    code_class__course=course, is_active=True,
                ).count(),
                'submission_count': CodeSubmission.objects.filter(
                    assessment__session__course=course,
                ).count(),
            })
        return Response(data)


# ---------------------------------------------------------------------------
# COURSE INCHARGE VIEWS
# ---------------------------------------------------------------------------

class InchargeCoursesView(APIView):
    permission_classes = [IsAuthenticated, IsCodeCourseIncharge]

    def get(self, request):
        if request.user.is_superuser or _has_role(request.user, CODER_ROLE_ADMIN):
            courses = CodeCourse.objects.all()
        else:
            courses = _get_incharge_courses(request.user)
        serializer = CodeCourseSerializer(courses, many=True)
        return Response(serializer.data)


class InchargeCourseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request, pk):
        course = get_object_or_404(CodeCourse, pk=pk)
        _verify_course_access(request.user, course)
        serializer = CodeCourseDetailSerializer(course)
        return Response(serializer.data)


class InchargeSessionListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        course_id = request.query_params.get('course_id')
        if not course_id:
            return Response({'detail': 'course_id required'}, status=400)
        course = get_object_or_404(CodeCourse, pk=course_id)
        _verify_course_access(request.user, course)
        sessions = CodeSession.objects.filter(course=course).order_by('order')
        serializer = CodeSessionSerializer(sessions, many=True)
        return Response(serializer.data)

    def post(self, request):
        course_id = request.data.get('course')
        course = get_object_or_404(CodeCourse, pk=course_id)
        _verify_course_access(request.user, course)
        serializer = CodeSessionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InchargeSessionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request, pk):
        session = get_object_or_404(CodeSession, pk=pk)
        _verify_course_access(request.user, session.course)
        serializer = CodeSessionSerializer(session)
        return Response(serializer.data)

    def put(self, request, pk):
        session = get_object_or_404(CodeSession, pk=pk)
        _verify_course_access(request.user, session.course)
        serializer = CodeSessionSerializer(session, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        session = get_object_or_404(CodeSession, pk=pk)
        _verify_course_access(request.user, session.course)
        session.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InchargeAssessmentListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        session_id = request.query_params.get('session_id')
        if not session_id:
            return Response({'detail': 'session_id required'}, status=400)
        session = get_object_or_404(CodeSession, pk=session_id)
        _verify_course_access(request.user, session.course)
        assessments = CodeAssessment.objects.filter(session=session)
        serializer = CodeAssessmentSerializer(assessments, many=True)
        return Response(serializer.data)

    def post(self, request):
        session_id = request.data.get('session')
        session = get_object_or_404(CodeSession, pk=session_id)
        _verify_course_access(request.user, session.course)
        serializer = CodeAssessmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InchargeAssessmentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request, pk):
        try:
            from .models import CodeAssessment, CodingProject, CodeCourseIncharge, CodeEnrollment
            lines = []
            lines.append(f"Requested PK: {pk}")
            lines.append(f"User: {request.user.username}")
            
            assessments = []
            for a in CodeAssessment.objects.all():
                project_id = getattr(a, 'coding_project', None)
                if project_id:
                    project_id = project_id.id
                assessments.append(f"Assessment ID={a.id}, Title={a.title}, Type={a.assessment_type}, Status={a.status}, Course={a.session.course.id if a.session else None}, Project={project_id}")
            lines.append("All assessments:")
            lines.extend(assessments)
            
            projects = []
            for p in CodingProject.objects.all():
                projects.append(f"Project ID={p.id}, Assessment={p.assessment_id if p.assessment else None}")
            lines.append("All projects:")
            lines.extend(projects)
            
            incharges = []
            for cci in CodeCourseIncharge.objects.all():
                incharges.append(f"CourseIncharge User={cci.user.username}, Course={cci.course.id}, Active={cci.is_active}")
            lines.append("All course incharges:")
            lines.extend(incharges)
            
            with open("/home/iqac2/IDCS-Restart/backend/db_diagnostic_extended.log", "w") as f:
                f.write("\n".join(lines))
        except Exception as e:
            try:
                with open("/home/iqac2/IDCS-Restart/backend/db_diagnostic_extended.log", "w") as f:
                    f.write(f"Diagnostic error: {e}\n")
            except Exception:
                pass

        assessment = get_object_or_404(CodeAssessment, pk=pk)
        _verify_course_access(request.user, assessment.session.course)
        serializer = CodeAssessmentSerializer(assessment)
        return Response(serializer.data)

    def put(self, request, pk):
        assessment = get_object_or_404(CodeAssessment, pk=pk)
        _verify_course_access(request.user, assessment.session.course)
        serializer = CodeAssessmentSerializer(assessment, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        assessment = get_object_or_404(CodeAssessment, pk=pk)
        _verify_course_access(request.user, assessment.session.course)
        assessment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# MCQ
# ---------------------------------------------------------------------------

class MCQImportView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        assessment_id = request.data.get('assessment_id')
        if not assessment_id:
            return Response({'detail': 'assessment_id required'}, status=400)

        assessment = get_object_or_404(CodeAssessment, pk=assessment_id, assessment_type='MCQ')
        _verify_course_access(request.user, assessment.session.course)

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'file required'}, status=400)

        result = import_mcq_from_excel(assessment, file_obj)
        return Response(result, status=201 if result['created'] > 0 else 400)


class MCQQuestionListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        assessment_id = request.query_params.get('assessment_id')
        if not assessment_id:
            return Response({'detail': 'assessment_id required'}, status=400)
        assessment = get_object_or_404(CodeAssessment, pk=assessment_id)
        _verify_course_access(request.user, assessment.session.course)
        questions = MCQQuestion.objects.filter(assessment=assessment).order_by('order')
        serializer = MCQQuestionAdminSerializer(questions, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = MCQQuestionAdminSerializer(data=request.data)
        if serializer.is_valid():
            assessment = serializer.validated_data['assessment']
            _verify_course_access(request.user, assessment.session.course)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MCQQuestionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def put(self, request, pk):
        q = get_object_or_404(MCQQuestion, pk=pk)
        _verify_course_access(request.user, q.assessment.session.course)
        serializer = MCQQuestionAdminSerializer(q, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        q = get_object_or_404(MCQQuestion, pk=pk)
        _verify_course_access(request.user, q.assessment.session.course)
        q.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Coding Project / Files
# ---------------------------------------------------------------------------

class CodingProjectView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request, assessment_id):
        log_api_call("CodingProjectView.get", request, assessment_id)
        assessment = get_object_or_404(CodeAssessment, pk=assessment_id, assessment_type='CODING')
        _verify_course_access(request.user, assessment.session.course)
        try:
            project = assessment.coding_project
        except CodingProject.DoesNotExist:
            return Response({'detail': 'No project created yet.'}, status=404)
        serializer = CodingProjectSerializer(project)
        return Response(serializer.data)

    def post(self, request, assessment_id):
        assessment = get_object_or_404(CodeAssessment, pk=assessment_id, assessment_type='CODING')
        _verify_course_access(request.user, assessment.session.course)
        data = request.data.copy()
        data['assessment'] = assessment_id
        serializer = CodingProjectSerializer(data=data)
        if serializer.is_valid():
            project = serializer.save()
            _sync_single_file(project)
            return Response(CodingProjectSerializer(project).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, assessment_id):
        assessment = get_object_or_404(CodeAssessment, pk=assessment_id, assessment_type='CODING')
        _verify_course_access(request.user, assessment.session.course)
        project = get_object_or_404(CodingProject, assessment=assessment)
        serializer = CodingProjectSerializer(project, data=request.data, partial=True)
        if serializer.is_valid():
            project = serializer.save()
            _sync_single_file(project)
            return Response(CodingProjectSerializer(project).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

class ProjectFolderListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        project_id = request.query_params.get('project_id')
        if not project_id:
            return Response({'detail': 'project_id required'}, status=400)
        project = get_object_or_404(CodingProject, pk=project_id)
        _verify_course_access(request.user, project.assessment.session.course)
        folders = ProjectFolder.objects.filter(project=project).select_related('parent')
        serializer = ProjectFolderSerializer(folders, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create a folder.  Body: {project, name, parent (optional)}"""
        data = request.data.copy()
        project_id = data.get('project')
        if not project_id:
            return Response({'detail': 'project required'}, status=400)
        project = get_object_or_404(CodingProject, pk=project_id)
        _verify_course_access(request.user, project.assessment.session.course)
        serializer = ProjectFolderSerializer(data=data)
        if serializer.is_valid():
            folder = serializer.save()
            return Response(ProjectFolderSerializer(folder).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectFolderDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def put(self, request, pk):
        """Rename a folder (name only)."""
        folder = get_object_or_404(ProjectFolder, pk=pk)
        _verify_course_access(request.user, folder.project.assessment.session.course)
        serializer = ProjectFolderSerializer(folder, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """Delete a folder — cascades to all sub-folders and files (Django cascade)."""
        folder = get_object_or_404(ProjectFolder, pk=pk)
        _verify_course_access(request.user, folder.project.assessment.session.course)
        if folder.is_locked:
            return Response({'detail': 'Cannot delete locked folder.'}, status=403)
        folder.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTreeView(APIView):
    """Return the full nested project tree (all folders + files) in one response."""
    permission_classes = [IsAuthenticated]

    def get(self, request, assessment_id):
        log_api_call("ProjectTreeView.get", request, assessment_id)
        # Programmatically run migrations
        try:
            from django.core.management import call_command
            call_command('makemigrations', 'coder', interactive=False)
            call_command('migrate', 'coder', interactive=False)
        except Exception as mig_err:
            try:
                with open("/home/iqac2/IDCS-Restart/backend/migrations_run.log", "w") as f:
                    f.write(f"Migration error: {mig_err}\n")
            except Exception:
                pass

        assessment = get_object_or_404(CodeAssessment, pk=assessment_id, assessment_type='CODING')
        
        # Check permissions
        from .permissions import get_user_coder_role
        role = get_user_coder_role(request.user)
        print(f"CODER TREE ACCESS DEBUG: user={request.user} role={role} assessment={assessment.id} course={assessment.session.course.id}")
        
        try:
            if role in ['CODE_ADMIN', 'CODE_COURSE_INCHARGE']:
                _verify_course_access(request.user, assessment.session.course)
            else:
                # Student check
                sp = _get_student_profile(request.user)
                if not sp:
                    print(f"CODER TREE ACCESS DENIED: reason=student_profile_not_found user={request.user}")
                    return Response({'detail': 'Student profile not found.'}, status=404)
                
                # Print enrollment count for debugging
                enroll_exists = CodeEnrollment.objects.filter(
                    student=sp, code_class__course=assessment.session.course, is_active=True,
                ).exists()
                if not enroll_exists:
                    print(f"CODER TREE ACCESS DENIED: reason=not_enrolled user={request.user} student={sp.id} course={assessment.session.course.id}")
                    return Response({'detail': 'Not enrolled in this course.'}, status=403)
        except Exception as e:
            print(f"CODER TREE ACCESS DENIED: exception={e} user={request.user}")
            raise e

        try:
            project = assessment.coding_project
        except CodingProject.DoesNotExist:
            return Response({'detail': 'No project created yet.'}, status=404)

        # Build nested tree
        tree = _build_tree(project)
        return Response(tree)


def _build_tree(project):
    """Build a serialisable nested tree for a project."""
    all_folders = list(ProjectFolder.objects.filter(project=project).select_related('parent').prefetch_related('files'))
    all_root_files = list(ProjectFile.objects.filter(project=project, folder__isnull=True))

    def folder_to_dict(folder):
        return {
            'id': folder.id,
            'type': 'folder',
            'name': folder.name,
            'path': folder.get_path(),
            'is_locked': folder.is_locked,
            'parent': folder.parent_id,
            'children': [folder_to_dict(sf) for sf in all_folders if sf.parent_id == folder.id]
                        + [file_to_dict(f) for f in folder.files.all()],
        }

    def file_to_dict(f):
        return {
            'id': f.id,
            'type': 'file',
            'name': f.name,
            'path': f.get_path(),
            'is_locked': f.is_locked,
            'folder': f.folder_id,
        }

    root_folders = [folder_to_dict(f) for f in all_folders if f.parent_id is None]
    root_files = [file_to_dict(f) for f in all_root_files]

    return {
        'project_id': project.id,
        'workspace_type': project.workspace_type,
        'children': root_folders + root_files,
    }


class ProjectFileListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        project_id = request.query_params.get('project_id')
        if not project_id:
            return Response({'detail': 'project_id required'}, status=400)
        project = get_object_or_404(CodingProject, pk=project_id)
        _verify_course_access(request.user, project.assessment.session.course)
        files = ProjectFile.objects.filter(project=project)
        serializer = ProjectFileSerializer(files, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ProjectFileSerializer(data=request.data)
        if serializer.is_valid():
            project = serializer.validated_data['project']
            _verify_course_access(request.user, project.assessment.session.course)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectFileDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def put(self, request, pk):
        f = get_object_or_404(ProjectFile, pk=pk)
        _verify_course_access(request.user, f.project.assessment.session.course)
        serializer = ProjectFileSerializer(f, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        f = get_object_or_404(ProjectFile, pk=pk)
        _verify_course_access(request.user, f.project.assessment.session.course)
        if f.is_locked:
            return Response({'detail': 'Cannot delete locked file.'}, status=403)
        f.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LockedRegionView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def post(self, request):
        serializer = LockedCodeRegionSerializer(data=request.data)
        if serializer.is_valid():
            f = serializer.validated_data['file']
            _verify_course_access(request.user, f.project.assessment.session.course)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        region = get_object_or_404(LockedCodeRegion, pk=pk)
        _verify_course_access(request.user, region.file.project.assessment.session.course)
        region.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)



# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

class TemplateListView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        from .project_templates import get_templates_grouped
        return Response(get_templates_grouped())


class ApplyTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def post(self, request, project_id):
        project = get_object_or_404(CodingProject, pk=project_id)
        _verify_course_access(request.user, project.assessment.session.course)
        template_id = request.data.get('template_id')
        if not template_id:
            return Response({'detail': 'template_id is required'}, status=400)

        from .project_templates import apply_template as run_apply_template
        try:
            res = run_apply_template(project, template_id)
            return Response(res)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        except Exception as e:
            return Response({'detail': f'Error applying template: {str(e)}'}, status=500)



class ImportZipView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def post(self, request, project_id):
        import zipfile
        import io
        project = get_object_or_404(CodingProject, pk=project_id)
        _verify_course_access(request.user, project.assessment.session.course)

        zip_file = request.FILES.get('file')
        if not zip_file:
            return Response({'detail': 'No zip file provided.'}, status=400)

        if not zipfile.is_zipfile(zip_file):
            return Response({'detail': 'Invalid zip file.'}, status=400)

        try:
            with zipfile.ZipFile(zip_file) as z:
                # Key: relative folder path (e.g. "src/main/java"), Value: ProjectFolder instance
                created_folders = {}

                # Filter out standard metadata/macOS zip files
                valid_infos = [
                    info for info in z.infolist()
                    if not ('__MACOSX' in info.filename or info.filename.split('/')[-1].startswith('.'))
                ]

                # First pass: identify and create directories (to ensure parent folders exist)
                for info in valid_infos:
                    name = info.filename.strip('/')
                    if not name:
                        continue
                    
                    parts = name.split('/')
                    # If it's a directory entry or we extract parts for it
                    if info.is_dir():
                        parent = None
                        path_so_far = ""
                        for part in parts:
                            path_so_far = f"{path_so_far}/{part}" if path_so_far else part
                            if path_so_far not in created_folders:
                                folder, created = ProjectFolder.objects.get_or_create(
                                    project=project,
                                    parent=parent,
                                    name=part,
                                )
                                created_folders[path_so_far] = folder
                            parent = created_folders[path_so_far]

                # Second pass: create files and missing folders implicitly
                for info in valid_infos:
                    if info.is_dir():
                        continue

                    name = info.filename.strip('/')
                    parts = name.split('/')
                    file_name = parts[-1]
                    dir_parts = parts[:-1]
                    
                    parent = None
                    path_so_far = ""
                    for part in dir_parts:
                        path_so_far = f"{path_so_far}/{part}" if path_so_far else part
                        if path_so_far not in created_folders:
                            folder, created = ProjectFolder.objects.get_or_create(
                                project=project,
                                parent=parent,
                                name=part,
                            )
                            created_folders[path_so_far] = folder
                        parent = created_folders[path_so_far]

                    try:
                        content = z.read(info.filename).decode('utf-8')
                    except UnicodeDecodeError:
                        content = z.read(info.filename).decode('utf-8', errors='ignore')

                    ProjectFile.objects.update_or_create(
                        project=project,
                        folder=parent,
                        name=file_name,
                        defaults={'content': content}
                    )

            return Response({'status': 'success', 'message': 'Zip file imported successfully.'})
        except Exception as e:
            return Response({'detail': f'Error extracting zip: {str(e)}'}, status=500)


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

class TestCaseListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        assessment_id = request.query_params.get('assessment_id')
        log_api_call("TestCaseListCreateView.get", request, assessment_id)
        if not assessment_id:
            return Response({'detail': 'assessment_id required'}, status=400)
        assessment = get_object_or_404(CodeAssessment, pk=assessment_id)
        _verify_course_access(request.user, assessment.session.course)
        test_cases = TestCase.objects.filter(assessment=assessment).order_by('order')
        serializer = TestCaseAdminSerializer(test_cases, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = TestCaseAdminSerializer(data=request.data)
        if serializer.is_valid():
            assessment = serializer.validated_data['assessment']
            _verify_course_access(request.user, assessment.session.course)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TestCaseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def put(self, request, pk):
        tc = get_object_or_404(TestCase, pk=pk)
        _verify_course_access(request.user, tc.assessment.session.course)
        serializer = TestCaseAdminSerializer(tc, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        tc = get_object_or_404(TestCase, pk=pk)
        _verify_course_access(request.user, tc.assessment.session.course)
        tc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# STUDENT VIEWS
# ---------------------------------------------------------------------------

class StudentCoursesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)
        courses = _get_student_accessible_courses(sp)
        serializer = CodeCourseSerializer(courses, many=True)
        return Response(serializer.data)


class StudentCourseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)
        course = get_object_or_404(CodeCourse, pk=pk, status='ACTIVE')
        # Verify enrollment
        if not CodeEnrollment.objects.filter(
            student=sp, code_class__course=course, is_active=True,
        ).exists():
            return Response({'detail': 'You are not enrolled in this course.'}, status=403)

        sessions = CodeSession.objects.filter(
            course=course, is_published=True,
        ).order_by('order')

        # Get progress
        progress, _ = StudentProgress.objects.get_or_create(
            student=sp, course=course,
            defaults={'completed_sessions': [], 'in_progress_sessions': []},
        )

        session_data = []
        for s in sessions:
            session_data.append({
                'id': s.id,
                'title': s.title,
                'description': s.description,
                'order': s.order,
                'session_type': s.session_type,
                'status': (
                    'completed' if s.id in progress.completed_sessions
                    else 'in_progress' if s.id in progress.in_progress_sessions
                    else 'not_started'
                ),
                'assessment_count': s.assessments.filter(status='PUBLISHED').count(),
            })

        return Response({
            'id': course.id,
            'name': course.name,
            'code': course.code,
            'description': course.description,
            'progress_percentage': progress.percentage,
            'sessions': session_data,
        })


class StudentAssessmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            with open("/home/iqac2/IDCS-Restart/backend/db_diagnostic.log", "a") as f:
                f.write(f"\n--- StudentAssessmentDetailView.get pk={pk} ---\n")
                f.write(f"User: {request.user.username}\n")
        except Exception:
            pass

        sp = _get_student_profile(request.user)
        try:
            with open("/home/iqac2/IDCS-Restart/backend/db_diagnostic.log", "a") as f:
                f.write(f"Student Profile Found: {sp is not None}\n")
        except Exception:
            pass

        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)

        assessment = get_object_or_404(CodeAssessment, pk=pk, status='PUBLISHED')
        course = assessment.session.course

        # Verify enrollment
        if not CodeEnrollment.objects.filter(
            student=sp, code_class__course=course, is_active=True,
        ).exists():
            return Response({'detail': 'Not enrolled in this course.'}, status=403)

        # Check attempt limits
        if assessment.assessment_type == 'MCQ':
            attempt_count = MCQSubmission.objects.filter(student=sp, assessment=assessment).count()
        else:
            attempt_count = CodeSubmission.objects.filter(student=sp, assessment=assessment).count()

        if attempt_count >= assessment.max_attempts:
            return Response({
                'detail': 'Maximum attempts exceeded.',
                'attempts_used': attempt_count,
                'max_attempts': assessment.max_attempts,
            }, status=403)

        data = CodeAssessmentSerializer(assessment).data

        if assessment.assessment_type == 'MCQ':
            questions = MCQQuestion.objects.filter(assessment=assessment).order_by('order')
            data['questions'] = MCQQuestionStudentSerializer(questions, many=True).data
        elif assessment.assessment_type == 'CODING':
            try:
                project = assessment.coding_project
                data['coding_project'] = CodingProjectSerializer(project).data
                # Public test cases only (hidden ones not sent to student)
                public_tcs = TestCase.objects.filter(assessment=assessment, is_hidden=False).order_by('order')
                data['public_test_cases'] = TestCasePublicSerializer(public_tcs, many=True).data
                # All project files (students need them to load in the IDE)
                files = ProjectFile.objects.filter(project=project).select_related('folder')
                data['project_files'] = ProjectFileSerializer(files, many=True).data
            except CodingProject.DoesNotExist:
                data['coding_project'] = None
                data['public_test_cases'] = []
                data['project_files'] = []

        data['attempts_used'] = attempt_count

        return Response(data)


class StudentDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)

        courses = _get_student_accessible_courses(sp)
        enrolled_courses = []

        for course in courses:
            try:
                progress = StudentProgress.objects.get(student=sp, course=course)
                pct = progress.percentage
            except StudentProgress.DoesNotExist:
                pct = 0

            enrolled_courses.append({
                'id': course.id,
                'name': course.name,
                'code': course.code,
                'progress_percentage': pct,
                'status': course.status,
            })

        # Recent submissions
        recent_code_subs = CodeSubmission.objects.filter(
            student=sp,
        ).order_by('-submitted_at')[:5]
        recent_mcq_subs = MCQSubmission.objects.filter(
            student=sp,
        ).order_by('-submitted_at')[:5]

        recent_results = []
        for s in recent_code_subs:
            recent_results.append({
                'type': 'CODING',
                'assessment_title': s.assessment.title,
                'score': s.score,
                'total_score': s.total_score,
                'submitted_at': s.submitted_at,
                'status': s.status,
            })
        for s in recent_mcq_subs:
            recent_results.append({
                'type': 'MCQ',
                'assessment_title': s.assessment.title,
                'score': s.score,
                'total_score': s.total_score,
                'submitted_at': s.submitted_at,
            })

        recent_results.sort(key=lambda x: x['submitted_at'], reverse=True)

        # Upcoming assessments
        from django.utils import timezone
        upcoming = CodeAssessment.objects.filter(
            session__course__in=courses,
            status='PUBLISHED',
            end_time__gte=timezone.now(),
        ).order_by('end_time')[:5]

        return Response({
            'student_name': f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username,
            'reg_no': sp.reg_no,
            'enrolled_courses': enrolled_courses,
            'recent_results': recent_results[:5],
            'upcoming_assessments': CodeAssessmentSerializer(upcoming, many=True).data,
        })


# ---------------------------------------------------------------------------
# MCQ Submit (Student)
# ---------------------------------------------------------------------------

class StudentMCQSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, assessment_id):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)

        assessment = get_object_or_404(CodeAssessment, pk=assessment_id, assessment_type='MCQ', status='PUBLISHED')

        # Verify enrollment
        if not CodeEnrollment.objects.filter(
            student=sp, code_class__course=assessment.session.course, is_active=True,
        ).exists():
            return Response({'detail': 'Not enrolled in this course.'}, status=403)

        # Check attempts
        attempt_count = MCQSubmission.objects.filter(student=sp, assessment=assessment).count()
        if attempt_count >= assessment.max_attempts:
            return Response({'detail': 'Maximum attempts exceeded.'}, status=403)

        answers = request.data.get('answers', {})
        if not isinstance(answers, dict):
            return Response({'detail': 'answers must be an object {question_id: answer}'}, status=400)

        # Evaluate — backend decides correctness
        result = evaluate_mcq_submission(assessment, answers)

        submission = MCQSubmission.objects.create(
            student=sp,
            assessment=assessment,
            attempt_number=attempt_count + 1,
            answers=answers,
            score=result['score'],
            total_score=result['total_score'],
            result_details=result['result_details'],
        )

        return Response({
            'submission_id': submission.id,
            'score': submission.score,
            'total_score': submission.total_score,
            'attempt_number': submission.attempt_number,
            'result_details': submission.result_details,
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Code Run / Submit (Student)
# ---------------------------------------------------------------------------

class StudentCodeRunView(APIView):
    """Run code against PUBLIC test cases only."""
    permission_classes = [IsAuthenticated]

    def post(self, request, assessment_id):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)

        assessment = get_object_or_404(
            CodeAssessment, pk=assessment_id, assessment_type='CODING', status='PUBLISHED',
        )

        if not CodeEnrollment.objects.filter(
            student=sp, code_class__course=assessment.session.course, is_active=True,
        ).exists():
            return Response({'detail': 'Not enrolled.'}, status=403)

        files = request.data.get('files', {})  # {filepath: content}
        language = request.data.get('language', '')

        # Validate locked regions
        from .services import validate_locked_regions
        is_valid, err_msg = validate_locked_regions(assessment_id, files)
        if not is_valid:
            return Response({'detail': err_msg}, status=403)

        try:
            project = assessment.coding_project
            time_limit = project.time_limit_seconds
            mem_limit = project.memory_limit_mb
            if project.workspace_type == 'SINGLE_FILE':
                filename = normalise_filename(project.single_file_name, project.single_file_language)
                cmds = get_execution_commands(project.single_file_language, filename)
                build_cmd = cmds['build_command']
                run_cmd = cmds['run_command']
                language = project.single_file_language
            else:
                build_cmd = project.build_command
                run_cmd = project.run_command
        except CodingProject.DoesNotExist:
            return Response({'detail': 'No project configured for this assessment.'}, status=400)

        # Run only PUBLIC test cases
        public_tests = list(TestCase.objects.filter(
            assessment=assessment, is_hidden=False,
        ).order_by('order'))

        # If no public test cases, run once with empty stdin for compile feedback
        if not public_tests:
            exec_result = execute_code_in_sandbox(
                files=files,
                language=language,
                build_command=build_cmd,
                run_command=run_cmd,
                input_data='',
                time_limit=time_limit,
                memory_limit_mb=mem_limit,
            )
            return Response({
                'results': [],
                'stdout': exec_result.get('stdout', ''),
                'stderr': exec_result.get('stderr', ''),
                'exit_code': exec_result.get('exit_code', 0),
                'execution_time_ms': exec_result.get('execution_time_ms', 0),
            })

        results = []
        for tc in public_tests:
            exec_result = execute_code_in_sandbox(
                files=files,
                language=language,
                build_command=build_cmd,
                run_command=run_cmd,
                input_data=tc.input_data,
                time_limit=time_limit,
                memory_limit_mb=mem_limit,
            )
            actual = exec_result.get('stdout', '').strip()
            expected = tc.expected_output.strip()
            passed = actual == expected and exec_result.get('exit_code', 1) == 0
            results.append({
                'test_id': tc.id,
                'description': tc.description,
                'input': tc.input_data,
                'expected': tc.expected_output,
                'actual': actual,
                'stderr': exec_result.get('stderr', ''),
                'passed': passed,
                'execution_time_ms': exec_result.get('execution_time_ms', 0),
            })

        return Response({'results': results})


class StudentCodeSubmitView(APIView):
    """Full submission: validate locked regions + public + hidden tests."""
    permission_classes = [IsAuthenticated]

    def post(self, request, assessment_id):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)

        assessment = get_object_or_404(
            CodeAssessment, pk=assessment_id, assessment_type='CODING', status='PUBLISHED',
        )

        if not CodeEnrollment.objects.filter(
            student=sp, code_class__course=assessment.session.course, is_active=True,
        ).exists():
            return Response({'detail': 'Not enrolled.'}, status=403)

        attempt_count = CodeSubmission.objects.filter(student=sp, assessment=assessment).count()
        if attempt_count >= assessment.max_attempts:
            return Response({'detail': 'Maximum attempts exceeded.'}, status=403)

        files = request.data.get('files', {})
        language = request.data.get('language', '')

        # Step 1: Validate locked regions BEFORE saving
        is_valid, err_msg = validate_locked_regions(assessment.id, files)
        if not is_valid:
            return Response({'detail': err_msg}, status=403)

        # Step 2: Save submission
        with transaction.atomic():
            submission = CodeSubmission.objects.create(
                student=sp,
                assessment=assessment,
                attempt_number=attempt_count + 1,
                source_snapshot=files,
                language=language,
                status='PENDING',
            )

        # Step 3: Process asynchronously (using threading for now; use Celery in production)
        import threading
        t = threading.Thread(target=process_submission, args=(submission.id,))
        t.daemon = True
        t.start()

        return Response({
            'submission_id': submission.id,
            'status': 'PENDING',
            'message': 'Submission received. Results will be available shortly.',
        }, status=status.HTTP_201_CREATED)


class StudentSubmissionStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, submission_id):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)
        submission = get_object_or_404(CodeSubmission, pk=submission_id, student=sp)
        serializer = CodeSubmissionSerializer(submission)
        return Response(serializer.data)


class StudentProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id):
        sp = _get_student_profile(request.user)
        if not sp:
            return Response({'detail': 'Student profile not found.'}, status=404)
        course = get_object_or_404(CodeCourse, pk=course_id)
        progress, _ = StudentProgress.objects.get_or_create(
            student=sp, course=course,
            defaults={'completed_sessions': [], 'in_progress_sessions': []},
        )
        serializer = StudentProgressSerializer(progress)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# SECTION INCHARGE VIEWS (READ-ONLY)
# ---------------------------------------------------------------------------

class SectionInchargeClassesView(APIView):
    permission_classes = [IsAuthenticated, IsCodeSectionIncharge]

    def get(self, request):
        if _has_role(request.user, CODER_ROLE_ADMIN):
            classes = CodeClass.objects.all()
        else:
            classes = _get_section_incharge_classes(request.user)
        serializer = CodeClassSerializer(classes, many=True)
        return Response(serializer.data)


class SectionInchargeStudentsView(APIView):
    """List students in a section with their progress."""
    permission_classes = [IsAuthenticated, IsCodeSectionIncharge]

    def get(self, request, class_id):
        code_class = get_object_or_404(CodeClass, pk=class_id)
        _verify_section_incharge_access(request.user, code_class)

        enrollments = CodeEnrollment.objects.filter(
            code_class=code_class, is_active=True,
        ).select_related('student__user')

        students_data = []
        course = code_class.course

        for enr in enrollments:
            sp = enr.student
            try:
                progress = StudentProgress.objects.get(student=sp, course=course)
                pct = progress.percentage
                overall_score = progress.overall_score
                total_possible = progress.total_possible_score
            except StudentProgress.DoesNotExist:
                pct = 0
                overall_score = 0
                total_possible = 0

            # MCQ vs coding breakdowns
            mcq_count = MCQSubmission.objects.filter(student=sp, assessment__session__course=course).count()
            coding_count = CodeSubmission.objects.filter(
                student=sp, assessment__session__course=course, status__in=['PASSED', 'FAILED'],
            ).count()

            students_data.append({
                'reg_no': sp.reg_no,
                'student_id': sp.id,
                'name': f"{sp.user.first_name} {sp.user.last_name}".strip() or sp.user.username,
                'section': str(sp.get_current_section()) if sp.get_current_section() else None,
                'progress_percentage': pct,
                'overall_score': overall_score,
                'total_possible_score': total_possible,
                'mcq_submissions': mcq_count,
                'coding_submissions': coding_count,
            })

        return Response({
            'class': CodeClassSerializer(code_class).data,
            'course': {'id': course.id, 'name': course.name, 'code': course.code},
            'students': students_data,
        })


class SectionInchargeStudentDetailView(APIView):
    """Detailed progress for a specific student — READ-ONLY."""
    permission_classes = [IsAuthenticated, IsCodeSectionIncharge]

    def get(self, request, class_id, student_id):
        code_class = get_object_or_404(CodeClass, pk=class_id)
        _verify_section_incharge_access(request.user, code_class)

        from academics.models import StudentProfile
        sp = get_object_or_404(StudentProfile, pk=student_id)

        # Verify student is enrolled
        if not CodeEnrollment.objects.filter(student=sp, code_class=code_class, is_active=True).exists():
            return Response({'detail': 'Student not in this class.'}, status=404)

        course = code_class.course
        sessions = CodeSession.objects.filter(course=course, is_published=True).order_by('order')

        try:
            progress = StudentProgress.objects.get(student=sp, course=course)
        except StudentProgress.DoesNotExist:
            progress = None

        # Build flat submission lists for the frontend
        full_name = f"{sp.user.first_name} {sp.user.last_name}".strip() or sp.user.username
        code_subs_qs = CodeSubmission.objects.filter(
            student=sp, assessment__session__course=course
        ).order_by('-submitted_at').select_related('assessment')

        mcq_subs_qs = MCQSubmission.objects.filter(
            student=sp, assessment__session__course=course
        ).order_by('-submitted_at').select_related('assessment')

        code_subs_data = [{
            'id': s.id,
            'assessment_id': s.assessment.id,
            'assessment_title': s.assessment.title,
            'attempt_number': s.attempt_number,
            'status': s.status,
            'score': s.score,
            'total_score': s.total_score,
            'passed_tests': s.passed_tests,
            'failed_tests': s.failed_tests,
            'submitted_at': s.submitted_at,
        } for s in code_subs_qs]

        mcq_subs_data = [{
            'id': s.id,
            'assessment_id': s.assessment.id,
            'assessment_title': s.assessment.title,
            'attempt_number': s.attempt_number,
            'score': s.score,
            'total_score': s.total_score,
            'submitted_at': s.submitted_at,
        } for s in mcq_subs_qs]

        # Count completed sessions
        sessions_completed = len(progress.completed_sessions) if progress else 0

        return Response({
            'student_name': full_name,
            'reg_no': sp.reg_no,
            'section_name': str(sp.get_current_section()) if sp.get_current_section() else None,
            'overall_score': progress.overall_score if progress else 0,
            'total_possible_score': progress.total_possible_score if progress else 0,
            'sessions_completed': sessions_completed,
            'code_submissions': code_subs_data,
            'mcq_submissions': mcq_subs_data,
        })


class SectionInchargeAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsCodeSectionIncharge]

    def get(self, request, class_id):
        code_class = get_object_or_404(CodeClass, pk=class_id)
        _verify_section_incharge_access(request.user, code_class)

        course = code_class.course
        enrollments = CodeEnrollment.objects.filter(code_class=code_class, is_active=True)
        total_students = enrollments.count()

        sessions = CodeSession.objects.filter(course=course, is_published=True)
        total_sessions = sessions.count()

        # Count students who have submitted at least one assessment per type
        student_ids = enrollments.values_list('student_id', flat=True)

        mcq_submitted = MCQSubmission.objects.filter(
            student_id__in=student_ids,
            assessment__session__course=course,
        ).values('student').distinct().count()

        coding_submitted = CodeSubmission.objects.filter(
            student_id__in=student_ids,
            assessment__session__course=course,
        ).values('student').distinct().count()

        # Per-student score aggregation
        student_scores = []
        total_sub_count = 0
        score_pcts = []

        for enrollment in enrollments.select_related('student__user'):
            sp = enrollment.student
            try:
                progress = StudentProgress.objects.get(student=sp, course=course)
                pct = progress.percentage
                overall = progress.overall_score
                possible = progress.total_possible_score
            except StudentProgress.DoesNotExist:
                pct = 0
                overall = 0
                possible = 0

            code_count = CodeSubmission.objects.filter(
                student=sp, assessment__session__course=course
            ).count()
            mcq_count = MCQSubmission.objects.filter(
                student=sp, assessment__session__course=course
            ).count()

            total_sub_count += code_count + mcq_count
            score_pcts.append(pct)

            full_name = f"{sp.user.first_name} {sp.user.last_name}".strip() or sp.user.username

            student_scores.append({
                'student_id': sp.id,
                'student_name': full_name,
                'reg_no': sp.reg_no,
                'overall_score': overall,
                'total_possible_score': possible,
                'percentage': pct,
                'code_submission_count': code_count,
                'mcq_submission_count': mcq_count,
            })

        avg_pct = round(sum(score_pcts) / len(score_pcts), 1) if score_pcts else 0
        top_pct = max(score_pcts) if score_pcts else 0

        return Response({
            'class': CodeClassSerializer(code_class).data,
            'course': {'id': course.id, 'name': course.name, 'code': course.code},
            'total_students': total_students,
            'total_sessions': total_sessions,
            'total_submissions': total_sub_count,
            'students_with_mcq_submissions': mcq_submitted,
            'students_with_coding_submissions': coding_submitted,
            'mcq_completion_rate': round(mcq_submitted / total_students * 100, 1) if total_students else 0,
            'coding_completion_rate': round(coding_submitted / total_students * 100, 1) if total_students else 0,
            'avg_score_pct': avg_pct,
            'top_score_pct': top_pct,
            'student_scores': student_scores,
        })


# ---------------------------------------------------------------------------
# Submission views for incharges
# ---------------------------------------------------------------------------

class InchargeSubmissionsView(APIView):
    permission_classes = [IsAuthenticated, IsCodeAdminOrCourseIncharge]

    def get(self, request):
        assessment_id = request.query_params.get('assessment_id')
        if not assessment_id:
            return Response({'detail': 'assessment_id required'}, status=400)

        assessment = get_object_or_404(CodeAssessment, pk=assessment_id)
        _verify_course_access(request.user, assessment.session.course)

        if assessment.assessment_type == 'MCQ':
            subs = MCQSubmission.objects.filter(assessment=assessment).order_by('-submitted_at')
            serializer = MCQSubmissionSerializer(subs, many=True)
        else:
            subs = CodeSubmission.objects.filter(assessment=assessment).order_by('-submitted_at')
            serializer = CodeSubmissionSerializer(subs, many=True)

        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _has_role(user, role_name):
    return user.user_roles.filter(role__name=role_name).exists()


def _verify_course_access(user, course):
    """Raise PermissionError if user is not admin or incharge for this course."""
    if user.is_superuser or _has_role(user, CODER_ROLE_ADMIN):
        return
    if not CodeCourseIncharge.objects.filter(
        course=course, user=user, is_active=True,
    ).exists():
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('You are not authorized to access this course.')


def _verify_section_incharge_access(user, code_class):
    """Raise PermissionError if user is not admin or section incharge for this class."""
    if user.is_superuser or _has_role(user, CODER_ROLE_ADMIN):
        return
    if not CodeSectionIncharge.objects.filter(
        code_class=code_class, user=user, is_active=True,
    ).exists():
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('You are not authorized to access this class.')


def _ensure_coder_role(user, role_name):
    """Ensure user has the given coder role, creating it if not exists."""
    try:
        from accounts.models import Role, UserRole
        role, _ = Role.objects.get_or_create(name=role_name)
        UserRole.objects.get_or_create(user=user, role=role)
    except Exception as e:
        import logging
        logging.warning(f'Failed to ensure coder role {role_name} for user {user}: {e}')


def _sync_single_file(project) -> None:
    """
    For SINGLE_FILE projects: ensure exactly one ProjectFile exists at root
    with the correct filename derived from single_file_name + single_file_language.
    Preserves existing file content when renaming.
    """
    if project.workspace_type != 'SINGLE_FILE':
        return

    from .language_config import normalise_filename, get_extension
    target_name = normalise_filename(project.single_file_name, project.single_file_language)

    # Update supported_languages to match the chosen language
    ext = get_extension(project.single_file_language)
    if not project.supported_languages or project.supported_languages != [ext]:
        project.supported_languages = [ext]
        project.save(update_fields=['supported_languages'])

    # Check existing root-level files
    existing_files = ProjectFile.objects.filter(project=project, folder__isnull=True)

    if existing_files.count() == 1:
        existing = existing_files.first()
        if existing.name != target_name:
            # Rename to match new name/language
            existing.name = target_name
            existing.save(update_fields=['name'])
        # File already exists with correct name — nothing to do
    elif existing_files.count() == 0:
        # Create the file with empty starter content
        ProjectFile.objects.create(
            project=project,
            folder=None,
            name=target_name,
            content='',
            is_locked=False,
        )
    # If multiple root files exist (shouldn't happen in single-file mode), leave them alone



# ---------------------------------------------------------------------------
# Execution Session Views (Web Preview)
# ---------------------------------------------------------------------------

class ExecutionSessionStartView(APIView):
    """Start a new web execution session for a student."""
    permission_classes = [IsAuthenticated]

    def post(self, request, assessment_id):
        import threading
        from datetime import timedelta
        from django.utils import timezone
        from .execution.manager import start_execution_session
        from .execution.docker_runner import docker_available

        # Get student profile
        student = _get_student_profile(request.user)
        if not student:
            return Response({'detail': 'Student profile required.'}, status=403)

        # Get assessment and validate access
        assessment = get_object_or_404(CodeAssessment, pk=assessment_id, status='PUBLISHED')
        _verify_student_enrollment(student, assessment)

        # Get project config
        try:
            project = assessment.coding_project
        except CodingProject.DoesNotExist:
            return Response({'detail': 'No project configuration for this assessment.'}, status=400)

        if not project.preview_enabled:
            return Response({'detail': 'Preview is not enabled for this assessment.'}, status=400)

        # Stop any existing RUNNING session for this student+assessment
        existing = CodeExecutionSession.objects.filter(
            student=student,
            assessment=assessment,
            status__in=['RUNNING', 'BUILDING', 'STARTING', 'QUEUED'],
        ).first()
        if existing and existing.container_id:
            from .execution.docker_runner import stop_container
            stop_container(existing.container_id)
            existing.status = 'STOPPED'
            existing.stopped_at = timezone.now()
            existing.save(update_fields=['status', 'stopped_at'])

        # Get snapshot files from request body
        files = request.data.get('files', {})

        # Validate locked regions
        from .services import validate_locked_regions
        is_valid, err_msg = validate_locked_regions(assessment_id, files)
        if not is_valid:
            return Response({'detail': err_msg}, status=403)

        # Create new session
        expires_at = timezone.now() + timedelta(minutes=30)
        session = CodeExecutionSession.objects.create(
            student=student,
            assessment=assessment,
            status='QUEUED',
            expires_at=expires_at,
            source_snapshot=files,
        )

        # Launch build + start in background thread
        t = threading.Thread(
            target=start_execution_session,
            args=(session.id,),
            daemon=True,
        )
        t.start()

        serializer = CodeExecutionSessionSerializer(session)
        return Response(serializer.data, status=202)


class ExecutionSessionDetailView(APIView):
    """Get status and logs for an execution session."""
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        student = _get_student_profile(request.user)
        if not student:
            return Response({'detail': 'Student profile required.'}, status=403)

        session = get_object_or_404(CodeExecutionSession, pk=session_id, student=student)
        serializer = CodeExecutionSessionSerializer(session)
        return Response(serializer.data)


class ExecutionSessionStopView(APIView):
    """Stop a running execution session."""
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        student = _get_student_profile(request.user)
        if not student:
            return Response({'detail': 'Student profile required.'}, status=403)

        session = get_object_or_404(CodeExecutionSession, pk=session_id, student=student)
        from .execution.manager import stop_execution_session
        stop_execution_session(session.id)
        session.refresh_from_db()
        serializer = CodeExecutionSessionSerializer(session)
        return Response(serializer.data)


class ExecutionSessionLogsView(APIView):
    """Get live logs from a running container."""
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        student = _get_student_profile(request.user)
        if not student:
            return Response({'detail': 'Student profile required.'}, status=403)

        session = get_object_or_404(CodeExecutionSession, pk=session_id, student=student)
        from .execution.docker_runner import get_container_logs
        if session.container_id and session.status in ('RUNNING', 'STARTING'):
            logs = get_container_logs(session.container_id, tail=300)
        else:
            logs = session.build_log + '\n' + session.run_log
        return Response({'logs': logs})


# ---------------------------------------------------------------------------
# Preview Proxy View
# ---------------------------------------------------------------------------

from django.http import HttpResponse, StreamingHttpResponse
import urllib.request
import urllib.error


from django.views.decorators.clickjacking import xframe_options_exempt
from django.utils.decorators import method_decorator
from rest_framework.permissions import AllowAny

@method_decorator(xframe_options_exempt, name='dispatch')
class PreviewProxyView(APIView):
    """
    Secure preview proxy.
    Routes: /api/coder/preview/<token>/<subpath>/
    Proxies to: http://127.0.0.1:<container_host_port>/<subpath>

    Security:
    - Token-based verification via preview_token
    - Session must be RUNNING and not expired
    - Only proxies to 127.0.0.1 (localhost) on dynamically allocated ports, preventing SSRF
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def _proxy(self, request, token, subpath=''):
        from django.utils import timezone

        try:
            session = CodeExecutionSession.objects.get(
                preview_token=token,
            )
        except CodeExecutionSession.DoesNotExist:
            return HttpResponse('Preview not available or session expired.', status=404)

        if session.status in ('QUEUED', 'BUILDING', 'STARTING'):
            return HttpResponse('Application is still starting...', status=202)
        elif session.status != 'RUNNING':
            return HttpResponse(f'Preview session is not running (status: {session.status}).', status=410)

        if session.expires_at < timezone.now():
            return HttpResponse('Preview session has expired.', status=410)

        if not session.internal_port:
            return HttpResponse('Preview port not configured.', status=503)

        target_url = f'http://127.0.0.1:{session.internal_port}/{subpath}'
        if request.META.get('QUERY_STRING'):
            target_url += '?' + request.META['QUERY_STRING']

        # Update last activity
        from django.utils import timezone as tz
        CodeExecutionSession.objects.filter(pk=session.pk).update(last_activity=tz.now())

        # Forward the request
        method = request.method.upper()
        body = request.body if method in ('POST', 'PUT', 'PATCH') else None

        # Build headers (forward content-type, accept, etc.)
        headers = {}
        for key, val in request.META.items():
            if key.startswith('HTTP_') and key not in ('HTTP_HOST', 'HTTP_COOKIE'):
                name = key[5:].replace('_', '-').title()
                headers[name] = val
        if 'CONTENT_TYPE' in request.META:
            headers['Content-Type'] = request.META['CONTENT_TYPE']

        try:
            req = urllib.request.Request(
                target_url,
                data=body,
                headers=headers,
                method=method,
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                content = resp.read()
                response = HttpResponse(
                    content,
                    status=resp.status,
                    content_type=resp.headers.get('Content-Type', 'text/html'),
                )
                # Forward select headers
                for header in ('Content-Encoding', 'Cache-Control'):
                    val = resp.headers.get(header)
                    if val:
                        response[header] = val
                response['X-Frame-Options'] = 'ALLOWALL'
                return response

        except urllib.error.HTTPError as e:
            content = e.read()
            response = HttpResponse(content, status=e.code,
                                    content_type=e.headers.get('Content-Type', 'text/html'))
            response['X-Frame-Options'] = 'ALLOWALL'
            return response
        except urllib.error.URLError as e:
            return HttpResponse(f'Could not connect to application: {e.reason}', status=502)
        except Exception as e:
            return HttpResponse(f'Proxy error: {e}', status=500)

    def get(self, request, token, subpath=''):
        return self._proxy(request, token, subpath)

    def post(self, request, token, subpath=''):
        return self._proxy(request, token, subpath)


# ---------------------------------------------------------------------------
# Helper: get student profile from user
# ---------------------------------------------------------------------------

def _get_student_profile(user):
    try:
        return user.student_profile
    except Exception:
        return None


def _verify_student_enrollment(student, assessment):
    """Raise PermissionDenied if student isn't enrolled in any class for this course."""
    from rest_framework.exceptions import PermissionDenied
    course = assessment.session.course
    enrolled = CodeEnrollment.objects.filter(
        student=student,
        code_class__course=course,
        is_active=True,
    ).exists()
    if not enrolled:
        raise PermissionDenied('You are not enrolled in this course.')
