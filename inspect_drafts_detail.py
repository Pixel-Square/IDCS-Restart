import os
import sys
import json

sys.path.insert(0, '/home/iqac2/Desktop/idcs-mt/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django
django.setup()

from academics.models import TeachingAssignment
from OBE.models import AssessmentDraft, ModelPublishedSheet

ta_id = 297
model_draft = AssessmentDraft.objects.filter(teaching_assignment_id=ta_id, assessment='model').first()
if model_draft:
    print("Model draft keys:", list(model_draft.data.keys()))
    ts = model_draft.data.get('theorySheet')
    if ts and isinstance(ts, dict):
        print("TheorySheet keys:", list(ts.keys()))
        rows_by = ts.get('rowsByStudentId')
        if rows_by:
            sample_k = list(rows_by.keys())[0]
            print(f"Sample in theorySheet.rowsByStudentId ({sample_k}):", rows_by[sample_k])
    tc = model_draft.data.get('tcplSheet')
    if tc and isinstance(tc, dict):
        print("TcplSheet keys:", list(tc.keys()))
        rows_by = tc.get('rowsByStudentId')
        if rows_by:
            sample_k = list(rows_by.keys())[0]
            print(f"Sample in tcplSheet.rowsByStudentId ({sample_k}):", rows_by[sample_k])

# Check Formative draft
f1_draft = AssessmentDraft.objects.filter(teaching_assignment_id=ta_id, assessment='formative1').first()
if f1_draft:
    print("\nFormative1 draft:", f1_draft.data)

# Check SSA1 draft
ssa1_draft = AssessmentDraft.objects.filter(teaching_assignment_id=ta_id, assessment='ssa1').first()
if ssa1_draft:
    print("\nSSA1 draft rows sample:", ssa1_draft.data.get('sheet', {}).get('rows', [])[:3])
