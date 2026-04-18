"""
Mark Calculation Service for Academic 2.1

Handles:
- Weighted mark calculation per (exam, CO)
- Internal mark totals computation
- CO attainment calculations
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Any


def round2(value: float) -> Decimal:
    """Round to 2 decimal places."""
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


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
    from ..models import AcV2InternalMark, AcV2StudentMark
    
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
