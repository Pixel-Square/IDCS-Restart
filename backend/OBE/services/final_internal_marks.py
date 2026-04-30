from django.db.models import Q
from decimal import Decimal, ROUND_HALF_UP


DEFAULT_INTERNAL_MAPPING_WEIGHTS = [
    1.5, 3.0, 2.5,
    1.5, 3.0, 2.5,
    1.5, 3.0, 2.5,
    1.5, 3.0, 2.5,
    2.0, 2.0, 2.0, 2.0, 4.0,
]

THRESHOLD_PERCENT = 58.0
CQI_BELOW_RATE = 0.6
CQI_ABOVE_RATE = 0.15
QP1FINAL_WEIGHTS = [2.0, 4.0, 3.0, 1.0, 2.0, 2.0, 1.0, 2.0, 2.0, 2.0, 4.0, 3.0, 4.0, 4.0, 4.0]


def _safe_text(value):
    return str(value or '').strip()


def _normalize_qp_type_key(value):
    qp = _safe_text(value).upper().replace(' ', '')
    return qp if qp in {'QP1', 'QP2', 'CSD'} else None


def _safe_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _round2(value):
    return float(Decimal(str(float(value or 0))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def _clamp(n, min_v, max_v):
    try:
        x = float(n)
    except Exception:
        return None
    return max(float(min_v), min(float(max_v), x))


def _safe_int(value):
    try:
        return int(value)
    except Exception:
        return None


def _parse_co12(raw):
    s = str(raw or '').strip().upper()
    if s in {'1&2', '1,2', '1/2', '2/1', 'BOTH', 'CO1&CO2', 'CO1,CO2'}:
        return '1&2'
    if s in {'2', 'CO2'}:
        return 2
    return 1


def _parse_co34(raw):
    s = str(raw or '').strip().upper()
    if s in {'3&4', '3,4', '3/4', '4/3', 'BOTH', 'CO3&CO4', 'CO3,CO4'}:
        return '3&4'
    # Legacy CIA2 configs sometimes contain 1/2 labels.
    if s in {'1&2', '1,2', '1/2', '2/1', 'CO1&CO2', 'CO1,CO2'}:
        return '3&4'
    if s in {'4', 'CO4', '2', 'CO2'}:
        return 4
    return 3


def _parse_question_co_numbers(raw):
    if isinstance(raw, list):
        out = []
        for x in raw:
            n = _safe_int(x)
            if n is not None:
                out.append(n)
                continue
            s = str(x or '').upper()
            if s.startswith('CO'):
                n2 = _safe_int(s[2:])
                if n2 is not None:
                    out.append(n2)
        return out

    if isinstance(raw, (int, float)):
        n = _safe_int(raw)
        return [n] if n is not None else []

    s = str(raw or '').strip().upper()
    if not s:
        return []
    if '&' in s or ',' in s or '/' in s:
        parts = s.replace('CO', '').replace('&', ',').replace('/', ',').split(',')
        out = []
        for p in parts:
            n = _safe_int(p)
            if n is not None:
                out.append(n)
        return out
    if s.startswith('CO'):
        n = _safe_int(s[2:])
        return [n] if n is not None else []
    n = _safe_int(s)
    return [n] if n is not None else []


def _qp1_final_question_weight(question_co_raw, target_co_num, offset=0):
    co_nums = [n + int(offset or 0) for n in _parse_question_co_numbers(question_co_raw)]
    if len(co_nums) == 1 and co_nums[0] == target_co_num:
        return 1.0
    if len(co_nums) > 1 and target_co_num in co_nums:
        return 1.0 / float(len(co_nums))
    return 0.0


def _co_weights_12(co):
    if co == '1&2':
        return (0.5, 0.5)
    if co == 2:
        return (0.0, 1.0)
    return (1.0, 0.0)


def _co_weights_34(co):
    if co == '3&4':
        return (0.5, 0.5)
    if co == 4:
        return (0.0, 1.0)
    return (1.0, 0.0)


def _resolve_class_type(ta):
    ct = _safe_text(getattr(getattr(ta, 'curriculum_row', None), 'class_type', ''))
    if not ct:
        ct = _safe_text(getattr(getattr(ta, 'elective_subject', None), 'class_type', ''))
    if not ct:
        ct = 'THEORY'
    return ct.upper()


def _resolve_qp_type(ta):
    qp = _safe_text(getattr(getattr(ta, 'curriculum_row', None), 'question_paper_type', ''))
    if not qp:
        qp = _safe_text(getattr(getattr(ta, 'elective_subject', None), 'question_paper_type', ''))
    if not qp:
        code = _safe_text(getattr(getattr(ta, 'subject', None), 'code', ''))
        if not code:
            code = _safe_text(getattr(getattr(ta, 'curriculum_row', None), 'course_code', ''))
        if not code:
            code = _safe_text(getattr(getattr(ta, 'elective_subject', None), 'course_code', ''))
        if code:
            try:
                from curriculum.models import CurriculumDepartment, CurriculumMaster, ElectiveSubject

                row = (
                    CurriculumDepartment.objects.filter(course_code__iexact=code)
                    .exclude(question_paper_type__isnull=True)
                    .exclude(question_paper_type__exact='')
                    .order_by('-updated_at', '-id')
                    .first()
                )
                if row is not None:
                    qp = _safe_text(getattr(row, 'question_paper_type', ''))
                    if not qp:
                        qp = _safe_text(getattr(getattr(row, 'master', None), 'qp_type', ''))

                if not qp:
                    es = (
                        ElectiveSubject.objects.filter(course_code__iexact=code)
                        .order_by('-updated_at', '-id')
                        .first()
                    )
                    if es is not None:
                        qp = _safe_text(getattr(es, 'question_paper_type', ''))
                        if not qp:
                            qp = _safe_text(getattr(getattr(es, 'parent', None), 'question_paper_type', ''))
                        if not qp:
                            qp = _safe_text(getattr(getattr(getattr(es, 'parent', None), 'master', None), 'qp_type', ''))

                if not qp:
                    master = (
                        CurriculumMaster.objects.filter(course_code__iexact=code)
                        .exclude(qp_type__isnull=True)
                        .exclude(qp_type__exact='')
                        .order_by('-updated_at', '-id')
                        .first()
                    )
                    if master is not None:
                        qp = _safe_text(getattr(master, 'qp_type', ''))
            except Exception:
                pass
    return _normalize_qp_type_key(qp)


def _pick_scoped_row(rows, ta_id):
    exact = None
    legacy = None
    for r in rows:
        rid = getattr(r, 'teaching_assignment_id', None)
        if rid == ta_id and exact is None:
            exact = r
        if rid is None and legacy is None:
            legacy = r
    return exact or legacy or (rows[0] if rows else None)


def _get_qp_pattern(*, class_type, qp_type, exam, batch_id=None):
    from OBE.models import ObeBatchQpPatternOverride, ObeQpPatternConfig

    cls = _safe_text(class_type).upper() or 'THEORY'
    qp_for_db = _normalize_qp_type_key(qp_type) if cls in ('THEORY', 'SPECIAL') else None
    ex = _safe_text(exam).upper()

    try:
        if batch_id:
            row = ObeBatchQpPatternOverride.objects.filter(
                batch_id=batch_id,
                class_type=cls,
                question_paper_type=qp_for_db,
                exam=ex,
            ).first()
            if row and isinstance(getattr(row, 'pattern', None), dict):
                return row.pattern
    except Exception:
        pass

    row = ObeQpPatternConfig.objects.filter(
        class_type=cls,
        question_paper_type=qp_for_db,
        exam=ex,
    ).first()
    if row is None and ex in {'CIA1', 'CIA2'}:
        row = ObeQpPatternConfig.objects.filter(
            class_type=cls,
            question_paper_type=qp_for_db,
            exam='CIA',
        ).first()
    return row.pattern if row and isinstance(getattr(row, 'pattern', None), dict) else None


def _get_internal_weight_slots(class_type):
    from OBE.models import ClassTypeWeights

    ct = _safe_text(class_type).upper() or 'THEORY'
    row = ClassTypeWeights.objects.filter(class_type=ct).first()
    arr = getattr(row, 'internal_mark_weights', None) if row is not None else None
    if not isinstance(arr, list) or not arr:
        arr = list(DEFAULT_INTERNAL_MAPPING_WEIGHTS)
    vals = []
    for x in arr[:17]:
        vals.append(float(x or 0))
    while len(vals) < 17:
        vals.append(float(DEFAULT_INTERNAL_MAPPING_WEIGHTS[len(vals)] if len(vals) < len(DEFAULT_INTERNAL_MAPPING_WEIGHTS) else 0.0))
    return vals


def _get_special_exam_weights():
    """Return the structured exam-weights dict for SPECIAL, or None.

    When the IQAC controller stores SPECIAL weights as::

        {"type": "special_exam_weights",
         "weights": {"SSA1": 10, "SSA2": 10, "CIA1": 5, "CIA2": 5, "MODEL": 10}}

    this helper extracts and returns the inner ``weights`` dict.
    """
    from OBE.models import ClassTypeWeights

    row = ClassTypeWeights.objects.filter(class_type='SPECIAL').first()
    im = getattr(row, 'internal_mark_weights', None) if row else None
    if isinstance(im, dict) and im.get('type') == 'special_exam_weights':
        w = im.get('weights')
        if isinstance(w, dict) and w:
            return w
    return None


def _compute_special_final_total(*, ta, subject, student, ta_id, return_details=False):
    """Compute Final Internal Mark for SPECIAL class-type using the per-exam
    weight structure (SSA1, SSA2, CIA1, CIA2, MODEL) instead of the 17-slot
    Theory schema.

    Returns the same dict/float format as
    ``_compute_weighted_final_total_theory_like`` so both callers
    (``recompute_final_internal_marks`` and the export view) work unchanged.
    """
    from OBE.models import (
        Ssa1Mark, Ssa2Mark,
        ObeCqiPublished,
    )

    exam_weights = _get_special_exam_weights()
    if not exam_weights:
        return None              # fall through to 17-slot theory path

    sid = int(student['id'])
    reg_no = _safe_text(student.get('reg_no', ''))
    # SPECIAL patterns are stored with question_paper_type=NULL in DB,
    # so always use qp_type=None regardless of what the TA resolves to.
    qp_type = None
    batch_id = getattr(getattr(ta, 'section', None), 'batch_id', None)
    class_type = 'SPECIAL'

    w_ssa1 = float(exam_weights.get('SSA1', 0))
    w_ssa2 = float(exam_weights.get('SSA2', 0))
    w_cia1 = float(exam_weights.get('CIA1', 0))
    w_cia2 = float(exam_weights.get('CIA2', 0))
    w_model = float(exam_weights.get('MODEL', 0))
    max_total = w_ssa1 + w_ssa2 + w_cia1 + w_cia2 + w_model   # 40

    if max_total <= 0:
        return None

    # ── SSA raw marks ──
    ssa1_map = _assessment_map(Ssa1Mark, 'mark', subject.id, [sid], ta_id)
    ssa2_map = _assessment_map(Ssa2Mark, 'mark', subject.id, [sid], ta_id)
    ssa1_total = _safe_float(ssa1_map.get(sid))
    ssa2_total = _safe_float(ssa2_map.get(sid))

    ssa1_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='SSA1', batch_id=batch_id)
    ssa2_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='SSA2', batch_id=batch_id)
    ssa1_max = sum(float(m) for m in (ssa1_pattern.get('marks') or [])) if ssa1_pattern else 10.0
    ssa2_max = sum(float(m) for m in (ssa2_pattern.get('marks') or [])) if ssa2_pattern else 10.0
    ssa1_max = ssa1_max or 10.0
    ssa2_max = ssa2_max or 10.0

    # COs for each SSA (from QP config) – guard against None patterns
    ssa1_cos = sorted(set(int(c) for c in ((ssa1_pattern or {}).get('cos') or [3]) if _safe_int(c) is not None))
    ssa2_cos = sorted(set(int(c) for c in ((ssa2_pattern or {}).get('cos') or [3]) if _safe_int(c) is not None))
    if not ssa1_cos:
        ssa1_cos = [3]
    if not ssa2_cos:
        ssa2_cos = [3]

    # ── CIA sheet data ──
    cia1_sheet = _get_cia_sheet_data(subject.id, ta_id, 'cia1')
    cia2_sheet = _get_cia_sheet_data(subject.id, ta_id, 'cia2')
    cia1_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA1', batch_id=batch_id)
    cia2_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA2', batch_id=batch_id)

    def _build_questions(sheet, pattern):
        qs = sheet.get('questions') if isinstance(sheet.get('questions'), list) else []
        p_marks = pattern.get('marks') if isinstance(pattern, dict) and isinstance(pattern.get('marks'), list) else []
        p_cos = pattern.get('cos') if isinstance(pattern, dict) and isinstance(pattern.get('cos'), list) else []
        out = []
        count = max(len(qs), len(p_marks))
        for i in range(count):
            q = qs[i] if i < len(qs) and isinstance(qs[i], dict) else {}
            key = _safe_text(q.get('key')) or f'q{i + 1}'
            mx = _safe_float(p_marks[i] if i < len(p_marks) else q.get('max'))
            if mx is None:
                mx = _safe_float(q.get('maxMarks'))
            if mx is None:
                mx = 0.0
            co_raw = p_cos[i] if i < len(p_cos) else q.get('co')
            co_nums = _parse_question_co_numbers(co_raw) or [1]
            out.append({'key': key, 'max': float(mx), 'cos': [max(1, min(5, c)) for c in co_nums]})
        return out

    cia1_questions = _build_questions(cia1_sheet, cia1_pattern)
    cia2_questions = _build_questions(cia2_sheet, cia2_pattern)

    cia1_rows_map = cia1_sheet.get('rowsByStudentId') if isinstance(cia1_sheet.get('rowsByStudentId'), dict) else {}
    cia2_rows_map = cia2_sheet.get('rowsByStudentId') if isinstance(cia2_sheet.get('rowsByStudentId'), dict) else {}
    cia1_row = cia1_rows_map.get(str(sid)) or cia1_rows_map.get(sid) or {}
    cia2_row = cia2_rows_map.get(str(sid)) or cia2_rows_map.get(sid) or {}

    def _cia_per_co(row, questions):
        """Return {co_num: (raw_mark, max_mark, has_data)}."""
        if not isinstance(row, dict) or bool(row.get('absent')):
            return {}
        qvals = row.get('q') if isinstance(row.get('q'), dict) else {}
        co_data = {}
        for q in questions:
            mx = float(q.get('max') or 0)
            n = _safe_float(qvals.get(q.get('key')))
            split = 1.0 / len(q['cos']) if q['cos'] else 1.0
            for co in q['cos']:
                if co not in co_data:
                    co_data[co] = [0.0, 0.0, False]
                co_data[co][1] += mx * split
                if n is not None:
                    co_data[co][0] += _clamp(n, 0, mx) * split
                    co_data[co][2] = True
        return co_data

    cia1_co_data = _cia_per_co(cia1_row, cia1_questions)
    cia2_co_data = _cia_per_co(cia2_row, cia2_questions)

    # ── Model marks (already returns per-CO with max) ──
    model_sheet = _get_model_sheet_data(subject.id, ta_id, class_type)
    model_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='MODEL', batch_id=batch_id)
    model_marks = _extract_model_co_marks_for_student(
        model_sheet=model_sheet, student_id=sid, reg_no=reg_no, model_pattern=model_pattern,
    )

    # ── Scale helper ──
    def _scale(mark, max_mark, out_of):
        if mark is None or max_mark is None:
            return None
        if not max_mark or not out_of:
            return None
        return _clamp((float(mark) / float(max_mark)) * float(out_of), 0, float(out_of))

    # ── Per-CO aggregation ──
    # Each exam's weight is split equally among the exam's unique COs.
    # Then each CO portion is: (raw_co / max_co) * per_co_weight
    co_weighted = {c: [] for c in range(1, 6)}
    co_max_w   = {c: 0.0 for c in range(1, 6)}

    # SSA1
    n_ssa1_cos = len(ssa1_cos)
    w_per_ssa1 = w_ssa1 / n_ssa1_cos if n_ssa1_cos else 0
    for co in ssa1_cos:
        co_max_w[co] += w_per_ssa1
        v = _scale(ssa1_total, ssa1_max, w_per_ssa1) if ssa1_total is not None else None
        if v is not None:
            co_weighted[co].append(v)

    # SSA2
    n_ssa2_cos = len(ssa2_cos)
    w_per_ssa2 = w_ssa2 / n_ssa2_cos if n_ssa2_cos else 0
    for co in ssa2_cos:
        co_max_w[co] += w_per_ssa2
        v = _scale(ssa2_total, ssa2_max, w_per_ssa2) if ssa2_total is not None else None
        if v is not None:
            co_weighted[co].append(v)

    # CIA1
    cia1_unique_cos = sorted(set(co for q in cia1_questions for co in q['cos']))
    w_per_cia1 = w_cia1 / len(cia1_unique_cos) if cia1_unique_cos else 0
    for co in cia1_unique_cos:
        co_max_w[co] += w_per_cia1
        d = cia1_co_data.get(co)
        if d and d[2]:
            v = _scale(d[0], d[1], w_per_cia1)
            if v is not None:
                co_weighted[co].append(v)

    # CIA2
    cia2_unique_cos = sorted(set(co for q in cia2_questions for co in q['cos']))
    w_per_cia2 = w_cia2 / len(cia2_unique_cos) if cia2_unique_cos else 0
    for co in cia2_unique_cos:
        co_max_w[co] += w_per_cia2
        d = cia2_co_data.get(co)
        if d and d[2]:
            v = _scale(d[0], d[1], w_per_cia2)
            if v is not None:
                co_weighted[co].append(v)

    # MODEL
    if model_marks:
        model_cos = sorted(set(
            int(c) for c in ((model_pattern or {}).get('cos') or []) if _safe_int(c) is not None
        ))
        if not model_cos:
            model_cos = sorted(int(k[2:]) for k in model_marks if k.startswith('co') and k != 'max' and _safe_float(model_marks.get('max', {}).get(k)))
        n_model_cos = len(model_cos) if model_cos else 1
        w_per_model = w_model / n_model_cos if n_model_cos else 0
        for co in model_cos:
            co_key = f'co{co}'
            raw = _safe_float(model_marks.get(co_key))
            mx = _safe_float((model_marks.get('max') or {}).get(co_key))
            co_max_w[co] += w_per_model
            v = _scale(raw, mx, w_per_model)
            if v is not None:
                co_weighted[co].append(v)

    # ── Totals ──
    co_values = {}
    all_parts = []
    for co in range(1, 6):
        vals = co_weighted[co]
        if vals:
            s = _round2(sum(vals))
            co_values[co] = s
            all_parts.extend(vals)
        else:
            co_values[co] = None

    if not all_parts:
        return None

    base_total = _round2(sum(all_parts))
    co_max = {c: co_max_w[c] for c in range(1, 6)}

    # ── CQI ──
    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries if cqi_row and isinstance(getattr(cqi_row, 'entries', None), dict) else {}
    cqi_nums = cqi_row.co_numbers if cqi_row and isinstance(getattr(cqi_row, 'co_numbers', None), list) else []
    cqi_co_set = {int(n) for n in cqi_nums if _safe_int(n) is not None}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}

    total_add = 0.0
    cqi_add_by_co = {}
    for co in range(1, 6):
        if co not in cqi_co_set:
            continue
        base = co_values.get(co)
        if base is None:
            continue
        inp = _safe_float((cqi_student or {}).get(f'co{co}'))
        add = _compute_cqi_add(co_value=base, co_max=co_max.get(co), input_mark=inp)
        total_add += add
        cqi_add_by_co[co] = _round2(add)

    total = _round2(base_total + total_add)
    if max_total > 0:
        original_pct = (base_total / max_total) * 100.0
        if original_pct < THRESHOLD_PERCENT:
            total_cap = _round2((max_total * THRESHOLD_PERCENT) / 100.0)
            total = min(total, total_cap)

    total = _clamp(total, 0.0, max_total)
    final_total = _round2(total)

    if not return_details:
        return final_total

    final_co_values = {}
    for co in range(1, 6):
        base = co_values.get(co)
        if base is None:
            final_co_values[co] = None
            continue
        add = cqi_add_by_co.get(co, 0.0)
        v = _round2(float(base) + float(add))
        mx = _safe_float(co_max.get(co))
        if mx is not None and mx > 0:
            v = _clamp(v, 0.0, mx)
        final_co_values[co] = _round2(v)

    _raw_100 = (final_total / max_total) * 100.0 if max_total > 0 else None
    _total_100 = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100 = (base_total / max_total) * 100.0 if max_total > 0 else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None

    return {
        'total_40': final_total,
        'total_100': _total_100,
        'base_total_100': _base_total_100,
        'scaled_max': 100.0,
        'base_total_40': _round2(base_total),
        'base_co_values_40': {
            'co1': _safe_float(co_values.get(1)),
            'co2': _safe_float(co_values.get(2)),
            'co3': _safe_float(co_values.get(3)),
            'co4': _safe_float(co_values.get(4)),
            'co5': _safe_float(co_values.get(5)),
        },
        'co_values_40': {
            'co1': final_co_values.get(1),
            'co2': final_co_values.get(2),
            'co3': final_co_values.get(3),
            'co4': final_co_values.get(4),
            'co5': final_co_values.get(5),
        },
        'co_max_40': {
            'co1': _safe_float(co_max.get(1)),
            'co2': _safe_float(co_max.get(2)),
            'co3': _safe_float(co_max.get(3)),
            'co4': _safe_float(co_max.get(4)),
            'co5': _safe_float(co_max.get(5)),
        },
        'cqi_add_40': {
            'co1': _safe_float(cqi_add_by_co.get(1)),
            'co2': _safe_float(cqi_add_by_co.get(2)),
            'co3': _safe_float(cqi_add_by_co.get(3)),
            'co4': _safe_float(cqi_add_by_co.get(4)),
            'co5': _safe_float(cqi_add_by_co.get(5)),
        },
        'is_qp1_final': False,
        'class_type': 'SPECIAL',
        'qp_type': qp_type,
    }


