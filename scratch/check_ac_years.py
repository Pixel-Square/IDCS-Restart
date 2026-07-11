import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import AcademicYear, TeachingAssignment

print("=== Academic Years ===")
for ay in AcademicYear.objects.all():
    print(f"ID: {ay.id} | Name: {ay.name} | Is Active: {ay.is_active}")

print("\n=== Recent Teaching Assignments ===")
for ta in TeachingAssignment.objects.order_by('-id')[:20]:
    print(f"ID: {ta.id} | Staff: {ta.staff} | Section: {ta.section} | Curric Row: {ta.curriculum_row_id} | Academic Year ID: {ta.academic_year_id} ({ta.academic_year.name}) | Is Active: {ta.is_active}")
