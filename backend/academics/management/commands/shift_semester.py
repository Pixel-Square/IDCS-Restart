from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from academics.models import Section, AcademicYear, Semester, StudentProfile, SystemTransitionLog

class Command(BaseCommand):
    help = 'Shift all sections to the next semester based on the currently active Academic Year and mark completed batches as ALUMNI'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without writing to the database',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force recalculation even if semester is already set',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved'))

        # Find active academic year
        ay = AcademicYear.objects.filter(is_active=True).first()
        if not ay:
            raise CommandError('No active Academic Year found. Please mark one as active first.')

        self.stdout.write(f'Using active Academic Year: {ay.name} ({ay.parity})')

        try:
            acad_start = int(str(ay.name).split('-')[0])
        except Exception:
            acad_start = None

        parity_offset = 1 if (ay.parity or '').upper() == 'ODD' else 2

        sections = Section.objects.all().select_related('batch', 'semester')
        total = sections.count()
        updated = 0
        graduated_students = 0
        skipped = 0

        self.stdout.write(f'Processing {total} sections...')

        with transaction.atomic():
            for sec in sections:
                old_sem = sec.semester.number if sec.semester else None
                
                # Calculate natural semester number
                start_year = getattr(sec.batch, 'start_year', None)
                if start_year is None and sec.batch:
                    try:
                        start_year = int(str(sec.batch.name).split('-')[0])
                    except Exception:
                        start_year = None

                if acad_start is not None and start_year is not None:
                    delta = acad_start - int(start_year)
                    raw_sem = delta * 2 + parity_offset

                    if raw_sem > 8:
                        # Completed all 8 semesters (Graduated)
                        sem8, _ = Semester.objects.get_or_create(number=8)
                        sec.semester = sem8
                        sec.save()

                        # Mark active students as ALUMNI
                        if not dry_run:
                            grad_count = StudentProfile.objects.filter(section=sec, status='ACTIVE').update(status='ALUMNI')
                        else:
                            grad_count = StudentProfile.objects.filter(section=sec, status='ACTIVE').count()
                        graduated_students += grad_count
                        if grad_count > 0:
                            self.stdout.write(self.style.NOTICE(f'  {sec}: Graduated batch (> Sem 8) -> {grad_count} students marked ALUMNI'))
                    elif raw_sem > 0:
                        sem_obj, _ = Semester.objects.get_or_create(number=raw_sem)
                        sec.semester = sem_obj
                        sec.save()
                    else:
                        sec.semester = None
                        sec.save()
                else:
                    sec.semester = None
                    sec.save()

                new_sem = sec.semester.number if sec.semester else None
                
                if old_sem != new_sem:
                    self.stdout.write(f'  {sec}: Sem {old_sem} -> {new_sem}')
                    updated += 1
                else:
                    skipped += 1

            if not dry_run:
                SystemTransitionLog.objects.create(
                    academic_year=ay,
                    performed_by=None,
                    updated_count=updated,
                    details=f"CLI shift_semester to {ay.name} ({ay.parity or 'ALL'}). Recalculated {total} sections ({updated} modified, {graduated_students} students marked ALUMNI)."
                )

            if dry_run:
                self.stdout.write(self.style.WARNING('Rolling back changes (dry run)'))
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(f'\nDone. Updated: {updated}  Graduated Students: {graduated_students}  Skipped/Unchanged: {skipped}'))
