"""
Management command to sync absent days to LOP balances.

This command counts absent attendance sessions and calculates LOP for each staff member.
LOP units = Total absent units (FN/AN each 0.5) - Approved non-earn form units covering those absences

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
            attendance_query = Q(user=user)
            if from_date:
                attendance_query &= Q(date__gte=from_date)
            if to_date:
                attendance_query &= Q(date__lte=to_date)

            attendance_records = list(AttendanceRecord.objects.filter(attendance_query))
            absent_units_by_date = self._build_absent_units_by_date(attendance_records, user)
            absent_units_total = round(sum(absent_units_by_date.values()), 2)

            if absent_units_total <= 0:
                continue

            # Count how many absent units are covered by approved deduct/neutral forms
            covered_units = 0.0
            
            # Find all approved non-earn requests for this user that can compensate absence
            approved_requests = StaffRequest.objects.filter(
                applicant=user,
                status='approved',
                template__leave_policy__action__in=['deduct', 'neutral']
            )

            remaining_absent_units = dict(absent_units_by_date)

            # Check each approved request to see if it covers absent sessions
            for request in approved_requests:
                form_data = request.form_data
                request_units_by_date = self._extract_requested_units_by_date(form_data, user)
                for req_date, req_units in request_units_by_date.items():
                    absent_left = remaining_absent_units.get(req_date, 0.0)
                    if absent_left <= 0:
                        continue
                    covered_now = min(absent_left, float(req_units or 0.0))
                    if covered_now > 0:
                        covered_units += covered_now
                        remaining_absent_units[req_date] = round(absent_left - covered_now, 2)

            # Calculate LOP units
            lop_count = round(max(0.0, absent_units_total - covered_units), 2)
            
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
                        f'  {user.username}: AbsentUnits={absent_units_total}, CoveredUnits={round(covered_units, 2)}, '
                        f'LOP: {old_lop} -> {lop_count}'
                    )
                )
                total_updated += 1
        
        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN: Would update {total_updated} users'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Successfully updated LOP for {total_updated} users'))
    
    def _build_absent_units_by_date(self, attendance_records, user):
        """Map date -> absent units using FN/AN (0.5 each)."""
        units_by_date = {}
        for record in attendance_records:
            if record.date.weekday() == 6 or self._is_holiday_for_user(record.date, user):
                continue
            units = self._attendance_absent_units(record)
            if units > 0:
                units_by_date[record.date] = units
        return units_by_date

    def _attendance_absent_units(self, record):
        fn_status = (record.fn_status or '').strip().lower()
        an_status = (record.an_status or '').strip().lower()

        if fn_status or an_status:
            units = 0.0
            if fn_status == 'absent':
                units += 0.5
            if an_status == 'absent':
                units += 0.5
            return units

        return 1.0 if (record.status or '').strip().lower() == 'absent' else 0.0

    def _extract_requested_units_by_date(self, form_data, user):
        """Extract date->requested units from form_data (FN/AN-aware)."""
        from datetime import timedelta

        dates = {}
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

                from_noon = self._normalize_shift_value(
                    form_data.get('from_noon', form_data.get('from_shift', form_data.get('shift', '')))
                )
                to_noon = self._normalize_shift_value(
                    form_data.get('to_noon', form_data.get('to_shift', form_data.get('shift', '')))
                )

                if start == end:
                    if start.weekday() == 6 or self._is_holiday_for_user(start, user):
                        return {}
                    return {start: self._single_day_units(from_noon, to_noon)}

                current = start
                while current <= end:
                    if current.weekday() == 6 or self._is_holiday_for_user(current, user):
                        current += timedelta(days=1)
                        continue

                    units = 1.0
                    if current == start and from_noon == 'AN':
                        units = 0.5
                    if current == end and to_noon == 'FN':
                        units = 0.5
                    dates[current] = units
                    current += timedelta(days=1)
            except Exception:
                pass

        return dates

    def _normalize_shift_value(self, value):
        token = str(value or '').strip().upper()
        if token == 'FULL DAY':
            token = 'FULL'
        return token

    def _single_day_units(self, from_noon, to_noon):
        if from_noon in ['FN', 'AN'] and to_noon in ['FN', 'AN']:
            return 0.5 if from_noon == to_noon else 1.0
        if from_noon in ['FN', 'AN'] and not to_noon:
            return 0.5
        if to_noon in ['FN', 'AN'] and not from_noon:
            return 0.5
        if from_noon == 'FULL' or to_noon == 'FULL':
            return 1.0
        return 1.0

    def _is_holiday_for_user(self, target_date, user):
        from staff_attendance.models import Holiday

        holidays = Holiday.objects.filter(date=target_date).prefetch_related('departments')
        if not holidays.exists():
            return False

        user_dept_id = None
        try:
            if user and hasattr(user, 'staff_profile'):
                dept = user.staff_profile.get_current_department()
                if dept:
                    user_dept_id = dept.id
        except Exception:
            user_dept_id = None

        for holiday in holidays:
            dept_ids = list(holiday.departments.values_list('id', flat=True))
            if not dept_ids:
                return True
            if user_dept_id is not None and user_dept_id in dept_ids:
                return True

        return False