def _get_prbl_exam_weights():
    """Return the structured exam-weights dict for PRBL, or None.

    When the IQAC controller stores PRBL weights as::

        {"type": "project_prbl",
         "ssa1": {"weight": 3, "max": 20},
         "review1": {"weight": 12, "max": 50},
         "ssa2": {"weight": 3, "max": 20},
         "review2": {"weight": 12, "max": 50},
         "model": {"weight": 30, "max": 100}}

    this helper returns that dict so callers can use ``d['ssa1']['weight']``, etc.
    """
    from OBE.models import ClassTypeWeights

    row = ClassTypeWeights.objects.filter(class_type='PRBL').first()
    im = getattr(row, 'internal_mark_weights', None) if row else None
    if isinstance(im, dict) and im.get('type') == 'project_prbl':
        return im
    return None


def _compute_prbl_final_total(*, ta, subject, student, ta_id, return_details=False):
    """Compute Final Internal Mark for PRBL class-type.

    Structure (all CO1 only):
      Cycle 1: SSA1 (raw/max → weight) + Review1 (raw/max → weight)
      Cycle 2: SSA2 (raw/max → weight) + Review2 (raw/max → weight)
      Cycle 3: Review3/Model (raw/max → weight)
    Grand total = 60.  Displayed as /100 via the standard 60→100 scaling already
    present in the Internal Mark page.

    CQI is applied to CO1.
    """
    from OBE.models import (
        Ssa1Mark, Ssa2Mark,
        LabPublishedSheet, AssessmentDraft,
        ObeCqiPublished,
    )

    exam_weights = _get_prbl_exam_weights()
    if not exam_weights:
        return None  # fall through to raw-sum fallback

    def _w(key, sub):
        return float((exam_weights.get(key) or {}).get(sub) or 0)

    w_ssa1     = _w('ssa1', 'weight')
    max_ssa1   = _w('ssa1', 'max') or 20.0
    w_review1  = _w('review1', 'weight')
    max_review1 = _w('review1', 'max') or 50.0
    w_ssa2     = _w('ssa2', 'weight')
    max_ssa2   = _w('ssa2', 'max') or 20.0
    w_review2  = _w('review2', 'weight')
    max_review2 = _w('review2', 'max') or 50.0
    w_model    = _w('model', 'weight')
    max_model  = _w('model', 'max') or 100.0

    max_total = w_ssa1 + w_review1 + w_ssa2 + w_review2 + w_model  # should = 60
    if max_total <= 0:
        return None

    sid = int(student['id'])
    reg_no = _safe_text(student.get('reg_no', ''))

    def _scale(raw, out_of, weight):
        if raw is None or not out_of or not weight:
            return None
        return _clamp((float(raw) / float(out_of)) * float(weight), 0, float(weight))

    def _get_prbl_lab_total(assessment_key, student_id):
        """Read a PRBL Review/Model total from draft (if newer) or LabPublishedSheet."""
        # Draft (preferred when newer than published or published is absent)
        draft_rows = list(
            AssessmentDraft.objects.filter(subject_id=subject.id, assessment=assessment_key)
            .order_by('-updated_at')
        )
        draft_row = _pick_scoped_row(draft_rows, ta_id)
        draft_data = draft_row.data if draft_row and isinstance(getattr(draft_row, 'data', None), dict) else None
        draft_updated = getattr(draft_row, 'updated_at', None) if draft_row else None
        draft_is_ta_scoped = draft_row is not None and getattr(draft_row, 'teaching_assignment_id', None) == ta_id

        # LabPublishedSheet (the persistent published copy)
        pub_rows = list(
            LabPublishedSheet.objects.filter(subject_id=subject.id, assessment=assessment_key)
            .order_by('-updated_at')
        )
        pub_row = _pick_scoped_row(pub_rows, ta_id)
        pub_data = pub_row.data if pub_row and isinstance(getattr(pub_row, 'data', None), dict) else None
        pub_updated = getattr(pub_row, 'updated_at', None) if pub_row else None
        pub_is_ta_scoped = pub_row is not None and getattr(pub_row, 'teaching_assignment_id', None) == ta_id

        use_draft = False
        if isinstance(draft_data, dict):
            if pub_data is None:
                use_draft = True
            elif draft_is_ta_scoped and not pub_is_ta_scoped:
                use_draft = True
            elif draft_updated and pub_updated and draft_updated > pub_updated:
                use_draft = True

        data = draft_data if use_draft else pub_data
        if not isinstance(data, dict):
            return None
        return _extract_model_total_for_student(data, student_id)

    # ── Raw marks ──
    ssa1_map = _assessment_map(Ssa1Mark, 'mark', subject.id, [sid], ta_id)
    ssa2_map = _assessment_map(Ssa2Mark, 'mark', subject.id, [sid], ta_id)

    ssa1_raw    = _safe_float(ssa1_map.get(sid))
    ssa2_raw    = _safe_float(ssa2_map.get(sid))

    # Review1/Review2/Model for PRBL are stored via LabEntry → LabPublishedSheet/AssessmentDraft
    review1_raw = _get_prbl_lab_total('review1', sid)
    review2_raw = _get_prbl_lab_total('review2', sid)

    # ── Model / Review 3 ──
    model_total_raw = _get_prbl_lab_total('model', sid)

    # ── Scale each component to its weight ──
    s_ssa1    = _scale(ssa1_raw,    max_ssa1,    w_ssa1)
    s_review1 = _scale(review1_raw, max_review1, w_review1)
    s_ssa2    = _scale(ssa2_raw,    max_ssa2,    w_ssa2)
    s_review2 = _scale(review2_raw, max_review2, w_review2)
    s_model   = _scale(model_total_raw, max_model, w_model)

    parts = [v for v in (s_ssa1, s_review1, s_ssa2, s_review2, s_model) if v is not None]
    if not parts:
        return None

    # All components map to CO1 (single CO for PRBL)
    co1_base = _round2(sum(parts))
    co1_max  = sum(
        w for w, raw in (
            (w_ssa1, ssa1_raw), (w_review1, review1_raw),
            (w_ssa2, ssa2_raw), (w_review2, review2_raw),
            (w_model, model_total_raw),
        )
        if raw is not None
    )

    base_total = co1_base

    # ── CQI (single CO1) ──
    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries if cqi_row and isinstance(getattr(cqi_row, 'entries', None), dict) else {}
    cqi_nums    = cqi_row.co_numbers if cqi_row and isinstance(getattr(cqi_row, 'co_numbers', None), list) else []
    cqi_co_set  = {int(n) for n in cqi_nums if _safe_int(n) is not None}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}

    cqi_add_co1 = 0.0
    if 1 in cqi_co_set and co1_max > 0:
        inp = _safe_float((cqi_student or {}).get('co1'))
        cqi_add_co1 = _compute_cqi_add(co_value=co1_base, co_max=co1_max, input_mark=inp)

    total = _round2(base_total + cqi_add_co1)

    # Apply THRESHOLD cap
    if max_total > 0:
        original_pct = (base_total / max_total) * 100.0
        if original_pct < THRESHOLD_PERCENT:
            total_cap = _round2((max_total * THRESHOLD_PERCENT) / 100.0)
            total = min(total, total_cap)

    total = _clamp(total, 0.0, max_total)
    final_total = _round2(total)

    if not return_details:
        return final_total

    co1_final = _round2(float(co1_base) + float(cqi_add_co1))
    if co1_max > 0:
        co1_final = _clamp(co1_final, 0.0, co1_max)

    _raw_100 = (final_total / max_total) * 100.0 if max_total > 0 else None
    _total_100 = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100 = (base_total / max_total) * 100.0 if max_total > 0 else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None

    return {
        'total_40': final_total,        # actually /60, named for API compat
        'total_100': _total_100,
        'base_total_100': _base_total_100,
        'scaled_max': 100.0,
        'base_total_40': _round2(base_total),
        'base_co_values_40': {'co1': _safe_float(co1_base), 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'co_values_40':      {'co1': _round2(co1_final), 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'co_max_40':         {'co1': _safe_float(co1_max), 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'cqi_add_40':        {'co1': _round2(cqi_add_co1), 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'is_qp1_final': False,
        'class_type': 'PRBL',
        'qp_type': None,
    }


# ─── ENGLISH Class-type Support ──────────────────────────────────────────────

ENGLISH_DEFAULT_WEIGHTS = {
    'type': 'english_exam_weights',
    # Cycle 1
    'ssa1': {'max': 20, 'weight': 3.0,  'cos': [1, 2]},
    'fa1':  {'max': 20, 'weight': 5.0,  'cos': [1, 2]},
    'cia1': {'max': 60, 'weight': 6.0},           # split equally across 5 COs → 1.2 each
    # Cycle 2
    'ssa2': {'max': 20, 'weight': 3.0,  'cos': [3, 4]},
    'fa2':  {'max': 20, 'weight': 5.0,  'cos': [3, 4]},
    'cia2': {'max': 60, 'weight': 6.0},           # split equally across 5 COs → 1.2 each
    # Cycle 3 (Model) – per-CO weights sum to 12; grand total reaches 40
    'model': {
        'max_per_co': 20,
        'co_weights': [2.4, 2.4, 2.4, 2.4, 2.4],  # CO1-CO5
    },
}
# Verify grand total: 3+5+6 + 3+5+6 + (2.4*5) = 28 + 12 = 40 ✓

def _get_english_exam_weights():
    """Return english_exam_weights dict from ClassTypeWeights, or the built-in
    default.  Never returns None so callers always get a usable config.
    """
    from OBE.models import ClassTypeWeights

    row = ClassTypeWeights.objects.filter(class_type='ENGLISH').first()
    im = getattr(row, 'internal_mark_weights', None) if row else None
    if isinstance(im, dict) and im.get('type') == 'english_exam_weights':
        return im
    return ENGLISH_DEFAULT_WEIGHTS


def _extract_cia_total_for_student(sheet, sid):
    """Extract a student's total CIA mark from a Cia1/Cia2PublishedSheet data dict.

    Returns float total or None if no data.
    """
    rows_map = sheet.get('rowsByStudentId') if isinstance(sheet, dict) and isinstance(sheet.get('rowsByStudentId'), dict) else {}
    row = rows_map.get(str(sid)) or rows_map.get(sid) or {}
    if not isinstance(row, dict) or bool(row.get('absent')):
        return None
    # Prefer pre-computed total field
    total = _safe_float(row.get('total'))
    if total is not None:
        return total
    # Fallback: sum question marks from the 'q' dict
    qvals = row.get('q') if isinstance(row.get('q'), dict) else {}
    if qvals:
        parts = [_safe_float(v) for v in qvals.values() if _safe_float(v) is not None]
        if parts:
            return round(sum(parts), 2)
    return None


def _compute_english_final_total(*, ta, subject, student, ta_id, return_details=False, _weight_cfg=None, _class_type='ENGLISH'):
    """Compute Final Internal Mark for ENGLISH class-type.

    Three-cycle structure (all marks map to CO1–CO5):

    Cycle 1: SSA1 (CO1+CO2) + FA1 (CO1+CO2) + CIA1 (CO1–CO5 equal)
    Cycle 2: SSA2 (CO3+CO4) + FA2 (CO3+CO4) + CIA2 (CO1–CO5 equal)
    Cycle 3: Model  (CO1–CO5 per-column, each 20 marks)

    Grand total = 40.
    Displayed as /100 via the standard 40→100 scaling on the Internal Mark page.
    """
    from OBE.models import (
        Ssa1Mark, Ssa2Mark,
        Formative1Mark, Formative2Mark,
        ModelPublishedSheet,
        ObeCqiPublished,
    )

    cfg = _weight_cfg if _weight_cfg is not None else _get_english_exam_weights()

    def _wcfg(key):
        return cfg.get(key) or {}

    # ── Cycle 1 config ──
    max_ssa1   = float(_wcfg('ssa1').get('max',   20))
    w_ssa1     = float(_wcfg('ssa1').get('weight', 3.0))
    ssa1_cos   = list(_wcfg('ssa1').get('cos', [1, 2]))

    max_fa1    = float(_wcfg('fa1').get('max',   20))
    w_fa1      = float(_wcfg('fa1').get('weight', 5.0))
    fa1_cos    = list(_wcfg('fa1').get('cos', [1, 2]))

    max_cia1   = float(_wcfg('cia1').get('max',   60))
    w_cia1     = float(_wcfg('cia1').get('weight', 6.0))

    # ── Cycle 2 config ──
    max_ssa2   = float(_wcfg('ssa2').get('max',   20))
    w_ssa2     = float(_wcfg('ssa2').get('weight', 3.0))
    ssa2_cos   = list(_wcfg('ssa2').get('cos', [3, 4]))

    max_fa2    = float(_wcfg('fa2').get('max',   20))
    w_fa2      = float(_wcfg('fa2').get('weight', 5.0))
    fa2_cos    = list(_wcfg('fa2').get('cos', [3, 4]))

    max_cia2   = float(_wcfg('cia2').get('max',   60))
    w_cia2     = float(_wcfg('cia2').get('weight', 6.0))

    # ── Cycle 3 (Model) config ──
    model_cfg       = _wcfg('model')
    max_per_co      = float(model_cfg.get('max_per_co', 20))
    co_weights_list = model_cfg.get('co_weights', [2.4, 2.4, 2.4, 2.4, 2.4])
    model_co_w      = {
        co + 1: float(co_weights_list[co]) if co < len(co_weights_list) else 0.0
        for co in range(5)
    }

    # Fixed theoretical max (60) for THRESHOLD comparison
    max_total = w_ssa1 + w_fa1 + w_cia1 + w_ssa2 + w_fa2 + w_cia2 + sum(model_co_w.values())

    sid    = int(student['id'])
    reg_no = _safe_text(student.get('reg_no', ''))

    def _scale(raw, out_of, weight):
        if raw is None or not out_of or not weight:
            return None
        return _clamp((float(raw) / float(out_of)) * float(weight), 0.0, float(weight))

    # ── Raw marks ──
    ssa1_raw = _safe_float(_assessment_map(Ssa1Mark,       'mark',  subject.id, [sid], ta_id).get(sid))
    ssa2_raw = _safe_float(_assessment_map(Ssa2Mark,       'mark',  subject.id, [sid], ta_id).get(sid))
    fa1_raw  = _safe_float(_assessment_map(Formative1Mark, 'total', subject.id, [sid], ta_id).get(sid))
    fa2_raw  = _safe_float(_assessment_map(Formative2Mark, 'total', subject.id, [sid], ta_id).get(sid))

    # ── CIA totals ──
    cia1_raw = _extract_cia_total_for_student(_get_cia_sheet_data(subject.id, ta_id, 'cia1'), sid)
    cia2_raw = _extract_cia_total_for_student(_get_cia_sheet_data(subject.id, ta_id, 'cia2'), sid)

    # ── Model per-CO ──
    batch_id     = getattr(getattr(ta, 'section', None), 'batch_id', None)
    qp_type_en   = _resolve_qp_type(ta)   # e.g. 'ELECTIVE1' or None
    model_patt   = _get_qp_pattern(class_type=_class_type, qp_type=qp_type_en, exam='MODEL', batch_id=batch_id)
    if not model_patt:
        # Built-in default: 5 columns, one per CO, 20 marks each
        model_patt = {'marks': [20, 20, 20, 20, 20], 'cos': [1, 2, 3, 4, 5]}
    model_sheet    = _get_model_sheet_data(subject.id, ta_id, _class_type)
    model_co_marks = _extract_model_co_marks_for_student(
        model_sheet=model_sheet, student_id=sid, reg_no=reg_no, model_pattern=model_patt,
    )
    model_co_max = {}
    if isinstance(model_co_marks, dict):
        _mx = model_co_marks.get('max')
        if isinstance(_mx, dict):
            for co in range(1, 6):
                model_co_max[co] = _safe_float(_mx.get(f'co{co}'))

    # ── Per-CO accumulation ──
    # co_parts[co] = list of scaled values that have data
    # co_max_w[co] = sum of weights for components where this student has data (used for CQI)
    co_parts = {c: [] for c in range(1, 6)}
    co_max_w  = {c: 0.0 for c in range(1, 6)}
    N_CIA_COS = 5   # CIA always splits equally across CO1–CO5

    # SSA1 → equal split across ssa1_cos
    if ssa1_cos:
        w_per = w_ssa1 / len(ssa1_cos)
        for co in ssa1_cos:
            co_max_w[co] += w_per
            v = _scale(ssa1_raw, max_ssa1, w_per)
            if v is not None:
                co_parts[co].append(v)

    # FA1 → equal split across fa1_cos
    if fa1_cos:
        w_per = w_fa1 / len(fa1_cos)
        for co in fa1_cos:
            co_max_w[co] += w_per
            v = _scale(fa1_raw, max_fa1, w_per)
            if v is not None:
                co_parts[co].append(v)

    # CIA1 → equally across CO1–CO5
    w_per_cia = w_cia1 / N_CIA_COS
    for co in range(1, N_CIA_COS + 1):
        co_max_w[co] += w_per_cia
        v = _scale(cia1_raw, max_cia1, w_per_cia)
        if v is not None:
            co_parts[co].append(v)

    # SSA2 → equal split across ssa2_cos
    if ssa2_cos:
        w_per = w_ssa2 / len(ssa2_cos)
        for co in ssa2_cos:
            co_max_w[co] += w_per
            v = _scale(ssa2_raw, max_ssa2, w_per)
            if v is not None:
                co_parts[co].append(v)

    # FA2 → equal split across fa2_cos
    if fa2_cos:
        w_per = w_fa2 / len(fa2_cos)
        for co in fa2_cos:
            co_max_w[co] += w_per
            v = _scale(fa2_raw, max_fa2, w_per)
            if v is not None:
                co_parts[co].append(v)

    # CIA2 → equally across CO1–CO5
    w_per_cia = w_cia2 / N_CIA_COS
    for co in range(1, N_CIA_COS + 1):
        co_max_w[co] += w_per_cia
        v = _scale(cia2_raw, max_cia2, w_per_cia)
        if v is not None:
            co_parts[co].append(v)

    # Model → per-CO individual entry
    if model_co_marks:
        for co in range(1, 6):
            w_co = model_co_w.get(co, 0.0)
            if not w_co:
                continue
            co_max_w[co] += w_co
            raw = _safe_float(model_co_marks.get(f'co{co}'))
            if raw is not None:
                out_of = model_co_max.get(co)
                if out_of is None or out_of <= 0:
                    out_of = max_per_co
                v = _scale(raw, out_of, w_co)
                if v is not None:
                    co_parts[co].append(v)

    # ── Aggregate ──
    co_values = {}
    all_parts = []
    for co in range(1, 6):
        if co_parts[co]:
            s = _round2(sum(co_parts[co]))
            co_values[co] = s
            all_parts.extend(co_parts[co])
        else:
            co_values[co] = None

    if not all_parts:
        return None

    base_total = _round2(sum(all_parts))
    co_max = co_max_w   # per-CO max (only present components)

    # ── CQI ──
    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row     = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries    if cqi_row and isinstance(getattr(cqi_row, 'entries',    None), dict) else {}
    cqi_nums    = cqi_row.co_numbers if cqi_row and isinstance(getattr(cqi_row, 'co_numbers', None), list) else []
    cqi_co_set  = {int(n) for n in cqi_nums if _safe_int(n) is not None}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}

    total_add    = 0.0
    cqi_add_by_co = {}
    for co in range(1, 6):
        if co not in cqi_co_set:
            continue
        base = co_values.get(co)
        if base is None:
            continue
        inp = _safe_float((cqi_student or {}).get(f'co{co}'))
        add = _compute_cqi_add(co_value=base, co_max=co_max.get(co), input_mark=inp)
        total_add += add
        cqi_add_by_co[co] = _round2(add)

    total = _round2(base_total + total_add)

    # THRESHOLD cap (vs theoretical 60)
    if max_total > 0:
        original_pct = (base_total / max_total) * 100.0
        if original_pct < THRESHOLD_PERCENT:
            total_cap = _round2((max_total * THRESHOLD_PERCENT) / 100.0)
            total = min(total, total_cap)

    total       = _clamp(total, 0.0, max_total)
    final_total = _round2(total)

    if not return_details:
        return final_total

    final_co_values = {}
    for co in range(1, 6):
        base = co_values.get(co)
        if base is None:
            final_co_values[co] = None
            continue
        add  = cqi_add_by_co.get(co, 0.0)
        v    = _round2(float(base) + float(add))
        mx   = _safe_float(co_max.get(co))
        if mx is not None and mx > 0:
            v = _clamp(v, 0.0, mx)
        final_co_values[co] = _round2(v)

    _raw_100       = (final_total / max_total) * 100.0 if max_total > 0 else None
    _total_100     = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100  = (base_total / max_total) * 100.0 if max_total > 0 else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None

    return {
        'total_40':       final_total,          # actually /60, named for API compat
        'total_100':      _total_100,
        'base_total_100': _base_total_100,
        'scaled_max':     100.0,
        'base_total_40':  _round2(base_total),
        'base_co_values_40': {
            'co1': _safe_float(co_values.get(1)),
            'co2': _safe_float(co_values.get(2)),
            'co3': _safe_float(co_values.get(3)),
            'co4': _safe_float(co_values.get(4)),
            'co5': _safe_float(co_values.get(5)),
        },
        'co_values_40': {
            'co1': final_co_values.get(1),
            'co2': final_co_values.get(2),
            'co3': final_co_values.get(3),
            'co4': final_co_values.get(4),
            'co5': final_co_values.get(5),
        },
        'co_max_40': {
            'co1': _safe_float(co_max.get(1)),
            'co2': _safe_float(co_max.get(2)),
            'co3': _safe_float(co_max.get(3)),
            'co4': _safe_float(co_max.get(4)),
            'co5': _safe_float(co_max.get(5)),
        },
        'cqi_add_40': {
            'co1': _safe_float(cqi_add_by_co.get(1)),
            'co2': _safe_float(cqi_add_by_co.get(2)),
            'co3': _safe_float(cqi_add_by_co.get(3)),
            'co4': _safe_float(cqi_add_by_co.get(4)),
            'co5': _safe_float(cqi_add_by_co.get(5)),
        },
        'is_qp1_final': False,
        'class_type':   _class_type,
        'qp_type':      None,
    }


# ─── FOREIGN_LANG Class-type Support ─────────────────────────────────────────
# Foreign Language courses share the same 3-cycle structure as ENGLISH but
# use a separate class-type key so their QP patterns and weights are independent.

FOREIGN_LANG_DEFAULT_WEIGHTS = {
    **{k: v for k, v in ENGLISH_DEFAULT_WEIGHTS.items() if k != 'type'},
    'type': 'foreign_lang_exam_weights',
}


def _get_foreign_lang_exam_weights():
    """Return foreign_lang_exam_weights dict from ClassTypeWeights, or the
    built-in default.  Never returns None so callers always get a usable config.
    """
    from OBE.models import ClassTypeWeights

    row = ClassTypeWeights.objects.filter(class_type='FOREIGN_LANG').first()
    im = getattr(row, 'internal_mark_weights', None) if row else None
    if isinstance(im, dict) and im.get('type') == 'foreign_lang_exam_weights':
        return im
    return FOREIGN_LANG_DEFAULT_WEIGHTS


def _compute_foreign_lang_final_total(*, ta, subject, student, ta_id, return_details=False):
    """Compute Final Internal Mark for FOREIGN_LANG class-type.

    Shares the same 3-cycle computation as ENGLISH (SSA1+FA1+CIA1 /
    SSA2+FA2+CIA2 / Model) but resolves weights and QP patterns under
    class_type='FOREIGN_LANG'.
    """
    return _compute_english_final_total(
        ta=ta,
        subject=subject,
        student=student,
        ta_id=ta_id,
        return_details=return_details,
        _weight_cfg=_get_foreign_lang_exam_weights(),
        _class_type='FOREIGN_LANG',
    )


def _extract_ssa_co_splits_for_ta(subject_id, ta_id, assessment_key, co_keys):
    from OBE.models import AssessmentDraft

    rows = list(
        AssessmentDraft.objects.filter(subject_id=subject_id, assessment=assessment_key)
        .order_by('-updated_at')
    )
    draft = _pick_scoped_row(rows, ta_id)
    out = {}
    if not draft or not isinstance(getattr(draft, 'data', None), dict):
        return out
    sheet = draft.data.get('sheet') if isinstance(draft.data.get('sheet'), dict) else draft.data
    rows_list = sheet.get('rows') if isinstance(sheet, dict) else None
    if not isinstance(rows_list, list):
        return out

    for row in rows_list:
        if not isinstance(row, dict):
            continue
        sid = _safe_int(row.get('studentId'))
        if sid is None:
            continue
        entry = {}
        all_present = True
        for ck in co_keys:
            n = _safe_float(row.get(ck))
            if n is None:
                all_present = False
                break
            entry[ck] = n
        if all_present and entry:
            out[int(sid)] = entry
    return out


def _extract_tcpr_review_co_splits_for_ta(subject_id, ta_id, assessment_key, co_keys):
    from OBE.models import AssessmentDraft
    rows = list(
        AssessmentDraft.objects.filter(subject_id=subject_id, assessment=assessment_key)
        .order_by('-updated_at')
    )
    draft = _pick_scoped_row(rows, ta_id)
    out = {}
    if not draft or not isinstance(getattr(draft, 'data', None), dict):
        return out
    sheet = draft.data.get('sheet') if isinstance(draft.data.get('sheet'), dict) else draft.data
    rows_list = sheet.get('rows') if isinstance(sheet, dict) else draft.data.get('rows') if isinstance(draft.data, dict) else None
    if not isinstance(rows_list, list):
        return out

    for row in rows_list:
        if not isinstance(row, dict):
            continue
        sid = _safe_int(row.get('studentId'))
        if sid is None:
            continue
        entry = {}
        for ck in co_keys:
            raw_co_marks = (row.get('reviewCoMarks') or {}).get(ck) if isinstance(row.get('reviewCoMarks'), dict) else None
            if isinstance(raw_co_marks, list):
                total = 0.0
                for v in raw_co_marks:
                    parsed = _safe_float(v)
                    if parsed is not None:
                        total += parsed
                entry[ck] = total
            else:
                n = _safe_float(row.get(ck))
                if n is not None:
                    entry[ck] = n
        if entry:
            out[int(sid)] = entry
    return out


def _get_cia_sheet_data(subject_id, ta_id, which):
    from OBE.models import Cia1PublishedSheet, Cia2PublishedSheet, AssessmentDraft

    pub_model = Cia1PublishedSheet if which == 'cia1' else Cia2PublishedSheet
    pub_rows = list(pub_model.objects.filter(subject_id=subject_id).order_by('-updated_at'))
    pub_row = _pick_scoped_row(pub_rows, ta_id)
    pub_data = pub_row.data if pub_row and isinstance(getattr(pub_row, 'data', None), dict) else None
    pub_updated = getattr(pub_row, 'updated_at', None) if pub_row else None
    pub_is_ta_scoped = pub_row is not None and getattr(pub_row, 'teaching_assignment_id', None) == ta_id

    draft_rows = list(
        AssessmentDraft.objects.filter(subject_id=subject_id, assessment=which)
        .order_by('-updated_at')
    )
    draft_row = _pick_scoped_row(draft_rows, ta_id)
    draft_data = None
    draft_updated = None
    draft_is_ta_scoped = False
    if draft_row and isinstance(getattr(draft_row, 'data', None), dict):
        raw = draft_row.data
        inner = raw.get('data') if isinstance(raw.get('data'), dict) else None
        draft_data = inner if inner is not None else raw
        draft_updated = getattr(draft_row, 'updated_at', None)
        draft_is_ta_scoped = getattr(draft_row, 'teaching_assignment_id', None) == ta_id

    if isinstance(draft_data, dict):
        if pub_data is None:
            return draft_data
        if draft_is_ta_scoped and not pub_is_ta_scoped:
            return draft_data
        if draft_updated and pub_updated and draft_updated > pub_updated:
            return draft_data

    return pub_data if isinstance(pub_data, dict) else {}


def _get_model_sheet_data(subject_id, ta_id, class_type):
    from OBE.models import ModelPublishedSheet, AssessmentDraft

    pub_rows = list(ModelPublishedSheet.objects.filter(subject_id=subject_id).order_by('-updated_at'))
    pub_row = _pick_scoped_row(pub_rows, ta_id)
    pub_raw = pub_row.data if pub_row and isinstance(getattr(pub_row, 'data', None), dict) else None
    pub_updated = getattr(pub_row, 'updated_at', None) if pub_row else None
    pub_is_ta_scoped = pub_row is not None and getattr(pub_row, 'teaching_assignment_id', None) == ta_id

    draft_rows = list(
        AssessmentDraft.objects.filter(subject_id=subject_id, assessment='model')
        .order_by('-updated_at')
    )
    draft_row = _pick_scoped_row(draft_rows, ta_id)
    draft_raw = None
    draft_updated = None
    draft_is_ta_scoped = False
    if draft_row and isinstance(getattr(draft_row, 'data', None), dict):
        raw = draft_row.data
        inner = raw.get('data') if isinstance(raw.get('data'), dict) else None
        draft_raw = inner if inner is not None else raw
        draft_updated = getattr(draft_row, 'updated_at', None)
        draft_is_ta_scoped = getattr(draft_row, 'teaching_assignment_id', None) == ta_id

    use_draft = False
    if isinstance(draft_raw, dict):
        if pub_raw is None:
            use_draft = True
        elif draft_is_ta_scoped and not pub_is_ta_scoped:
            use_draft = True
        elif draft_updated and pub_updated and draft_updated > pub_updated:
            use_draft = True

    data = draft_raw if use_draft else pub_raw
    if not isinstance(data, dict):
        return {}

    payload = data.get('sheet') if isinstance(data.get('sheet'), dict) else data
    if not isinstance(payload, dict):
        return {}

    ct = _safe_text(class_type).upper()
    if ct in {'TCPL', 'TCPR'}:
        sheet = payload.get('tcplSheet')
        return sheet if isinstance(sheet, dict) else {}
    sheet = payload.get('theorySheet')
    return sheet if isinstance(sheet, dict) else (payload if isinstance(payload, dict) else {})


def _extract_model_co_marks_for_student(*, model_sheet, student_id, reg_no, model_pattern):
    if not isinstance(model_sheet, dict):
        return None

    row = model_sheet.get(f'id:{student_id}')
    if row is None and reg_no:
        row = model_sheet.get(f'reg:{reg_no}')
    if not isinstance(row, dict):
        return None

    q = row.get('q') if isinstance(row.get('q'), dict) else row
    if not isinstance(q, dict):
        q = {}

    pattern = model_pattern if isinstance(model_pattern, dict) else {}
    marks = pattern.get('marks') if isinstance(pattern.get('marks'), list) else []
    cos = pattern.get('cos') if isinstance(pattern.get('cos'), list) else []

    if not marks:
        # Standard theory MODEL defaults.
        marks = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 14, 14, 14, 14, 14, 10]
    if not cos or len(cos) != len(marks):
        cos = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5, 5][: len(marks)]
        if len(cos) < len(marks):
            cos += [1] * (len(marks) - len(cos))

    max_by_co = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0}
    sum_by_co = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0}
    has_any = False

    for i, mx in enumerate(marks):
        key = f'q{i + 1}'
        m = float(mx or 0)
        co_raw = cos[i]
        parsed_cos = _parse_question_co_numbers(co_raw) or [1]
        valid_cos = [max(1, min(5, co)) for co in parsed_cos]
        
        split_m = m / len(valid_cos)
        for co in valid_cos:
            max_by_co[co] += split_m

        n = _safe_float(q.get(key))
        if n is None:
            continue
        has_any = True
        split_n = _clamp(n, 0, m) / len(valid_cos)
        for co in valid_cos:
            sum_by_co[co] += split_n

    if not has_any:
        return None

    return {
        'co1': _clamp(sum_by_co[1], 0, max_by_co[1]),
        'co2': _clamp(sum_by_co[2], 0, max_by_co[2]),
        'co3': _clamp(sum_by_co[3], 0, max_by_co[3]),
        'co4': _clamp(sum_by_co[4], 0, max_by_co[4]),
        'co5': _clamp(sum_by_co[5], 0, max_by_co[5]),
        'max': {
            'co1': max_by_co[1],
            'co2': max_by_co[2],
            'co3': max_by_co[3],
            'co4': max_by_co[4],
            'co5': max_by_co[5],
        },
    }


