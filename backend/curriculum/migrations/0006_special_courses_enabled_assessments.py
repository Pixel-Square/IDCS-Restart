from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0005_alter_curriculumdepartment_semester_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='curriculummaster',
            name='enabled_assessments',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='curriculumdepartment',
            name='enabled_assessments',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name='curriculummaster',
            name='class_type',
            field=models.CharField(
                choices=[
                    ('THEORY', 'Theory'),
                    ('LAB', 'Lab'),
                    ('TCPL', 'Tcpl'),
                    ('TCPR', 'Tcpr'),
                    ('PRACTICAL', 'Practical'),
                    ('AUDIT', 'Audit'),
                    ('SPECIAL', 'Special'),
                ],
                default='THEORY',
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='curriculumdepartment',
            name='class_type',
            field=models.CharField(
                choices=[
                    ('THEORY', 'Theory'),
                    ('LAB', 'Lab'),
                    ('TCPL', 'Tcpl'),
                    ('TCPR', 'Tcpr'),
                    ('PRACTICAL', 'Practical'),
                    ('AUDIT', 'Audit'),
                    ('SPECIAL', 'Special'),
                ],
                default='THEORY',
                max_length=16,
            ),
        ),
    ]
