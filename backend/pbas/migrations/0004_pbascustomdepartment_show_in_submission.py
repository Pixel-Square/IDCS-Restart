from django.db import migrations, models


def mark_existing_with_nodes_visible(apps, schema_editor):
    PBASCustomDepartment = apps.get_model('pbas', 'PBASCustomDepartment')
    PBASNode = apps.get_model('pbas', 'PBASNode')

    dept_ids = PBASNode.objects.values_list('department_id', flat=True).distinct()
    PBASCustomDepartment.objects.filter(id__in=dept_ids).update(show_in_submission=True)


class Migration(migrations.Migration):

    dependencies = [
        ('pbas', '0003_pbasverificationticket'),
    ]

    operations = [
        migrations.AddField(
            model_name='pbascustomdepartment',
            name='show_in_submission',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_existing_with_nodes_visible, migrations.RunPython.noop),
    ]
