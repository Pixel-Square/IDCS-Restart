"""
Check a specific record with In:08:17 and Out:17:37
"""
import os, sys, django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from staff_attendance.models import AttendanceRecord
from datetime import time

# Find record with these times
records = AttendanceRecord.objects.filter(
    morning_in=time(8, 17),
    evening_out=time(17, 37)
).select_related('user', 'user__staff_profile')

if records.exists():
    for r in records[:3]:
        staff_id = getattr(r.user.staff_profile, 'staff_id', 'N/A') if hasattr(r.user, 'staff_profile') else 'N/A'
        print(f"Staff: {r.user.username} (ID: {staff_id})")
        print(f"Date: {r.date}")
        print(f"In: {r.morning_in}, Out: {r.evening_out}")
        print(f"FN Status: {r.fn_status}")
        print(f"AN Status: {r.an_status}")
        print(f"Overall Status: {r.status}")
        print(f"✅ FIXED!" if r.fn_status == 'present' and r.an_status == 'present' else "❌ Still incorrect")
        print()
else:
    print("No records found with In:08:17 and Out:17:37")
    print("\nShowing recent records with times:")
    recent = AttendanceRecord.objects.filter(
        morning_in__isnull=False,
        evening_out__isnull=False
    ).order_by('-date')[:3]
    for r in recent:
        print(f"  {r.date}: In:{r.morning_in} Out:{r.evening_out} -> FN:{r.fn_status} AN:{r.an_status}")
