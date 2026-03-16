"""
Management command to apply split-period allocation for deduct leave forms.

This command adds the second half of the annual allocation to staff balances
when the split_date arrives. Should be run on or after the split_date.

Usage:
    python manage.py apply_split_allocation
    python manage.py apply_split_allocation --template "Casual Leave"
    python manage.py apply_split_allocation --dry-run
    python manage.py apply_split_allocation --force
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from datetime import datetime, date

User = get_user_model()


class Command(BaseCommand):
    help = 'Apply second half of split allocation to staff leave balances'

    def add_arguments(self, parser):
        parser.add_argument(
            '--template',
            type=str,
            help='Apply split allocation for specific template only',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force application even if split_date has not arrived',
        )

    def handle(self, *args, **options):
        from staff_requests.models import RequestTemplate, StaffLeaveBalance
        
        dry_run = options['dry_run']
        force = options['force']
        template_name = options.get('template')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        # Get all active templates with leave_policy and split_date
        templates = RequestTemplate.objects.filter(
            is_active=True
        ).exclude(leave_policy={})
        
        if template_name:
            templates = templates.filter(name=template_name)
        
        today = date.today()
        total_updated = 0
        
        for template in templates:
            leave_policy = template.leave_policy
            
            if not leave_policy or 'action' not in leave_policy:
                continue
            
            action = leave_policy.get('action')
            
            # Only process deduct and neutral action templates with allotment
            if action not in ['deduct', 'neutral']:
                continue
            
            # Check if allotment is configured (required for split logic)
            allotment_per_role = leave_policy.get('allotment_per_role', {})
            if not allotment_per_role:
                continue
            
            split_date_str = leave_policy.get('split_date')
            
            # Skip if no split_date configured
            if not split_date_str:
                continue
            
            from_date_str = leave_policy.get('from_date')
            to_date_str = leave_policy.get('to_date')
            
            if not from_date_str or not to_date_str:
                self.stdout.write(
                    self.style.WARNING(
                        f'Skipping {template.name}: Missing from_date or to_date'
                    )
                )
                continue
            
            try:
                split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                self.stdout.write(
                    self.style.ERROR(
                        f'Invalid date format in {template.name}: split_date={split_date_str}, from_date={from_date_str}, to_date={to_date_str}'
                    )
                )
                continue
            
            # Check if we're in the valid window for split allocation
            if not force and today < split_date:
                self.stdout.write(
                    self.style.WARNING(
                        f'Skipping {template.name}: Split date {split_date} has not arrived yet (today: {today})'
                    )
                )
                continue
            
            if today > to_date:
                self.stdout.write(
                    self.style.WARNING(
                        f'Skipping {template.name}: Period has ended (to_date: {to_date})'
                    )
                )
                continue
            
            # Get all balances for this leave type
            balances = StaffLeaveBalance.objects.filter(leave_type=template.name)
            
            if balances.count() == 0:
                self.stdout.write(
                    self.style.WARNING(
                        f'Skipping {template.name}: No balance records found'
                    )
                )
                continue
            
            self.stdout.write(f'\n{template.name}')
            self.stdout.write(f'  Split date: {split_date}')
            self.stdout.write(f'  Period: {from_date} to {to_date}')
            self.stdout.write(f'  Balances to update: {balances.count()}')
            
            allotment_per_role = leave_policy.get('allotment_per_role', {})
            
            if not allotment_per_role:
                self.stdout.write(
                    self.style.WARNING(
                        f'  No allotment_per_role configured for {template.name}'
                    )
                )
                continue
            
            for balance in balances:
                # Get user's primary role
                user_role = self._get_primary_role(balance.staff)
                full_allotment = allotment_per_role.get(user_role, 0.0)
                second_half = full_allotment / 2
                
                old_balance = balance.balance
                new_balance = old_balance + second_half
                
                if not dry_run:
                    balance.balance = new_balance
                    balance.save()
                
                self.stdout.write(
                    self.style.SUCCESS(
                        f'    {balance.staff.username} ({user_role}): {old_balance} + {second_half} = {new_balance}'
                    )
                )
                total_updated += 1
        
        if total_updated == 0:
            self.stdout.write(
                self.style.WARNING(
                    '\nNo balances updated. Possible reasons:'
                    '\n  - No templates with split_date configured'
                    '\n  - Split date has not arrived yet (use --force to override)'
                    '\n  - Period has ended'
                    '\n  - No staff have balance records yet'
                )
            )
        elif dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'\nDRY RUN: Would update {total_updated} balance(s)'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSuccessfully updated {total_updated} balance(s)'
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
