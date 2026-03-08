#!/usr/bin/env python
"""
Check absences for user in March
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from datetime import date
from staff_attendance.models import AttendanceRecord
from accounts.models import User

username = "Ganga Naidu K"
user = User.objects.get(username=username)

print(f"\n=== Attendance Absences for {username} ===\n")

current_year = 2026
current_month = 3

absences = AttendanceRecord.objects.filter(
    user=user,
    date__year=current_year,
    date__month=current_month,
    status='absent'
)

print(f"Total absences in March 2026: {absences.count()}\n")

for rec in absences:
    print(f"  {rec.date}: {rec.status} - {rec.notes or 'No notes'}")

print(f"\n=== Current Leave Balance ===")
print(f"Allotment: 2")
print(f"Approved Leave Requests: 0")
print(f"Remaining Balance: 2")

print(f"\n=== Incorrect LOP Calculation (Current Code) ===")
absence_count = absences.count()
current_balance = 2  # allotment - approved_requests
if absence_count > current_balance:
    uncovered = absence_count - current_balance
    print(f"Absences ({absence_count}) > Balance ({current_balance})")
    print(f"LOP = {uncovered} ❌ INCORRECT!")
    print(f"\nWhy incorrect: Absences don't automatically consume leave balance.")
    print(f"LOP should only accumulate when APPROVED leave requests exceed allotment.")
else:
    print(f"Absences ({absence_count}) <= Balance ({current_balance})")
    print(f"LOP = 0")

print(f"\n=== Correct LOP Calculation ===")
print(f"LOP should be: max(0, approved_leave_requests - allotment)")
print(f"LOP = max(0, 0 - 2) = 0 ✓ CORRECT")
print()
