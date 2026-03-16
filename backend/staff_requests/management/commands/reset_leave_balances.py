"""
Management command to reset leave balances based on template reset durations.

This command checks all templates with leave_policy and resets balances when
the reset period (from_date to to_date) has ended.

Reset behaviors:
- COL (earn action): Reset to 0 at end of period
- Deduct forms (CL, etc.): Reset to allotment_per_role at start of new period
- LOP: Reset to 0 at end of period (unless lop_non_reset is True)

Run this:
- Daily via cron job to check and reset expired periods
- Manually after changing template reset durations

Usage:
    python manage.py reset_leave_balances
    python manage.py reset_leave_balances --template "Casual Leave"
    python manage.py reset_leave_balances --dry-run
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import datetime, date

User = get_user_model()


class Command(BaseCommand):
    help = 'Reset leave balances based on template reset durations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--template',
            type=str,
            help='Reset balances for specific template only',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force reset even if period has not ended',
        )

    def handle(self, *args, **options):
        from staff_requests.models import RequestTemplate, StaffLeaveBalance
        
        dry_run = options['dry_run']
        force_reset = options['force']
        template_name = options.get('template')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        # Get all active templates with leave_policy
        templates = RequestTemplate.objects.filter(
            is_active=True
        ).exclude(leave_policy={})
        
        if template_name:
            templates = templates.filter(name=template_name)
        
        today = date.today()
        total_reset = 0
        
        for template in templates:
            leave_policy = template.leave_policy
            
            if not leave_policy or 'action' not in leave_policy:
                continue
            
            action = leave_policy.get('action')
            from_date_str = leave_policy.get('from_date')
            to_date_str = leave_policy.get('to_date')
            
            # Skip if no reset period defined
            if not from_date_str or not to_date_str:
                continue
            
            try:
                from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                self.stdout.write(
                    self.style.ERROR(
                        f'  Invalid date format in {template.name}: from_date={from_date_str}, to_date={to_date_str}'
                    )
                )
                continue
            
            # Check if reset period has ended
            period_ended = today > to_date
            
            if not period_ended and not force_reset:
                continue
            
            # Get all balances for this leave type
            balances = StaffLeaveBalance.objects.filter(leave_type=template.name)
            
            if balances.count() == 0:
                continue
            
            self.stdout.write(f'\n{template.name} (Action: {action})')
            self.stdout.write(f'  Reset period: {from_date} to {to_date}')
            self.stdout.write(f'  Period ended: {period_ended}')
            self.stdout.write(f'  Balances to reset: {balances.count()}')
            
            # Reset based on action type
            if action == 'earn':
                # COL and other earn types: Reset to 0
                reset_value = 0.0
                self.stdout.write(f'  Resetting COL/Earn balances to {reset_value}')
                
                for balance in balances:
                    old_value = balance.balance
                    if old_value != reset_value:
                        if not dry_run:
                            balance.balance = reset_value
                            balance.save()
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'    {balance.staff.username}: {old_value} -> {reset_value}'
                            )
                        )
                        total_reset += 1
            
            elif action == 'deduct':
                # Deduct forms: Reset to allotment_per_role for new period
                allotment = leave_policy.get('allotment_per_role', {})
                overdraft_name = leave_policy.get('overdraft_name', 'LOP')
                lop_non_reset = leave_policy.get('lop_non_reset', False)
                split_date_str = leave_policy.get('split_date')
                
                # Check if we should apply split logic
                use_split = False
                if split_date_str:
                    try:
                        split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                        # At reset (start of period), initialize with first half if split is configured
                        use_split = True
                        self.stdout.write(f'  Split date configured: {split_date} (will initialize with half allotment)')
                    except (ValueError, TypeError):
                        self.stdout.write(
                            self.style.WARNING(
                                f'  Invalid split_date format: {split_date_str}. Using full allotment.'
                            )
                        )
                
                if allotment:
                    self.stdout.write(f'  Resetting deduct balances to allotment_per_role' + (' (halved for split)' if use_split else ''))
                    
                    for balance in balances:
                        # Get user's primary role
                        user_role = self._get_primary_role(balance.staff)
                        full_allotment = allotment.get(user_role, 0.0)
                        
                        # Apply split logic if configured
                        reset_value = (full_allotment / 2) if use_split else full_allotment
                        old_value = balance.balance
                        
                        if old_value != reset_value:
                            if not dry_run:
                                balance.balance = reset_value
                                balance.save()
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f'    {balance.staff.username} ({user_role}): {old_value} -> {reset_value}' + (' [first half]' if use_split else '')
                                )
                            )
                            total_reset += 1
                
                # Also reset LOP for this template (if not marked as non-resetting)
                if not lop_non_reset:
                    lop_balances = StaffLeaveBalance.objects.filter(leave_type=overdraft_name)
                    
                    if lop_balances.count() > 0:
                        self.stdout.write(f'  Resetting {overdraft_name} to 0 (lop_non_reset={lop_non_reset})')
                        
                        for lop_balance in lop_balances:
                            old_lop = lop_balance.balance
                            if old_lop != 0.0:
                                if not dry_run:
                                    lop_balance.balance = 0.0
                                    lop_balance.save()
                                self.stdout.write(
                                    self.style.SUCCESS(
                                        f'    {lop_balance.staff.username}: {old_lop} -> 0.0'
                                    )
                                )
                                total_reset += 1
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f'  Skipping {overdraft_name} reset (lop_non_reset=True)'
                        )
                    )
            
            elif action == 'neutral':
                # Neutral forms: Reset to allotment_per_role if configured (similar to deduct)
                allotment = leave_policy.get('allotment_per_role', {})
                split_date_str = leave_policy.get('split_date')
                
                if not allotment:
                    # No allotment configured - no reset needed
                    self.stdout.write(
                        self.style.WARNING(
                            f'  Neutral action - no allotment configured, skipping reset'
                        )
                    )
                    continue
                
                # Check if we should apply split logic
                use_split = False
                if split_date_str:
                    try:
                        split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                        use_split = True
                        self.stdout.write(f'  Split date configured: {split_date} (will initialize with half allotment)')
                    except (ValueError, TypeError):
                        self.stdout.write(
                            self.style.WARNING(
                                f'  Invalid split_date format: {split_date_str}. Using full allotment.'
                            )
                        )
                
                self.stdout.write(f'  Resetting neutral balances to allotment_per_role' + (' (halved for split)' if use_split else ''))
                
                for balance in balances:
                    # Get user's primary role
                    user_role = self._get_primary_role(balance.staff)
                    full_allotment = allotment.get(user_role, 0.0)
                    
                    # Apply split logic if configured
                    reset_value = (full_allotment / 2) if use_split else full_allotment
                    old_value = balance.balance
                    
                    if old_value != reset_value:
                        if not dry_run:
                            balance.balance = reset_value
                            balance.save()
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'    {balance.staff.username} ({user_role}): {old_value} -> {reset_value}' + (' [first half]' if use_split else '')
                            )
                        )
                        total_reset += 1
        
        if total_reset == 0:
            self.stdout.write(
                self.style.WARNING(
                    f'\nDRY RUN: Would reset {total_reset} balance(s)'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSuccessfully reset {total_reset} balance(s)'
                )
            )
    
    def _get_primary_role(self, user):
        """Get the primary role for a user.
        SPL roles take priority over generic STAFF/FACULTY."""
        try:
            # Prefer user.roles (direct role names) when available
            if hasattr(user, 'roles'):
                role_names = list(user.roles.values_list('name', flat=True))
                if role_names:
                    role_priority = ['HOD', 'IQAC', 'HR', 'PS', 'CFSW', 'EDC', 'COE', 'HAA',
                                     'AHOD', 'FACULTY', 'STAFF']
                    for priority_role in role_priority:
                        if priority_role in role_names:
                            return priority_role
                    return role_names[0]
            # Fallback: user_roles through-model
            if hasattr(user, 'user_roles'):
                role_names = list(user.user_roles.values_list('role__name', flat=True))
                if role_names:
                    role_priority = ['HOD', 'IQAC', 'HR', 'PS', 'CFSW', 'EDC', 'COE', 'HAA',
                                     'AHOD', 'FACULTY', 'STAFF']
                    for priority_role in role_priority:
                        if priority_role in role_names:
                            return priority_role
                    return role_names[0]
        except Exception:
            pass
        # Fallback to groups
        if user.groups.exists():
            return user.groups.first().name
        return 'STAFF'
