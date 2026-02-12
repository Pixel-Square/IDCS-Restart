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
import logging
from django.http import Http404
from django.utils import timezone
from datetime import timedelta

from .permissions import IsHODOfDepartment

from .models import (
    TeachingAssignment,
    SectionAdvisor,
    DepartmentRole,
    Section,
    StaffProfile,
    AcademicYear,
    StudentProfile,
    SpecialCourseAssessmentSelection,
    SpecialCourseAssessmentEditRequest,
)
from .models import PeriodAttendanceSession, PeriodAttendanceRecord
from .models import AttendanceUnlockRequest

from .serializers import (
    SectionAdvisorSerializer,
    TeachingAssignmentSerializer,
    StudentSimpleSerializer,
)
from .serializers import AcademicYearSerializer
from .serializers import PeriodAttendanceSessionSerializer, BulkPeriodAttendanceSerializer, AttendanceUnlockRequestSerializer
from accounts.utils import get_user_permissions
from .utils import get_user_effective_departments
from .serializers import TeachingAssignmentInfoSerializer
from .serializers import SpecialCourseAssessmentEditRequestSerializer
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


def _user_is_iqac_admin(user) -> bool:
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True
    try:
        role_names = {r.name.upper() for r in user.roles.all()}
    except Exception:
        role_names = set()
    if 'IQAC' in role_names:
        return True
    try:
        perms = {str(p or '').lower() for p in (get_user_permissions(user) or [])}
    except Exception:
        perms = set()
    return 'obe.master.manage' in perms


class MyTeachingAssignmentsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        qs = TeachingAssignment.objects.select_related(
            'subject',
            'curriculum_row',
            'curriculum_row__master',
            'section',
            'academic_year',
            'section__semester',
            'section__batch__course__department',
        ).filter(is_active=True)

        staff_profile = getattr(user, 'staff_profile', None)
        role_names = {r.name.upper() for r in user.roles.all()} if getattr(user, 'roles', None) is not None else set()

        # staff: only their teaching assignments (do not expand to department-level for HOD/ADVISOR here)
        if staff_profile:
            qs = qs.filter(staff=staff_profile)
        # else: admins can see all

        ser = TeachingAssignmentInfoSerializer(qs.order_by('section__name', 'id'), many=True)
        return Response(ser.data)


