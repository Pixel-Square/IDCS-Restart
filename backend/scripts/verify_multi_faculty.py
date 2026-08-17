import os
import sys
import django

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate

from academics.models import Section
from curriculum.models import CurriculumDepartment
from timetable.serializers import get_teaching_assignments_for_section_and_curriculum
from timetable.views import SectionTimetableView


def main():
    user_model = get_user_model()
    admin_user = user_model.objects.filter(is_superuser=True).first()
    if not admin_user:
        print("No superuser found for API authentication.")
        return

    section_id = 41
    section = Section.objects.get(pk=section_id)

    print("[1] Helper verification")
    print(f"Section: {section} (ID: {section_id})")

    curriculum_rows = CurriculumDepartment.objects.filter(
        semester__number=section.semester.number
    )

    for cr in curriculum_rows:
        staff_profiles = get_teaching_assignments_for_section_and_curriculum(section, cr)
        if not staff_profiles:
            continue
        names = [
            getattr(getattr(sp, "user", None), "username", None) or getattr(sp, "staff_id", "")
            for sp in staff_profiles
        ]
        print(f"Row {cr.id} | {cr.course_code} | {cr.course_name} -> {names}")

    print("\n[2] SectionTimetableView verification")
    factory = APIRequestFactory()
    req = factory.get(f"/api/timetable/section/{section_id}/timetable/")
    force_authenticate(req, user=admin_user)

    res = SectionTimetableView.as_view()(req, section_id=section_id)
    print(f"Status: {res.status_code}")

    results = res.data.get("results", [])
    print(f"Total days returned: {len(results)}")

    for day_obj in results:
        day = day_obj.get("day")
        print(f"\nDay {day} assignments:")
        for assignment in day_obj.get("assignments", []):
            subject = (
                assignment.get("subject_text")
                or (assignment.get("curriculum_row") or {}).get("course_name")
                or "Unassigned"
            )
            staff = assignment.get("staff") or {}
            print(
                "  "
                f"Period {assignment.get('period_index')} | "
                f"Subject: {subject} | "
                f"Staff ID: {staff.get('id')} | "
                f"Code: {staff.get('staff_id')} | "
                f"Name: {staff.get('name') or staff.get('username')}"
            )


if __name__ == "__main__":
    main()
