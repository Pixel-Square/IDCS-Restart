from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment, SpecialTimetable, SpecialTimetableEntry
from .serializers import TimetableTemplateSerializer, PeriodDefinitionSerializer, TimetableAssignmentSerializer, SpecialTimetableSerializer, SpecialTimetableEntrySerializer
from .models import PeriodSwapRequest
from .serializers import PeriodSwapRequestSerializer
from accounts.utils import get_user_permissions
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from academics.models import Section
from rest_framework.exceptions import PermissionDenied
import re
from django.db.models import OuterRef, Exists, Q
import logging

logger = logging.getLogger(__name__)


def _coerce_int(val):
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _normalize_class_type(raw_class_type, curriculum_row=None):
    raw = str(raw_class_type or '').strip()
    if not raw:
        return 'THEORY'
    normalized = raw.upper().strip()
    compact = re.sub(r'[^A-Z0-9]+', '', normalized)
    if not compact:
        return 'THEORY'
    if compact.isdigit():
        if curriculum_row is not None:
            l = _coerce_int(getattr(curriculum_row, 'l', None)) or 0
            t = _coerce_int(getattr(curriculum_row, 't', None)) or 0
            p = _coerce_int(getattr(curriculum_row, 'p', None)) or 0
            s = _coerce_int(getattr(curriculum_row, 's', None)) or 0
            if p or s:
                return 'TCPL' if l else 'PRACTICAL'
            if l:
                return 'LAB'
        return 'THEORY'
    if 'TCPR' in compact:
        return 'TCPR'
    if 'TCPL' in compact:
        return 'TCPL'
    if compact == 'THEORYPMBL' or compact == 'THEORY' or compact.startswith('THEORY'):
        return 'THEORY'
    if compact == 'PRBL' or compact == 'PROJECT' or 'PROJECT' in compact:
        return 'PROJECT'
    if compact == 'LAB' or compact == 'L' or compact.startswith('LAB'):
        return 'LAB'
    if compact == 'PRACTICAL' or compact.startswith('PRACT'):
        return 'PRACTICAL'
    if compact == 'AUDIT':
        return 'AUDIT'
    if compact == 'SPECIAL':
        return 'SPECIAL'
    return normalized


def _get_staff_name_helper(u, sp):
    if not u:
        return getattr(sp, 'staff_id', '')
    name = u.get_full_name().strip()
    if not name:
        name = u.username
    return name or getattr(sp, 'staff_id', '')


def _get_student_core_department_id(student_profile) -> int | None:
    """Return the student's core/home department id when available.

    Priority:
    1) StudentProfile.home_department_id
    2) Active SECONDARY section's department (core-dept section mapping)
    """
    try:
        core_id = getattr(student_profile, 'home_department_id', None)
        if core_id:
            return int(core_id)
    except Exception:
        core_id = None

    try:
        from academics.models import StudentSectionAssignment

        sec_assign = (
            StudentSectionAssignment.objects.filter(
                student=student_profile,
                end_date__isnull=True,
                section_type=StudentSectionAssignment.SECTION_TYPE_SECONDARY,
            )
            .select_related('section__batch__course__department', 'section__batch__department')
            .order_by('-start_date')
            .first()
        )
        if not sec_assign or not getattr(sec_assign, 'section', None):
            return None

        sec = sec_assign.section
        try:
            dept_id = getattr(getattr(getattr(sec, 'batch', None), 'course', None), 'department_id', None)
            if dept_id:
                return int(dept_id)
        except Exception:
            pass
        try:
            dept_id = getattr(getattr(sec, 'batch', None), 'department_id', None)
            if dept_id:
                return int(dept_id)
        except Exception:
            pass
    except Exception:
        return None

    return None


def _apply_shared_section_student_dept_filter(qs, sec, student_profile):
    """In shared (Year-1 S&H) sections, hide other-department curriculum rows for students."""
    try:
        # Only apply for shared sections where batch.course is NULL.
        if getattr(getattr(sec, 'batch', None), 'course_id', None) is not None:
            return qs
        core_dept_id = _get_student_core_department_id(student_profile)
        if not core_dept_id:
            return qs
        allowed = {
            core_dept_id,
            getattr(sec, 'managing_department_id', None),
            getattr(getattr(sec, 'batch', None), 'department_id', None),
        }
        allowed_ids = [int(x) for x in allowed if x]
        if not allowed_ids:
            return qs
        return qs.filter(
            Q(curriculum_row__isnull=True) |
            Q(curriculum_row__department_id__in=allowed_ids)
        )
    except Exception:
        return qs


def _resolve_section_curriculum_department_ids(sec):
    """Resolve the curriculum department(s) that should drive a section's subject list.

    Preference order:
    1. Regular course department.
    2. Explicit batch department when it is not the shared S&H manager.
    3. Explicit managing department when it is not the shared S&H manager.
    4. For shared sections, a single observed home_department across active PRIMARY students.

    Returns a list of department IDs. An empty list means the caller should fall back
    to the shared-section union logic.
    """
    try:
        batch = getattr(sec, 'batch', None)
        course = getattr(batch, 'course', None) if batch else None
        if course is not None:
            dept_id = getattr(course, 'department_id', None)
            if dept_id:
                return [int(dept_id)]

        batch_dept = getattr(batch, 'department', None) if batch else None
        if batch_dept is not None and not getattr(batch_dept, 'is_sh_main', False):
            dept_id = getattr(batch_dept, 'pk', None)
            if dept_id:
                return [int(dept_id)]

        managing_dept = getattr(sec, 'managing_department', None)
        if managing_dept is not None and not getattr(managing_dept, 'is_sh_main', False):
            dept_id = getattr(managing_dept, 'pk', None)
            if dept_id:
                return [int(dept_id)]

        if getattr(batch, 'course_id', None) is None:
            from academics.models import StudentSectionAssignment

            home_dept_ids = list(
                StudentSectionAssignment.objects.filter(
                    section=sec,
                    end_date__isnull=True,
                    section_type='PRIMARY',
                    student__home_department__isnull=False,
                ).values_list('student__home_department_id', flat=True).distinct()
            )
            unique_home_dept_ids = sorted({int(dept_id) for dept_id in home_dept_ids if dept_id})
            if len(unique_home_dept_ids) == 1:
                return unique_home_dept_ids
    except Exception:
        pass

    return []


class CurriculumBySectionView(APIView):
    permission_classes = (IsAuthenticated,)

    def _finalize_results(self, rows, sem_num):
        # Propagate known non-empty codes across same-name rows first.
        code_by_name = {}
        for row in rows:
            name_key = (row.get('course_name') or '').strip().lower()
            code_val = (row.get('course_code') or '').strip()
            if name_key and code_val and name_key not in code_by_name:
                code_by_name[name_key] = code_val

        for row in rows:
            if (row.get('course_code') or '').strip():
                continue
            name_key = (row.get('course_name') or '').strip().lower()
            if name_key and name_key in code_by_name:
                row['course_code'] = code_by_name[name_key]

        # If still missing, derive from canonical model sources used by Subject records.
        try:
            from academics.models import Subject, TeachingAssignment

            for row in rows:
                if (row.get('course_code') or '').strip():
                    continue
                row_name = (row.get('course_name') or '').strip()
                if not row_name:
                    continue

                # 1) Legacy TeachingAssignment.subject mapping for this name.
                code_from_ta_subject = (
                    TeachingAssignment.objects.filter(
                        subject__isnull=False,
                        subject__name__iexact=row_name,
                        is_active=True,
                    )
                    .exclude(subject__code__isnull=True)
                    .exclude(subject__code='')
                    .values_list('subject__code', flat=True)
                    .first()
                )
                if code_from_ta_subject:
                    row['course_code'] = code_from_ta_subject
                    continue

                # 2) Subject table by name + semester as a stable fallback.
                code_from_subject = (
                    Subject.objects.filter(name__iexact=row_name, semester__number=sem_num)
                    .exclude(code__isnull=True)
                    .exclude(code='')
                    .values_list('code', flat=True)
                    .first()
                )
                if code_from_subject:
                    row['course_code'] = code_from_subject
        except Exception:
            pass

        return rows

    def get(self, request):
        sec_id = request.query_params.get('section_id') or request.query_params.get('section')
        if not sec_id:
            return Response({'results': []})
        try:
            sec = Section.objects.select_related(
                'batch__course__department', 'batch__department', 'semester'
            ).get(pk=int(sec_id))
        except Exception:
            return Response({'results': []})

        sem_num = getattr(sec.semester, 'number', None)
        if sem_num is None:
            return Response({'results': []})

        # Shared section: batch has no course (e.g. S&H Year-1).  Derive curriculum
        # from the home-departments of students currently enrolled in this section.
        if getattr(sec.batch, 'course_id', None) is None:
            curriculum_dept_ids = _resolve_section_curriculum_department_ids(sec)
            if curriculum_dept_ids:
                try:
                    from curriculum.models import CurriculumDepartment

                    qs = CurriculumDepartment.objects.filter(
                        department_id__in=curriculum_dept_ids,
                        semester__number=sem_num,
                    )

                    data = []
                    for c in qs:
                        data.append({
                            'id': c.pk,
                            'course_code': c.course_code,
                            'course_name': c.course_name,
                            'c': getattr(c, 'c', None),
                            'total_hours': getattr(c, 'total_hours', None),
                            'effective_class_hours': _get_effective_class_hours(c),
                            'regulation': c.regulation,
                            'class_type': _normalize_class_type(c.class_type, c),
                            'is_elective': c.is_elective,
                            'is_dept_core': getattr(c, 'is_dept_core', False),
                            'department_id': c.department_id,
                            'department_code': getattr(c.department, 'code', None),
                        })
                    return Response({'results': self._finalize_results(data, sem_num)})
                except Exception:
                    return Response({'results': []})
            return self._shared_section_curriculum(sec, sem_num)

        dept = getattr(sec.batch.course, 'department', None)
        if dept is None:
            return Response({'results': []})

        try:
            from curriculum.models import CurriculumDepartment
            qs = CurriculumDepartment.objects.filter(department=dept, semester__number=sem_num)

            data = []
            for c in qs:
                # Only show the elective group (parent), not individual elective subjects
                # When assigning to timetable, staff assigns the elective group (EE, PE, etc.)
                # Individual subjects are mapped through student's ElectiveChoice
                data.append({
                    'id': c.pk,
                    'course_code': c.course_code,
                    'course_name': c.course_name,
                    'regulation': c.regulation,
                    'class_type': _normalize_class_type(c.class_type, c),
                    'is_elective': c.is_elective,
                    'is_dept_core': getattr(c, 'is_dept_core', False),
                    'department_id': c.department_id,
                    'department_code': getattr(c.department, 'code', None),
                })
                # NOTE: Removed individual elective subject listing
                # Staff now assigns the elective GROUP (e.g., "EE - Elective Elective")
                # Students will see their chosen elective via ElectiveChoice when viewing timetable
            return Response({'results': self._finalize_results(data, sem_num)})
        except Exception:
            return Response({'results': []})

    def _shared_section_curriculum(self, sec, sem_num):
        """Return union of curriculum rows for all home-departments present in a shared section.

        Used by S&H-type sections where batch.course is None and students come from
        multiple core departments.  Each subject is deduplicated by course_code.

        Dept-Core subjects (is_dept_core=True): These are subjects like "Program Core" /
        "Engineering Science" that are managed by the S&H (managing_department) but
        taught department-wise.  They appear as a SINGLE entry here (owned by managing_dept);
        individual per-department variants are ElectiveSubject children of this row.
        The timetable view resolves the actual subject per student via home_department.
        """
        try:
            from curriculum.models import CurriculumDepartment
            from academics.models import StudentSectionAssignment

            # Collect unique home-department IDs from currently-enrolled students
            # Only PRIMARY assignments — SECONDARY assignments represent core-dept sections
            # and are handled separately via the normal core dept curriculum path.
            home_dept_ids = list(
                StudentSectionAssignment.objects.filter(
                    section=sec,
                    end_date__isnull=True,
                    section_type='PRIMARY',
                    student__home_department__isnull=False,
                ).values_list('student__home_department_id', flat=True).distinct()
            )

            # Include managing_department (S&H) curriculum — holds is_dept_core placeholders
            managing_dept = getattr(sec, 'managing_department', None)
            managing_dept_id = getattr(managing_dept, 'pk', None) if managing_dept else None

            # Also include the section's batch.department (fallback for S&H batches)
            batch_dept_id = None
            try:
                batch_dept_id = sec.batch.department_id
            except Exception:
                pass

            all_dept_ids = list(set(home_dept_ids))
            if managing_dept_id:
                all_dept_ids = list(set(all_dept_ids + [managing_dept_id]))
            if batch_dept_id:
                all_dept_ids = list(set(all_dept_ids + [batch_dept_id]))

            if not all_dept_ids:
                return Response({'results': []})

            # Fetch ALL curriculum rows — including those with null course_code.
            # Null-code subjects (e.g. "Program Core I", "Engineering Science") are
            # deduplicated by course_name instead.
            qs = CurriculumDepartment.objects.filter(
                department_id__in=all_dept_ids,
                semester__number=sem_num,
            ).select_related('department').order_by('is_dept_core', 'course_code', 'department_id')

            # Dept-core subjects are kept distinct per department so Mechanical and
            # Civil variants can both appear in HOD screens.
            # Regular shared subjects are deduplicated by course_code (or course_name for
            # null-code entries) across home depts.  Managing-dept entries always win when
            # the same key appears in both managing and home depts.
            seen: dict = {}
            for c in qs:
                code = c.course_code  # may be None/empty
                is_managing = c.department_id in (managing_dept_id, batch_dept_id) if (managing_dept_id or batch_dept_id) else False

                # Determine the deduplication key
                if code:
                    key = f'code:{code}'
                elif c.course_name:
                    key = f'name:{c.course_name.strip().lower()}'
                else:
                    # Last resort: individual row keyed by pk so it always shows
                    key = f'pk:{c.pk}'

                if c.is_elective:
                    # Elective parents stay shared, with the managing-dept row
                    # winning when the same parent appears in multiple departments.
                    dedupe_key = key
                    if dedupe_key not in seen or is_managing:
                        prev = seen.get(dedupe_key, {}) if dedupe_key in seen else {}
                        prev_code = (prev.get('course_code') or '').strip() if isinstance(prev, dict) else ''
                        effective_code = code if code else (prev_code or None)
                        seen[dedupe_key] = {
                            'id': c.pk,
                            'course_code': effective_code,
                            'mnemonic': getattr(c, 'mnemonic', None),
                            'course_name': c.course_name,
                            'regulation': c.regulation,
                            'semester': sem_num,
                            'class_type': _normalize_class_type(c.class_type, c),
                            'is_elective': c.is_elective,
                            'is_dept_core': getattr(c, 'is_dept_core', False),
                            'department_id': c.department_id,
                            'department_code': getattr(c.department, 'code', None),
                        }
                elif key not in seen:
                    seen[key] = {
                        'id': c.pk,
                        'course_code': code,
                        'mnemonic': getattr(c, 'mnemonic', None),
                        'course_name': c.course_name,
                        'regulation': c.regulation,
                        'semester': sem_num,
                        'class_type': _normalize_class_type(c.class_type, c),
                        'is_elective': c.is_elective,
                        'is_dept_core': getattr(c, 'is_dept_core', False),
                        'home_dept_ids': [c.department_id],
                        'home_dept_codes': [getattr(c.department, 'short_name', None)],
                    }
                else:
                    # Managing-dept entry should be the representative row
                    if is_managing:
                        seen[key]['id'] = c.pk
                        if code:
                            seen[key]['course_code'] = code
                        seen[key]['course_name'] = c.course_name
                    elif (not seen[key].get('course_code')) and code:
                        # Keep a usable subject code for shared rows when available
                        # from non-managing department variants.
                        seen[key]['course_code'] = code
                    if getattr(c, 'is_dept_core', False):
                        seen[key]['is_dept_core'] = True
                    seen[key]['home_dept_ids'].append(c.department_id)
                    seen[key]['home_dept_codes'].append(getattr(c.department, 'short_name', None))

            rows = list(seen.values())

            return Response({'results': self._finalize_results(rows, sem_num)})
        except Exception:
            return Response({'results': []})


