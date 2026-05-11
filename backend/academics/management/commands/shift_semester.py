from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from academics.models import Section, AcademicYear, Semester

class Command(BaseCommand):
    help = 'Shift all sections to the next semester based on the currently active Academic Year'

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

        sections = Section.objects.all().select_related('batch', 'semester')
        total = sections.count()
        updated = 0
        skipped = 0

        self.stdout.write(f'Processing {total} sections...')

        with transaction.atomic():
            for sec in sections:
                old_sem = sec.semester.number if sec.semester else None
                
                # If force is true, we clear the semester so save() recalculates it
                if force:
                    sec.semester = None
                
                # Save triggers the auto-calculation in Section.save()
                # but only if semester is None.
                # If it's already set and not forced, it stays.
                # Usually users want to MOVE everything, so force=True is likely what they mean by "shift".
                
                # Let's manually trigger the logic here if it's already set but we want to shift
                if old_sem is not None and not force:
                    # Logic in Section.save() is:
                    # delta = acad_start - start_year
                    # offset = 1 (ODD) or 2 (EVEN)
                    # sem = delta * 2 + offset
                    
                    # If we don't force, we might skip sections that are already set.
                    # But the user says "shift sem only", implying they want to MOVE them.
                    pass

                # If the user wants to shift, they probably want to move from 1->2 or 2->3.
                # The auto-calculation formula handles this perfectly based on the Active Academic Year.
                
                # So the workflow is:
                # 1. Admin sets NEW Academic Year as active.
                # 2. Admin runs this command.
                
                # We clear it to ensure recalculation
                sec.semester = None
                sec.save()
                
                new_sem = sec.semester.number if sec.semester else None
                
                if old_sem != new_sem:
                    self.stdout.write(f'  {sec}: Sem {old_sem} -> {new_sem}')
                    updated += 1
                else:
                    skipped += 1

            if dry_run:
                self.stdout.write(self.style.WARNING('Rolling back changes (dry run)'))
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(f'\nDone. Updated: {updated}  Skipped/Unchanged: {skipped}'))
