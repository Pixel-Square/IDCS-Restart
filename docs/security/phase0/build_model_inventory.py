"""Schema-only inventory (no row data is read).

Run with: manage.py shell < inventory.py  (from backend/)
Writes JSON to the path in INVENTORY_OUT.
"""
import json
import os
import re

from django.apps import apps
from django.db import models

LOCAL = {
    'accounts', 'college', 'curriculum', 'academics', 'timetable', 'pbas', 'staff_attendance', 'idcsscan',
    'feedback', 'academic_calendar', 'applications', 'OBE', 'academic_v2', 'COE', 'question_bank',
    'template_api', 'reporting', 'announcements', 'lms', 'coder', 'discipline', 'audits', 'hostel',
    'staff_requests', 'staff_salary',
}

# Personal-data categories by field-name pattern.
PII = [
    ('aadhaar', r'aadh?a+r|uid(_?no)?$'),
    ('bank', r'bank|ifsc|account_?(no|number)|passbook|upi'),
    ('health_disability', r'disab|health|medical|blood|allerg|pwd|differently'),
    ('biometric', r'finger|biometric|template_b64|face_?(enc|emb)'),
    ('dob_age', r'(^|_)dob$|birth|(^|_)age$'),
    ('phone', r'phone|mobile|whatsapp|contact_?no'),
    ('email', r'email'),
    ('address', r'address|street|city|pincode|postal|district|state$'),
    ('guardian', r'father|mother|parent|guardian'),
    ('photo', r'photo|image|avatar|picture|selfie'),
    ('identity_docs', r'pan_?(no|number)?$|passport|voter|license|community_cert|caste|religion|community'),
    ('gender', r'gender|sex$'),
    ('marks_grades', r'mark|grade|score|cgpa|sgpa|result|attain'),
    ('fees_money', r'fee|amount|fine|salary|payment|paid|due|receipt|refund'),
    ('attendance', r'attendance|present|absent'),
    ('discipline', r'incident|disciplin|offen|penalt'),
    ('location', r'latitude|longitude|gps|location'),
    ('name', r'(^|_)(first|last|full|student|staff)?_?name$'),
    ('ip_device', r'(^|_)ip(_address)?$|user_agent|device_id'),
    ('credentials', r'password|otp|token|secret|login_code|pin$'),
]

out = {'models': []}
for m in apps.get_models():
    label = m._meta.app_label
    if label not in LOCAL:
        continue
    fields = []
    college_fk = None
    for f in m._meta.get_fields():
        if not getattr(f, 'concrete', False):
            continue
        name = f.name
        rel = f.related_model._meta.label if getattr(f, 'related_model', None) else None
        if rel == 'college.College':
            college_fk = {'field': name, 'null': f.null}
        cats = [c for c, rx in PII if re.search(rx, name, re.I)]
        if cats:
            fields.append({'name': name, 'type': f.get_internal_type(), 'cats': cats})
    uniques = [list(u) for u in (m._meta.unique_together or [])]
    for c in m._meta.constraints:
        if isinstance(c, models.UniqueConstraint):
            uniques.append(list(c.fields))
    for f in m._meta.concrete_fields:
        if getattr(f, 'unique', False) and not f.primary_key:
            uniques.append([f.name])
    fks = sorted({f.related_model._meta.label for f in m._meta.concrete_fields if f.is_relation and f.related_model})
    out['models'].append({
        'label': m._meta.label, 'db_table': m._meta.db_table, 'college_fk': college_fk,
        'pii': fields, 'uniques': uniques, 'fks': fks,
    })

with open(os.environ['INVENTORY_OUT'], 'w', encoding='utf-8') as fh:
    json.dump(out, fh, indent=1)
print('models:', len(out['models']))
