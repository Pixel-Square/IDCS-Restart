import os
import sys
import json

sys.path.insert(0, '/home/iqac2/Desktop/idcs-mt/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django
django.setup()

from academics.models import StudentProfile
from discipline.models import DisciplineCategory

students = []
qs = StudentProfile.objects.select_related('user', 'home_department', 'section', 'section__batch').filter(status__in=['ACTIVE', 'active', 'Active'])
for st in qs:
    u = st.user
    full_name = f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip()
    dept = st.home_department
    if not dept and st.section and st.section.batch:
        course = getattr(st.section.batch, 'course', None)
        dept = (getattr(course, 'department', None) if course else None) or getattr(st.section.batch, 'department', None)
    dept_name = getattr(dept, 'short_name', None) or getattr(dept, 'code', None) or getattr(dept, 'name', '')
    batch_label = st.batch or (st.section.batch.name if st.section and st.section.batch else '')
    students.append({
        'id': st.id,
        'reg_no': st.reg_no,
        'name': full_name or getattr(u, 'username', st.reg_no),
        'username': getattr(u, 'username', ''),
        'department': dept_name,
        'batch': batch_label,
        'section': getattr(st.section, 'name', '') if st.section else '',
        'status': st.status,
        'profile_image': str(st.profile_image or getattr(u, 'profile_image', '') or ''),
    })

categories = []
for c in DisciplineCategory.objects.filter(is_active=True):
    categories.append({
        'id': c.id,
        'title': c.title,
        'description': c.description or '',
        'severity': c.severity,
        'require_comment': c.require_comment,
        'is_active': c.is_active,
    })

payload = {
    'version': '2.0',
    'last_synced': '2026-10-11T14:30:00Z',
    'total_students': len(students),
    'students': students,
    'categories': categories,
}

out_path = '/home/iqac2/Desktop/idcs-mt/KR Tracker/assets/offline_data.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(payload, f, indent=2)

print(f"SUCCESS: Wrote {len(students)} students and {len(categories)} categories to {out_path}")
