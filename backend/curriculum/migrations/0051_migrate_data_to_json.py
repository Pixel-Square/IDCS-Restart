from django.db import migrations

def migrate_to_json(apps, schema_editor):
    CurriculumMaster = apps.get_model('curriculum', 'CurriculumMaster')
    CurriculumDepartment = apps.get_model('curriculum', 'CurriculumDepartment')

    master_fields = [
        'course_name', 'category', 'class_type', 'is_elective',
        'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
        'qp_type', 'is_dept_core'
    ]

    dept_fields = [
        'course_name', 'category', 'class_type', 'is_elective',
        'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
        'total_hours', 'mnemonic', 'question_paper_type'
    ]

    for master in CurriculumMaster.objects.all():
        if not master.dynamic_data:
            master.dynamic_data = {}
        for f in master_fields:
            val = getattr(master, f, None)
            if val is not None:
                master.dynamic_data[f] = val
        master.save(update_fields=['dynamic_data'])

    for dept in CurriculumDepartment.objects.all():
        if not dept.dynamic_data:
            dept.dynamic_data = {}
        for f in dept_fields:
            val = getattr(dept, f, None)
            if val is not None:
                dept.dynamic_data[f] = val
        dept.save(update_fields=['dynamic_data'])


def reverse_migrate(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0050_fieldschema_hidden_depts'),
    ]

    operations = [
        migrations.RunPython(migrate_to_json, reverse_migrate),
    ]