def _compute_cqi_add(*, co_value, co_max, input_mark):
    if input_mark is None or co_value is None or not co_max:
        return 0.0
    inp = _safe_float(input_mark)
    if inp is None or inp <= 0:
        return 0.0

    pct = (float(co_value) / float(co_max)) * 100.0
    if pct < THRESHOLD_PERCENT:
        raw_add = inp * CQI_BELOW_RATE
        cap = (float(co_max) * THRESHOLD_PERCENT) / 100.0
        max_allowed = max(0.0, cap - float(co_value))
        return max(0.0, min(raw_add, max_allowed))
    return max(0.0, inp * CQI_ABOVE_RATE)


def _compute_weighted_final_total_theory_like(*, ta, subject, student, ta_id, return_details=False):
    from OBE.models import (
        Formative1Mark,
        Formative2Mark,
        ObeCqiPublished,
    )

    class_type = _resolve_class_type(ta)
    # THEORY_PMBL is structurally identical to THEORY (same 17-slot weighted path)
    if class_type not in {'THEORY', 'SPECIAL', 'THEORY_PMBL'}:
        return None

    # SPECIAL with structured per-exam weights → dedicated computation path
    if class_type == 'SPECIAL':
        result = _compute_special_final_total(
            ta=ta, subject=subject, student=student, ta_id=ta_id,
            return_details=return_details,
        )
        if result is not None:
            return result
        # If _compute_special_final_total returned None (no structured weights
        # configured yet), fall through to the legacy 17-slot Theory path.

    sid = int(student['id'])
    reg_no = _safe_text(student.get('reg_no', ''))
    qp_type = _resolve_qp_type(ta)
    batch_id = getattr(getattr(ta, 'section', None), 'batch_id', None)

    is_qp1_final = 'QP1FINAL' in str(qp_type or '').upper().replace(' ', '')
    weights = list(QP1FINAL_WEIGHTS) if is_qp1_final else _get_internal_weight_slots(class_type)
    max_total = float(sum(weights))

    # Slot map (17-slot schema). QP1FINAL uses first 15 with a special meaning.
    w_co1_ssa, w_co1_cia, w_co1_fa = weights[0], weights[1], weights[2]
    w_co2_ssa, w_co2_cia, w_co2_fa = weights[3], weights[4], weights[5]
    w_co3_ssa, w_co3_cia, w_co3_fa = weights[6], weights[7], weights[8]
    w_co4_ssa, w_co4_cia, w_co4_fa = weights[9], weights[10], weights[11]
    w_me1, w_me2, w_me3 = weights[12], weights[13], weights[14]
    w_me4 = weights[15] if len(weights) > 15 else 0.0
    w_me5 = weights[16] if len(weights) > 16 else 0.0

    ssa1_map = _assessment_map(__import__('OBE.models', fromlist=['Ssa1Mark']).Ssa1Mark, 'mark', subject.id, [sid], ta_id)
    ssa2_map = _assessment_map(__import__('OBE.models', fromlist=['Ssa2Mark']).Ssa2Mark, 'mark', subject.id, [sid], ta_id)

    ssa1_total = ssa1_map.get(sid)
    ssa2_total = ssa2_map.get(sid)

    ssa1_splits = _extract_ssa_co_splits_for_ta(subject.id, ta_id, 'ssa1', ['co1', 'co2']).get(sid, {})
    ssa2_splits = _extract_ssa_co_splits_for_ta(subject.id, ta_id, 'ssa2', ['co3', 'co4']).get(sid, {})

    ssa1_co1 = _safe_float(ssa1_splits.get('co1'))
    ssa1_co2 = _safe_float(ssa1_splits.get('co2'))
    if ssa1_co1 is None and ssa1_total is not None:
        ssa1_co1 = _safe_float(ssa1_total) / 2.0
    if ssa1_co2 is None and ssa1_total is not None:
        ssa1_co2 = _safe_float(ssa1_total) / 2.0

    ssa2_co3 = _safe_float(ssa2_splits.get('co3'))
    ssa2_co4 = _safe_float(ssa2_splits.get('co4'))
    if ssa2_co3 is None and ssa2_total is not None:
        ssa2_co3 = _safe_float(ssa2_total) / 2.0
    if ssa2_co4 is None and ssa2_total is not None:
        ssa2_co4 = _safe_float(ssa2_total) / 2.0

    cia1_sheet = _get_cia_sheet_data(subject.id, ta_id, 'cia1')
    cia2_sheet = _get_cia_sheet_data(subject.id, ta_id, 'cia2')

    cia1_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA1', batch_id=batch_id)
    cia2_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA2', batch_id=batch_id)

    def _build_cia_questions(sheet, pattern, is_cia1=True):
        qs = sheet.get('questions') if isinstance(sheet.get('questions'), list) else []
        p_marks = pattern.get('marks') if isinstance(pattern, dict) and isinstance(pattern.get('marks'), list) else []
        p_cos = pattern.get('cos') if isinstance(pattern, dict) and isinstance(pattern.get('cos'), list) else []

        out = []
        count = max(len(qs), len(p_marks))
        if count == 0:
            return out
        for i in range(count):
            q = qs[i] if i < len(qs) and isinstance(qs[i], dict) else {}
            key = _safe_text(q.get('key')) or f'q{i + 1}'
            mx = _safe_float(p_marks[i] if i < len(p_marks) else q.get('max'))
            if mx is None:
                mx = _safe_float(q.get('maxMarks'))
            if mx is None:
                mx = 0.0
            co_raw = p_cos[i] if i < len(p_cos) else q.get('co')
            if is_qp1_final:
                co = co_raw
            else:
                co = _parse_co12(co_raw) if is_cia1 else _parse_co34(co_raw)
            out.append({'key': key, 'max': float(mx), 'co': co})
        return out

    cia1_questions = _build_cia_questions(cia1_sheet, cia1_pattern, True)
    cia2_questions = _build_cia_questions(cia2_sheet, cia2_pattern, False)

    cia1_rows = cia1_sheet.get('rowsByStudentId') if isinstance(cia1_sheet.get('rowsByStudentId'), dict) else {}
    cia2_rows = cia2_sheet.get('rowsByStudentId') if isinstance(cia2_sheet.get('rowsByStudentId'), dict) else {}

    cia1_row = cia1_rows.get(str(sid)) or cia1_rows.get(sid) or {}
    cia2_row = cia2_rows.get(str(sid)) or cia2_rows.get(sid) or {}

    def _cia_co_totals(row, questions, is_cia1=True):
        if not isinstance(row, dict) or bool(row.get('absent')):
            return (None, None, 0.0, 0.0)
        qvals = row.get('q') if isinstance(row.get('q'), dict) else {}
        c_a = 0.0
        c_b = 0.0
        max_a = 0.0
        max_b = 0.0
        has_any = False
        for q in questions:
            mx = float(q.get('max') or 0)
            n = _safe_float(qvals.get(q.get('key')))
            if is_qp1_final and is_cia1:
                raw_nums = _parse_question_co_numbers(q.get('co'))
                raw_num = raw_nums[0] if raw_nums else None
                wa = 1.0 if raw_num == 1 else 0.0
                wb = 1.0 if raw_num == 2 else 0.0
            elif is_qp1_final and not is_cia1:
                wa = _qp1_final_question_weight(q.get('co'), 2, qp1_cia2_offset)
                wb = _qp1_final_question_weight(q.get('co'), 3, qp1_cia2_offset)
            elif is_cia1:
                wa, wb = _co_weights_12(q.get('co'))
            else:
                wa, wb = _co_weights_34(q.get('co'))
            max_a += mx * wa
            max_b += mx * wb
            if n is None:
                continue
            has_any = True
            mark = _clamp(n, 0, mx)
            c_a += mark * wa
            c_b += mark * wb
        if not has_any:
            return (None, None, max_a, max_b)
        return (_clamp(c_a, 0, max_a), _clamp(c_b, 0, max_b), max_a, max_b)

    max_seen = 0
    for qq in cia2_questions:
        nums = _parse_question_co_numbers(qq.get('co'))
        if nums:
            max_seen = max(max_seen, max(nums))
    qp1_cia2_offset = 1 if (is_qp1_final and max_seen > 0 and max_seen <= 2) else 0

    cia1_co1, cia1_co2, cia1_max_co1, cia1_max_co2 = _cia_co_totals(cia1_row, cia1_questions, True)
    cia2_co3, cia2_co4, cia2_max_co3, cia2_max_co4 = _cia_co_totals(cia2_row, cia2_questions, False)

    # Formative CO splits
    f1_rows = _assessment_map(Formative1Mark, 'total', subject.id, [sid], ta_id)
    f2_rows = _assessment_map(Formative2Mark, 'total', subject.id, [sid], ta_id)

    # Prefer explicit skill/att fields to mirror UI.
    def _pick_formative_row(model):
        rows = list(
            model.objects.filter(subject_id=subject.id, student_id=sid)
            .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
            .values('teaching_assignment_id', 'skill1', 'skill2', 'att1', 'att2')
        )
        exact = None
        legacy = None
        for r in rows:
            if r.get('teaching_assignment_id') == ta_id and exact is None:
                exact = r
            if r.get('teaching_assignment_id') is None and legacy is None:
                legacy = r
        return exact or legacy

    f1 = _pick_formative_row(Formative1Mark) or {}
    f2 = _pick_formative_row(Formative2Mark) or {}

    f1_co1 = None
    f1_co2 = None
    if _safe_float(f1.get('skill1')) is not None and _safe_float(f1.get('att1')) is not None:
        f1_co1 = _safe_float(f1.get('skill1')) + _safe_float(f1.get('att1'))
    if _safe_float(f1.get('skill2')) is not None and _safe_float(f1.get('att2')) is not None:
        f1_co2 = _safe_float(f1.get('skill2')) + _safe_float(f1.get('att2'))

    f2_co3 = None
    f2_co4 = None
    if _safe_float(f2.get('skill1')) is not None and _safe_float(f2.get('att1')) is not None:
        f2_co3 = _safe_float(f2.get('skill1')) + _safe_float(f2.get('att1'))
    if _safe_float(f2.get('skill2')) is not None and _safe_float(f2.get('att2')) is not None:
        f2_co4 = _safe_float(f2.get('skill2')) + _safe_float(f2.get('att2'))

    # Model CO marks
    model_sheet = _get_model_sheet_data(subject.id, ta_id, class_type)
    model_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='MODEL', batch_id=batch_id)
    model_marks = _extract_model_co_marks_for_student(
        model_sheet=model_sheet,
        student_id=sid,
        reg_no=reg_no,
        model_pattern=model_pattern,
    )

    def _scale(mark, max_mark, out_of):
        if mark is None or max_mark is None:
            return None
        if not max_mark or not out_of:
            return None
        return _clamp((float(mark) / float(max_mark)) * float(out_of), 0, float(out_of))

    # Defaults mirror frontend when master config is absent.
    maxes = {
        'ssa1_co1': 10.0,
        'ssa1_co2': 10.0,
        'ssa2_co3': 10.0,
        'ssa2_co4': 10.0,
        'f1_co1': 10.0,
        'f1_co2': 10.0,
        'f2_co3': 10.0,
        'f2_co4': 10.0,
        'cia1_co1': cia1_max_co1 or 30.0,
        'cia1_co2': cia1_max_co2 or 30.0,
        'cia2_co3': cia2_max_co3 or 30.0,
        'cia2_co4': cia2_max_co4 or 30.0,
    }

    if is_qp1_final:
        # QP1FINAL mapping exactly follows Internal Mark page columns.
        ssa2_first = ssa2_co3
        ssa2_second = ssa2_co4
        if ssa2_splits:
            first_v = _safe_float(ssa2_splits.get('co2'))
            if first_v is None:
                first_v = _safe_float(ssa2_splits.get('co3'))
            if first_v is not None:
                ssa2_first = first_v
            second_v = None
            if ssa2_splits.get('co3') is not None and ssa2_splits.get('co2') is not None:
                second_v = _safe_float(ssa2_splits.get('co3'))
            if second_v is None:
                second_v = _safe_float(ssa2_splits.get('co4'))
            if second_v is not None:
                ssa2_second = second_v

        f2_co2 = f2_co3
        f2_co3_qp1 = f2_co4

        co1_ssa = _scale(ssa1_co1, maxes['ssa1_co1'], weights[0])
        co1_cia = _scale(cia1_co1, maxes['cia1_co1'], weights[1])
        co1_fa = _scale(f1_co1, maxes['f1_co1'], weights[2])

        co2_ssa_c1 = _scale(ssa1_co2, maxes['ssa1_co2'], weights[3])
        co2_cia_c1 = _scale(cia1_co2, maxes['cia1_co2'], weights[4])
        co2_fa_c1 = _scale(f1_co2, maxes['f1_co2'], weights[5])

        co2_ssa_c2 = _scale(ssa2_first, maxes['ssa2_co3'], weights[6])
        co2_cia_c2 = _scale(cia2_co3, maxes['cia2_co3'], weights[7])
        co2_fa_c2 = _scale(f2_co2, maxes['f2_co3'], weights[8])

        co3_ssa = _scale(ssa2_second, maxes['ssa2_co4'], weights[9])
        co3_cia = _scale(cia2_co4, maxes['cia2_co4'], weights[10])
        co3_fa = _scale(f2_co3_qp1, maxes['f2_co4'], weights[11])

        me1 = _scale(model_marks['co1'], model_marks['max']['co1'], weights[12]) if model_marks else None
        me2 = _scale(model_marks['co2'], model_marks['max']['co2'], weights[13]) if model_marks else None
        me3 = _scale(model_marks['co3'], model_marks['max']['co3'], weights[14]) if model_marks else None

        parts = [
            co1_ssa, co1_cia, co1_fa,
            co2_ssa_c1, co2_cia_c1, co2_fa_c1,
            co2_ssa_c2, co2_cia_c2, co2_fa_c2,
            co3_ssa, co3_cia, co3_fa,
            me1, me2, me3,
        ]
    else:
        co1_ssa = _scale(ssa1_co1, maxes['ssa1_co1'], w_co1_ssa)
        co1_cia = _scale(cia1_co1, maxes['cia1_co1'], w_co1_cia)
        co1_fa = _scale(f1_co1, maxes['f1_co1'], w_co1_fa)

        co2_ssa = _scale(ssa1_co2, maxes['ssa1_co2'], w_co2_ssa)
        co2_cia = _scale(cia1_co2, maxes['cia1_co2'], w_co2_cia)
        co2_fa = _scale(f1_co2, maxes['f1_co2'], w_co2_fa)

        co3_ssa = _scale(ssa2_co3, maxes['ssa2_co3'], w_co3_ssa)
        co3_cia = _scale(cia2_co3, maxes['cia2_co3'], w_co3_cia)
        co3_fa = _scale(f2_co3, maxes['f2_co3'], w_co3_fa)

        co4_ssa = _scale(ssa2_co4, maxes['ssa2_co4'], w_co4_ssa)
        co4_cia = _scale(cia2_co4, maxes['cia2_co4'], w_co4_cia)
        co4_fa = _scale(f2_co4, maxes['f2_co4'], w_co4_fa)

        me1 = _scale(model_marks['co1'], model_marks['max']['co1'], w_me1) if model_marks else None
        me2 = _scale(model_marks['co2'], model_marks['max']['co2'], w_me2) if model_marks else None
        me3 = _scale(model_marks['co3'], model_marks['max']['co3'], w_me3) if model_marks else None
        me4 = _scale(model_marks['co4'], model_marks['max']['co4'], w_me4) if model_marks else None
        me5 = _scale(model_marks['co5'], model_marks['max']['co5'], w_me5) if model_marks else None

        parts = [
            co1_ssa, co1_cia, co1_fa,
            co2_ssa, co2_cia, co2_fa,
            co3_ssa, co3_cia, co3_fa,
            co4_ssa, co4_cia, co4_fa,
            me1, me2, me3, me4, me5,
        ]

    any_part = any(p is not None for p in parts)
    if not any_part:
        return None

    base_total = _round2(sum(float(p or 0) for p in parts))

    # Merge-by-CO values (Final tab semantics)
    if is_qp1_final:
        co_values = {
            1: _round2(sum(float(x or 0) for x in [co1_ssa, co1_cia, co1_fa, me1])) if any(x is not None for x in [co1_ssa, co1_cia, co1_fa, me1]) else None,
            2: _round2(sum(float(x or 0) for x in [co2_ssa_c1, co2_cia_c1, co2_fa_c1, co2_ssa_c2, co2_cia_c2, co2_fa_c2, me2])) if any(x is not None for x in [co2_ssa_c1, co2_cia_c1, co2_fa_c1, co2_ssa_c2, co2_cia_c2, co2_fa_c2, me2]) else None,
            3: _round2(sum(float(x or 0) for x in [co3_ssa, co3_cia, co3_fa, me3])) if any(x is not None for x in [co3_ssa, co3_cia, co3_fa, me3]) else None,
        }
        co_max = {1: 13.0, 2: 14.0, 3: 13.0}
    else:
        co_values = {
            1: _round2(sum(float(x or 0) for x in [co1_ssa, co1_cia, co1_fa, me1])) if any(x is not None for x in [co1_ssa, co1_cia, co1_fa, me1]) else None,
            2: _round2(sum(float(x or 0) for x in [co2_ssa, co2_cia, co2_fa, me2])) if any(x is not None for x in [co2_ssa, co2_cia, co2_fa, me2]) else None,
            3: _round2(sum(float(x or 0) for x in [co3_ssa, co3_cia, co3_fa, me3])) if any(x is not None for x in [co3_ssa, co3_cia, co3_fa, me3]) else None,
            4: _round2(sum(float(x or 0) for x in [co4_ssa, co4_cia, co4_fa, me4])) if any(x is not None for x in [co4_ssa, co4_cia, co4_fa, me4]) else None,
            5: _round2(float(me5 or 0)) if me5 is not None else None,
        }
        co_max = {
            1: float(w_co1_ssa + w_co1_cia + w_co1_fa + w_me1),
            2: float(w_co2_ssa + w_co2_cia + w_co2_fa + w_me2),
            3: float(w_co3_ssa + w_co3_cia + w_co3_fa + w_me3),
            4: float(w_co4_ssa + w_co4_cia + w_co4_fa + w_me4),
            5: float(w_me5),
        }

    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries if cqi_row and isinstance(getattr(cqi_row, 'entries', None), dict) else {}
    cqi_nums = cqi_row.co_numbers if cqi_row and isinstance(getattr(cqi_row, 'co_numbers', None), list) else []
    cqi_co_set = {int(n) for n in cqi_nums if _safe_int(n) is not None}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}

    total_add = 0.0
    cqi_add_by_co = {}
    co_loop = [1, 2, 3] if is_qp1_final else [1, 2, 3, 4, 5]
    for co in co_loop:
        if co not in cqi_co_set:
            continue
        base = co_values.get(co)
        if base is None:
            continue
        inp = _safe_float((cqi_student or {}).get(f'co{co}'))
        add = _compute_cqi_add(co_value=base, co_max=co_max.get(co), input_mark=inp)
        total_add += add
        cqi_add_by_co[co] = _round2(add)

    total = _round2(base_total + total_add)
    if max_total > 0:
        original_pct = (base_total / max_total) * 100.0
        if original_pct < THRESHOLD_PERCENT:
            total_cap = _round2((max_total * THRESHOLD_PERCENT) / 100.0)
            total = min(total, total_cap)

    total = _clamp(total, 0.0, max_total if max_total > 0 else 40.0)
    final_total = _round2(total)

    if not return_details:
        return final_total

    final_co_values = {}
    for co in co_loop:
        base = co_values.get(co)
        if base is None:
            final_co_values[co] = None
            continue
        add = cqi_add_by_co.get(co, 0.0)
        v = _round2(float(base) + float(add))
        mx = _safe_float(co_max.get(co))
        if mx is not None and mx > 0:
            v = _clamp(v, 0.0, mx)
        final_co_values[co] = _round2(v)

    # OE Theory (QP1FINAL) courses convert to 60 instead of 100
    scaled_max = 60.0 if is_qp1_final else 100.0
    _raw_100 = (final_total / 40.0) * scaled_max if 40.0 > 0 else None
    _total_100 = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100 = (base_total / 40.0) * scaled_max if 40.0 > 0 and base_total is not None else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None
    return {
        'total_40': final_total,
        'total_100': _total_100,
        'base_total_100': _base_total_100,
        'scaled_max': scaled_max,
        'base_total_40': _round2(base_total),
        'base_co_values_40': {
            'co1': _safe_float(co_values.get(1)),
            'co2': _safe_float(co_values.get(2)),
            'co3': _safe_float(co_values.get(3)),
            'co4': _safe_float(co_values.get(4)),
            'co5': _safe_float(co_values.get(5)),
        },
        'co_values_40': {
            'co1': final_co_values.get(1),
            'co2': final_co_values.get(2),
            'co3': final_co_values.get(3),
            'co4': final_co_values.get(4),
            'co5': final_co_values.get(5),
        },
        'co_max_40': {
            'co1': _safe_float(co_max.get(1)),
            'co2': _safe_float(co_max.get(2)),
            'co3': _safe_float(co_max.get(3)),
            'co4': _safe_float(co_max.get(4)),
            'co5': _safe_float(co_max.get(5)),
        },
        'cqi_add_40': {
            'co1': _safe_float(cqi_add_by_co.get(1)),
            'co2': _safe_float(cqi_add_by_co.get(2)),
            'co3': _safe_float(cqi_add_by_co.get(3)),
            'co4': _safe_float(cqi_add_by_co.get(4)),
            'co5': _safe_float(cqi_add_by_co.get(5)),
        },
        'is_qp1_final': bool(is_qp1_final),
        'class_type': class_type,
        'qp_type': qp_type,
    }


