from datetime import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from timetable.views import SectionSubjectsStaffView, SectionTimetableView


class _FakeQuerySet:
    def __init__(self, items=None):
        self._items = items or []

    def filter(self, *args, **kwargs):
        return self

    def distinct(self):
        return self

    def select_related(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self._items[0] if self._items else None

    def __iter__(self):
        return iter(self._items)


class _FakeDistinctList(list):
    def distinct(self):
        return self


class _FakeValuesListQuery:
    def __init__(self, mapping=None):
        self.mapping = mapping or {}

    def filter(self, *args, **kwargs):
        return self

    def values_list(self, field, flat=False):
        return _FakeDistinctList(self.mapping.get(field, []))

    def distinct(self):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return None


class SectionTimetableViewIntegrationTests(SimpleTestCase):
    def test_returns_multi_faculty_payload_from_helper(self):
        section = SimpleNamespace(
            id=41,
            name="A",
            batch=SimpleNamespace(course=SimpleNamespace(department=SimpleNamespace(id=1))),
        )
        period = SimpleNamespace(
            id=1,
            index=1,
            start_time=time(9, 0),
            end_time=time(9, 50),
            is_break=False,
            label="P1",
        )
        curriculum_row = SimpleNamespace(
            id=499,
            pk=499,
            course_code="ADI1151",
            course_name="Foundations of Python Programming and SQL",
            mnemonic="ADI1151",
            department_id=1,
        )
        assignment = SimpleNamespace(
            id=9001,
            day=1,
            period=period,
            section=section,
            subject_batch=None,
            staff=None,
            curriculum_row=curriculum_row,
            subject_text="Foundations of Python Programming and SQL",
        )

        staff_a = SimpleNamespace(
            id=101,
            staff_id="3171012",
            user=SimpleNamespace(
                username="praveen",
                first_name="Praveenkumar",
                last_name="T",
                get_full_name=lambda: "Praveenkumar T",
            ),
        )
        staff_b = SimpleNamespace(
            id=102,
            staff_id="3171023",
            user=SimpleNamespace(
                username="swetha",
                first_name="Swethabharathi",
                last_name="R",
                get_full_name=lambda: "Swethabharathi R",
            ),
        )

        request = APIRequestFactory().get("/api/timetable/section/41/timetable/")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True, student_profile=None))

        section_chain = MagicMock()
        section_chain.get.return_value = section

        with patch("timetable.views.Section.objects.select_related", return_value=section_chain), patch(
            "timetable.views.TimetableAssignment.objects.select_related",
            return_value=_FakeQuerySet([assignment]),
        ), patch(
            "timetable.views.SpecialTimetableEntry.objects.filter",
            return_value=_FakeQuerySet([]),
        ), patch(
            "timetable.serializers.get_teaching_assignments_for_section_and_curriculum",
            return_value=[staff_a, staff_b],
        ):
            response = SectionTimetableView.as_view()(request, section_id=41)

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", [])
        self.assertTrue(results)

        day_one = results[0]
        self.assertEqual(day_one.get("day"), 1)
        entries = day_one.get("assignments", [])
        self.assertEqual(len(entries), 1)

        staff_data = entries[0].get("staff")
        self.assertIsNotNone(staff_data)
        self.assertIsNone(staff_data.get("id"))
        self.assertEqual(staff_data.get("staff_id"), "3171012, 3171023")
        self.assertEqual(staff_data.get("name"), "Praveenkumar T, Swethabharathi R")


