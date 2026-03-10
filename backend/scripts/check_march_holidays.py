import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_attendance.models import Holiday
from datetime import date

print("=== March 2026 Holidays ===\n")

holidays = Holiday.objects.filter(
    date__year=2026,
    date__month=3
).order_by('date')

print(f"Total holidays in March 2026: {holidays.count()}\n")

for holiday in holidays:
    print(f"Date: {holiday.date}")
    print(f"Name: {holiday.name}")
    print(f"Is Sunday: {holiday.is_sunday}")
    print(f"Is Removable: {holiday.is_removable}")
    print(f"Notes: {holiday.notes or 'N/A'}")
    print()
