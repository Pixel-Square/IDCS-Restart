from django.core.management.base import BaseCommand
from academics.models import StudentProfile, StudentSectionAssignment


class Command(BaseCommand):
    help = 'Synchronize StudentProfile.section with active StudentSectionAssignment records'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be fixed without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        self.stdout.write('Checking all student profiles...\n')
        
        total_students = 0
        mismatched = 0
        fixed = 0
        errors = 0
        
        # Check all students
        students = StudentProfile.objects.all().select_related('section')
        
        for sp in students:
            total_students += 1
            
            # Get active assignment
            active = StudentSectionAssignment.objects.filter(
                student=sp, 
                end_date__isnull=True
            ).order_by('-start_date').first()
            
            # Determine expected section
            expected_section_id = active.section_id if active else None
            current_section_id = sp.section_id
            
            # Check for mismatch
            if expected_section_id != current_section_id:
                mismatched += 1
                status_msg = (
                    f'Student {sp.reg_no}: '
                    f'section_id={current_section_id} '
                    f'but active assignment={expected_section_id}'
                )
                
                if dry_run:
                    self.stdout.write(self.style.WARNING(f'  Would fix: {status_msg}'))
                else:
                    try:
                        if active:
                            sp.section = active.section
                        else:
                            sp.section = None
                        sp.save()
                        fixed += 1
                        self.stdout.write(self.style.SUCCESS(f'  ✓ Fixed: {status_msg}'))
                    except Exception as e:
                        errors += 1
                        self.stdout.write(self.style.ERROR(f'  ✗ Error fixing {sp.reg_no}: {e}'))
        
        # Summary
        self.stdout.write('\n' + '='*60)
        self.stdout.write(f'Total students checked: {total_students}')
        self.stdout.write(f'Mismatched records found: {mismatched}')
        
        if dry_run:
            self.stdout.write(self.style.WARNING(f'Records that would be fixed: {mismatched}'))
            self.stdout.write('\nRun without --dry-run to apply fixes')
        else:
            self.stdout.write(self.style.SUCCESS(f'Successfully fixed: {fixed}'))
            if errors > 0:
                self.stdout.write(self.style.ERROR(f'Errors: {errors}'))
        
        self.stdout.write('='*60)
