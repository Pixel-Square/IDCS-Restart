"""
Mark Calculation Service for Academic 2.1

Handles:
- Weighted mark calculation per (exam, CO)
- Internal mark totals computation
- CO attainment calculations
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Any
import ast
import math
import re


def round2(value: float) -> Decimal:
    """Round to 2 decimal places."""
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _norm_exam_key(value: str) -> str:
    return str(value or '').strip().lower()


def _normalize_cqi_expr(expr: str, allowed_names: set) -> str:
    s = str(expr or '').strip()
    if not s:
        return ''
    s = re.sub(r'\]\s+\[', '] + [', s)
    def repl(match):
        key = str(match.group(1) or '').strip().upper()
        return key if key in allowed_names else '0'
    return re.sub(r'\[([A-Za-z0-9_-]+)\]', repl, s)


_ALLOWED_CQI_FUNCS = {
    'min': min,
    'max': max,
    'abs': abs,
    'round': round,
    'sqrt': math.sqrt,
    'floor': math.floor,
    'ceil': math.ceil,
}


def _safe_eval_cqi_num(expr: str, vars_map: dict) -> float:
    allowed_names = set(str(k).upper() for k in (vars_map or {}).keys())
    expr_n = _normalize_cqi_expr(expr, allowed_names)
    if not expr_n:
        return float(vars_map.get('CQI', 0) or 0)
    try:
        tree = ast.parse(expr_n, mode='eval')
    except Exception:
        return float(vars_map.get('CQI', 0) or 0)

    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            return float(node.value) if isinstance(node.value, (int, float)) else 0.0
        if isinstance(node, ast.Num):
            return float(node.n)
        if isinstance(node, ast.Name):
            return float(vars_map.get(str(node.id or '').upper(), 0) or 0)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = _eval(node.operand)
            return value if isinstance(node.op, ast.UAdd) else -value
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)):
            left = _eval(node.left)
            right = _eval(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right if right else 0.0
            if isinstance(node.op, ast.Mod):
                return left % right if right else 0.0
            if isinstance(node.op, ast.Pow):
                return left ** right
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            fn = _ALLOWED_CQI_FUNCS.get(node.func.id)
            if not fn:
                return 0.0
            args = [_eval(arg) for arg in (node.args or [])]
            try:
                return float(fn(*args))
            except Exception:
                return 0.0
        return 0.0

    try:
        return float(_eval(tree))
    except Exception:
        return float(vars_map.get('CQI', 0) or 0)


def _safe_eval_cqi_bool(expr: str, vars_map: dict) -> bool:
    allowed_names = set(str(k).upper() for k in (vars_map or {}).keys())
    expr_n = _normalize_cqi_expr(expr, allowed_names)
    if not expr_n:
        return False
    expr_n = expr_n.replace('&&', ' and ')
    expr_n = expr_n.replace('||', ' or ')
    expr_n = re.sub(r'\bAND\b', 'and', expr_n, flags=re.IGNORECASE)
    expr_n = re.sub(r'\bOR\b', 'or', expr_n, flags=re.IGNORECASE)
    try:
        tree = ast.parse(expr_n, mode='eval')
    except Exception:
        return False

    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Num):
            return node.n
        if isinstance(node, ast.Name):
            return float(vars_map.get(str(node.id or '').upper(), 0) or 0)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub, ast.Not)):
            value = _eval(node.operand)
            if isinstance(node.op, ast.Not):
                return not bool(value)
            return value if isinstance(node.op, ast.UAdd) else -float(value or 0)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow)):
            left = float(_eval(node.left) or 0)
            right = float(_eval(node.right) or 0)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right if right else 0.0
            if isinstance(node.op, ast.Mod):
                return left % right if right else 0.0
            if isinstance(node.op, ast.Pow):
                return left ** right
        if isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
            values = [_eval(v) for v in (node.values or [])]
            return all(bool(v) for v in values) if isinstance(node.op, ast.And) else any(bool(v) for v in values)
        if isinstance(node, ast.Compare):
            left = float(_eval(node.left) or 0)
            ok = True
            for op, comp in zip(node.ops or [], node.comparators or []):
                right = float(_eval(comp) or 0)
                if isinstance(op, ast.Eq):
                    ok = ok and (left == right)
                elif isinstance(op, ast.NotEq):
                    ok = ok and (left != right)
                elif isinstance(op, ast.Lt):
                    ok = ok and (left < right)
                elif isinstance(op, ast.LtE):
                    ok = ok and (left <= right)
                elif isinstance(op, ast.Gt):
                    ok = ok and (left > right)
                elif isinstance(op, ast.GtE):
                    ok = ok and (left >= right)
                left = right
            return ok
        return False

    try:
        return bool(_eval(tree))
    except Exception:
        return False


def _build_cqi_if_from_clauses(clauses) -> str:
    parts = []
    for idx, clause in enumerate(clauses or []):
        if not isinstance(clause, dict):
            continue
        token = str(clause.get('token') or '').strip().upper()
        rhs = re.sub(r'\]\s+\[', '] + [', str(clause.get('rhs') or '').strip())
        if token not in {'BEFORE_CQI', 'AFTER_CQI', 'TOTAL_CQI'} or not rhs:
            continue
        if idx == 0 and token == 'BEFORE_CQI':
            is_comparator_only = bool(re.match(r'^(<=|>=|==|!=|=|<|>)', rhs))
            parts.append(f'([{token}] {rhs})' if is_comparator_only else f'({rhs})')
        else:
            parts.append(f'([{token}] {rhs})')
    return ' && '.join(part for part in parts if part)


def _resolve_cqi_if_expr(cond: dict) -> str:
    clauses = cond.get('if_clauses') if isinstance(cond.get('if_clauses'), list) else []
    built = _build_cqi_if_from_clauses(clauses)
    if built:
        return built
    return str(cond.get('if', '') or '').strip()


def calculate_weighted_mark(
    raw_mark: float,
    max_mark: float,
    weight: float,
    out_of: float = 40
) -> Optional[Decimal]:
    """
    Calculate weighted mark from raw mark.
    
    Formula: (raw_mark / max_mark) * weight * (out_of / 100)
    
    Example: raw=45, max=50, weight=15% (of 40)
    weighted = (45/50) * 15 * (40/100) = 0.9 * 15 * 0.4 = 5.4
    
    But typically weight is already the target value (e.g., 5% of 40 = 2.0 max)
    So: weighted = (raw_mark / max_mark) * (weight / 100 * out_of)
    """
    if max_mark <= 0 or raw_mark is None:
        return None
    
    percentage = raw_mark / max_mark
    weighted = percentage * (weight / 100) * out_of
    return round2(weighted)


def calculate_co_weighted_marks(
    student_mark: Any,  # AcV2StudentMark instance
    exam_assignment: Any,  # AcV2ExamAssignment instance
    class_type_config: Optional[Any] = None,  # AcV2ClassType instance
    out_of: float = 40
) -> Dict[str, Decimal]:
    """
    Calculate weighted marks per CO for a student's exam.
    
    Returns: {"SSA1_CO1": 2.3, "SSA1_CO2": 2.4, ...}
    """
    result = {}
    
    if student_mark.is_absent or student_mark.is_exempted:
        return result
    
    exam = exam_assignment.exam
    weight = float(exam_assignment.weight)
    max_marks = float(exam_assignment.max_marks)
    covered_cos = exam_assignment.covered_cos or []
    
    if not covered_cos or weight <= 0:
        return result
    
    # Get CO marks from student
    co_marks = {
        1: float(student_mark.co1_mark or 0),
        2: float(student_mark.co2_mark or 0),
        3: float(student_mark.co3_mark or 0),
        4: float(student_mark.co4_mark or 0),
        5: float(student_mark.co5_mark or 0),
    }
    
    # Calculate max marks per CO (divide equally among covered COs)
    max_per_co = max_marks / len(covered_cos)
    
    # Weight per CO (divide weight equally)
    weight_per_co = weight / len(covered_cos)
    
    for co in covered_cos:
        if 1 <= co <= 5:
            raw = co_marks.get(co, 0)
            weighted = calculate_weighted_mark(raw, max_per_co, weight_per_co, out_of)
            if weighted is not None:
                key = f"{exam}_CO{co}"
                result[key] = weighted
    
    return result


def calculate_internal_totals(
    weighted_marks: Dict[str, Any]
) -> Dict[str, Decimal]:
    """
    Calculate CO totals and final mark from weighted_marks dict.
    
    Input: {"SSA1_CO1": 2.3, "SSA1_CO2": 2.4, "CIA1_CO1": 4.8, ...}
    Output: {"co1_total": 7.1, "co2_total": ..., "final_mark": ...}
    """
    co_totals = {1: Decimal('0'), 2: Decimal('0'), 3: Decimal('0'), 
                 4: Decimal('0'), 5: Decimal('0')}
    
    for key, value in weighted_marks.items():
        if value is None:
            continue
        # Key format: "SSA1_CO1", "CIA1_CO2", etc.
        parts = key.split('_')
        if len(parts) == 2 and parts[1].startswith('CO'):
            try:
                co_num = int(parts[1][2:])
                if 1 <= co_num <= 5:
                    co_totals[co_num] += Decimal(str(value))
            except (ValueError, TypeError):
                continue
    
    result = {
        'co1_total': round2(float(co_totals[1])),
        'co2_total': round2(float(co_totals[2])),
        'co3_total': round2(float(co_totals[3])),
        'co4_total': round2(float(co_totals[4])),
        'co5_total': round2(float(co_totals[5])),
    }
    
    result['final_mark'] = round2(sum(float(v) for v in co_totals.values()))
    
    return result


def compute_section_internal_marks(section) -> List[Dict]:
    """
    Compute internal marks for all students in a section.
    
    Aggregates weighted marks from all exam assignments.
    """
    from academics.models import StudentSectionAssignment
    from ..models import AcV2CqiAttained, AcV2InternalMark, AcV2StudentMark
    
    # Get all exam assignments for this section
    exam_assignments = section.exam_assignments.filter(
        status__in=['PUBLISHED', 'LOCKED']
    ).select_related('section__course__class_type')
    
    if not exam_assignments.exists():
        return []
    
    # Get class type for out_of value
    class_type = section.course.class_type
    out_of = float(class_type.total_internal_marks) if class_type else 40
    
    # Collect all student marks
    student_weighted = {}  # student_id -> {key: value}
    student_info = {}  # student_id -> {reg_no, name}
    
    for ea in exam_assignments:
        marks = AcV2StudentMark.objects.filter(exam_assignment=ea)
        
        for sm in marks:
            sid = str(sm.student_id)
            
            if sid not in student_weighted:
                student_weighted[sid] = {}
                student_info[sid] = {
                    'reg_no': sm.reg_no,
                    'name': sm.student_name,
                    'student_id': sm.student_id,
                }
            
            # Calculate weighted marks for this exam
            wm = calculate_co_weighted_marks(sm, ea, class_type, out_of)
            student_weighted[sid].update(wm)

    # CQI entries are already authored in internal-mark space by the CQI config.
    # They should be added directly to weighted_marks without applying exam weight.
    cqi_attained = AcV2CqiAttained.objects.filter(teaching_assignment=section.teaching_assignment).first()
    cqi_entries = cqi_attained.entries if cqi_attained and isinstance(cqi_attained.entries, dict) else {}
    ct_configs = class_type.exam_assignments if class_type and isinstance(class_type.exam_assignments, list) else []
    cqi_config_by_key = {}
    for conf in ct_configs:
        if not isinstance(conf, dict) or str(conf.get('kind') or '').strip().lower() != 'cqi':
            continue
        key = _norm_exam_key(conf.get('exam_display_name') or conf.get('exam'))
        if key:
            cqi_config_by_key[key] = conf.get('cqi') or {}

    roster = {
        str(sa.student_id): {
            'student_id': sa.student_id,
            'reg_no': getattr(sa.student, 'reg_no', ''),
            'name': str(getattr(sa.student, 'user', '') or getattr(sa.student, 'reg_no', '')),
        }
        for sa in StudentSectionAssignment.objects.filter(
            section=section.teaching_assignment.section,
            end_date__isnull=True,
        ).select_related('student__user')
    }

    if cqi_config_by_key and isinstance(cqi_entries, dict):
        all_exam_assignments = list(section.exam_assignments.all())
        for ea in all_exam_assignments:
            ea_key = _norm_exam_key(getattr(ea, 'exam_display_name', '') or getattr(ea, 'exam', ''))
            cqi_sub = cqi_config_by_key.get(ea_key)
            if not isinstance(cqi_sub, dict):
                continue
            conds = cqi_sub.get('conditions', []) if isinstance(cqi_sub.get('conditions'), list) else []
            else_expr = str(cqi_sub.get('else_formula', '') or '')
            legacy_value_expr = str(cqi_sub.get('co_value_expr', '') or '')
            covered_cos = [int(c) for c in (ea.covered_cos or []) if isinstance(c, int) and 1 <= int(c) <= 5]
            if not covered_cos:
                covered_cos = [int(c) for c in (cqi_sub.get('cos') or []) if str(c).isdigit() and 1 <= int(c) <= 5]
            if not covered_cos:
                continue

            student_ids = set(student_weighted.keys()) | set(str(k) for k in cqi_entries.keys())
            for sid in student_ids:
                if sid not in student_weighted:
                    student_weighted[sid] = {}
                if sid not in student_info and sid in roster:
                    student_info[sid] = roster[sid]
                if sid not in student_info:
                    continue

                co_totals = {i: Decimal('0') for i in range(1, 6)}
                for key, value in student_weighted[sid].items():
                    if value is None:
                        continue
                    match = re.search(r'_CO(\d+)$', str(key))
                    if not match:
                        continue
                    co_idx = int(match.group(1))
                    if 1 <= co_idx <= 5:
                        co_totals[co_idx] += Decimal(str(value))

                for co_n in covered_cos:
                    raw_in = cqi_entries.get(sid, {}).get(f'co{co_n}') if isinstance(cqi_entries.get(sid), dict) else None
                    if raw_in is None:
                        continue
                    try:
                        cqi_in = float(raw_in)
                    except Exception:
                        continue

                    before_co = float(co_totals[co_n])
                    before_total_all = float(sum(co_totals.values()))
                    vars_map = {
                        'CQI': cqi_in,
                        'X': cqi_in,
                        'BEFORE_CQI': before_co,
                        'AFTER_CQI': before_co + cqi_in,
                        'TOTAL_CQI': before_total_all + cqi_in,
                    }

                    mapped = None
                    for cond in conds:
                        if not isinstance(cond, dict):
                            continue
                        if_expr = _resolve_cqi_if_expr(cond)
                        then_expr = str(cond.get('then', '') or '').strip()
                        if if_expr and _safe_eval_cqi_bool(if_expr, vars_map):
                            mapped = _safe_eval_cqi_num(then_expr, vars_map) if then_expr else cqi_in
                            break

                    if mapped is None:
                        if else_expr.strip():
                            mapped = _safe_eval_cqi_num(else_expr, vars_map)
                        elif legacy_value_expr.strip():
                            mapped = _safe_eval_cqi_num(legacy_value_expr, vars_map)
                        else:
                            mapped = cqi_in

                    mapped = round(float(mapped or 0.0), 2)
                    key = f"{ea.exam}_CO{co_n}"
                    student_weighted[sid][key] = mapped
                    co_totals[co_n] = Decimal(str(round(float(co_totals[co_n]) + mapped, 2)))
    
    # Update or create internal marks
    results = []
    for sid, weighted in student_weighted.items():
        info = student_info[sid]
        totals = calculate_internal_totals(weighted)
        
        internal_mark, created = AcV2InternalMark.objects.update_or_create(
            section=section,
            student_id=info['student_id'],
            defaults={
                'reg_no': info['reg_no'],
                'student_name': info['name'],
                'weighted_marks': {k: float(v) for k, v in weighted.items()},
                'co1_total': totals['co1_total'],
                'co2_total': totals['co2_total'],
                'co3_total': totals['co3_total'],
                'co4_total': totals['co4_total'],
                'co5_total': totals['co5_total'],
                'final_mark': totals['final_mark'],
                'max_mark': out_of,
            }
        )
        
        results.append({
            'id': str(internal_mark.id),
            'reg_no': info['reg_no'],
            'name': info['name'],
            'weighted_marks': weighted,
            **totals,
        })
    
    return results
