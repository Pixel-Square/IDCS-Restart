"""
Management command to fix COL (Compensatory Leave) balance initialization error.

COL is an "earn" type leave that should start at 0 and only increase when
COL requests are approved. This command resets all COL balances to 0.

Usage:
    python manage.py fix_col_balances
    python manage.py fix_col_balances --dry-run
"""

from django.core.management.base import BaseCommand
from staff_requests.models import StaffLeaveBalance, RequestTemplate


class Command(BaseCommand):
    help = 'Reset COL (earn action) balances to 0'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made\n'))
        
        # Find all templates with action='earn'
        earn_templates = RequestTemplate.objects.filter(
            is_active=True,
            leave_policy__action='earn'
        )
        
        self.stdout.write(f'Found {earn_templates.count()} earn action templates:\n')
        
        total_reset = 0
        
        for template in earn_templates:
            leave_type = template.name
            self.stdout.write(f'\n{leave_type}:')
            
            # Find all balances for this leave type
            balances = StaffLeaveBalance.objects.filter(leave_type=leave_type)
            
            if balances.count() == 0:
                self.stdout.write('  No balance records found')
                continue
            
            self.stdout.write(f'  Found {balances.count()} balance records')
            
            # Find balances that are not 0
            non_zero_balances = balances.exclude(balance=0.0)
            
            if non_zero_balances.count() == 0:
                self.stdout.write('  All balances are already 0 ✓')
                continue
            
            self.stdout.write(f'  Resetting {non_zero_balances.count()} non-zero balances:')
            
            for balance in non_zero_balances[:10]:  # Show first 10
                old_value = balance.balance
                self.stdout.write(
                    f'    {balance.staff.username}: {old_value} -> 0'
                )
            
            if non_zero_balances.count() > 10:
                self.stdout.write(f'    ... and {non_zero_balances.count() - 10} more')
            
            if not dry_run:
                # Reset all non-zero balances to 0
                updated_count = non_zero_balances.update(balance=0.0)
                total_reset += updated_count
            else:
                total_reset += non_zero_balances.count()
        
        # Summary
        self.stdout.write('\n' + '='*60)
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'\nDRY RUN: Would reset {total_reset} balance(s) to 0'
                )
            )
            self.stdout.write('\nRun without --dry-run to apply changes')
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSuccessfully reset {total_reset} earn action balance(s) to 0'
                )
            )
            
            self.stdout.write('\n' + self.style.WARNING('IMPORTANT:') + 
                ' Earn balances (like COL) should only increase when earn requests are approved.')
            self.stdout.write('If these balances keep getting set to non-zero values, check for:')
            self.stdout.write('  1. Migrations that incorrectly initialize earn balances')
            self.stdout.write('  2. Code that treats earn actions like deduct actions')
            self.stdout.write('  3. Manual database edits\n')
