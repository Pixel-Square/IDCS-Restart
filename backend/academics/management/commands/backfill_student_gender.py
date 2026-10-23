"""Backfill StudentProfile.gender from the registration number.

Registration numbers issued from the 2023 batch onwards encode gender in the
13th character: ``1`` = male, ``2`` = female. This command is idempotent and
only fills blank genders unless ``--overwrite`` is passed.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from academics.models import (
    GENDER_INFERENCE_MIN_BATCH_YEAR,
    StudentProfile,
    batch_start_year,
    infer_gender_from_reg_no,
)


class Command(BaseCommand):
    help = (
        'Backfill StudentProfile.gender for 2023+ batches using the 13th digit '
        'of the registration number (1 = Male, 2 = Female).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--from-year',
            type=int,
            default=GENDER_INFERENCE_MIN_BATCH_YEAR,
            help='Only process batches starting in this year or later (default: 2023).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would change without writing to the database.',
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Replace genders that are already recorded. Off by default.',
        )

    def handle(self, *args, **options):
        from_year = int(options['from_year'])
        dry_run = bool(options['dry_run'])
        overwrite = bool(options['overwrite'])

        qs = StudentProfile.objects.exclude(batch='').only(
            'id', 'reg_no', 'batch', 'gender'
        )

        scanned = 0
        updated = 0
        already_set = 0
        no_digit = 0
        updates = []

        for student in qs.iterator(chunk_size=500):
            year = batch_start_year(student.batch)
            if year is None or year < from_year:
                continue
            scanned += 1
            inferred = infer_gender_from_reg_no(
                student.reg_no, student.batch, minimum_batch_year=from_year
            )
            if not inferred:
                no_digit += 1
                continue
            if student.gender:
                if not overwrite or student.gender == inferred:
                    already_set += 1
                    continue
            student.gender = inferred
            updates.append(student)
            updated += 1

        if not dry_run and updates:
            with transaction.atomic():
                StudentProfile.objects.bulk_update(updates, ['gender'], batch_size=500)

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(
            self.style.SUCCESS(
                f'{prefix}Scanned {scanned} student(s) from batch {from_year}+. '
                f'Updated {updated}, already set {already_set}, '
                f'no gender digit {no_digit}.'
            )
        )
