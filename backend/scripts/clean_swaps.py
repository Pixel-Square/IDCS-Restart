import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from timetable.models import SpecialTimetable

swaps = SpecialTimetable.objects.filter(name__startswith='[SWAP]')
count = swaps.count()
print(f'Found {count} swap(s)')
swaps.delete()
print(f'✓ Deleted {count} swap(s)')
