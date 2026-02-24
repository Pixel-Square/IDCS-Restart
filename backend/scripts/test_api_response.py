import os
import sys
import django
import datetime
import json

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.test import RequestFactory
from django.contrib.auth.models import User
from timetable.views import StaffTimetableView
from academics.models import StaffProfile

# Get staff
staff = StaffProfile.objects.filter(staff_id='3171007').first()
if not staff:
    print("Staff not found")
    sys.exit(1)

user = staff.user

# Create a mock request
factory = RequestFactory()
request = factory.get('/api/timetable/staff/?week_date=2026-03-01')
request.user = user

# Call the view
view = StaffTimetableView()
response = view.get(request)

print(f"=== API RESPONSE FOR STAFF {staff.staff_id} ===")
print(f"Status: {response.status_code}\n")

data = response.data
results = data.get('results', [])

print(f"Total days returned: {len(results)}\n")

# Find Sunday (day 7)
sunday_data = None
for day_data in results:
    if day_data.get('day') == 7:
        sunday_data = day_data
        break

if not sunday_data:
    print("❌ NO SUNDAY DATA FOUND")
    print("\nDays present:")
    for d in results:
        print(f"  Day {d.get('day')}: {len(d.get('assignments', []))} assignments")
else:
    print(f"✓ SUNDAY (Day 7) FOUND")
    assignments = sunday_data.get('assignments', [])
    print(f"Total assignments: {len(assignments)}\n")
    
    for i, a in enumerate(assignments, 1):
        period_id = a.get('period_id')
        is_special = a.get('is_special', False)
        is_swap = a.get('is_swap', False)
        subject = a.get('subject_text', '')
        curriculum = a.get('curriculum_row', {})
        
        print(f"{i}. Period {period_id}:")
        print(f"   is_special: {is_special}")
        print(f"   is_swap: {is_swap}")
        print(f"   subject_text: {subject}")
        print(f"   curriculum_row: {curriculum}")
        
        if is_special or is_swap:
            print(f"   🔥 SPECIAL/SWAP ENTRY")
        print()

# Test for the other staff too
print("\n" + "="*60)
staff2 = StaffProfile.objects.filter(staff_id='3171022').first()
if staff2:
    request2 = factory.get('/api/timetable/staff/?week_date=2026-03-01')
    request2.user = staff2.user
    response2 = view.get(request2)
    
    print(f"=== API RESPONSE FOR STAFF {staff2.staff_id} ===")
    data2 = response2.data
    results2 = data2.get('results', [])
    
    sunday_data2 = None
    for day_data in results2:
        if day_data.get('day') == 7:
            sunday_data2 = day_data
            break
    
    if sunday_data2:
        print(f"✓ SUNDAY (Day 7) FOUND")
        assignments2 = sunday_data2.get('assignments', [])
        print(f"Total assignments: {len(assignments2)}\n")
        
        for i, a in enumerate(assignments2, 1):
            period_id = a.get('period_id')
            is_special = a.get('is_special', False)
            is_swap = a.get('is_swap', False)
            subject = a.get('subject_text', '')
            
            print(f"{i}. Period {period_id}: {subject} (special={is_special}, swap={is_swap})")
