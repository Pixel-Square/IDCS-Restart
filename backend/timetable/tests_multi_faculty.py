from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from timetable.serializers import TimetableAssignmentSerializer


class _FakeUser:
    def __init__(self, username, first_name, last_name):
        self.username = username
        self.first_name = first_name
        self.last_name = last_name

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


class _FakeStaff:
    def __init__(self, staff_pk, staff_code, username, first_name, last_name):
        self.id = staff_pk
        self.staff_id = staff_code
        self.user = _FakeUser(username, first_name, last_name)
        self.user_id = staff_pk


class TimetableAssignmentSerializerMultiFacultyTests(SimpleTestCase):
    def test_get_staff_formats_multi_faculty_fallback(self):
        assignment = SimpleNamespace(
            subject_batch=None,
            staff=None,
            curriculum_row=SimpleNamespace(id=1),
            section=SimpleNamespace(id=41),
        )

        staff_a = _FakeStaff(101, "3171012", "praveen", "Praveenkumar", "T")
        staff_b = _FakeStaff(102, "3171023", "swetha", "Swethabharathi", "R")

        serializer = TimetableAssignmentSerializer()

        with patch(
            "timetable.serializers.get_teaching_assignments_for_section_and_curriculum",
            return_value=[staff_a, staff_b],
        ):
            result = serializer.get_staff(assignment)

        self.assertIsNotNone(result)
        self.assertIsNone(result["id"])
        self.assertEqual(result["staff_id"], "3171012, 3171023")
        self.assertEqual(result["username"], "praveen, swetha")
        self.assertEqual(result["name"], "Praveenkumar T, Swethabharathi R")

    def test_get_staff_prefers_explicit_assignment_staff(self):
        explicit_staff = _FakeStaff(57, "3171013", "sumathi", "Sumathi", "A")
        assignment = SimpleNamespace(
            subject_batch=None,
            staff=explicit_staff,
            curriculum_row=SimpleNamespace(id=1),
            section=SimpleNamespace(id=41),
        )

        serializer = TimetableAssignmentSerializer()
        result = serializer.get_staff(assignment)

        self.assertIsNotNone(result)
        self.assertEqual(result["id"], 57)
        self.assertEqual(result["staff_id"], "3171013")
        self.assertEqual(result["username"], "sumathi")
