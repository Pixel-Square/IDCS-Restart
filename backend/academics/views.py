from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.db import transaction

from .permissions import IsHODOfDepartment

from .models import (
    TeachingAssignment,
    SectionAdvisor,
    DepartmentRole,
    Section,
    StaffProfile,
    AcademicYear,
    StudentProfile,
)
from .models import PeriodAttendanceSession, PeriodAttendanceRecord

from .serializers import (
    SectionAdvisorSerializer,
    TeachingAssignmentSerializer,
    StudentSimpleSerializer,
)
from .serializers import AcademicYearSerializer
from .serializers import PeriodAttendanceSessionSerializer, BulkPeriodAttendanceSerializer
from accounts.utils import get_user_permissions
from .utils import get_user_effective_departments
from .serializers import TeachingAssignmentInfoSerializer
from rest_framework import routers
from django.db.models import Q


# Attendance endpoints removed.


def serializer_check_user_can_manage(user, teaching_assignment):
    # reuse logic from serializers helper if available; basic check here
    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile and teaching_assignment.staff_id == staff_profile.pk:
        return True
    role_names = {r.name.upper() for r in user.roles.all()}
    if 'HOD' in role_names or 'ADVISOR' in role_names:
        # HOD membership is represented by DepartmentRole entries allowing
        # a staff to be HOD of multiple departments. Check active DepartmentRole
        # records rather than the single department on StaffProfile.
        try:
            if staff_profile:
                hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True)
                ta_dept = teaching_assignment.section.batch.course.department_id
                if ta_dept in list(hod_depts):
                    return True
        except Exception:
            pass
    return False


class MyTeachingAssignmentsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        qs = TeachingAssignment.objects.select_related(
            'subject',
            'section',
            'academic_year',
            'section__semester__course__department',
        ).filter(is_active=True)

        staff_profile = getattr(user, 'staff_profile', None)
        role_names = {r.name.upper() for r in user.roles.all()} if getattr(user, 'roles', None) is not None else set()

        # staff: only their teaching assignments
        if staff_profile and 'HOD' not in role_names and 'ADVISOR' not in role_names:
            qs = qs.filter(staff=staff_profile)
        # HOD/ADVISOR: assignments within their department
        elif staff_profile and ('HOD' in role_names or 'ADVISOR' in role_names):
            qs = qs.filter(section__semester__course__department=staff_profile.department)
        # else: admins can see all

        ser = TeachingAssignmentInfoSerializer(qs.order_by('subject__code', 'section__name'), many=True)
        return Response(ser.data)


