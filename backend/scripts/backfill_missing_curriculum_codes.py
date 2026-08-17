import os
import sys

import django

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Subject, TeachingAssignment
from curriculum.models import CurriculumDepartment


# Verified subject code overrides from authoritative Subject(Curriculum) records.
# Key format: (regulation, semester_number, normalized_course_name)
VERIFIED_CODE_OVERRIDES = {
    ("R2023", 2, "python programming"): "EGB1122",
}


def first_non_empty(qs, field_name):
    value = (
        qs.exclude(**{f"{field_name}__isnull": True})
        .exclude(**{field_name: ""})
        .values_list(field_name, flat=True)
        .first()
    )
    return (value or "").strip() or None


def resolve_code_for_row(row):
    # 0) Explicit verified override (real code provided by admin source).
    key = (
        str(row.regulation or "").strip().upper(),
        getattr(row.semester, "number", None),
        str(row.course_name or "").strip().lower(),
    )
    override = VERIFIED_CODE_OVERRIDES.get(key)
    if override:
        return override, "verified-override"

    # 1) Same course_name peers in CurriculumDepartment that already have code.
    peer_code = first_non_empty(
        CurriculumDepartment.objects.filter(
            course_name__iexact=row.course_name,
            semester=row.semester,
            regulation=row.regulation,
        ),
        "course_code",
    )
    if peer_code:
        return peer_code, "curriculum-peer"

    # 2) TeachingAssignment.subject.code (legacy Subject(Curriculum) source).
    ta_code = first_non_empty(
        TeachingAssignment.objects.filter(
            subject__isnull=False,
            subject__name__iexact=row.course_name,
            is_active=True,
        ),
        "subject__code",
    )
    if ta_code:
        return ta_code, "teachingassignment-subject"

    # 3) Subject table code by same name + semester.
    subject_code = first_non_empty(
        Subject.objects.filter(
            name__iexact=row.course_name,
            semester=row.semester,
        ),
        "code",
    )
    if subject_code:
        return subject_code, "subject-table"

    return None, None


def main():
    # Focus on S&H shared-section relevant rows first.
    targets = CurriculumDepartment.objects.filter(
        course_code__isnull=True,
        department__short_name="S&H",
    ) | CurriculumDepartment.objects.filter(
        course_code__isnull=True,
        course_name__iexact="Python Programming",
    )

    # Deduplicate targets after union.
    target_ids = sorted(set(targets.values_list("id", flat=True)))
    rows = CurriculumDepartment.objects.filter(id__in=target_ids).select_related("semester", "department")

    updated = 0
    unresolved = 0

    for row in rows:
        code, source = resolve_code_for_row(row)
        if not code:
            unresolved += 1
            print(
                f"UNRESOLVED id={row.id} name={row.course_name!r} sem={getattr(row.semester, 'number', None)} reg={row.regulation} dept={getattr(row.department, 'short_name', None)}"
            )
            continue

        row.course_code = code
        row.save(update_fields=["course_code"])
        updated += 1
        print(
            f"UPDATED id={row.id} -> {code} via {source} (name={row.course_name!r}, sem={getattr(row.semester, 'number', None)}, reg={row.regulation})"
        )

    print(f"Done. Updated={updated}, Unresolved={unresolved}, Checked={len(target_ids)}")


if __name__ == "__main__":
    main()