def _extract_model_total_for_student(data, student_id):
    if not isinstance(data, dict):
        return None
    sid = str(student_id)

    marks = data.get('marks')
    if isinstance(marks, dict):
        qmarks = marks.get(sid) or marks.get(student_id)
        if isinstance(qmarks, dict):
            total = 0.0
            has_any = False
            for v in qmarks.values():
                n = _safe_float(v)
                if n is not None:
                    total += n
                    has_any = True
            return round(total, 2) if has_any else None

    sheet = data.get('sheet') if isinstance(data, dict) else None
    if isinstance(sheet, dict):
        rows = sheet.get('rowsByStudentId')
        if isinstance(rows, dict):
            row = rows.get(sid) or rows.get(student_id)
            if isinstance(row, dict):
                direct = _safe_float(row.get('ciaExam'))
                if direct is not None:
                    return round(direct, 2)

    return None


def _assessment_map(model, field_name, subject_id, student_ids, ta_id):
    out = {}
    if not subject_id or not student_ids:
        return out

    base = model.objects.filter(subject_id=subject_id, student_id__in=student_ids)
    scoped = base.filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True)).values('student_id', 'teaching_assignment_id', field_name)

    for row in scoped:
        sid = int(row.get('student_id'))
        current = out.get(sid)
        val = _safe_float(row.get(field_name))
        is_ta = row.get('teaching_assignment_id') == ta_id

        if current is None:
            out[sid] = {'value': val, 'is_ta': is_ta}
            continue
        if current.get('is_ta'):
            continue
        if is_ta:
            out[sid] = {'value': val, 'is_ta': True}
        elif current.get('value') is None and val is not None:
            out[sid] = {'value': val, 'is_ta': False}

    return {sid: data.get('value') for sid, data in out.items()}


