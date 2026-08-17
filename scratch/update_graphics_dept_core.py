import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from curriculum.models import CurriculumMaster, CurriculumDepartment
from django.db import transaction

with transaction.atomic():
    masters = CurriculumMaster.objects.filter(course_code='GEA1105')
    master_count = masters.update(is_dept_core=True)
    print(f"Updated {master_count} CurriculumMaster rows.")

    dept_rows = CurriculumDepartment.objects.filter(course_code='GEA1105')
    dept_count = dept_rows.update(is_dept_core=True)
    print(f"Updated {dept_count} CurriculumDepartment rows.")
