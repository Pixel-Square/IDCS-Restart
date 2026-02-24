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
import logging

logger = logging.getLogger(__name__)


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
                        elective_obj = {
                            'id': es.pk,
                            'course_code': getattr(es, 'course_code', None),
                            'course_name': getattr(es, 'course_name', None),
                            'mnemonic': getattr(es, 'mnemonic', None),
                        }
                except Exception:
                    elective_obj = None
            else:
                curriculum_obj = {
                    'id': a.curriculum_row.pk,
                    'course_code': a.curriculum_row.course_code,
                    'course_name': a.curriculum_row.course_name,
                    'mnemonic': getattr(a.curriculum_row, 'mnemonic', None),
                } if a.curriculum_row else None

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
        # include special timetable entries for this section
        # Show all specials that fall within the same Mon–Sun week as the requested
        # week_date (or date) parameter, defaulting to the current server week.
        # This makes a special entry visible for its whole week then disappear naturally.
        try:
            import datetime as _dt_sec
            from timetable.models import SpecialTimetableEntry
            _date_param = request.query_params.get('week_date') or request.query_params.get('date')
            try:
                _anchor = _dt_sec.date.fromisoformat(_date_param) if _date_param else _dt_sec.date.today()
            except Exception:
                _anchor = _dt_sec.date.today()
            # Compute Monday of the week containing the anchor date.
            # Mon=0 … Sun=6 in Python weekday(), so subtracting weekday() always
            # lands on the Monday of the same week — matching the frontend logic.
            _week_mon = _anchor - _dt_sec.timedelta(days=_anchor.weekday())
            _week_sun = _week_mon + _dt_sec.timedelta(days=6)
            _today_sec = _dt_sec.date.today()
            special_qs = SpecialTimetableEntry.objects.filter(
                is_active=True, timetable__section=sec,
                date__gte=_week_mon, date__lte=_week_sun
            ).filter(
                # Swap entries only show from today onwards; other specials show for the full week
                ~Q(timetable__name__startswith='[SWAP]') | Q(date__gte=_today_sec)
            ).select_related('timetable', 'period', 'staff', 'curriculum_row', 'subject_batch')
            # Filter special entries by student batch using the same strict logic
            # For subjects with batch assignments, only show the student's batch
            # For subjects without batch assignments, show unbatched entries
            if student_profile:
                from django.db.models import Q
                
                # Find curriculum rows that have batch assignments for special entries in this section this week
                batched_special_curriculum_rows = SpecialTimetableEntry.objects.filter(
                    timetable__section=sec,
                    is_active=True,
                    date__gte=_week_mon, date__lte=_week_sun,
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
                                    curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None), 'mnemonic': getattr(e.curriculum_row, 'mnemonic', None)}
                            else:
                                curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None), 'mnemonic': getattr(e.curriculum_row, 'mnemonic', None)}
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
                        'is_swap': (getattr(e.timetable, 'name', '') or '').startswith('[SWAP]'),
                        'date': getattr(e, 'date', None),
                        'timetable_name': getattr(e.timetable, 'name', None) if getattr(e, 'timetable', None) else None,
                    })
                except Exception:
                    continue
        except Exception:
            pass

        # Honor an explicit curriculum id sent by the client when assigning
        # from another department. Frontend may send `chosen_curriculum_id`
        # or `curriculum_department_id` to indicate the desired CurriculumDepartment.
        try:
            explicit_id = data.get('chosen_curriculum_id') or data.get('curriculum_department_id')
            if explicit_id:
                try:
                    cid = int(explicit_id)
                    from curriculum.models import CurriculumDepartment
                    cd = CurriculumDepartment.objects.filter(pk=cid).first()
                    if cd:
                        data['curriculum_row'] = cd.pk
                        logger.info('Using explicit chosen curriculum id %s for assignment', cid)
                except Exception:
                    pass
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


