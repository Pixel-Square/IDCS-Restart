# Generated 2026-04-24 – Foreign Language class-type + FLC_QP question-paper type

from django.db import migrations, models

FULL_CHOICES = [
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
    ('FOREIGN_LANG', 'Foreign Language'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0028_add_elective1_qp_type'),
    ]

    operations = [
        # ── 1. Extend class_type choices on all three models ──────────────────
        migrations.AlterField(
            model_name='curriculumdepartment',
            name='class_type',
            field=models.CharField(
                choices=FULL_CHOICES,
                default='THEORY',
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='curriculummaster',
            name='class_type',
            field=models.CharField(
                choices=FULL_CHOICES,
                default='THEORY',
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='electivesubject',
            name='class_type',
            field=models.CharField(
                choices=FULL_CHOICES,
                default='THEORY',
                max_length=16,
            ),
        ),

        # ── 2. Seed FLC_QP question-paper type ───────────────────────────────
        migrations.RunSQL(
            sql=[
                (
                    "INSERT INTO curriculum_questionpapertype "
                    "(code, label, is_active, sort_order, created_at, updated_at) "
                    "VALUES (%s, %s, true, %s, NOW(), NOW()) "
                    "ON CONFLICT (code) DO NOTHING",
                    ['FLC_QP', 'Foreign Language Course QP', 5],
                ),
            ],
            reverse_sql=[
                ("DELETE FROM curriculum_questionpapertype WHERE code = 'FLC_QP'", []),
            ],
        ),
    ]