class MixedSectionCurriculumView(APIView):
    """
    API endpoint to retrieve curriculum for a Mixed Section.
    
    A mixed section groups multiple regular sections. This endpoint resolves
    curriculum by:
    1. Getting department + semester from the mixed section's batch
    2. For each chosen section, extracting its department + semester
    3. Querying CurriculumDepartment for all (dept_id, semester) pairs
    4. Deduplicating by course_code and returning with department info
    
    Query params:
    - mixed_section_id (required): ID of the MixedSection
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        mixed_section_id = request.query_params.get('mixed_section_id') or request.query_params.get('mixed_section')
        debug = request.query_params.get('debug') == '1'
        if not mixed_section_id:
            return Response({'results': []})

        try:
            from academics.models import MixedSection
            mixed_sec = MixedSection.objects.select_related(
                'batch__course__department',
                'batch__department',
                'semester'
            ).prefetch_related(
                'sections__batch__course__department',
                'sections__batch__department',
                'sections__managing_department'
            ).get(pk=int(mixed_section_id))
        except Exception as e:
            if debug:
                return Response({'error': str(e), 'results': []})
            return Response({'results': []})

        sem_num = getattr(mixed_sec.semester, 'number', None)
        if sem_num is None:
            return Response({'results': [], 'debug': {'error': 'No semester found for mixed section'}})

        # Collect all (department_id, semester) pairs to query
        dept_sem_pairs = set()
        dept_section_map = {}  # Track which sections contribute which departments
        section_details = {}  # Track section details for debugging
        
        # 1. From mixed section's batch
        batch_dept_id = None
        logger.info(f'[MixedSection {mixed_section_id}] Processing batch...')
        if mixed_sec.batch:
            logger.info(f'  - Batch ID: {mixed_sec.batch.id}, Name: {mixed_sec.batch.name}')
            if mixed_sec.batch.course and getattr(mixed_sec.batch.course, 'department_id', None):
                batch_dept_id = mixed_sec.batch.course.department_id
                logger.info(f'  - Found dept from batch.course: {batch_dept_id}')
            elif getattr(mixed_sec.batch, 'department_id', None):
                batch_dept_id = mixed_sec.batch.department_id
                logger.info(f'  - Found dept from batch.department: {batch_dept_id}')
        
        if batch_dept_id:
            dept_sem_pairs.add((batch_dept_id, sem_num))
            if batch_dept_id not in dept_section_map:
                dept_section_map[batch_dept_id] = []
            dept_section_map[batch_dept_id].append(('batch', None))
        else:
            logger.warning(f'[MixedSection {mixed_section_id}] Could not resolve batch department')
        
        # 2. From each chosen section - MUST resolve department from each chosen section
        chosen_sections = list(mixed_sec.sections.all())
        logger.info(f'[MixedSection {mixed_section_id}] Found {len(chosen_sections)} chosen sections')
        
        for i, section in enumerate(chosen_sections):
            dept_id = None
            section_sem = getattr(section.semester, 'number', None) or sem_num
            logger.info(f'  Section {i+1}/{len(chosen_sections)}: ID={section.id}, Name={section.name}, Batch={section.batch_id}, Sem={section_sem}')
            
            # Priority: section.batch.course.department > section.batch.department > section.managing_department
            if section.batch:
                batch = section.batch
                logger.info(f'    - Section batch found: ID={batch.id}, name={batch.name}')
                if getattr(batch, 'course', None):
                    course = batch.course
                    logger.info(f'      - Section batch has course: ID={course.id}')
                    if getattr(course, 'department_id', None):
                        dept_id = course.department_id
                        logger.info(f'      - Using course.department_id: {dept_id}')
                
                if not dept_id and getattr(batch, 'department_id', None):
                    dept_id = batch.department_id
                    logger.info(f'      - Using batch.department_id: {dept_id}')
            
            if not dept_id and getattr(section, 'managing_department_id', None):
                dept_id = section.managing_department_id
                logger.info(f'    - Using section.managing_department_id: {dept_id}')
            
            if dept_id:
                dept_sem_pairs.add((dept_id, section_sem))
                if dept_id not in dept_section_map:
                    dept_section_map[dept_id] = []
                dept_section_map[dept_id].append(('section', section.id, section.name))
                section_details[section.id] = {'name': section.name, 'dept_id': dept_id, 'sem': section_sem}
                logger.info(f'    ✓ Resolved dept {dept_id} for section {section.id}')
            else:
                # Log if we couldn't resolve department for a chosen section
                logger.warning(f'[MixedSection {mixed_section_id}] Could not resolve department for chosen section {section.id} ({section.name})')
                section_details[section.id] = {'name': section.name, 'dept_id': None, 'sem': section_sem, 'error': 'No department found'}
        
        if not dept_sem_pairs:
            return Response({'results': []})

        logger.info(f'[MixedSection {mixed_section_id}] Querying curriculum for dept-sem pairs: {dept_sem_pairs}')

        try:
            from curriculum.models import CurriculumDepartment
            
            # Query curriculum for all department-semester pairs
            all_rows = []
            courses_per_dept = {}  # Track courses found per department
            for dept_id, sem_num_val in dept_sem_pairs:
                try:
                    rows = CurriculumDepartment.objects.filter(
                        department_id=dept_id,
                        semester__number=sem_num_val
                    ).select_related('department')
                    row_count = len(rows) if hasattr(rows, '__len__') else rows.count()
                    courses_per_dept[f'dept_{dept_id}_sem_{sem_num_val}'] = row_count
                    logger.info(f'  - Dept {dept_id}, Sem {sem_num_val}: Found {row_count} courses')
                    all_rows.extend(rows)
                except Exception as e:
                    logger.warning(f'Failed to fetch curriculum for dept {dept_id}, sem {sem_num_val}: {e}')
                    courses_per_dept[f'dept_{dept_id}_sem_{sem_num_val}'] = f'ERROR: {str(e)}'
                    continue
            
            logger.info(f'[MixedSection {mixed_section_id}] Total curriculum records fetched: {len(all_rows)}')
            
            if not all_rows:
                # No curriculum found - return empty with debug info if requested
                msg = f'No curriculum found for mixed section {mixed_section_id} with dept-sem pairs: {dept_sem_pairs}'
                logger.warning(msg)
                if debug:
                    return Response({
                        'results': [], 
                        'debug': {
                            'message': msg, 
                            'dept_sem_pairs': list(dept_sem_pairs), 
                            'dept_section_map': dept_section_map,
                            'section_details': section_details,
                            'courses_per_dept': courses_per_dept
                        }
                    })
                return Response({'results': []})
            
            # Deduplicate by course_code, preserving department info
            # Each course maps to all departments that have it
            seen = {}
            for c in all_rows:
                code = (c.course_code or '').strip()
                if not code:
                    code = None
                
                # Use course code as key if available, otherwise use pk
                key = code if code else f'pk:{c.pk}'
                
                if key not in seen:
                    seen[key] = {
                        'id': c.pk,
                        'course_code': code,
                        'mnemonic': getattr(c, 'mnemonic', None),
                        'course_name': c.course_name,
                        'regulation': c.regulation,
                        'semester': sem_num,
                        'class_type': _normalize_class_type(c.class_type, c),
                        'is_elective': c.is_elective,
                        'is_dept_core': getattr(c, 'is_dept_core', False),
                        'departments': []
                    }
                
                # Add department info if not already present
                existing_depts = [d['id'] for d in seen[key].get('departments', [])]
                if c.department_id not in existing_depts:
                    seen[key]['departments'].append({
                        'id': c.department_id,
                        'code': getattr(c.department, 'code', None),
                        'name': getattr(c.department, 'name', None),
                        'short_name': getattr(c.department, 'short_name', None),
                    })
            
            results = list(seen.values())
            msg = f'Mixed section {mixed_section_id}: Deduplicated to {len(results)} courses from {len(dept_sem_pairs)} dept-sem pairs'
            logger.info(msg)
            # Finalize results to fill in missing course codes if needed
            final_results = self._finalize_results(results, sem_num)
            resp = {'results': final_results}
            if debug:
                resp['debug'] = {
                    'message': msg,
                    'dept_sem_pairs': sorted(list(dept_sem_pairs)),
                    'dept_section_map': {k: v for k, v in dept_section_map.items()},
                    'section_details': section_details,
                    'courses_per_dept': courses_per_dept,
                    'chosen_sections': [{'id': s.id, 'name': s.name} for s in chosen_sections],
                    'courses_count': len(final_results)
                }
            return Response(resp)
        except Exception as e:
            error_msg = f'Error in MixedSectionCurriculumView: {str(e)}'
            logger.exception(error_msg)
            if debug:
                return Response({
                    'results': [], 
                    'debug': {
                        'error': error_msg, 
                        'exception': str(e),
                        'dept_sem_pairs': sorted(list(dept_sem_pairs)) if dept_sem_pairs else [],
                        'section_details': section_details
                    }
                })
            return Response({'results': []})

    def _finalize_results(self, rows, sem_num):
        """Fill in missing course codes from Subject table as fallback."""
        code_by_name = {}
        for row in rows:
            name_key = (row.get('course_name') or '').strip().lower()
            code_val = (row.get('course_code') or '').strip()
            if name_key and code_val and name_key not in code_by_name:
                code_by_name[name_key] = code_val

        for row in rows:
            if (row.get('course_code') or '').strip():
                continue
            name_key = (row.get('course_name') or '').strip().lower()
            if name_key and name_key in code_by_name:
                row['course_code'] = code_by_name[name_key]

        try:
            from academics.models import Subject, TeachingAssignment
            
            for row in rows:
                if (row.get('course_code') or '').strip():
                    continue
                row_name = (row.get('course_name') or '').strip()
                if not row_name:
                    continue

                # Try to find code from TeachingAssignment.subject
                code_from_ta_subject = (
                    TeachingAssignment.objects.filter(
                        subject__isnull=False,
                        subject__name__iexact=row_name,
                        is_active=True,
                    )
                    .exclude(subject__code__isnull=True)
                    .exclude(subject__code='')
                    .values_list('subject__code', flat=True)
                    .first()
                )
                if code_from_ta_subject:
                    row['course_code'] = code_from_ta_subject
                    continue

                # Try to find code from Subject table
                code_from_subject = (
                    Subject.objects.filter(name__iexact=row_name, semester__number=sem_num)
                    .exclude(code__isnull=True)
                    .exclude(code='')
                    .values_list('code', flat=True)
                    .first()
                )
                if code_from_subject:
                    row['course_code'] = code_from_subject
        except Exception:
            pass

        return rows


class SectionTimetableView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, section_id: int):
        try:
            sec = Section.objects.select_related('batch__course__department').get(pk=int(section_id))
        except Exception:
            return Response({'results': []})

        # collect assignments for this section
        qs = TimetableAssignment.objects.select_related(
            'period',
            'staff',
            'curriculum_row',
            'subject_batch',
            'subject_batch__staff',
            'subject_batch__staff__user',
        ).filter(section=sec)
        # If requesting student is a student profile, apply strict batch filtering:
        # Show unbatched assignments for all students.
        # Show batched assignments only when the student is a member of that batch.
        # IMPORTANT: Do NOT hide an unbatched assignment just because the same subject
        # has batch assignments in other periods.
        student_profile = getattr(request.user, 'student_profile', None)
        if student_profile:
            qs = qs.filter(
                Q(subject_batch__isnull=True) |
                Q(subject_batch__students=student_profile)
            ).distinct()

            # Shared-section (Year-1 S&H) multi-subject periods can include one subject
            # per core department in the same slot. Students must only see their
            # own core/home department variant.
            qs = _apply_shared_section_student_dept_filter(qs, sec, student_profile)
        # group by day -> list of assignments with period index and times
        out = {}
        for a in qs:
            day = a.day
            lst = out.setdefault(day, [])
            # Use only the explicitly assigned subject_batch - do not try to resolve
            # batch information for unbatched assignments as they are meant for all students
            sb = getattr(a, 'subject_batch', None)

            # determine staff to present.
            # Priority: batch staff (if present) > explicit staff on assignment > TeachingAssignment resolved staff
            staff_obj = None
            staff_list = []
            if sb and getattr(sb, 'staff', None):
                staff_obj = sb.staff
            elif a.staff:
                staff_obj = a.staff
            else:
                try:
                    if getattr(a, 'curriculum_row', None) and getattr(a, 'section', None):
                        from timetable.serializers import get_teaching_assignments_for_section_and_curriculum
                        staff_list = get_teaching_assignments_for_section_and_curriculum(a.section, a.curriculum_row)
                        if staff_list:
                            if len(staff_list) == 1:
                                staff_obj = staff_list[0]
                except Exception:
                    staff_obj = None

            # prefer elective subject display when applicable
            subj_text = a.subject_text
            elective_id = None
            try:
                # If this assignment references a curriculum_row that is an elective parent,
                # prefer the student's chosen ElectiveChoice when viewing as a student.
                if a.curriculum_row:
                    if student_profile:
                        # Dept-core subjects: auto-resolve via student's home_department.
                        # No ElectiveChoice needed — the mapping is by department membership.
                        if getattr(a.curriculum_row, 'is_dept_core', False) and student_profile.home_department:
                            from curriculum.models import ElectiveSubject
                            es = ElectiveSubject.objects.filter(
                                parent=a.curriculum_row,
                                department=student_profile.home_department,
                            ).first()
                            if es:
                                subj_text = f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
                                elective_id = getattr(es, 'id', None)
                        else:
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
                            _cr_name = getattr(a.curriculum_row, 'course_name', None)
                            ta = TeachingAssignment.objects.filter(section=a.section, is_active=True).filter(
                                Q(curriculum_row=a.curriculum_row) |
                                Q(elective_subject__parent=a.curriculum_row) |
                                Q(elective_subject__department_group__isnull=False,
                                  elective_subject__parent__course_name=_cr_name,
                                  elective_subject__department_group__department_mappings__department=dept,
                                  elective_subject__department_group__department_mappings__is_active=True)
                            ).select_related('elective_subject').first()
                            if not ta:
                                ta = TeachingAssignment.objects.filter(is_active=True).filter(
                                    Q(curriculum_row=a.curriculum_row) |
                                    Q(elective_subject__parent=a.curriculum_row) |
                                    Q(elective_subject__department_group__isnull=False,
                                      elective_subject__parent__course_name=_cr_name,
                                      elective_subject__department_group__department_mappings__department=dept,
                                      elective_subject__department_group__department_mappings__is_active=True)
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
                    'department_id': getattr(a.curriculum_row, 'department_id', None),
                } if a.curriculum_row else None

            staff_data = None
            if staff_obj:
                u = getattr(staff_obj, 'user', None)
                staff_data = {
                    'id': staff_obj.pk,
                    'staff_id': getattr(staff_obj, 'staff_id', None),
                    'name': _get_staff_name_helper(u, staff_obj),
                    'username': getattr(u, 'username', None),
                    'first_name': getattr(u, 'first_name', ''),
                    'last_name': getattr(u, 'last_name', '')
                }
            elif staff_list and len(staff_list) > 1:
                names = []
                usernames = []
                staff_ids = []
                for sp in staff_list:
                    u = getattr(sp, 'user', None)
                    full_name = _get_staff_name_helper(u, sp)
                    if full_name:
                        names.append(full_name)
                    usernames.append(u.username if u else '')
                    staff_ids.append(getattr(sp, 'staff_id', ''))
                
                combined_name = ", ".join(sorted(names))
                combined_username = ", ".join(sorted(filter(None, usernames)))
                combined_staff_id = ", ".join(sorted(filter(None, staff_ids)))
                
                staff_data = {
                    'id': None,
                    'staff_id': combined_staff_id,
                    'username': combined_username,
                    'name': combined_name,
                    'first_name': '',
                    'last_name': ''
                }

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
                'staff': staff_data,
            }

            # Avoid duplicate entries for the same period: prefer student-specific batch
            # or resolved elective entry over a generic unbatched assignment.
            # IMPORTANT: Allow multiple entries for the same period if they have different batches
            replaced = False
            for i, exist in enumerate(lst):
                try:
                    if exist.get('period_id') == new_entry.get('period_id'):
                        # Check if this is the SAME assignment (same batch and curriculum)
                        exist_batch_id = exist.get('subject_batch', {}).get('id') if exist.get('subject_batch') else None
                        new_batch_id = new_entry.get('subject_batch', {}).get('id') if new_entry.get('subject_batch') else None
                        exist_curriculum_id = exist.get('curriculum_row', {}).get('id') if exist.get('curriculum_row') else None
                        new_curriculum_id = new_entry.get('curriculum_row', {}).get('id') if new_entry.get('curriculum_row') else None

                        # Student view: if a batched assignment exists for the same period+subject,
                        # prefer the batched one and hide the unbatched one.
                        if student_profile and exist_curriculum_id == new_curriculum_id:
                            if exist_batch_id is None and new_batch_id is not None:
                                lst[i] = new_entry
                                replaced = True
                                break
                            if exist_batch_id is not None and new_batch_id is None:
                                replaced = True
                                break
                        
                        # If different batches or different curriculums, this is a separate assignment - don't replace
                        if exist_batch_id != new_batch_id or exist_curriculum_id != new_curriculum_id:
                            continue  # Skip to next existing entry, don't replace
                        
                        # Same period, same batch, same curriculum - check if we should replace
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
            ).select_related(
                'timetable',
                'period',
                'staff',
                'staff__user',
                'curriculum_row',
                'subject_batch',
                'subject_batch__staff',
                'subject_batch__staff__user',
            )
            # Filter special entries by student batch using the same strict logic
            # For subjects with batch assignments, only show the student's batch
            # For subjects without batch assignments, show unbatched entries
            if student_profile:
                special_qs = special_qs.filter(
                    Q(subject_batch__isnull=True) |
                    Q(subject_batch__students=student_profile)
                ).distinct()

                # Apply the same shared-section dept filtering for specials.
                special_qs = _apply_shared_section_student_dept_filter(special_qs, sec, student_profile)
            
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
                                # Dept-core: auto-resolve by home_department (no ElectiveChoice needed)
                                if getattr(e.curriculum_row, 'is_dept_core', False) and student_profile.home_department:
                                    from curriculum.models import ElectiveSubject
                                    es = ElectiveSubject.objects.filter(
                                        parent=e.curriculum_row,
                                        department=student_profile.home_department,
                                    ).first()
                                    if es:
                                        subj_text = f"{getattr(es, 'course_code', '')} - {getattr(es, 'course_name', '')}".strip(' -')
                                        elective_obj = {'id': es.pk, 'course_code': getattr(es, 'course_code', None), 'course_name': getattr(es, 'course_name', None)}
                                        elective_id = es.pk
                                    else:
                                        curr_obj = {'id': e.curriculum_row.id, 'course_code': getattr(e.curriculum_row, 'course_code', None), 'course_name': getattr(e.curriculum_row, 'course_name', None), 'mnemonic': getattr(e.curriculum_row, 'mnemonic', None)}
                                else:
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

                    # determine staff for special entry (same priority as normal assignments)
                    staff_obj = None
                    special_staff_list = []
                    if sb and getattr(sb, 'staff', None):
                        staff_obj = sb.staff
                    elif getattr(e, 'staff', None):
                        staff_obj = e.staff
                    else:
                        try:
                            if getattr(e, 'curriculum_row', None) and sec is not None:
                                from timetable.serializers import get_teaching_assignments_for_section_and_curriculum
                                special_staff_list = get_teaching_assignments_for_section_and_curriculum(sec, e.curriculum_row)
                                if special_staff_list:
                                    if len(special_staff_list) == 1:
                                        staff_obj = special_staff_list[0]
                        except Exception:
                            staff_obj = None

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
                        'staff': (
                            {
                                'id': getattr(staff_obj, 'pk', None),
                                'staff_id': getattr(staff_obj, 'staff_id', None),
                                'username': getattr(getattr(staff_obj, 'user', None), 'username', None),
                                'first_name': getattr(getattr(staff_obj, 'user', None), 'first_name', ''),
                                'last_name': getattr(getattr(staff_obj, 'user', None), 'last_name', ''),
                            } if staff_obj else (
                                {
                                    'id': None,
                                    'staff_id': ", ".join(sorted(filter(None, [getattr(sp, 'staff_id', '') for sp in special_staff_list]))),
                                    'username': ", ".join(sorted(filter(None, [getattr(getattr(sp, 'user', None), 'username', None) for sp in special_staff_list]))),
                                    'name': ", ".join(sorted(filter(None, [getattr(sp, 'user', None).get_full_name() if getattr(sp, 'user', None) else getattr(sp, 'staff_id', '') for sp in special_staff_list]))),
                                    'first_name': '',
                                    'last_name': ''
                                } if special_staff_list and len(special_staff_list) > 1 else None
                            )
                        ),
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
        # IMPORTANT: When comparing, consider both period AND batch to allow
        # multiple batch assignments for the same period
        try:
            for daynum, assignments in out.items():
                # Build a set of (period_id, batch_id) tuples for special entries
                special_keys = {
                    (
                        a.get('period_id'), 
                        a.get('subject_batch', {}).get('id') if a.get('subject_batch') else None
                    )
                    for a in assignments if a.get('is_special')
                }
                if not special_keys:
                    continue
                filtered = []
                for a in assignments:
                    if not a.get('is_special'):
                        # Check if there's a special entry for same period AND same batch
                        a_batch_id = a.get('subject_batch', {}).get('id') if a.get('subject_batch') else None
                        a_key = (a.get('period_id'), a_batch_id)
                        if a_key in special_keys:
                            # skip normal assignment when a special for same period+batch exists
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
            sec = Section.objects.select_related(
                'batch__course__department', 'batch__department', 'semester'
            ).get(pk=int(section_id))
        except Exception:
            return Response({'results': []})

        sem_num = getattr(sec.semester, 'number', None)
        if sem_num is None:
            return Response({'results': []})

        results = []
        try:
            # fetch curriculum rows for the section
            from curriculum.models import CurriculumDepartment, ElectiveSubject
            from django.db.models import Q
            from academics.models import AcademicYear

            # For shared (S&H Year-1) sections, teaching assignments for dept-core
            # subjects live on each student's SECONDARY (core-dept) section.
            # We'll aggregate staff across those secondary sections.
            section_ids_for_teaching_assignments = [sec.id]

            active_ay = AcademicYear.objects.filter(is_active=True).order_by('-id').first()

            # Shared section (S&H-type): prefer a single explicit curriculum department
            # when the section is already anchored to one; otherwise fall back to the
            # union of enrolled students' home departments.
            if getattr(sec.batch, 'course_id', None) is None:
                curriculum_dept_ids = _resolve_section_curriculum_department_ids(sec)
                from academics.models import StudentSectionAssignment
                home_dept_ids = list(
                    StudentSectionAssignment.objects.filter(
                        section=sec,
                        end_date__isnull=True,
                        section_type=StudentSectionAssignment.SECTION_TYPE_PRIMARY,
                        student__home_department__isnull=False,
                    ).values_list('student__home_department_id', flat=True).distinct()
                )

                # Legacy fallback: if PRIMARY assignments are missing, infer student IDs
                # from StudentProfile.section and read their home_department.
                if not home_dept_ids:
                    try:
                        from academics.models import StudentProfile
                        home_dept_ids = list(
                            StudentProfile.objects.filter(
                                section=sec,
                                home_department__isnull=False,
                            ).values_list('home_department_id', flat=True).distinct()
                        )
                    except Exception:
                        home_dept_ids = []

                try:
                    primary_student_ids = list(
                        StudentSectionAssignment.objects.filter(
                            section=sec,
                            end_date__isnull=True,
                            section_type=StudentSectionAssignment.SECTION_TYPE_PRIMARY,
                        ).values_list('student_id', flat=True).distinct()
                    )
                    # Fallback for legacy data: some installs may not have
                    # StudentSectionAssignment PRIMARY rows; rely on the
                    # canonical StudentProfile.section link instead.
                    if not primary_student_ids:
                        try:
                            from academics.models import StudentProfile
                            primary_student_ids = list(
                                StudentProfile.objects.filter(section=sec).values_list('id', flat=True).distinct()
                            )
                        except Exception:
                            primary_student_ids = []
                    if primary_student_ids:
                        secondary_section_ids = list(
                            StudentSectionAssignment.objects.filter(
                                student_id__in=primary_student_ids,
                                end_date__isnull=True,
                                section_type=StudentSectionAssignment.SECTION_TYPE_SECONDARY,
                            ).values_list('section_id', flat=True).distinct()
                        )
                        if secondary_section_ids:
                            section_ids_for_teaching_assignments.extend(secondary_section_ids)
                except Exception:
                    pass

                # Additional robustness: even if student-secondary mappings are missing,
                # core-dept sections for the same batch_year/regulation+semester can be
                # derived and used for TeachingAssignment lookup.
                try:
                    batch_year_id = getattr(sec.batch, 'batch_year_id', None)
                    regulation_id = getattr(sec.batch, 'regulation_id', None)
                    if batch_year_id and home_dept_ids:
                        core_dept_section_ids = list(
                            Section.objects.filter(
                                semester__number=sem_num,
                                batch__batch_year_id=batch_year_id,
                            ).filter(
                                Q(batch__course__department_id__in=home_dept_ids) |
                                Q(batch__department_id__in=home_dept_ids)
                            ).filter(
                                Q(batch__regulation_id=regulation_id) if regulation_id else Q()
                            ).values_list('id', flat=True).distinct()
                        )
                        if core_dept_section_ids:
                            section_ids_for_teaching_assignments.extend(core_dept_section_ids)
                except Exception:
                    pass
                # Also include managing_department (S&H) and batch.department
                managing_dept_id2 = getattr(getattr(sec, 'managing_department', None), 'pk', None)
                batch_dept_id2 = None
                try:
                    batch_dept_id2 = sec.batch.department_id
                except Exception:
                    pass
                if curriculum_dept_ids:
                    qs_all = CurriculumDepartment.objects.filter(
                        department_id__in=curriculum_dept_ids,
                        semester__number=sem_num,
                    ).order_by('course_code', 'department_id')
                else:
                    all_ids = list(set(home_dept_ids + [x for x in [managing_dept_id2, batch_dept_id2] if x]))
                    if not all_ids:
                        return Response({'results': []})
                    # Union of all dept curriculum rows, deduplicated by course_code or course_name
                    qs_all = CurriculumDepartment.objects.filter(
                        department_id__in=all_ids,
                        semester__number=sem_num,
                    ).order_by('course_code', 'department_id')
                seen: dict = {}
                for c in qs_all:
                    key = f'code:{c.course_code}' if c.course_code else f'name:{(c.course_name or "").strip().lower()}' or f'pk:{c.pk}'
                    is_managing2 = c.department_id in (managing_dept_id2, batch_dept_id2) if (managing_dept_id2 or batch_dept_id2) else False
                    if key not in seen or is_managing2:
                        seen[key] = c
                qs = list(seen.values())
                dept = None
            else:
                dept = getattr(sec.batch.course, 'department', None)
                if dept is None:
                    return Response({'results': []})
                qs = CurriculumDepartment.objects.filter(department=dept, semester__number=sem_num)
            # build a map from curriculum_row id -> staff (from TeachingAssignment)
            from academics.models import TeachingAssignment

            def _staff_display(sp):
                try:
                    if not sp:
                        return None
                    u = getattr(sp, 'user', None)
                    if u:
                        full = (u.get_full_name() or '').strip()
                        if full:
                            return full
                        if getattr(u, 'username', None):
                            return u.username
                    return getattr(sp, 'staff_id', None) or None
                except Exception:
                    return None

            def _keys_for_curriculum(cd):
                if not cd:
                    return []
                keys = []
                code = getattr(cd, 'course_code', None)
                if code:
                    keys.append(f'code:{str(code).strip().upper()}')
                name = (getattr(cd, 'course_name', None) or '').strip().lower()
                if name:
                    keys.append(f'name:{name}')
                # final fallback to pk to keep a stable key even if fields are missing
                if not keys:
                    keys.append(f'pk:{getattr(cd, "pk", None)}')
                return keys

            def _looks_like_lab_course(course_name):
                return 'LAB' in str(course_name or '').upper() or 'LABORATORY' in str(course_name or '').upper()

            lab_row_multipliers: dict[str, int] = {}
            try:
                course_codes = sorted({str(getattr(c, 'course_code', '')).strip().upper() for c in qs if getattr(c, 'course_code', None)})
                regulations = sorted({str(getattr(c, 'regulation', '')).strip() for c in qs if getattr(c, 'regulation', None)})
                if course_codes:
                    lab_qs = CurriculumDepartment.objects.filter(
                        course_code__in=course_codes,
                        semester__number=sem_num,
                    )
                    if regulations:
                        lab_qs = lab_qs.filter(regulation__in=regulations)

                    for lab_row in lab_qs:
                        normalized_type = _normalize_class_type(getattr(lab_row, 'class_type', None), lab_row)
                        if normalized_type not in ('LAB', 'PRACTICAL', 'PURE_LAB') and not _looks_like_lab_course(getattr(lab_row, 'course_name', None)):
                            continue
                        code_key = str(getattr(lab_row, 'course_code', '') or '').strip().upper()
                        if not code_key:
                            continue
                        lab_row_multipliers[code_key] = lab_row_multipliers.get(code_key, 0) + 1
            except Exception:
                lab_row_multipliers = {}

            # Map subject -> dict of staff profiles using course_code/name so it works
            # across departments (Program Core / shared curriculum rows) and
            # also maps elective-subject teaching assignments back to the parent.
            staff_by_key: dict = {}

            tas = TeachingAssignment.objects.filter(
                is_active=True,
            ).filter(
                Q(section_id__in=section_ids_for_teaching_assignments) | Q(section__isnull=True)
            )
            if active_ay is not None:
                tas = tas.filter(academic_year=active_ay)
            tas = tas.select_related('staff__user', 'curriculum_row', 'elective_subject', 'elective_subject__parent')
            for ta in tas:
                sp = getattr(ta, 'staff', None)
                if not sp:
                    continue
                staff_name = _staff_display(sp)
                if not staff_name:
                    continue

                u = getattr(sp, 'user', None)
                staff_info = {
                    'id': sp.id,
                    'name': staff_name,
                    'staff_id': getattr(sp, 'staff_id', None),
                    'username': getattr(u, 'username', None) if u else None
                }

                cr = getattr(ta, 'curriculum_row', None)
                if cr is not None:
                    for k in _keys_for_curriculum(cr):
                        staff_by_key.setdefault(k, {})[sp.id] = staff_info

                # Electives / dept-core teaching assignments may be stored against
                # the elective_subject; map them to the parent curriculum row too.
                es = getattr(ta, 'elective_subject', None)
                parent = getattr(es, 'parent', None) if es is not None else None
                if parent is not None:
                    for k2 in _keys_for_curriculum(parent):
                        staff_by_key.setdefault(k2, {})[sp.id] = staff_info

            # also consider direct timetable assignments that may override
            from .models import TimetableAssignment
            tassigns = TimetableAssignment.objects.filter(section=sec).select_related('curriculum_row', 'staff__user')
            for a in tassigns:
                cr = getattr(a, 'curriculum_row', None)
                if cr is not None:
                    sp = getattr(a, 'staff', None)
                    if sp:
                        staff_name = _staff_display(sp)
                        if staff_name:
                            u = getattr(sp, 'user', None)
                            staff_info = {
                                'id': sp.id,
                                'name': staff_name,
                                'staff_id': getattr(sp, 'staff_id', None),
                                'username': getattr(u, 'username', None) if u else None
                            }
                            for k in _keys_for_curriculum(cr):
                                staff_by_key.setdefault(k, {}).setdefault(sp.id, staff_info)

            for c in qs:
                staff_val = None
                assigned_staff = []
                try:
                    merged_staff = {}
                    for k in _keys_for_curriculum(c):
                        if k in staff_by_key:
                            merged_staff.update(staff_by_key[k])
                    if merged_staff:
                        assigned_staff = list(merged_staff.values())
                        staff_val = ', '.join(sorted([s['name'] for s in assigned_staff]))
                except Exception:
                    staff_val = None
                    assigned_staff = []

                results.append({
                    'id': c.id,
                    'course_code': c.course_code,
                    'mnemonic': getattr(c, 'mnemonic', None),
                    'course_name': c.course_name,
                    'regulation': c.regulation,
                    'class_type': _normalize_class_type(c.class_type, c),
                    'lab_row_multiplier': lab_row_multipliers.get(str(c.course_code or '').strip().upper(), 1),
                    'is_elective': c.is_elective,
                    'is_dept_core': getattr(c, 'is_dept_core', False),
                    'staff': staff_val,
                    'assigned_staff': assigned_staff
                })

            # --- Elective subjects (ElectiveSubject rows, keyed by their own pk) ---
            # Build a staff map for elective subjects: keyed by ElectiveSubject.pk
            elective_staff_map = {}
            # 1. From TeachingAssignment with elective_subject (section match or null section)
            elective_tas = TeachingAssignment.objects.filter(
                elective_subject__isnull=False,
                elective_subject__semester__number=sem_num,
                is_active=True,
            ).filter(
                Q(section_id__in=section_ids_for_teaching_assignments) | Q(section__isnull=True)
            ).select_related('staff__user', 'elective_subject')
            if active_ay is not None:
                elective_tas = elective_tas.filter(academic_year=active_ay)
            for ta in elective_tas:
                if ta.elective_subject and ta.staff:
                    staff_name = _staff_display(ta.staff)
                    if staff_name:
                        u = getattr(ta.staff, 'user', None)
                        staff_info = {
                            'id': ta.staff.id,
                            'name': staff_name,
                            'staff_id': getattr(ta.staff, 'staff_id', None),
                            'username': getattr(u, 'username', None) if u else None
                        }
                        # Deduplicate by staff ID
                        staff_dict_for_es = elective_staff_map.setdefault(ta.elective_subject_id, {})
                        staff_dict_for_es[ta.staff.id] = staff_info

            # 2. Fetch all ElectiveSubject rows for this section's dept+sem and add to results
            # Electives are only defined per-department; skip for shared sections (dept=None)
            elective_qs = ElectiveSubject.objects.filter(
                parent__department=dept,
                semester__number=sem_num,
            ).select_related('parent') if dept is not None else []
            for es in elective_qs:
                staff_dict = elective_staff_map.get(es.pk, {})
                assigned_staff = list(staff_dict.values())
                staff_val = ', '.join(sorted([s['name'] for s in assigned_staff])) if assigned_staff else None
                results.append({
                    'id': es.pk,
                    'course_code': es.course_code,
                    'course_name': es.course_name,
                    'regulation': es.regulation,
                    'class_type': _normalize_class_type(es.class_type, es),
                    'is_elective': True,
                    'is_elective_child': True,
                    'parent_id': es.parent_id,
                    'staff': staff_val,
                    'assigned_staff': assigned_staff
                })

            # include any timetable-only subjects (no curriculum_row) with staff
            for a in tassigns:
                if not getattr(a, 'curriculum_row', None) and (a.subject_text or getattr(a, 'staff', None)):
                    key = f"txt-{(a.subject_text or '')[:100]}"
                    sp = getattr(a, 'staff', None)
                    assigned_staff = []
                    staff_val = None
                    if sp:
                        staff_name = _staff_display(sp)
                        if staff_name:
                            staff_val = staff_name
                            u = getattr(sp, 'user', None)
                            assigned_staff = [{
                                'id': sp.id,
                                'name': staff_name,
                                'staff_id': getattr(sp, 'staff_id', None),
                                'username': getattr(u, 'username', None) if u else None
                            }]
                    results.append({
                        'id': key,
                        'course_code': None,
                        'course_name': a.subject_text,
                        'staff': staff_val,
                        'assigned_staff': assigned_staff
                    })

        except Exception:
            return Response({'results': []})

        return Response({'results': results})


class PeriodSwapView(APIView):
    """Create or undo a date-specific period swap for a section.

    POST  /api/timetable/section/<id>/swap-periods/
        Body: { from_date, to_date, from_period_id, to_period_id }
        Creates two SpecialTimetableEntry records that swap the subjects/staff
        of the two periods. Supports same-day swaps (from_date == to_date) or
        cross-day swaps within the same week (to_date must be >= from_date).
        Both dates must be in the same calendar week (Monday-Sunday).

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

        # Support both same-day and cross-day swaps within the same week
        from_date_str = request.data.get('from_date') or request.data.get('date')
        to_date_str = request.data.get('to_date') or request.data.get('date')
        from_period_id = request.data.get('from_period_id')
        to_period_id = request.data.get('to_period_id')

        if not from_date_str or not to_date_str or not from_period_id or not to_period_id:
            return Response({'error': 'from_date, to_date, from_period_id and to_period_id are required'}, status=400)
        try:
            from_period_id = int(from_period_id)
            to_period_id = int(to_period_id)
        except Exception:
            return Response({'error': 'period ids must be integers'}, status=400)
        
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
            from_date = datetime.date.fromisoformat(from_date_str)
            to_date = datetime.date.fromisoformat(to_date_str)
        except Exception:
            return Response({'error': 'Invalid date format, use YYYY-MM-DD'}, status=400)

        # Validate dates are in the same week and to_date is on or after from_date
        from_week_start = from_date - datetime.timedelta(days=from_date.weekday())
        to_week_start = to_date - datetime.timedelta(days=to_date.weekday())
        if from_week_start != to_week_start:
            return Response({'error': 'Swap dates must be in the same week'}, status=400)
        if to_date < from_date:
            return Response({'error': 'Target swap date cannot be before the source date'}, status=400)

        # day of week: isoweekday() 1=Mon … 7=Sun (matches TimetableAssignment.day)
        from_day_of_week = from_date.isoweekday()
        to_day_of_week = to_date.isoweekday()

        from_assigns = list(TimetableAssignment.objects.filter(
            section=sec, period_id=from_period_id, day=from_day_of_week
        ).select_related('staff', 'curriculum_row', 'subject_batch').order_by('id'))
        to_assigns = list(TimetableAssignment.objects.filter(
            section=sec, period_id=to_period_id, day=to_day_of_week
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
                        section=sec, period__index=from_slot_index, day=from_day_of_week
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
                        section=sec, period__index=to_slot_index, day=to_day_of_week
                    ).select_related('staff', 'curriculum_row', 'subject_batch').order_by('id'))
            except Exception:
                pass

        if not from_assigns:
            return Response({'error': f'No assignment found for period {from_period_id} on day {from_day_of_week} in section {sec.name}'}, status=400)
        if not to_assigns:
            return Response({'error': f'No assignment found for period {to_period_id} on day {to_day_of_week} in section {sec.name}'}, status=400)

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
        
        # Validate that the requesting staff is teaching at least one of the periods being swapped
        staff_profile = getattr(request.user, 'staff_profile', None)
        if staff_profile:
            from_staff_id = from_a.staff_id if from_a.staff else None
            to_staff_id = to_a.staff_id if to_a.staff else None
            requesting_staff_id = staff_profile.id
            
            if from_staff_id != requesting_staff_id and to_staff_id != requesting_staff_id:
                return Response({'error': 'You can only swap periods where you are assigned as the teaching staff'}, status=403)
        
        # Prevent swapping elective periods
        if from_cr and getattr(from_cr, 'is_elective', False):
            return Response({'error': 'Cannot swap elective periods'}, status=400)
        if to_cr and getattr(to_cr, 'is_elective', False):
            return Response({'error': 'Cannot swap elective periods'}, status=400)
        
        # Prevent swapping custom subject periods (those with subject_text but no curriculum_row)
        if not from_cr and from_text:
            return Response({'error': 'Cannot swap custom subject periods'}, status=400)
        if not to_cr and to_text:
            return Response({'error': 'Cannot swap custom subject periods'}, status=400)
        
        # Prevent swapping periods that already have non-swap special entries
        existing_from_special = SpecialTimetableEntry.objects.filter(
            timetable__section=sec,
            date=from_date,
            period_id=from_period_id,
            is_active=True
        ).exclude(timetable__name__startswith='[SWAP]').exists()
        
        existing_to_special = SpecialTimetableEntry.objects.filter(
            timetable__section=sec,
            date=to_date,
            period_id=to_period_id,
            is_active=True
        ).exclude(timetable__name__startswith='[SWAP]').exists()
        
        if existing_from_special:
            return Response({'error': 'Cannot swap a period that has a special timetable entry'}, status=400)
        if existing_to_special:
            return Response({'error': 'Cannot swap a period that has a special timetable entry'}, status=400)
        # ────────────────────────────────────────────────────────────────────────

        # Deactivate any existing swap entries for these periods on their respective dates
        SpecialTimetableEntry.objects.filter(
            timetable__section=sec,
            timetable__name__startswith='[SWAP]',
            date=from_date,
            period_id=from_period_id,
            is_active=True,
        ).update(is_active=False)
        SpecialTimetableEntry.objects.filter(
            timetable__section=sec,
            timetable__name__startswith='[SWAP]',
            date=to_date,
            period_id=to_period_id,
            is_active=True,
        ).update(is_active=False)

        # Get or create swap SpecialTimetables for each date (may be same or different)
        swap_name_from = f'[SWAP] {from_date_str}'
        swap_name_to = f'[SWAP] {to_date_str}'
        
        st_from, _ = SpecialTimetable.objects.get_or_create(
            section=sec,
            name=swap_name_from,
            defaults={'created_by': staff_profile, 'is_active': True},
        )
        if not st_from.is_active:
            st_from.is_active = True
            st_from.save(update_fields=['is_active'])
        
        # Only create second timetable if dates differ
        if from_date == to_date:
            st_to = st_from
        else:
            st_to, _ = SpecialTimetable.objects.get_or_create(
                section=sec,
                name=swap_name_to,
                defaults={'created_by': staff_profile, 'is_active': True},
            )
            if not st_to.is_active:
                st_to.is_active = True
                st_to.save(update_fields=['is_active'])

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
        
        # Delete any existing conflicting entries
        SpecialTimetableEntry.objects.filter(timetable=st_from, date=from_date, period_id=from_period_id).delete()
        SpecialTimetableEntry.objects.filter(timetable=st_to, date=to_date, period_id=to_period_id).delete()
        
        # subject_text stores the ORIGINAL (displaced) subject code so the UI can show "new ⇄ orig"
        from_orig_text = getattr(from_a.curriculum_row, 'course_code', None) or getattr(from_a.curriculum_row, 'course_name', None) or (from_a.subject_text or '') if from_a.curriculum_row else (from_a.subject_text or '')
        to_orig_text = getattr(to_a.curriculum_row, 'course_code', None) or getattr(to_a.curriculum_row, 'course_name', None) or (to_a.subject_text or '') if to_a.curriculum_row else (to_a.subject_text or '')
        
        logger.info(f"Creating cross-day swap for section {sec.name}:")
        logger.info(f"  {from_date_str} Period {from_period_id}: {from_orig_text} (staff={from_a.staff_id if from_a.staff else None}) → {to_orig_text} (staff={to_a.staff_id if to_a.staff else None})")
        logger.info(f"  {to_date_str} Period {to_period_id}: {to_orig_text} (staff={to_a.staff_id if to_a.staff else None}) → {from_orig_text} (staff={from_a.staff_id if from_a.staff else None})")
        
        # Entry A: from_period on from_date now carries to_a's subject/staff
        SpecialTimetableEntry.objects.create(
            timetable=st_from, date=from_date, period_id=from_period_id,
            staff=to_a.staff, curriculum_row=to_a.curriculum_row,
            subject_batch=to_a.subject_batch, subject_text=from_orig_text,
            is_active=True,
        )
        # Entry B: to_period on to_date now carries from_a's subject/staff
        SpecialTimetableEntry.objects.create(
            timetable=st_to, date=to_date, period_id=to_period_id,
            staff=from_a.staff, curriculum_row=from_a.curriculum_row,
            subject_batch=from_a.subject_batch, subject_text=to_orig_text,
            is_active=True,
        )

        return Response({
            'swap_id': st_from.id,
            'from_date': from_date_str,
            'to_date': to_date_str,
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


from rest_framework.decorators import action

class TimetableTemplateViewSet(viewsets.ModelViewSet):

    @action(detail=False, methods=['post'])
    def save_frontend_template(self, request):
        data = request.data
        template_id = data.get('id')
        name = data.get('name')
        semester_type = data.get('semesterType', 'odd').upper()
        columns = data.get('columns', [])
        rows = data.get('rows', [])
        
        # We will store the exact JSON config in the description field so the frontend can reconstruct it.
        import json
        description = json.dumps({
            'columns': columns,
            'rows': rows,
            'semesterType': data.get('semesterType', 'odd')
        })

        if template_id and str(template_id).startswith('template-'):
            # It's a newly created one from frontend, not yet in DB
            template = TimetableTemplate.objects.create(
                name=name,
                parity=semester_type,
                description=description,
                created_by=request.user,
                is_active=True
            )
        elif template_id:
            try:
                template = TimetableTemplate.objects.get(pk=template_id)
                template.name = name
                template.parity = semester_type
                template.description = description
                template.save()
                # delete old slots
                template.periods.all().delete()
            except TimetableTemplate.DoesNotExist:
                template = TimetableTemplate.objects.create(
                    name=name,
                    parity=semester_type,
                    description=description,
                    created_by=request.user,
                    is_active=True
                )
        else:
            template = TimetableTemplate.objects.create(
                name=name,
                parity=semester_type,
                description=description,
                created_by=request.user,
                is_active=True
            )

        # Create slots based on columns
        import datetime
        import re
        
        def parse_time(t_str):
            if not t_str: return None
            try:
                match = re.match(r'(\d+):(\d+)\s*(AM|PM)', t_str.strip(), re.IGNORECASE)
                if match:
                    h, m, ap = match.groups()
                    h = int(h)
                    m = int(m)
                    if ap.upper() == 'PM' and h < 12:
                        h += 12
                    elif ap.upper() == 'AM' and h == 12:
                        h = 0
                    return datetime.time(h, m)
            except Exception:
                pass
            return None

        for idx, col in enumerate(columns):
            start_time = None
            end_time = None
            if col.get('timing'):
                parts = col.get('timing').split('-')
                if len(parts) == 2:
                    start_time = parse_time(parts[0])
                    end_time = parse_time(parts[1])
            
            period_name = col.get('period', '')
            is_break = period_name.lower() == 'break'
            is_lunch = period_name.lower() == 'lunch'
            
            TimetableSlot.objects.create(
                template=template,
                index=idx + 1,
                label=period_name,
                is_break=is_break,
                is_lunch=is_lunch,
                start_time=start_time,
                end_time=end_time
            )

        # Return the template
        return Response({'id': template.id, 'status': 'success'})

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
    queryset = TimetableAssignment.objects.select_related('period', 'section', 'staff', 'curriculum_row', 'subject_batch', 'subject_batch__staff')
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
        # If an assignment already exists for (section, day, period) -> update it (upsert)
        # Historically we upserted even for unbatched assignments, which prevented
        # assigning multiple subjects in the same period. To support multi-subject
        # per slot, we only upsert when the *same subject* is being re-saved.
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

                # Determine the incoming subject identity (if any)
                incoming_curriculum_id = None
                incoming_subject_text = None
                try:
                    if data.get('curriculum_row') not in (None, ''):
                        incoming_curriculum_id = int(data.get('curriculum_row'))
                except Exception:
                    incoming_curriculum_id = None
                try:
                    if data.get('subject_text') not in (None, ''):
                        incoming_subject_text = str(data.get('subject_text')).strip() or None
                except Exception:
                    incoming_subject_text = None

                if sb_id is None:
                    # match unbatched assignment ONLY if it's the same subject
                    existing_qs = TimetableAssignment.objects.filter(
                        section_id=sec_id,
                        period_id=period_id,
                        day=day,
                        subject_batch__isnull=True,
                    )
                    if incoming_curriculum_id is not None:
                        existing_qs = existing_qs.filter(curriculum_row_id=incoming_curriculum_id)
                    elif incoming_subject_text is not None:
                        existing_qs = existing_qs.filter(subject_text=incoming_subject_text)
                    else:
                        # No subject identity provided; do not upsert.
                        existing_qs = TimetableAssignment.objects.none()
                    existing = existing_qs.first()
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
                (
                    Q(curriculum_row=OuterRef('curriculum_row')) |
                    Q(elective_subject__parent=OuterRef('curriculum_row')) |
                    # Cross-dept shared electives: same parent slot name AND the group includes the slot's section dept
                    Q(elective_subject__department_group__isnull=False,
                      elective_subject__parent__course_name=OuterRef('curriculum_row__course_name'),
                      elective_subject__department_group__department_mappings__department=OuterRef('section__batch__course__department'),
                      elective_subject__department_group__department_mappings__is_active=True)
                )
            )

            qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section', 'section__batch', 'subject_batch', 'subject_batch__staff')
            # Include assignments where:
            # 1. staff=staff_profile (direct assignment)
            # 2. staff is null but has teaching assignment (has_ta=True)
            # 3. subject_batch.staff=staff_profile (batch-assigned to this staff)
            # 4. subject_batch.created_by=staff_profile (batch created by this staff)
            qs = qs.annotate(has_ta=Exists(ta_qs)).filter(
                Q(staff=staff_profile) | 
                Q(staff__isnull=True, has_ta=True) |
                Q(subject_batch__staff=staff_profile) |
                Q(subject_batch__created_by=staff_profile)
            )

        except Exception:
            # fallback: only show direct assignments and batch assignments
            qs = TimetableAssignment.objects.select_related('period', 'staff', 'curriculum_row', 'section', 'section__batch', 'subject_batch', 'subject_batch__staff').filter(
                Q(staff=staff_profile) | 
                Q(subject_batch__staff=staff_profile) |
                Q(subject_batch__created_by=staff_profile)
            )

        out = {}
        for a in qs:
            day = a.day
            lst = out.setdefault(day, [])
            # determine staff to present: 
            # Priority: batch staff > explicit staff > requesting staff (if resolved via TA)
            if a.subject_batch and a.subject_batch.staff:
                staff_obj = a.subject_batch.staff
            elif a.staff:
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
                    _cr_name_staff = getattr(a.curriculum_row, 'course_name', None)
                    # Determine section's department for scoping cross-dept group match
                    _sec_dept_id = None
                    try:
                        _sec_dept_id = a.section.batch.course.department_id
                    except Exception:
                        pass
                    ta = TeachingAssignment.objects.filter(
                        staff=staff_profile, section=a.section, is_active=True
                    ).filter(
                        Q(curriculum_row=a.curriculum_row) |
                        Q(elective_subject__parent=a.curriculum_row) |
                        Q(elective_subject__department_group__isnull=False,
                          elective_subject__parent__course_name=_cr_name_staff,
                          elective_subject__department_group__department_mappings__department_id=_sec_dept_id,
                          elective_subject__department_group__department_mappings__is_active=True)
                    ).select_related('elective_subject').first()
                    if not ta:
                        ta = TeachingAssignment.objects.filter(
                            staff=staff_profile, is_active=True
                        ).filter(
                            Q(curriculum_row=a.curriculum_row) |
                            Q(elective_subject__parent=a.curriculum_row) |
                            Q(elective_subject__department_group__isnull=False,
                              elective_subject__parent__course_name=_cr_name_staff,
                              elective_subject__department_group__department_mappings__department_id=_sec_dept_id,
                              elective_subject__department_group__department_mappings__is_active=True)
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
            ).select_related('timetable', 'timetable__section', 'timetable__section__batch', 'period', 'staff', 'curriculum_row', 'subject_batch', 'subject_batch__staff')
            for e in special_qs:
                try:
                    # Treat all special entries (including swaps) uniformly
                    # Show to staff if: explicitly assigned, assigned via batch, or if staff has TeachingAssignment matching the section/day
                    include_special = False
                    explicit_staff = getattr(e, 'staff', None)
                    batch_staff = getattr(getattr(e, 'subject_batch', None), 'staff', None) if e.subject_batch else None
                    batch_creator = getattr(getattr(e, 'subject_batch', None), 'created_by', None) if e.subject_batch else None
                    
                    # Check batch assignment first
                    if batch_staff and getattr(batch_staff, 'id', None) == getattr(staff_profile, 'id', None):
                        include_special = True
                    elif batch_creator and getattr(batch_creator, 'id', None) == getattr(staff_profile, 'id', None):
                        include_special = True
                    elif explicit_staff:
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
                            _ecr_name = getattr(e.curriculum_row, 'course_name', None)
                            _sec_dept_id_sp = None
                            try:
                                _sec_dept_id_sp = e.timetable.section.batch.course.department_id
                            except Exception:
                                pass
                            ta = TeachingAssignment.objects.filter(staff=staff_profile, is_active=True).filter(
                                Q(curriculum_row=e.curriculum_row) |
                                Q(elective_subject__parent=e.curriculum_row) |
                                Q(elective_subject__department_group__isnull=False,
                                  elective_subject__parent__course_name=_ecr_name,
                                  elective_subject__department_group__department_mappings__department_id=_sec_dept_id_sp,
                                  elective_subject__department_group__department_mappings__is_active=True)
                            ).select_related('elective_subject').first()
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
                            'id': getattr(batch_staff if batch_staff else e.staff, 'pk', None), 
                            'staff_id': getattr(batch_staff if batch_staff else e.staff, 'staff_id', None),
                            'username': getattr(getattr(batch_staff if batch_staff else e.staff, 'user', None), 'username', None),
                            'first_name': getattr(getattr(batch_staff if batch_staff else e.staff, 'user', None), 'first_name', ''),
                            'last_name': getattr(getattr(batch_staff if batch_staff else e.staff, 'user', None), 'last_name', '')
                        } if (batch_staff or getattr(e, 'staff', None)) else None,
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
                mapped_q = qs.filter(
                    curriculum_row__in=ta_q.values_list('curriculum_row', flat=True), 
                    timetable__section__in=ta_q.values_list('section', flat=True)
                )
                
                return (staff_q | mapped_q).distinct()
            except Exception:
                return qs.filter(staff=staff_profile)

        if student_profile:
            # Student view: include all unbatched entries, and include batched entries
            # only when the student is a member of that batch.
            # IMPORTANT: Do NOT hide an unbatched entry just because the same subject
            # has batched entries elsewhere.
            try:
                from academics.models import StudentSubjectBatch
                sec = getattr(student_profile, 'section', None)
                if not sec:
                    return SpecialTimetableEntry.objects.none()
                
                # entries for the section
                sec_q = qs.filter(timetable__section=sec)
                
                sec_q = sec_q.filter(
                    Q(subject_batch__isnull=True) |
                    Q(subject_batch__students=student_profile)
                ).distinct()

                # Shared-section (Year-1 S&H) entries may include per-department variants.
                # Filter to the student's core/home department.
                sec_q = _apply_shared_section_student_dept_filter(sec_q, sec, student_profile)
                return sec_q
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

        # Extract the entry data
        curriculum_row = serializer.validated_data.get('curriculum_row')
        timetable_obj = serializer.validated_data.get('timetable')
        staff_provided = serializer.validated_data.get('staff')
        
        # Key Logic: If this is a CONFIGURED SUBJECT (has curriculum_row), ALWAYS assign to subject's teaching staff
        # NOT to the advisor who is creating it
        resolved_staff = None
        
        if staff_provided:
            # Staff explicitly provided - use it
            resolved_staff = staff_provided
            logger.info(f'📌 Staff explicitly provided: {resolved_staff.id}')
        elif curriculum_row and timetable_obj:
            # CONFIGURED SUBJECT - Must assign to the subject's teaching staff, NOT the advisor
            logger.info(f'🔍 Looking up teaching staff for curriculum_row={curriculum_row.id} in section={timetable_obj.section.id}')
            
            try:
                from academics.models import TeachingAssignment
                
                # Query 1: Section-specific teaching assignment
                ta = TeachingAssignment.objects.filter(
                    section=timetable_obj.section,
                    curriculum_row=curriculum_row,
                    is_active=True
                ).select_related('staff').first()
                
                logger.info(f'  Section-specific query result: {ta}')
                
                # Query 2: Fallback - any active teaching assignment for this curriculum
                if not ta:
                    ta = TeachingAssignment.objects.filter(
                        curriculum_row=curriculum_row,
                        is_active=True
                    ).select_related('staff').first()
                    logger.info(f'  General curriculum query result: {ta}')
                
                # Use the found teaching staff
                if ta and ta.staff:
                    resolved_staff = ta.staff
                    logger.info(f'✅ SUCCESS: Resolved to teaching staff {resolved_staff.id} ({resolved_staff.staff_id})')
                else:
                    logger.warning(f'❌ PROBLEM: No teaching assignment found for curriculum_row={curriculum_row.id}')
                    
            except Exception as e:
                logger.error(f'❌ ERROR resolving teaching staff: {e}', exc_info=True)
        else:
            # CUSTOM SUBJECT (no curriculum_row) - assign to advisor who is creating it
            staff_profile = getattr(user, 'staff_profile', None)
            if staff_profile:
                resolved_staff = staff_profile
                logger.info(f'📝 Custom subject - using advisor as staff: {staff_profile.id}')
        
        # Save the entry with the resolved staff
        if resolved_staff:
            logger.info(f'💾 SAVING special entry with staff_id={resolved_staff.id}')
            serializer.save(staff=resolved_staff)
        else:
            logger.warning(f'⚠️ WARNING: Could not resolve staff, saving without explicit staff assignment')
            serializer.save()

        entry = serializer.instance

        # Ensure a PeriodAttendanceSession exists for this special entry
        try:
            from academics.models import PeriodAttendanceSession
            if entry and getattr(entry, 'timetable', None):
                section_obj = entry.timetable.section
                period_obj = entry.period
                date_val = entry.date
                # Create session if not exists
                PeriodAttendanceSession.objects.get_or_create(
                    section=section_obj,
                    period=period_obj,
                    date=date_val,
                    defaults={'timetable_assignment': None, 'created_by': resolved_staff or staff_profile}
                )
        except Exception:
            # Non-fatal; do not block entry creation
            pass
            pass


