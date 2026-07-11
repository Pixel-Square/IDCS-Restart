from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Reactivate user accounts whose staff/student profile indicates ACTIVE but user.is_active is False.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually update user records. Without this flag the command only shows candidates.')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        from django.contrib.auth import get_user_model
        from academics.models import StaffProfile, StudentProfile

        User = get_user_model()

        staff_qs = StaffProfile.objects.filter(status__iexact='ACTIVE', user__is_active=False).select_related('user')
        student_qs = StudentProfile.objects.filter(status__iexact='ACTIVE', user__is_active=False).select_related('user')

        self.stdout.write(f'Found {staff_qs.count()} staff and {student_qs.count()} student users to consider reactivating.')

        if staff_qs.exists():
            self.stdout.write('Staff candidates:')
            for sp in staff_qs:
                self.stdout.write(f'  user_id={sp.user.id} staff_id={sp.staff_id} username={sp.user.username} email={sp.user.email}')

        if student_qs.exists():
            self.stdout.write('Student candidates:')
            for sp in student_qs:
                self.stdout.write(f'  user_id={sp.user.id} reg_no={sp.reg_no} username={sp.user.username} email={sp.user.email}')

        if not apply_changes:
            self.stdout.write(self.style.WARNING('No changes applied. Re-run with --apply to activate these users.'))
            return

        # Apply updates inside a transaction
        with transaction.atomic():
            for sp in staff_qs:
                sp.user.is_active = True
                sp.user.save(update_fields=['is_active'])
            for sp in student_qs:
                sp.user.is_active = True
                sp.user.save(update_fields=['is_active'])

        self.stdout.write(self.style.SUCCESS('Reactivated candidate users.'))