class TeachingAssignmentStudentsView(APIView):
    """Return the student roster for a given TeachingAssignment (active students in the section).

    URL: /api/academics/teaching-assignments/<ta_id>/students/
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request, ta_id):
        try:
            ta = TeachingAssignment.objects.select_related('section', 'academic_year', 'subject', 'curriculum_row').get(pk=ta_id, is_active=True)
        except TeachingAssignment.DoesNotExist:
            raise Http404('Teaching assignment not found')

        # basic permission: allow if user is staff owner, HOD/ADVISOR of the dept, OBE master/IQAC, or staff/admin
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        allowed = False
        if staff_profile and ta.staff_id == staff_profile.pk:
            allowed = True
        else:
            role_names = {r.name.upper() for r in user.roles.all()} if getattr(user, 'roles', None) is not None else set()
            if user.is_staff:
                allowed = True
            elif 'HOD' in role_names or 'ADVISOR' in role_names:
                allowed = True
            else:
                try:
                    perms = {str(p or '').lower() for p in (get_user_permissions(user) or [])}
                except Exception:
                    perms = set()
                if ('obe.master.manage' in perms) or ('IQAC' in role_names) or getattr(user, 'is_superuser', False):
                    allowed = True

        if not allowed:
            return Response({'detail': 'You do not have permission to view this roster.'}, status=403)

        # Prefer active StudentSectionAssignment entries for the section, falling back to StudentProfile.section
        from .models import StudentSectionAssignment, StudentProfile

        section_name = getattr(getattr(ta, 'section', None), 'name', None)

        # Best-effort subject metadata (supports both curriculum_row and legacy subject FK)
        subject_code = None
        subject_name = None
        subject_id = getattr(ta, 'subject_id', None)
        try:
            if getattr(ta, 'curriculum_row', None):
                cr = ta.curriculum_row
                subject_code = getattr(cr, 'course_code', None) or getattr(getattr(cr, 'master', None), 'course_code', None)
                subject_name = getattr(cr, 'course_name', None) or getattr(getattr(cr, 'master', None), 'course_name', None)
            if (not subject_code or not subject_name) and getattr(ta, 'subject', None):
                subject_code = subject_code or getattr(ta.subject, 'code', None)
                subject_name = subject_name or getattr(ta.subject, 'name', None)
        except Exception:
            pass

        def _student_display_name(user):
            if not user:
                return None
            try:
                full = ' '.join([
                    str(getattr(user, 'first_name', '') or '').strip(),
                    str(getattr(user, 'last_name', '') or '').strip(),
                ]).strip()
                if full:
                    return full
            except Exception:
                pass
            return getattr(user, 'username', None)

        students = []
        s_qs = StudentSectionAssignment.objects.filter(section=ta.section, end_date__isnull=True).select_related('student__user')
        for a in s_qs:
            sp = a.student
            u = getattr(sp, 'user', None)
            students.append({
                'id': sp.id,
                'reg_no': getattr(sp, 'reg_no', None),
                'name': _student_display_name(u),
                'section': section_name,
            })

        # fallback: include legacy StudentProfile.section entries if none found
        if not students:
            sp_qs = StudentProfile.objects.filter(section=ta.section).select_related('user')
            for sp in sp_qs:
                u = getattr(sp, 'user', None)
                students.append({
                    'id': sp.id,
                    'reg_no': getattr(sp, 'reg_no', None),
                    'name': _student_display_name(u),
                    'section': section_name,
                })

        return Response({
            'teaching_assignment': {
                'id': ta.id,
                'subject_id': subject_id,
                'subject_code': subject_code,
                'subject_name': subject_name,
                'section_id': getattr(ta, 'section_id', None),
                'section_name': section_name,
                'academic_year': getattr(getattr(ta, 'academic_year', None), 'name', None),
            },
            'students': students,
        })


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

    def perform_destroy(self, instance):
        """Allow only users with assign_advisor permission or the model delete perm or superuser to delete an advisor assignment."""
        user = self.request.user
        perms = get_user_permissions(user)
        if not (user.is_superuser or ('academics.assign_advisor' in perms) or user.has_perm('academics.delete_sectionadvisor')):
            raise PermissionDenied('You do not have permission to delete advisor assignments.')
        # Deleting the instance will trigger post_delete signal to remove ADVISOR role if no other active mapping exists
        instance.delete()


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


class CustomSubjectsListView(APIView):
    """Return the list of allowed custom subject choices for TeachingAssignment.custom_subject."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            field = TeachingAssignment._meta.get_field('custom_subject')
            choices = getattr(field, 'choices', []) or []
            results = [{'value': c[0], 'label': c[1]} for c in choices]
            return Response({'results': results})
        except Exception as e:
            logging.getLogger(__name__).exception('Failed to get custom subject choices: %s', e)
            try:
                # Fallback: return distinct non-null values present in DB
                qs = TeachingAssignment.objects.exclude(custom_subject__isnull=True).exclude(custom_subject__exact='').values_list('custom_subject', flat=True).distinct()
                results = [{'value': v, 'label': v} for v in qs]
                return Response({'results': results})
            except Exception as e2:
                logging.getLogger(__name__).exception('Fallback failed for custom subject choices: %s', e2)
                # Return safe empty result to avoid 500 in the UI
                return Response({'results': []})


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

    @action(detail=True, methods=['get', 'post'], permission_classes=(IsAuthenticated,), url_path='enabled_assessments', url_name='enabled_assessments')
    def enabled_assessments(self, request, pk=None):
        """Get or set enabled assessments.

        - For normal courses: stored on TeachingAssignment.enabled_assessments.
        - For SPECIAL courses: stored globally on SpecialCourseAssessmentSelection
          (curriculum_row + academic_year), locked after first save.

        GET returns { enabled_assessments: [...], meta: {...} }
        POST accepts { enabled_assessments: ["ssa1","cia1",...] }
        """
        try:
            ta = TeachingAssignment.objects.select_related(
                'section',
                'section__batch',
                'section__batch__course',
                'section__batch__course__department',
                'academic_year',
                'curriculum_row',
                'curriculum_row__master',
                'subject',
                'staff',
            ).get(pk=int(pk), is_active=True)
        except TeachingAssignment.DoesNotExist:
            return Response({'detail': 'Teaching assignment not found'}, status=404)

        def _resolve_curriculum_row(assignment: TeachingAssignment):
            """Best-effort resolve CurriculumDepartment row for this assignment.

            Some legacy TeachingAssignment rows may have `subject` filled but
            `curriculum_row` missing. For SPECIAL course behavior we need the
            curriculum row to find the global lock.
            """
            row = getattr(assignment, 'curriculum_row', None)
            if row is not None:
                return row
            try:
                from curriculum.models import CurriculumDepartment

                dept = None
                try:
                    dept = assignment.section.batch.course.department
                except Exception:
                    dept = None

                subj = getattr(assignment, 'subject', None)
                code = getattr(subj, 'code', None)
                name = getattr(subj, 'name', None)

                qs = CurriculumDepartment.objects.all().select_related('master', 'department')
                if dept is not None:
                    qs = qs.filter(department=dept)

                if code:
                    qs = qs.filter(Q(course_code__iexact=str(code).strip()) | Q(master__course_code__iexact=str(code).strip()))
                elif name:
                    qs = qs.filter(Q(course_name__iexact=str(name).strip()) | Q(master__course_name__iexact=str(name).strip()))
                else:
                    return None

                return qs.order_by('-updated_at', '-id').first()
            except Exception:
                return None

        def _is_special_course_row(row) -> bool:
            try:
                if not row:
                    return False
                # Prefer department row class_type, fall back to master
                ct = getattr(row, 'class_type', None) or getattr(getattr(row, 'master', None), 'class_type', None)
                return str(ct or '').upper() == 'SPECIAL'
            except Exception:
                return False

        def _clean_keys(vals):
            allowed = {'ssa1', 'formative1', 'ssa2', 'formative2', 'cia1', 'cia2'}
            cleaned = []
            for v in (vals or []):
                try:
                    s = str(v or '').strip().lower()
                except Exception:
                    s = ''
                if s and s in allowed and s not in cleaned:
                    cleaned.append(s)
            return cleaned

        user = request.user
        row = _resolve_curriculum_row(ta)
        if request.method == 'GET':
            meta = {'mode': 'TEACHING_ASSIGNMENT', 'locked': False, 'can_edit': True}
            if _is_special_course_row(row):
                sel = None
                master_id = getattr(row, 'master_id', None) if row is not None else None
                if master_id is not None:
                    # Global selection is shared across all CurriculumDepartment rows
                    # under the same master (course) for the academic year.
                    sel = (
                        SpecialCourseAssessmentSelection.objects.filter(
                            curriculum_row__master_id=master_id,
                            academic_year=ta.academic_year,
                        )
                        .select_related('curriculum_row')
                        .order_by('id')
                        .first()
                    )

                # If there is no global selection yet, fall back to the curriculum
                # configuration so other staff still see consistent enabled exams.
                enabled = None
                if sel is not None:
                    enabled = getattr(sel, 'enabled_assessments', [])
                if enabled is None:
                    enabled = getattr(row, 'enabled_assessments', None) if row is not None else None
                if enabled is None:
                    enabled = []

                locked = bool(sel and sel.locked)

                staff_profile = getattr(user, 'staff_profile', None)
                latest_req = None
                if master_id is not None and staff_profile:
                    latest_req = (
                        SpecialCourseAssessmentEditRequest.objects.filter(
                            selection__curriculum_row__master_id=master_id,
                            selection__academic_year=ta.academic_year,
                            requested_by=staff_profile,
                        )
                        .select_related('selection')
                        .order_by('-requested_at')
                        .first()
                    )

                # Safety net: If the central OBE edit-request queue has already been
                # approved/rejected for this SPECIAL selection, mirror that status here.
                # This ensures faculty immediately sees approval without needing perfect
                # sync in the IQAC approve handler.
                try:
                    if latest_req is not None:
                        from OBE.models import ObeEditRequest

                        staff_user = getattr(staff_profile, 'user', None)
                        subj_code = ''
                        try:
                            subj_code = getattr(row, 'course_code', None) or getattr(getattr(row, 'master', None), 'course_code', None) or ''
                        except Exception:
                            subj_code = ''

                        if staff_user is not None and subj_code:
                            obe_row = (
                                ObeEditRequest.objects.filter(
                                    staff_user=staff_user,
                                    academic_year=ta.academic_year,
                                    subject_code=subj_code,
                                    assessment='model',
                                    scope='MARK_MANAGER',
                                )
                                .order_by('-updated_at', '-id')
                                .first()
                            )

                            if obe_row is not None:
                                # Mirror APPROVED window.
                                if str(getattr(obe_row, 'status', '')).upper() == 'APPROVED':
                                    approved_until = getattr(obe_row, 'approved_until', None)
                                    if approved_until is not None and timezone.now() < approved_until:
                                        if latest_req.status != SpecialCourseAssessmentEditRequest.STATUS_APPROVED or latest_req.can_edit_until != approved_until:
                                            latest_req.status = SpecialCourseAssessmentEditRequest.STATUS_APPROVED
                                            latest_req.can_edit_until = approved_until
                                            latest_req.reviewed_by = getattr(obe_row, 'reviewed_by', None)
                                            latest_req.reviewed_at = getattr(obe_row, 'reviewed_at', None)
                                            latest_req.used_at = None
                                            latest_req.save(update_fields=['status', 'can_edit_until', 'reviewed_by', 'reviewed_at', 'used_at'])

                                # Mirror REJECTED.
                                elif str(getattr(obe_row, 'status', '')).upper() == 'REJECTED':
                                    if latest_req.status != SpecialCourseAssessmentEditRequest.STATUS_REJECTED:
                                        latest_req.status = SpecialCourseAssessmentEditRequest.STATUS_REJECTED
                                        latest_req.can_edit_until = None
                                        latest_req.reviewed_by = getattr(obe_row, 'reviewed_by', None)
                                        latest_req.reviewed_at = getattr(obe_row, 'reviewed_at', None)
                                        latest_req.used_at = None
                                        latest_req.save(update_fields=['status', 'can_edit_until', 'reviewed_by', 'reviewed_at', 'used_at'])
                except Exception:
                    pass

                can_edit = (not locked) or _user_is_iqac_admin(user) or (latest_req.is_edit_granted() if latest_req else False)
                meta = {
                    'mode': 'SPECIAL_GLOBAL',
                    'selection_id': getattr(sel, 'id', None),
                    'locked': locked,
                    'can_edit': can_edit,
                    'edit_request': (
                        {
                            'id': latest_req.id,
                            'status': latest_req.status,
                            'can_edit_until': latest_req.can_edit_until,
                            'used_at': latest_req.used_at,
                        }
                        if latest_req else None
                    ),
                }
                return Response({'enabled_assessments': enabled, 'meta': meta})

            return Response({'enabled_assessments': getattr(ta, 'enabled_assessments', []), 'meta': meta})

        if not serializer_check_user_can_manage(user, ta):
            return Response({'detail': 'You do not have permission to change enabled assessments for this teaching assignment.'}, status=403)

        data = request.data or {}
        vals = data.get('enabled_assessments')
        if vals is None:
            return Response({'detail': 'enabled_assessments is required'}, status=400)
        if not isinstance(vals, (list, tuple)):
            return Response({'detail': 'enabled_assessments must be a list'}, status=400)

        cleaned = _clean_keys(vals)
        if _is_special_course_row(row):
            if not cleaned:
                return Response({'detail': 'At least one assessment is required for SPECIAL courses.'}, status=400)

            if row is None or getattr(row, 'master_id', None) is None:
                return Response({'detail': 'Unable to resolve the course for this SPECIAL teaching assignment.'}, status=400)

            master_id = row.master_id

            staff_profile = getattr(user, 'staff_profile', None)

            # Find an existing global selection for this master+academic_year.
            sel = (
                SpecialCourseAssessmentSelection.objects.filter(
                    curriculum_row__master_id=master_id,
                    academic_year=ta.academic_year,
                )
                .order_by('id')
                .first()
            )

            if sel is not None and sel.locked and not _user_is_iqac_admin(user):
                latest_req = None
                if staff_profile:
                    latest_req = (
                        SpecialCourseAssessmentEditRequest.objects.filter(
                            selection__curriculum_row__master_id=master_id,
                            selection__academic_year=ta.academic_year,
                            requested_by=staff_profile,
                        )
                        .order_by('-requested_at')
                        .first()
                    )
                if not (latest_req and latest_req.is_edit_granted()):
                    return Response(
                        {
                            'detail': 'Selection is locked for this SPECIAL course. Request IQAC approval to edit.',
                            'enabled_assessments': sel.enabled_assessments,
                            'meta': {
                                'mode': 'SPECIAL_GLOBAL',
                                'selection_id': sel.id,
                                'locked': True,
                                'can_edit': False,
                                'edit_request': (
                                    {
                                        'id': latest_req.id,
                                        'status': latest_req.status,
                                        'can_edit_until': latest_req.can_edit_until,
                                        'used_at': latest_req.used_at,
                                    }
                                    if latest_req else None
                                ),
                            },
                        },
                        status=423,
                    )

                # consume the approval after a successful edit
                try:
                    latest_req.used_at = timezone.now()
                    latest_req.save(update_fields=['used_at'])
                except Exception:
                    pass

            # If no selection exists yet, create it for ALL department rows of this master.
            if sel is None:
                try:
                    from curriculum.models import CurriculumDepartment

                    dept_rows = CurriculumDepartment.objects.filter(master_id=master_id)
                except Exception:
                    dept_rows = []

                created_sel = None
                for r in dept_rows:
                    obj, created = SpecialCourseAssessmentSelection.objects.get_or_create(
                        curriculum_row=r,
                        academic_year=ta.academic_year,
                        defaults={'enabled_assessments': cleaned, 'locked': True, 'created_by': staff_profile},
                    )
                    if created_sel is None:
                        created_sel = obj
                    if not created:
                        obj.enabled_assessments = cleaned
                        obj.locked = True
                        obj.save(update_fields=['enabled_assessments', 'locked', 'updated_at'])

                sel = created_sel

            # Update all selections under this master+year to keep it global.
            try:
                qs = SpecialCourseAssessmentSelection.objects.filter(curriculum_row__master_id=master_id, academic_year=ta.academic_year)
                for obj in qs:
                    obj.enabled_assessments = cleaned
                    obj.locked = True
                    obj.save(update_fields=['enabled_assessments', 'locked', 'updated_at'])
            except Exception as e:
                return Response({'detail': 'Failed to save enabled assessments', 'error': str(e)}, status=500)

            return Response(
                {
                    'enabled_assessments': cleaned,
                    'meta': {
                        'mode': 'SPECIAL_GLOBAL',
                        'selection_id': getattr(sel, 'id', None),
                        'locked': True,
                        'can_edit': _user_is_iqac_admin(user),
                    },
                }
            )

        ta.enabled_assessments = cleaned
        try:
            ta.save(update_fields=['enabled_assessments'])
        except Exception as e:
            return Response({'detail': 'Failed to save enabled assessments', 'error': str(e)}, status=500)

        return Response({'enabled_assessments': cleaned, 'meta': {'mode': 'TEACHING_ASSIGNMENT', 'locked': False, 'can_edit': True}})

    def enabled_assessments_request_edit(self, request, pk=None):
        """Faculty: request IQAC approval to edit SPECIAL_GLOBAL enabled assessments.

        Endpoint: POST /api/academics/teaching-assignments/<pk>/enabled_assessments/request-edit/

        Creates a SpecialCourseAssessmentEditRequest (or returns existing pending/active approval)
        and mirrors it into the central OBE edit queue (ObeEditRequest) so IQAC UIs can review.
        """
        try:
            ta = TeachingAssignment.objects.select_related(
                'section',
                'section__batch',
                'section__batch__course',
                'section__batch__course__department',
                'academic_year',
                'curriculum_row',
                'curriculum_row__master',
                'subject',
                'staff',
            ).get(pk=int(pk), is_active=True)
        except TeachingAssignment.DoesNotExist:
            return Response({'detail': 'Teaching assignment not found'}, status=404)

        staff_profile = getattr(request.user, 'staff_profile', None)
        if not staff_profile:
            return Response({'detail': 'Staff profile not found'}, status=403)

        # Best-effort resolve CurriculumDepartment row.
        row = getattr(ta, 'curriculum_row', None)
        if row is None:
            try:
                from curriculum.models import CurriculumDepartment
                from django.db.models import Q

                dept = None
                try:
                    dept = ta.section.batch.course.department
                except Exception:
                    dept = None

                subj = getattr(ta, 'subject', None)
                code = getattr(subj, 'code', None)
                name = getattr(subj, 'name', None)

                qs = CurriculumDepartment.objects.all().select_related('master', 'department')
                if dept is not None:
                    qs = qs.filter(department=dept)

                if code:
                    qs = qs.filter(Q(course_code__iexact=str(code).strip()) | Q(master__course_code__iexact=str(code).strip()))
                elif name:
                    qs = qs.filter(Q(course_name__iexact=str(name).strip()) | Q(master__course_name__iexact=str(name).strip()))
                else:
                    qs = CurriculumDepartment.objects.none()

                row = qs.order_by('-updated_at', '-id').first()
            except Exception:
                row = None

        if not row:
            return Response({'detail': 'Unable to resolve curriculum row for this teaching assignment.'}, status=400)

        # Ensure SPECIAL course behavior.
        try:
            ct = getattr(row, 'class_type', None) or getattr(getattr(row, 'master', None), 'class_type', None)
            is_special = str(ct or '').upper() == 'SPECIAL'
        except Exception:
            is_special = False

        if not is_special:
            return Response({'detail': 'Edit approval requests are only supported for SPECIAL courses.'}, status=400)

        master_id = getattr(row, 'master_id', None)
        if master_id is None:
            return Response({'detail': 'Unable to resolve course master for this selection.'}, status=400)

        sel = (
            SpecialCourseAssessmentSelection.objects.filter(
                curriculum_row__master_id=master_id,
                academic_year=ta.academic_year,
            )
            .select_related('curriculum_row')
            .order_by('id')
            .first()
        )

        # If nothing is locked yet, there is nothing to request.
        if sel is None or not bool(getattr(sel, 'locked', False)):
            return Response({'detail': 'Selection is not locked yet; no approval needed.'}, status=400)

        existing = (
            SpecialCourseAssessmentEditRequest.objects.filter(
                selection__curriculum_row__master_id=master_id,
                selection__academic_year=ta.academic_year,
                requested_by=staff_profile,
            )
            .select_related('selection')
            .order_by('-requested_at')
            .first()
        )

        def _ensure_obe_backlink():
            """Best-effort mirror into OBE edit-request queue for IQAC screens."""
            try:
                from OBE.models import ObeEditRequest
            except Exception:
                import logging
                logging.getLogger(__name__).exception('Failed to import OBE.models for SPECIAL edit-request backlink')
                return

            staff_user = getattr(staff_profile, 'user', None)
            if staff_user is None:
                return

            subject_code = ''
            subject_name = ''
            try:
                subject_code = (
                    getattr(row, 'course_code', None)
                    or getattr(getattr(row, 'master', None), 'course_code', None)
                    or getattr(getattr(ta, 'subject', None), 'code', None)
                    or getattr(getattr(ta, 'curriculum_row', None), 'course_code', None)
                    or ''
                )
            except Exception:
                subject_code = ''
            try:
                subject_name = (
                    getattr(row, 'course_name', None)
                    or getattr(getattr(row, 'master', None), 'course_name', None)
                    or getattr(getattr(ta, 'subject', None), 'name', None)
                    or ''
                )
            except Exception:
                subject_name = ''

            if not subject_code:
                # If we couldn't resolve a meaningful subject code from the curriculum
                # row or subject, fall back to a stable teaching-assignment based code.
                try:
                    subject_code = (
                        getattr(getattr(ta, 'subject', None), 'code', None)
                        or getattr(getattr(ta, 'curriculum_row', None), 'course_code', None)
                        or f"TA-{getattr(ta, 'id', '')}"
                        or ''
                    )
                except Exception:
                    subject_code = f"TA-{getattr(ta, 'id', '')}"

            if not subject_code:
                return

            section_name = ''
            try:
                section_name = getattr(getattr(ta, 'section', None), 'name', None) or str(getattr(ta, 'section', ''))
            except Exception:
                section_name = ''

            try:
                # Always create a new pending OBE edit request so faculty can re-request
                # multiple times without hitting a limit. IQAC will see each request instantly.
                ObeEditRequest.objects.create(
                    staff_user=staff_user,
                    academic_year=ta.academic_year,
                    subject_code=subject_code,
                    subject_name=subject_name or '',
                    assessment='model',
                    scope='MARK_MANAGER',
                    reason='Edit request: enabled assessments (SPECIAL course global selection)',
                    teaching_assignment=ta,
                    section_name=section_name or '',
                )
            except Exception:
                import logging
                logging.getLogger(__name__).exception('Failed to create ObeEditRequest backlink for subject_code=%s ta=%s', subject_code, getattr(ta, 'id', None))
                return

        if existing:
            # If an existing request is currently granted (approved and within window),
            # return it unchanged so the caller knows edit access is active.
            if existing.is_edit_granted():
                _ensure_obe_backlink()
                ser = SpecialCourseAssessmentEditRequestSerializer(existing)
                return Response(ser.data)

            # If a pending request exists, treat a new request as a "re-send".
            # Update the requested timestamp and mirror into the OBE backlink,
            # then return with 201 so frontends display a fresh "sent" response.
            if existing.status == SpecialCourseAssessmentEditRequest.STATUS_PENDING:
                try:
                    existing.requested_at = timezone.now()
                    existing.save(update_fields=['requested_at'])
                except Exception:
                    pass
                _ensure_obe_backlink()
                ser = SpecialCourseAssessmentEditRequestSerializer(existing)
                return Response(ser.data, status=201)

        req = SpecialCourseAssessmentEditRequest.objects.create(selection=sel, requested_by=staff_profile)

        _ensure_obe_backlink()

        ser = SpecialCourseAssessmentEditRequestSerializer(req)
        return Response(ser.data, status=201)


