from django.core.management.base import BaseCommand
from timetable.models import TimetableAssignment, SpecialTimetable, SpecialTimetableEntry
from academics.models import Section
import datetime


class Command(BaseCommand):
    help = 'Debug timetable swap entries for a specific section and date'

    def add_arguments(self, parser):
        parser.add_argument('section', type=str, help='Section name or ID')
        parser.add_argument('date', type=str, help='Date in YYYY-MM-DD format')

    def handle(self, *args, **options):
        section_input = options['section']
        date_str = options['date']
        
        self.stdout.write(f"\n{'='*80}")
        self.stdout.write(f"DEBUGGING SWAP FOR: Section {section_input} on {date_str}")
        self.stdout.write(f"{'='*80}\n")
        
        try:
            # Try to get by ID first, then by name
            try:
                section_id = int(section_input)
                section = Section.objects.get(pk=section_id)
            except (ValueError, Section.DoesNotExist):
                section = Section.objects.get(name=section_input)
            
            self.stdout.write(self.style.SUCCESS(f"✓ Found section: {section} (ID: {section.id})"))
        except Section.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"✗ Section '{section_input}' not found!"))
            self.stdout.write("\nAvailable sections:")
            for sec in Section.objects.select_related('batch', 'batch__course').all()[:15]:
                self.stdout.write(f"  - ID {sec.id}: {sec}")
            return
        
        try:
            swap_date = datetime.date.fromisoformat(date_str)
            day_of_week = swap_date.isoweekday()  # 1=Mon, 7=Sun
            self.stdout.write(self.style.SUCCESS(f"✓ Date: {swap_date} (Day of week: {day_of_week})"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Invalid date format: {e}"))
            return
        
        self.stdout.write(f"\n{'─'*80}")
        self.stdout.write("NORMAL TIMETABLE ASSIGNMENTS (for this section on this day):")
        self.stdout.write(f"{'─'*80}")
        
        assignments = TimetableAssignment.objects.filter(
            section=section, day=day_of_week
        ).select_related('period', 'staff', 'curriculum_row').order_by('period__index')
        
        if not assignments:
            self.stdout.write("  (No assignments found)")
        else:
            for a in assignments:
                period_label = f"Period {a.period.index}" if a.period else "?"
                if a.period and (a.period.is_break or a.period.is_lunch):
                    period_label += " (BREAK/LUNCH)"
                    continue  # Skip breaks/lunch in output
                subject = a.curriculum_row.course_code if a.curriculum_row else a.subject_text or "?"
                staff_name = f"{a.staff.user.first_name} {a.staff.user.last_name}" if a.staff and a.staff.user else "No staff"
                staff_id = a.staff.staff_id if a.staff else "—"
                self.stdout.write(f"  {period_label:15} | Subject: {str(subject):20} | Staff: {str(staff_name):25} ({str(staff_id)})")
        
        self.stdout.write(f"\n{'─'*80}")
        self.stdout.write(f"SWAP ENTRIES (for date {swap_date}):")
        self.stdout.write(f"{'─'*80}")
        
        swap_name = f'[SWAP] {date_str}'
        special = SpecialTimetable.objects.filter(section=section, name=swap_name).first()
        
        if not special:
            self.stdout.write(self.style.WARNING(f"  (No swap found with name: {swap_name})"))
            return
        
        self.stdout.write(self.style.SUCCESS(f"✓ Found SpecialTimetable: {special.name} (ID: {special.id}, Active: {special.is_active})"))
        
        entries = SpecialTimetableEntry.objects.filter(
            timetable=special, date=swap_date, is_active=True
        ).select_related('period', 'staff', 'curriculum_row').order_by('period__index')
        
        if not entries:
            self.stdout.write(self.style.WARNING("  (No active swap entries)"))
        else:
            self.stdout.write(self.style.SUCCESS(f"\n  Found {entries.count()} swap entries:"))
            for e in entries:
                if e.period and (e.period.is_break or e.period.is_lunch):
                    continue  # Skip breaks
                period_label = f"Period {e.period.index}" if e.period else "?"
                period_id = e.period.id if e.period else "?"
                new_subject = e.curriculum_row.course_code if e.curriculum_row else "?"
                orig_subject = e.subject_text or "—"
                staff_name = f"{e.staff.user.first_name} {e.staff.user.last_name}" if e.staff and e.staff.user else "No staff"
                staff_id = e.staff.staff_id if e.staff else "—"
                self.stdout.write(f"\n  {period_label} (PeriodID={period_id}):")
                self.stdout.write(f"    NEW Subject:      {new_subject}")
                self.stdout.write(f"    ORIGINAL Subject: {orig_subject}")
                self.stdout.write(f"    Assigned Staff:   {staff_name} ({staff_id})")
        
        self.stdout.write(f"\n{'─'*80}")
        self.stdout.write("EXPECTED BEHAVIOR:")
        self.stdout.write(f"{'─'*80}")
        self.stdout.write("Both staff members involved in the swap should see:")
        self.stdout.write("  1. Their original period updated with the swapped subject/staff")
        self.stdout.write("  2. The other period also showing with swapped subject/staff")
        self.stdout.write("\nIf only one staff sees the swap, the StaffTimetableView filter is the issue.")
        self.stdout.write(f"{'='*80}\n")
