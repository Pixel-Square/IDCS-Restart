import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from timetable.views import SectionTimetableView, SectionSubjectsStaffView
from timetable.serializers import get_teaching_assignments_for_section_and_curriculum
from django.contrib.auth import get_user_model
from academics.models import Section
from curriculum.models import CurriculumDepartment
from timetable.models import TimetableAssignment

User = get_user_model()
admin_user = User.objects.filter(is_superuser=True).first()

factory = APIRequestFactory()

print("🔍 1. Testing get_teaching_assignments_for_section_and_curriculum helper...")
section_id = 41  # S&H A
section = Section.objects.get(pk=section_id)
print(f"Section: {section} (ID: {section_id})")

# Let's find some curriculum rows for this section
from curriculum.models import CurriculumDepartment
curriculum_rows = CurriculumDepartment.objects.filter(semester__number=section.semester.number)

# Find subjects that have multiple teaching assignments or assignments in S&H
print("\nResolving teaching assignments for curriculum rows:")
found_any_multi = False
for cr in curriculum_rows:
    tas = get_teaching_assignments_for_section_and_curriculum(section, cr)
    if tas:
        staff_names = [getattr(sp.user, 'username', sp.staff_id) for sp in tas]
        print(f"  Row ID {cr.id} | Code: {cr.course_code} | Name: {cr.course_name} -> Resolved Staff: {staff_names}")
        if len(tas) > 1:
            found_any_multi = True
            print("    👉 Found multi-faculty assignment!")

# Let's test SectionTimetableView
print("\n🔍 2. Requesting SectionTimetableView for Section 41...")
req = factory.get(f'/api/timetable/section/{section_id}/timetable/')
force_authenticate(req, user=admin_user)
view = SectionTimetableView.as_view()
res = view(req, section_id=section_id)
print(f"Status: {res.status_code}")

results = res.data.get('results', [])
print(f"Total days returned: {len(results)}")

assigned_periods_count = 0
for day_obj in results:
    day = day_obj.get('day')
    assignments = day_obj.get('assignments', [])
    print(f"\nDay {day} assignments:")
    for a in assignments:
        assigned_periods_count += 1
        subj = a.get('subject_text') or a.get('curriculum_row', {}).get('course_name') or 'Unassigned'
        staff_info = a.get('staff')
        staff_display = "None"
        if staff_info:
            staff_display = f"ID: {staff_info.get('id')} | Code: {staff_info.get('staff_id')} | Name: {staff_info.get('name') or staff_info.get('username')}"
        print(f"  Period ID {a.get('period_id')} | Index {a.get('period_index')} | Subject: {subj} | Staff: {staff_display}")

print(f"\nTotal assigned periods: {assigned_periods_count}")
print("Done!")
