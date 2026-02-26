"""
Management command to list all sections in the database with their batch and department info
Usage: python manage.py check_sections
"""
from django.core.management.base import BaseCommand
from academics.models import Section, Batch


class Command(BaseCommand):
    help = 'List all sections with batch and department information'

    def handle(self, *args, **options):
        sections = Section.objects.select_related(
            'batch', 
            'batch__course', 
            'batch__course__department'
        ).order_by(
            'batch__course__department__short_name',
            'batch__name',
            'name'
        )
        
        if not sections.exists():
            self.stdout.write(self.style.WARNING('No sections found in database!'))
            self.stdout.write('Please create sections in Django admin first.')
            return
        
        self.stdout.write(self.style.SUCCESS(f'\nFound {sections.count()} sections:\n'))
        self.stdout.write('-' * 80)
        
        current_dept = None
        for sec in sections:
            dept = sec.batch.course.department if sec.batch and sec.batch.course and sec.batch.course.department else None
            dept_short = dept.short_name if dept else 'N/A'
            dept_name = dept.name if dept else 'No Department'
            batch_name = sec.batch.name if sec.batch else 'N/A'
            section_name = sec.name
            
            # Print department header
            if dept_short != current_dept:
                current_dept = dept_short
                self.stdout.write(f'\n{self.style.HTTP_INFO(f"Department: {dept_short} - {dept_name}")}')
            
            # Format for Excel: "DEPT :: BATCH :: SECTION"
            excel_format = f"{dept_short} :: {batch_name} :: {section_name}"
            self.stdout.write(f'  {excel_format}')
        
        self.stdout.write('\n' + '-' * 80)
        self.stdout.write(self.style.SUCCESS('\nExcel Import Format Examples:'))
        self.stdout.write('  batch column:   CSE :: 2023')
        self.stdout.write('  section column: CSE :: 2023 :: A')
        self.stdout.write('\nOr use simple format:')
        self.stdout.write('  batch column:   2023')
        self.stdout.write('  section column: 2023 :: A')
        self.stdout.write('\n')
        
        # Also list all batches
        batches = Batch.objects.select_related('course__department').order_by('course__department__short_name', 'name')
        self.stdout.write(self.style.SUCCESS(f'\nFound {batches.count()} batches:\n'))
        self.stdout.write('-' * 80)
        
        for batch in batches:
            dept = batch.course.department if batch.course and batch.course.department else None
            dept_short = dept.short_name if dept else 'N/A'
            excel_format = f"{dept_short} :: {batch.name}"
            self.stdout.write(f'  {excel_format}')
        
        self.stdout.write('\n' + '-' * 80 + '\n')
