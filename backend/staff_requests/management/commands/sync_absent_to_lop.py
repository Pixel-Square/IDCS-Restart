"""
Management command to sync absent days to LOP balances.

This command counts all absent attendance records and calculates LOP for each staff member.
LOP = Total absent days - Approved deduct form days covering those absent dates

Run this:
- Initially to set up LOP from existing attendance data
- Periodically (daily/weekly) to keep LOP in sync with attendance
- After bulk attendance uploads

Usage:
    python manage.py sync_absent_to_lop
    python manage.py sync_absent_to_lop --user username
    python manage.py sync_absent_to_lop --from-date 2026-01-01 --to-date 2026-03-31
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db.models import Q
from datetime import datetime, date

User = get_user_model()


class Command(BaseCommand):
    help = 'Sync absent attendance days to LOP balances'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user',
            type=str,
            help='Sync LOP for specific user (username)',
        )
        parser.add_argument(
            '--from-date',
            type=str,
            help='Start date for counting absences (YYYY-MM-DD)',
        )
        parser.add_argument(
            '--to-date',
            type=str,
            help='End date for counting absences (YYYY-MM-DD)',
        )
        parser.add_argument(
            '--lop-name',
            type=str,
            default='LOP',
            help='LOP field name to use (default: LOP)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )

    def handle(self, *args, **options):
        from staff_attendance.models import AttendanceRecord
        from staff_requests.models import StaffRequest, StaffLeaveBalance
        
        # Parse date range
        from_date = None
        to_date = None
        
        if options['from_date']:
            from_date = datetime.strptime(options['from_date'], '%Y-%m-%d').date()
        if options['to_date']:
            to_date = datetime.strptime(options['to_date'], '%Y-%m-%d').date()
        
        # Filter users
        users = User.objects.all()
        if options['user']:
            users = users.filter(username=options['user'])
        
        lop_name = options['lop_name']
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        self.stdout.write(f'Syncing LOP for {users.count()} users...')
        if from_date:
            self.stdout.write(f'Date range: {from_date} to {to_date or "present"}')
        
        total_updated = 0
        
        for user in users:
            # Build attendance query
            attendance_query = Q(user=user, status='absent')
            if from_date:
                attendance_query &= Q(date__gte=from_date)
            if to_date:
                attendance_query &= Q(date__lte=to_date)
            
            # Count total absent days
            absent_count = AttendanceRecord.objects.filter(attendance_query).count()
            
            if absent_count == 0:
                continue
            
            # Get all absent dates
            absent_dates = list(
                AttendanceRecord.objects.filter(attendance_query)
                .values_list('date', flat=True)
            )
            
            # Count how many of these absent dates are covered by approved deduct forms
            covered_dates = set()
            
            # Find all approved deduct requests for this user
            approved_requests = StaffRequest.objects.filter(
                applicant=user,
                status='approved',
                template__leave_policy__action='deduct'
            )
            
            # Check each approved request to see if it covers any absent dates
            for request in approved_requests:
                form_data = request.form_data
                request_dates = self._extract_dates_from_form(form_data)
                
                # Find which request dates were in the absent list
                for req_date in request_dates:
                    if req_date in absent_dates:
                        covered_dates.add(req_date)
            
            # Calculate LOP: Total absent - Covered by approved forms
            lop_count = absent_count - len(covered_dates)
            
            # Get or create LOP balance
            lop_balance, created = StaffLeaveBalance.objects.get_or_create(
                staff=user,
                leave_type=lop_name,
                defaults={'balance': 0.0}
            )
            
            old_lop = lop_balance.balance
            
            if not dry_run:
                lop_balance.balance = lop_count
                lop_balance.save()
            
            if old_lop != lop_count:
                status_style = self.style.SUCCESS if lop_count < old_lop else self.style.WARNING
                self.stdout.write(
                    status_style(
                        f'  {user.username}: Absent={absent_count}, Covered={len(covered_dates)}, '
                        f'LOP: {old_lop} -> {lop_count}'
                    )
                )
                total_updated += 1
        
        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN: Would update {total_updated} users'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Successfully updated LOP for {total_updated} users'))
    
    def _extract_dates_from_form(self, form_data):
        """Extract date list from form_data"""
        from datetime import timedelta
        
        dates = []
        start_date = None
        end_date = None
        
        # Try different field name patterns
        for start_key in ['start_date', 'from_date', 'startDate', 'fromDate', 'from']:
            if start_key in form_data:
                start_date = form_data[start_key]
                break
        
        for end_key in ['end_date', 'to_date', 'endDate', 'toDate', 'to']:
            if end_key in form_data:
                end_date = form_data[end_key]
                break

        if not start_date and 'date' in form_data:
            start_date = form_data['date']
        if not end_date and 'date' in form_data:
            end_date = form_data['date']
        
        if start_date and end_date:
            try:
                if isinstance(start_date, str):
                    start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
                else:
                    start = start_date
                
                if isinstance(end_date, str):
                    end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
                else:
                    end = end_date
                
                current = start
                while current <= end:
                    dates.append(current)
                    current += timedelta(days=1)
            except Exception:
                pass
        
        return dates
