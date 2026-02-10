from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment, SpecialTimetable, SpecialTimetableEntry
from .serializers import TimetableTemplateSerializer, PeriodDefinitionSerializer, TimetableAssignmentSerializer, SpecialTimetableSerializer, SpecialTimetableEntrySerializer
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
            data = [{'id': c.pk, 'course_code': c.course_code, 'course_name': c.course_name, 'regulation': c.regulation, 'class_type': c.class_type, 'is_elective': c.is_elective} for c in qs]
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
        # If requesting student is a student profile, apply strict batch filtering:
        # For subjects that have batch assignments, only show the student's specific batch
        # For subjects that don't have batch assignments, show the unbatched assignments
        student_profile = getattr(request.user, 'student_profile', None)
        if student_profile:
            from django.db.models import Q
            
            # Find curriculum rows that have batch assignments for this section
            batched_curriculum_rows = TimetableAssignment.objects.filter(
                section=sec, 
                subject_batch__isnull=False
            ).values_list('curriculum_row_id', flat=True).distinct()
            
            # Filter assignments based on batch logic:
            # 1. For batched subjects: only show assignments where student is in the batch
            # 2. For non-batched subjects: show unbatched assignments
            qs = qs.filter(
                Q(curriculum_row_id__in=batched_curriculum_rows, subject_batch__students=student_profile) |
                Q(curriculum_row_id__isnull=True, subject_batch__isnull=True) |
                Q(~Q(curriculum_row_id__in=batched_curriculum_rows), subject_batch__isnull=True)
            ).distinct()
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

            # Use only the explicitly assigned subject_batch - do not try to resolve
            # batch information for unbatched assignments as they are meant for all students
            sb = getattr(a, 'subject_batch', None)

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
                'staff': {
                    'id': staff_obj.pk, 
                    'staff_id': getattr(staff_obj, 'staff_id', None), 
                    'username': getattr(getattr(staff_obj, 'user', None), 'username', None),
                    'first_name': getattr(getattr(staff_obj, 'user', None), 'first_name', ''),
                    'last_name': getattr(getattr(staff_obj, 'user', None), 'last_name', '')
                } if staff_obj else None,
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
        # include special timetable entries for this section (date-specific overrides)
        try:
            from timetable.models import SpecialTimetableEntry
            special_qs = SpecialTimetableEntry.objects.filter(is_active=True, timetable__section=sec).select_related('timetable', 'period', 'staff', 'curriculum_row', 'subject_batch')
            # Filter special entries by student batch using the same strict logic
            # For subjects with batch assignments, only show the student's batch
            # For subjects without batch assignments, show unbatched entries
            if student_profile:
                from django.db.models import Q
                
                # Find curriculum rows that have batch assignments for special entries in this section
                batched_special_curriculum_rows = SpecialTimetableEntry.objects.filter(
                    timetable__section=sec,
                    is_active=True,
                    subject_batch__isnull=False
                ).values_list('curriculum_row_id', flat=True).distinct()
                
                special_qs = special_qs.filter(
                    Q(curriculum_row_id__in=batched_special_curriculum_rows, subject_batch__students=student_profile) |
                    Q(curriculum_row_id__isnull=True, subject_batch__isnull=True) |
                    Q(~Q(curriculum_row_id__in=batched_special_curriculum_rows), subject_batch__isnull=True)
                ).distinct()
            
            for e in special_qs:
                try:
                    daynum = e.date.isoweekday()
                    lst = out.setdefault(daynum, [])
                    # For student views, prefer the student's chosen elective sub-option
                    # if this special entry references a parent curriculum_row.
                    subj_text = getattr(e, 'subject_text', None)
                    curr_obj = None
                    elective_obj = None
                    elective_id = None
                    if e.curriculum_row:
                        try:
                            if student_profile:
                                from curriculum.models import ElectiveChoice
                                ec = ElectiveChoice.objects.filter(student=student_profile, elective_subject__parent=e.curriculum_row, is_active=True, academic_year__is_active=True).select_related('elective_subject').first()
                                if ec and getattr(ec, 'elective_subject', None):
                                    es = ec.elective_subject
                                    subj_text = f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
                                    elective_obj = {'id': es.pk, 'course_code': getattr(es, 'course_code', None), 'course_name': getattr(es, 'course_name', None)}
                                    elective_id = es.pk
                                else:
                                    curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None)}
                            else:
                                curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None)}
                        except Exception:
                            curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None)}
                    
                    # Use only the explicitly assigned subject_batch for special entries
                    sb = getattr(e, 'subject_batch', None)

                    lst.append({
                        'id': f"special-{getattr(e, 'id', None)}",
                        'period_index': getattr(e.period, 'index', None),
                        'period_id': getattr(e.period, 'id', None),
                        'start_time': getattr(e.period, 'start_time', None),
                        'end_time': getattr(e.period, 'end_time', None),
                        'is_break': getattr(e.period, 'is_break', False),
                        'label': getattr(e.period, 'label', None),
                        'curriculum_row': curr_obj,
                        'elective_subject': elective_obj,
                        'subject_text': subj_text,
                        'elective_subject_id': elective_id,
                        'subject_batch': {'id': sb.pk, 'name': getattr(sb, 'name', None)} if sb else None,
                        'staff': {
                            'id': getattr(e.staff, 'pk', None), 
                            'staff_id': getattr(e.staff, 'staff_id', None),
                            'username': getattr(getattr(e.staff, 'user', None), 'username', None),
                            'first_name': getattr(getattr(e.staff, 'user', None), 'first_name', ''),
                            'last_name': getattr(getattr(e.staff, 'user', None), 'last_name', '')
                        } if getattr(e, 'staff', None) else None,
                        'section': {'id': getattr(sec, 'pk', None), 'name': getattr(sec, 'name', None)} if sec else None,
                        'is_special': True,
                        'date': getattr(e, 'date', None),
                        'timetable_name': getattr(e.timetable, 'name', None) if getattr(e, 'timetable', None) else None,
                    })
                except Exception:
                    continue
        except Exception:
            pass
        # Cleanup: for any day where a special entry exists for a given period,
        # remove the normal (non-special) assignment for that period so the
        # timetable shows only the special period on that date.
        try:
            for daynum, assignments in out.items():
                # find period_ids that have a special entry
                special_period_ids = {a.get('period_id') for a in assignments if a.get('is_special')}
                if not special_period_ids:
                    continue
                filtered = []
                for a in assignments:
                    if (a.get('period_id') in special_period_ids) and (not a.get('is_special')):
                        # skip normal assignment when a special for same period exists
                        continue
                    filtered.append(a)
                out[daynum] = filtered
        except Exception:
            pass
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
                results.append({
                    'id': c.id, 
                    'course_code': c.course_code, 
                    'course_name': c.course_name, 
                    'regulation': c.regulation,
                    'class_type': c.class_type,
                    'is_elective': c.is_elective,
                    'staff': staff_map.get(c.id)
                })

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

        # optional date param to determine date-specific overrides
        date_param = request.query_params.get('date')
        import datetime
        try:
            date_for_override = datetime.date.fromisoformat(date_param) if date_param else None
        except Exception:
            date_for_override = None

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

            qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section', 'section__batch')
            qs = qs.annotate(has_ta=Exists(ta_qs)).filter(Q(staff=staff_profile) | Q(staff__isnull=True, has_ta=True))

        except Exception:
            # fallback: only show direct assignments
            qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section', 'section__batch').filter(staff=staff_profile)

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

            # Enhanced section info with batch details  
            section_info = None
            if getattr(a, 'section', None):
                section_info = {
                    'id': getattr(a.section, 'pk', None), 
                    'name': getattr(a.section, 'name', None),
                    'batch': {
                        'id': getattr(a.section.batch, 'pk', None),
                        'name': getattr(a.section.batch, 'name', None)
                    } if getattr(a.section, 'batch', None) else None
                }

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
                'staff': {
                    'id': staff_obj.pk, 
                    'staff_id': getattr(staff_obj, 'staff_id', None), 
                    'username': getattr(getattr(staff_obj, 'user', None), 'username', None),
                    'first_name': getattr(getattr(staff_obj, 'user', None), 'first_name', ''),
                    'last_name': getattr(getattr(staff_obj, 'user', None), 'last_name', '')
                } if staff_obj else None,
                'section': section_info,
            })
            # If a date was provided and a special entry exists for this section/period/date,
            # skip including the normal timetable assignment so the staff sees only the
            # special period for that date.
            try:
                if date_for_override:
                    from timetable.models import SpecialTimetableEntry
                    if SpecialTimetableEntry.objects.filter(timetable__section=a.section, period=a.period, date=date_for_override, is_active=True).exists():
                        # remove the last appended item
                        lst.pop()
                        continue
            except Exception:
                pass

        # include special timetable entries where applicable
        try:
            from timetable.models import SpecialTimetableEntry
            specials_added = []
            special_qs = SpecialTimetableEntry.objects.filter(is_active=True).select_related('timetable', 'timetable__section', 'timetable__section__batch', 'period', 'staff', 'curriculum_row')
            for e in special_qs:
                try:
                    # include if entry explicitly assigned to this staff or if a TeachingAssignment maps this staff to the curriculum_row
                    include_special = False
                    if getattr(e, 'staff', None) and getattr(e.staff, 'id', None) == getattr(staff_profile, 'id', None):
                        include_special = True
                    else:
                        try:
                            ta_q = TeachingAssignment.objects.filter(is_active=True, staff=staff_profile).filter(Q(curriculum_row=e.curriculum_row) | Q(elective_subject__parent=e.curriculum_row)).filter(Q(section=e.timetable.section) | Q(section__isnull=True))
                            if ta_q.exists():
                                include_special = True
                        except Exception:
                            include_special = False
                    if not include_special:
                        continue
                    daynum = e.date.isoweekday()
                    lst = out.setdefault(daynum, [])
                    subj_text = e.subject_text
                    elective_id = None
                    try:
                        if e.curriculum_row:
                            # resolve elective if TeachingAssignment maps to elective for this staff
                            ta = TeachingAssignment.objects.filter(staff=staff_profile, is_active=True).filter(Q(curriculum_row=e.curriculum_row) | Q(elective_subject__parent=e.curriculum_row)).select_related('elective_subject').first()
                            if ta and getattr(ta, 'elective_subject', None):
                                es = ta.elective_subject
                                subj_text = f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
                                elective_id = getattr(es, 'id', None)
                    except Exception:
                        pass

                    # If an elective mapping was resolved for this staff, expose the
                    # elective_subject instead of the parent curriculum_row
                    curr_obj = None
                    elective_obj = None
                    if elective_id and e.curriculum_row:
                        try:
                            from curriculum.models import ElectiveSubject
                            es = ElectiveSubject.objects.filter(pk=elective_id).first()
                            if es:
                                elective_obj = {'id': es.pk, 'course_code': getattr(es, 'course_code', None), 'course_name': getattr(es, 'course_name', None)}
                        except Exception:
                            elective_obj = None
                    else:
                        curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None)} if e.curriculum_row else None

                    # Enhanced section info with batch details
                    section_info = None
                    if getattr(e.timetable, 'section', None):
                        section_info = {
                            'id': getattr(e.timetable.section, 'pk', None), 
                            'name': getattr(e.timetable.section, 'name', None),
                            'batch': {
                                'id': getattr(e.timetable.section.batch, 'pk', None),
                                'name': getattr(e.timetable.section.batch, 'name', None)
                            } if getattr(e.timetable.section, 'batch', None) else None
                        }

                    lst.append({
                        'id': f"special-{getattr(e, 'id', None)}",
                        'period_index': getattr(e.period, 'index', None),
                        'period_id': getattr(e.period, 'id', None),
                        'start_time': getattr(e.period, 'start_time', None),
                        'end_time': getattr(e.period, 'end_time', None),
                        'is_break': getattr(e.period, 'is_break', False),
                        'label': getattr(e.period, 'label', None),
                        'curriculum_row': curr_obj,
                        'elective_subject': elective_obj,
                        'subject_text': subj_text,
                        'elective_subject_id': elective_id,
                        'subject_batch': {'id': getattr(e.subject_batch, 'pk', None), 'name': getattr(e.subject_batch, 'name', None)} if getattr(e, 'subject_batch', None) else None,
                        'staff': {
                            'id': getattr(e.staff, 'pk', None), 
                            'staff_id': getattr(e.staff, 'staff_id', None),
                            'username': getattr(getattr(e.staff, 'user', None), 'username', None),
                            'first_name': getattr(getattr(e.staff, 'user', None), 'first_name', ''),
                            'last_name': getattr(getattr(e.staff, 'user', None), 'last_name', '')
                        } if getattr(e, 'staff', None) else None,
                        'section': section_info,
                        'is_special': True,
                        'date': getattr(e, 'date', None),
                    })
                    specials_added.append(e.id)
                except Exception:
                    continue
        except Exception:
            pass

        results = []
        for day in sorted(out.keys()):
            results.append({'day': day, 'assignments': sorted(out[day], key=lambda x: (x.get('period_index') or 0))})
        return Response({'results': results})


