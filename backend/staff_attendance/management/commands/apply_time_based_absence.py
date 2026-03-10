"""
Management command to retroactively apply time-based absence logic to existing attendance records.

Usage:
    python manage.py apply_time_based_absence
    python manage.py apply_time_based_absence --staff-id 3171022
    python manage.py apply_time_based_absence --date-from 2026-03-01 --date-to 2026-03-31
    python manage.py apply_time_based_absence --dry-run
"""

from django.core.management.base import BaseCommand
from django.db.models import Q
from staff_attendance.models import AttendanceRecord, AttendanceSettings
from accounts.models import User
from datetime import datetime


class Command(BaseCommand):
    help = 'Retroactively apply time-based absence logic to existing attendance records'

    def add_arguments(self, parser):
        parser.add_argument(
            '--staff-id',
            type=str,
            help='Apply only to specific staff ID (staff_id field)'
        )
        parser.add_argument(
            '--date-from',
            type=str,
            help='Start date (YYYY-MM-DD format)'
        )
        parser.add_argument(
            '--date-to',
            type=str,
            help='End date (YYYY-MM-DD format)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without actually updating'
        )

    def handle(self, *args, **options):
        # Get attendance settings
        settings = AttendanceSettings.objects.first()
        if not settings:
            self.stdout.write(self.style.ERROR('No AttendanceSettings found. Creating default settings...'))
            settings = AttendanceSettings.objects.create()
        
        if not settings.apply_time_based_absence:
            self.stdout.write(self.style.WARNING('Time-based absence is currently disabled in settings'))
            response = input('Do you want to continue anyway? (yes/no): ')
            if response.lower() != 'yes':
                return
        
        self.stdout.write(self.style.SUCCESS(f'Using time limits:'))
        self.stdout.write(f'  - In time limit: {settings.attendance_in_time_limit}')
        self.stdout.write(f'  - Out time limit: {settings.attendance_out_time_limit}')
        self.stdout.write('')

        # Build query filters
        filters = Q()
        
        # Filter by staff ID if provided
        if options['staff_id']:
            try:
                # Query through staff_profile relationship
                user = User.objects.get(staff_profile__staff_id=options['staff_id'])
                filters &= Q(user=user)
                self.stdout.write(f"Filtering for staff: {user.username} (ID: {options['staff_id']})")
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Staff with ID {options['staff_id']} not found"))
                return
        
        # Filter by date range if provided
        if options['date_from']:
            try:
                from_date = datetime.strptime(options['date_from'], '%Y-%m-%d').date()
                filters &= Q(date__gte=from_date)
                self.stdout.write(f"Filtering from date: {from_date}")
            except ValueError:
                self.stdout.write(self.style.ERROR('Invalid date-from format. Use YYYY-MM-DD'))
                return
        
        if options['date_to']:
            try:
                to_date = datetime.strptime(options['date_to'], '%Y-%m-%d').date()
                filters &= Q(date__lte=to_date)
                self.stdout.write(f"Filtering to date: {to_date}")
            except ValueError:
                self.stdout.write(self.style.ERROR('Invalid date-to format. Use YYYY-MM-DD'))
                return
        
        # Only check records currently marked as 'present' or 'partial'
        # (don't re-process already absent records)
        filters &= Q(status__in=['present', 'partial'])
        
        # Get attendance records
        records = AttendanceRecord.objects.filter(filters).select_related('user')
        total_records = records.count()
        
        self.stdout.write(f'\nFound {total_records} records to check\n')
        
        if total_records == 0:
            self.stdout.write(self.style.WARNING('No records found matching criteria'))
            return
        
        # Process records
        updated_count = 0
        details = []
        
        for record in records:
            should_be_absent = False
            reason = []
            
            # Check late arrival
            if record.morning_in and record.morning_in > settings.attendance_in_time_limit:
                should_be_absent = True
                reason.append(f"Late arrival: {record.morning_in} > {settings.attendance_in_time_limit}")
            
            # Check early departure
            if record.evening_out and record.evening_out < settings.attendance_out_time_limit:
                should_be_absent = True
                reason.append(f"Early departure: {record.evening_out} < {settings.attendance_out_time_limit}")
            
            if should_be_absent:
                updated_count += 1
                staff_id_display = 'N/A'
                try:
                    if hasattr(record.user, 'staff_profile') and record.user.staff_profile:
                        staff_id_display = record.user.staff_profile.staff_id
                except Exception:
                    pass
                
                detail = {
                    'staff_id': staff_id_display,
                    'username': record.user.username,
                    'date': record.date,
                    'old_status': record.status,
                    'morning_in': record.morning_in,
                    'evening_out': record.evening_out,
                    'reasons': reason
                }
                details.append(detail)
                
                # Update status if not dry-run
                if not options['dry_run']:
                    record.status = 'absent'
                    record.save(update_fields=['status'])
        
        # Report results
        self.stdout.write('\n' + '='*80)
        if options['dry_run']:
            self.stdout.write(self.style.WARNING(f'DRY RUN: Would update {updated_count} records'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Updated {updated_count} records to absent'))
        self.stdout.write('='*80 + '\n')
        
        # Show details
        if details:
            self.stdout.write(self.style.WARNING('Details of records updated:'))
            for detail in details:
                self.stdout.write(f"\n  Staff: {detail['username']} (ID: {detail['staff_id']})")
                self.stdout.write(f"  Date: {detail['date']}")
                self.stdout.write(f"  Status: {detail['old_status']} → absent")
                self.stdout.write(f"  Times: In={detail['morning_in']}, Out={detail['evening_out']}")
                self.stdout.write(f"  Reasons: {', '.join(detail['reasons'])}")
        
        self.stdout.write('')
        if options['dry_run']:
            self.stdout.write(self.style.WARNING('This was a DRY RUN - no records were actually updated'))
            self.stdout.write('Run without --dry-run to apply the changes')
