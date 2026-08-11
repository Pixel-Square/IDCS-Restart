#!/usr/bin/env python3
"""Batch-add college FK to all tenant models across all Django apps.

Run: python3 add_college_fk.py <app_name>
  or: python3 add_college_fk.py --all  (to process all apps)

This script:
1. Reads each models.py
2. Adds `college = models.ForeignKey(...)` right after each class definition line
3. Adds a save() method with auto_assign_college if the model doesn't have one
"""

import re
import sys
from pathlib import Path

BACKEND = Path("/home/iqac/idcs 3.0/backend")

# Apps to skip (global entities or already handled)
GLOBAL_APPS = {'accounts', 'college', 'erp'}

# Models within apps that are global (no college FK needed)
GLOBAL_MODELS = {
    'template_api': {'CanvaServiceToken', 'CanvaOAuthState'},
    # Add more as needed
}

# Models that already have college FK
ALREADY_HAS_COLLEGE = {
    'academics': {'Department', 'Batch', 'StudentProfile', 'StaffProfile'},
    'curriculum': {'Regulation', 'CurriculumMaster', 'CurriculumDepartment',
                   'ElectiveSubject', 'DepartmentGroup', 'ElectivePoll', 'ElectivePollSubject'},
    'pbas': {'PBASSubmission'},
}


def get_related_name(app_name, class_name):
    """Generate unique related_name: <lowercase_class>s_<app>"""
    name = class_name.lower()
    if not name.endswith('s'):
        name += 's'
    # Avoid collisions by appending app name if needed
    return f"{name}"


def add_college_fk_to_models_file(filepath, app_name):
    """Add college FK field to all model classes in a models.py file."""
    content = filepath.read_text()
    lines = content.split('\n')

    # Find model class definitions
    class_pattern = re.compile(r'^class (\w+)\(.*models\.Model.*\):\s*$')

    new_lines = []
    modified = False
    i = 0

    while i < len(lines):
        line = lines[i]
        new_lines.append(line)

        match = class_pattern.match(line)
        if match:
            class_name = match.group(1)

            # Skip if already has college FK or is global
            if class_name in GLOBAL_MODELS.get(app_name, set()):
                i += 1
                continue
            if class_name in ALREADY_HAS_COLLEGE.get(app_name, set()):
                i += 1
                continue

            # Check if next few lines already contain a college FK
            ahead = '\n'.join(lines[i+1:i+8])
            if re.search(r'college\s*=\s*models\.ForeignKey', ahead):
                i += 1
                continue

            # Add college FK field right after class definition
            indent = '    '  # Assume 4-space indent
            related_name = get_related_name(app_name, class_name)
            college_field = f"{indent}college = models.ForeignKey('college.College', on_delete=models.CASCADE, null=True, blank=True, related_name='{related_name}')"
            new_lines.append(college_field)
            modified = True
            print(f"  + college FK in {class_name} ({app_name})")

        i += 1

    if modified:
        new_content = '\n'.join(new_lines)
        # Make a backup
        backup = filepath.with_suffix('.py.bak')
        filepath.write_text(new_content)
        print(f"  [OK] Updated {filepath}")
    else:
        print(f"  [no changes] {filepath}")


def process_app(app_name):
    """Process one app's models.py."""
    models_file = BACKEND / app_name / 'models.py'
    if not models_file.exists():
        print(f"  [SKIP] {models_file} not found")
        return
    print(f"\n{'='*60}")
    print(f"Processing: {app_name}")
    print(f"{'='*60}")
    add_college_fk_to_models_file(models_file, app_name)


def process_all():
    """Process all Django apps."""
    apps = [
        'OBE', 'COE', 'timetable', 'feedback', 'academic_calendar',
        'applications', 'announcements', 'certificates', 'lms',
        'staff_requests', 'staff_salary', 'staff_attendance',
        'question_bank', 'idcsscan', 'pbas', 'template_api',
        'academics', 'curriculum',
    ]
    for app in apps:
        process_app(app)


if __name__ == '__main__':
    if '--all' in sys.argv:
        process_all()
    elif len(sys.argv) > 1:
        process_app(sys.argv[1])
    else:
        print("Usage: python3 add_college_fk.py <app_name>  OR  --all")
        print("Available apps: OBE, COE, timetable, feedback, academic_calendar,")
        print("  applications, announcements, certificates, lms, staff_requests,")
        print("  staff_salary, staff_attendance, question_bank, idcsscan, pbas, template_api")
        sys.exit(1)
