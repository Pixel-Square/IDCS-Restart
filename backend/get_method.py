def get(self, request):
        user = request.user
        sp = getattr(user, 'student_profile', None)
        if sp is None:
            return Response({'detail': 'Student profile not found for user.'}, s
tatus=status.HTTP_403_FORBIDDEN)                                                
        from django.db.models import Q
        from collections import defaultdict

        section = sp.get_current_section() or getattr(sp, 'section', None)      
        semester = getattr(section, 'semester', None) if section is not None els
e None                                                                                  course = getattr(getattr(section, 'batch', None), 'course', None) if sec
tion is not None else None                                                      
        from .models import Subject
        from .models import AcademicYear, TeachingAssignment

        if semester is None:
            return Response({'student': {'id': sp.id, 'reg_no': sp.reg_no}, 'sem
ester': None, 'courses': []})                                                   
        # Subjects shown to the student should cover all courses they are enroll
ed on.                                                                                  # In practice, curriculum/elective mapping can be incomplete; the most r
eliable                                                                                 # baseline is Subject(course=student_course, semester=semester).        
        # We then UNION any curriculum/elective codes as a best-effort supplemen
t.                                                                                      subjects = Subject.objects.none()

        # Best-effort curriculum metadata for class_type/internal max
        try:
            from curriculum.models import CurriculumDepartment
        except Exception:
            CurriculumDepartment = None

        try:
            from curriculum.models import ElectiveChoice
        except Exception:
            ElectiveChoice = None

        regulation_code = None
        try:
            regulation_code = getattr(getattr(getattr(section, 'batch', None), '
regulation', None), 'code', None)                                                       except Exception:
            regulation_code = None
        if not regulation_code:
            try:
                regulation_code = str(getattr(getattr(section, 'batch', None), '
regulation', '') or '').strip() or None                                                     except Exception:
                regulation_code = None

        dept = getattr(course, 'department', None) if course is not None else No
ne                                                                              
        # Build enrolled subject code list from curriculum + elective choices wh
en possible                                                                             allowed_codes = set()
        try:
            if CurriculumDepartment is not None and dept is not None and regulat
ion_code and semester is not None:                                                              core_codes = list(
                    CurriculumDepartment.objects.filter(
                        department=dept,
                        regulation=regulation_code,
                        semester=semester,
                        is_elective=False,
                    )
                    .exclude(course_code__isnull=True)
                    .exclude(course_code='')
                    .values_list('course_code', flat=True)
                )
                allowed_codes.update([str(c).strip() for c in core_codes if c]) 

                if ElectiveChoice is not None:
                    # Prefer active academic year electives, but tolerate null a
cademic_year rows.                                                                                  try:
                        ay = AcademicYear.objects.filter(is_active=True).first()
                    except Exception:
                        ay = None

                    eqs = ElectiveChoice.objects.filter(student=sp, is_active=Tr
ue).select_related('elective_subject')                                                              if ay is not None:
                        # include choices bound to active AY OR legacy choices w
ith AY unset                                                                                            eqs = eqs.filter(models.Q(academic_year=ay) | models.Q(a
cademic_year__isnull=True))                                                     
                    elective_codes = []
                    for ch in eqs:
                        es = getattr(ch, 'elective_subject', None)
                        if not es:
                            continue
                        if dept is not None and getattr(es, 'department_id', Non
e) != getattr(dept, 'id', None):                                                                            continue
                        if regulation_code and str(getattr(es, 'regulation', '')
 or '').strip() != str(regulation_code):                                                                    continue
                        if getattr(es, 'semester_id', None) != getattr(semester,
 'id', None):                                                                                               continue
                        code = str(getattr(es, 'course_code', '') or '').strip()
                        if code:
                            elective_codes.append(code)
                    allowed_codes.update(elective_codes)
        except Exception:
            allowed_codes = set()

        base_subjects = Subject.objects.none()
        if course is not None:
            base_subjects = Subject.objects.filter(semester=semester, course=cou
rse)                                                                            
        code_subjects = Subject.objects.none()
        if allowed_codes:
            code_subjects = Subject.objects.filter(semester=semester, code__in=s
orted(list(allowed_codes)))                                                     
        # Prefer course+semester baseline; supplement with curriculum/elective c
ode matches.                                                                            subjects = (base_subjects | code_subjects).distinct().order_by('code')  

        # If we still have nothing (e.g., course not set on Subject rows), fall 
back to code-only.                                                                      if not subjects.exists() and allowed_codes:
            subjects = Subject.objects.filter(semester=semester, code__in=sorted
(list(allowed_codes))).distinct().order_by('code')                              
        curriculum_by_code = {}
        try:
            if CurriculumDepartment is not None and dept is not None and regulat
ion_code and semester is not None:                                                              rows = (
                    CurriculumDepartment.objects.filter(
                        department=dept,
                        regulation=regulation_code,
                        semester=semester,
                    )
                    .exclude(course_code__isnull=True)
                    .exclude(course_code='')
                    .only('course_code', 'course_name', 'class_type', 'internal_
mark')                                                                                          )
                curriculum_by_code = {str(getattr(r, 'course_code', '') or '').s
trip(): r for r in rows if str(getattr(r, 'course_code', '') or '').strip()}            except Exception:
            curriculum_by_code = {}

        # CQI availability: CQI is configured globally by IQAC; the UI shows a C
QI marker                                                                               # when CQI is enabled and the subject is not an AUDIT course.
        try:
            from OBE.models import ObeCqiConfig
            cqi_cfg = ObeCqiConfig.objects.first()
            cqi_globally_enabled = bool(cqi_cfg and (cqi_cfg.options or []))    
        except Exception:
            cqi_globally_enabled = False

        def _cycle_key_to_int(v):
            s = str(v or '').strip().lower()
            if not s:
                return None
            # tolerate: "1", "cycle 1", "cycle i", "i", "ii"
            if 'ii' in s or s == '2' or 'cycle 2' in s or 'cycle ii' in s:      
                return 2
            if '1' in s or s == 'i' or 'cycle 1' in s or 'cycle i' in s:        
                return 1
            return None

        def _internal_maxes_from_mapping(mapping_dict):
            if not isinstance(mapping_dict, dict):
                return (None, None, None)
            weights = mapping_dict.get('weights')
            cycles = mapping_dict.get('cycles')
            if not isinstance(weights, list):
                return (None, None, None)

            w_list = []
            for x in weights:
                try:
                    w_list.append(float(x))
                except Exception:
                    w_list.append(0.0)
            total = sum(w_list) if w_list else None

            if not isinstance(cycles, list) or len(cycles) != len(w_list):      
                return (total, None, None)

            c1 = 0.0
            c2 = 0.0
            any_cycle = False
            for i, w in enumerate(w_list):
                ck = _cycle_key_to_int(cycles[i])
                if ck == 1:
                    c1 += w
                    any_cycle = True
                elif ck == 2:
                    c2 += w
                    any_cycle = True

            if not any_cycle:
                return (total, None, None)

            return (total, c1 or None, c2 or None)

        def _num(v):
            try:
                if v is None:
                    return None
                return float(v)
            except Exception:
                return None

        def _clamp(n, lo, hi):
            try:
                return max(lo, min(hi, n))
            except Exception:
                return n

        def _to_float_or_none(v):
            if v is None:
                return None
            if v == '':
                return None
            try:
                n = float(v)
                return n
            except Exception:
                return None

        def _extract_lab_total_for_student(data, student_id):
            if not data or not isinstance(data, dict):
                return None
            sheet = data.get('sheet') if isinstance(data, dict) else None       
            if not sheet or not isinstance(sheet, dict):
                return None
            rows = sheet.get('rowsByStudentId')
            if not rows or not isinstance(rows, dict):
                return None
            sid = str(student_id)
            row = rows.get(sid) or rows.get(student_id)
            if not row or not isinstance(row, dict):
                return None

            cia_exam = _to_float_or_none(row.get('ciaExam'))
            if cia_exam is not None:
                return _clamp(cia_exam, 0.0, 100.0)

            total = 0.0
            has_any = False
            all_arrays = []
            if isinstance(row.get('marksA'), list):
                all_arrays.append(row.get('marksA'))
            if isinstance(row.get('marksB'), list):
                all_arrays.append(row.get('marksB'))
            marks_by_co = row.get('marksByCo')
            if isinstance(marks_by_co, dict):
                for arr in marks_by_co.values():
                    if isinstance(arr, list):
                        all_arrays.append(arr)

            for arr in all_arrays:
                for v in arr:
                    n = _to_float_or_none(v)
                    if n is not None:
                        total += n
                        has_any = True

            for field in ('caaExamByCo', 'ciaExamByCo'):
                byco = row.get(field)
                if isinstance(byco, dict):
                    for v in byco.values():
                        n = _to_float_or_none(v)
                        if n is not None:
                            total += n
                            has_any = True

            if not has_any:
                return None
            return _clamp(float(round(total)), 0.0, 100.0)

        def _extract_model_total_for_student(data, student_id):
            if not data or not isinstance(data, dict):
                return None
            sid = str(student_id)

            # Preferred structure (as used in frontend result analysis): { marks
: { [sid]: { q1: n, ... } } }                                                               marks = data.get('marks')
            if isinstance(marks, dict):
                qmarks = marks.get(sid) or marks.get(student_id)
                if isinstance(qmarks, dict):
                    total = 0.0
                    has_any = False
                    for v in qmarks.values():
                        n = _to_float_or_none(v)
                        if n is not None:
                            total += n
                            has_any = True
                    return total if has_any else None

            # Fallback: tolerate a lab-style shape (rowsByStudentId) if deployed
 that way                                                                                   return _extract_lab_total_for_student(data, student_id)

        # Resolve candidate teaching assignments for the student's current secti
on                                                                                      # (used to scope published sheets / CQI rows).
        ta_ids_by_code = defaultdict(list)
        try:
            ay_active = AcademicYear.objects.filter(is_active=True).first() or A
cademicYear.objects.order_by('-id').first()                                             except Exception:
            ay_active = None

        try:
            if ay_active is not None and section is not None:
                tas_qs = (
                    TeachingAssignment.objects.filter(is_active=True, academic_y
ear=ay_active)                                                                                      .filter(Q(section=section) | Q(section__isnull=True))       
                    .select_related('subject', 'curriculum_row', 'elective_subje
ct')                                                                                            )
                for ta in tas_qs:
                    tcode = None
                    try:
                        if getattr(ta, 'subject_id', None):
                            tcode = getattr(getattr(ta, 'subject', None), 'code'
, None)                                                                                                 if not tcode and getattr(ta, 'curriculum_row_id', None):
                            tcode = getattr(getattr(ta, 'curriculum_row', None),
 'course_code', None)                                                                                   if not tcode and getattr(ta, 'elective_subject_id', None
):                                                                                                          tcode = getattr(getattr(ta, 'elective_subject', None
), 'course_code', None)                                                                             except Exception:
                        tcode = None
                    tcode = str(tcode or '').strip()
                    if tcode:
                        ta_ids_by_code[tcode].append(getattr(ta, 'id', None))   
        except Exception:
            ta_ids_by_code = defaultdict(list)

        try:
            from OBE.models import LabPublishedSheet, ModelPublishedSheet, ObeCq
iPublished                                                                              except Exception:
            LabPublishedSheet = None
            ModelPublishedSheet = None
            ObeCqiPublished = None

        # Build final enrolled code list:
        # - curriculum rows (core)
        # - elective choices
        # - any Subject rows resolved for the student
        codes_set = set()
        for c in (allowed_codes or []):
            cc = str(c or '').strip()
            if cc:
                codes_set.add(cc)
        for cc in (curriculum_by_code or {}).keys():
            if cc:
                codes_set.add(cc)
        for s in subjects:
            sc = str(getattr(s, 'code', '') or '').strip()
            if sc:
                codes_set.add(sc)

        # Map code -> Subject (prefer course-specific Subject when available)   
        subject_by_code = {}
        try:
            if codes_set:
                cand = Subject.objects.filter(semester=semester, code__in=sorted
(list(codes_set)))                                                                              if course is not None:
                    cand = cand.filter(Q(course=course) | Q(course__isnull=True)
)                                                                               
                if course is not None:
                    for s in cand.filter(course=course):
                        k = str(getattr(s, 'code', '') or '').strip()
                        if k and k not in subject_by_code:
                            subject_by_code[k] = s

                for s in cand:
                    k = str(getattr(s, 'code', '') or '').strip()
                    if k and k not in subject_by_code:
                        subject_by_code[k] = s
        except Exception:
            subject_by_code = {}

        out_courses = []
        for code in sorted(list(codes_set)):
            subj = subject_by_code.get(code)
            # curriculum row metadata (class_type, internal max)
            class_type = None
            internal_max_total = None
            try:
                row = curriculum_by_code.get(code)
                if row is not None:
                    class_type = getattr(row, 'class_type', None)
                    im = getattr(row, 'internal_mark', None)
                    if im is not None:
                        try:
                            internal_max_total = float(im)
                        except Exception:
                            internal_max_total = None
            except Exception:
                row = None

            display_name = None
            try:
                display_name = getattr(subj, 'name', None) if subj is not None e
lse None                                                                                    except Exception:
                display_name = None
            if not display_name:
                try:
                    display_name = getattr(row, 'course_name', None) if row is n
ot None else None                                                                               except Exception:
                    display_name = None
            if not display_name:
                display_name = code

            cia1 = cia2 = ssa1 = ssa2 = rev1 = rev2 = f1 = f2 = None
            try:
                cia1 = Cia1Mark.objects.filter(subject=subj, student=sp).first()
 if subj is not None else None                                                              except Exception:
                cia1 = None
            try:
                cia2 = Cia2Mark.objects.filter(subject=subj, student=sp).first()
 if subj is not None else None                                                              except Exception:
                cia2 = None
            try:
                ssa1 = Ssa1Mark.objects.filter(subject=subj, student=sp).first()
 if subj is not None else None                                                              except Exception:
                ssa1 = None
            try:
                ssa2 = Ssa2Mark.objects.filter(subject=subj, student=sp).first()
 if subj is not None else None                                                              except Exception:
                ssa2 = None
            try:
                rev1 = Review1Mark.objects.filter(subject=subj, student=sp).firs
t() if subj is not None else None                                                           except Exception:
                rev1 = None
            try:
                rev2 = Review2Mark.objects.filter(subject=subj, student=sp).firs
t() if subj is not None else None                                                           except Exception:
                rev2 = None
            try:
                f1 = Formative1Mark.objects.filter(subject=subj, student=sp).fir
st() if subj is not None else None                                                          except Exception:
                f1 = None
            try:
                f2 = Formative2Mark.objects.filter(subject=subj, student=sp).fir
st() if subj is not None else None                                                          except Exception:
                f2 = None

            # internal mapping (may be None)
            try:
                if subj is not None:
                    imm = InternalMarkMapping.objects.filter(subject=subj).first
()                                                                                                  mapping = imm.mapping if imm else None
                else:
                    mapping = None
            except Exception:
                mapping = None

            map_total, map_c1, map_c2 = _internal_maxes_from_mapping(mapping)   
            if internal_max_total is None:
                internal_max_total = map_total
            internal_max_cycle1 = map_c1
            internal_max_cycle2 = map_c2
            if internal_max_total is not None and (internal_max_cycle1 is None a
nd internal_max_cycle2 is None):                                                                # fallback split when only a total is known
                internal_max_cycle1 = internal_max_total / 2.0
                internal_max_cycle2 = internal_max_total / 2.0

            marks_vals = {
                'cia1': _num(getattr(cia1, 'mark', None)),
                'cia2': _num(getattr(cia2, 'mark', None)),
                'ssa1': _num(getattr(ssa1, 'mark', None)),
                'ssa2': _num(getattr(ssa2, 'mark', None)),
                'review1': _num(getattr(rev1, 'mark', None)),
                'review2': _num(getattr(rev2, 'mark', None)),
                'formative1': _num(getattr(f1, 'total', None)),
                'formative2': _num(getattr(f2, 'total', None)),
                'model': None,
            }

            # Backfill missing totals from published sheets when the publish flo
w                                                                                           # does not upsert into the per-student totals tables (notably LAB/TC
PL).                                                                                        ta_ids = [x for x in (ta_ids_by_code.get(code) or []) if x]
            if subj is not None and LabPublishedSheet is not None:
                try:
                    for assessment, key in (
                        ('cia1', 'cia1'),
                        ('cia2', 'cia2'),
                        ('formative1', 'formative1'),
                        ('formative2', 'formative2'),
                        ('review1', 'review1'),
                        ('review2', 'review2'),
                        ('model', 'model'),
                    ):
                        if marks_vals.get(key) is not None:
                            continue
                        qs = LabPublishedSheet.objects.filter(subject=subj, asse
ssment=assessment)                                                                                      if ta_ids:
                            qs = qs.filter(Q(teaching_assignment_id__in=ta_ids) 
| Q(teaching_assignment__isnull=True))                                                                  else:
                            qs = qs.filter(Q(teaching_assignment__isnull=True)) 
                        row = qs.order_by('-updated_at').only('data', 'updated_a
t').first()                                                                                             if row:
                            v = _extract_lab_total_for_student(getattr(row, 'dat
a', None), sp.id)                                                                                           if v is not None:
                                marks_vals[key] = float(v)
                except Exception:
                    pass

            if subj is not None and marks_vals.get('model') is None and ModelPub
lishedSheet is not None:                                                                        try:
                    qs = ModelPublishedSheet.objects.filter(subject=subj)       
                    if ta_ids:
                        qs = qs.filter(Q(teaching_assignment_id__in=ta_ids) | Q(
teaching_assignment__isnull=True))                                                                  else:
                        qs = qs.filter(Q(teaching_assignment__isnull=True))     
                    row = qs.order_by('-updated_at').only('data', 'updated_at').
first()                                                                                             if row:
                        v = _extract_model_total_for_student(getattr(row, 'data'
, None), sp.id)                                                                                         if v is not None:
                            marks_vals['model'] = float(v)
                except Exception:
                    pass

            # best-effort internal marks: sum available internal-like components
            internal_components = [
                marks_vals.get('formative1'),
                marks_vals.get('formative2'),
                marks_vals.get('ssa1'),
                marks_vals.get('ssa2'),
                marks_vals.get('review1'),
                marks_vals.get('review2'),
            ]
            internal_components = [x for x in internal_components if x is not No
ne]                                                                                         internal_computed = sum(internal_components) if internal_components 
else None                                                                       
            internal_cycle1_components = [
                marks_vals.get('formative1'),
                marks_vals.get('ssa1'),
                marks_vals.get('review1'),
            ]
            internal_cycle1_components = [x for x in internal_cycle1_components 
if x is not None]                                                                           internal_cycle1 = sum(internal_cycle1_components) if internal_cycle1
_components else None                                                           
            internal_cycle2_components = [
                marks_vals.get('formative2'),
                marks_vals.get('ssa2'),
                marks_vals.get('review2'),
            ]
            internal_cycle2_components = [x for x in internal_cycle2_components 
if x is not None]                                                                           internal_cycle2 = sum(internal_cycle2_components) if internal_cycle2
_components else None                                                           
            ct_norm = str(class_type or '').upper()
            # In this codebase, class_type values include THEORY/LAB/TCPR/TCPL/P
RACTICAL/PROJECT/SPECIAL.                                                                   # CQI is configured globally by IQAC; show it for all academic class
 types except AUDIT.                                                                        has_cqi = bool(cqi_globally_enabled and ct_norm != 'AUDIT')

            # CIA max defaults (no authoritative config in DB yet)
            cia_max = 30.0

            # Optional CO attainment values when CQI is published.
            cos = None
            if subj is not None and ObeCqiPublished is not None:
                try:
                    qs = ObeCqiPublished.objects.filter(subject=subj)
                    if ta_ids:
                        qs = qs.filter(teaching_assignment_id__in=ta_ids)       
                    row = qs.order_by('-published_at').only('entries', 'publishe
d_at').first()                                                                                      if row and isinstance(getattr(row, 'entries', None), dict): 
                        ent = row.entries.get(str(sp.id)) or row.entries.get(sp.
id)                                                                                                     if isinstance(ent, dict):
                            cos = {str(k): _num(v) for k, v in ent.items()}     
                except Exception:
                    cos = None

            out_courses.append(
                {
                    'id': getattr(subj, 'id', None),
                    'code': code,
                    'name': display_name,
                    'class_type': ct_norm or None,
                    'marks': {
                        'cia1': marks_vals.get('cia1'),
                        'cia2': marks_vals.get('cia2'),
                        'cia_max': cia_max,
                        'ssa1': marks_vals.get('ssa1'),
                        'ssa2': marks_vals.get('ssa2'),
                        'review1': marks_vals.get('review1'),
                        'review2': marks_vals.get('review2'),
                        'formative1': marks_vals.get('formative1'),
                        'formative2': marks_vals.get('formative2'),
                        'model': marks_vals.get('model'),
                        'internal': {
                            'computed': internal_computed,
                            'cycle1': internal_cycle1,
                            'cycle2': internal_cycle2,
                            'max_total': internal_max_total,
                            'max_cycle1': internal_max_cycle1,
                            'max_cycle2': internal_max_cycle2,
                            'mapping': mapping,
                        },
                        'has_cqi': has_cqi,
                        **({'cos': cos} if cos is not None else {}),
                    },
                }
            )

        resp = {
            'student': {
                'id': sp.id,
                'reg_no': sp.reg_no,
                'name': getattr(getattr(sp, 'user', None), 'username', None),   
            },
            'semester': {'id': getattr(semester, 'id', None), 'number': getattr(
semester, 'number', None)},                                                                 'courses': out_courses,
        }

        return Response(resp)