class SectionAdvisorViewSet(viewsets.ModelViewSet):
    queryset = SectionAdvisor.objects.select_related('section__batch__course__department', 'advisor')
    serializer_class = SectionAdvisorSerializer
    permission_classes = (IsAuthenticated, IsHODOfDepartment)

    def get_queryset(self):
        user = self.request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return SectionAdvisor.objects.none()
        # HODs: show mappings for their departments
        hod_depts = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True)
        return self.queryset.filter(section__batch__course__department_id__in=hod_depts)

    def perform_create(self, serializer):
        user = self.request.user
        # require explicit assign permission (or fallback to model add perm)
        perms = get_user_permissions(user)
        if not (('academics.assign_advisor' in perms) or user.has_perm('academics.add_sectionadvisor')):
            raise PermissionDenied('You do not have permission to assign advisors.')
        # serializer.validate already checks HOD membership and dept match
        serializer.save()

    def create(self, request, *args, **kwargs):
        # Handle duplicate active section+academic_year by updating existing mapping.
        data = request.data or {}
        section_id = data.get('section_id') or data.get('section')
        academic_year = data.get('academic_year')
        advisor_id = data.get('advisor_id') or data.get('advisor')

        # If academic_year missing but section and advisor present, default to active AcademicYear
        if section_id and advisor_id and not academic_year:
            try:
                active_ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
                if active_ay is not None:
                    academic_year = active_ay.pk
            except Exception:
                academic_year = None

        if section_id and academic_year and advisor_id:
            try:
                # Accept numeric IDs or object payloads
                sec_id = int(section_id)
                ay_id = int(academic_year)
            except Exception:
                sec_id = None
                ay_id = None

            if sec_id and ay_id:
                # If provided academic year isn't active, prefer the current active academic year
                try:
                    provided_ay = AcademicYear.objects.filter(pk=ay_id).first()
                    if provided_ay is not None and not provided_ay.is_active:
                        # Prefer an active academic year with the same name (pair like Odd/Even)
                        active_same = AcademicYear.objects.filter(name=provided_ay.name, is_active=True).first()
                        if active_same is not None:
                            ay_id = active_same.pk
                        else:
                            # Fallback to any active academic year
                            active_ay = AcademicYear.objects.filter(is_active=True).first()
                            if active_ay is not None:
                                ay_id = active_ay.pk
                except Exception:
                    pass
                existing = SectionAdvisor.objects.filter(section_id=sec_id, academic_year_id=ay_id, is_active=True).first()
                if existing:
                    # update advisor and return existing
                    existing.advisor_id = int(advisor_id)
                    if 'is_active' in data:
                        existing.is_active = bool(data.get('is_active'))
                    existing.save()
                    serializer = self.get_serializer(existing)
                    return Response(serializer.data, status=status.HTTP_200_OK)

                # No existing mapping -> create using the resolved ay_id
                data_copy = dict(data)
                data_copy['academic_year'] = ay_id
                # ensure section/advisor are integers
                data_copy['section_id'] = sec_id
                data_copy['advisor_id'] = int(advisor_id)
                try:
                    serializer = self.get_serializer(data=data_copy)
                    serializer.is_valid(raise_exception=True)
                    self.perform_create(serializer)
                    headers = self.get_success_headers(serializer.data)
                    return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
                except Exception as e:
                    import logging, traceback
                    logging.getLogger(__name__).exception('Error creating SectionAdvisor: %s', e)
                    tb = traceback.format_exc()
                    return Response({'detail': 'Failed to create advisor assignment.', 'error': str(e), 'trace': tb}, status=status.HTTP_400_BAD_REQUEST)

        return super().create(request, *args, **kwargs)

    def perform_update(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        if not (('academics.change_sectionadvisor' in perms) or user.has_perm('academics.change_sectionadvisor')):
            raise PermissionDenied('You do not have permission to change advisor assignments.')
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        perms = get_user_permissions(user)
        if not (('academics.delete_sectionadvisor' in perms) or user.has_perm('academics.delete_sectionadvisor')):
            raise PermissionDenied('You do not have permission to remove advisor assignments.')
        instance.delete()


class TeachingAssignmentViewSet(viewsets.ModelViewSet):
    queryset = TeachingAssignment.objects.select_related('staff', 'subject', 'section', 'academic_year')
    serializer_class = TeachingAssignmentSerializer
    # Allow authenticated users; detailed authorisation is enforced in methods
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return TeachingAssignment.objects.none()
        # Only include assignments for sections the user advises (active mapping)
        # or assignments belonging to the staff themselves.
        advisor_section_ids = list(SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True, academic_year__is_active=True).values_list('section_id', flat=True))
        from django.db.models import Q
        final_q = Q()
        if advisor_section_ids:
            final_q |= Q(section_id__in=advisor_section_ids)

        # Allow a staff to view their own assignments
        final_q |= Q(staff__user=getattr(user, 'id', None))

        if final_q:
            return self.queryset.filter(final_q)
        return TeachingAssignment.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        # If user has explicit assign permission or model add perm, allow
        if ('academics.assign_teaching' in perms) or user.has_perm('academics.add_teachingassignment'):
            serializer.save()
            return

        # Otherwise restrict to advisors for the target section only
        staff_profile = getattr(user, 'staff_profile', None)
        section_obj = None
        try:
            if 'section' in getattr(serializer, 'validated_data', {}):
                section_obj = serializer.validated_data.get('section')
            elif 'section_id' in getattr(serializer, 'validated_data', {}):
                sid = serializer.validated_data.get('section_id')
                from .models import Section as _Section
                section_obj = _Section.objects.filter(pk=int(sid)).first()
        except Exception:
            section_obj = None

        if not section_obj:
            raise PermissionDenied('You do not have permission to assign teaching for this section.')

        is_advisor = SectionAdvisor.objects.filter(section=section_obj, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists() if staff_profile else False

        if not is_advisor:
            raise PermissionDenied('You do not have permission to assign teaching for this section.')

        serializer.save()


class AcademicYearViewSet(viewsets.ModelViewSet):
    """Manage AcademicYear objects: create, list, activate/deactivate."""
    queryset = AcademicYear.objects.all().order_by('-id')
    serializer_class = AcademicYearSerializer
    permission_classes = (IsAuthenticated,)

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        if not (user.is_staff or 'academics.manage_academicyears' in perms or user.has_perm('academics.add_academicyear')):
            raise PermissionDenied('You do not have permission to create academic years.')
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        if not (user.is_staff or 'academics.manage_academicyears' in perms or user.has_perm('academics.change_academicyear')):
            raise PermissionDenied('You do not have permission to change academic years.')
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        perms = get_user_permissions(user)
        if not (user.is_staff or 'academics.manage_academicyears' in perms or user.has_perm('academics.delete_academicyear')):
            raise PermissionDenied('You do not have permission to delete academic years.')
        instance.delete()

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except PermissionDenied:
            raise
        except Exception as e:
            import logging, traceback
            logging.getLogger(__name__).exception('Error creating TeachingAssignment: %s', e)
            tb = traceback.format_exc()
            return Response({'detail': 'Failed to create teaching assignment.', 'error': str(e), 'trace': tb}, status=status.HTTP_400_BAD_REQUEST)

    def perform_update(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        # Allow if explicit change permission
        if ('academics.change_teaching' in perms) or user.has_perm('academics.change_teachingassignment'):
            serializer.save()
            return

        # Otherwise restrict to advisors for the assignment's section
        staff_profile = getattr(user, 'staff_profile', None)
        ta = getattr(serializer, 'instance', None)
        # If changing section in payload, use that; else use instance
        section_obj = None
        try:
            if 'section' in getattr(serializer, 'validated_data', {}):
                section_obj = serializer.validated_data.get('section')
            elif ta is not None:
                section_obj = getattr(ta, 'section', None)
        except Exception:
            section_obj = getattr(ta, 'section', None) if ta is not None else None

        if not section_obj:
            raise PermissionDenied('You do not have permission to change this teaching assignment.')

        is_advisor = SectionAdvisor.objects.filter(section=section_obj, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists() if staff_profile else False

        if not is_advisor:
            raise PermissionDenied('You do not have permission to change this teaching assignment.')

        serializer.save()


class HODSectionsView(APIView):
    permission_classes = (IsAuthenticated, IsHODOfDepartment)

    def get(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'results': []})
        dept_ids = get_user_effective_departments(user)
        qs = Section.objects.filter(batch__course__department_id__in=dept_ids).select_related('batch', 'batch__course', 'batch__course__department', 'semester')
        results = []
        for s in qs:
            dept = getattr(s.batch.course, 'department', None)
            results.append({
                'id': s.id,
                'name': s.name,
                'batch': getattr(s.batch, 'name', None),
                'department_id': getattr(s.batch.course, 'department_id', None),
                'department_code': getattr(dept, 'code', None) if dept else None,
                'semester': getattr(s.semester, 'number', None),
            })
        return Response({'results': results})


class HODStaffListView(APIView):
    permission_classes = (IsAuthenticated, IsHODOfDepartment)

    def get(self, request):
        # Return staff list limited to the HOD's departments
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'results': []})
        dept_ids = get_user_effective_departments(user)
        # optionally allow department param
        dept_param = request.query_params.get('department')
        if dept_param:
            try:
                dept_id = int(dept_param)
                if dept_id not in dept_ids:
                    return Response({'results': []})
                dept_ids = [dept_id]
            except Exception:
                pass
        staff_qs = StaffProfile.objects.filter(department_id__in=dept_ids).select_related('user')
        results = []
        for s in staff_qs:
            results.append({'id': s.id, 'user': getattr(s.user, 'username', None), 'staff_id': s.staff_id, 'department': getattr(s.department, 'id', None)})
        return Response({'results': results})


