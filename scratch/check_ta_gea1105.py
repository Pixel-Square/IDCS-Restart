import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import TeachingAssignment

print("=== Teaching Assignments for GEA1105 ===")
tas = TeachingAssignment.objects.filter(curriculum_row__course_code='GEA1105')
print(f"Total: {tas.count()}")
for ta in tas:
    cr = ta.curriculum_row
    print(f"TA ID: {ta.id} | Section: {ta.section.name if ta.section else None} ({ta.section.id if ta.section else None}) | CurRow ID: {cr.id if cr else None} | Dept: {cr.department.code if cr and cr.department else None} | Staff: {ta.staff.user.username if ta.staff and ta.staff.user else None} | IsActive: {ta.is_active}")
