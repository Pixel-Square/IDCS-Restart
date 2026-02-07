from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment
from .serializers import TimetableTemplateSerializer, PeriodDefinitionSerializer, TimetableAssignmentSerializer
from accounts.utils import get_user_permissions
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from academics.models import Section
from rest_framework.exceptions import PermissionDenied
from django.db.models import OuterRef, Exists, Q


class CurriculumBySectionView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        sec_id = request.query_params.get('section_id') or request.query_params.get('section')
        if not sec_id:
            return Response({'results': []})
        try:
            sec = Section.objects.select_related('batch__course__department', 'semester').get(pk=int(sec_id))
        except Exception:
            return Response({'results': []})

        dept = getattr(sec.batch.course, 'department', None)
        sem = getattr(sec.semester, 'number', None)
        if dept is None or sem is None:
            return Response({'results': []})

        try:
            from curriculum.models import CurriculumDepartment
            qs = CurriculumDepartment.objects.filter(department=dept, semester__number=sem)
            data = [{'id': c.pk, 'course_code': c.course_code, 'course_name': c.course_name} for c in qs]
            return Response({'results': data})
        except Exception:
            return Response({'results': []})


class SectionTimetableView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, section_id: int):
        try:
            sec = Section.objects.select_related('batch__course__department').get(pk=int(section_id))
        except Exception:
            return Response({'results': []})

        # collect assignments for this section
        qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'subject_batch').filter(section=sec)
        # If requesting student is a student profile, filter assignments to those
        # that are either unbatched or belong to a batch that includes the student.
        student_profile = getattr(request.user, 'student_profile', None)
        if student_profile:
            from django.db.models import Q
            qs = qs.filter(Q(subject_batch__isnull=True) | Q(subject_batch__students=student_profile)).distinct()
        # group by day -> list of assignments with period index and times
        out = {}
        for a in qs:
            day = a.day
            lst = out.setdefault(day, [])
            # determine staff to present: explicit staff on the assignment or
            # resolve via active TeachingAssignment mapping if not set.
            staff_obj = None
            if a.staff:
                staff_obj = a.staff
            else:
                try:
                    from academics.models import TeachingAssignment
                    if getattr(a, 'curriculum_row', None) and getattr(a, 'section', None):
                        ta = TeachingAssignment.objects.filter(section=a.section, curriculum_row=a.curriculum_row, is_active=True).select_related('staff').first()
                        if ta and getattr(ta, 'staff', None):
                            staff_obj = ta.staff
                except Exception:
                    staff_obj = None

            # resolve subject_batch: prefer explicit assignment batch, else if
            # requesting user is a student try to find a batch for the same
            # curriculum_row that includes the student so the UI can show the
            # student's mapped batch for unbatched assignments (e.g. double
            # period entries created without a batch on one slot).
            sb = getattr(a, 'subject_batch', None)
            if sb is None and student_profile:
                try:
                    from academics.models import StudentSubjectBatch
                    sb = StudentSubjectBatch.objects.filter(curriculum_row=a.curriculum_row, students=student_profile).first()
                except Exception:
                    sb = None

            # prefer elective subject display when applicable
            subj_text = a.subject_text
            elective_id = None
            try:
                # If this assignment references a curriculum_row that is an elective parent,
                # prefer the student's chosen ElectiveChoice when viewing as a student.
                if a.curriculum_row:
                    if student_profile:
                        from curriculum.models import ElectiveChoice
                        ec = ElectiveChoice.objects.filter(student=student_profile, elective_subject__parent=a.curriculum_row, is_active=True, academic_year__is_active=True).select_related('elective_subject').first()
                        if ec and getattr(ec, 'elective_subject', None):
                            es = ec.elective_subject
                            subj_text = f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
                            elective_id = getattr(es, 'id', None)
                    else:
                        # For non-student views, prefer any TeachingAssignment elective mapping.
                        # Prefer section-scoped mapping first, then department-wide mappings
                        from academics.models import TeachingAssignment
                        try:
                            ta = TeachingAssignment.objects.filter(section=a.section, is_active=True).filter(
                                Q(curriculum_row=a.curriculum_row) | Q(elective_subject__parent=a.curriculum_row)
                            ).select_related('elective_subject').first()
                            if not ta:
                                ta = TeachingAssignment.objects.filter(is_active=True).filter(
                                    Q(curriculum_row=a.curriculum_row) | Q(elective_subject__parent=a.curriculum_row)
                                ).select_related('elective_subject').first()
                            if ta and getattr(ta, 'elective_subject', None):
                                es = ta.elective_subject
                                subj_text = f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
                                elective_id = getattr(es, 'id', None)
                        except Exception:
                            pass
            except Exception:
                pass

            # If student has an elective choice for this parent curriculum_row,
            # expose the elective subject details and omit the parent curriculum_row
            # so the UI shows the chosen sub-elective directly.
            curriculum_obj = None
            elective_obj = None
            if elective_id and a.curriculum_row is not None and student_profile:
                try:
                    from curriculum.models import ElectiveSubject
                    es = ElectiveSubject.objects.filter(pk=elective_id).first()
                    if es:
                        elective_obj = {'id': es.pk, 'course_code': getattr(es, 'course_code', None), 'course_name': getattr(es, 'course_name', None)}
                except Exception:
                    elective_obj = None
            else:
                curriculum_obj = {'id': a.curriculum_row.pk, 'course_code': a.curriculum_row.course_code, 'course_name': a.curriculum_row.course_name} if a.curriculum_row else None

            new_entry = {
                'id': getattr(a, 'id', None),
                'period_index': getattr(a.period, 'index', None),
                'period_id': getattr(a.period, 'id', None),
                'start_time': getattr(a.period, 'start_time', None),
                'end_time': getattr(a.period, 'end_time', None),
                'is_break': getattr(a.period, 'is_break', False),
                'label': getattr(a.period, 'label', None),
                'curriculum_row': curriculum_obj,
                'elective_subject': elective_obj,
                'subject_text': subj_text,
                'elective_subject_id': elective_id,
                'subject_batch': {'id': sb.pk, 'name': getattr(sb, 'name', None)} if sb else None,
                'staff': {'id': staff_obj.pk, 'staff_id': getattr(staff_obj, 'staff_id', None), 'username': getattr(getattr(staff_obj, 'user', None), 'username', None)} if staff_obj else None,
            }

            # Avoid duplicate entries for the same period: prefer student-specific batch
            # or resolved elective entry over a generic unbatched assignment.
            replaced = False
            for i, exist in enumerate(lst):
                try:
                    if exist.get('period_id') == new_entry.get('period_id'):
                        # If existing has no subject_batch but new has one -> replace
                        if (exist.get('subject_batch') is None) and (new_entry.get('subject_batch') is not None):
                            lst[i] = new_entry
                            replaced = True
                            break
                        # If existing has elective_subject is None and new has elective -> replace
                        if (exist.get('elective_subject') is None) and (new_entry.get('elective_subject') is not None):
                            lst[i] = new_entry
                            replaced = True
                            break
                        # Otherwise keep the existing (prefer first found)
                        replaced = True
                        break
                except Exception:
                    continue

            if not replaced:
                lst.append(new_entry)

        # convert keys to sorted list of days
        results = []
        for day in sorted(out.keys()):
            results.append({'day': day, 'assignments': sorted(out[day], key=lambda x: (x.get('period_index') or 0))})
        return Response({'results': results})


