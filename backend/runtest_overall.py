"""Live runtime verification of the Overall Academic/Attendance analytics
and the Department Drill-Down endpoints against the real database.
Usage: python3 runtest_overall.py
"""
import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from accounts.models import User, Role, UserRole
from academics.models import Department, StudentProfile
from rest_framework.test import APIClient


def get_superuser():
    u = User.objects.filter(is_superuser=True).first()
    if u:
        return u
    return User.objects.create_superuser(email="runtime.analytics@test.local", username="runtime_analytics", password="x")


def main():
    client = APIClient()
    u = get_superuser()
    client.force_authenticate(user=u)

    print("== DEPARTMENTS (real) ==")
    for d in Department.objects.filter(is_teaching=True).order_by("name"):
        count = StudentProfile.objects.filter(
            home_department=d
        ).count()
        print(f"- id={d.id} code={d.code!r} short={d.short_name!r} name={d.name!r} students(home)={count}")

    print("\n== AI&DS department resolution ==")
    dept = Department.objects.filter(short_name__iexact="AI&DS").first() or Department.objects.filter(name__icontains="AI&DS").first()
    aids_code = dept.code or str(dept.id) if dept else "243"
    aids_id = dept.id if dept else None
    print("dept:", dept.name if dept else None, "| code:", aids_code, "| id:", aids_id)

    print("\n== ANALYTICS (defaults, college-wide) ==")
    r = client.get("/api/academic-v2/performance/analytics/")
    print("status:", r.status_code)
    if r.status_code == 200:
        j = r.json()
        print("metrics:", j.get("metrics"))
        print("n dept_comparison rows:", len(j.get("dept_comparison") or []))
        print("dept codes:", [d.get("dept_code") for d in (j.get("dept_comparison") or [])][:15])
        fo = j.get("filter_options") or {}
        print("filter_options keys:", list(fo.keys()))
        print("batches:", (fo.get("batches") or [])[:8])
        print("sections:", (fo.get("sections") or [])[:10])
        print("exam_types:", (fo.get("exam_types") or [])[:16])

    print("\n== ANALYTICS (dept=AI&DS) ==")
    r = client.get(f"/api/academic-v2/performance/analytics/?dept={aids_code}")
    if r.status_code == 200:
        j = r.json()
        print("metrics:", j.get("metrics"))
        print("dept_comparison:", [(d.get("dept_code"), d.get("total_students")) for d in (j.get("dept_comparison") or [])][:15])

    print("\n== DEPARTMENT ANALYSIS (dept=%s) ==" % aids_code)
    r = client.get(f"/api/academic-v2/performance/department-analysis/?dept={aids_code}")
    print("status:", r.status_code)
    if r.status_code == 200:
        j = r.json()
        print("department:", j.get("department"))
        print("filters:", j.get("filters"))
        print("metrics:", j.get("metrics"))
        print("n section_wise:", len(j.get("section_wise") or []), "->", [(s.get("section"), s.get("students")) for s in (j.get("section_wise") or [])])
        print("n subject_wise:", len(j.get("subject_wise") or []))
        subj = (j.get("subject_wise") or [])[:6]
        for s in subj:
            print("   ", s.get("subject_code"), s.get("subject_name"), "avg", s.get("avg_marks"), "pass%", s.get("pass_pct"))
        print("distribution:", j.get("distribution"))
        print("n students:", len(j.get("students") or []), "-> first", (j.get("students") or [])[0] if (j.get("students")) else None)

    print("\n== DEPARTMENT ANALYSIS (dept=%s year+sem) ==" % aids_code)
    r = client.get(f"/api/academic-v2/performance/department-analysis/?dept={aids_code}&year=2023&sem=6")
    if r.status_code == 200:
        j = r.json()
        print("filters:", j.get("filters"))
        print("metrics:", j.get("metrics"))
        print("n section_wise:", len(j.get("section_wise") or []), "->", [s.get("section") for s in (j.get("section_wise") or [])])

    print("\nDONE")


if __name__ == "__main__":
    main()