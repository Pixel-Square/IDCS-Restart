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
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.response import Response
from .models import StudentMentorMap
from django.db import transaction


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
        perms = get_user_permissions(user)
        # users with explicit permission may view advisor assignments
        # but visibility should be limited to departments the user is effective for
        if user.is_superuser:
            return self.queryset

        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return SectionAdvisor.objects.none()

        # compute departments the user effectively represents (own dept + HOD/AHOD mappings)
        allowed_depts = get_user_effective_departments(user)

        # If user has assign permission, allow viewing assignments for their departments
        if 'academics.assign_advisor' in perms:
            if allowed_depts:
                return self.queryset.filter(section__batch__course__department_id__in=allowed_depts)
            return SectionAdvisor.objects.none()

        # fallback: HODs (role-based) can view for their HOD departments
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


class MentorStaffListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        # only allow users with assign_mentor permission or superuser
        perms = get_user_permissions(user)
        if not (user.is_superuser or 'academics.assign_mentor' in perms):
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        allowed_depts = get_user_effective_departments(user)
        if not allowed_depts:
            return Response({'results': []})

        staffs = StaffProfile.objects.filter(department__id__in=allowed_depts).select_related('user')
        data = []
        for s in staffs:
            data.append({'id': s.id, 'user_id': getattr(getattr(s, 'user', None), 'id', None), 'username': getattr(getattr(s, 'user', None), 'username', None), 'staff_id': s.staff_id})
        return Response({'results': data})


class MentorStudentsForStaffView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, staff_id: int):
        user = request.user
        perms = get_user_permissions(user)
        has_global = user.is_superuser or ('academics.assign_mentor' in perms)

        # ensure staff exists
        staff = StaffProfile.objects.filter(pk=int(staff_id)).first()
        if not staff:
            return Response({'results': []})

        # Fetch students currently mapped to this mentor (active mappings)
        from .models import StudentMentorMap, StudentSectionAssignment, StudentProfile

        # base mentor mappings
        mentor_maps = StudentMentorMap.objects.filter(mentor=staff, is_active=True).select_related('student__user')

        # Determine target department for the staff (if available)
        target_dept = getattr(getattr(staff, 'current_department', None), 'id', None) or getattr(getattr(staff, 'department', None), 'id', None)

        # If the requester is a plain advisor (has section advisor entries) and
        # is NOT a superuser or HOD for the target department, restrict the
        # mentor mappings to students who are in the requester's advised sections
        requester_staff = getattr(user, 'staff_profile', None)
        if requester_staff and not user.is_superuser:
            # check if requester is HOD of the target department — HODs can view all
            is_requester_hod = False
            try:
                is_requester_hod = DepartmentRole.objects.filter(staff=requester_staff, role='HOD', is_active=True, department_id=target_dept).exists()
            except Exception:
                is_requester_hod = False

            if not is_requester_hod:
                requester_section_ids = list(SectionAdvisor.objects.filter(advisor=requester_staff, is_active=True, academic_year__is_active=True).values_list('section_id', flat=True))
                if requester_section_ids:
                    assigned_student_ids = set(StudentSectionAssignment.objects.filter(section_id__in=requester_section_ids, end_date__isnull=True).values_list('student_id', flat=True))
                    legacy_student_ids = set(StudentProfile.objects.filter(section_id__in=requester_section_ids).values_list('id', flat=True))
                    allowed_student_ids = assigned_student_ids | legacy_student_ids
                    mentor_maps = mentor_maps.filter(student__id__in=allowed_student_ids)

        students = [m.student for m in mentor_maps]

        ser = StudentSimpleSerializer([
            {'id': st.pk, 'reg_no': st.reg_no, 'user': getattr(st, 'user', None), 'section_id': getattr(st, 'section_id', None), 'section_name': str(getattr(st, 'section', ''))}
            for st in students
        ], many=True)
        return Response({'results': ser.data})


class MentorMapCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        perms = get_user_permissions(user)
        if not (user.is_superuser or 'academics.assign_mentor' in perms):
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        mentor_id = request.data.get('mentor_id')
        student_ids = request.data.get('student_ids') or request.data.get('student_id')
        if not mentor_id or not student_ids:
            return Response({'detail': 'mentor_id and student_ids required'}, status=status.HTTP_400_BAD_REQUEST)
        if isinstance(student_ids, int):
            student_ids = [student_ids]

        mentor = StaffProfile.objects.filter(pk=int(mentor_id)).first()
        if not mentor:
            return Response({'detail': 'Mentor not found'}, status=status.HTTP_404_NOT_FOUND)

        allowed_depts = get_user_effective_departments(user)
        target_dept = getattr(getattr(mentor, 'current_department', None), 'id', None) or getattr(getattr(mentor, 'department', None), 'id', None)
        if not user.is_superuser and target_dept not in allowed_depts:
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        results = {'created': 0, 'skipped': 0, 'errors': []}
        try:
            with transaction.atomic():
                for sid in student_ids:
                    try:
                        sp = StudentProfile.objects.filter(pk=int(sid)).first()
                        if not sp:
                            results['skipped'] += 1
                            continue
                        # deactivate existing active mentor mapping for this student
                        StudentMentorMap.objects.filter(student=sp, is_active=True).update(is_active=False)
                        StudentMentorMap.objects.create(student=sp, mentor=mentor, is_active=True)
                        results['created'] += 1
                    except Exception as e:
                        results['errors'].append(str(e))
        except Exception as e:
            return Response({'detail': 'Failed to create mappings', 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(results)


class MentorUnmapView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        perms = get_user_permissions(user)
        if not (user.is_superuser or 'academics.assign_mentor' in perms):
            return Response({'detail': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        student_ids = request.data.get('student_ids') or request.data.get('student_id')
        mentor_id = request.data.get('mentor_id')
        if not student_ids:
            return Response({'detail': 'student_ids required'}, status=status.HTTP_400_BAD_REQUEST)
        if isinstance(student_ids, int):
            student_ids = [student_ids]

        try:
            with transaction.atomic():
                q = StudentMentorMap.objects.filter(student_id__in=[int(s) for s in student_ids], is_active=True)
                if mentor_id:
                    q = q.filter(mentor_id=int(mentor_id))
                updated = q.update(is_active=False)
        except Exception as e:
            return Response({'detail': 'Failed to unmap', 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'unmapped': updated})


class MentorMyMenteesView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        
        # Check for view_mentees permission
        if not ('academics.view_mentees' in perms or user.has_perm('academics.view_studentmentormap') or user.is_superuser):
            return Response({'detail': 'You do not have permission to view mentees'}, status=status.HTTP_403_FORBIDDEN)
        
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'results': []})

        # return active mentees mapped to the current staff
        from .models import StudentMentorMap
        maps = StudentMentorMap.objects.filter(mentor=staff_profile, is_active=True).select_related('student__user', 'student__section', 'student__section__batch__course')
        results = []
        for m in maps:
            st = m.student
            results.append({
                'id': getattr(st, 'id', None),
                'reg_no': getattr(st, 'reg_no', None),
                'username': getattr(getattr(st, 'user', None), 'username', None),
                'section_id': getattr(st, 'section_id', None),
                'section_name': str(getattr(st, 'section', '')),
                'mentor_id': getattr(getattr(m, 'mentor', None), 'id', None),
                'mentor_name': getattr(getattr(m, 'mentor', None), 'user', None) and getattr(m.mentor.user, 'username', None),
            })

        return Response({'results': results})

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
        # or assignments belonging to the staff themselves. Users with the
        # `academics.view_assigned_subjects` permission (or superusers) are
        # allowed to see elective assignments across departments as well,
        # but should NOT see every regular assignment across the system.
        advisor_section_ids = list(SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True, academic_year__is_active=True).values_list('section_id', flat=True))
        perms = get_user_permissions(user)
        from django.db.models import Q

        # If caller has global view permission, expose elective assignments
        # but restrict visibility to assignments whose subject/row department
        # matches the user's effective departments (unless superuser).
        if 'academics.view_assigned_subjects' in perms or user.is_superuser:
            # base: elective assignments
            q = Q(elective_subject__isnull=False)
            # include advisor sections and own assignments always
            if advisor_section_ids:
                q |= Q(section_id__in=advisor_section_ids)
            q |= Q(staff__user=getattr(user, 'id', None))

            # if not superuser, further restrict elective assignments to
            # those belonging to departments the user is effective for
            if not user.is_superuser:
                allowed_depts = get_user_effective_departments(user)
                if allowed_depts:
                    dept_q = (
                        Q(section__batch__course__department_id__in=allowed_depts)
                        | Q(curriculum_row__department_id__in=allowed_depts)
                        | Q(elective_subject__parent__department_id__in=allowed_depts)
                    )
                    # apply department filter only to elective assignments part
                    q = (Q(elective_subject__isnull=False) & dept_q) | Q(section_id__in=advisor_section_ids) | Q(staff__user=getattr(user, 'id', None))
                else:
                    # no effective departments -> fall back to advisor sections and own assignments
                    q = Q(section_id__in=advisor_section_ids) | Q(staff__user=getattr(user, 'id', None))

            return self.queryset.filter(q)

        # Default: restrict to advisor sections and own assignments only
        final_q = Q()
        if advisor_section_ids:
            final_q |= Q(section_id__in=advisor_section_ids)
        final_q |= Q(staff__user=getattr(user, 'id', None))

        if final_q:
            return self.queryset.filter(final_q)
        return TeachingAssignment.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        # If user has explicit assign permission or model add perm, allow
        # For elective-specific assignment require separate permission
        is_elective_payload = False
        try:
            if 'elective_subject_id' in getattr(serializer, 'initial_data', {}) or 'elective_subject' in getattr(serializer, 'validated_data', {}):
                is_elective_payload = True
        except Exception:
            is_elective_payload = False

        # If this is an elective payload, serializer.validate() already
        # enforces HOD membership or explicit elective permission. Allow
        # creation when validated (no section required for electives).
        if is_elective_payload:
            serializer.save()
            return
        else:
            if ('academics.assign_teaching' in perms) or user.has_perm('academics.add_teachingassignment'):
                serializer.save()
                return
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
        # Determine whether this is for an elective or regular subject
        is_elective = False
        ta = getattr(serializer, 'instance', None)
        try:
            if 'elective_subject_id' in getattr(serializer, 'initial_data', {}) or 'elective_subject' in getattr(serializer, 'validated_data', {}):
                is_elective = True
            elif ta and getattr(ta, 'elective_subject', None):
                is_elective = True
        except Exception:
            is_elective = False

        # Elective: require elective change permission or HOD of parent dept
        if is_elective:
            if ('academics.change_elective_teaching' in perms) or user.has_perm('academics.change_elective_teaching'):
                serializer.save(); return
            # check HOD of elective parent department
            try:
                es = None
                if 'elective_subject_id' in getattr(serializer, 'initial_data', {}):
                    from curriculum.models import ElectiveSubject
                    es = ElectiveSubject.objects.filter(pk=int(serializer.initial_data.get('elective_subject_id'))).select_related('parent__department').first()
                elif ta:
                    es = getattr(ta, 'elective_subject', None)
                parent_dept_id = getattr(getattr(es, 'parent', None), 'department_id', None)
                staff_profile = getattr(user, 'staff_profile', None)
                from .models import DepartmentRole
                if staff_profile and parent_dept_id:
                    hod_depts = list(DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True))
                    if parent_dept_id in hod_depts:
                        serializer.save(); return
            except Exception:
                pass
            raise PermissionDenied('You do not have permission to change this elective teaching assignment.')

        # Regular subject: existing behavior (change_teaching or advisor for section)
        if ('academics.change_teaching' in perms) or user.has_perm('academics.change_teachingassignment'):
            serializer.save(); return

        staff_profile = getattr(user, 'staff_profile', None)
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

        dept_ids = get_user_effective_departments(user) or []
        if not dept_ids:
            return Response({'results': []})

        sections = Section.objects.filter(batch__course__department_id__in=dept_ids).select_related('batch__course__department', 'batch__regulation')
        results = []
        for s in sections:
            batch = getattr(s, 'batch', None)
            course = getattr(batch, 'course', None) if batch else None
            dept = getattr(course, 'department', None) if course is not None else None
            reg = getattr(batch, 'regulation', None) if batch else None
            results.append({
                'id': s.id,
                'name': str(s),
                'batch_id': getattr(batch, 'id', None),
                'batch_name': getattr(batch, 'name', None),
                'batch_regulation': {'id': getattr(reg, 'id', None), 'code': getattr(reg, 'code', None), 'name': getattr(reg, 'name', None)} if reg else None,
                'course_id': getattr(course, 'id', None),
                'department_id': getattr(dept, 'id', None),
                'department_code': getattr(dept, 'code', None),
                'department_short_name': getattr(dept, 'short_name', None),
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
        # include staff whose `department` FK matches OR who have an active
        # StaffDepartmentAssignment pointing to the department
        from django.db.models import Q
        staff_qs = StaffProfile.objects.filter(
            Q(department_id__in=dept_ids) |
            Q(department_assignments__department_id__in=dept_ids, department_assignments__end_date__isnull=True)
        ).select_related('user').distinct()
        results = []
        for s in staff_qs:
            results.append({'id': s.id, 'user': getattr(s.user, 'username', None), 'staff_id': s.staff_id, 'department': getattr(s.department, 'id', None)})
        return Response({'results': results})


class DepartmentsListView(APIView):
    """Return a list of departments. Users with `academics.view_all_departments`
    permission or staff users see all departments; others see only their effective
    departments."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        from .models import Department

        # accept either view_all_departments or view_all_staff permission as global access
        if ({'academics.view_all_departments', 'academics.view_all_staff'} & perms) or user.is_staff or user.is_superuser:
            qs = Department.objects.all()
        else:
            dept_ids = get_user_effective_departments(user) or []
            if not dept_ids:
                return Response({'results': []})
            qs = Department.objects.filter(id__in=dept_ids)

        results = []
        for d in qs:
            results.append({'id': d.id, 'code': getattr(d, 'code', None), 'name': getattr(d, 'name', None), 'short_name': getattr(d, 'short_name', None)})
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

        # If caller has explicit permission to view all staff across departments,
        # return full list (optionally filtered by department query param).
        perms = get_user_permissions(user)
        dept_param = request.query_params.get('department')
        try:
            dept_filter = int(dept_param) if dept_param else None
        except Exception:
            dept_filter = None

        if 'academics.view_all_staff' in perms or user.is_staff:
            staff_qs = StaffProfile.objects.all().select_related('user')
            if dept_filter:
                staff_qs = staff_qs.filter(
                    Q(department_id=dept_filter) |
                    Q(department_assignments__department_id=dept_filter, department_assignments__end_date__isnull=True)
                ).distinct()
        else:
            if not dept_ids:
                return Response({'results': []})
            staff_qs = StaffProfile.objects.filter(
                Q(department_id__in=list(dept_ids)) |
                Q(department_assignments__department_id__in=list(dept_ids), department_assignments__end_date__isnull=True)
            ).select_related('user').distinct()

        results = []
        for s in staff_qs:
            user_data = None
            if s.user:
                user_data = {
                    'username': s.user.username,
                    'first_name': getattr(s.user, 'first_name', ''),
                    'last_name': getattr(s.user, 'last_name', '')
                }
            results.append({
                'id': s.id, 
                'user': user_data, 
                'staff_id': s.staff_id, 
                'department': getattr(s.department, 'id', None)
            })
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
        ).filter(Q(curriculum_row__isnull=False) | Q(subject__isnull=False) | Q(elective_subject__isnull=False)).select_related('curriculum_row', 'section', 'academic_year', 'subject', 'elective_subject')
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
        
        # allow filtering by student_id to find batches containing a specific student
        student_id = self.request.query_params.get('student_id')
        if student_id:
            try:
                student_id = int(student_id)
                qs = qs.filter(students__id=student_id).distinct()
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

    def get_queryset(self):
        """Filter queryset by date range if provided."""
        queryset = super().get_queryset()
        
        # Support date filtering for bulk attendance checking
        date_after = self.request.query_params.get('date_after')
        date_before = self.request.query_params.get('date_before')
        
        if date_after:
            try:
                import datetime
                queryset = queryset.filter(date__gte=datetime.date.fromisoformat(date_after))
            except Exception:
                pass
        
        if date_before:
            try:
                import datetime
                queryset = queryset.filter(date__lte=datetime.date.fromisoformat(date_before))
            except Exception:
                pass
        
        return queryset

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
                # If no explicit timetable assignment with staff, try resolving via TeachingAssignment
                if ta is None:
                    assign = TimetableAssignment.objects.filter(section=section, period=period, day=day).first()
                    if assign and not getattr(assign, 'staff', None):
                        from .models import TeachingAssignment as _TA
                        ta_match_qs = _TA.objects.filter(is_active=True, staff=staff_profile)
                        ta_match_qs = ta_match_qs.filter((Q(curriculum_row=assign.curriculum_row) | Q(elective_subject__parent=assign.curriculum_row))).filter(Q(section=section) | Q(section__isnull=True))
                        if ta_match_qs.exists():
                            ta = assign
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
                if ta is None:
                    assign = TimetableAssignment.objects.filter(section=section, period=period, day=day).first()
                    if assign and not getattr(assign, 'staff', None):
                        from .models import TeachingAssignment as _TA
                        ta_match_qs = _TA.objects.filter(is_active=True, staff=staff_profile)
                        ta_match_qs = ta_match_qs.filter((Q(curriculum_row=assign.curriculum_row) | Q(elective_subject__parent=assign.curriculum_row))).filter(Q(section=section) | Q(section__isnull=True))
                        if ta_match_qs.exists():
                            ta = assign
        except Exception:
            ta = None

        perms = get_user_permissions(user)
        if not (ta or 'academics.mark_attendance' in perms or user.is_superuser):
            raise PermissionDenied('You are not allowed to mark attendance for this period')

        with transaction.atomic():
            # Optionally create a temporary special timetable entry for this date/period
            try:
                if data.get('create_special'):
                    from timetable.models import SpecialTimetable, SpecialTimetableEntry
                    # create a simple SpecialTimetable container for this section and staff
                    st_name = f"Temp-{section.id}-{period.id}-{str(date)}"
                    special_tt, _ = SpecialTimetable.objects.get_or_create(section=section, name=st_name, defaults={'created_by': staff_profile, 'is_active': True})
                    SpecialTimetableEntry.objects.get_or_create(timetable=special_tt, date=date, period=period, defaults={'staff': staff_profile, 'curriculum_row': getattr(ta, 'curriculum_row', None) if ta is not None else None, 'subject_batch': getattr(ta, 'subject_batch', None) if ta is not None else None, 'subject_text': getattr(ta, 'subject_text', None) if ta is not None else None, 'is_active': True})
            except Exception:
                pass
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
            # If there's no subject_batch but staff is assigned to an elective sub-option,
            # use ElectiveChoice mappings to determine students for this elective.
            if students_source is None:
                try:
                    if ta and not getattr(ta, 'subject_batch', None):
                        from .models import TeachingAssignment as _TA
                        # find teaching assignment with elective_subject for this staff matching the curriculum_row parent
                        ta_match = _TA.objects.filter(is_active=True, staff=staff_profile, elective_subject__isnull=False).filter(
                            Q(elective_subject__parent=getattr(ta, 'curriculum_row', None))
                        ).filter(Q(section=section) | Q(section__isnull=True)).first()
                        if ta_match and getattr(ta_match, 'elective_subject', None):
                            from curriculum.models import ElectiveChoice
                            es = ta_match.elective_subject
                            choices = ElectiveChoice.objects.filter(elective_subject=es, is_active=True).select_related('student')
                            students_source = [getattr(c, 'student') for c in choices if getattr(c, 'student', None) is not None]
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

    @action(detail=False, methods=['post'], url_path='bulk-mark-range')
    def bulk_mark_range(self, request):
        """Bulk mark attendance for a date range (inclusive).

        Expected payload: {
            section_id, period_id, start_date, end_date, status, student_ids: [int,...]
        }
        """
        data = request.data or {}
        import logging
        logger = logging.getLogger(__name__)
        logger.warning('bulk_mark_range called by user=%s payload=%s', getattr(request.user, 'username', request.user), data)
        section_id = data.get('section_id')
        period_id = data.get('period_id')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        status_val = data.get('status')
        student_ids = data.get('student_ids') or []

        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Only staff may perform bulk range marking')

        # basic validation
        import datetime
        dates_list = None
        if data.get('dates'):
            # explicit list of ISO dates provided
            try:
                dates_list = [datetime.date.fromisoformat(d) for d in (data.get('dates') or [])]
            except Exception:
                return Response({'detail': 'Invalid dates list'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            try:
                sd = datetime.date.fromisoformat(start_date)
                ed = datetime.date.fromisoformat(end_date)
            except Exception:
                return Response({'detail': 'Invalid dates'}, status=status.HTTP_400_BAD_REQUEST)
            if ed < sd:
                return Response({'detail': 'end_date must be >= start_date'}, status=status.HTTP_400_BAD_REQUEST)

        # resolve section & period
        from .models import Section as _Section
        from timetable.models import TimetableSlot
        # support multiple assignments: [{section_id, period_id}, ...] or single section_id/period_id
        assignments_payload = data.get('assignments')
        assignments_list = []
        if assignments_payload and isinstance(assignments_payload, (list, tuple)):
            for item in assignments_payload:
                try:
                    sid = int(item.get('section_id'))
                    pid = int(item.get('period_id'))
                    s = _Section.objects.filter(pk=sid).first()
                    p = TimetableSlot.objects.filter(pk=pid).first()
                    if s and p:
                        assignments_list.append((s, p))
                except Exception:
                    continue
        else:
            section = _Section.objects.filter(pk=int(section_id)).first() if section_id is not None else None
            period = TimetableSlot.objects.filter(pk=int(period_id)).first() if period_id is not None else None
            if section and period:
                assignments_list.append((section, period))
        logger.warning('Resolved assignments_list count=%d', len(assignments_list))

        # permission: ensure user may mark these periods (reuse logic from bulk_mark)
        perms = get_user_permissions(user)

        # prepare students
        from .models import StudentProfile as _StudentProfile
        students = []
        for sid in student_ids:
            try:
                s = _StudentProfile.objects.filter(pk=int(sid)).first()
                if s:
                    students.append(s)
            except Exception:
                continue

        out_sessions = []
        if dates_list is None:
            day = sd
            delta = datetime.timedelta(days=1)
            dates_iter = []
            while day <= ed:
                dates_iter.append(day)
                day = day + delta
        else:
            dates_iter = sorted(dates_list)
        from timetable.models import TimetableAssignment
        from .models import PeriodAttendanceSession, PeriodAttendanceRecord
        logger.warning('Dates to process: %s', dates_iter)
        for day in dates_iter:
            dow = day.isoweekday()
            for (section_obj, period_obj) in assignments_list:
                logger.debug('Processing date=%s section=%s period=%s dow=%s', day, getattr(section_obj,'id',None), getattr(period_obj,'id',None), dow)
                # first check for a special timetable entry that explicitly applies to this date
                from timetable.models import SpecialTimetableEntry
                special_entry = SpecialTimetableEntry.objects.filter(timetable__section=section_obj, period=period_obj, date=day, is_active=True).first()
                if special_entry:
                    logger.warning('Found special_entry id=%s for date=%s', getattr(special_entry, 'id', None), day)
                    allow = True
                    ta = None
                    assign = None
                    assign_for_matching = special_entry
                else:
                    # check timetable assignment exists for this section/period/day and that staff can mark it
                    ta = TimetableAssignment.objects.filter(section=section_obj, period=period_obj, day=dow, staff=staff_profile).first()
                    allow = False
                    assign_for_matching = None
                    if ta is not None:
                        allow = True
                    else:
                        # try resolve via teaching assignment (electives etc.) — allow if TeachingAssignment matches
                        assign = TimetableAssignment.objects.filter(section=section_obj, period=period_obj, day=dow).first()
                        if assign:
                            from academics.models import TeachingAssignment as _TA
                            ta_match_qs = _TA.objects.filter(is_active=True, staff=staff_profile).filter((Q(curriculum_row=assign.curriculum_row) | Q(elective_subject__parent=assign.curriculum_row))).filter(Q(section=section_obj) | Q(section__isnull=True))
                            try:
                                match_exists = ta_match_qs.exists()
                            except Exception:
                                match_exists = False
                            if match_exists:
                                allow = True
                            logger.warning('assign exists id=%s ta_match_exists=%s', getattr(assign, 'id', None), match_exists)
                        else:
                            # No timetable assignment for this specific day; try any day for this section+period
                            assign_any = TimetableAssignment.objects.filter(section=section_obj, period=period_obj).first()
                            if assign_any:
                                from academics.models import TeachingAssignment as _TA
                                ta_match_qs = _TA.objects.filter(is_active=True, staff=staff_profile).filter((Q(curriculum_row=assign_any.curriculum_row) | Q(elective_subject__parent=assign_any.curriculum_row))).filter(Q(section=section_obj) | Q(section__isnull=True))
                                try:
                                    match_exists = ta_match_qs.exists()
                                except Exception:
                                    match_exists = False
                                if match_exists:
                                    allow = True
                                    # use assign_any as assign so later elective resolution can use curriculum_row
                                    assign = assign_any
                                logger.warning('assign_any exists id=%s ta_match_exists=%s', getattr(assign_any, 'id', None), match_exists)
                            else:
                                logger.warning('no timetable assign for section=%s period=%s day=%s', getattr(section_obj,'id',None), getattr(period_obj,'id',None), dow)
                    logger.warning('ta id=%s allow=%s', getattr(ta, 'id', None) if 'ta' in locals() else None, allow)
                if not allow:
                    logger.debug('Not allowed to mark for section=%s period=%s on dow=%s', getattr(section_obj,'id',None), getattr(period_obj,'id',None), dow)
                    continue

                # optionally create special timetable entries for this date/period
                try:
                    if data.get('create_special'):
                        from timetable.models import SpecialTimetable, SpecialTimetableEntry
                        st_name = f"Temp-{section_obj.id}-{period_obj.id}-{day.isoformat()}"
                        special_tt, _ = SpecialTimetable.objects.get_or_create(section=section_obj, name=st_name, defaults={'created_by': staff_profile, 'is_active': True})
                        SpecialTimetableEntry.objects.get_or_create(timetable=special_tt, date=day, period=period_obj, defaults={'staff': staff_profile, 'curriculum_row': None, 'subject_batch': None, 'subject_text': None, 'is_active': True})
                except Exception:
                    pass

                # create/get session and mark records
                session, created = PeriodAttendanceSession.objects.get_or_create(
                    section=section_obj, period=period_obj, date=day,
                    defaults={'timetable_assignment': ta, 'created_by': staff_profile}
                )
                logger.warning('get_or_create session returned id=%s created=%s timetable_assignment_on_session=%s', getattr(session, 'id', None), created, getattr(session, 'timetable_assignment_id', None))
                if ta and session.timetable_assignment is None:
                    session.timetable_assignment = ta
                    session.save()

                # determine students for this assignment if student_ids not provided
                if students:
                    target_students = students
                else:
                    target_students = []
                    # prefer subject_batch students if timetable assignment exists
                    if 'special_entry' in locals() and special_entry and getattr(special_entry, 'subject_batch', None):
                        try:
                            target_students = list(special_entry.subject_batch.students.all())
                        except Exception:
                            target_students = []
                    elif ta and getattr(ta, 'subject_batch', None):
                        try:
                            target_students = list(ta.subject_batch.students.all())
                        except Exception:
                            target_students = []
                    # else if special_entry or teaching assignment maps to elective, use ElectiveChoice
                    if not target_students:
                        try:
                            from academics.models import TeachingAssignment as _TA
                            # determine a curriculum_row to look up electives from
                            cr = None
                            if 'special_entry' in locals() and special_entry and getattr(special_entry, 'curriculum_row', None):
                                cr = getattr(special_entry, 'curriculum_row')
                            else:
                                try:
                                    cr = getattr(assign, 'curriculum_row', None)
                                except Exception:
                                    cr = None
                            ta_match = None
                            if cr is not None:
                                ta_match = _TA.objects.filter(is_active=True, staff=staff_profile, elective_subject__isnull=False).filter(Q(elective_subject__parent=cr) | Q(curriculum_row=cr)).filter(Q(section=section_obj) | Q(section__isnull=True)).select_related('elective_subject').first()
                            if ta_match and getattr(ta_match, 'elective_subject', None):
                                from curriculum.models import ElectiveChoice
                                es = ta_match.elective_subject
                                choices = ElectiveChoice.objects.filter(elective_subject=es, is_active=True).select_related('student')
                                target_students = [getattr(c, 'student') for c in choices if getattr(c, 'student', None) is not None]
                        except Exception:
                            target_students = []
                    # final fallback: section students
                    if not target_students:
                        try:
                            from .models import StudentSectionAssignment, StudentProfile as _StudentProfile
                            assign_qs = StudentSectionAssignment.objects.filter(section=section_obj, end_date__isnull=True).select_related('student__user')
                            sts = [a.student for a in assign_qs]
                            legacy = _StudentProfile.objects.filter(section=section_obj).select_related('user')
                            for s in legacy:
                                if not any(x.pk == s.pk for x in sts):
                                    sts.append(s)
                            target_students = sts
                        except Exception:
                            target_students = []

                created_records = []
                for stu in target_students:
                    obj, created = PeriodAttendanceRecord.objects.update_or_create(
                        session=session, student=stu,
                        defaults={'status': status_val or 'P', 'marked_by': staff_profile}
                    )
                    created_records.append({'id': obj.id, 'student_id': getattr(obj.student, 'id', None), 'status': obj.status})
                out_sessions.append({'date': day.isoformat(), 'section_id': section_obj.id, 'period_id': period_obj.id, 'session_id': session.id, 'records': created_records})
                logger.warning('Created/updated %d records for date=%s section=%s period=%s', len(created_records), day.isoformat(), section_obj.id, period_obj.id)

        return Response({'results': out_sessions})

    @action(detail=True, methods=['post'], url_path='lock')
    def lock_session(self, request, pk=None):
        """Lock an attendance session to prevent further edits."""
        session = self.get_object()
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        
        # Check permissions
        perms = get_user_permissions(user)
        is_creator = session.created_by == staff_profile if staff_profile else False
        is_assigned = False
        
        if session.timetable_assignment and staff_profile:
            is_assigned = session.timetable_assignment.staff == staff_profile
        
        if not (is_creator or is_assigned or 'academics.mark_attendance' in perms or user.is_superuser):
            raise PermissionDenied('You do not have permission to lock this attendance session')
        
        session.is_locked = True
        session.save(update_fields=['is_locked'])
        
        serializer = self.get_serializer(session)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='unlock')
    def unlock_session(self, request, pk=None):
        """Unlock an attendance session to allow edits."""
        session = self.get_object()
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        
        # Check permissions - stricter for unlocking
        perms = get_user_permissions(user)
        if not ('academics.mark_attendance' in perms or user.is_superuser):
            raise PermissionDenied('You do not have permission to unlock this attendance session')
        
        session.is_locked = False
        session.save(update_fields=['is_locked'])
        
        serializer = self.get_serializer(session)
        return Response(serializer.data)


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
                        # Match teaching assignments where staff is assigned to the same curriculum_row
                        # or to an elective sub-option whose parent is the curriculum_row.
                        ta_qs = _TA.objects.filter(is_active=True, staff=staff_profile)
                        ta_qs = ta_qs.filter(
                            (
                                Q(curriculum_row=a.curriculum_row)
                            )
                            |
                            (
                                Q(elective_subject__parent=a.curriculum_row)
                            )
                        )
                        # Section-scoped or department-wide (section is null) assignments are allowed
                        ta_qs = ta_qs.filter(Q(section=a.section) | Q(section__isnull=True))
                        if ta_qs.exists():
                            include = True
            except Exception:
                include = False

            if not include:
                continue

            # If there's a special timetable entry for this section/period/date,
            # prefer the special entry and skip the normal timetable assignment so
            # staff sees only the special period for that date.
            try:
                from timetable.models import SpecialTimetableEntry
                if SpecialTimetableEntry.objects.filter(timetable__section=a.section, period=a.period, date=date, is_active=True).exists():
                    # skip adding the normal assignment — the special entry will be
                    # included separately below (or by separate logic)
                    continue
            except Exception:
                pass

            # find existing session for this section/period/date (if any)
            session = PeriodAttendanceSession.objects.filter(section=a.section, period=a.period, date=date).first()
            # attempt to resolve if staff is assigned to an elective sub-option for this curriculum_row
            resolved_subject_display = None
            try:
                if not getattr(a, 'staff', None) and getattr(a, 'curriculum_row', None):
                    from .models import TeachingAssignment as _TA
                    ta_qs = _TA.objects.filter(is_active=True, staff=staff_profile).filter(
                        (Q(curriculum_row=a.curriculum_row) | Q(elective_subject__parent=a.curriculum_row))
                    ).filter(Q(section=a.section) | Q(section__isnull=True))
                    ta_obj = ta_qs.first()
                    if ta_obj and getattr(ta_obj, 'elective_subject', None):
                        es = ta_obj.elective_subject
                        resolved_subject_display = (getattr(es, 'course_code', None) or getattr(es, 'course_name', None))
                        resolved_elective_id = getattr(es, 'id', None)
                    else:
                        resolved_elective_id = None
            except Exception:
                resolved_subject_display = None
                resolved_elective_id = None

            results.append({
                'id': a.id,
                'section_id': a.section_id,
                'section_name': str(a.section),
                'period': {'id': a.period.id, 'index': a.period.index, 'label': a.period.label, 'start_time': getattr(a.period, 'start_time', None), 'end_time': getattr(a.period, 'end_time', None)},
                # provide a reliable subject display: prefer curriculum_row code/name, then subject_text
                'subject_id': getattr(getattr(a, 'curriculum_row', None), 'id', None),
                'subject_display': resolved_subject_display or (getattr(getattr(a, 'curriculum_row', None), 'course_code', None) or getattr(getattr(a, 'curriculum_row', None), 'course_name', None) or getattr(a, 'subject_text', None) or None),
                'elective_subject_id': resolved_elective_id if 'resolved_elective_id' in locals() else None,
                'subject_batch_id': getattr(a, 'subject_batch_id', None),
                'attendance_session_id': getattr(session, 'id', None),
                'attendance_session_locked': getattr(session, 'is_locked', False) if session else False,
            })
        # Also include any SpecialTimetableEntry items for this date where the current
        # staff is the assigned staff or is mapped via a TeachingAssignment for the
        # curriculum_row/elective. We present them alongside regular assignments so
        # the staff can open/take attendance for those special periods.
        try:
            from timetable.models import SpecialTimetableEntry
            from .models import PeriodAttendanceSession as _PAS
            special_qs = SpecialTimetableEntry.objects.filter(date=date, is_active=True).select_related('timetable__section', 'period', 'curriculum_row', 'subject_batch', 'staff')
            for se in special_qs:
                include = False
                try:
                    if getattr(se, 'staff', None) and getattr(se.staff, 'id', None) == getattr(staff_profile, 'id', None):
                        include = True
                    else:
                        # fallback: if special entry has a curriculum_row, check TeachingAssignment mappings
                        if getattr(se, 'curriculum_row', None):
                            from .models import TeachingAssignment as _TA
                            ta_qs = _TA.objects.filter(is_active=True, staff=staff_profile).filter(
                                (Q(curriculum_row=se.curriculum_row) | Q(elective_subject__parent=se.curriculum_row))
                            ).filter(Q(section=se.timetable.section) | Q(section__isnull=True))
                            if ta_qs.exists():
                                include = True
                except Exception:
                    include = False

                if not include:
                    continue

                # find existing session for this special entry's section/period/date
                sess = _PAS.objects.filter(section=se.timetable.section, period=se.period, date=date).first()
                subj_disp = None
                subj_id = None
                elective_id = None
                if getattr(se, 'curriculum_row', None):
                    subj_id = se.curriculum_row.id
                    subj_disp = getattr(se.curriculum_row, 'course_code', None) or getattr(se.curriculum_row, 'course_name', None)
                    try:
                        # if this staff is mapped to a sub-elective for this curriculum_row,
                        # prefer that sub-elective's display
                        from academics.models import TeachingAssignment as _TA
                        ta_obj = _TA.objects.filter(staff=staff_profile, is_active=True).filter(
                            Q(curriculum_row=se.curriculum_row) | Q(elective_subject__parent=se.curriculum_row)
                        ).select_related('elective_subject').first()
                        if ta_obj and getattr(ta_obj, 'elective_subject', None):
                            es = ta_obj.elective_subject
                            subj_disp = (getattr(es, 'course_code', None) or getattr(es, 'course_name', None))
                            elective_id = getattr(es, 'id', None)
                    except Exception:
                        pass
                else:
                    subj_disp = se.subject_text or None

                results.append({
                    'id': -(se.id),
                    'section_id': se.timetable.section.id,
                    'section_name': str(se.timetable.section),
                    'period': {'id': se.period.id, 'index': se.period.index, 'label': se.period.label, 'start_time': getattr(se.period, 'start_time', None), 'end_time': getattr(se.period, 'end_time', None)},
                    'subject_id': subj_id,
                    'subject_display': subj_disp,
                    'elective_subject_id': elective_id,
                    'subject_batch_id': getattr(se, 'subject_batch_id', None),
                    'attendance_session_id': getattr(sess, 'id', None),
                    'attendance_session_locked': getattr(sess, 'is_locked', False) if sess else False,
                    'is_special': True,
                })
        except Exception:
            # non-fatal: if special entries cannot be included, return the standard results
            pass

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
            advisor_qs = SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True, academic_year__is_active=True).select_related('section', 'section__batch', 'section__batch__course', 'section__batch__regulation')
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

            # annotate mentor info for students (active mappings)
            try:
                student_ids = []
                for v in students_by_section.values():
                    for st in v:
                        student_ids.append(st.pk)
                mentor_map = {}
                if student_ids:
                    mm_qs = StudentMentorMap.objects.filter(student_id__in=student_ids, is_active=True).select_related('mentor')
                    for mm in mm_qs:
                        try:
                            mentor_map[mm.student_id] = {'mentor_id': getattr(mm.mentor, 'id', None), 'mentor_name': getattr(getattr(mm.mentor, 'user', None), 'username', None)}
                        except Exception:
                            pass
            except Exception:
                mentor_map = {}

            results = []
            for sec in sections:
                studs = students_by_section.get(sec.id, [])
                ser = StudentSimpleSerializer([
                    {
                        'id': st.pk,
                        'reg_no': st.reg_no,
                        'user': getattr(st, 'user', None),
                        'section_id': getattr(st, 'section_id', None),
                        'section_name': str(getattr(st, 'section', '')),
                        'has_mentor': (st.pk in mentor_map),
                        'mentor_id': mentor_map.get(st.pk, {}).get('mentor_id'),
                        'mentor_name': mentor_map.get(st.pk, {}).get('mentor_name'),
                    }
                    for st in studs
                ], many=True)
                batch = getattr(sec, 'batch', None)
                course = getattr(batch, 'course', None) if batch is not None else None
                dept = getattr(course, 'department', None) if course is not None else None
                # serialize semester to a JSON-safe value (number or string)
                sem_obj = getattr(sec, 'semester', None)
                if sem_obj is None:
                    sem_val = None
                else:
                    sem_val = getattr(sem_obj, 'number', str(sem_obj))

                reg = getattr(batch, 'regulation', None) if batch else None
                results.append({
                    'section_id': sec.id,
                    'section_name': str(sec),
                    'batch': getattr(batch, 'name', None),
                    'batch_regulation': {'id': getattr(reg, 'id', None), 'code': getattr(reg, 'code', None), 'name': getattr(reg, 'name', None)} if reg else None,
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