class AdvisorStaffListView(APIView):
    """Return staff list limited to departments/sections the advisor is assigned to.

    This endpoint is intended for advisors to choose staff when assigning teaching.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'results': []})

        # Sections advisor maps to (active advisors for active academic years)
        advisor_qs = SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True, academic_year__is_active=True).select_related('section__batch__course')
        if not advisor_qs.exists():
            return Response({'results': []})

        dept_ids = set()
        for a in advisor_qs:
            try:
                sec = getattr(a, 'section', None)
                batch = getattr(sec, 'batch', None) if sec is not None else None
                course = getattr(batch, 'course', None) if batch is not None else None
                dept = getattr(course, 'department', None) if course is not None else None
                if dept:
                    dept_ids.add(dept.id)
            except Exception:
                continue

        if not dept_ids:
            return Response({'results': []})

        staff_qs = StaffProfile.objects.filter(department_id__in=list(dept_ids)).select_related('user')
        results = []
        for s in staff_qs:
            results.append({'id': s.id, 'user': getattr(s.user, 'username', None), 'staff_id': s.staff_id, 'department': getattr(s.department, 'id', None)})
        return Response({'results': results})


class SectionStudentsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, section_id: int):
        # Return students in the given section (current active assignments + legacy)
        try:
            sid = int(section_id)
        except Exception:
            return Response({'results': []})

        # current assignments
        from .models import StudentSectionAssignment, StudentProfile
        assign_qs = StudentSectionAssignment.objects.filter(section_id=sid, end_date__isnull=True).select_related('student__user')
        students = [a.student for a in assign_qs]

        # legacy field
        legacy = StudentProfile.objects.filter(section_id=sid).select_related('user')
        for s in legacy:
            if not any(x.pk == s.pk for x in students):
                students.append(s)

        ser = StudentSimpleSerializer([
            {'id': st.pk, 'reg_no': st.reg_no, 'user': getattr(st, 'user', None), 'section_id': getattr(st, 'section_id', None), 'section_name': str(getattr(st, 'section', ''))}
            for st in students
        ], many=True)
        return Response({'results': ser.data})


class StaffAssignedSubjectsView(APIView):
    """Return teaching assignments (subjects) for a staff member.

    URL patterns:
    - /api/academics/staff/assigned-subjects/  -> current user's staff_profile
    - /api/academics/staff/<staff_id>/assigned-subjects/ -> specified staff id
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request, staff_id: int = None):
        user = request.user
        # resolve target staff_profile
        target = None
        try:
            if staff_id:
                target = StaffProfile.objects.filter(pk=int(staff_id)).first()
            else:
                target = getattr(user, 'staff_profile', None)
        except Exception:
            target = getattr(user, 'staff_profile', None)

        if not target:
            return Response({'detail': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)

        # permission: allow if user is the staff themselves, superuser, has explicit perm,
        # or is HOD for the staff's department
        if user.is_superuser:
            allowed = True
        elif getattr(user, 'id', None) == getattr(getattr(target, 'user', None), 'id', None):
            allowed = True
        else:
            perms = get_user_permissions(user)
            if 'academics.view_assigned_subjects' in perms or user.has_perm('academics.view_assigned_subjects'):
                allowed = True
            else:
                # HODs may view staff in their mapped departments
                hod_dept_ids = get_user_effective_departments(user)
                target_dept_id = None
                try:
                    target_dept = getattr(target, 'current_department', None) or target.get_current_department()
                    if not target_dept:
                        target_dept = getattr(target, 'department', None)
                    target_dept_id = getattr(target_dept, 'id', None) if target_dept else None
                except Exception:
                    target_dept_id = getattr(getattr(target, 'department', None), 'id', None)

                allowed = bool(target_dept_id and target_dept_id in hod_dept_ids)

        if not allowed:
            raise PermissionDenied('You do not have permission to view this staff assignments.')

        # fetch teaching assignments
        # Only return active assignments in the active academic year that
        # have an explicit curriculum_row or subject. This avoids showing
        # placeholder/unnamed records for staff without assigned subjects.
        qs = TeachingAssignment.objects.filter(
            staff=target,
            is_active=True,
            academic_year__is_active=True
        ).filter(Q(curriculum_row__isnull=False) | Q(subject__isnull=False)).select_related('curriculum_row', 'section', 'academic_year', 'subject')
        ser = TeachingAssignmentInfoSerializer(qs, many=True)
        return Response({'results': ser.data})


class SubjectBatchViewSet(viewsets.ModelViewSet):
    """Manage StudentSubjectBatch resources for the current staff user."""
    permission_classes = (IsAuthenticated,)
    serializer_class = None

    def get_serializer_class(self):
        from .serializers import StudentSubjectBatchSerializer
        return StudentSubjectBatchSerializer

    def get_queryset(self):
        user = self.request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return []
        from .models import StudentSubjectBatch
        # staff sees only their own batches; superusers can see all
        qs = StudentSubjectBatch.objects.select_related('staff', 'academic_year').prefetch_related('students')
        # allow callers to request all batches (useful for timetable editors)
        include_all = str(self.request.query_params.get('include_all') or '').lower() in ('1', 'true', 'yes')
        if not user.is_superuser and not include_all:
            qs = qs.filter(staff=staff_profile)

        # allow filtering by curriculum_row_id via query param (useful for timetable editor)
        cr = self.request.query_params.get('curriculum_row_id') or self.request.query_params.get('curriculum_row')
        if cr:
            try:
                cr_id = int(cr)
                qs = qs.filter(curriculum_row_id=cr_id)
            except Exception:
                pass
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Only staff users can create subject batches')
        # ensure academic_year default handled in serializer
        # allow curriculum_row_id in payload; serializer will attach row
        serializer.save(staff=staff_profile)



class PeriodAttendanceSessionViewSet(viewsets.ModelViewSet):
    queryset = PeriodAttendanceSession.objects.select_related('section', 'period', 'timetable_assignment').prefetch_related('records')
    serializer_class = PeriodAttendanceSessionSerializer
    permission_classes = (IsAuthenticated,)

    def perform_create(self, serializer):
        user = self.request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Only staff users may create attendance sessions')

        # determine day for permission checking
        date = serializer.validated_data.get('date')
        period = serializer.validated_data.get('period')
        section = serializer.validated_data.get('section')
        day = None
        try:
            if date is not None:
                day = date.isoweekday()
        except Exception:
            day = None

        ta = None
        try:
            from timetable.models import TimetableAssignment
            if section and period and day:
                ta = TimetableAssignment.objects.filter(section=section, period=period, day=day, staff=staff_profile).first()
        except Exception:
            ta = None

        perms = get_user_permissions(user)
        if not (ta or 'academics.mark_attendance' in perms or user.is_superuser):
            raise PermissionDenied('You are not assigned to this period and cannot mark attendance')

        if ta:
            serializer.save(timetable_assignment=ta, created_by=staff_profile)
        else:
            serializer.save(created_by=staff_profile)

    @action(detail=False, methods=['post'], url_path='bulk-mark')
    def bulk_mark(self, request):
        ser = BulkPeriodAttendanceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        section_id = data.get('section_id')
        period_id = data.get('period_id')
        date = data.get('date')
        records = data.get('records') or []

        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        day = None
        try:
            if date is not None:
                day = date.isoweekday()
        except Exception:
            day = None

        ta = None
        try:
            from timetable.models import TimetableAssignment, TimetableSlot
            from .models import Section as _Section
            section = _Section.objects.filter(pk=int(section_id)).first() if section_id is not None else None
            period = TimetableSlot.objects.filter(pk=int(period_id)).first() if period_id is not None else None
            if section and period and day and staff_profile:
                ta = TimetableAssignment.objects.filter(section=section, period=period, day=day, staff=staff_profile).first()
        except Exception:
            ta = None

        perms = get_user_permissions(user)
        if not (ta or 'academics.mark_attendance' in perms or user.is_superuser):
            raise PermissionDenied('You are not allowed to mark attendance for this period')

        with transaction.atomic():
            session, created = PeriodAttendanceSession.objects.get_or_create(
                section=section, period=period, date=date,
                defaults={'timetable_assignment': ta, 'created_by': staff_profile}
            )
            if ta and session.timetable_assignment is None:
                session.timetable_assignment = ta
                session.save()

            out = []
            # If timetable assignment has a subject_batch defined, use that student list
            students_source = None
            if ta and getattr(ta, 'subject_batch', None):
                try:
                    students_source = list(ta.subject_batch.students.all())
                except Exception:
                    students_source = None

            from .models import StudentProfile as _StudentProfile
            for rec in records:
                # BulkRecordSerializer provides `student_id` and `status`
                sid = rec.get('student_id')
                status_val = rec.get('status')
                if not sid:
                    continue
                stu = _StudentProfile.objects.filter(pk=int(sid)).first()
                if not stu:
                    continue
                if students_source is not None:
                    # ensure student belongs to subject_batch
                    if not any(getattr(s, 'pk', None) == getattr(stu, 'pk', None) for s in students_source):
                        # skip students not in batch
                        continue

                obj, created = PeriodAttendanceRecord.objects.update_or_create(
                    session=session, student=stu,
                    defaults={'status': status_val, 'marked_by': staff_profile}
                )
                out.append({'id': obj.id, 'student_id': getattr(obj.student, 'id', None), 'status': obj.status})

            resp_ser = PeriodAttendanceSessionSerializer(session, context={'request': request})
            return Response(resp_ser.data, status=status.HTTP_200_OK)


class StaffPeriodsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'results': []})

        date_param = request.query_params.get('date')
        import datetime
        try:
            if date_param:
                date = datetime.date.fromisoformat(date_param)
            else:
                date = datetime.date.today()
        except Exception:
            date = datetime.date.today()

        day = date.isoweekday()
        from timetable.models import TimetableAssignment
        # fetch assignments for the day; include assignments that either have staff set
        # to the current user or which are intended to be taught by the staff via
        # an active TeachingAssignment mapping (fallback when TimetableAssignment.staff is null)
        qs = TimetableAssignment.objects.filter(day=day).select_related('period', 'section', 'curriculum_row', 'subject_batch', 'staff')
        # prefetch any existing attendance session for this date so frontend can indicate status
        from .models import PeriodAttendanceSession
        results = []
        for a in qs:
            include = False
            try:
                if getattr(a, 'staff', None) and getattr(a.staff, 'id', None) == getattr(staff_profile, 'id', None):
                    include = True
                else:
                    # fallback: if timetable assignment has no explicit staff, resolve via TeachingAssignment
                    if not getattr(a, 'staff', None) and getattr(a, 'curriculum_row', None):
                        from .models import TeachingAssignment as _TA
                        if _TA.objects.filter(section=a.section, curriculum_row=a.curriculum_row, is_active=True, staff=staff_profile).exists():
                            include = True
            except Exception:
                include = False

            if not include:
                continue

            # find existing session for this section/period/date (if any)
            session = PeriodAttendanceSession.objects.filter(section=a.section, period=a.period, date=date).first()
            results.append({
                'id': a.id,
                'section_id': a.section_id,
                'section_name': str(a.section),
                'period': {'id': a.period.id, 'index': a.period.index, 'label': a.period.label, 'start_time': getattr(a.period, 'start_time', None), 'end_time': getattr(a.period, 'end_time', None)},
                # provide a reliable subject display: prefer curriculum_row code/name, then subject_text
                'subject_id': getattr(getattr(a, 'curriculum_row', None), 'id', None),
                'subject_display': (getattr(getattr(a, 'curriculum_row', None), 'course_code', None) or getattr(getattr(a, 'curriculum_row', None), 'course_name', None) or getattr(a, 'subject_text', None) or None),
                'subject_batch_id': getattr(a, 'subject_batch_id', None),
                'attendance_session_id': getattr(session, 'id', None),
                'attendance_session_locked': getattr(session, 'is_locked', False) if session else False,
            })
        return Response({'results': results})