class CurriculumBySectionViewIntegrationTests(SimpleTestCase):
    def test_returns_credits_for_section_curriculum_rows(self):
        section = SimpleNamespace(
            id=41,
            semester=SimpleNamespace(number=1),
            batch=SimpleNamespace(
                course_id=100,
                course=SimpleNamespace(department=SimpleNamespace(id=1)),
            ),
        )
        curriculum_row = SimpleNamespace(
            id=499,
            pk=499,
            course_code="ADI1151",
            course_name="Foundations of Python Programming and SQL",
            c=3,
            regulation="R2023",
            class_type="THEORY",
            is_elective=False,
            department_id=1,
            department=SimpleNamespace(code="CSE"),
        )

        request = APIRequestFactory().get("/api/timetable/curriculum-for-section/?section_id=41")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))

        section_chain = MagicMock()
        section_chain.get.return_value = section

        with patch("timetable.views.Section.objects.select_related", return_value=section_chain), patch(
            "curriculum.models.CurriculumDepartment.objects.filter",
            return_value=_FakeQuerySet([curriculum_row]),
        ):
            response = CurriculumBySectionView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", [])
        self.assertTrue(results)
        self.assertEqual(results[0].get("c"), 3)

    def test_includes_lab_hours_in_effective_class_hours(self):
        section = SimpleNamespace(
            id=42,
            semester=SimpleNamespace(number=2),
            batch=SimpleNamespace(
                course_id=101,
                course=SimpleNamespace(department=SimpleNamespace(id=2)),
            ),
        )
        curriculum_row = SimpleNamespace(
            id=500,
            pk=500,
            course_code="CSL1201",
            course_name="DBMS Lab",
            c=1,
            l=0,
            t=0,
            p=2,
            s=0,
            total_hours=2,
            regulation="R2023",
            class_type="LAB",
            is_elective=False,
            department_id=2,
            department=SimpleNamespace(code="CSE"),
        )

        request = APIRequestFactory().get("/api/timetable/curriculum-for-section/?section_id=42")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))

        section_chain = MagicMock()
        section_chain.get.return_value = section

        with patch("timetable.views.Section.objects.select_related", return_value=section_chain), patch(
            "curriculum.models.CurriculumDepartment.objects.filter",
            return_value=_FakeQuerySet([curriculum_row]),
        ):
            response = CurriculumBySectionView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", [])
        self.assertTrue(results)
        self.assertEqual(results[0].get("total_hours"), 2)
        self.assertEqual(results[0].get("effective_class_hours"), 2)

    def test_shared_section_uses_explicit_batch_department_curriculum(self):
        physics_dept = SimpleNamespace(pk=11, code="PHY", short_name="Physics", is_sh_main=False)
        chemistry_dept = SimpleNamespace(pk=12, code="CHEM", short_name="Chemistry", is_sh_main=False)
        section = SimpleNamespace(
            id=43,
            semester=SimpleNamespace(number=1),
            batch=SimpleNamespace(
                course_id=None,
                department=physics_dept,
                batch_year_id=2025,
                regulation_id=1,
            ),
            managing_department=SimpleNamespace(pk=99, code="S&H", short_name="S&H", is_sh_main=True),
        )
        physics_row = SimpleNamespace(
            id=600,
            pk=600,
            course_code="PHY1101",
            course_name="Engineering Physics",
            c=3,
            total_hours=3,
            regulation="R2023",
            class_type="THEORY",
            is_elective=False,
            is_dept_core=False,
            department_id=physics_dept.pk,
            department=physics_dept,
        )

        request = APIRequestFactory().get("/api/timetable/curriculum-for-section/?section_id=43")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))

        section_chain = MagicMock()
        section_chain.get.return_value = section

        def curriculum_filter_side_effect(*args, **kwargs):
            if kwargs.get("department_id__in") == [physics_dept.pk]:
                return _FakeQuerySet([physics_row])
            if kwargs.get("department_id__in") == [chemistry_dept.pk]:
                return _FakeQuerySet([])
            return _FakeQuerySet([])

        with patch("timetable.views.Section.objects.select_related", return_value=section_chain), patch(
            "curriculum.models.CurriculumDepartment.objects.filter",
            side_effect=curriculum_filter_side_effect,
        ) as curriculum_filter:
            response = CurriculumBySectionView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", [])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].get("course_code"), "PHY1101")
        self.assertEqual(results[0].get("department_code"), "PHY")
        self.assertTrue(curriculum_filter.called)


