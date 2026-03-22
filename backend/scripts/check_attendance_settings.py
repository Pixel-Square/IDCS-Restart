"""
Check and display current attendance settings
"""

import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_attendance.models import AttendanceSettings


def main():
    print("=" * 70)
    print("Current Attendance Settings")
    print("=" * 70)
    print()
    
    settings = AttendanceSettings.objects.first()
    
    if not settings:
        print("❌ No AttendanceSettings found in database!")
        print()
        print("Creating default settings...")
        settings = AttendanceSettings.objects.create()
        print("✓ Created with defaults")
    
    print(f"In Time Limit:    {settings.attendance_in_time_limit}")
    print(f"Mid Time Split:   {settings.mid_time_split}")
    print(f"Out Time Limit:   {settings.attendance_out_time_limit}")
    print(f"Time-based check: {settings.apply_time_based_absence}")
    print()
    print("=" * 70)
    print()
    print("Explanation:")
    print("- If IN time > In Time Limit → FN = absent")
    print("- If IN time > Mid Time Split → AN = absent")
    print("- If OUT time < Out Time Limit → AN = absent")
    print()
    print("Example with current settings:")
    print(f"  In: 08:17, Out: 17:37")
    print(f"  → FN: {'present' if '08:17' <= str(settings.attendance_in_time_limit)[:5] else 'absent'} (08:17 <= {str(settings.attendance_in_time_limit)[:5]})")
    
    # Parse times for comparison
    from datetime import time
    test_out = time(17, 37)
    out_limit = settings.attendance_out_time_limit
    
    print(f"  → AN: {'absent' if test_out < out_limit else 'present'} (17:37 {'<' if test_out < out_limit else '>='} {str(out_limit)[:5]})")
    print()
    
    if test_out < out_limit:
        print("⚠️  ISSUE FOUND!")
        print(f"   Out time 17:37 is BEFORE the limit {out_limit}")
        print(f"   This causes AN to be marked absent!")
        print()
        print("   Solution: Update Out Time Limit to 17:00 (5:00 PM)")
        print()
        print("   Run: python scripts/update_attendance_settings.py")
    
    print("=" * 70)


if __name__ == '__main__':
    main()