class AdvisorMyStudentsView(APIView):
    """Return students for sections where the current user is an active advisor.

    Response format:
    { results: [ { section_id, section_name, students: [ { id, reg_no, username } ] } ] }
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        import traceback, logging
        try:
            user = request.user
            staff_profile = getattr(user, 'staff_profile', None)
            if not staff_profile:
                return Response({'results': []})

            # find active advisor mappings for current active academic year(s)
            advisor_qs = SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True, academic_year__is_active=True).select_related('section', 'section__batch', 'section__batch__course')
            sections = [a.section for a in advisor_qs]
            if not sections:
                return Response({'results': []})

            # collect student profiles via current StudentSectionAssignment (preferred) and legacy StudentProfile.section
            from .models import StudentSectionAssignment, StudentProfile

            section_ids = [s.id for s in sections]
            # current assignments
            assign_qs = StudentSectionAssignment.objects.filter(section_id__in=section_ids, end_date__isnull=True).select_related('student__user', 'section')
            students_by_section = {}
            for a in assign_qs:
                sid = a.section_id
                students_by_section.setdefault(sid, []).append(a.student)

            # legacy section field
            legacy_qs = StudentProfile.objects.filter(section_id__in=section_ids).select_related('user', 'section')
            for s in legacy_qs:
                sid = s.section_id
                # avoid duplicates
                present = students_by_section.setdefault(sid, [])
                if not any(x.pk == s.pk for x in present):
                    present.append(s)

<<<<<<< HEAD
        results = []
        for sec in sections:
            studs = students_by_section.get(sec.id, [])
            ser = StudentSimpleSerializer([
                {'id': st.pk, 'reg_no': st.reg_no, 'user': getattr(st, 'user', None), 'section_id': getattr(st, 'section_id', None), 'section_name': str(getattr(st, 'section', ''))}
                for st in studs
            ], many=True)
            results.append({'section_id': sec.id, 'section_name': str(sec), 'students': ser.data})

        return Response({'results': results})


class TeachingAssignmentStudentsView(APIView):
    """Return the roster (students) for a specific teaching assignment.

    Used by mark-entry pages so they can load students from the teaching assignment's section.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, ta_id: int):
        ta = get_object_or_404(
            TeachingAssignment.objects.select_related(
                'subject',
                'section',
                'academic_year',
                'section__semester__course__department',
            ),
            pk=ta_id,
            is_active=True,
        )

        if not serializer_check_user_can_manage(request.user, ta):
            return Response({'detail': 'You do not have permission to view this roster.'}, status=403)

        section_id = ta.section_id
        students = (
            StudentProfile.objects.select_related('user', 'section')
            .filter(
                Q(section_id=section_id)
                | Q(section_assignments__section_id=section_id, section_assignments__end_date__isnull=True)
            )
            .distinct()
            .order_by('user__last_name', 'user__first_name', 'user__username')
        )

        def student_name(sp: StudentProfile) -> str:
            try:
                full = sp.user.get_full_name()
            except Exception:
                full = ''
            return full or getattr(sp.user, 'username', '') or sp.reg_no

        payload = {
            'teaching_assignment': {
                'id': ta.id,
                'subject_id': ta.subject_id,
                'subject_code': ta.subject.code,
                'subject_name': ta.subject.name,
                'section_id': ta.section_id,
                'section_name': ta.section.name,
                'academic_year': ta.academic_year.name,
            },
            'students': [
                {
                    'id': s.id,
                    'reg_no': s.reg_no,
                    'name': student_name(s),
                    'section': getattr(getattr(s, 'current_section', None), 'name', None)
                    or (getattr(s.section, 'name', None) if getattr(s, 'section', None) else None),
                }
                for s in students
            ],
        }
        return Response(payload)



