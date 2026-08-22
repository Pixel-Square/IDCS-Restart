from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError as DRFValidationError

from timetable.models import TimetableAssignment, Venue
from timetable.serializers import TimetableAssignmentSerializer


class _FakeVenue:
    def __init__(self, pk, name):
        self.id = pk
        self.pk = pk
        self.name = name


class _FakePeriod:
    def __init__(self, pk, index):
        self.id = pk
        self.pk = pk
        self.index = index


class _FakeSection:
    def __init__(self, pk, name):
        self.id = pk
        self.pk = pk
        self.name = name


class _FakeConflictAssignment:
    """Shape of the assignment returned by the (mocked) conflict queryset."""
    def __init__(self, venue, period, section):
        self.venue = venue
        self.period = period
        self.section = section
        self.section_id = section.id

    def get_day_display(self):
        return 'Tuesday'


class _ConflictQuerySet:
    """Mocks the .filter().exclude().first() chain returning a conflict."""
    def __init__(self, conflict):
        self._conflict = conflict

    def exclude(self, *args, **kwargs):
        return self

    def first(self):
        return self._conflict


class _EmptyQuerySet:
    def exclude(self, *args, **kwargs):
        return self

    def first(self):
        return None


class TimetableAssignmentVenueConflictTests(SimpleTestCase):
    def _make_serializer(self, venue_id, day, initial_data=None):
        serializer = TimetableAssignmentSerializer()
        idata = {
            'period_id': 10,
            'day': day,
            'section_id': 5,
            'venue_id': venue_id,
        }
        if initial_data:
            idata.update(initial_data)
        serializer.initial_data = idata
        return serializer

    def test_venue_conflict_rejected_between_different_sections(self):
        venue = _FakeVenue(1, 'Physics Lab')
        period = _FakePeriod(10, 4)
        section = _FakeSection(5, 'CSE-A')
        other_section = _FakeSection(9, 'CSE-B')

        attrs = {
            'period': period,
            'section': section,
            'day': 2,
            'venue': venue,
            'staff': None,
            'subject_batch': None,
            'curriculum_row': None,
            'subject_text': 'Engineering Physics Lab',
        }

        serializer = self._make_serializer(1, 2)

        conflict = _FakeConflictAssignment(venue, period, other_section)
        fake_tt_objects = SimpleNamespace()
        fake_tt_objects.filter = lambda *a, **k: _ConflictQuerySet(conflict)
        fake_venue_objects = SimpleNamespace()
        fake_venue_objects.filter = lambda *a, **k: SimpleNamespace(first=lambda: venue)

        with patch.object(TimetableAssignment, 'objects', fake_tt_objects), \
             patch.object(Venue, 'objects', fake_venue_objects):
            with self.assertRaises(DRFValidationError):
                serializer.validate(attrs)

    def test_no_conflict_when_venue_free(self):
        venue = _FakeVenue(2, 'Chemistry Lab')
        period = _FakePeriod(11, 3)
        section = _FakeSection(5, 'CSE-A')

        attrs = {
            'period': period,
            'section': section,
            'day': 3,
            'venue': venue,
            'staff': None,
            'subject_batch': None,
            'curriculum_row': None,
            'subject_text': 'Chemistry Lab',
        }

        serializer = self._make_serializer(2, 3)

        fake_tt_objects = SimpleNamespace()
        fake_tt_objects.filter = lambda *a, **k: _EmptyQuerySet()
        fake_venue_objects = SimpleNamespace()
        fake_venue_objects.filter = lambda *a, **k: SimpleNamespace(first=lambda: venue)

        with patch.object(TimetableAssignment, 'objects', fake_tt_objects), \
             patch.object(Venue, 'objects', fake_venue_objects):
            result = serializer.validate(attrs)
            self.assertEqual(result['venue'], venue)