class SpecialTimetableViewSet(viewsets.ModelViewSet):
    queryset = SpecialTimetable.objects.select_related('section', 'created_by').prefetch_related('entries')
    serializer_class = SpecialTimetableSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        perms = get_user_permissions(user)
        # allow users with manage_special_timetable permission or staff users
        if 'timetable.manage_special_timetable' in perms or 'academics.manage_special_timetable' in perms or user.is_staff:
            return self.queryset
        # otherwise restrict to timetables for sections the user advises or owns
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile:
            return self.queryset.filter(section__in=Section.objects.filter(advisor_mappings__advisor=staff_profile))
        return SpecialTimetable.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        role_names = {r.name.upper() for r in user.roles.all()}
        allowed = False
        if 'timetable.manage_special_timetable' in perms or 'academics.manage_special_timetable' in perms or user.is_staff:
            allowed = True
        # allow users who can assign timetables globally
        if 'timetable.assign' in perms:
            allowed = True
        # advisors may create special timetables for sections they advise
        if 'ADVISOR' in role_names:
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
            raise PermissionDenied('You do not have permission to manage special timetables')
        staff_profile = getattr(user, 'staff_profile', None)
        serializer.save(created_by=staff_profile)


class SpecialTimetableEntryViewSet(viewsets.ModelViewSet):
    queryset = SpecialTimetableEntry.objects.select_related('timetable', 'period', 'staff', 'curriculum_row', 'subject_batch')
    serializer_class = SpecialTimetableEntrySerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user = self.request.user
        perms = get_user_permissions(user)
        # full access for managers or staff
        if 'timetable.manage_special_timetable' in perms or 'academics.manage_special_timetable' in perms or user.is_staff:
            return self.queryset.filter(is_active=True)

        staff_profile = getattr(user, 'staff_profile', None)
        student_profile = getattr(user, 'student_profile', None)

        qs = SpecialTimetableEntry.objects.filter(is_active=True).select_related('timetable', 'period', 'staff', 'curriculum_row', 'subject_batch')

        # Advisors should see entries for sections they advise
        try:
            role_names = {r.name.upper() for r in user.roles.all()}
        except Exception:
            role_names = set()

        if 'ADVISOR' in role_names and staff_profile:
            try:
                return qs.filter(timetable__section__in=Section.objects.filter(advisor_mappings__advisor=staff_profile))
            except Exception:
                pass

        if staff_profile:
            try:
                from academics.models import TeachingAssignment
                # entries explicitly assigned to this staff
                staff_q = qs.filter(staff=staff_profile)
                # entries where a TeachingAssignment maps this staff to the curriculum_row for the same section
                ta_q = TeachingAssignment.objects.filter(staff=staff_profile, is_active=True)
                mapped_q = qs.filter(curriculum_row__in=ta_q.values_list('curriculum_row', flat=True), timetable__section__in=ta_q.values_list('section', flat=True))
                return (staff_q | mapped_q).distinct()
            except Exception:
                return qs.filter(staff=staff_profile)

        if student_profile:
            # Apply strict batch filtering for students: only show entries for subjects
            # where the student is in the assigned batch, or unbatched subjects with no batch assignments
            try:
                from academics.models import StudentSubjectBatch
                sec = getattr(student_profile, 'section', None)
                if not sec:
                    return SpecialTimetableEntry.objects.none()
                
                # entries for the section
                sec_q = qs.filter(timetable__section=sec)
                
                # Find curriculum rows that have batch assignments for special entries in this section
                batched_curriculum_rows = SpecialTimetableEntry.objects.filter(
                    timetable__section=sec,
                    is_active=True,
                    subject_batch__isnull=False
                ).values_list('curriculum_row_id', flat=True).distinct()
                
                # Apply strict filtering
                return sec_q.filter(
                    Q(curriculum_row_id__in=batched_curriculum_rows, subject_batch__students=student_profile) |
                    Q(curriculum_row_id__isnull=True, subject_batch__isnull=True) |
                    Q(~Q(curriculum_row_id__in=batched_curriculum_rows), subject_batch__isnull=True)
                ).distinct()
            except Exception:
                return qs.filter(timetable__section=getattr(student_profile, 'section', None))

        # default: no access
        return SpecialTimetableEntry.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        perms = get_user_permissions(user)
        role_names = {r.name.upper() for r in user.roles.all()}
        allowed = False
        if 'timetable.manage_special_timetable' in perms or 'academics.manage_special_timetable' in perms or user.is_staff:
            allowed = True
        if 'timetable.assign' in perms:
            allowed = True

        # advisors may create entries for timetables belonging to their sections
        if 'ADVISOR' in role_names:
            tt_id = serializer.initial_data.get('timetable_id') or serializer.initial_data.get('timetable') or self.request.data.get('timetable_id') or self.request.data.get('timetable')
            try:
                if tt_id is not None:
                    tt_id = int(tt_id)
            except Exception:
                tt_id = None
            if tt_id:
                try:
                    st = SpecialTimetable.objects.filter(pk=tt_id).select_related('section').first()
                    staff_profile = getattr(user, 'staff_profile', None)
                    if st and staff_profile:
                        from academics.models import SectionAdvisor
                        if SectionAdvisor.objects.filter(section=st.section, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists():
                            allowed = True
                except Exception:
                    pass

        if not allowed:
            raise PermissionDenied('You do not have permission to create special timetable entries')

        # Attempt to auto-resolve a staff for this special entry if not provided.
        try:
            data = serializer.validated_data
            staff_provided = data.get('staff', None)
            curriculum_row = data.get('curriculum_row', None)
            timetable_obj = data.get('timetable', None)
            period_obj = data.get('period', None)
            if not staff_provided and curriculum_row and timetable_obj:
                try:
                    from academics.models import TeachingAssignment
                    # Prefer section-scoped mapping
                    ta = TeachingAssignment.objects.filter(section=timetable_obj.section, curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                    if not ta:
                        ta = TeachingAssignment.objects.filter(curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                    if ta and getattr(ta, 'staff', None):
                        serializer.save(staff=ta.staff)
                        return
                except Exception:
                    pass
        except Exception:
            pass

        entry = serializer.save()

        # Ensure a PeriodAttendanceSession exists for this special entry so
        # staff can mark attendance for the special period on the date.
        try:
            from academics.models import PeriodAttendanceSession
            from academics.models import Section as _Section
            from academics.models import StaffProfile as _StaffProfile
            from academics.models import PeriodAttendanceSession as _PAS
        except Exception:
            _PAS = None

        try:
            if entry and getattr(entry, 'timetable', None):
                section_obj = entry.timetable.section
                period_obj = entry.period
                date_val = entry.date
                # create session if not exists
                from academics.models import PeriodAttendanceSession as PAS
                PAS.objects.get_or_create(
                    section=section_obj,
                    period=period_obj,
                    date=date_val,
                    defaults={'timetable_assignment': None, 'created_by': getattr(entry, 'staff', None)}
                )
        except Exception:
            # non-fatal; do not block entry creation
            pass