class SectionSubjectsStaffView(APIView):
    """Return list of subjects (curriculum rows) for a section with assigned staff where available."""
    permission_classes = (IsAuthenticated,)

    def get(self, request, section_id: int):
        try:
            sec = Section.objects.select_related('batch__course__department').get(pk=int(section_id))
        except Exception:
            return Response({'results': []})

        results = []
        try:
            # fetch curriculum rows for the section
            from curriculum.models import CurriculumDepartment
            dept = getattr(sec.batch.course, 'department', None)
            sem = getattr(sec.semester, 'number', None)
            if dept is None or sem is None:
                return Response({'results': []})
            qs = CurriculumDepartment.objects.filter(department=dept, semester__number=sem)
            # build a map from curriculum_row id -> staff (from TeachingAssignment)
            staff_map = {}
            from academics.models import TeachingAssignment
            tas = TeachingAssignment.objects.filter(section=sec, is_active=True).select_related('staff', 'curriculum_row')
            for ta in tas:
                if getattr(ta, 'curriculum_row', None) and getattr(ta, 'staff', None):
                    staff_map[getattr(ta.curriculum_row, 'id')] = getattr(getattr(ta.staff, 'user', None), 'username', None)

            # also consider direct timetable assignments that may override
            from .models import TimetableAssignment
            tassigns = TimetableAssignment.objects.filter(section=sec).select_related('curriculum_row', 'staff')
            for a in tassigns:
                cr = getattr(a, 'curriculum_row', None)
                if cr is not None:
                    if getattr(a, 'staff', None):
                        staff_map[getattr(cr, 'id')] = getattr(getattr(a.staff, 'user', None), 'username', None)

            for c in qs:
                results.append({'id': c.id, 'course_code': c.course_code, 'course_name': c.course_name, 'staff': staff_map.get(c.id)})

            # include any timetable-only subjects (no curriculum_row) with staff
            for a in tassigns:
                if not getattr(a, 'curriculum_row', None) and (a.subject_text or getattr(a, 'staff', None)):
                    key = f"txt-{(a.subject_text or '')[:100]}"
                    results.append({'id': key, 'course_code': None, 'course_name': a.subject_text, 'staff': getattr(getattr(a.staff, 'user', None), 'username', None)})

        except Exception:
            return Response({'results': []})

        return Response({'results': results})


