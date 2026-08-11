# Harden: make college FKs non-nullable on all curriculum models.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('college', '0004_featurecatalog_permissions'),
        ('curriculum', '0044_backfill_curriculum_college_data'),
    ]

    operations = [
        migrations.AlterField(
            model_name='curriculummaster',
            name='college',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='master_curricula',
                to='college.college',
            ),
        ),
        migrations.AlterField(
            model_name='curriculumdepartment',
            name='college',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='department_curricula',
                to='college.college',
            ),
        ),
        migrations.AlterField(
            model_name='electivesubject',
            name='college',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='elective_subjects',
                to='college.college',
            ),
        ),
        migrations.AlterField(
            model_name='departmentgroup',
            name='college',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='department_groups',
                to='college.college',
            ),
        ),
        migrations.AlterField(
            model_name='electivepoll',
            name='college',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='elective_polls',
                to='college.college',
            ),
        ),
        migrations.AlterField(
            model_name='electivepollsubject',
            name='college',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='elective_poll_subjects',
                to='college.college',
            ),
        ),
    ]