def _students_for_ta(ta):
    from academics.models import StudentSectionAssignment, StudentProfile

    students = []
    existing_ids = set()

    if getattr(ta, 'section_id', None):
        s_qs = (
            StudentSectionAssignment.objects.filter(section_id=ta.section_id, end_date__isnull=True)
            .exclude(student__status__in=['INACTIVE', 'DEBAR'])
            .select_related('student__user')
        )
        for s in s_qs:
            sp = s.student
            u = getattr(sp, 'user', None)
            name = ' '.join([
                _safe_text(getattr(u, 'first_name', '')),
                _safe_text(getattr(u, 'last_name', '')),
            ]).strip() if u else ''
            if not name:
                name = _safe_text(getattr(u, 'username', '')) if u else ''
            students.append({
                'id': sp.id,
                'reg_no': _safe_text(getattr(sp, 'reg_no', '')),
                'name': name,
            })
            existing_ids.add(int(sp.id))

        legacy_qs = (
            StudentProfile.objects.filter(section_id=ta.section_id)
            .exclude(status__in=['INACTIVE', 'DEBAR'])
            .select_related('user')
        )
        for sp in legacy_qs:
            try:
                sid = int(sp.id)
            except Exception:
                continue
            if sid in existing_ids:
                continue
            u = getattr(sp, 'user', None)
            name = ' '.join([
                _safe_text(getattr(u, 'first_name', '')),
                _safe_text(getattr(u, 'last_name', '')),
            ]).strip() if u else ''
            if not name:
                name = _safe_text(getattr(u, 'username', '')) if u else ''
            students.append({
                'id': sp.id,
                'reg_no': _safe_text(getattr(sp, 'reg_no', '')),
                'name': name,
            })

    students.sort(key=lambda r: (_safe_text(r.get('reg_no')), _safe_text(r.get('name'))))
    return students


def _extract_student_ids_from_model_sheet_data(data):
    ids = set()
    if not isinstance(data, dict):
        return ids

    marks = data.get('marks')
    if isinstance(marks, dict):
        for k in marks.keys():
            try:
                ids.add(int(k))
            except Exception:
                continue

    sheet = data.get('sheet')
    if isinstance(sheet, dict):
        rows = sheet.get('rowsByStudentId')
        if isinstance(rows, dict):
            for k in rows.keys():
                try:
                    ids.add(int(k))
                except Exception:
                    continue

    return ids


def _student_ids_from_mark_rows_for_ta(subject_id, ta_id):
    """Resolve student IDs from stored mark rows for TAs that lack section mapping.

    Prefer exact teaching-assignment scoped rows; if no exact rows exist, fall back
    to legacy null-TA rows for the same subject.
    """
    from OBE.models import (
        Cia1Mark,
        Cia2Mark,
        Ssa1Mark,
        Ssa2Mark,
        Review1Mark,
        Review2Mark,
        Formative1Mark,
        Formative2Mark,
        ModelPublishedSheet,
    )

    assessment_models = [
        Cia1Mark,
        Cia2Mark,
        Ssa1Mark,
        Ssa2Mark,
        Review1Mark,
        Review2Mark,
        Formative1Mark,
        Formative2Mark,
    ]

    exact_ids = set()
    for model in assessment_models:
        exact_ids.update(
            model.objects.filter(subject_id=subject_id, teaching_assignment_id=ta_id).values_list('student_id', flat=True)
        )

    exact_model_rows = ModelPublishedSheet.objects.filter(subject_id=subject_id, teaching_assignment_id=ta_id).order_by('-updated_at')
    for row in exact_model_rows[:2]:
        exact_ids.update(_extract_student_ids_from_model_sheet_data(getattr(row, 'data', None)))

    if exact_ids:
        return sorted(int(sid) for sid in exact_ids)

    fallback_ids = set()
    for model in assessment_models:
        fallback_ids.update(
            model.objects.filter(subject_id=subject_id, teaching_assignment__isnull=True).values_list('student_id', flat=True)
        )

    fallback_model_rows = ModelPublishedSheet.objects.filter(subject_id=subject_id, teaching_assignment__isnull=True).order_by('-updated_at')
    for row in fallback_model_rows[:2]:
        fallback_ids.update(_extract_student_ids_from_model_sheet_data(getattr(row, 'data', None)))

    return sorted(int(sid) for sid in fallback_ids)


def _students_from_ids(student_ids):
    from academics.models import StudentProfile

    if not student_ids:
        return []

    out = []
    qs = StudentProfile.objects.filter(id__in=student_ids).select_related('user')
    for sp in qs:
        u = getattr(sp, 'user', None)
        name = ' '.join([
            _safe_text(getattr(u, 'first_name', '')),
            _safe_text(getattr(u, 'last_name', '')),
        ]).strip() if u else ''
        if not name:
            name = _safe_text(getattr(u, 'username', '')) if u else ''
        out.append(
            {
                'id': sp.id,
                'reg_no': _safe_text(getattr(sp, 'reg_no', '')),
                'name': name,
            }
        )

    out.sort(key=lambda r: (_safe_text(r.get('reg_no')), _safe_text(r.get('name'))))
    return out


def _resolve_subject_for_ta(ta):
    from academics.models import Subject

    subj = getattr(ta, 'subject', None)
    if subj is not None:
        return subj

    code = ''
    if getattr(ta, 'curriculum_row', None) is not None:
        code = _safe_text(getattr(ta.curriculum_row, 'course_code', ''))
    if not code and getattr(ta, 'elective_subject', None) is not None:
        code = _safe_text(getattr(ta.elective_subject, 'course_code', ''))
    if not code:
        return None
    return Subject.objects.filter(code__iexact=code).first()



# ─── TCPR Class-type (Theory + Reviews instead of Formatives) ────────────────

