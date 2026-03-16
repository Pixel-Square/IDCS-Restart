"""
Diagnose attendance records - check FN/AN status issues
"""

import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_attendance.models import AttendanceRecord
from datetime import datetime


def main():
    print("=" * 70)
    print("Attendance Records Diagnostic")
    print("=" * 70)
    print()
    
    # Get a sample of recent records
    records = AttendanceRecord.objects.filter(
        date__gte='2026-01-01'
    ).select_related('user', 'user__staff_profile')[:10]
    
    print(f"Checking {records.count()} recent records:")
    print()
    
    for record in records:
        staff_id = getattr(record.user.staff_profile, 'staff_id', 'N/A') if hasattr(record.user, 'staff_profile') else 'N/A'
        
        print(f"Staff: {record.user.username} (ID: {staff_id})")
        print(f"  Date: {record.date}")
        print(f"  In: {record.morning_in}, Out: {record.evening_out}")
        print(f"  Overall Status: {record.status}")
        print(f"  FN Status: {record.fn_status}")
        print(f"  AN Status: {record.an_status}")
        
        # Check if fn_status or an_status are None/empty
        if not record.fn_status or not record.an_status:
            print(f"  ⚠️  FN or AN status is empty/None!")
        elif record.fn_status == 'absent' and record.an_status == 'absent':
            if record.morning_in and record.evening_out:
                print(f"  ⚠️  Both FN and AN are absent but has times!")
        
        print()
    
    # Count records needing fixes
    needs_fix = AttendanceRecord.objects.filter(
        date__gte='2026-01-01',
        morning_in__isnull=False,
        evening_out__isnull=False
    ).filter(
        fn_status='absent',
        an_status='absent'
    ).count()
    
    print("=" * 70)
    print(f"Records with both times but both FN/AN absent: {needs_fix}")
    
    if needs_fix > 0:
        print()
        print("To fix these records:")
        print("  python scripts/fix_fn_an_status.py")
    
    print("=" * 70)


if __name__ == '__main__':
    main()
