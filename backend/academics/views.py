from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from django.db import transaction

from .permissions import IsHODOfDepartment

from .models import (
    TeachingAssignment,
    SectionAdvisor,
    DepartmentRole,
    Section,
    StaffProfile,
    AcademicYear,
)
from .models import DayAttendanceSession, DayAttendanceRecord, StudentProfile

from .serializers import (
    SectionAdvisorSerializer,
    TeachingAssignmentSerializer,
    StudentSimpleSerializer,
)
from .serializers import DayAttendanceSessionSerializer, DayAttendanceRecordSerializer, BulkDayAttendanceSerializer
from accounts.utils import get_user_permissions
from .utils import get_user_effective_departments


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
    permission_classes = (IsAuthenticated, IsHODOfDepartment)

    def get_queryset(self):
        user = self.request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return TeachingAssignment.objects.none()
        dept_ids = get_user_effective_departments(user)
        if not dept_ids:
            return TeachingAssignment.objects.none()
        return self.queryset.filter(section__batch__course__department_id__in=dept_ids)

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        if not (('academics.assign_teaching' in perms) or user.has_perm('academics.add_teachingassignment')):
            raise PermissionDenied('You do not have permission to assign teaching.')
        # serializer will handle curriculum_row mapping
        serializer.save()

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
        if not (('academics.change_teaching' in perms) or user.has_perm('academics.change_teachingassignment')):
            raise PermissionDenied('You do not have permission to change teaching assignments.')
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


class AdvisorMyStudentsView(APIView):
    """Return students for sections where the current user is an active advisor.

    Response format:
    { results: [ { section_id, section_name, students: [ { id, reg_no, username } ] } ] }
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
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

        results = []
        for sec in sections:
            studs = students_by_section.get(sec.id, [])
            ser = StudentSimpleSerializer([
                {'id': st.pk, 'reg_no': st.reg_no, 'user': getattr(st, 'user', None), 'section_id': getattr(st, 'section_id', None), 'section_name': str(getattr(st, 'section', ''))}
                for st in studs
            ], many=True)
            results.append({'section_id': sec.id, 'section_name': str(sec), 'students': ser.data})

        return Response({'results': results})



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
                else:
                    updated_count += 1

        serializer = DayAttendanceSessionSerializer(session, context={'request': request})
        return Response({'session': serializer.data, 'created': created_count, 'updated': updated_count})

    def retrieve(self, request, pk=None):
        qs = DayAttendanceSession.objects.select_related('section', 'created_by').prefetch_related('records__student')
        session = get_object_or_404(qs, pk=pk)
        serializer = DayAttendanceSessionSerializer(session, context={'request': request})
        return Response(serializer.data)



class StudentDayAttendanceView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        # Return day attendance records for the current student
        user = request.user
        student_profile = getattr(user, 'student_profile', None)
        if not student_profile:
            return Response({'results': []})

        qs = DayAttendanceRecord.objects.filter(student=student_profile).select_related('session__section').order_by('-session__date')
        results = []
        # compute per-section and overall stats
        stats = {}
        total_records = 0
        total_present = 0
        PRESENT_STATUSES = {'P', 'OD', 'LATE'}

        for r in qs:
            sec = r.session.section
            sec_id = sec.id if sec else None
            sec_name = str(sec) if sec else None
            results.append({
                'date': r.session.date,
                'section_id': sec_id,
                'section': sec_name,
                'status': r.status,
                'marked_at': r.marked_at,
            })

            if sec_id is not None:
                s = stats.setdefault(sec_id, {'section_id': sec_id, 'section': sec_name, 'total': 0, 'present': 0})
                s['total'] += 1
                if (r.status or '').upper() in PRESENT_STATUSES:
                    s['present'] += 1

            total_records += 1
            if (r.status or '').upper() in PRESENT_STATUSES:
                total_present += 1

        # build summary
        by_section = []
        for v in stats.values():
            pct = round((v['present'] / v['total']) * 100, 2) if v['total'] > 0 else 0.0
            by_section.append({
                'section_id': v['section_id'],
                'section': v['section'],
                'total': v['total'],
                'present': v['present'],
                'percentage': pct,
            })

        overall_pct = round((total_present / total_records) * 100, 2) if total_records > 0 else 0.0

        return Response({'results': results, 'summary': {'overall': {'total': total_records, 'present': total_present, 'percentage': overall_pct}, 'by_section': by_section}})