class DayAttendanceSessionViewSet(viewsets.ViewSet):
    """Create and manage day attendance sessions. Advisors may create a session
    for their sections and mark student records in bulk."""
    permission_classes = (IsAuthenticated,)

    def create(self, request):
        # Expected payload: { section_id, date, records: [ { student_id, status }, ... ] }
        data = request.data or {}
        section_id = data.get('section_id')
        date = data.get('date')
        records = data.get('records', [])

        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Only staff may mark attendance')

        # permission check: user must have mark permission
        perms = get_user_permissions(user)
        if not (('academics.mark_attendance' in perms) or user.has_perm('academics.add_dayattendancesession')):
            raise PermissionDenied('You do not have permission to mark attendance.')

        # Verify user is advisor for this section (active mapping)
        is_advisor = SectionAdvisor.objects.filter(section_id=section_id, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists()
        if not is_advisor:
            # allow HOD as fallback
            hod_ok = DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True, department__in=[Section.objects.filter(pk=section_id).first().batch.course.department]).exists() if section_id else False
            if not hod_ok:
                raise PermissionDenied('Only assigned advisors or HODs may mark day attendance for the section')

        # upsert session
        session, created = DayAttendanceSession.objects.get_or_create(section_id=section_id, date=date, defaults={'created_by': staff_profile})
        if session.is_locked:
            return Response({'detail': 'Session is locked and cannot be modified.'}, status=status.HTTP_400_BAD_REQUEST)

        # Bulk create/update records
        created_count = 0
        updated_count = 0
        with transaction.atomic():
            for r in records:
                sid = r.get('student_id') or r.get('student')
                status_val = r.get('status')
                if not sid or not status_val:
                    continue
                obj, was_created = DayAttendanceRecord.objects.update_or_create(session=session, student_id=sid, defaults={'status': status_val, 'marked_by': staff_profile})
                if was_created:
                    created_count += 1
