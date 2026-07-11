from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = (
        'Bulk reset passwords for staff and students. '
        'Staff password = staff_id, Student password = reg_no. '
        'Superusers are NOT modified (preserved). '
        'Run without --apply to preview changes.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually update passwords. Without this flag shows preview only.')
        parser.add_argument('--skip-staff', action='store_true', help='Skip staff password resets.')
        parser.add_argument('--skip-students', action='store_true', help='Skip student password resets.')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        skip_staff = options['skip_staff']
        skip_students = options['skip_students']

        from academics.models import StaffProfile, StudentProfile

        User = get_user_model()

        # Collect candidates (non-superusers only)
        staff_candidates = []
        student_candidates = []

        if not skip_staff:
            # Staff: filter out superusers
            staff_qs = StaffProfile.objects.filter(user__is_superuser=False).select_related('user')
            for sp in staff_qs:
                staff_candidates.append({
                    'user': sp.user,
                    'new_password': sp.staff_id,
                    'identifier': f"staff_id={sp.staff_id}",
                    'profile_type': 'STAFF',
                })

        if not skip_students:
            # Student: filter out superusers
            student_qs = StudentProfile.objects.filter(user__is_superuser=False).select_related('user')
            for sp in student_qs:
                student_candidates.append({
                    'user': sp.user,
                    'new_password': sp.reg_no,
                    'identifier': f"reg_no={sp.reg_no}",
                    'profile_type': 'STUDENT',
                })

        all_candidates = staff_candidates + student_candidates

        self.stdout.write(f'Found {len(staff_candidates)} staff and {len(student_candidates)} student users to reset.')
        self.stdout.write(f'Total: {len(all_candidates)} password resets.\n')

        # Show preview
        if staff_candidates:
            self.stdout.write('Staff password resets (user_id, email, new_password):')
            for cand in staff_candidates[:20]:  # show first 20
                user = cand['user']
                self.stdout.write(f'  user_id={user.id} email={user.email} → password={cand["new_password"]}')
            if len(staff_candidates) > 20:
                self.stdout.write(f'  ... and {len(staff_candidates) - 20} more')
            self.stdout.write('')

        if student_candidates:
            self.stdout.write('Student password resets (user_id, email, new_password):')
            for cand in student_candidates[:20]:  # show first 20
                user = cand['user']
                self.stdout.write(f'  user_id={user.id} email={user.email} → password={cand["new_password"]}')
            if len(student_candidates) > 20:
                self.stdout.write(f'  ... and {len(student_candidates) - 20} more')
            self.stdout.write('')

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    f'Preview only. Re-run with --apply to reset {len(all_candidates)} passwords.'
                )
            )
            return

        # Apply changes with transaction
        self.stdout.write(self.style.WARNING(f'Applying password resets to {len(all_candidates)} users...'))
        
        changed = 0
        errors = 0
        
        with transaction.atomic():
            for cand in all_candidates:
                try:
                    user = cand['user']
                    new_password = cand['new_password']
                    user.set_password(new_password)
                    user.save(update_fields=['password'])
                    changed += 1
                except Exception as e:
                    errors += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f'Failed to reset password for user_id={cand["user"].id} {cand["identifier"]}: {e}'
                        )
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f'Password reset complete: {changed} succeeded, {errors} failed.'
            )
        )

        if changed > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    '\nAll staff can now login with their staff_id as password.'
                )
            )
            self.stdout.write(
                self.style.SUCCESS(
                    'All students can now login with their reg_no as password.'
                )
            )
            self.stdout.write(
                self.style.WARNING(
                    'Superusers are unchanged and unaffected.'
                )
            )
