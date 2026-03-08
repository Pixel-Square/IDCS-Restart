"""
promote_year1_students
======================
Promotes Year-1 students from their S&H-managed sections into their
home-department sections (Semester 3 onwards).

Usage
-----
    python manage.py promote_year1_students --batch-name "2024-2028" [--dry-run]

What it does
------------
1. Finds every StudentProfile whose *current* section has managing_department=S&H
   (i.e. still in a Year-1 S&H section).
2. Determines each student's home_department (falls back to the degree department
   via section → batch → course → department if home_department is NULL).
3. Backfills home_department on the StudentProfile if it was NULL.
4. Looks up (or creates) the appropriate core-dept Batch and Section for the
   promotion target (semester 3, same batch-year / regulation as current batch).
5. Ends the current S&H StudentSectionAssignment and starts a new one in the
   core-dept section.

Options
-------
    --batch-name     Filter by Batch.name (e.g. "2024-2028").  Required.
    --target-sem     Semester number to promote into (default: 3).
    --section-name   Target section name to auto-create if missing (default: "A").
    --dry-run        Print what would happen without saving anything.
"""

from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academics.models import (
    Batch,
    Department,
    Section,
    Semester,
    StudentProfile,
    StudentSectionAssignment,
)


class Command(BaseCommand):
    help = 'Promote Year-1 S&H students into their home-department sections'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-name',
            required=True,
            help='Batch name to process (e.g. "2024-2028")',
        )
        parser.add_argument(
            '--target-sem',
            type=int,
            default=3,
            help='Semester number to promote into (default: 3)',
        )
        parser.add_argument(
            '--section-name',
            default='A',
            help='Section name to use/create in the home department (default: "A")',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without writing to the database',
        )

    def handle(self, *args, **options):
        batch_name = options['batch_name']
        target_sem_number = options['target_sem']
        section_name = options['section_name']
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved'))

        # Resolve S&H department
        sh_dept = Department.objects.filter(is_sh_main=True).first()
        if sh_dept is None:
            raise CommandError('No department with is_sh_main=True found. Run migrations first.')

        # Resolve target semester
        target_semester = Semester.objects.filter(number=target_sem_number).first()
        if target_semester is None:
            raise CommandError(f'Semester with number={target_sem_number} does not exist.')

        # Find all active StudentSectionAssignments where section.managing_department = S&H
        # and the section's batch matches the requested batch name
        sh_assignments = (
            StudentSectionAssignment.objects
            .filter(
                end_date__isnull=True,
                section__managing_department=sh_dept,
                section__batch__name=batch_name,
            )
            .select_related(
                'student',
                'student__home_department',
                'section__batch__course__department',
                'section__batch__regulation',
                'section__batch__batch_year',
            )
        )

        if not sh_assignments.exists():
            self.stdout.write(self.style.WARNING(
                f'No active S&H-managed assignments found for batch "{batch_name}".'
            ))
            return

        self.stdout.write(f'Found {sh_assignments.count()} student(s) to promote.')

        promoted = 0
        skipped = 0

        with transaction.atomic():
            for assignment in sh_assignments:
                student = assignment.student
                sh_section = assignment.section
                sh_batch = sh_section.batch

                # Resolve home_department
                home_dept = student.home_department
                if home_dept is None:
                    # Infer from the batch's course → department
                    inferred_dept = sh_batch.course.department if sh_batch.course else None
                    if inferred_dept is None or inferred_dept == sh_dept:
                        self.stdout.write(self.style.ERROR(
                            f'  SKIP {student.reg_no}: cannot determine home department'
                        ))
                        skipped += 1
                        continue
                    home_dept = inferred_dept
                    if not dry_run:
                        StudentProfile.objects.filter(pk=student.pk).update(home_department=home_dept)
                    self.stdout.write(
                        f'  Backfill home_department → {home_dept.code} for {student.reg_no}'
                    )

                # Find the core-dept batch for the same batch_year / regulation
                core_batch = (
                    Batch.objects
                    .filter(
                        course__department=home_dept,
                        batch_year=sh_batch.batch_year,
                        regulation=sh_batch.regulation,
                    )
                    .first()
                )
                if core_batch is None:
                    self.stdout.write(self.style.ERROR(
                        f'  SKIP {student.reg_no}: no batch found for dept={home_dept.code} '
                        f'batch_year={sh_batch.batch_year} reg={sh_batch.regulation}'
                    ))
                    skipped += 1
                    continue

                # Find or create the target section
                target_section = Section.objects.filter(
                    batch=core_batch,
                    semester=target_semester,
                    name=section_name,
                ).first()

                if target_section is None:
                    if dry_run:
                        self.stdout.write(
                            f'  Would create Section(batch={core_batch}, sem={target_sem_number}, name={section_name})'
                        )
                    else:
                        target_section = Section.objects.create(
                            batch=core_batch,
                            semester=target_semester,
                            name=section_name,
                        )
                        self.stdout.write(
                            f'  Created Section: {target_section}'
                        )

                if dry_run:
                    self.stdout.write(
                        f'  Would promote {student.reg_no}: '
                        f'{sh_section} → {target_section if target_section else f"[new] {core_batch}/sem{target_sem_number}/{section_name}"}'
                    )
                else:
                    # End current S&H assignment and start new core-dept one
                    assignment.end_date = date.today()
                    assignment.save(update_fields=['end_date'])

                    StudentSectionAssignment.objects.create(
                        student=student,
                        section=target_section,
                        start_date=date.today(),
                    )
                    self.stdout.write(
                        f'  Promoted {student.reg_no}: {sh_section} → {target_section}'
                    )

                promoted += 1

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Promoted: {promoted}  Skipped: {skipped}'
            + (' (dry run — nothing saved)' if dry_run else '')
        ))