=======
            results = []
            for sec in sections:
                studs = students_by_section.get(sec.id, [])
                ser = StudentSimpleSerializer([
                    {'id': st.pk, 'reg_no': st.reg_no, 'user': getattr(st, 'user', None), 'section_id': getattr(st, 'section_id', None), 'section_name': str(getattr(st, 'section', ''))}
                    for st in studs
                ], many=True)
                batch = getattr(sec, 'batch', None)
                course = getattr(batch, 'course', None) if batch is not None else None
                dept = getattr(course, 'department', None) if course is not None else None
                # serialize semester to a JSON-safe value (number or string)
                sem_obj = getattr(sec, 'semester', None)
                if sem_obj is None:
                    sem_val = None
>>>>>>> origin/main
                else:
                    sem_val = getattr(sem_obj, 'number', str(sem_obj))

                results.append({
                    'section_id': sec.id,
                    'section_name': str(sec),
                    'batch': getattr(batch, 'name', None),
                    'department_id': getattr(course, 'department_id', None) if course is not None else None,
                    'department': {'id': getattr(dept, 'id', None), 'code': getattr(dept, 'code', None)} if dept else None,
                    'semester': sem_val,
                    'students': ser.data,
                })

            return Response({'results': results})
        except Exception as e:
            logging.getLogger(__name__).exception('AdvisorMyStudentsView error: %s', e)
            tb = traceback.format_exc()
            return Response({'detail': 'Internal server error', 'error': str(e), 'trace': tb}, status=500)



