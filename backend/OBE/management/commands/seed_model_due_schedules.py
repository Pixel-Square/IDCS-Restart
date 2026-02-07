from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime


class Command(BaseCommand):
    help = "Seed missing ObeDueSchedule rows for assessment='model' by copying due_at from another assessment or using an explicit due date."

    def add_arguments(self, parser):
        parser.add_argument(
            '--copy-from',
            dest='copy_from',
            default='cia2',
            help="Assessment key to copy due_at from (default: cia2).",
        )
        parser.add_argument(
            '--academic-year-id',
            dest='academic_year_id',
            type=int,
            default=None,
            help='Only seed schedules for a single AcademicYear ID.',
        )
        parser.add_argument(
            '--due-at',
            dest='due_at',
            default=None,
            help="ISO datetime to use when no copy-from row exists (e.g., '2026-02-07T17:00:00+05:30').",
        )
        parser.add_argument(
            '--dry-run',
            dest='dry_run',
            action='store_true',
            help='Print what would be created without writing to DB.',
        )

    def handle(self, *args, **opts):
        from OBE.models import ObeDueSchedule
        from academics.models import Subject

        copy_from = str(opts.get('copy_from') or '').strip().lower()
        academic_year_id = opts.get('academic_year_id')
        dry_run = bool(opts.get('dry_run'))

        due_at_str = opts.get('due_at')
        explicit_due_at = None
        if due_at_str:
            dt = parse_datetime(str(due_at_str).strip())
            if not dt:
                raise SystemExit(f"Invalid --due-at datetime: {due_at_str}")
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            explicit_due_at = dt

        qs = ObeDueSchedule.objects.all()
        if academic_year_id is not None:
            qs = qs.filter(academic_year_id=academic_year_id)

        subjects = list(
            qs.values('academic_year_id', 'subject_code', 'subject_name')
            .distinct()
            .order_by('academic_year_id', 'subject_code')
        )

        created = 0
        skipped_existing = 0
        skipped_missing_source = 0

        for row in subjects:
            ay_id = row['academic_year_id']
            subject_code = (row['subject_code'] or '').strip()
            subject_name = row.get('subject_name') or ''

            if not subject_code:
                continue

            if ObeDueSchedule.objects.filter(academic_year_id=ay_id, subject_code=subject_code, assessment='model').exists():
                skipped_existing += 1
                continue

            due_at = explicit_due_at
            if due_at is None:
                src = (
                    ObeDueSchedule.objects.filter(
                        academic_year_id=ay_id,
                        subject_code=subject_code,
                        assessment=copy_from,
                    )
                    .order_by('-is_active', '-due_at')
                    .first()
                )
                if src:
                    due_at = src.due_at

            if due_at is None:
                skipped_missing_source += 1
                continue

            subj = Subject.objects.filter(code=subject_code).first()

            if dry_run:
                self.stdout.write(f"DRY RUN: create model due schedule ay={ay_id} subject={subject_code} due_at={due_at.isoformat()}")
                created += 1
                continue

            ObeDueSchedule.objects.create(
                academic_year_id=ay_id,
                subject=subj,
                subject_code=subject_code,
                subject_name=subject_name or (getattr(subj, 'name', '') or ''),
                assessment='model',
                due_at=due_at,
                is_active=True,
            )
            created += 1

        self.stdout.write(
            f"Done. created={created} skipped_existing={skipped_existing} skipped_missing_source={skipped_missing_source}"
        )