class SpecialCourseAssessmentEditRequestViewSet(viewsets.ModelViewSet):
    queryset = SpecialCourseAssessmentEditRequest.objects.select_related('selection', 'selection__curriculum_row', 'selection__academic_year', 'requested_by', 'reviewed_by')
    serializer_class = SpecialCourseAssessmentEditRequestSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        if _user_is_iqac_admin(user):
            return self.queryset
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return SpecialCourseAssessmentEditRequest.objects.none()
        return self.queryset.filter(requested_by=staff_profile)

    @action(detail=True, methods=['post'], permission_classes=(IsAuthenticated,), url_path='review', url_name='review')
    def review(self, request, pk=None):
        """IQAC/admin approves/rejects an edit request.

        POST body:
          { "status": "APPROVED"|"REJECTED", "can_edit_minutes": 60 }
        """
        if not _user_is_iqac_admin(request.user):
            return Response({'detail': 'You do not have permission to review requests.'}, status=403)

        obj = self.get_object()
        data = request.data or {}
        new_status = str(data.get('status') or '').upper().strip()
        if new_status not in {SpecialCourseAssessmentEditRequest.STATUS_APPROVED, SpecialCourseAssessmentEditRequest.STATUS_REJECTED}:
            return Response({'detail': 'Invalid status. Use APPROVED or REJECTED.'}, status=400)

        minutes = data.get('can_edit_minutes')
        try:
            minutes_i = int(minutes) if minutes is not None else 60
        except Exception:
            minutes_i = 60
        minutes_i = max(5, min(minutes_i, 24 * 60))

        obj.status = new_status
        obj.reviewed_by = request.user
        obj.reviewed_at = timezone.now()
        obj.used_at = None
        if new_status == SpecialCourseAssessmentEditRequest.STATUS_APPROVED:
            obj.can_edit_until = timezone.now() + timedelta(minutes=minutes_i)
        else:
            obj.can_edit_until = None
        obj.save()

        # Mirror the review decision into the central OBE edit queue so IQAC UIs
        # that consume `ObeEditRequest` see the updated status and approval window.
        try:
            from OBE.models import ObeEditRequest

            # Resolve the faculty User associated with the staff profile who requested this edit
            staff_user = None
            try:
                staff_user = getattr(getattr(obj, 'requested_by', None), 'user', None)
            except Exception:
                staff_user = None

            # Best-effort subject code used when we created the ObeEditRequest earlier
            subject_code = None
            try:
                subject_code = getattr(getattr(obj.selection, 'curriculum_row', None), 'course_code', None) or getattr(getattr(getattr(obj.selection, 'curriculum_row', None), 'master', None), 'course_code', None) or ''
            except Exception:
                subject_code = ''

            if staff_user is not None:
                qs = ObeEditRequest.objects.filter(
                    staff_user=staff_user,
                    academic_year=obj.selection.academic_year,
                    subject_code=subject_code,
                    assessment='model',
                    scope='MARK_MANAGER',
                )
                for o in qs:
                    try:
                        if new_status == SpecialCourseAssessmentEditRequest.STATUS_APPROVED:
                            o.mark_approved(request.user, window_minutes=minutes_i)
                        else:
                            o.mark_rejected(request.user)
                        o.save()
                    except Exception:
                        continue
        except Exception:
            # best-effort only; don't surface failures to the caller
            pass
        return Response(self.get_serializer(obj).data)