# DayAttendance endpoints removed as part of attendance feature removal.


class StudentAttendanceView(APIView):
    """Return period-wise attendance records for the current student.

    Query params:
    - start_date (ISO) optional
    - end_date (ISO) optional
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        try:
            from .models import StudentProfile, PeriodAttendanceRecord
            sp = StudentProfile.objects.filter(user=user).first()
            if not sp:
                return Response({'results': []})

            import datetime
            start_param = request.query_params.get('start_date')
            end_param = request.query_params.get('end_date')
            qs = PeriodAttendanceRecord.objects.filter(student=sp).select_related('session__period', 'session__section', 'marked_by', 'session')
            try:
                if start_param:
                    sd = datetime.date.fromisoformat(start_param)
                    qs = qs.filter(session__date__gte=sd)
                if end_param:
                    ed = datetime.date.fromisoformat(end_param)
                    qs = qs.filter(session__date__lte=ed)
            except Exception:
                pass

            qs = qs.order_by('-session__date', 'session__period__index')

            # overall calculation: only consider marked periods (records) as denominator
            # total_marked_periods = number of PeriodAttendanceRecord entries in the selected range
            total_marked_periods = qs.count()

            # Build output and compute counts
            out = []
            present_count = 0
            status_counts = {}
            # Subject-wise maps: key -> {counts: {status: count}, total: int, display: str}
            subj_map = {}

            # statuses considered present for percentage calculation
            present_statuses = {'P', 'OD', 'LATE', 'LEAVE'}

            for r in qs:
                sess = getattr(r, 'session', None)
                period = getattr(sess, 'period', None) if sess else None
                section = getattr(sess, 'section', None) if sess else None
                ta = getattr(sess, 'timetable_assignment', None) if sess else None
                # determine subject identifier
                subj_key = None
                subj_disp = None
                try:
                    if ta is not None:
                        if getattr(ta, 'curriculum_row', None):
                            subj_key = f"CR:{ta.curriculum_row_id}"
                            subj_disp = getattr(getattr(ta, 'curriculum_row', None), 'course_code', None) or getattr(ta, 'subject_text', None)
                        else:
                            subj_key = f"TXT:{(ta.subject_text or 'Unassigned') }"
                            subj_disp = ta.subject_text or 'Unassigned'
                except Exception:
                    subj_key = 'Unassigned'
                    subj_disp = 'Unassigned'

                # update status counters
                status_counts[r.status] = status_counts.get(r.status, 0) + 1
                if r.status in present_statuses:
                    present_count += 1

                # subject-wise totals and status counts
                if subj_key not in subj_map:
                    subj_map[subj_key] = {'counts': {}, 'total': 0, 'display': subj_disp}
                subj_map[subj_key]['total'] += 1
                subj_map[subj_key]['counts'][r.status] = subj_map[subj_key]['counts'].get(r.status, 0) + 1

                out.append({
                    'id': r.id,
                    'date': getattr(sess, 'date', None),
                    'period': {'id': getattr(period, 'id', None), 'index': getattr(period, 'index', None), 'label': getattr(period, 'label', None), 'start_time': getattr(period, 'start_time', None), 'end_time': getattr(period, 'end_time', None)},
                    'section': {'id': getattr(section, 'id', None), 'name': str(section) if section else None},
                    'status': r.status,
                    'marked_at': r.marked_at,
                    'marked_by': getattr(getattr(r, 'marked_by', None), 'staff_id', None),
                    'subject_key': subj_key,
                    'subject_display': subj_disp,
                })

            overall_percentage = (present_count / total_marked_periods * 100) if total_marked_periods > 0 else None

            by_subject = []
            for k, v in subj_map.items():
                perc = ( (v['counts'].get('P',0) + v['counts'].get('OD',0) + v['counts'].get('LATE',0) + v['counts'].get('LEAVE',0)) / v['total'] * 100) if v['total'] > 0 else None
                by_subject.append({
                    'subject_key': k,
                    'subject_display': v.get('display'),
                    'counts': v.get('counts', {}),
                    'total': v.get('total', 0),
                    'percentage': perc,
                })

            summary = {'overall': {'present': present_count, 'total_marked_periods': total_marked_periods, 'percentage': overall_percentage, 'status_counts': status_counts}, 'by_subject': by_subject}

            return Response({'results': out, 'summary': summary})
        except Exception as e:
            import logging, traceback
            logging.getLogger(__name__).exception('StudentAttendanceView error: %s', e)
            tb = traceback.format_exc()
            return Response({'detail': 'Internal server error', 'error': str(e), 'trace': tb}, status=500)

