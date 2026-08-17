import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Section, TeachingAssignment
from academic_v2.models import AcV2Section

def is_shared(sec):
    # Match frontend checks
    code = getattr(sec, 'department_short_name', None)
    dept_id = getattr(sec, 'department_id', None)
    return code == 'S&H' or dept_id is None

for ta_id in [477, 479, 476, 478, 328, 331, 25, 459, 389, 392]:
    ta = TeachingAssignment.objects.get(id=ta_id)
    sec = ta.section
    is_sh = is_shared(sec)
    print(f"TA {ta_id}: Staff: {ta.staff} | Sec: {sec} (Shared: {is_sh}) | Curric Row: {ta.curriculum_row_id}")
    
    # Linked AcV2Section
    acv2_secs = AcV2Section.objects.filter(teaching_assignment=ta)
    print(f"  Linked AcV2Sections count: {acv2_secs.count()}")
    for asec in acv2_secs:
        print(f"    AcV2Section ID: {asec.id} | Name: {asec.section_name} | Faculty User: {asec.faculty_user}")
