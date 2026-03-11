"""
Management command to clean up obsolete leave balance records.
"""

from django.core.management.base import BaseCommand
from staff_requests.models import StaffLeaveBalance


class Command(BaseCommand):
    help = 'Clean up obsolete leave balance records'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made\n'))
        
        # Find obsolete "Leave request" balances
        obsolete = StaffLeaveBalance.objects.filter(leave_type='Leave request')
        count = obsolete.count()
        
        if count == 0:
            self.stdout.write(self.style.SUCCESS('No obsolete "Leave request" records found'))
            return
        
        self.stdout.write(f'Found {count} obsolete "Leave request" balance records:\n')
        
        for balance in obsolete:
            self.stdout.write(
                f'  - {balance.staff.username}: balance={balance.balance}'
            )
        
        if not dry_run:
            deleted_count, _ = obsolete.delete()
            self.stdout.write(
                self.style.SUCCESS(f'\nDeleted {deleted_count} obsolete balance records')
            )
        else:
            self.stdout.write(
                self.style.WARNING(f'\nDRY RUN: Would delete {count} records')
            )
