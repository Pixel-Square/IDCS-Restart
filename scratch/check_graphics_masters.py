import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumMaster

masters = CurriculumMaster.objects.filter(course_code='GEA1105')
print(f"Total master rows for GEA1105: {masters.count()}")
for m in masters:
    print(f"ID: {m.id} | Code: {m.course_code} | Name: {m.course_name} | Reg: {m.regulation.name if m.regulation else None} | IsElective: {m.is_elective} | IsDeptCore: {m.is_dept_core}")

masters_name = CurriculumMaster.objects.filter(course_name__icontains='graphics')
print(f"\nTotal master rows matching 'graphics' in name: {masters_name.count()}")
for m in masters_name:
    print(f"ID: {m.id} | Code: {m.course_code} | Name: {m.course_name} | Reg: {m.regulation.name if m.regulation else None} | IsElective: {m.is_elective} | IsDeptCore: {m.is_dept_core}")