def _compute_tcpr_final_total(*, ta, subject, student, ta_id, return_details=False):
    """Compute Final Internal Mark for TCPR class-type.

    TCPR is identical to THEORY except it uses Review1/Review2 marks in place
    of Formative1/Formative2 for the FA columns.  The 17-slot weight schema is
    the same as THEORY/SPECIAL.
    """
    from OBE.models import (
        Review1Mark,
        Review2Mark,
        ObeCqiPublished,
    )

    sid = int(student['id'])
    reg_no = _safe_text(student.get('reg_no', ''))
    class_type = 'TCPR'
    batch_id = getattr(getattr(ta, 'section', None), 'batch_id', None)
    qp_type = None  # TCPR does not use question-paper types

    weights = _get_internal_weight_slots(class_type)
    max_total = float(sum(weights))

    w_co1_ssa, w_co1_cia, w_co1_fa = weights[0], weights[1], weights[2]
    w_co2_ssa, w_co2_cia, w_co2_fa = weights[3], weights[4], weights[5]
    w_co3_ssa, w_co3_cia, w_co3_fa = weights[6], weights[7], weights[8]
    w_co4_ssa, w_co4_cia, w_co4_fa = weights[9], weights[10], weights[11]
    w_me1, w_me2, w_me3 = weights[12], weights[13], weights[14]
    w_me4 = weights[15] if len(weights) > 15 else 0.0
    w_me5 = weights[16] if len(weights) > 16 else 0.0

    ssa1_map = _assessment_map(
        __import__('OBE.models', fromlist=['Ssa1Mark']).Ssa1Mark,
        'mark', subject.id, [sid], ta_id,
    )
    ssa2_map = _assessment_map(
        __import__('OBE.models', fromlist=['Ssa2Mark']).Ssa2Mark,
        'mark', subject.id, [sid], ta_id,
    )

    ssa1_total = ssa1_map.get(sid)
    ssa2_total = ssa2_map.get(sid)

    ssa1_splits = _extract_ssa_co_splits_for_ta(subject.id, ta_id, 'ssa1', ['co1', 'co2']).get(sid, {})
    ssa2_splits = _extract_ssa_co_splits_for_ta(subject.id, ta_id, 'ssa2', ['co3', 'co4']).get(sid, {})

    ssa1_co1 = _safe_float(ssa1_splits.get('co1')) if ssa1_splits else ((_safe_float(ssa1_total) / 2.0) if ssa1_total is not None else None)
    ssa1_co2 = _safe_float(ssa1_splits.get('co2')) if ssa1_splits else ((_safe_float(ssa1_total) / 2.0) if ssa1_total is not None else None)
    ssa2_co3 = _safe_float(ssa2_splits.get('co3')) if ssa2_splits else ((_safe_float(ssa2_total) / 2.0) if ssa2_total is not None else None)
    ssa2_co4 = _safe_float(ssa2_splits.get('co4')) if ssa2_splits else ((_safe_float(ssa2_total) / 2.0) if ssa2_total is not None else None)

    # TCPR: CIA sheets (standard theory pattern)
    cia1_sheet = _get_cia_sheet_data(subject.id, ta_id, 'cia1')
    cia2_sheet = _get_cia_sheet_data(subject.id, ta_id, 'cia2')
    cia1_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA1', batch_id=batch_id)
    cia2_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA2', batch_id=batch_id)

    def _build_cia_q(sheet, pattern, is_cia1=True):
        qs = sheet.get('questions') if isinstance(sheet.get('questions'), list) else []
        p_marks = pattern.get('marks') if isinstance(pattern, dict) and isinstance(pattern.get('marks'), list) else []
        p_cos   = pattern.get('cos')   if isinstance(pattern, dict) and isinstance(pattern.get('cos'),   list) else []
        out = []
        for i in range(max(len(qs), len(p_marks))):
            q   = qs[i] if i < len(qs) and isinstance(qs[i], dict) else {}
            key = _safe_text(q.get('key')) or f'q{i + 1}'
            mx  = _safe_float(p_marks[i] if i < len(p_marks) else q.get('max')) or 0.0
            co_raw = p_cos[i] if i < len(p_cos) else q.get('co')
            co  = _parse_co12(co_raw) if is_cia1 else _parse_co34(co_raw)
            out.append({'key': key, 'max': float(mx), 'co': co})
        return out

    cia1_questions = _build_cia_q(cia1_sheet, cia1_pattern, True)
    cia2_questions = _build_cia_q(cia2_sheet, cia2_pattern, False)

    cia1_rows = cia1_sheet.get('rowsByStudentId') if isinstance(cia1_sheet.get('rowsByStudentId'), dict) else {}
    cia2_rows = cia2_sheet.get('rowsByStudentId') if isinstance(cia2_sheet.get('rowsByStudentId'), dict) else {}
    cia1_row  = cia1_rows.get(str(sid)) or cia1_rows.get(sid) or {}
    cia2_row  = cia2_rows.get(str(sid)) or cia2_rows.get(sid) or {}

    def _cia_co_split(row, questions, is_cia1=True):
        if not isinstance(row, dict) or bool(row.get('absent')):
            return (None, None, 0.0, 0.0)
        qvals = row.get('q') if isinstance(row.get('q'), dict) else {}
        a, b, ma, mb = 0.0, 0.0, 0.0, 0.0
        has = False
        for q in questions:
            mx = float(q.get('max') or 0)
            n = _safe_float(qvals.get(q.get('key')))
            wa, wb = _co_weights_12(q.get('co')) if is_cia1 else _co_weights_34(q.get('co'))
            ma += mx * wa; mb += mx * wb
            if n is None:
                continue
            has = True
            m = _clamp(n, 0, mx)
            a += m * wa; b += m * wb
        if not has:
            return (None, None, ma, mb)
        return (_clamp(a, 0, ma), _clamp(b, 0, mb), ma, mb)

    cia1_co1, cia1_co2, max_cia1_co1, max_cia1_co2 = _cia_co_split(cia1_row, cia1_questions, True)
    cia2_co3, cia2_co4, max_cia2_co3, max_cia2_co4 = _cia_co_split(cia2_row, cia2_questions, False)

    # TCPR FA = Review1 / Review2 (per CO half-split like THEORY FA).
    review1_map = _assessment_map(Review1Mark, 'mark', subject.id, [sid], ta_id)
    review2_map = _assessment_map(Review2Mark, 'mark', subject.id, [sid], ta_id)
    rev1_total = _safe_float(review1_map.get(sid))
    rev2_total = _safe_float(review2_map.get(sid))

    rev1_splits = _extract_tcpr_review_co_splits_for_ta(subject.id, ta_id, 'review1', ['co1', 'co2']).get(sid, {})
    rev2_splits = _extract_tcpr_review_co_splits_for_ta(subject.id, ta_id, 'review2', ['co3', 'co4']).get(sid, {})

    rev1_co1 = _safe_float(rev1_splits.get('co1')) if 'co1' in rev1_splits else (rev1_total / 2.0 if rev1_total is not None else None)
    rev1_co2 = _safe_float(rev1_splits.get('co2')) if 'co2' in rev1_splits else (rev1_total / 2.0 if rev1_total is not None else None)
    rev2_co3 = _safe_float(rev2_splits.get('co3')) if 'co3' in rev2_splits else (rev2_total / 2.0 if rev2_total is not None else None)
    rev2_co4 = _safe_float(rev2_splits.get('co4')) if 'co4' in rev2_splits else (rev2_total / 2.0 if rev2_total is not None else None)

    # Model marks
    model_sheet   = _get_model_sheet_data(subject.id, ta_id, class_type)
    model_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='MODEL', batch_id=batch_id)
    model_marks   = _extract_model_co_marks_for_student(model_sheet=model_sheet, student_id=sid, reg_no=reg_no, model_pattern=model_pattern)

    def _scale(mark, max_mark, out_of):
        if mark is None or not max_mark or not out_of:
            return None
        return _clamp((float(mark) / float(max_mark)) * float(out_of), 0, float(out_of))

    maxes = {
        'ssa1_co1': 10.0, 'ssa1_co2': 10.0,
        'ssa2_co3': 10.0, 'ssa2_co4': 10.0,
        'f1_co1':   15.0, 'f1_co2':   15.0,
        'f2_co3':   15.0, 'f2_co4':   15.0,
        'cia1_co1': max_cia1_co1 or 30.0, 'cia1_co2': max_cia1_co2 or 30.0,
        'cia2_co3': max_cia2_co3 or 30.0, 'cia2_co4': max_cia2_co4 or 30.0,
    }

    parts_dict = {
        'co1_ssa': _scale(ssa1_co1, maxes['ssa1_co1'], w_co1_ssa),
        'co1_cia': _scale(cia1_co1, maxes['cia1_co1'], w_co1_cia),
        'co1_fa':  _scale(rev1_co1, maxes['f1_co1'],   w_co1_fa),
        'co2_ssa': _scale(ssa1_co2, maxes['ssa1_co2'], w_co2_ssa),
        'co2_cia': _scale(cia1_co2, maxes['cia1_co2'], w_co2_cia),
        'co2_fa':  _scale(rev1_co2, maxes['f1_co2'],   w_co2_fa),
        'co3_ssa': _scale(ssa2_co3, maxes['ssa2_co3'], w_co3_ssa),
        'co3_cia': _scale(cia2_co3, maxes['cia2_co3'], w_co3_cia),
        'co3_fa':  _scale(rev2_co3, maxes['f2_co3'],   w_co3_fa),
        'co4_ssa': _scale(ssa2_co4, maxes['ssa2_co4'], w_co4_ssa),
        'co4_cia': _scale(cia2_co4, maxes['cia2_co4'], w_co4_cia),
        'co4_fa':  _scale(rev2_co4, maxes['f2_co4'],   w_co4_fa),
        'me1': _scale(model_marks['co1'], model_marks['max']['co1'], w_me1) if model_marks else None,
        'me2': _scale(model_marks['co2'], model_marks['max']['co2'], w_me2) if model_marks else None,
        'me3': _scale(model_marks['co3'], model_marks['max']['co3'], w_me3) if model_marks else None,
        'me4': _scale(model_marks['co4'], model_marks['max']['co4'], w_me4) if model_marks else None,
        'me5': _scale(model_marks['co5'], model_marks['max']['co5'], w_me5) if model_marks else None,
    }

    parts = [v for v in parts_dict.values() if v is not None]
    if not parts:
        return None

    # Group by CO for CQI
    co_vals_raw = {
        1: sum(v for v in (parts_dict['co1_ssa'], parts_dict['co1_cia'], parts_dict['co1_fa'], parts_dict['me1']) if v is not None) if any(v is not None for v in (parts_dict['co1_ssa'], parts_dict['co1_cia'], parts_dict['co1_fa'], parts_dict['me1'])) else None,
        2: sum(v for v in (parts_dict['co2_ssa'], parts_dict['co2_cia'], parts_dict['co2_fa'], parts_dict['me2']) if v is not None) if any(v is not None for v in (parts_dict['co2_ssa'], parts_dict['co2_cia'], parts_dict['co2_fa'], parts_dict['me2'])) else None,
        3: sum(v for v in (parts_dict['co3_ssa'], parts_dict['co3_cia'], parts_dict['co3_fa'], parts_dict['me3']) if v is not None) if any(v is not None for v in (parts_dict['co3_ssa'], parts_dict['co3_cia'], parts_dict['co3_fa'], parts_dict['me3'])) else None,
        4: sum(v for v in (parts_dict['co4_ssa'], parts_dict['co4_cia'], parts_dict['co4_fa'], parts_dict['me4']) if v is not None) if any(v is not None for v in (parts_dict['co4_ssa'], parts_dict['co4_cia'], parts_dict['co4_fa'], parts_dict['me4'])) else None,
        5: parts_dict['me5'],
    }
    co_max_w = {
        1: w_co1_ssa + w_co1_cia + w_co1_fa + w_me1,
        2: w_co2_ssa + w_co2_cia + w_co2_fa + w_me2,
        3: w_co3_ssa + w_co3_cia + w_co3_fa + w_me3,
        4: w_co4_ssa + w_co4_cia + w_co4_fa + w_me4,
        5: w_me5,
    }
    base_total = _round2(sum(v for v in co_vals_raw.values() if v is not None))

    # CQI
    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries if cqi_row and isinstance(getattr(cqi_row, 'entries', None), dict) else {}
    cqi_nums = cqi_row.co_numbers if cqi_row and isinstance(getattr(cqi_row, 'co_numbers', None), list) else []
    cqi_co_set = {int(n) for n in cqi_nums if _safe_int(n) is not None}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}

    total_add = 0.0
    cqi_add = {}
    for co in range(1, 6):
        if co not in cqi_co_set:
            continue
        base = co_vals_raw.get(co)
        if base is None:
            continue
        inp = _safe_float((cqi_student or {}).get(f'co{co}'))
        add = _compute_cqi_add(co_value=base, co_max=co_max_w[co], input_mark=inp)
        total_add += add
        cqi_add[co] = _round2(add)

    total = _round2(base_total + total_add)
    if max_total > 0:
        pct = (base_total / max_total) * 100.0
        if pct < THRESHOLD_PERCENT:
            total_cap = _round2((max_total * THRESHOLD_PERCENT) / 100.0)
            total = min(total, total_cap)
    total = _clamp(total, 0.0, max_total)
    final_total = _round2(total)

    if not return_details:
        return final_total

    _raw_100 = (final_total / max_total) * 100.0 if max_total > 0 else None
    _total_100 = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100 = (base_total / max_total) * 100.0 if max_total > 0 else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None
    final_co_vals = {}
    base_co_vals = {}
    for co in range(1, 6):
        b = co_vals_raw.get(co)
        base_co_vals[co] = _round2(b) if b is not None else None
        if b is not None:
            v = _round2(b + cqi_add.get(co, 0.0))
            v = _clamp(v, 0.0, co_max_w[co]) if co_max_w.get(co) else v
            final_co_vals[co] = _round2(v)
        else:
            final_co_vals[co] = None

    return {
        'total_40': final_total,
        'total_100': _total_100,
        'base_total_100': _base_total_100,
        'scaled_max': 100.0,
        'base_total_40': _round2(base_total),
        'base_co_values_40': {f'co{c}': base_co_vals.get(c) for c in range(1, 6)},
        'co_values_40': {f'co{c}': final_co_vals.get(c) for c in range(1, 6)},
        'co_max_40': {f'co{c}': _safe_float(co_max_w.get(c)) for c in range(1, 6)},
        'cqi_add_40': {f'co{c}': _safe_float(cqi_add.get(c)) for c in range(1, 6)},
        'is_qp1_final': False,
        'class_type': 'TCPR',
        'qp_type': None,
    }


# ─── PROJECT Class-type ────────────────────────────────────────────────────────

def _get_project_exam_weights():
    """Return project_reviews config from ClassTypeWeights or the default."""
    from OBE.models import ClassTypeWeights

    row = ClassTypeWeights.objects.filter(class_type='PROJECT').first()
    im = getattr(row, 'internal_mark_weights', None) if row else None
    if isinstance(im, dict) and im.get('type') == 'project_reviews':
        return im
    # Default: Review1=50, Review2=50, total=100
    return {'type': 'project_reviews', 'review1': {'weight': 50, 'max': 50}, 'review2': {'weight': 50, 'max': 50}}


