#!/usr/bin/env python
"""
Debug script to inspect timetable swap entries for a specific section and date.
Usage: python manage.py shell < scripts/debug_swap.py
"""

import sys
import os
import django

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import TimetableAssignment, SpecialTimetable, SpecialTimetableEntry
from academics.models import Section
import datetime


def debug_swap(section_name, date_str):
    """Debug swap entries for a section on a specific date."""
    print(f"\n{'='*80}")
    print(f"DEBUGGING SWAP FOR: {section_name} on {date_str}")
    print(f"{'='*80}\n")
    
    try:
        section = Section.objects.get(name=section_name)
        print(f"✓ Found section: {section.name} (ID: {section.id})")
    except Section.DoesNotExist:
        print(f"✗ Section '{section_name}' not found!")
        return
    
    try:
        swap_date = datetime.date.fromisoformat(date_str)
        day_of_week = swap_date.isoweekday()  # 1=Mon, 7=Sun
        print(f"✓ Date: {swap_date} (Day of week: {day_of_week})")
    except Exception as e:
        print(f"✗ Invalid date format: {e}")
        return
    
    print(f"\n{'─'*80}")
    print("NORMAL TIMETABLE ASSIGNMENTS (for this section on this day):")
    print(f"{'─'*80}")
    
    assignments = TimetableAssignment.objects.filter(
        section=section, day=day_of_week
    ).select_related('period', 'staff', 'curriculum_row').order_by('period__index')
    
    if not assignments:
        print("  (No assignments found)")
    else:
        for a in assignments:
            period_label = f"Period {a.period.index}" if a.period else "?"
            if a.period and (a.period.is_break or a.period.is_lunch):
                period_label += " (BREAK/LUNCH)"
            subject = a.curriculum_row.course_code if a.curriculum_row else a.subject_text or "?"
            staff_name = f"{a.staff.user.first_name} {a.staff.user.last_name}" if a.staff and a.staff.user else "No staff"
            staff_id = a.staff.staff_id if a.staff else "—"
            print(f"  {period_label}: {subject:20} | Staff: {staff_name:25} ({staff_id})")
    
    print(f"\n{'─'*80}")
    print(f"SWAP ENTRIES (for date {swap_date}):")
    print(f"{'─'*80}")
    
    swap_name = f'[SWAP] {date_str}'
    special = SpecialTimetable.objects.filter(section=section, name=swap_name).first()
    
    if not special:
        print(f"  (No swap found with name: {swap_name})")
        return
    
    print(f"✓ Found SpecialTimetable: {special.name} (ID: {special.id}, Active: {special.is_active})")
    
    entries = SpecialTimetableEntry.objects.filter(
        timetable=special, date=swap_date, is_active=True
    ).select_related('period', 'staff', 'curriculum_row').order_by('period__index')
    
    if not entries:
        print("  (No active swap entries)")
    else:
        print(f"\n  Found {entries.count()} swap entries:")
        for e in entries:
            period_label = f"Period {e.period.index}" if e.period else "?"
            period_id = e.period.id if e.period else "?"
            new_subject = e.curriculum_row.course_code if e.curriculum_row else "?"
            orig_subject = e.subject_text or "—"
            staff_name = f"{e.staff.user.first_name} {e.staff.user.last_name}" if e.staff and e.staff.user else "No staff"
            staff_id = e.staff.staff_id if e.staff else "—"
            print(f"\n  {period_label} (PeriodID={period_id}):")
            print(f"    NEW Subject:      {new_subject}")
            print(f"    ORIGINAL Subject: {orig_subject}")
            print(f"    Assigned Staff:   {staff_name} ({staff_id})")
    
    print(f"\n{'─'*80}")
    print("EXPECTED BEHAVIOR:")
    print(f"{'─'*80}")
    print("Both staff members involved in the swap should see:")
    print("  1. Their original period updated with the swapped subject/staff")
    print("  2. The other period also showing with swapped subject/staff")
    print("\nIf only one staff sees the swap, the StaffTimetableView filter is the issue.")
    print(f"{'='*80}\n")


if __name__ == '__main__':
    # Example: debug swap for AI&DS 2023 A on Sunday (2026-02-23 is Sunday)
    # Adjust the date to match your test
    debug_swap('Artificial Intelligence & Data Science - 2023 / A', '2026-02-23')
