"""Backfill StudentProfile.gender for 2023+ batches.

The 13th character of the registration number identifies the candidate:
``1`` = male, ``2`` = female. Only blank genders are populated; any gender
already recorded (for example from an import) is left untouched.
"""

import re

from django.db import migrations

GENDER_BY_13TH_DIGIT = {'1': 'MALE', '2': 'FEMALE'}
MIN_BATCH_YEAR = 2023


def _batch_year(batch):
    match = re.match(r'^\s*(\d{4}|\d{2})', str(batch or ''))
    if not match:
        return None
    year = int(match.group(1))
    return year + 2000 if year < 100 else year


def backfill_gender(apps, schema_editor):
    StudentProfile = apps.get_model('academics', 'StudentProfile')
    updates = []
    queryset = StudentProfile.objects.exclude(batch='').only('id', 'reg_no', 'batch', 'gender')
    for student in queryset.iterator(chunk_size=500):
        year = _batch_year(student.batch)
        if year is None or year < MIN_BATCH_YEAR:
            continue
        reg_no = str(student.reg_no or '').strip()
        if len(reg_no) < 13:
            continue
        inferred = GENDER_BY_13TH_DIGIT.get(reg_no[12])
        if not inferred or student.gender == inferred:
            continue
        if student.gender:
            # Never overwrite an existing value.
            continue
        student.gender = inferred
        updates.append(student)
    if updates:
        StudentProfile.objects.bulk_update(updates, ['gender'], batch_size=500)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0102_studentprofile_gender'),
    ]

    operations = [
        migrations.RunPython(backfill_gender, noop_reverse),
    ]
