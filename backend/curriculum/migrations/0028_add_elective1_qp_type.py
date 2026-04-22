from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0027_add_english_class_type'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                (
                    "INSERT INTO curriculum_questionpapertype (code, label, is_active, sort_order, created_at, updated_at) "
                    "VALUES (%s, %s, true, %s, NOW(), NOW()) ON CONFLICT (code) DO NOTHING",
                    ['ELECTIVE1', 'Elective 1', 4],
                ),
            ],
            reverse_sql=[
                ("DELETE FROM curriculum_questionpapertype WHERE code = 'ELECTIVE1'", []),
            ],
        ),
    ]