class BulkSpecialTimetableEntryCreateView(APIView):
    """Create multiple special timetable entries at once for multiple periods and dates.
    
    POST /api/timetable/special-entries-bulk/
    Body: {
        timetable_id: <int>,
        period_ids: [<int>, ...],  # List of period IDs
        day_numbers: [1-7],        # List of day numbers (1=Mon, ..., 7=Sun)
        date_start: "YYYY-MM-DD",
        date_end: "YYYY-MM-DD",
        curriculum_row: <int> or null,
        subject_batch_id: <int> or null,
        subject_text: <str> or null,
        staff_id: <int> or null
    }
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        from datetime import datetime, timedelta
        from academics.models import TeachingAssignment, PeriodAttendanceSession
        
        user = request.user
        perms = get_user_permissions(user)
        
        # Check permissions
        role_names = {r.name.upper() for r in user.roles.all()}
        allowed = False
        if 'timetable.manage_special_timetable' in perms or 'academics.manage_special_timetable' in perms or user.is_staff:
            allowed = True
        if 'timetable.assign' in perms:
            allowed = True

        # Advisors can create bulk entries for sections they advise
        if 'ADVISOR' in role_names:
            timetable_id = request.data.get('timetable_id')
            try:
                if timetable_id:
                    st = SpecialTimetable.objects.filter(pk=int(timetable_id)).select_related('section').first()
                    staff_profile = getattr(user, 'staff_profile', None)
                    if st and staff_profile:
                        from academics.models import SectionAdvisor
                        if SectionAdvisor.objects.filter(section=st.section, advisor=staff_profile, is_active=True, academic_year__is_active=True).exists():
                            allowed = True
            except Exception:
                pass

        if not allowed:
            return Response({'detail': 'You do not have permission to create special timetable entries'}, status=status.HTTP_403_FORBIDDEN)

        # Extract request data
        timetable_id = request.data.get('timetable_id')
        period_ids = request.data.get('period_ids', [])
        day_numbers = request.data.get('day_numbers', [])
        date_start_str = request.data.get('date_start')
        date_end_str = request.data.get('date_end')
        curriculum_row_id = request.data.get('curriculum_row')
        subject_batch_id = request.data.get('subject_batch_id')
        subject_text = request.data.get('subject_text')
        staff_id = request.data.get('staff_id')

        # Validate required fields
        if not timetable_id or not date_start_str or not date_end_str:
            return Response({'detail': 'Missing timetable_id, date_start, or date_end'}, status=status.HTTP_400_BAD_REQUEST)
        if not period_ids or not day_numbers:
            return Response({'detail': 'Must select at least one period and one day'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Get timetable
            timetable = SpecialTimetable.objects.select_related('section').get(pk=int(timetable_id))
            
            # Parse dates
            date_start = datetime.strptime(date_start_str, '%Y-%m-%d').date()
            date_end = datetime.strptime(date_end_str, '%Y-%m-%d').date()
            
            if date_start > date_end:
                return Response({'detail': 'date_start cannot be after date_end'}, status=status.HTTP_400_BAD_REQUEST)

            # Get staff profile and explicit staff if provided
            staff_profile = getattr(user, 'staff_profile', None)
            if staff_id and staff_profile.id != int(staff_id) and not user.is_staff:
                # Non-staff cannot assign to other staff
                return Response({'detail': 'You cannot assign entries to other staff'}, status=status.HTTP_403_FORBIDDEN)
            
            # Resolve staff for the entries
            # Key Logic: If curriculum_row is provided, ALWAYS resolve to subject's teaching staff
            # NOT to the advisor who is creating it
            resolved_staff = None
            
            if staff_id:
                # Explicit staff provided
                from academics.models import StaffProfile
                resolved_staff = StaffProfile.objects.get(pk=int(staff_id))
                logger.info(f'📌 Explicit staff_id provided: {resolved_staff.id}')
            elif curriculum_row_id:
                # CONFIGURED SUBJECT - look up teaching staff for this subject
                logger.info(f'🔍 Resolving teaching staff for curriculum_row={curriculum_row_id}')
                
                try:
                    from academics.models import TeachingAssignment
                    
                    # Query 1: Section-specific teaching assignment (most likely)
                    ta = TeachingAssignment.objects.filter(
                        section=timetable.section,
                        curriculum_row_id=int(curriculum_row_id),
                        is_active=True
                    ).select_related('staff').first()
                    
                    logger.info(f'  Section-specific query: {ta}')
                    
                    # Query 2: Fallback - any active teaching assignment for this curriculum
                    if not ta:
                        ta = TeachingAssignment.objects.filter(
                            curriculum_row_id=int(curriculum_row_id),
                            is_active=True
                        ).select_related('staff').first()
                        logger.info(f'  General curriculum query: {ta}')
                    
                    # Assign to the found teaching staff
                    if ta and ta.staff:
                        resolved_staff = ta.staff
                        logger.info(f'✅ SUCCESS: Resolved to teaching staff {resolved_staff.id} ({resolved_staff.staff_id})')
                    else:
                        logger.warning(f'❌ PROBLEM: No teaching assignment found for curriculum_row={curriculum_row_id}')
                        # For configured subjects with no teaching staff assigned, don't default to advisor
                        # Let it be None so it creates without a staff assignment
                        
                except Exception as e:
                    logger.error(f'❌ ERROR resolving teaching staff: {e}', exc_info=True)
            else:
                # CUSTOM SUBJECT (no curriculum_row) - assign to advisor
                resolved_staff = staff_profile
                logger.info(f'📝 Custom subject - using advisor as staff: {staff_profile.id}')

            # Convert period_ids and day_numbers to integers
            period_ids = [int(p) for p in period_ids]
            day_numbers = [int(d) for d in day_numbers]

            logger.info(f'🟦 BULK SPECIAL ENTRY START')
            logger.info(f'  ✓ period_ids={period_ids}')
            logger.info(f'  ✓ day_numbers={day_numbers}')
            logger.info(f'  ✓ date_range={date_start} to {date_end}')
            logger.info(f'  ✓ timetable_id={timetable_id}')
            logger.info(f'  ✓ subject_type: curriculum_row={curriculum_row_id}, subject_text={subject_text}')
            logger.info(f'  ✓ resolved_staff_id={resolved_staff.id if resolved_staff else None} staff_profile_id={staff_profile.id if staff_profile else None}')

            entries_created = []
            current_date = date_start
            iterate_count = 0
            match_count = 0
            
            # Iterate through date range
            while current_date <= date_end:
                iterate_count += 1
                # Get day of week for current date (Python: 0=Mon, 6=Sun)
                current_dow = current_date.weekday()  # 0-6
                # Convert to 1-7 format (1=Mon, ..., 7=Sun)
                current_dow_1_7 = current_dow + 1
                is_match = current_dow_1_7 in day_numbers
                
                logger.info(f'  [{iterate_count}] {current_date}: weekday()={current_dow}, 1-7={current_dow_1_7}, match={is_match}')
                
                # Only create entries for matching days of week
                if is_match:
                    match_count += 1
                    # Create entry for each selected period
                    for period_id in period_ids:
                        try:
                            entry, created = SpecialTimetableEntry.objects.get_or_create(
                                timetable=timetable,
                                date=current_date,
                                period_id=int(period_id),
                                defaults={
                                    'staff': resolved_staff,
                                    'curriculum_row_id': int(curriculum_row_id) if curriculum_row_id else None,
                                    'subject_batch_id': int(subject_batch_id) if subject_batch_id else None,
                                    'subject_text': subject_text,
                                    'is_active': True
                                }
                            )
                            if created:
                                entries_created.append(entry.id)
                                logger.info(f'    ✅ Created entry {entry.id} for period {period_id}')
                            else:
                                logger.info(f'    ⚠️ Entry already exists for period {period_id}')
                                
                                # Create PeriodAttendanceSession for this entry
                            try:
                                PeriodAttendanceSession.objects.get_or_create(
                                    section=timetable.section,
                                    period_id=int(period_id),
                                    date=current_date,
                                    defaults={'timetable_assignment': None, 'created_by': resolved_staff}
                                )
                            except Exception as e:
                                logger.warning(f'Failed to create attendance session: {e}')
                        except Exception as e:
                            logger.error(f'Failed to create entry for {current_date} period {period_id}: {e}')
                            continue

                current_date += timedelta(days=1)

            logger.info(f'🟦 BULK SPECIAL ENTRY END: Iterated {iterate_count} days, Matched {match_count} days, Created {len(entries_created)} entries')

            return Response({
                'entries_created': len(entries_created),
                'entry_ids': entries_created,
                'message': f'Created {len(entries_created)} special period entries'
            }, status=status.HTTP_201_CREATED)

        except SpecialTimetable.DoesNotExist:
            return Response({'detail': 'Special timetable not found'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'detail': f'Invalid data: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f'Bulk special entry creation error: {e}')
            return Response({'detail': f'Error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PeriodSwapRequestView(APIView):
    """Handle period swap requests that require approval.
    
    POST /api/timetable/swap-requests/
        Create a new swap request between any two periods
        Body: { section_id, from_date, from_period_id, to_date, to_period_id, reason }
        
        Staff can request swaps for:
        - Their own period with another staff's period
        - Any two periods in a section (allows coordinators/HODs to initiate swaps)
        
        Validations:
        - Both periods must have different assigned staff
        - Cannot swap elective periods
        - Cannot swap custom subject periods
        - Cannot swap same subject with same staff
    
    GET /api/timetable/swap-requests/
        List swap requests (pending, received, or sent by the user)
        Query params: status (PENDING, APPROVED, REJECTED, CANCELLED)
    """
    permission_classes = (IsAuthenticated,)
    
    def post(self, request):
        """Create a new period swap request."""
        from academics.models import Section, StaffProfile
        import datetime
        
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        data = request.data
        section_id = data.get('section_id')
        from_date_str = data.get('from_date')
        to_date_str = data.get('to_date')
        from_period_id = data.get('from_period_id')
        to_period_id = data.get('to_period_id')
        reason = data.get('reason', '')
        
        if not all([section_id, from_date_str, to_date_str, from_period_id, to_period_id]):
            return Response({
                'error': 'section_id, from_date, to_date, from_period_id, and to_period_id are required'
            }, status=400)
        
        try:
            section = Section.objects.get(pk=int(section_id))
            from_date = datetime.date.fromisoformat(from_date_str)
            to_date = datetime.date.fromisoformat(to_date_str)
            from_period = TimetableSlot.objects.get(pk=int(from_period_id))
            to_period = TimetableSlot.objects.get(pk=int(to_period_id))
        except Exception as e:
            return Response({'error': f'Invalid data: {str(e)}'}, status=400)
        
        # Get assignments to determine the other staff
        from_day_of_week = from_date.isoweekday()
        to_day_of_week = to_date.isoweekday()
        
        # Try multiple query approaches to find assignments
        from_assigns = TimetableAssignment.objects.filter(
            section=section, period=from_period, day=from_day_of_week
        ).select_related('staff', 'staff__user', 'curriculum_row', 'subject_batch', 'subject_batch__staff', 'subject_batch__staff__user').first()
        
        to_assigns = TimetableAssignment.objects.filter(
            section=section, period=to_period, day=to_day_of_week
        ).select_related('staff', 'staff__user', 'curriculum_row', 'subject_batch', 'subject_batch__staff', 'subject_batch__staff__user').first()
        
        # If exact period lookup fails, fall back to matching by period index
        if not from_assigns:
            try:
                from_slot_index = from_period.index
                if from_slot_index is not None:
                    from_assigns = TimetableAssignment.objects.filter(
                        section=section, period__index=from_slot_index, day=from_day_of_week
                    ).select_related('staff', 'staff__user', 'curriculum_row', 'subject_batch', 'subject_batch__staff', 'subject_batch__staff__user').first()
            except Exception:
                pass
        
        if not to_assigns:
            try:
                to_slot_index = to_period.index
                if to_slot_index is not None:
                    to_assigns = TimetableAssignment.objects.filter(
                        section=section, period__index=to_slot_index, day=to_day_of_week
                    ).select_related('staff', 'staff__user', 'curriculum_row', 'subject_batch', 'subject_batch__staff', 'subject_batch__staff__user').first()
            except Exception:
                pass
        
        if not from_assigns or not to_assigns:
            return Response({'error': 'No assignments found for the selected periods'}, status=400)
        
        # Check for electives and custom subjects
        from_cr = from_assigns.curriculum_row
        to_cr = to_assigns.curriculum_row
        
        if from_cr and getattr(from_cr, 'is_elective', False):
            return Response({'error': 'Cannot swap elective periods'}, status=400)
        if to_cr and getattr(to_cr, 'is_elective', False):
            return Response({'error': 'Cannot swap elective periods'}, status=400)
        
        from_text = (from_assigns.subject_text or '').strip()
        to_text = (to_assigns.subject_text or '').strip()
        
        if not from_cr and from_text:
            return Response({'error': 'Cannot swap custom subject periods'}, status=400)
        if not to_cr and to_text:
            return Response({'error': 'Cannot swap custom subject periods'}, status=400)
        
        # RULE 1: Block swaps if subject has batches
        if from_assigns.subject_batch_id:
            from_subject_code = getattr(from_cr, 'course_code', None) or from_text or ''
            return Response({'error': f'Cannot swap batched subject ({from_subject_code}). Only common subjects can be swapped.'}, status=400)
        if to_assigns.subject_batch_id:
            to_subject_code = getattr(to_cr, 'course_code', None) or to_text or ''
            return Response({'error': f'Cannot swap batched subject ({to_subject_code}). Only common subjects can be swapped.'}, status=400)
        
        # RULE 2: Block advisor subjects (check if this is an advisor-specific assignment)
        # Advisor subjects are typically identified by the section's advisor teaching it
        try:
            from academics.models import SectionAdvisor
            section_advisor = SectionAdvisor.objects.filter(
                section=section, is_active=True, academic_year__is_active=True
            ).first()
            
            if section_advisor:
                advisor_staff = section_advisor.advisor
                # If assignment has direct staff and it's the advisor, block it
                if from_assigns.staff and from_assigns.staff.id == advisor_staff.id:
                    from_subject_code = getattr(from_cr, 'course_code', None) or from_text or ''
                    return Response({'error': f'Cannot swap advisor subject ({from_subject_code})'}, status=400)
                if to_assigns.staff and to_assigns.staff.id == advisor_staff.id:
                    to_subject_code = getattr(to_cr, 'course_code', None) or to_text or ''
                    return Response({'error': f'Cannot swap advisor subject ({to_subject_code})'}, status=400)
        except Exception:
            pass
        
        # Get staff from TeachingAssignment mapping for common subjects
        from_staff = None
        to_staff = None
        
        def get_staff_for_assignment(assigns, curriculum_row):
            """Get staff from assignment, or lookup via TeachingAssignment"""
            # First check direct assignment
            if assigns.staff:
                return assigns.staff
            
            # If no direct staff, lookup via TeachingAssignment
            if curriculum_row:
                try:
                    from academics.models import TeachingAssignment
                    ta = TeachingAssignment.objects.filter(
                        section=section,
                        curriculum_row=curriculum_row,
                        is_active=True
                    ).select_related('staff').first()
                    
                    if ta and ta.staff:
                        return ta.staff
                except Exception:
                    pass
            
            return None
        
        from_staff = get_staff_for_assignment(from_assigns, from_cr)
        to_staff = get_staff_for_assignment(to_assigns, to_cr)
        
        from_subject = getattr(from_cr, 'course_code', None) or from_text or ''
        to_subject = getattr(to_cr, 'course_code', None) or to_text or ''
        
        if not from_staff or not to_staff:
            error_detail = []
            if not from_staff:
                error_detail.append(f'From period ({from_subject}) has no staff assigned')
            if not to_staff:
                error_detail.append(f'To period ({to_subject}) has no staff assigned')
            return Response({'error': '; '.join(error_detail)}, status=400)
        
        if from_staff.id == to_staff.id:
            return Response({'error': 'Cannot swap periods that are taught by the same staff member'}, status=400)
        
        # Determine who to notify based on who the requester is
        # If requester is teaching one of the periods, notify the other staff
        # If requester is not teaching either period, notify the to_period staff by default
        if from_staff.id == staff_profile.id:
            # Requester is teaching from_period, notify to_period staff
            requested_to = to_staff
        elif to_staff.id == staff_profile.id:
            # Requester is teaching to_period, notify from_period staff
            requested_to = from_staff
        else:
            # Requester is not teaching either period (coordinator/HOD initiating swap)
            # Notify the to_period staff by default
            requested_to = to_staff
        
        # Check for existing pending request for the same swap
        existing = PeriodSwapRequest.objects.filter(
            section=section,
            from_date=from_date,
            from_period=from_period,
            to_date=to_date,
            to_period=to_period,
            status='PENDING'
        ).exists()
        
        if existing:
            return Response({'error': 'A pending swap request already exists for these periods'}, status=400)
        
        # Create the swap request
        swap_request = PeriodSwapRequest.objects.create(
            section=section,
            requested_by=staff_profile,
            requested_to=requested_to,
            from_date=from_date,
            from_period=from_period,
            from_subject_text=from_subject,
            to_date=to_date,
            to_period=to_period,
            to_subject_text=to_subject,
            reason=reason,
            status='PENDING'
        )
        
        serializer = PeriodSwapRequestSerializer(swap_request)
        return Response({
            'success': True,
            'message': f'Swap request sent to {requested_to.user.get_full_name() if requested_to.user else requested_to.staff_id}',
            'request': serializer.data
        }, status=201)
    
    def get(self, request):
        """List swap requests for the current staff."""
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        status_filter = request.query_params.get('status', '')
        
        base_qs = PeriodSwapRequest.objects.select_related(
            'section', 'requested_by', 'requested_to',
            'requested_by__user', 'requested_to__user',
            'from_period', 'to_period'
        ).order_by('-created_at')
        
        received_qs = base_qs.filter(requested_to=staff_profile)
        sent_qs = base_qs.filter(requested_by=staff_profile)
        
        if status_filter:
            received_qs = received_qs.filter(status=status_filter)
            sent_qs = sent_qs.filter(status=status_filter)
        
        return Response({
            'success': True,
            'received': PeriodSwapRequestSerializer(received_qs, many=True).data,
            'sent': PeriodSwapRequestSerializer(sent_qs, many=True).data,
        })


class PeriodSwapRequestActionView(APIView):
    """Handle approval/rejection of period swap requests.
    
    POST /api/timetable/swap-requests/<id>/approve/
        Approve a swap request and execute the swap
    
    POST /api/timetable/swap-requests/<id>/reject/
        Reject a swap request
        
    POST /api/timetable/swap-requests/<id>/cancel/
        Cancel a swap request (only by requester)
    """
    permission_classes = (IsAuthenticated,)
    
    def post(self, request, request_id, action):
        """Approve, reject, or cancel a swap request."""
        from django.utils import timezone
        
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        try:
            swap_request = PeriodSwapRequest.objects.select_related(
                'section', 'requested_by', 'requested_to', 'from_period', 'to_period'
            ).get(pk=request_id)
        except PeriodSwapRequest.DoesNotExist:
            return Response({'error': 'Swap request not found'}, status=404)
        
        if swap_request.status != 'PENDING':
            return Response({
                'error': f'This request has already been {swap_request.status.lower()}'
            }, status=400)
        
        response_message = request.data.get('message', '')
        
        if action == 'approve':
            # Only the requested_to staff can approve
            if swap_request.requested_to.id != staff_profile.id:
                raise PermissionDenied('Only the requested staff can approve this swap')
            
            # Execute the swap by creating SpecialTimetableEntry records
            try:
                from_assigns = TimetableAssignment.objects.filter(
                    section=swap_request.section,
                    period=swap_request.from_period,
                    day=swap_request.from_date.isoweekday()
                ).select_related('staff', 'curriculum_row', 'subject_batch').first()
                
                to_assigns = TimetableAssignment.objects.filter(
                    section=swap_request.section,
                    period=swap_request.to_period,
                    day=swap_request.to_date.isoweekday()
                ).select_related('staff', 'curriculum_row', 'subject_batch').first()
                
                if not from_assigns or not to_assigns:
                    return Response({'error': 'Assignments not found for swap'}, status=400)
                
                # Create special timetable entries for the swap
                swap_name_from = f'[SWAP] {swap_request.from_date.isoformat()}'
                swap_name_to = f'[SWAP] {swap_request.to_date.isoformat()}'
                
                st_from, _ = SpecialTimetable.objects.get_or_create(
                    section=swap_request.section,
                    name=swap_name_from,
                    defaults={'created_by': staff_profile, 'is_active': True}
                )
                
                if swap_request.from_date == swap_request.to_date:
                    st_to = st_from
                else:
                    st_to, _ = SpecialTimetable.objects.get_or_create(
                        section=swap_request.section,
                        name=swap_name_to,
                        defaults={'created_by': staff_profile, 'is_active': True}
                    )
                
                # Delete existing entries if any
                SpecialTimetableEntry.objects.filter(
                    timetable=st_from,
                    date=swap_request.from_date,
                    period=swap_request.from_period
                ).delete()
                
                SpecialTimetableEntry.objects.filter(
                    timetable=st_to,
                    date=swap_request.to_date,
                    period=swap_request.to_period
                ).delete()
                
                # Create the swap entries
                SpecialTimetableEntry.objects.create(
                    timetable=st_from,
                    date=swap_request.from_date,
                    period=swap_request.from_period,
                    staff=to_assigns.staff,
                    curriculum_row=to_assigns.curriculum_row,
                    subject_batch=to_assigns.subject_batch,
                    subject_text=swap_request.from_subject_text,
                    is_active=True
                )
                
                SpecialTimetableEntry.objects.create(
                    timetable=st_to,
                    date=swap_request.to_date,
                    period=swap_request.to_period,
                    staff=from_assigns.staff,
                    curriculum_row=from_assigns.curriculum_row,
                    subject_batch=from_assigns.subject_batch,
                    subject_text=swap_request.to_subject_text,
                    is_active=True
                )
                
                swap_request.status = 'APPROVED'
                swap_request.response_message = response_message
                swap_request.responded_at = timezone.now()
                swap_request.save()
                
                return Response({
                    'success': True,
                    'message': 'Swap request approved and periods swapped successfully'
                })
                
            except Exception as e:
                return Response({'error': f'Failed to execute swap: {str(e)}'}, status=500)
        
        elif action == 'reject':
            # Only the requested_to staff can reject
            if swap_request.requested_to.id != staff_profile.id:
                raise PermissionDenied('Only the requested staff can reject this swap')
            
            swap_request.status = 'REJECTED'
            swap_request.response_message = response_message
            swap_request.responded_at = timezone.now()
            swap_request.save()
            
            return Response({
                'success': True,
                'message': 'Swap request rejected'
            })
        
        elif action == 'cancel':
            # Only the requester can cancel
            if swap_request.requested_by.id != staff_profile.id:
                raise PermissionDenied('Only the requester can cancel this swap')
            
            swap_request.status = 'CANCELLED'
            swap_request.response_message = response_message
            swap_request.responded_at = timezone.now()
            swap_request.save()
            
            return Response({
                'success': True,
                'message': 'Swap request cancelled'
            })
        
        else:
            return Response({'error': 'Invalid action'}, status=400)
