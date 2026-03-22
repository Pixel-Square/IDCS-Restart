#!/usr/bin/env python
"""
Diagnostic script to check Staff Salary data setup
Run with: python manage.py shell < check_salary_data.py
"""

from academics.models import Department, StaffProfile
from django.contrib.auth import get_user_model

User = get_user_model()

print("\n" + "="*60)
print("STAFF SALARY DATA DIAGNOSTIC")
print("="*60)

# Check departments
dept_count = Department.objects.count()
print(f"\n✓ Total Departments: {dept_count}")
if dept_count > 0:
    depts = Department.objects.all()[:5]
    for d in depts:
        print(f"  - {d.id}: {d.name}")
    if dept_count > 5:
        print(f"  ... and {dept_count - 5} more")
else:
    print("  ⚠ No departments found! Create departments first.")

# Check staff profiles
active_staff = User.objects.filter(is_active=True, staff_profile__isnull=False)
staff_count = active_staff.count()
print(f"\n✓ Total Active Staff with Profiles: {staff_count}")
if staff_count > 0:
    for staff in active_staff[:5]:
        profile = staff.staff_profile
        dept = profile.department
        print(f"  - {profile.staff_id}: {staff.get_full_name()} ({dept.name if dept else 'No Dept'})")
    if staff_count > 5:
        print(f"  ... and {staff_count - 5} more")
else:
    print("  ⚠ No active staff profiles found!")
    print("    Check that:")
    print("    1. Users exist and are_active=True")
    print("    2. StaffProfile records exist for those users")

# Check salary declarations
from staff_salary.models import StaffSalaryDeclaration
decl_count = StaffSalaryDeclaration.objects.count()
print(f"\n✓ Total Salary Declarations: {decl_count}")

# Check PF Config
from staff_salary.models import SalaryPFConfig
try:
    pf_config = SalaryPFConfig.objects.get(id=1)
    print(f"\n✓ PF Config Found:")
    print(f"  - Type 1 Departments: {pf_config.type1_department_ids}")
    print(f"  - Type 2 Departments: {pf_config.type2_department_ids}")
except SalaryPFConfig.DoesNotExist:
    print(f"\n✓ PF Config: Not created yet (will be created on first access)")

print("\n" + "="*60)
print("\nNOTE: If departments or staff are missing:")
print("1. Verify departments exist in academics.Department")
print("2. Verify staff users have StaffProfile records")
print("3. Then refresh the Staff Salary page")
print("="*60 + "\n")
