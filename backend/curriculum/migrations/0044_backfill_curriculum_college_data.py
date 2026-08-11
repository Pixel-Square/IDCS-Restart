# Data migration: backfill curriculum model college_id values to the primary college.

from django.db import migrations


def _get_primary_college_id(apps):
    """Return the id of the first active College, creating one if none exist."""
    College = apps.get_model('college', 'College')
    college = College.objects.filter(is_active=True).order_by('id').first()
    if college is None:
        college = College.objects.create(
            code='PRIMARY',
            name='Primary College',
            short_name='PRIMARY',
            is_active=True,
        )
    return college.id


def backfill_curriculum_models(apps, schema_editor):
    college_id = _get_primary_college_id(apps)

    models_to_backfill = [
        'CurriculumMaster',
        'CurriculumDepartment',
        'ElectiveSubject',
        'DepartmentGroup',
        'ElectivePoll',
        'ElectivePollSubject',
    ]

    for model_name in models_to_backfill:
        Model = apps.get_model('curriculum', model_name)
        Model.objects.filter(college__isnull=True).update(college_id=college_id)


def reverse_backfill(apps, schema_editor):
    """Set college_id to NULL for all rows — no data loss."""
    models_to_reverse = [
        'CurriculumMaster',
        'CurriculumDepartment',
        'ElectiveSubject',
        'DepartmentGroup',
        'ElectivePoll',
        'ElectivePollSubject',
    ]
    for model_name in models_to_reverse:
        Model = apps.get_model('curriculum', model_name)
        Model.objects.all().update(college_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ('college', '0004_featurecatalog_permissions'),
        ('curriculum', '0043_add_college_to_remaining_curriculum_models'),
    ]

    operations = [
        migrations.RunPython(backfill_curriculum_models, reverse_backfill),
    ]
