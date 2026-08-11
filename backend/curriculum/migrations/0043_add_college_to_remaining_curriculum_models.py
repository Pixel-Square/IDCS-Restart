# Generated manual migration: add college FK to curriculum models

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('college', '0004_featurecatalog_permissions'),
        ('academics', '0095_remove_department_academics_department_college_code_uniq_and_more'),
        ('curriculum', '0042_remove_regulation_curriculum_regulation_college_code_uniq_and_more'),
    ]

    operations = [
        # ── CurriculumMaster ──────────────────────────────────────────────
        migrations.AddField(
            model_name='curriculummaster',
            name='college',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='master_curricula',
                to='college.college',
            ),
        ),
        # ── CurriculumDepartment ──────────────────────────────────────────
        migrations.AddField(
            model_name='curriculumdepartment',
            name='college',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='department_curricula',
                to='college.college',
            ),
        ),
        # ── ElectiveSubject ───────────────────────────────────────────────
        migrations.AddField(
            model_name='electivesubject',
            name='college',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='elective_subjects',
                to='college.college',
            ),
        ),
        # ── DepartmentGroup: drop unique on code, add college + unique_together ──
        migrations.AlterField(
            model_name='departmentgroup',
            name='code',
            field=models.CharField(max_length=32),
        ),
        migrations.AddField(
            model_name='departmentgroup',
            name='college',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='department_groups',
                to='college.college',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='departmentgroup',
            unique_together={('college', 'code')},
        ),
        # ── ElectivePoll ──────────────────────────────────────────────────
        migrations.AddField(
            model_name='electivepoll',
            name='college',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='elective_polls',
                to='college.college',
            ),
        ),
        # ── ElectivePollSubject ───────────────────────────────────────────
        migrations.AddField(
            model_name='electivepollsubject',
            name='college',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='elective_poll_subjects',
                to='college.college',
            ),
        ),
    ]
