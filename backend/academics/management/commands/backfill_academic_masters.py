from django.core.management.base import BaseCommand
from academics.models import Department, Program, Course, Semester, Section
from academics.models import StudentProfile, StaffProfile

class Command(BaseCommand):
    help = 'Backfill academic master records from existing profile text fields. Idempotent.'

    def handle(self, *args, **options):
        self.stdout.write('Starting backfill...')

        # Backfill departments from StaffProfile.department_text if exists
        for staff in StaffProfile.objects.exclude(department__isnull=False):
            dept_text = getattr(staff, 'department_text', None)
            if not dept_text:
                continue
            dept, created = Department.objects.get_or_create(code=dept_text.lower().replace(' ', '_'), defaults={'name': dept_text})
            staff.department = dept
            staff.save(update_fields=['department'])
            self.stdout.write(f'Linked StaffProfile {staff.pk} -> Department {dept.pk}')

        # Backfill sections from StudentProfile.section_text
        for student in StudentProfile.objects.exclude(section__isnull=False):
            section_text = getattr(student, 'section_text', None)
            if not section_text:
                continue
            # create minimal chain: Department -> Program -> Course -> Semester -> Section
            dept, _ = Department.objects.get_or_create(code='unknown', defaults={'name': 'Unknown'})
            program, _ = Program.objects.get_or_create(name='Unknown Program')
            course, _ = Course.objects.get_or_create(name='Unknown Course', department=dept, program=program)
            semester, _ = Semester.objects.get_or_create(number=1, course=course)
            section, _ = Section.objects.get_or_create(name=section_text, semester=semester)
            student.section = section
            student.save(update_fields=['section'])
            self.stdout.write(f'Linked StudentProfile {student.pk} -> Section {section.pk}')

        self.stdout.write('Backfill complete.')
