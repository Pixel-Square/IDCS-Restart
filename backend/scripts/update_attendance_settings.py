"""
Update attendance settings to correct values
"""

import os
import sys
import django
from datetime import time

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_attendance.models import AttendanceSettings


def main():
    print("=" * 70)
    print("Update Attendance Settings")
    print("=" * 70)
    print()
    
    settings = AttendanceSettings.objects.first()
    
    if not settings:
        print("❌ No AttendanceSettings found in database!")
        print("   Creating new settings with defaults...")
        settings = AttendanceSettings.objects.create()
    
    print("Current settings:")
    print(f"  In Time Limit:  {settings.attendance_in_time_limit}")
    print(f"  Mid Time Split: {settings.mid_time_split}")
    print(f"  Out Time Limit: {settings.attendance_out_time_limit}")
    print()
    
    # Ask for confirmation
    print("Recommended values:")
    print("  In Time Limit:  08:45:00 (Forenoon cutoff)")
    print("  Mid Time Split: 13:00:00 (1:00 PM - separates FN/AN)")
    print("  Out Time Limit: 17:00:00 (5:00 PM - Afternoon cutoff)")
    print()
    
    response = input("Update to recommended values? (yes/no): ").lower().strip()
    
    if response == 'yes' or response == 'y':
        settings.attendance_in_time_limit = time(8, 45)
        settings.mid_time_split = time(13, 0)
        settings.attendance_out_time_limit = time(17, 0)
        settings.apply_time_based_absence = True
        settings.save()
        
        print()
        print("✅ Settings updated successfully!")
        print()
        print("New settings:")
        print(f"  In Time Limit:  {settings.attendance_in_time_limit}")
        print(f"  Mid Time Split: {settings.mid_time_split}")
        print(f"  Out Time Limit: {settings.attendance_out_time_limit}")
        print()
        print("Now, re-process existing attendance records:")
        print("  python manage.py apply_time_based_absence --dry-run")
        print("  python manage.py apply_time_based_absence")
        print()
    else:
        print()
        print("ℹ No changes made.")
        print()
        print("To manually update:")
        print("1. Go to Django Admin → Attendance Settings")
        print("2. Set the values as needed")
        print("3. Run: python manage.py apply_time_based_absence")
    
    print("=" * 70)


if __name__ == '__main__':
    main()
