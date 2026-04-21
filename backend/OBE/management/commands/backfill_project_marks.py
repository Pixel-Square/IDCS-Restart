from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand

from academics.models import StudentProfile, Subject
from OBE.models import LabPublishedSheet, ProjectMark
from OBE.views import _upsert_scoped_mark


class Command(BaseCommand):
    help = 'Backfill ProjectMark rows from published review JSON for PROJECT courses.'

    @staticmethod
    def _to_decimal(value):
        if value is None:
            return None
        if isinstance(value, str) and value.strip() == '':
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None

    @classmethod
    def _extract_project_totals(cls, data) -> dict[int, Decimal]:
        if not isinstance(data, dict):
            return {}
        payload = data.get('sheet') if isinstance(data.get('sheet'), dict) else data
        if not isinstance(payload, dict):
            return {}

        review_components = payload.get('reviewComponents')
        if not isinstance(review_components, list) or len(review_components) != 1:
            return {}

        comp = review_components[0] if isinstance(review_components[0], dict) else {}
        comp_id = str(comp.get('id') or '').strip().lower()
        if comp_id not in {'co1', 'project'}:
            return {}

        rows_by = payload.get('rowsByStudentId', {})
        if not isinstance(rows_by, dict):
            return {}

        out: dict[int, Decimal] = {}
        for sid_key, row in rows_by.items():
            if not isinstance(row, dict):
                continue

            try:
                sid = int(sid_key)
            except Exception:
                sid_raw = row.get('studentId')
                try:
                    sid = int(sid_raw)
                except Exception:
                    continue

            mark_total = None
            rc = row.get('reviewComponentMarks', {})
            if isinstance(rc, dict) and rc:
                total = Decimal('0')
                has_val = False
                for value in rc.values():
                    dec = cls._to_decimal(value)
                    if dec is None:
                        continue
                    total += dec
                    has_val = True
                if has_val:
                    mark_total = total

            if mark_total is None:
                mark_total = cls._to_decimal(row.get('ciaExam'))
            if mark_total is None:
                mark_total = cls._to_decimal(row.get('total'))
            if mark_total is None:
                continue

            out[sid] = mark_total

        return out

    def add_arguments(self, parser):
        parser.add_argument(
            '--include-legacy-null-ta',
            action='store_true',
            help='Also process legacy published rows with NULL teaching_assignment (best-effort).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Do not write; only show which PROJECT teaching assignments would be processed.',
        )

    def handle(self, *args, **options):
        include_legacy_null_ta = bool(options.get('include_legacy_null_ta'))
        dry_run = bool(options.get('dry_run'))

        latest_by_scope = {}
        base_rows = (
            LabPublishedSheet.objects.filter(assessment__in=('review1', 'review2'))
            .exclude(teaching_assignment__isnull=True)
            .order_by('subject_id', 'teaching_assignment_id', '-updated_at', '-id')
        )
        for row in base_rows.iterator(chunk_size=500):
            key = (int(row.subject_id), int(row.teaching_assignment_id))
            if key not in latest_by_scope:
                latest_by_scope[key] = row

        processed_ta = 0
        updated_ta = 0
        updated_rows = 0

        for (_subject_id, _ta_id), row in latest_by_scope.items():
            data = row.data if isinstance(getattr(row, 'data', None), dict) else {}
            totals = self._extract_project_totals(data)
            if not totals:
                continue

            processed_ta += 1
            if dry_run:
                self.stdout.write(
                    f"[DRY RUN] TA {getattr(getattr(row, 'teaching_assignment', None), 'id', None)} {getattr(getattr(row, 'subject', None), 'code', '')}"
                )
                continue

            scope_rows = 0
            for sid, mark in totals.items():
                student = StudentProfile.objects.filter(id=sid).first()
                if not student:
                    continue
                _upsert_scoped_mark(
                    ProjectMark,
                    subject=row.subject,
                    student=student,
                    teaching_assignment=row.teaching_assignment,
                    mark_defaults={'mark': mark},
                )
                scope_rows += 1

            if scope_rows > 0:
                updated_ta += 1
                updated_rows += int(scope_rows)

        processed_legacy_subjects = 0
        updated_legacy_subjects = 0
        updated_legacy_rows = 0

        if include_legacy_null_ta:
            subject_ids = (
                LabPublishedSheet.objects.filter(
                    assessment__in=('review1', 'review2'),
                    teaching_assignment__isnull=True,
                )
                .values_list('subject_id', flat=True)
                .distinct()
            )
            for subject_id in subject_ids.iterator(chunk_size=300):
                subject = Subject.objects.filter(id=subject_id).first()
                if subject is None:
                    continue

                processed_legacy_subjects += 1
                if dry_run:
                    self.stdout.write(f"[DRY RUN] Legacy subject {getattr(subject, 'code', '')}")
                    continue

                latest_legacy = (
                    LabPublishedSheet.objects.filter(
                        subject=subject,
                        assessment__in=('review1', 'review2'),
                        teaching_assignment__isnull=True,
                    )
                    .order_by('-updated_at', '-id')
                    .first()
                )
                if latest_legacy is None:
                    continue

                totals = self._extract_project_totals(latest_legacy.data if isinstance(getattr(latest_legacy, 'data', None), dict) else {})
                scope_rows = 0
                for sid, mark in totals.items():
                    student = StudentProfile.objects.filter(id=sid).first()
                    if not student:
                        continue
                    _upsert_scoped_mark(
                        ProjectMark,
                        subject=subject,
                        student=student,
                        teaching_assignment=None,
                        mark_defaults={'mark': mark},
                    )
                    scope_rows += 1

                if scope_rows > 0:
                    updated_legacy_subjects += 1
                    updated_legacy_rows += int(scope_rows)

        self.stdout.write(self.style.SUCCESS('Backfill complete.'))
        self.stdout.write(
            f"PROJECT TAs processed: {processed_ta}, updated TAs: {updated_ta}, rows upserted: {updated_rows}"
        )
        if include_legacy_null_ta:
            self.stdout.write(
                f"Legacy NULL-TA subjects processed: {processed_legacy_subjects}, updated subjects: {updated_legacy_subjects}, rows upserted: {updated_legacy_rows}"
            )
