"""Diagnostic: inspect TCPR course AGI1252 MODEL marks."""
import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from academics.models import TeachingAssignment
from OBE.services.final_internal_marks import (
    _resolve_class_type, _resolve_subject_for_ta,
    _compute_tcpr_final_total, _get_qp_pattern, _get_model_sheet_data,
    _extract_model_co_marks_for_student, _get_internal_weight_slots,
    _safe_float as _sf,
)
from OBE.models import FinalInternalMark

TA_ID = 98  # AGI1252 section A
ta = TeachingAssignment.objects.select_related('subject', 'curriculum_row', 'elective_subject', 'section__batch').get(id=TA_ID)
subject = _resolve_subject_for_ta(ta) or ta.subject
ct = str(_resolve_class_type(ta) or '').upper()
batch_id = getattr(getattr(ta, 'section', None), 'batch_id', None)

print(f'TA={TA_ID}, code={subject.code}, class_type={ct}')

# Weights
weights = _get_internal_weight_slots(ct)
print(f'Weights ({len(weights)} slots): {weights}')
print(f'Sum: {sum(weights)}')

# Model pattern  
model_pattern = _get_qp_pattern(class_type=ct, qp_type=None, exam='MODEL', batch_id=batch_id)
print(f'\nModel pattern: {model_pattern}')

# Model sheet
model_sheet = _get_model_sheet_data(subject.id, TA_ID, ct)
sheet_keys = sorted(model_sheet.keys())[:15] if isinstance(model_sheet, dict) else []
print(f'Model sheet top keys: {sheet_keys}')

# Get students
fims = FinalInternalMark.objects.filter(teaching_assignment_id=TA_ID).select_related('student').order_by('student_id')[:3]
for fim in fims:
    sp = fim.student
    sid = sp.id
    reg = getattr(sp, 'reg_no', '')
    print(f'\n--- Student {sid} ({reg}) ---')
    print(f'  Stored FIM: mark={fim.final_mark}, max={fim.max_mark}')
    
    row_data = None
    if isinstance(model_sheet, dict):
        row_data = model_sheet.get(f'id:{sid}') or model_sheet.get(f'reg:{reg}')
    if isinstance(row_data, dict):
        print(f'  Model row keys: {sorted(row_data.keys())}')
        q_data = row_data.get('q')
        if isinstance(q_data, dict):
            q_keys = sorted(q_data.keys())
            print(f'  q keys: {q_keys}')
            for k in q_keys[:15]:
                print(f'    {k} = {q_data[k]}')
        print(f'  lab: {row_data.get("lab")}')
        print(f'  review: {row_data.get("review")}')
        print(f'  absent: {row_data.get("absent")}')
    
    model_marks = _extract_model_co_marks_for_student(
        model_sheet=model_sheet, student_id=sid, reg_no=reg, model_pattern=model_pattern, class_type=ct
    )
    if model_marks:
        print(f'  model marks: {model_marks}')
    
    ref = {'id': sid, 'reg_no': reg}
    result = _compute_tcpr_final_total(ta=ta, subject=subject, student=ref, ta_id=TA_ID, return_details=True)
    if isinstance(result, dict):
        print(f'  TCPR FIM: total_40={result.get("total_40")}, total_100={result.get("total_100")}')
        print(f'  co_values_40={result.get("co_values_40")}')