def _compute_project_final_total(*, ta, subject, student, ta_id, return_details=False):
    """Compute Final Internal Mark for PROJECT class-type.

    Uses Review1 and Review2 marks only.  Max total = 100 by default.
    CQI is applied once as a combined single-CO mark.
    """
    from OBE.models import Review1Mark, Review2Mark, ObeCqiPublished

    sid = int(student['id'])

    cfg = _get_project_exam_weights()
    w_r1   = float((cfg.get('review1') or {}).get('weight') or 50)
    max_r1 = float((cfg.get('review1') or {}).get('max') or 50)
    w_r2   = float((cfg.get('review2') or {}).get('weight') or 50)
    max_r2 = float((cfg.get('review2') or {}).get('max') or 50)
    max_total = w_r1 + w_r2  # normally 100

    if max_total <= 0:
        return None

    review1_map = _assessment_map(Review1Mark, 'mark', subject.id, [sid], ta_id)
    review2_map = _assessment_map(Review2Mark, 'mark', subject.id, [sid], ta_id)
    rev1 = _safe_float(review1_map.get(sid))
    rev2 = _safe_float(review2_map.get(sid))

    def _scale(mark, from_max, to_weight):
        if mark is None or not from_max or not to_weight:
            return None
        return _clamp((float(mark) / float(from_max)) * float(to_weight), 0, float(to_weight))

    s_r1 = _scale(rev1, max_r1, w_r1)
    s_r2 = _scale(rev2, max_r2, w_r2)
    parts = [v for v in (s_r1, s_r2) if v is not None]
    if not parts:
        return None

    base_total = _round2(sum(parts))

    # CQI: project uses a single combined measure → treat as CO1 if in CQI set
    PROJECT_CQI_RATE = 0.6
    RAW_THRESHOLD_PCT = 58.0
    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries if cqi_row and isinstance(getattr(cqi_row, 'entries', None), dict) else {}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}
    cqi_add = 0.0

    pct_raw = (base_total / max_total) * 100.0 if max_total else 0.0
    if pct_raw < RAW_THRESHOLD_PCT and base_total > 0:
        cqi_mark = _safe_float((cqi_student or {}).get('co1')) or _safe_float((cqi_student or {}).get('project_combined'))
        if cqi_mark and cqi_mark > 0:
            raw_add = cqi_mark * PROJECT_CQI_RATE
            max_allowed = max(0.0, (max_total * RAW_THRESHOLD_PCT / 100.0) - base_total)
            cqi_add = _round2(min(raw_add, max_allowed))

    total = _clamp(_round2(base_total + cqi_add), 0.0, max_total)
    final_total = _round2(total)

    if not return_details:
        return final_total

    _raw_100 = (final_total / max_total) * 100.0 if max_total > 0 else None
    _total_100 = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100 = (base_total / max_total) * 100.0 if max_total > 0 else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None

    return {
        'total_40': final_total,   # note: actually /100 for project but field name kept for compat
        'total_100': _total_100,
        'base_total_100': _base_total_100,
        'scaled_max': 100.0,
        'base_total_40': _round2(base_total),
        'base_co_values_40': {'co1': _safe_float(s_r1), 'co2': _safe_float(s_r2), 'co3': None, 'co4': None, 'co5': None},
        'co_values_40': {'co1': _safe_float(s_r1), 'co2': _safe_float(s_r2), 'co3': None, 'co4': None, 'co5': None},
        'co_max_40': {'co1': w_r1, 'co2': w_r2, 'co3': None, 'co4': None, 'co5': None},
        'cqi_add_40': {'co1': _round2(cqi_add), 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'is_qp1_final': False,
        'class_type': 'PROJECT',
        'qp_type': None,
    }


# ─── LAB / PRACTICAL Class-type ───────────────────────────────────────────────

def _get_lab_cycle_weight_config():
    """Return lab_cycles ClassTypeWeights for LAB, or default."""
    from OBE.models import ClassTypeWeights

    row = ClassTypeWeights.objects.filter(class_type='LAB').first()
    im = getattr(row, 'internal_mark_weights', None) if row else None
    if isinstance(im, dict) and im.get('type') == 'lab_cycles':
        return im
    # Default: CO1-3 in cycle1, CO3-5 in cycle2 (example defaults matching frontend)
    return {
        'type': 'lab_cycles',
        'cycle1': {'1': {'exp': 9, 'cia': 3}, '2': {'exp': 9, 'cia': 3}, '3': {'exp': 4.5, 'cia': 1.5}},
        'cycle2': {'3': {'exp': 4.5, 'cia': 1.5}, '4': {'exp': 9, 'cia': 3}, '5': {'exp': 9, 'cia': 3}},
    }


def _compute_lab_final_total(*, ta, subject, student, ta_id, class_type='LAB', return_details=False):
    """Compute Final Internal Mark for LAB / PRACTICAL class-type.

    Mark structure:
      Two cycles (cia1, cia2) each stored in LabPublishedSheet.
      Per CO in each cycle: experiment average scaled to exp weight + CIA exam scaled to cia weight.
      Total = sum across all CO contributions from both cycles.
    """
    from OBE.models import LabPublishedSheet, ObeCqiPublished

    sid = int(student['id'])
    cfg = _get_lab_cycle_weight_config()
    cycle1_cfg = cfg.get('cycle1') or {}
    cycle2_cfg = cfg.get('cycle2') or {}

    def _cycle_total_weight(cyc):
        total = 0.0
        for v in cyc.values():
            total += float(v.get('exp') or 0) + float(v.get('cia') or 0)
        return total

    max_total = _cycle_total_weight(cycle1_cfg) + _cycle_total_weight(cycle2_cfg)
    if max_total <= 0:
        return None

    def _get_lab_sheet(assessment):
        rows = list(
            LabPublishedSheet.objects.filter(subject_id=subject.id, assessment=assessment)
            .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
            .order_by('-updated_at')
        )
        row = _pick_scoped_row(rows, ta_id)
        return row.data if row and isinstance(getattr(row, 'data', None), dict) else {}

    cia1_data = _get_lab_sheet('cia1')
    cia2_data = _get_lab_sheet('cia2')

    CIA_EXAM_MAX = 30.0

    def _read_co_from_cycle(sheet_data, cycle_config):
        """Return {co_str: scaled_contribution} for a single cycle."""
        sheet = sheet_data.get('sheet') if isinstance(sheet_data, dict) else sheet_data
        if not isinstance(sheet, dict):
            # Try treating sheet_data itself as the sheet
            sheet = sheet_data if isinstance(sheet_data, dict) else {}
        rows_by_sid = sheet.get('rowsByStudentId') if isinstance(sheet, dict) else {}
        if not isinstance(rows_by_sid, dict):
            rows_by_sid = {}
        co_configs = sheet.get('coConfigs') if isinstance(sheet, dict) else {}
        if not isinstance(co_configs, dict):
            co_configs = {}
        cia_enabled = sheet.get('ciaExamEnabled', True) if isinstance(sheet, dict) else True
        cia_max = float(sheet.get('ciaExamMax') or CIA_EXAM_MAX) if isinstance(sheet, dict) else CIA_EXAM_MAX

        student_row = rows_by_sid.get(str(sid)) or rows_by_sid.get(sid) or {}
        if not isinstance(student_row, dict):
            return {}

        marks_by_co = student_row.get('marksByCo') if isinstance(student_row, dict) else {}
        if not isinstance(marks_by_co, dict):
            marks_by_co = {}
        cia_exam_raw = _safe_float(student_row.get('ciaExam'))
        cia_exam = _clamp(cia_exam_raw, 0, cia_max) if cia_exam_raw is not None else None

        sorted_co_keys = sorted(cycle_config.keys(), key=lambda k: int(k) if str(k).isdigit() else 0)
        result = {}
        has_any = False

        for co_key in sorted_co_keys:
            w = cycle_config[co_key]
            exp_weight = float(w.get('exp') or 0)
            cia_weight = float(w.get('cia') or 0)
            co_num = int(co_key) if str(co_key).isdigit() else 0

            # Get co-config from sheet (expMax, expCount, enabled)
            co_cfg = co_configs.get(str(co_num)) or {}
            enabled = co_cfg.get('enabled', True) if isinstance(co_cfg, dict) else True
            exp_max = float(co_cfg.get('expMax') or 25) if isinstance(co_cfg, dict) else 25.0
            exp_count = int(co_cfg.get('expCount') or 0) if isinstance(co_cfg, dict) else 0

            if not enabled:
                result[co_key] = 0.0
                continue

            # Experiment marks
            raw_marks = marks_by_co.get(str(co_num)) or marks_by_co.get(co_key) or []
            if not isinstance(raw_marks, list):
                raw_marks = []
            marks_arr = [_safe_float(x) for x in raw_marks[:exp_count or len(raw_marks)] if _safe_float(x) is not None]
            avg_exp = (sum(marks_arr) / len(marks_arr)) if marks_arr else None

            exp_scaled = _clamp((avg_exp / exp_max) * exp_weight, 0, exp_weight) if (avg_exp is not None and exp_max > 0 and exp_weight > 0) else None

            # CIA exam contribution
            cia_scaled = None
            if cia_enabled and cia_exam is not None and cia_max > 0 and cia_weight > 0:
                cia_scaled = _clamp((cia_exam / cia_max) * cia_weight, 0, cia_weight)

            if exp_scaled is not None or cia_scaled is not None:
                has_any = True
                result[co_key] = (exp_scaled or 0.0) + (cia_scaled or 0.0)
            else:
                result[co_key] = None

        if not has_any:
            return {}
        return result

    c1_marks = _read_co_from_cycle(cia1_data, cycle1_cfg)
    c2_marks = _read_co_from_cycle(cia2_data, cycle2_cfg)

    all_parts = list(c1_marks.values()) + list(c2_marks.values())
    valid_parts = [v for v in all_parts if v is not None]
    if not valid_parts:
        return None

    base_total = _round2(sum(valid_parts))

    # CQI: use combined mark, treated as single CO1
    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries if cqi_row and isinstance(getattr(cqi_row, 'entries', None), dict) else {}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}
    cqi_nums = cqi_row.co_numbers if cqi_row and isinstance(getattr(cqi_row, 'co_numbers', None), list) else []
    cqi_co_set = {int(n) for n in cqi_nums if _safe_int(n) is not None}
    total_add = 0.0
    if cqi_co_set and base_total > 0:
        inp = _safe_float((cqi_student or {}).get('co1'))
        add = _compute_cqi_add(co_value=base_total, co_max=max_total, input_mark=inp)
        total_add = add

    total = _clamp(_round2(base_total + total_add), 0.0, max_total)
    final_total = _round2(total)

    if not return_details:
        return final_total

    _raw_100 = (final_total / max_total) * 100.0 if max_total > 0 else None
    _total_100 = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100 = (base_total / max_total) * 100.0 if max_total > 0 else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None

    return {
        'total_40': final_total,
        'total_100': _total_100,
        'base_total_100': _base_total_100,
        'scaled_max': 100.0,
        'base_total_40': _round2(base_total),
        'base_co_values_40': {'co1': None, 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'co_values_40': {'co1': None, 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'co_max_40': {'co1': None, 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'cqi_add_40': {'co1': _round2(total_add), 'co2': None, 'co3': None, 'co4': None, 'co5': None},
        'is_qp1_final': False,
        'class_type': class_type,
        'qp_type': None,
    }


# ─── TCPL Class-type ──────────────────────────────────────────────────────────

def _get_tcpl_weight_slots():
    """Return 21-slot weight list for TCPL from ClassTypeWeights or defaults."""
    from OBE.models import ClassTypeWeights

    # Default 21-slot TCPL weights (mirrors frontend DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21)
    DEFAULT_TCPL_21 = [
        1.0, 3.25, 2.0, 1.5,   # CO1: SSA, CIA, LAB, CIAExam
        1.0, 3.25, 2.0, 1.5,   # CO2
        1.0, 3.25, 2.0, 1.5,   # CO3
        1.0, 3.25, 2.0, 1.5,   # CO4
        3.0, 3.0, 3.0, 3.0, 7.0,  # ME-CO1..CO5
    ]
    row = ClassTypeWeights.objects.filter(class_type='TCPL').first()
    arr = getattr(row, 'internal_mark_weights', None) if row else None
    if not isinstance(arr, list) or not arr:
        return list(DEFAULT_TCPL_21)
    # Handle legacy 17-slot → upgrade to 21-slot by splitting slot[2] into lab+ciaExam
    if len(arr) == 17:
        out = []
        for co in range(4):
            base = co * 3
            total_slot = float(arr[base + 2] or 0)
            lab_ratio = 2.0 / 3.5
            lab = round(total_slot * lab_ratio, 4)
            cia_exam = round(total_slot - lab, 4)
            out.extend([float(arr[base] or 0), float(arr[base + 1] or 0), lab, cia_exam])
        out.extend([float(x or 0) for x in arr[12:17]])
        return out
    vals = [float(x or 0) for x in arr[:21]]
    while len(vals) < 21:
        vals.append(DEFAULT_TCPL_21[len(vals)] if len(vals) < len(DEFAULT_TCPL_21) else 0.0)
    return vals


def _compute_tcpl_final_total(*, ta, subject, student, ta_id, return_details=False):
    """Compute Final Internal Mark for TCPL class-type.

    21-slot schema per CO (CO1-CO4):
      SSA (w[base+0])  – from SSA1Mark (CO1/CO2) or SSA2Mark (CO3/CO4)
      CIA (w[base+1])  – from Cia1/Cia2PublishedSheet
      LAB (w[base+2])  – experiment average from LabPublishedSheet (formative1/formative2)
      CIAExam(w[base+3]) – CIA Exam raw/30 from same LabPublishedSheet
    Plus ME-CO1..CO5 (slots 16-20) from ModelPublishedSheet.
    """
    from OBE.models import LabPublishedSheet, ObeCqiPublished

    sid = int(student['id'])
    reg_no = _safe_text(student.get('reg_no', ''))
    class_type = 'TCPL'
    batch_id = getattr(getattr(ta, 'section', None), 'batch_id', None)
    qp_type = None

    weights = _get_tcpl_weight_slots()
    max_total = float(sum(weights))

    # Unpack weights by slot index
    w = weights
    # CO1: idxs 0-3, CO2: 4-7, CO3: 8-11, CO4: 12-15, ME: 16-20
    w_ssa = [w[0], w[4], w[8],  w[12]]
    w_cia = [w[1], w[5], w[9],  w[13]]
    w_lab = [w[2], w[6], w[10], w[14]]
    w_ce  = [w[3], w[7], w[11], w[15]]
    w_me  = [w[16], w[17], w[18], w[19], w[20] if len(w) > 20 else 0.0]

    # ── SSA marks ──
    ssa1_map = _assessment_map(__import__('OBE.models', fromlist=['Ssa1Mark']).Ssa1Mark, 'mark', subject.id, [sid], ta_id)
    ssa2_map = _assessment_map(__import__('OBE.models', fromlist=['Ssa2Mark']).Ssa2Mark, 'mark', subject.id, [sid], ta_id)
    ssa1_total = _safe_float(ssa1_map.get(sid))
    ssa2_total = _safe_float(ssa2_map.get(sid))
    ssa1_splits = _extract_ssa_co_splits_for_ta(subject.id, ta_id, 'ssa1', ['co1', 'co2']).get(sid, {})
    ssa2_splits = _extract_ssa_co_splits_for_ta(subject.id, ta_id, 'ssa2', ['co3', 'co4']).get(sid, {})
    ssa_co = [
        _safe_float(ssa1_splits.get('co1')) if ssa1_splits else (ssa1_total / 2.0 if ssa1_total is not None else None),
        _safe_float(ssa1_splits.get('co2')) if ssa1_splits else (ssa1_total / 2.0 if ssa1_total is not None else None),
        _safe_float(ssa2_splits.get('co3')) if ssa2_splits else (ssa2_total / 2.0 if ssa2_total is not None else None),
        _safe_float(ssa2_splits.get('co4')) if ssa2_splits else (ssa2_total / 2.0 if ssa2_total is not None else None),
    ]
    SSA_MAX = 10.0  # each CO's SSA max

    # ── CIA marks (per CO split) ──
    cia1_sheet   = _get_cia_sheet_data(subject.id, ta_id, 'cia1')
    cia2_sheet   = _get_cia_sheet_data(subject.id, ta_id, 'cia2')
    cia1_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA1', batch_id=batch_id)
    cia2_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='CIA2', batch_id=batch_id)

    def _build_cia_q(sheet, pattern, is_cia1=True):
        qs = sheet.get('questions') if isinstance(sheet.get('questions'), list) else []
        p_marks = pattern.get('marks') if isinstance(pattern, dict) and isinstance(pattern.get('marks'), list) else []
        p_cos   = pattern.get('cos')   if isinstance(pattern, dict) and isinstance(pattern.get('cos'),   list) else []
        out = []
        for i in range(max(len(qs), len(p_marks))):
            q   = qs[i] if i < len(qs) and isinstance(qs[i], dict) else {}
            key = _safe_text(q.get('key')) or f'q{i + 1}'
            mx  = _safe_float(p_marks[i] if i < len(p_marks) else q.get('max')) or 0.0
            co_raw = p_cos[i] if i < len(p_cos) else q.get('co')
            co  = _parse_co12(co_raw) if is_cia1 else _parse_co34(co_raw)
            out.append({'key': key, 'max': float(mx), 'co': co})
        return out

    def _cia_split(row, questions, is_cia1=True):
        if not isinstance(row, dict) or bool(row.get('absent')):
            return (None, None, 0.0, 0.0)
        qvals = row.get('q') if isinstance(row.get('q'), dict) else {}
        a, b, ma, mb = 0.0, 0.0, 0.0, 0.0
        has = False
        for q in questions:
            mx = float(q.get('max') or 0)
            n = _safe_float(qvals.get(q.get('key')))
            wa, wb = _co_weights_12(q.get('co')) if is_cia1 else _co_weights_34(q.get('co'))
            ma += mx * wa; mb += mx * wb
            if n is None:
                continue
            has = True
            m = _clamp(n, 0, mx)
            a += m * wa; b += m * wb
        if not has:
            return (None, None, ma, mb)
        return (_clamp(a, 0, ma), _clamp(b, 0, mb), ma, mb)

    cia1_questions = _build_cia_q(cia1_sheet, cia1_pattern, True)
    cia2_questions = _build_cia_q(cia2_sheet, cia2_pattern, False)
    cia1_rows = cia1_sheet.get('rowsByStudentId') if isinstance(cia1_sheet.get('rowsByStudentId'), dict) else {}
    cia2_rows = cia2_sheet.get('rowsByStudentId') if isinstance(cia2_sheet.get('rowsByStudentId'), dict) else {}
    cia1_row  = cia1_rows.get(str(sid)) or cia1_rows.get(sid) or {}
    cia2_row  = cia2_rows.get(str(sid)) or cia2_rows.get(sid) or {}
    cia1_co1, cia1_co2, max_cia1_co1, max_cia1_co2 = _cia_split(cia1_row, cia1_questions, True)
    cia2_co3, cia2_co4, max_cia2_co3, max_cia2_co4 = _cia_split(cia2_row, cia2_questions, False)
    cia_co = [cia1_co1, cia1_co2, cia2_co3, cia2_co4]
    cia_max = [max_cia1_co1 or 30.0, max_cia1_co2 or 30.0, max_cia2_co3 or 30.0, max_cia2_co4 or 30.0]

    # ── Lab marks (LabPublishedSheet with assessment='formative1' / 'formative2') ──
    def _get_lab_sheet_tcpl(assessment):
        rows = list(
            LabPublishedSheet.objects.filter(subject_id=subject.id, assessment=assessment)
            .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
            .order_by('-updated_at')
        )
        row = _pick_scoped_row(rows, ta_id)
        return row.data if row and isinstance(getattr(row, 'data', None), dict) else {}

    lab1_data = _get_lab_sheet_tcpl('formative1')  # CO1+CO2 lab
    lab2_data = _get_lab_sheet_tcpl('formative2')  # CO3+CO4 lab

    CIA_EXAM_MAX = 30.0
    LAB_EXP_MAX  = 2.0   # standard max per experiment mark for TCPL

    def _read_tcpl_co_from_lab(sheet_data, co_num, co_letter='A'):
        """Return (lab_avg, cia_exam) for one CO from a TCPL lab sheet."""
        sheet = sheet_data.get('sheet') if isinstance(sheet_data, dict) else sheet_data
        if not isinstance(sheet, dict):
            sheet = sheet_data if isinstance(sheet_data, dict) else {}

        rows_by_sid = sheet.get('rowsByStudentId') if isinstance(sheet, dict) else {}
        if not isinstance(rows_by_sid, dict):
            rows_by_sid = {}
        student_row = rows_by_sid.get(str(sid)) or rows_by_sid.get(sid) or {}
        if not isinstance(student_row, dict):
            return (None, None)

        marks_by_co = student_row.get('marksByCo') if isinstance(student_row, dict) else {}
        if not isinstance(marks_by_co, dict):
            marks_by_co = {}

        # Per-CO config
        co_configs = sheet.get('coConfigs') if isinstance(sheet, dict) else {}
        co_cfg = (co_configs or {}).get(str(co_num)) or {}
        enabled = co_cfg.get('enabled', True) if isinstance(co_cfg, dict) else True
        exp_count = int(co_cfg.get('expCount') or 0) if isinstance(co_cfg, dict) else 0
        exp_max = float(co_cfg.get('expMax') or LAB_EXP_MAX) if isinstance(co_cfg, dict) else LAB_EXP_MAX

        # Legacy fall-back
        cia_enabled = sheet.get('ciaExamEnabled', True) if isinstance(sheet, dict) else True
        cia_max = float(sheet.get('ciaExamMax') or CIA_EXAM_MAX) if isinstance(sheet, dict) else CIA_EXAM_MAX

        if not enabled:
            return (None, None)

        raw_marks = marks_by_co.get(str(co_num)) \
            or (student_row.get(f'marks{co_letter}') if isinstance(student_row, dict) else None) \
            or []
        if not isinstance(raw_marks, list):
            raw_marks = []
        marks_arr = [_safe_float(x) for x in raw_marks[:exp_count or len(raw_marks)] if _safe_float(x) is not None]
        avg  = (sum(marks_arr) / len(marks_arr)) if marks_arr else None

        cia_raw = _safe_float(student_row.get('ciaExam'))
        cia_exam = _clamp(cia_raw, 0, cia_max) if cia_raw is not None else None

        if not cia_enabled:
            cia_exam = None

        return (avg, cia_exam, exp_max, cia_max)

    # lab1_data: CO1 (letter A) and CO2 (letter B)
    # lab2_data: CO3 (letter A) and CO4 (letter B)
    lab_results = [
        _read_tcpl_co_from_lab(lab1_data, 1, 'A'),
        _read_tcpl_co_from_lab(lab1_data, 2, 'B'),
        _read_tcpl_co_from_lab(lab2_data, 3, 'A'),
        _read_tcpl_co_from_lab(lab2_data, 4, 'B'),
    ]

    def _scale(mark, from_max, to_weight):
        if mark is None or not from_max or not to_weight:
            return None
        return _clamp((float(mark) / float(from_max)) * float(to_weight), 0, float(to_weight))

    # ── Model marks ──
    model_sheet   = _get_model_sheet_data(subject.id, ta_id, class_type)
    model_pattern = _get_qp_pattern(class_type=class_type, qp_type=qp_type, exam='MODEL', batch_id=batch_id)
    model_marks   = _extract_model_co_marks_for_student(model_sheet=model_sheet, student_id=sid, reg_no=reg_no, model_pattern=model_pattern)

    # ── Model LAB column contribution (30-mark LAB/REVIEW field) ──
    # The frontend stores per-student lab value and optional record marks for CO5.
    # TCPR: lab goes entirely to CO5 (handled as review). TCPL: equal split OR record-mode.
    _model_row_raw = {}
    if isinstance(model_sheet, dict):
        _key_id  = f'id:{sid}'
        _key_reg = f'reg:{reg_no}'
        _raw = model_sheet.get(_key_id) or model_sheet.get(_key_reg) or {}
        if isinstance(_raw, dict):
            _model_row_raw = _raw

    _lab_raw_m = _safe_float(_model_row_raw.get('lab'))
    _LAB_MODEL_MAX = 30.0
    _lab_m = _clamp(_lab_raw_m, 0.0, _LAB_MODEL_MAX) if _lab_raw_m is not None else None

    if _lab_m is not None:
        # Check if record-marks-for-CO5 mode is enabled (stored at sheet level)
        _record_cfg = model_sheet.get('recordMarksForCo5') if isinstance(model_sheet, dict) else {}
        _record_en = isinstance(_record_cfg, dict) and bool(_record_cfg.get('enabled'))
        _record_exp_n = int(_record_cfg.get('expCount') or 0) if isinstance(_record_cfg, dict) else 0
        _record_max_pe = float(_record_cfg.get('maxPerExp') or 10.0) if isinstance(_record_cfg, dict) else 10.0

        if model_marks is None:
            model_marks = {
                'co1': 0.0, 'co2': 0.0, 'co3': 0.0, 'co4': 0.0, 'co5': 0.0,
                'max': {'co1': 0.0, 'co2': 0.0, 'co3': 0.0, 'co4': 0.0, 'co5': 0.0},
            }

        _tcpr_mode = (class_type or '').upper() in ('TCPR',)
        if _tcpr_mode:
            # TCPR: entire LAB (REVIEW) → CO5 only
            model_marks['co5'] = (model_marks.get('co5') or 0.0) + _lab_m
            model_marks['max']['co5'] = (model_marks['max'].get('co5') or 0.0) + _LAB_MODEL_MAX
        elif _record_en:
            # TCPL record mode: CO1-CO4 equal, CO5 = CIA(lab*4/30) + record-avg*(2/maxPerExp)
            _equal_share = _LAB_MODEL_MAX / 5.0
            for _cn in range(1, 5):
                _ck = f'co{_cn}'
                model_marks[_ck] = (model_marks.get(_ck) or 0.0) + (_lab_m / 5.0)
                model_marks['max'][_ck] = (model_marks['max'].get(_ck) or 0.0) + _equal_share
            _cia_co5 = (_lab_m / _LAB_MODEL_MAX) * 4.0
            _rec_marks_raw = _model_row_raw.get('recordMarksCo5')
            _rec_val = 0.0
            if isinstance(_rec_marks_raw, list):
                _sliced = _rec_marks_raw[:_record_exp_n] if _record_exp_n else _rec_marks_raw
                _valid_recs = [_safe_float(x) for x in _sliced if _safe_float(x) is not None]
                if _valid_recs:
                    _avg_rec = sum(_valid_recs) / len(_valid_recs)
                    _rec_val = _clamp(_avg_rec / _record_max_pe, 0.0, 1.0) * 2.0
            model_marks['co5'] = (model_marks.get('co5') or 0.0) + _cia_co5 + _rec_val
            model_marks['max']['co5'] = (model_marks['max'].get('co5') or 0.0) + 4.0 + 2.0
        else:
            # TCPL standard: equal split across all 5 COs
            _equal_share = _LAB_MODEL_MAX / 5.0
            for _cn in range(1, 6):
                _ck = f'co{_cn}'
                model_marks[_ck] = (model_marks.get(_ck) or 0.0) + (_lab_m / 5.0)
                model_marks['max'][_ck] = (model_marks['max'].get(_ck) or 0.0) + _equal_share

    # ── Assemble per-CO slots ──
    co_parts = {}
    for co_idx in range(4):
        co_num = co_idx + 1
        lr = lab_results[co_idx]
        avg_exp = lr[0] if lr and len(lr) >= 1 else None
        cia_e   = lr[1] if lr and len(lr) >= 2 else None
        exp_m   = lr[2] if lr and len(lr) >= 3 else LAB_EXP_MAX
        cia_m   = lr[3] if lr and len(lr) >= 4 else CIA_EXAM_MAX

        ssa_part = _scale(ssa_co[co_idx], SSA_MAX, w_ssa[co_idx])
        cia_part = _scale(cia_co[co_idx], cia_max[co_idx], w_cia[co_idx])
        lab_part = _scale(avg_exp, exp_m, w_lab[co_idx])
        ce_part  = _scale(cia_e,   cia_m, w_ce[co_idx])
        co_parts[co_num] = {
            'ssa': ssa_part, 'cia': cia_part, 'lab': lab_part, 'ce': ce_part,
        }

    me_parts = [
        _scale(model_marks['co1'], model_marks['max']['co1'], w_me[0]) if model_marks else None,
        _scale(model_marks['co2'], model_marks['max']['co2'], w_me[1]) if model_marks else None,
        _scale(model_marks['co3'], model_marks['max']['co3'], w_me[2]) if model_marks else None,
        _scale(model_marks['co4'], model_marks['max']['co4'], w_me[3]) if model_marks else None,
        _scale(model_marks['co5'], model_marks['max']['co5'], w_me[4]) if model_marks else None,
    ]

    # CO total = SSA + CIA + LAB + CIAExam + ME for that CO
    co_totals = {}
    co_max_w  = {}
    for co_num in range(1, 5):
        p = co_parts[co_num]
        idx = co_num - 1
        vals = [v for v in (p['ssa'], p['cia'], p['lab'], p['ce'], me_parts[idx]) if v is not None]
        co_totals[co_num] = _round2(sum(vals)) if vals else None
        co_max_w[co_num]  = w_ssa[idx] + w_cia[idx] + w_lab[idx] + w_ce[idx] + w_me[idx]

    # CO5 → only ME-CO5
    me5_val = me_parts[4]
    co_totals[5] = me5_val
    co_max_w[5]  = w_me[4]

    all_vals = [v for v in co_totals.values() if v is not None]
    if not all_vals:
        return None

    base_total = _round2(sum(all_vals))

    # ── CQI ──
    cqi_rows = list(
        ObeCqiPublished.objects.filter(subject_id=subject.id)
        .filter(Q(teaching_assignment_id=ta_id) | Q(teaching_assignment__isnull=True))
        .order_by('-published_at')
    )
    cqi_row = _pick_scoped_row(cqi_rows, ta_id)
    cqi_entries = cqi_row.entries if cqi_row and isinstance(getattr(cqi_row, 'entries', None), dict) else {}
    cqi_nums    = cqi_row.co_numbers if cqi_row and isinstance(getattr(cqi_row, 'co_numbers', None), list) else []
    cqi_co_set  = {int(n) for n in cqi_nums if _safe_int(n) is not None}
    cqi_student = cqi_entries.get(str(sid)) or cqi_entries.get(sid) or {}

    total_add = 0.0
    cqi_add = {}
    for co in range(1, 6):
        if co not in cqi_co_set:
            continue
        base = co_totals.get(co)
        if base is None:
            continue
        inp = _safe_float((cqi_student or {}).get(f'co{co}'))
        add = _compute_cqi_add(co_value=base, co_max=co_max_w[co], input_mark=inp)
        total_add += add
        cqi_add[co] = _round2(add)

    total = _round2(base_total + total_add)
    if max_total > 0 and (base_total / max_total) * 100.0 < THRESHOLD_PERCENT:
        total = min(total, _round2((max_total * THRESHOLD_PERCENT) / 100.0))
    total = _clamp(total, 0.0, max_total)
    final_total = _round2(total)

    if not return_details:
        return final_total

    _raw_100 = (final_total / max_total) * 100.0 if max_total > 0 else None
    _total_100 = int(Decimal(str(float(_raw_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_100 is not None else None
    _raw_base_100 = (base_total / max_total) * 100.0 if max_total > 0 else None
    _base_total_100 = int(Decimal(str(float(_raw_base_100 or 0))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if _raw_base_100 is not None else None
    final_co = {}
    base_co  = {}
    for co in range(1, 6):
        b = co_totals.get(co)
        base_co[co] = _round2(b) if b is not None else None
        if b is not None:
            v = _round2(b + cqi_add.get(co, 0.0))
            v = _clamp(v, 0.0, co_max_w[co]) if co_max_w.get(co) else v
            final_co[co] = _round2(v)
        else:
            final_co[co] = None

    return {
        'total_40': final_total,
        'total_100': _total_100,
        'base_total_100': _base_total_100,
        'scaled_max': 100.0,
        'base_total_40': _round2(base_total),
        'base_co_values_40': {f'co{c}': base_co.get(c)  for c in range(1, 6)},
        'co_values_40':      {f'co{c}': final_co.get(c) for c in range(1, 6)},
        'co_max_40':         {f'co{c}': _safe_float(co_max_w.get(c)) for c in range(1, 6)},
        'cqi_add_40':        {f'co{c}': _safe_float(cqi_add.get(c)) for c in range(1, 6)},
        'is_qp1_final': False,
        'class_type': 'TCPL',
        'qp_type': None,
    }


# ─────────────────────────────────────────────────────────────────────────────

def recompute_final_internal_marks(*, actor_user_id=None, filters=None):
    from academics.models import TeachingAssignment
    from OBE.models import (
        Cia1Mark,
        Cia2Mark,
        Ssa1Mark,
        Ssa2Mark,
        Review1Mark,
        Review2Mark,
        Formative1Mark,
        Formative2Mark,
        ModelPublishedSheet,
        FinalInternalMark,
    )

    filters = filters or {}

    qs = TeachingAssignment.objects.filter(is_active=True).select_related(
        'subject',
        'curriculum_row',
        'curriculum_row__semester',
        'elective_subject',
        'elective_subject__semester',
        'section',
        'section__semester',
        'section__batch',
    )

    ta_id = filters.get('teaching_assignment_id')
    if ta_id:
        qs = qs.filter(id=int(ta_id))

    subject_code = _safe_text(filters.get('subject_code'))
    if subject_code:
        qs = qs.filter(
            Q(subject__code__iexact=subject_code)
            | Q(curriculum_row__course_code__iexact=subject_code)
            | Q(elective_subject__course_code__iexact=subject_code)
        )

    semester = filters.get('semester')
    if semester:
        sem_num = int(semester)
        qs = qs.filter(
            Q(section__semester__number=sem_num)
            | Q(curriculum_row__semester__number=sem_num)
            | Q(elective_subject__semester__number=sem_num)
        )

    processed_tas = 0
    upserted_rows = 0
    deleted_rows = 0

    for ta in qs.order_by('id'):
        subject = _resolve_subject_for_ta(ta)
        if subject is None:
            continue

        students = _students_for_ta(ta)
        if not students and getattr(ta, 'section_id', None) is None:
            fallback_student_ids = _student_ids_from_mark_rows_for_ta(subject.id, ta.id)
            if fallback_student_ids:
                students = _students_from_ids(fallback_student_ids)

        student_ids = [int(s['id']) for s in students]
        if not student_ids:
            continue

        cia1 = _assessment_map(Cia1Mark, 'mark', subject.id, student_ids, ta.id)
        cia2 = _assessment_map(Cia2Mark, 'mark', subject.id, student_ids, ta.id)
        ssa1 = _assessment_map(Ssa1Mark, 'mark', subject.id, student_ids, ta.id)
        ssa2 = _assessment_map(Ssa2Mark, 'mark', subject.id, student_ids, ta.id)
        review1 = _assessment_map(Review1Mark, 'mark', subject.id, student_ids, ta.id)
        review2 = _assessment_map(Review2Mark, 'mark', subject.id, student_ids, ta.id)
        formative1 = _assessment_map(Formative1Mark, 'total', subject.id, student_ids, ta.id)
        formative2 = _assessment_map(Formative2Mark, 'total', subject.id, student_ids, ta.id)

        model_map = {}
        model_qs = ModelPublishedSheet.objects.filter(subject_id=subject.id)
        model_qs = model_qs.filter(Q(teaching_assignment_id=ta.id) | Q(teaching_assignment__isnull=True)).order_by('-updated_at')
        model_row = model_qs.first()
        if model_row is not None:
            data = getattr(model_row, 'data', None)
            for sid in student_ids:
                model_map[sid] = _extract_model_total_for_student(data, sid)

        existing_qs = FinalInternalMark.objects.filter(subject=subject, teaching_assignment=ta)
        stale_ids = set(existing_qs.values_list('student_id', flat=True)) - set(student_ids)
        if stale_ids:
            deleted_rows += existing_qs.filter(student_id__in=stale_ids).delete()[0]

        ta_class_type = _resolve_class_type(ta)

        for sid in student_ids:
            student_ref = next((s for s in students if int(s['id']) == int(sid)), {'id': sid, 'reg_no': ''})
            total = _compute_weighted_final_total_theory_like(
                ta=ta,
                subject=subject,
                student=student_ref,
                ta_id=ta.id,
            )

            # PRBL: dedicated multi-exam calculation (SSA1, Review1, SSA2, Review2, Review3/Model → /60)
            if total is None and ta_class_type == 'PRBL':
                prbl_result = _compute_prbl_final_total(
                    ta=ta, subject=subject, student=student_ref, ta_id=ta.id,
                )
                if prbl_result is not None:
                    total = prbl_result

            # ENGLISH: dedicated 3-cycle calculation (SSA1+FA1+CIA1 / SSA2+FA2+CIA2 / Model → /60)
            if total is None and ta_class_type == 'ENGLISH':
                english_result = _compute_english_final_total(
                    ta=ta, subject=subject, student=student_ref, ta_id=ta.id,
                )
                if english_result is not None:
                    total = english_result

            # FOREIGN_LANG: same 3-cycle structure as ENGLISH, separate class-type
            if total is None and ta_class_type == 'FOREIGN_LANG':
                fl_result = _compute_foreign_lang_final_total(
                    ta=ta, subject=subject, student=student_ref, ta_id=ta.id,
                )
                if fl_result is not None:
                    total = fl_result

            # TCPR: Theory-like but with Review1/Review2 instead of Formatives
            if total is None and ta_class_type == 'TCPR':
                tcpr_result = _compute_tcpr_final_total(
                    ta=ta, subject=subject, student=student_ref, ta_id=ta.id,
                )
                if tcpr_result is not None:
                    total = tcpr_result

            # PROJECT: Review1 + Review2 weighted (total /100)
            if total is None and ta_class_type == 'PROJECT':
                proj_result = _compute_project_final_total(
                    ta=ta, subject=subject, student=student_ref, ta_id=ta.id,
                )
                if proj_result is not None:
                    total = proj_result

            # LAB / PRACTICAL: lab cycle experiment+CIA marks
            if total is None and ta_class_type in ('LAB', 'PRACTICAL'):
                lab_result = _compute_lab_final_total(
                    ta=ta, subject=subject, student=student_ref, ta_id=ta.id,
                    class_type=ta_class_type,
                )
                if lab_result is not None:
                    total = lab_result

            # TCPL: 21-slot schema (SSA+CIA+Lab+CIAExam per CO + Model)
            if total is None and ta_class_type == 'TCPL':
                tcpl_result = _compute_tcpl_final_total(
                    ta=ta, subject=subject, student=student_ref, ta_id=ta.id,
                )
                if tcpl_result is not None:
                    total = tcpl_result

            if total is None:
                # Raw-sum fallback is only valid for THEORY-like courses whose
                # component marks are already on the 0-40 scale.
                # All other types now have dedicated compute functions above; skip fallback for them.
                _skip_fallback_types = {'TCPL', 'LAB', 'PRACTICAL', 'TCPR', 'PROJECT'}
                if ta_class_type not in _skip_fallback_types:
                    parts = [
                        formative1.get(sid),
                        formative2.get(sid),
                        ssa1.get(sid),
                        ssa2.get(sid),
                        review1.get(sid),
                        review2.get(sid),
                        cia1.get(sid),
                        cia2.get(sid),
                        model_map.get(sid),
                    ]
                    parts = [p for p in parts if p is not None]
                    total = round(sum(parts), 2) if parts else None
                    if total is not None:
                        total = max(0.0, min(40.0, total))

            # max_mark: PROJECT uses 100, PRBL/ENGLISH/FOREIGN_LANG use 60, others use 40
            if ta_class_type == 'PROJECT':
                prbl_max_mark = 100
            elif ta_class_type in {'PRBL', 'ENGLISH', 'FOREIGN_LANG'}:
                prbl_max_mark = 60
            else:
                prbl_max_mark = 40

            FinalInternalMark.objects.update_or_create(
                subject=subject,
                student_id=sid,
                teaching_assignment=ta,
                defaults={
                    'final_mark': total,
                    'max_mark': prbl_max_mark,
                    'computed_from': 'INTERNAL_MARK_PAGE_TOTAL',
                    'computed_by': actor_user_id,
                },
            )
            upserted_rows += 1

        processed_tas += 1

    return {
        'processed_teaching_assignments': processed_tas,
        'upserted_rows': upserted_rows,
        'deleted_rows': deleted_rows,
    }
