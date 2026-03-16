"""
Management command to check and initialize leave balances for staff.

Usage:
    python manage.py check_leave_balances
    python manage.py check_leave_balances --staff-id 3171022
    python manage.py check_leave_balances --initialize
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.models import User
from staff_requests.models import RequestTemplate, StaffLeaveBalance


class Command(BaseCommand):
    help = 'Check and optionally initialize leave balances for staff'

    def add_arguments(self, parser):
        parser.add_argument(
            '--staff-id',
            type=str,
            help='Check specific staff ID only'
        )
        parser.add_argument(
            '--initialize',
            action='store_true',
            help='Initialize missing balance records'
        )

    def _get_primary_role(self, user):
        """Get primary role for a user.
        SPL roles take priority over generic STAFF/FACULTY."""
        try:
            roles = list(user.roles.values_list('name', flat=True))
            # SPL roles first so staff who also hold an SPL role get the SPL allotment
            role_priority = ['HOD', 'IQAC', 'HR', 'PS', 'CFSW', 'EDC', 'COE', 'HAA',
                             'AHOD', 'FACULTY', 'STAFF']
            for role in role_priority:
                if role in roles:
                    return role
            return roles[0] if roles else 'STAFF'
        except Exception:
            return 'STAFF'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== Leave Balance Check ===\n'))
        
        # Get staff to check
        if options['staff_id']:
            try:
                users = [User.objects.get(staff_profile__staff_id=options['staff_id'])]
                self.stdout.write(f"Checking staff ID: {options['staff_id']}")
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Staff with ID {options['staff_id']} not found"))
                return
        else:
            # Check all users with staff profiles
            users = User.objects.filter(staff_profile__isnull=False).select_related('staff_profile')
            self.stdout.write(f"Checking all {users.count()} staff members\n")
        
        # Get all active deduct and neutral templates with allotment
        deduct_templates = RequestTemplate.objects.filter(
            is_active=True,
            leave_policy__action__in=['deduct', 'neutral']
        ).exclude(leave_policy__allotment_per_role={})
        
        self.stdout.write(self.style.SUCCESS(f"Found {deduct_templates.count()} active deduct/neutral templates with allotment:\n"))
        for template in deduct_templates:
            allotment = template.leave_policy.get('allotment_per_role', {})
            self.stdout.write(f"  - {template.name}: {allotment}")
        
        self.stdout.write('')
        
        # Check each user
        initialized_count = 0
        for user in users:
            staff_id = 'N/A'
            try:
                if hasattr(user, 'staff_profile') and user.staff_profile:
                    staff_id = user.staff_profile.staff_id
            except Exception:
                pass
            
            # Get user's role
            user_role = self._get_primary_role(user)
            
            self.stdout.write(f"\n{'='*80}")
            self.stdout.write(f"Staff: {user.username} (ID: {staff_id})")
            self.stdout.write(f"Role: {user_role}")
            self.stdout.write(f"Roles: {', '.join(user.roles.values_list('name', flat=True))}")
            
            # Check existing balances
            existing_balances = StaffLeaveBalance.objects.filter(staff=user)
            self.stdout.write(f"\nExisting balances ({existing_balances.count()}):")
            for balance in existing_balances:
                self.stdout.write(f"  - {balance.leave_type}: {balance.balance}")
            
            # Check what balances should exist
            self.stdout.write(f"\nExpected balances from templates:")
            for template in deduct_templates:
                from datetime import datetime, date
                
                allotment_per_role = template.leave_policy.get('allotment_per_role', {})
                full_allotment = allotment_per_role.get(user_role, 0)
                
                # Check for split_date logic
                split_date_str = template.leave_policy.get('split_date')
                today = date.today()
                
                if split_date_str and full_allotment > 0:
                    try:
                        split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                        
                        # If today is before split_date, initialize with first half only
                        if today < split_date:
                            expected_balance = full_allotment / 2
                        else:
                            # After split_date, use full allotment
                            expected_balance = full_allotment
                    except (ValueError, TypeError):
                        # If split_date parsing fails, use full allotment
                        expected_balance = full_allotment
                else:
                    # No split, use full allotment
                    expected_balance = full_allotment
                
                # Check if balance exists
                balance_exists = existing_balances.filter(leave_type=template.name).exists()
                
                if expected_balance > 0:
                    status = "[OK]" if balance_exists else "[MISSING]"
                    split_info = f" [split: {split_date_str}]" if split_date_str else ""
                    self.stdout.write(f"  - {template.name}: {expected_balance} days {status}{split_info}")
                    
                    # Initialize if requested and missing
                    if options['initialize'] and not balance_exists:
                        with transaction.atomic():
                            StaffLeaveBalance.objects.create(
                                staff=user,
                                leave_type=template.name,
                                balance=float(expected_balance)
                            )
                        self.stdout.write(self.style.SUCCESS(f"    >> Initialized {template.name} with {expected_balance} days"))
                        initialized_count += 1
                else:
                    self.stdout.write(f"  - {template.name}: No allocation for role '{user_role}'")
        
        # Summary
        self.stdout.write(f"\n{'='*80}")
        if options['initialize']:
            self.stdout.write(self.style.SUCCESS(f"\nInitialized {initialized_count} balance records"))
        else:
            self.stdout.write(self.style.WARNING("\nTo initialize missing balances, run with --initialize flag"))
