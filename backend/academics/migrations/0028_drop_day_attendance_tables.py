from django.db import migrations


class Migration(migrations.Migration):
    """Drop legacy day attendance tables if they exist.

    This migration uses raw SQL with IF EXISTS to be safe across environments
    where the tables may already have been removed or never created.
    """

    dependencies = [
        ('academics', '0027_studentsubjectbatch_curriculum_row'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            -- SQLite does not support CASCADE on DROP TABLE; use IF EXISTS only.
            DROP TABLE IF EXISTS academics_dayattendancerecord;
            DROP TABLE IF EXISTS academics_dayattendancesession;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
