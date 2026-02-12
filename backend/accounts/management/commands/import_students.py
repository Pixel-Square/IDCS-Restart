from django.core.management.base import BaseCommand, CommandError
import csv
from django.db import transaction
from django.utils import timezone
from datetime import date

from accounts.models import User, Role
from academics.models import StudentProfile, Section, Semester, Course

class Command(BaseCommand):
    help = 'Import students from CSV and assign to a section'

    def add_arguments(self, parser):
        parser.add_argument('--file', '-f', dest='file', help='CSV file path', required=True)
        parser.add_argument('--section-name', dest='section_name', help='Section name (e.g., BE(CSE))', required=True)
        parser.add_argument('--course-contains', dest='course_contains', help='Course name substring to match (e.g., Artificial Intelligence)', required=True)
        parser.add_argument('--semester', dest='semester', type=int, help='Semester number (e.g., 4)', required=True)

    def handle(self, *args, **options):
        path = options['file']
        section_name = options['section_name']
        course_contains = options['course_contains']
        semester_number = options['semester']

        try:
            with open(path, newline='', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                rows = list(reader)
        except FileNotFoundError:
            raise CommandError(f'File not found: {path}')

        # locate Section
        section = None
        try:
            course_qs = Course.objects.filter(name__icontains=course_contains)
            if not course_qs.exists():
                self.stdout.write(self.style.ERROR(f'No course found matching "{course_contains}"'))
                return
            semester_qs = Semester.objects.filter(number=semester_number)
            if not semester_qs.exists():
                self.stdout.write(self.style.ERROR(f'No semester {semester_number} found'))
                return
            # prefer sections under those semesters with given section name and course
            section_qs = Section.objects.filter(semester__in=semester_qs, name__iexact=section_name, batch__course__in=course_qs)
            if section_qs.exists():
                section = section_qs.first()
            else:
                # fallback: any section under the semester and course
                section = Section.objects.filter(semester__in=semester_qs, batch__course__in=course_qs).first()
            if not section:
                self.stdout.write(self.style.ERROR('No section found to assign students'))
                return
        except Exception as e:
            raise CommandError(str(e))

        self.stdout.write(self.style.SUCCESS(f'Assigning students to section: {section}'))

        # ensure STUDENT role exists
        student_role, _ = Role.objects.get_or_create(name__iexact='STUDENT', defaults={'name': 'STUDENT'})
        # Above get_or_create with name__iexact won't work; adjust below
        try:
            student_role = Role.objects.filter(name__iexact='STUDENT').first()
            if student_role is None:
                student_role = Role.objects.create(name='STUDENT')
        except Exception:
            student_role = Role.objects.create(name='STUDENT')

        created = 0
        updated = 0
        errors = []

        for r in rows:
            username = (r.get('username') or '').strip()
            email = (r.get('email') or '').strip()
            password = (r.get('password') or '').strip() or None
            profile_type = (r.get('profile_type') or '').strip().upper()
            reg_no = (r.get('reg_no') or '').strip()
            batch = (r.get('batch') or '').strip()
            status = (r.get('status') or '').strip().upper() or 'ACTIVE'

            if not username or not email:
                errors.append((username, 'missing username or email'))
                continue

            with transaction.atomic():
                user, user_created = User.objects.get_or_create(username=username, defaults={'email': email})
                if not user_created:
                    # update email if different
                    if user.email != email:
                        user.email = email
                        user.save(update_fields=['email'])
                else:
                    if password:
                        user.set_password(password)
                    else:
                        user.set_unusable_password()
                    user.save()

                # create or update StudentProfile
                try:
                    sp = getattr(user, 'student_profile', None)
                    if sp is None:
                        sp = StudentProfile.objects.create(user=user, reg_no=reg_no, batch=batch, status=status)
                        created += 1
                    else:
                        # existing profile: do not change reg_no if set
                        if not sp.reg_no:
                            sp.reg_no = reg_no
                        sp.batch = batch
                        sp.status = status
                        sp.save()
                        updated += 1

                    # assign section via StudentSectionAssignment by creating a new assignment
                    # use get_current_section_assignment property for existing
                    from academics.models import StudentSectionAssignment
                    assignment = StudentSectionAssignment(student=sp, section=section)
                    assignment.save()

                    # assign STUDENT role if not already
                    if not user.roles.filter(name__iexact='STUDENT').exists():
                        user_role = student_role
                        user.user_roles.create(role=user_role)

                except Exception as e:
                    errors.append((username, str(e)))
                    # rollback handled by transaction
                    continue

        self.stdout.write(self.style.SUCCESS(f'Import finished. Created: {created}, Updated: {updated}, Errors: {len(errors)}'))
        if errors:
            for u, msg in errors:
                self.stdout.write(self.style.ERROR(f'{u}: {msg}'))