>>>>>>> 4c2ca77 (naveen6)
class SectionSubjectsStaffViewIntegrationTests(SimpleTestCase):
    def test_shared_section_returns_multi_faculty_assigned_staff(self):
        section = SimpleNamespace(
            id=41,
            semester=SimpleNamespace(number=1),
            batch=SimpleNamespace(
                course_id=None,
                batch_year_id=2025,
                regulation_id=1,
                department_id=9,
            ),
            managing_department=SimpleNamespace(pk=9),
        )

        curriculum_row = SimpleNamespace(
            id=499,
            pk=499,
            course_code="ADI1151",
            course_name="Foundations of Python Programming and SQL",
            regulation="R2023",
            class_type="THEORY",
            is_elective=False,
            department_id=9,
        )

        staff_a = SimpleNamespace(
            id=101,
            staff_id="3171012",
            user=SimpleNamespace(
                username="praveen",
                get_full_name=lambda: "Praveenkumar T",
            ),
        )
        staff_b = SimpleNamespace(
            id=102,
            staff_id="3171023",
            user=SimpleNamespace(
                username="swetha",
                get_full_name=lambda: "Swethabharathi R",
            ),
        )

        ta_one = SimpleNamespace(
            staff=staff_a,
            curriculum_row=curriculum_row,
            elective_subject=None,
        )
        ta_two = SimpleNamespace(
            staff=staff_b,
            curriculum_row=curriculum_row,
            elective_subject=None,
        )

        request = APIRequestFactory().get("/api/timetable/section/41/subjects-staff/")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))

        section_chain = MagicMock()
        section_chain.get.return_value = section

        def _ssa_filter_side_effect(*args, **kwargs):
            if kwargs.get("section_type") == "PRIMARY" and kwargs.get("student__home_department__isnull") is False:
                return _FakeValuesListQuery({"student__home_department_id": [101]})
            if kwargs.get("section_type") == "PRIMARY":
                return _FakeValuesListQuery({"student_id": [7001]})
            if kwargs.get("section_type") == "SECONDARY":
                return _FakeValuesListQuery({"section_id": [501]})
            return _FakeValuesListQuery({})

        active_ay_chain = _FakeValuesListQuery()
        active_ay_chain.first = lambda: SimpleNamespace(id=1)

        with patch("timetable.views.Section.objects.select_related", return_value=section_chain), patch(
            "timetable.views.Section.objects.filter",
            return_value=_FakeValuesListQuery({"id": [501]}),
        ), patch(
            "academics.models.StudentSectionAssignment.objects.filter",
            side_effect=_ssa_filter_side_effect,
        ), patch(
            "academics.models.AcademicYear.objects.filter",
            return_value=active_ay_chain,
        ), patch(
            "curriculum.models.CurriculumDepartment.objects.filter",
            return_value=_FakeQuerySet([curriculum_row]),
        ), patch(
            "academics.models.TeachingAssignment.objects.filter",
            return_value=_FakeQuerySet([ta_one, ta_two]),
        ), patch(
            "timetable.models.TimetableAssignment.objects.filter",
            return_value=_FakeQuerySet([]),
        ):
            response = SectionSubjectsStaffView.as_view()(request, section_id=41)

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", [])
        self.assertTrue(results)

        target = next((x for x in results if x.get("course_code") == "ADI1151"), None)
        self.assertIsNotNone(target)
        self.assertEqual(target.get("staff"), "Praveenkumar T, Swethabharathi R")

        assigned_staff = target.get("assigned_staff", [])
        self.assertEqual(len(assigned_staff), 2)
        self.assertSetEqual({x.get("staff_id") for x in assigned_staff}, {"3171012", "3171023"})

    def test_numeric_class_type_is_normalized_for_subjects_staff(self):
        section = SimpleNamespace(
            id=42,
            semester=SimpleNamespace(number=2),
            batch=SimpleNamespace(
                course_id=101,
                course=SimpleNamespace(department=SimpleNamespace(id=2)),
            ),
        )
        curriculum_row = SimpleNamespace(
            id=1027,
            pk=1027,
            course_code="AGI1252",
            course_name="Fundamentals of Data Science using R",
            c=3,
            l=0,
            t=0,
            p=0,
            s=0,
            total_hours=20,
            regulation="R2023",
            class_type="3",
            is_elective=False,
            department_id=2,
        )

        staff_a = SimpleNamespace(
            id=101,
            staff_id="3171012",
            user=SimpleNamespace(
                username="praveen",
                get_full_name=lambda: "Praveenkumar T",
            ),
        )
        ta_one = SimpleNamespace(
            staff=staff_a,
            curriculum_row=curriculum_row,
            elective_subject=None,
        )

        request = APIRequestFactory().get("/api/timetable/section/42/subjects-staff/")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))

        section_chain = MagicMock()
        section_chain.get.return_value = section

        active_ay_chain = _FakeValuesListQuery({})
        active_ay_chain.first = lambda: SimpleNamespace(id=1)

        with patch("timetable.views.Section.objects.select_related", return_value=section_chain), patch(
            "timetable.views.Section.objects.filter",
            return_value=_FakeValuesListQuery({"id": [42]}),
        ), patch(
            "academics.models.StudentSectionAssignment.objects.filter",
            return_value=_FakeValuesListQuery({"student__home_department_id": [101]})
        ), patch(
            "academics.models.AcademicYear.objects.filter",
            return_value=active_ay_chain,
        ), patch(
            "curriculum.models.CurriculumDepartment.objects.filter",
            return_value=_FakeQuerySet([curriculum_row]),
        ), patch(
            "academics.models.TeachingAssignment.objects.filter",
            return_value=_FakeQuerySet([ta_one]),
        ), patch(
            "timetable.models.TimetableAssignment.objects.filter",
            return_value=_FakeQuerySet([]),
        ), patch(
            "curriculum.models.ElectiveSubject.objects.filter",
            return_value=_FakeQuerySet([]),
        ):
            response = SectionSubjectsStaffView.as_view()(request, section_id=42)

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", [])
        self.assertTrue(results)
        target = next((x for x in results if x.get("course_code") == "AGI1252"), None)
        self.assertIsNotNone(target)
        self.assertEqual(target.get("class_type"), "THEORY")
