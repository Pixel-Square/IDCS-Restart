from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0033_remove_electivepoll_semester'),
    ]

    operations = [
        # Update class_type choices on CurriculumMaster
        migrations.AlterField(
            model_name='curriculummaster',
            name='class_type',
            field=models.CharField(
                choices=[
                    ('THEORY', 'Theory'),
                    ('THEORY_PMBL', 'Theory (PMBL)'),
                    ('LAB', 'Lab'),
                    ('PURE_LAB', 'Pure Lab'),
                    ('TCPL', 'Tcpl'),
                    ('TCPR', 'Tcpr'),
                    ('PRACTICAL', 'Practical'),
                    ('PRBL', 'PRBL'),
                    ('PROJECT', 'Project'),
                    ('AUDIT', 'Audit'),
                    ('SPECIAL', 'Special'),
                    ('ENGLISH', 'English'),
                    ('TAMIL', 'Tamil'),
                ],
                default='THEORY',
                max_length=16,
            ),
        ),
        # Update class_type choices on CurriculumDepartment
        migrations.AlterField(
            model_name='curriculumdepartment',
            name='class_type',
            field=models.CharField(
                choices=[
                    ('THEORY', 'Theory'),
                    ('THEORY_PMBL', 'Theory (PMBL)'),
                    ('LAB', 'Lab'),
                    ('PURE_LAB', 'Pure Lab'),
                    ('TCPL', 'Tcpl'),
                    ('TCPR', 'Tcpr'),
                    ('PRACTICAL', 'Practical'),
                    ('PRBL', 'PRBL'),
                    ('PROJECT', 'Project'),
                    ('AUDIT', 'Audit'),
                    ('SPECIAL', 'Special'),
                    ('ENGLISH', 'English'),
                    ('TAMIL', 'Tamil'),
                ],
                default='THEORY',
                max_length=16,
            ),
        ),
        # Update class_type choices on ElectiveSubject
        migrations.AlterField(
            model_name='electivesubject',
            name='class_type',
            field=models.CharField(
                choices=[
                    ('THEORY', 'Theory'),
                    ('THEORY_PMBL', 'Theory (PMBL)'),
                    ('LAB', 'Lab'),
                    ('PURE_LAB', 'Pure Lab'),
                    ('TCPL', 'Tcpl'),
                    ('TCPR', 'Tcpr'),
                    ('PRACTICAL', 'Practical'),
                    ('PRBL', 'PRBL'),
                    ('PROJECT', 'Project'),
                    ('AUDIT', 'Audit'),
                    ('SPECIAL', 'Special'),
                    ('ENGLISH', 'English'),
                    ('TAMIL', 'Tamil'),
                ],
                default='THEORY',
                max_length=16,
            ),
        ),
        # Seed TAM_THEORY QP type
        migrations.RunSQL(
            sql=[
                (
                    "INSERT INTO curriculum_questionpapertype (code, label, is_active, sort_order, created_at, updated_at) "
                    "VALUES (%s, %s, true, %s, NOW(), NOW()) ON CONFLICT (code) DO NOTHING",
                    ['TAM_THEORY', 'Tamil Theory', 10],
                ),
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
