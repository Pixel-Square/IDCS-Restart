from django.db import migrations


class Migration(migrations.Migration):
    """Ensure the drifted ``academics_batchyear.is_graduated`` column has a
    database default.

    Some deployments have this column (and graduation metadata) but the model
    no longer declares it, leaving it NOT NULL without a default. Creating a
    new ``BatchYear`` through Django then fails with an IntegrityError. The
    ``ADD COLUMN IF NOT EXISTS`` keeps fresh databases and existing databases
    working with the same migration.
    """

    dependencies = [
        ('academics', '0104_studentprofile_address_line4_studentprofile_degree_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                'ALTER TABLE academics_batchyear ADD COLUMN IF NOT EXISTS is_graduated boolean NOT NULL DEFAULT false;',
                'ALTER TABLE academics_batchyear ALTER COLUMN is_graduated SET DEFAULT false;',
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
