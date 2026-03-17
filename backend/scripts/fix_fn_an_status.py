"""
Fix FN/AN status for all attendance records
This recalculates fn_status and an_status based on time limits
"""

import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_attendance.models import AttendanceRecord, AttendanceSettings
from django.db.models import Q


def main():
    print("=" * 70)
    print("Fix FN/AN Status for All Attendance Records")
    print("=" * 70)
    print()
    
    # Get settings
    settings = AttendanceSettings.objects.first()
    if not settings:
        print("❌ No AttendanceSettings found!")
        return
    
    print("Using time limits:")
    print(f"  In time limit: {settings.attendance_in_time_limit}")
    print(f"  Mid time split: {settings.mid_time_split}")
    print(f"  Out time limit: {settings.attendance_out_time_limit}")
    print()
    
    # Get all records (not just present/partial)
    records = AttendanceRecord.objects.all().select_related('user')
    total = records.count()
    
    print(f"Processing {total} records...")
    print()
    
    updated_count = 0
    batch_size = 1000
    batch = []
    
    for i, record in enumerate(records.iterator(), 1):
        old_fn = record.fn_status
        old_an = record.an_status
        old_status = record.status
        
        # Recalculate using update_status()
        record.update_status()
        
        # Check if anything changed
        if (record.fn_status != old_fn or 
            record.an_status != old_an or 
            record.status != old_status):
            batch.append(record)
            updated_count += 1
        
        # Save in batches
        if len(batch) >= batch_size:
            AttendanceRecord.objects.bulk_update(
                batch,
                ['status', 'fn_status', 'an_status']
            )
            print(f"  Processed {i}/{total} records... (Updated: {updated_count})")
            batch = []
    
    # Save remaining batch
    if batch:
        AttendanceRecord.objects.bulk_update(
            batch,
            ['status', 'fn_status', 'an_status']
        )
    
    print()
    print("=" * 70)
    print(f"✅ Complete! Updated {updated_count} records out of {total} total")
    print("=" * 70)
    print()
    
    # Show sample after fix
    print("Sample of fixed records:")
    fixed_records = AttendanceRecord.objects.filter(
        morning_in__isnull=False,
        evening_out__isnull=False
    ).select_related('user', 'user__staff_profile')[:5]
    
    for record in fixed_records:
        staff_id = getattr(record.user.staff_profile, 'staff_id', 'N/A') if hasattr(record.user, 'staff_profile') else 'N/A'
        print(f"  {record.user.username} ({staff_id}) - {record.date}")
        print(f"    In: {record.morning_in}, Out: {record.evening_out}")
        print(f"    FN: {record.fn_status}, AN: {record.an_status}, Overall: {record.status}")
        print()


if __name__ == '__main__':
    main()