class SpecialCourseEnabledAssessmentsView(APIView):
    """Fetch SPECIAL-course global enabled assessments for a course code.

    This reads from `SpecialCourseAssessmentSelection` (global lock) and is used by
    course-level pages (IQAC / course OBE pages) so the UI doesn't rely on stale
    curriculum-row enabled_assessments.

    GET /api/academics/special-courses/<course_code>/enabled_assessments/
      Optional query: ?academic_year_id=<id>
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, course_code: str):
        code = str(course_code or '').strip()
        if not code:
            return Response({'detail': 'course_code is required.'}, status=400)

        ay_id = request.query_params.get('academic_year_id')
        academic_year = None
        if ay_id:
            try:
                academic_year = AcademicYear.objects.filter(id=int(str(ay_id))).first()
            except Exception:
                academic_year = None
        if academic_year is None:
            academic_year = AcademicYear.objects.filter(is_active=True).order_by('-id').first()

        if academic_year is None:
            return Response({'detail': 'No active academic year found.'}, status=404)

        try:
            from django.db.models import Q
            from .models import SpecialCourseAssessmentSelection

            sel = (
                SpecialCourseAssessmentSelection.objects.filter(academic_year=academic_year)
                .filter(Q(curriculum_row__course_code__iexact=code) | Q(curriculum_row__master__course_code__iexact=code))
                .order_by('id')
                .first()
            )
        except Exception:
            sel = None

        enabled = []
        if sel is not None:
            try:
                enabled = list(getattr(sel, 'enabled_assessments', None) or [])
            except Exception:
                enabled = []

        return Response(
            {
                'course_code': code,
                'academic_year_id': getattr(academic_year, 'id', None),
                'selection_id': getattr(sel, 'id', None),
                'locked': bool(getattr(sel, 'locked', False)) if sel is not None else False,
                'enabled_assessments': enabled,
            }
        )


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
                serializer.save()
                return
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
                if staff_profile and parent_dept_id:
                    hod_depts = list(DepartmentRole.objects.filter(staff=staff_profile, role='HOD', is_active=True).values_list('department_id', flat=True))
                    if parent_dept_id in hod_depts:
                        serializer.save()
                        return
            except Exception:
                pass
            raise PermissionDenied('You do not have permission to change this elective teaching assignment.')

        # Regular subject: advisor for section required
        staff_profile = getattr(user, 'staff_profile', None)
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


class IQACCourseTeachingMapView(APIView):
    """IQAC/OBE Master: list teaching assignments for a course across sections.

    Returns section + staff mapping as card-friendly rows.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, course_code: str):
        user = request.user
        perms = {str(p or '').lower() for p in (get_user_permissions(user) or [])}
        roles = set()
        try:
            roles = {str(r.name or '').upper() for r in user.roles.all()}
        except Exception:
            roles = set()

        # Gate to IQAC/OBE master users only.
        if not (user.is_superuser or user.is_staff or ('obe.master.manage' in perms) or ('IQAC' in roles)):
            raise PermissionDenied('IQAC/OBE Master access only.')

        code = str(course_code or '').strip()
        if not code:
            return Response({'results': []})

        qs = TeachingAssignment.objects.select_related(
            'staff',
            'staff__user',
            'section',
            'academic_year',
            'subject',
            'curriculum_row',
            'curriculum_row__master',
            'section__batch__course__department',
        ).filter(is_active=True)

        # Filter to the requested course first.
        qs = qs.filter(
            Q(curriculum_row__course_code__iexact=code)
            | Q(curriculum_row__master__course_code__iexact=code)
            | Q(subject__code__iexact=code)
        )

        # Prefer active academic year only within this course (avoid hiding results when
        # the course assignments exist but the academic_year.is_active flag isn't set).
        try:
            if qs.filter(academic_year__is_active=True).exists():
                qs_active = qs.filter(academic_year__is_active=True)
                if qs_active.exists():
                    qs = qs_active
        except Exception:
            pass

        results = []
        for ta in qs.order_by('section__name', 'id'):
            sec = getattr(ta, 'section', None)
            ay = getattr(ta, 'academic_year', None)
            staff = getattr(ta, 'staff', None)
            staff_user = getattr(staff, 'user', None) if staff else None

            # Best-effort subject metadata
            subject_code = None
            subject_name = None
            try:
                if getattr(ta, 'curriculum_row', None):
                    cr = ta.curriculum_row
                    subject_code = getattr(cr, 'course_code', None) or getattr(getattr(cr, 'master', None), 'course_code', None)
                    subject_name = getattr(cr, 'course_name', None) or getattr(getattr(cr, 'master', None), 'course_name', None)
                if (not subject_code or not subject_name) and getattr(ta, 'subject', None):
                    subject_code = subject_code or getattr(ta.subject, 'code', None)
                    subject_name = subject_name or getattr(ta.subject, 'name', None)
            except Exception:
                pass

            results.append(
                {
                    'teaching_assignment_id': getattr(ta, 'id', None),
                    'course_code': subject_code or code,
                    'course_name': subject_name,
                    'section_id': getattr(sec, 'id', None),
                    'section_name': getattr(sec, 'name', None),
                    'academic_year': getattr(ay, 'name', None) if ay else None,
                    'staff': {
                        'id': getattr(staff, 'id', None),
                        'staff_id': getattr(staff, 'staff_id', None),
                        'username': getattr(staff_user, 'username', None),
                        'name': ' '.join(filter(None, [getattr(staff_user, 'first_name', ''), getattr(staff_user, 'last_name', '')])).strip()
                        or getattr(staff_user, 'username', None),
                    }
                    if staff
                    else None,
                }
            )

        return Response({'results': results})


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