class TimetableTemplateViewSet(viewsets.ModelViewSet):
    queryset = TimetableTemplate.objects.all().prefetch_related('periods')
    serializer_class = TimetableTemplateSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        # IQAC users or admins may see all templates; otherwise show public templates
        perms = get_user_permissions(user)
        if 'timetable.manage_templates' in perms or user.is_staff:
            return super().get_queryset()
        # For regular users, prefer active templates only
        return self.queryset.filter(is_active=True)


class TimetableSlotViewSet(viewsets.ModelViewSet):
    queryset = TimetableSlot.objects.select_related('template')
    serializer_class = PeriodDefinitionSerializer
    permission_classes = (IsAuthenticated,)


class TimetableAssignmentViewSet(viewsets.ModelViewSet):
    queryset = TimetableAssignment.objects.select_related('period', 'section', 'staff', 'curriculum_row', 'subject_batch')
    serializer_class = TimetableAssignmentSerializer
    permission_classes = (IsAuthenticated,)

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        role_names = {r.name.upper() for r in user.roles.all()}
        # Allow HOD/staff or users with timetable.assign permission.
        # Advisors may have 'ADVISOR' role; restrict them to sections they advise.
        allowed = False
        if 'timetable.assign' in perms or user.is_staff or 'HOD' in role_names:
            allowed = True
        if 'ADVISOR' in role_names:
            # advisor: ensure they're advisor for the target section
            sec_id = None
            # try serializer initial data then request data
            sec_id = serializer.initial_data.get('section_id') or serializer.initial_data.get('section') or self.request.data.get('section_id') or self.request.data.get('section')
            try:
                if sec_id is not None:
                    sec_id = int(sec_id)
            except Exception:
                sec_id = None
            if sec_id:
                try:
                    from academics.models import SectionAdvisor
                    staff_profile = getattr(user, 'staff_profile', None)
                    if staff_profile and SectionAdvisor.objects.filter(section_id=sec_id, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists():
                        allowed = True
                except Exception:
                    pass

        if not allowed:
            raise PermissionDenied('You do not have permission to assign timetable entries for this section.')

        # If staff not provided but curriculum_row and section are present,
        # attempt to auto-assign staff from TeachingAssignment mapping.
        try:
            data = serializer.validated_data
            staff_provided = data.get('staff', None)
            curriculum_row = data.get('curriculum_row', None)
            section = data.get('section', None)
            if not staff_provided and curriculum_row and section:
                from academics.models import TeachingAssignment
                ta = TeachingAssignment.objects.filter(section=section, curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                if ta and getattr(ta, 'staff', None):
                    # Do not persist the resolved staff here. Leave `staff` null
                    # so the UI can dynamically resolve the current TeachingAssignment
                    # mapping; persisting the staff makes the timetable stale when
                    # the TeachingAssignment changes.
                    serializer.save()
                    return
        except Exception:
            # ignore auto-assign failures and fall back to normal save
            pass

        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        role_names = {r.name.upper() for r in user.roles.all()}
        # similar check as create: allow HOD/staff or timetable.assign; ADVISOR limited to their sections
        allowed = False
        if 'timetable.assign' in perms or user.is_staff or 'HOD' in role_names:
            allowed = True
        if 'ADVISOR' in role_names:
            # when updating, instance contains the section
            inst = getattr(serializer, 'instance', None)
            sec_id = None
            if inst is not None:
                sec_id = getattr(inst, 'section_id', None)
            try:
                if not sec_id:
                    sec_id = int(self.request.data.get('section_id') or self.request.data.get('section') or 0)
            except Exception:
                sec_id = None
            if sec_id:
                try:
                    from academics.models import SectionAdvisor
                    staff_profile = getattr(user, 'staff_profile', None)
                    if staff_profile and SectionAdvisor.objects.filter(section_id=sec_id, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists():
                        allowed = True
                except Exception:
                    pass

        if not allowed:
            raise PermissionDenied('You do not have permission to change timetable entries for this section.')
        serializer.save()

    def create(self, request, *args, **kwargs):
        # accept slot_id/section_id/academic_year_id in payload
        # if an assignment already exists for (section, day, period) -> update it (upsert)
        sec_id = request.data.get('section_id') or request.data.get('section')
        period_id = request.data.get('period_id') or request.data.get('period')
        day = request.data.get('day')
        try:
            if sec_id is not None and period_id is not None and day is not None:
                sec_id = int(sec_id)
                period_id = int(period_id)
                day = int(day)
                # consider subject_batch in matching so different batches may occupy same cell
                sb_raw = request.data.get('subject_batch_id') or request.data.get('subject_batch')
                sb_id = None
                try:
                    if sb_raw is not None and sb_raw != '':
                        sb_id = int(sb_raw)
                except Exception:
                    sb_id = None

                if sb_id is None:
                    # match unbatched assignment
                    existing = TimetableAssignment.objects.filter(section_id=sec_id, period_id=period_id, day=day, subject_batch__isnull=True).first()
                else:
                    existing = TimetableAssignment.objects.filter(section_id=sec_id, period_id=period_id, day=day, subject_batch_id=sb_id).first()
                if existing:
                    # perform update via serializer (partial)
                    serializer = self.get_serializer(existing, data=request.data, partial=True)
                    serializer.is_valid(raise_exception=True)

                    # permission check similar to perform_update
                    user = request.user
                    perms = get_user_permissions(user)
                    role_names = {r.name.upper() for r in user.roles.all()}
                    allowed = False
                    if 'timetable.assign' in perms or user.is_staff or 'HOD' in role_names:
                        allowed = True
                    if 'ADVISOR' in role_names:
                        sec_check = None
                        try:
                            sec_check = int(sec_id)
                        except Exception:
                            sec_check = None
                        if sec_check:
                            try:
                                from academics.models import SectionAdvisor
                                staff_profile = getattr(user, 'staff_profile', None)
                                if staff_profile and SectionAdvisor.objects.filter(section_id=sec_check, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists():
                                    allowed = True
                            except Exception:
                                pass

                    if not allowed:
                        raise PermissionDenied('You do not have permission to change timetable entries for this section.')

                    # auto-assign staff if not provided
                    try:
                        data = serializer.validated_data
                        staff_provided = data.get('staff', None)
                        curriculum_row = data.get('curriculum_row', None) or getattr(existing, 'curriculum_row', None)
                        section = data.get('section', None) or getattr(existing, 'section', None)
                        if not staff_provided and curriculum_row and section:
                            from academics.models import TeachingAssignment
                            ta = TeachingAssignment.objects.filter(section=section, curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                            if ta and getattr(ta, 'staff', None):
                                # As above, avoid persisting the resolved staff on upsert.
                                serializer.save()
                                return Response(serializer.data, status=status.HTTP_200_OK)
                    except Exception:
                        pass

                    # normal save
                    serializer.save()
                    return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception:
            # fall back to normal create which will validate and surface errors
            pass

        return super().create(request, *args, **kwargs)


class StaffTimetableView(APIView):
    """Return timetable assignments relevant to the logged-in staff user.

    Includes assignments where `staff` is set to the staff profile, and also
    assignments where `staff` is null but there exists an active
    TeachingAssignment mapping for the same section+curriculum_row pointing
    to this staff profile.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'results': []})

        try:
            from academics.models import TeachingAssignment

            # Subquery to detect assignments that map to this staff via TeachingAssignment
            ta_qs = TeachingAssignment.objects.filter(
                staff=staff_profile,
                is_active=True,
            ).filter(
                (Q(section=OuterRef('section')) | Q(section__isnull=True)) &
                (Q(curriculum_row=OuterRef('curriculum_row')) | Q(elective_subject__parent=OuterRef('curriculum_row')))
            )

            qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section')
            qs = qs.annotate(has_ta=Exists(ta_qs)).filter(Q(staff=staff_profile) | Q(staff__isnull=True, has_ta=True))

        except Exception:
            # fallback: only show direct assignments
            qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section').filter(staff=staff_profile)

        out = {}
        for a in qs:
            day = a.day
            lst = out.setdefault(day, [])
            # determine staff to present: explicit staff or the requesting staff (if resolved via TA)
            if a.staff:
                staff_obj = a.staff
            else:
                staff_obj = staff_profile

            # prefer elective subject display when applicable for staff view
            subj_text = a.subject_text
            elective_id = None
            try:
                if a.curriculum_row:
                    from academics.models import TeachingAssignment
                    # Prefer mappings specific to this staff. Try section-scoped first,
                    # then department-wide mappings (where section may be null).
                    ta = TeachingAssignment.objects.filter(
                        staff=staff_profile, section=a.section, is_active=True
                    ).filter(
                        Q(curriculum_row=a.curriculum_row) | Q(elective_subject__parent=a.curriculum_row)
                    ).select_related('elective_subject').first()
                    if not ta:
                        ta = TeachingAssignment.objects.filter(
                            staff=staff_profile, is_active=True
                        ).filter(
                            Q(curriculum_row=a.curriculum_row) | Q(elective_subject__parent=a.curriculum_row)
                        ).select_related('elective_subject').first()
                    if ta and getattr(ta, 'elective_subject', None):
                        es = ta.elective_subject
                        subj_text = f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
                        elective_id = getattr(es, 'id', None)
            except Exception:
                pass

            # If we resolved an elective sub-option for this staff, do not expose
            # the parent curriculum_row name to the staff view — instead include
            # the elective_subject details so the UI can show the specific option.
            curriculum_obj = None
            elective_obj = None
            if elective_id and a.curriculum_row is not None:
                try:
                    from curriculum.models import ElectiveSubject
                    es = ElectiveSubject.objects.filter(pk=elective_id).first()
                    if es:
                        elective_obj = {'id': es.pk, 'course_code': getattr(es, 'course_code', None), 'course_name': getattr(es, 'course_name', None)}
                except Exception:
                    elective_obj = None
            else:
                curriculum_obj = {'id': a.curriculum_row.pk, 'course_code': a.curriculum_row.course_code, 'course_name': a.curriculum_row.course_name} if a.curriculum_row else None

            lst.append({
                'id': getattr(a, 'id', None),
                'period_index': getattr(a.period, 'index', None),
                'period_id': getattr(a.period, 'id', None),
                'start_time': getattr(a.period, 'start_time', None),
                'end_time': getattr(a.period, 'end_time', None),
                'is_break': getattr(a.period, 'is_break', False),
                'label': getattr(a.period, 'label', None),
                'curriculum_row': curriculum_obj,
                'elective_subject': elective_obj,
                'subject_text': subj_text,
                'elective_subject_id': elective_id,
                'subject_batch': {'id': a.subject_batch.pk, 'name': getattr(a.subject_batch, 'name', None)} if getattr(a, 'subject_batch', None) else None,
                'staff': {'id': staff_obj.pk, 'staff_id': getattr(staff_obj, 'staff_id', None), 'username': getattr(getattr(staff_obj, 'user', None), 'username', None)} if staff_obj else None,
                'section': {'id': getattr(a.section, 'pk', None), 'name': getattr(a.section, 'name', None)} if getattr(a, 'section', None) else None,
            })

        results = []
        for day in sorted(out.keys()):
            results.append({'day': day, 'assignments': sorted(out[day], key=lambda x: (x.get('period_index') or 0))})
        return Response({'results': results})