class PeriodSwapView(APIView):
    """Create or undo a date-specific period swap for a section.

    POST  /api/timetable/section/<id>/swap-periods/
        Body: { date, from_period_id, to_period_id }
        Creates two SpecialTimetableEntry records that swap the subjects/staff
        of the two periods on that exact date only.

    DELETE /api/timetable/section/<id>/swap-periods/
        Body/params: { date }  – undoes all swaps for that section on that date.
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request, section_id):
        import datetime
        from .models import SpecialTimetable, SpecialTimetableEntry, TimetableAssignment
        from academics.models import Section

        try:
            sec = Section.objects.get(pk=int(section_id))
        except Exception:
            return Response({'error': 'Section not found'}, status=404)

        date_str = request.data.get('date')
        from_period_id = request.data.get('from_period_id')
        to_period_id = request.data.get('to_period_id')

        if not date_str or not from_period_id or not to_period_id:
            return Response({'error': 'date, from_period_id and to_period_id are required'}, status=400)
        try:
            from_period_id = int(from_period_id)
            to_period_id = int(to_period_id)
        except Exception:
            return Response({'error': 'period ids must be integers'}, status=400)
        if from_period_id == to_period_id:
            return Response({'error': 'Cannot swap a period with itself'}, status=400)
        
        # Validate that neither period is a break or lunch
        from .models import TimetableSlot
        try:
            from_period = TimetableSlot.objects.get(pk=from_period_id)
            to_period = TimetableSlot.objects.get(pk=to_period_id)
            if from_period.is_break or from_period.is_lunch:
                return Response({
                    'error': f'Cannot swap period {from_period_id}: it is a {"break" if from_period.is_break else "lunch"} period'
                }, status=400)
            if to_period.is_break or to_period.is_lunch:
                return Response({
                    'error': f'Cannot swap period {to_period_id}: it is a {"break" if to_period.is_break else "lunch"} period'
                }, status=400)
        except TimetableSlot.DoesNotExist as e:
            return Response({'error': f'Period not found: {str(e)}'}, status=404)
        
        try:
            swap_date = datetime.date.fromisoformat(date_str)
        except Exception:
            return Response({'error': 'Invalid date format, use YYYY-MM-DD'}, status=400)

        # day of week: isoweekday() 1=Mon … 7=Sun (matches TimetableAssignment.day)
        day_of_week = swap_date.isoweekday()

        from_assigns = list(TimetableAssignment.objects.filter(
            section=sec, period_id=from_period_id, day=day_of_week
        ).select_related('staff', 'curriculum_row', 'subject_batch').order_by('id'))
        to_assigns = list(TimetableAssignment.objects.filter(
            section=sec, period_id=to_period_id, day=day_of_week
        ).select_related('staff', 'curriculum_row', 'subject_batch').order_by('id'))

        # If exact period_id lookup fails, fall back to matching by period index
        # (covers the case where the frontend column headers come from a different
        #  TimetableTemplate than the section's actual TimetableSlot rows)
        if not from_assigns:
            try:
                from_slot_index = TimetableAssignment.objects.filter(
                    period_id=from_period_id
                ).values_list('period__index', flat=True).first()
                if from_slot_index is not None:
                    from_assigns = list(TimetableAssignment.objects.filter(
                        section=sec, period__index=from_slot_index, day=day_of_week
                    ).select_related('staff', 'curriculum_row', 'subject_batch').order_by('id'))
            except Exception:
                pass
        if not to_assigns:
            try:
                to_slot_index = TimetableAssignment.objects.filter(
                    period_id=to_period_id
                ).values_list('period__index', flat=True).first()
                if to_slot_index is not None:
                    to_assigns = list(TimetableAssignment.objects.filter(
                        section=sec, period__index=to_slot_index, day=day_of_week
                    ).select_related('staff', 'curriculum_row', 'subject_batch').order_by('id'))
            except Exception:
                pass

        if not from_assigns:
            return Response({'error': f'No assignment found for period {from_period_id} on day {day_of_week} in section {sec.name}'}, status=400)
        if not to_assigns:
            return Response({'error': f'No assignment found for period {to_period_id} on day {day_of_week} in section {sec.name}'}, status=400)

        from_a = from_assigns[0]
        to_a = to_assigns[0]
        # Use the actual period_id from the resolved assignments (may differ from what
        # the frontend sent if a fallback index-based lookup was needed)
        from_period_id = from_a.period_id
        to_period_id = to_a.period_id

        # ── Validate BEFORE touching the DB ─────────────────────────────────────
        # Prevent swapping a period with itself (same subject AND same staff)
        from_cr = getattr(from_a, 'curriculum_row', None)
        to_cr   = getattr(to_a,   'curriculum_row', None)
        from_text = (getattr(from_a, 'subject_text', None) or '').strip().lower()
        to_text   = (getattr(to_a,   'subject_text', None) or '').strip().lower()
        same_subject = (
            (from_cr and to_cr and from_cr.pk == to_cr.pk)
            or ((not from_cr) and (not to_cr) and from_text and to_text and from_text == to_text)
        )
        same_staff = (
            from_a.staff_id is not None and from_a.staff_id == to_a.staff_id
        )
        if same_subject and same_staff:
            return Response({'error': 'Cannot swap a period with itself (same subject and same staff)'}, status=400)
        # ────────────────────────────────────────────────────────────────────────

        staff_profile = getattr(request.user, 'staff_profile', None)

        # Deactivate any existing swap entries for these two periods on this date
        SpecialTimetableEntry.objects.filter(
            timetable__section=sec,
            timetable__name__startswith='[SWAP]',
            date=swap_date,
            period_id__in=[from_period_id, to_period_id],
            is_active=True,
        ).update(is_active=False)

        # Get or create the swap SpecialTimetable for this section+date
        swap_name = f'[SWAP] {date_str}'
        st, _ = SpecialTimetable.objects.get_or_create(
            section=sec,
            name=swap_name,
            defaults={'created_by': staff_profile, 'is_active': True},
        )
        if not st.is_active:
            st.is_active = True
            st.save(update_fields=['is_active'])

        # Auto-deactivate any expired swap entries (date < today) to keep the DB tidy
        import datetime as _dt_cleanup
        _today = _dt_cleanup.date.today()
        SpecialTimetableEntry.objects.filter(
            timetable__name__startswith='[SWAP]',
            date__lt=_today,
            is_active=True,
        ).update(is_active=False)
        SpecialTimetable.objects.filter(
            name__startswith='[SWAP]',
            is_active=True,
        ).exclude(
            entries__date__gte=_today,
        ).update(is_active=False)
        SpecialTimetableEntry.objects.filter(timetable=st, date=swap_date, period_id=from_period_id).delete()
        # subject_text stores the ORIGINAL (displaced) subject code so the UI can show "new ⇄ orig"
        from_orig_text = getattr(from_a.curriculum_row, 'course_code', None) or getattr(from_a.curriculum_row, 'course_name', None) or (from_a.subject_text or '') if from_a.curriculum_row else (from_a.subject_text or '')
        to_orig_text = getattr(to_a.curriculum_row, 'course_code', None) or getattr(to_a.curriculum_row, 'course_name', None) or (to_a.subject_text or '') if to_a.curriculum_row else (to_a.subject_text or '')
        
        logger.info(f"Creating swap for section {sec.name} on {date_str}:")
        logger.info(f"  Period {from_period_id}: {from_orig_text} (staff={from_a.staff_id if from_a.staff else None}) → {to_orig_text} (staff={to_a.staff_id if to_a.staff else None})")
        logger.info(f"  Period {to_period_id}: {to_orig_text} (staff={to_a.staff_id if to_a.staff else None}) → {from_orig_text} (staff={from_a.staff_id if from_a.staff else None})")
        
        SpecialTimetableEntry.objects.create(
            timetable=st, date=swap_date, period_id=from_period_id,
            staff=to_a.staff, curriculum_row=to_a.curriculum_row,
            subject_batch=to_a.subject_batch, subject_text=from_orig_text,
            is_active=True,
        )
        # Entry B: to_period now carries from_a's subject/staff
        SpecialTimetableEntry.objects.filter(timetable=st, date=swap_date, period_id=to_period_id).delete()
        SpecialTimetableEntry.objects.create(
            timetable=st, date=swap_date, period_id=to_period_id,
            staff=from_a.staff, curriculum_row=from_a.curriculum_row,
            subject_batch=from_a.subject_batch, subject_text=to_orig_text,
            is_active=True,
        )

        return Response({
            'swap_id': st.id,
            'date': date_str,
            'from_period_id': from_period_id,
            'to_period_id': to_period_id,
            'message': 'Periods swapped successfully',
        })

    def delete(self, request, section_id):
        """Undo all period swaps for a section on a given date."""
        from .models import SpecialTimetable, SpecialTimetableEntry
        from academics.models import Section

        date_str = request.data.get('date') or request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date is required'}, status=400)
        try:
            sec = Section.objects.get(pk=int(section_id))
        except Exception:
            return Response({'error': 'Section not found'}, status=404)

        swap_name = f'[SWAP] {date_str}'
        SpecialTimetableEntry.objects.filter(
            timetable__section=sec, timetable__name=swap_name, is_active=True,
        ).update(is_active=False)
        SpecialTimetable.objects.filter(section=sec, name=swap_name).update(is_active=False)
        return Response({'message': 'Swap undone'})

    def put(self, request, section_id):
        """Make a swap permanent: update the base TimetableAssignment records to reflect
        the swapped arrangement and deactivate the special entry so the swap becomes
        the default schedule going forward."""
        import datetime
        from .models import SpecialTimetable, SpecialTimetableEntry, TimetableAssignment
        from academics.models import Section

        date_str = request.data.get('date') or request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date is required'}, status=400)
        try:
            sec = Section.objects.get(pk=int(section_id))
            swap_date = datetime.date.fromisoformat(date_str)
        except Exception as ex:
            return Response({'error': str(ex)}, status=400)

        swap_name = f'[SWAP] {date_str}'
        existing_entries = list(SpecialTimetableEntry.objects.filter(
            timetable__section=sec, timetable__name=swap_name, is_active=True
        ).select_related('staff', 'curriculum_row', 'subject_batch', 'period'))
        if not existing_entries:
            return Response({'error': 'No active swap found for this date'}, status=404)

        day_of_week = swap_date.isoweekday()  # 1=Mon … 7=Sun
        updated = []
        for entry in existing_entries:
            base_assigns = list(TimetableAssignment.objects.filter(
                section=sec, period=entry.period, day=day_of_week
            ))
            for ba in base_assigns:
                ba.staff = entry.staff
                ba.curriculum_row = entry.curriculum_row
                ba.subject_batch = entry.subject_batch
                if entry.curriculum_row:
                    ba.subject_text = (
                        getattr(entry.curriculum_row, 'course_code', None)
                        or getattr(entry.curriculum_row, 'course_name', None)
                    )
                ba.save(update_fields=['staff', 'curriculum_row', 'subject_batch', 'subject_text'])
                updated.append(ba.id)

        # Deactivate the now-redundant swap special entries
        SpecialTimetableEntry.objects.filter(
            timetable__section=sec, timetable__name=swap_name, is_active=True
        ).update(is_active=False)
        SpecialTimetable.objects.filter(section=sec, name=swap_name).update(is_active=False)

        return Response({'message': 'Swap made permanent', 'updated_assignments': updated})
        """Retain an existing swap by copying its entries to the same day next week."""
        import datetime
        from .models import SpecialTimetable, SpecialTimetableEntry
        from academics.models import Section

        date_str = request.data.get('date') or request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date is required'}, status=400)
        try:
            sec = Section.objects.get(pk=int(section_id))
            swap_date = datetime.date.fromisoformat(date_str)
        except Exception as ex:
            return Response({'error': str(ex)}, status=400)

        swap_name = f'[SWAP] {date_str}'
        existing_entries = list(SpecialTimetableEntry.objects.filter(
            timetable__section=sec, timetable__name=swap_name, is_active=True
        ).select_related('staff', 'curriculum_row', 'subject_batch'))
        if not existing_entries:
            return Response({'error': 'No active swap found for this date'}, status=404)

        next_date = swap_date + datetime.timedelta(days=7)
        next_date_str = next_date.isoformat()
        next_swap_name = f'[SWAP] {next_date_str}'
        staff_profile = getattr(request.user, 'staff_profile', None)

        # Deactivate any existing swap entries for the next-week date
        SpecialTimetableEntry.objects.filter(
            timetable__section=sec, timetable__name=next_swap_name, is_active=True
        ).update(is_active=False)

        st_next, _ = SpecialTimetable.objects.get_or_create(
            section=sec, name=next_swap_name,
            defaults={'created_by': staff_profile, 'is_active': True},
        )
        if not st_next.is_active:
            st_next.is_active = True
            st_next.save(update_fields=['is_active'])

        for entry in existing_entries:
            SpecialTimetableEntry.objects.filter(
                timetable=st_next, date=next_date, period_id=entry.period_id
            ).delete()
            SpecialTimetableEntry.objects.create(
                timetable=st_next, date=next_date,
                period_id=entry.period_id,
                staff=entry.staff,
                curriculum_row=entry.curriculum_row,
                subject_batch=entry.subject_batch,
                subject_text=entry.subject_text,
                is_active=True,
            )

        return Response({'message': 'Swap retained', 'new_date': next_date_str})


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
            # determine explicit curriculum override from incoming data if any
            explicit_id = None
            try:
                explicit_id = (self.request.data.get('chosen_curriculum_id') or self.request.data.get('curriculum_department_id') or self.request.data.get('curriculum_row') or self.request.data.get('original_curriculum_raw'))
            except Exception:
                explicit_id = None

            # helper to resolve an id to CurriculumDepartment instance (handle ElectiveSubject parent)
            def resolve_to_curriculum_department(raw_id):
                try:
                    rid = int(raw_id)
                except Exception:
                    return None
                try:
                    from curriculum.models import ElectiveSubject, CurriculumDepartment
                    es = ElectiveSubject.objects.filter(pk=rid).first()
                    if es and getattr(es, 'parent_id', None):
                        return CurriculumDepartment.objects.filter(pk=es.parent_id).first()
                    cd = CurriculumDepartment.objects.filter(pk=rid).first()
                    return cd
                except Exception:
                    return None

            forced_cd = None
            if explicit_id:
                try:
                    forced_cd = resolve_to_curriculum_department(explicit_id)
                    if forced_cd:
                        # If client also specified an other_department_id, ensure the
                        # resolved curriculum actually belongs to that department.
                        try:
                            other_dept = None
                            try:
                                other_dept = int(self.request.data.get('other_department_id'))
                            except Exception:
                                other_dept = None
                            if other_dept and getattr(forced_cd, 'department_id', None) != other_dept:
                                # attempt to find a CurriculumDepartment in the requested
                                # department with same course_code or course_name
                                from curriculum.models import CurriculumDepartment as _CD
                                candidate = None
                                if forced_cd.course_code:
                                    candidate = _CD.objects.filter(department_id=other_dept, course_code=forced_cd.course_code).first()
                                if not candidate and forced_cd.course_name:
                                    candidate = _CD.objects.filter(department_id=other_dept, course_name=forced_cd.course_name).first()
                                if candidate:
                                    logger.info('perform_create: adjusted explicit curriculum %s -> %s for department %s', getattr(forced_cd,'id',None), getattr(candidate,'id',None), other_dept)
                                    forced_cd = candidate
                        except Exception:
                            pass
                        logger.info('perform_create: forcing curriculum_row to explicit id %s', getattr(forced_cd, 'id', None))
                except Exception:
                    forced_cd = None

            if not staff_provided and curriculum_row and section:
                from academics.models import TeachingAssignment
                ta = TeachingAssignment.objects.filter(section=section, curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                if ta and getattr(ta, 'staff', None):
                    # Do not persist the resolved staff here. Leave `staff` null
                    # so the UI can dynamically resolve the current TeachingAssignment
                    # mapping; persisting the staff makes the timetable stale when
                    # the TeachingAssignment changes.
                    if forced_cd:
                        serializer.save(curriculum_row=forced_cd)
                    else:
                        serializer.save()
                    return
        except Exception:
            # ignore auto-assign failures and fall back to normal save
            pass

        # Final save: if client provided an explicit chosen curriculum, enforce it
        try:
            explicit_id = (self.request.data.get('chosen_curriculum_id') or self.request.data.get('curriculum_department_id') or self.request.data.get('curriculum_row') or self.request.data.get('original_curriculum_raw'))
        except Exception:
            explicit_id = None
        # prefer any forced_cd already resolved above (in auto-assign branch)
        try:
            forced_cd = locals().get('forced_cd', None)
        except Exception:
            forced_cd = None

        if not forced_cd and explicit_id:
            try:
                from curriculum.models import ElectiveSubject, CurriculumDepartment
                try:
                    rid = int(explicit_id)
                except Exception:
                    rid = None
                if rid:
                    es = ElectiveSubject.objects.filter(pk=rid).first()
                    if es and getattr(es, 'parent_id', None):
                        forced_cd = CurriculumDepartment.objects.filter(pk=es.parent_id).first()
                    else:
                        forced_cd = CurriculumDepartment.objects.filter(pk=rid).first()
                # If client also provided other_department_id, ensure the forced_cd
                # belongs to that department; if not, try to find a matching
                # curriculum row in the requested department by course_code/name.
                if forced_cd:
                    try:
                        other_dept = None
                        try:
                            other_dept = int(self.request.data.get('other_department_id'))
                        except Exception:
                            other_dept = None
                        if other_dept and getattr(forced_cd, 'department_id', None) != other_dept:
                            candidate = None
                            try:
                                candidate = CurriculumDepartment.objects.filter(department_id=other_dept, course_code=forced_cd.course_code).first()
                            except Exception:
                                candidate = None
                            if not candidate and getattr(forced_cd, 'course_name', None):
                                try:
                                    candidate = CurriculumDepartment.objects.filter(department_id=other_dept, course_name=forced_cd.course_name).first()
                                except Exception:
                                    candidate = None
                            if candidate:
                                logger.info('perform_create: adjusted explicit curriculum %s -> %s for department %s', getattr(forced_cd,'id',None), getattr(candidate,'id',None), other_dept)
                                forced_cd = candidate
                    except Exception:
                        pass
                if forced_cd:
                    logger.info('perform_create: applying explicit curriculum override -> %s', getattr(forced_cd, 'id', None))
            except Exception:
                forced_cd = None

        if forced_cd:
            serializer.save(curriculum_row=forced_cd)
        else:
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
        try:
            # log at INFO and also print so runserver console always shows payload
            logger.info('TimetableAssignment.create called by %s; data=%s', getattr(request.user, 'username', str(request.user)), dict(request.data))
            try:
                print('[DEBUG TIMETABLE] create called by', getattr(request.user, 'username', str(request.user)), 'data=', dict(request.data))
            except Exception:
                print('[DEBUG TIMETABLE] create called; failed to print request.data')
        except Exception:
            pass

        # Work with a mutable copy of incoming payload so we can normalize elective ids
        if hasattr(request.data, 'copy'):
            data = request.data.copy()
        else:
            data = dict(request.data or {})

        # If client sent an ElectiveSubject id (or raw selection) map it to its parent CurriculumDepartment id.
        try:
            mapped = False
            raw_sel = data.get('original_curriculum_raw') or data.get('curriculum_row') or data.get('curriculum')
            if raw_sel:
                try:
                    sel_id = int(raw_sel)
                    from curriculum.models import ElectiveSubject, CurriculumDepartment
                    # If selection matches an ElectiveSubject, use its parent CurriculumDepartment id
                    es = ElectiveSubject.objects.filter(pk=sel_id).first()
                    if es and getattr(es, 'parent_id', None):
                        data['curriculum_row'] = es.parent_id
                        mapped = True
                        logger.info('Mapping ElectiveSubject %s -> parent CurriculumDepartment %s', sel_id, es.parent_id)
                    else:
                        # If selection matches a CurriculumDepartment id, use it directly
                        cd = CurriculumDepartment.objects.filter(pk=sel_id).first()
                        if cd:
                            data['curriculum_row'] = cd.pk
                            mapped = True
                            logger.info('Using provided CurriculumDepartment id %s from original_raw', sel_id)
                except Exception:
                    pass
            # If client included explicit other_department_id but no mapping yet, try to interpret curriculum_row under that department
            if not mapped and data.get('other_department_id') and data.get('curriculum_row'):
                try:
                    # If curriculum_row is numeric but doesn't exist under this department, attempt to find matching course_code under that department
                    from curriculum.models import CurriculumDepartment
                    try:
                        cr_try = int(data.get('curriculum_row'))
                    except Exception:
                        cr_try = None
                    if cr_try:
                        cd = CurriculumDepartment.objects.filter(pk=cr_try, department_id=data.get('other_department_id')).first()
                        if cd:
                            data['curriculum_row'] = cd.pk
                            mapped = True
                    # otherwise leave as-is
                except Exception:
                    pass
        except Exception:
            pass

        # accept slot_id/section_id/academic_year_id in payload
        # if an assignment already exists for (section, day, period) -> update it (upsert)
        sec_id = data.get('section_id') or data.get('section')
        period_id = data.get('period_id') or data.get('period')
        day = data.get('day')
        try:
            if sec_id is not None and period_id is not None and day is not None:
                sec_id = int(sec_id)
                period_id = int(period_id)
                day = int(day)
                # consider subject_batch in matching so different batches may occupy same cell
                sb_raw = data.get('subject_batch_id') or data.get('subject_batch')
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
                    try:
                        logger.info('Upsert: found existing assignment id=%s with existing.curriculum_row=%s; incoming curriculum_row=%s; data keys=%s', getattr(existing, 'id', None), getattr(getattr(existing, 'curriculum_row', None), 'id', None), data.get('curriculum_row'), list(data.keys()))
                    except Exception:
                        pass
                    # resolve any explicit chosen curriculum id from the normalized payload
                    forced_cd = None
                    try:
                        explicit_id = data.get('chosen_curriculum_id') or data.get('curriculum_department_id') or data.get('curriculum_row') or data.get('original_curriculum_raw')
                        if explicit_id:
                            try:
                                from curriculum.models import ElectiveSubject, CurriculumDepartment
                                try:
                                    rid = int(explicit_id)
                                except Exception:
                                    rid = None
                                if rid:
                                    es = ElectiveSubject.objects.filter(pk=rid).first()
                                    if es and getattr(es, 'parent_id', None):
                                        forced_cd = CurriculumDepartment.objects.filter(pk=es.parent_id).first()
                                    else:
                                        forced_cd = CurriculumDepartment.objects.filter(pk=rid).first()
                                if forced_cd:
                                    # If client indicated other_department_id, ensure the forced
                                    # curriculum belongs to that department; if not, try to
                                    # locate a matching curriculum in the requested department
                                    try:
                                        other_dept = data.get('other_department_id')
                                        try:
                                            other_dept = int(other_dept)
                                        except Exception:
                                            other_dept = None
                                        if other_dept and getattr(forced_cd, 'department_id', None) != other_dept:
                                            candidate = None
                                            try:
                                                candidate = CurriculumDepartment.objects.filter(department_id=other_dept, course_code=forced_cd.course_code).first()
                                            except Exception:
                                                candidate = None
                                            if not candidate and getattr(forced_cd, 'course_name', None):
                                                try:
                                                    candidate = CurriculumDepartment.objects.filter(department_id=other_dept, course_name=forced_cd.course_name).first()
                                                except Exception:
                                                    candidate = None
                                            if candidate:
                                                logger.info('Upsert: adjusted explicit curriculum %s -> %s for department %s', getattr(forced_cd,'id',None), getattr(candidate,'id',None), other_dept)
                                                forced_cd = candidate
                                    except Exception:
                                        pass
                                    logger.info('Upsert: will force curriculum_row -> %s (from explicit %s)', getattr(forced_cd, 'id', None), explicit_id)
                                    try:
                                        print('[DEBUG TIMETABLE] upsert resolved forced_cd=', getattr(forced_cd, 'id', None), 'dept=', getattr(forced_cd, 'department_id', None), 'explicit_id=', explicit_id, 'other_department_id=', data.get('other_department_id'))
                                    except Exception:
                                        pass
                            except Exception:
                                forced_cd = None
                    except Exception:
                        forced_cd = None
                    # perform update via serializer (partial)
                    serializer = self.get_serializer(existing, data=data, partial=True)
                    try:
                        serializer.is_valid(raise_exception=True)
                    except Exception as e:
                        # If validation fails but client insisted on an explicit curriculum
                        # override (forced_cd), apply a direct update to ensure the
                        # chosen department curriculum is persisted.
                        try:
                            if forced_cd:
                                # update existing instance directly from incoming data where safe
                                if data.get('subject_text') is not None:
                                    existing.subject_text = data.get('subject_text')
                                if data.get('subject_batch_id'):
                                    try:
                                        from academics.models import StudentSubjectBatch
                                        sb = StudentSubjectBatch.objects.filter(pk=int(data.get('subject_batch_id'))).first()
                                        existing.subject_batch = sb
                                    except Exception:
                                        pass
                                if data.get('staff_id'):
                                    try:
                                        from academics.models import StaffProfile
                                        sp = StaffProfile.objects.filter(pk=int(data.get('staff_id'))).first()
                                        existing.staff = sp
                                    except Exception:
                                        pass
                                existing.curriculum_row = forced_cd
                                existing.save()
                                try:
                                    logger.info('Upsert fallback: directly updated existing id=%s to curriculum_row=%s after validation error', getattr(existing, 'id', None), getattr(getattr(existing, 'curriculum_row', None), 'id', None))
                                except Exception:
                                    pass
                                return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)
                        except Exception:
                            pass
                        # re-raise original validation error if we couldn't handle it
                        raise

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
                        vdata = serializer.validated_data
                        staff_provided = vdata.get('staff', None)
                        curriculum_row = vdata.get('curriculum_row', None) or getattr(existing, 'curriculum_row', None)
                        section = vdata.get('section', None) or getattr(existing, 'section', None)
                        if not staff_provided and curriculum_row and section:
                            from academics.models import TeachingAssignment
                            ta = TeachingAssignment.objects.filter(section=section, curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                            if ta and getattr(ta, 'staff', None):
                                # As above, avoid persisting the resolved staff on upsert.
                                if forced_cd:
                                    inst = serializer.save(curriculum_row=forced_cd)
                                else:
                                    inst = serializer.save()
                                try:
                                    logger.info('Upsert: auto-assigned via TA -> updated assignment id=%s curriculum_row=%s', getattr(inst, 'id', None), getattr(getattr(inst, 'curriculum_row', None), 'id', None))
                                except Exception:
                                    pass
                                return Response(serializer.data, status=status.HTTP_200_OK)
                    except Exception:
                        pass

                    # normal save
                    if forced_cd:
                        inst = serializer.save(curriculum_row=forced_cd)
                    else:
                        inst = serializer.save()
                    try:
                        logger.info('Upsert: updated assignment id=%s curriculum_row=%s', getattr(inst, 'id', None), getattr(getattr(inst, 'curriculum_row', None), 'id', None))
                    except Exception:
                        pass
                    return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception:
            # fall back to normal create which will validate and surface errors
            pass

        # Fallback: use normalized data for standard create
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


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

        # optional date/week_date param to determine the current week for special entries
        date_param = request.query_params.get('week_date') or request.query_params.get('date')
        import datetime
        import datetime as _dt_staff
        try:
            date_for_override = datetime.date.fromisoformat(date_param) if date_param else None
        except Exception:
            date_for_override = None

        # Pre-compute Mon–Sun week bounds once so the normal-assignment override check
        # and the special entries retrieval both operate on the same week window.
        # Always use the Monday of the week containing the anchor date — this matches
        # the frontend getDateForDayIndex logic which never advances on weekends.
        _s_anchor = date_for_override if date_for_override else _dt_staff.date.today()
        _s_mon = _s_anchor - _dt_staff.timedelta(days=_s_anchor.weekday())  # Mon=0…Sun=6
        _s_sun = _s_mon + _dt_staff.timedelta(days=6)

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
                        elective_obj = {'id': es.pk, 'course_code': getattr(es, 'course_code', None), 'course_name': getattr(es, 'course_name', None), 'mnemonic': getattr(es, 'mnemonic', None)}
                except Exception:
                    elective_obj = None
            else:
                curriculum_obj = {'id': a.curriculum_row.pk, 'course_code': a.curriculum_row.course_code, 'course_name': a.curriculum_row.course_name, 'mnemonic': getattr(a.curriculum_row, 'mnemonic', None)} if a.curriculum_row else None

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
            # If a special entry exists for this section/period on the same calendar day
            # within the viewing week, suppress the regular assignment so the staff
            # sees only the special (e.g. a period swap entry) for that day.
            try:
                from timetable.models import SpecialTimetableEntry
                # a.day: 1=Mon … 7=Sun; _s_mon is the Monday of the viewed week.
                day_date = _s_mon + _dt_staff.timedelta(days=a.day - 1)
                if SpecialTimetableEntry.objects.filter(
                    timetable__section=a.section, period=a.period,
                    date=day_date, is_active=True
                ).exists():
                    lst.pop()
                    continue
            except Exception:
                pass

        # include special timetable entries where applicable
        # Show specials for the entire Mon–Sun week of the requested date.
        # _s_mon/_s_sun were already computed above (before the normal assignments loop).
        try:
            from timetable.models import SpecialTimetableEntry
            specials_added = []
            import datetime as _dt_today_staff
            _today_staff = _dt_today_staff.date.today()
            special_qs = SpecialTimetableEntry.objects.filter(
                is_active=True, date__gte=_s_mon, date__lte=_s_sun
            ).filter(
                # Swap entries only show from today onwards; other specials show for the full week
                ~Q(timetable__name__startswith='[SWAP]') | Q(date__gte=_today_staff)
            ).select_related('timetable', 'timetable__section', 'timetable__section__batch', 'period', 'staff', 'curriculum_row')
            for e in special_qs:
                try:
                    # Treat all special entries (including swaps) uniformly
                    # Show to staff if: explicitly assigned, or if staff has TeachingAssignment matching the section/day
                    include_special = False
                    explicit_staff = getattr(e, 'staff', None)
                    
                    if explicit_staff:
                        # Show if explicitly assigned to this staff
                        if getattr(explicit_staff, 'id', None) == getattr(staff_profile, 'id', None):
                            include_special = True
                    else:
                        # No explicit staff - check if staff teaches in this section on this day via TeachingAssignment
                        try:
                            special_section = getattr(e.timetable, 'section', None)
                            if special_section:
                                day_of_week = e.date.isoweekday()
                                # Check if staff has any assignment in this section on this day
                                staff_teaches_here = qs.filter(section=special_section, day=day_of_week).exists()
                                if staff_teaches_here:
                                    include_special = True
                        except Exception:
                            pass
                    
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
                                elective_obj = {'id': es.pk, 'course_code': getattr(es, 'course_code', None), 'course_name': getattr(es, 'course_name', None), 'mnemonic': getattr(es, 'mnemonic', None)}
                        except Exception:
                            elective_obj = None
                    else:
                        curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None), 'mnemonic': getattr(e.curriculum_row, 'mnemonic', None)} if e.curriculum_row else None

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
                        'is_swap': (getattr(e.timetable, 'name', '') or '').startswith('[SWAP]'),
                        'timetable_name': getattr(e.timetable, 'name', None) if getattr(e, 'timetable', None) else None,
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

        staff_profile = getattr(user, 'staff_profile', None)

        # Attempt to auto-resolve a staff for this special entry if not provided.
        resolved_entry = None
        try:
            data = serializer.validated_data
            staff_provided = data.get('staff', None)
            curriculum_row = data.get('curriculum_row', None)
            timetable_obj = data.get('timetable', None)
            subject_text = data.get('subject_text', None)
            if not staff_provided:
                if curriculum_row and timetable_obj:
                    try:
                        from academics.models import TeachingAssignment
                        ta = TeachingAssignment.objects.filter(section=timetable_obj.section, curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                        if not ta:
                            ta = TeachingAssignment.objects.filter(curriculum_row=curriculum_row, is_active=True).select_related('staff').first()
                        if ta and getattr(ta, 'staff', None):
                            resolved_entry = serializer.save(staff=ta.staff)
                    except Exception:
                        pass
                # For event/custom-text or any other no-staff case: auto-assign the requesting staff.
                if resolved_entry is None and staff_profile:
                    resolved_entry = serializer.save(staff=staff_profile)
        except Exception:
            pass

        entry = resolved_entry if resolved_entry is not None else serializer.save()

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
