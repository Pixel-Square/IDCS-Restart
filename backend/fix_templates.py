#!/usr/bin/env python3
"""
Fix script: Reset migrations and recreate all 10 default templates
"""
import os
import django
import subprocess
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'college.settings')
django.setup()

# Now import after Django setup
from staff_requests.models import RequestTemplate, ApprovalStep

print("=" * 60)
print("FIXING: Deleting old templates and re-running migration...")
print("=" * 60)

# Step 1: Delete old templates
print("\n[1/3] Deleting old templates...")
count = RequestTemplate.objects.count()
RequestTemplate.objects.all().delete()
print(f"  ✓ Deleted {count} old templates")

# Step 2: Migrate back to 0010 (fake the 0011 state)
print("\n[2/3] Resetting migration to 0010...")
try:
    subprocess.run(
        ['python3', 'manage.py', 'migrate', 'staff_requests', '0010', '--fake'],
        check=True,
        cwd='/home/iqac/IDCS-Restart/backend'
    )
    print("  ✓ Faked migration to 0010")
except subprocess.CalledProcessError as e:
    print(f"  ⚠ Warning: {e}")

# Step 3: Re-run the migration to create all 10 templates
print("\n[3/3] Running migration 0011 to create all 10 templates...")
try:
    subprocess.run(
        ['python3', 'manage.py', 'migrate', 'staff_requests', '0011'],
        check=True,
        cwd='/home/iqac/IDCS-Restart/backend'
    )
    print("  ✓ Migration 0011 completed")
except subprocess.CalledProcessError as e:
    print(f"  ✗ Migration failed: {e}")
    sys.exit(1)

# Verify
print("\n[VERIFY] Checking templates created...")
templates = RequestTemplate.objects.all()
print(f"  Total templates: {templates.count()}")
for t in templates:
    status = "✓" if t.is_active else "○"
    print(f"    {status} {t.name}")

if templates.count() == 10:
    print("\n✓ SUCCESS: All 10 templates created!")
else:
    print(f"\n⚠ WARNING: Expected 10 templates, found {templates.count()}")
    sys.exit(1)

print("=" * 60)