class AttendanceUnlockRequestViewSet(viewsets.ModelViewSet):
    """Manage attendance unlock requests: create by staff, list/approve by admins."""
    queryset = AttendanceUnlockRequest.objects.select_related('session__section', 'requested_by', 'reviewed_by').order_by('-requested_at')
    serializer_class = AttendanceUnlockRequestSerializer
    permission_classes = (IsAuthenticated,)
    pagination_class = None  # Disable pagination for simpler response
    logger = logging.getLogger(__name__)

    def get_queryset(self):
        user = self.request.user
        perms = get_user_permissions(user)
        self.logger.info(f"User {user.username} permissions: {perms}")
        # Only users with analytics.view_all_analytics (or superuser) can view all requests
        if 'analytics.view_all_analytics' in perms or user.is_superuser:
            self.logger.info(f"User {user.username} has admin access - returning all requests")
            # Return fresh queryset for admins to see all requests
            qs = AttendanceUnlockRequest.objects.select_related('session__section', 'requested_by', 'reviewed_by').order_by('-requested_at')
            self.logger.info(f"Admin queryset count: {qs.count()}")
            return qs
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile:
            self.logger.info(f"Staff profile found: ID={staff_profile.id}, Staff_ID={staff_profile.staff_id}")
            # Return filtered queryset for regular staff to see only their requests
            qs = AttendanceUnlockRequest.objects.select_related('session__section', 'requested_by', 'reviewed_by').filter(requested_by=staff_profile).order_by('-requested_at')
            self.logger.info(f"Staff {user.username} queryset count: {qs.count()}")
            # Log each request for debugging
            for req in qs:
                self.logger.info(f"  - Request #{req.id}: status={req.status}, session={req.session_id}, requested_by={req.requested_by_id}")
            return qs
        self.logger.warning(f"User {user.username} has no staff profile - returning empty queryset")
        return AttendanceUnlockRequest.objects.none()

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        self.logger.info(f"Returning {len(serializer.data)} requests to user {request.user.username}")
        for item in serializer.data:
            self.logger.info(f"  - Request #{item['id']}: status={item['status']}")
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'detail': 'Only staff may request unlocks'}, status=403)

        session_id = request.data.get('session') or request.data.get('session_id')
        note = request.data.get('note', '')
        try:
            session = PeriodAttendanceSession.objects.filter(pk=int(session_id)).first()
        except Exception:
            session = None
        if not session:
            return Response({'detail': 'Session not found'}, status=404)

        # Check if there's already a pending request for this session
        existing_pending = AttendanceUnlockRequest.objects.filter(
            session=session,
            status='PENDING'
        ).first()
        
        if existing_pending:
            # Return existing request instead of creating duplicate
            ser = AttendanceUnlockRequestSerializer(existing_pending, context={'request': request})
            return Response({
                'detail': 'An unlock request for this session is already pending',
                'existing_request': ser.data
            }, status=400)

        req = AttendanceUnlockRequest.objects.create(session=session, requested_by=staff_profile, note=note)
        self.logger.info(f"Created unlock request #{req.id} for session {session.id} by staff {staff_profile.id} (user: {user.username})")
        ser = AttendanceUnlockRequestSerializer(req, context={'request': request})
        return Response(ser.data, status=201)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        user = request.user
        perms = get_user_permissions(user)
        if not ('analytics.view_all_analytics' in perms or user.is_superuser):
            return Response({'detail': 'Permission denied'}, status=403)
        
        # Use direct model lookup instead of get_object() to bypass queryset filtering
        try:
            req = AttendanceUnlockRequest.objects.get(pk=pk)
        except AttendanceUnlockRequest.DoesNotExist:
            return Response({'detail': f'Request with ID {pk} not found'}, status=404)
        
        self.logger.info(f"User {user.username} approving request #{req.id} (status: {req.status}, requested_by: {req.requested_by_id})")
        if req.status != 'PENDING':
            return Response({'detail': 'Request already processed'}, status=400)
        req.status = 'APPROVED'
        req.reviewed_by = getattr(user, 'staff_profile', None)
        import django.utils.timezone as tz
        req.reviewed_at = tz.now()
        req.save()
        self.logger.info(f"Request #{req.id} approved successfully")

        try:
            sess = req.session
            sess.is_locked = False
            sess.save(update_fields=['is_locked'])
        except Exception:
            pass

        ser = AttendanceUnlockRequestSerializer(req, context={'request': request})
        return Response(ser.data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        user = request.user
        perms = get_user_permissions(user)
        if not ('analytics.view_all_analytics' in perms or user.is_superuser):
            return Response({'detail': 'Permission denied'}, status=403)
        
        # Use direct model lookup instead of get_object() to bypass queryset filtering
        try:
            req = AttendanceUnlockRequest.objects.get(pk=pk)
        except AttendanceUnlockRequest.DoesNotExist:
            return Response({'detail': f'Request with ID {pk} not found'}, status=404)
        
        self.logger.info(f"User {user.username} rejecting request #{req.id} (status: {req.status}, requested_by: {req.requested_by_id})")
        if req.status != 'PENDING':
            return Response({'detail': 'Request already processed'}, status=400)
        req.status = 'REJECTED'
        req.reviewed_by = getattr(user, 'staff_profile', None)
        import django.utils.timezone as tz
        req.reviewed_at = tz.now()
        req.save()
        self.logger.info(f"Request #{req.id} rejected successfully, new status: {req.status}")
        ser = AttendanceUnlockRequestSerializer(req, context={'request': request})
        return Response(ser.data)


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
            # determine latest unlock request status for this session (if any)
            unlock_status = None
            unlock_id = None
            try:
                if session:
                    req = AttendanceUnlockRequest.objects.filter(session=session).order_by('-requested_at').first()
                    if req:
                        unlock_status = getattr(req, 'status', None)
                        unlock_id = getattr(req, 'id', None)
            except Exception:
                unlock_status = None
                unlock_id = None
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
                # include latest unlock request status (if any) so frontend can show pending/approved/rejected
                'unlock_request_status': unlock_status,
                'unlock_request_id': unlock_id,
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

                # determine latest unlock request for special session (if any)
                special_unlock_status = None
                special_unlock_id = None
                try:
                    if sess:
                        sreq = AttendanceUnlockRequest.objects.filter(session=sess).order_by('-requested_at').first()
                        if sreq:
                            special_unlock_status = getattr(sreq, 'status', None)
                            special_unlock_id = getattr(sreq, 'id', None)
                except Exception:
                    special_unlock_status = None
                    special_unlock_id = None

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
                    'unlock_request_status': special_unlock_status,
                    'unlock_request_id': special_unlock_id,
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
            present_statuses = {'P', 'OD', 'LATE'}

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

