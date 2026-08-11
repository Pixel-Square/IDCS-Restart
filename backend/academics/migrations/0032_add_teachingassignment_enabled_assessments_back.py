from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Re-adds the `enabled_assessments` column to TeachingAssignment.

    Uses RunSQL with IF NOT EXISTS so the migration is idempotent and does
    not fail when the column already exists (e.g. in the test database that
    was not fully reset between branch merges).
    """

    dependencies = [
        ('academics', '0031_remove_teachingassignment_enabled_assessments_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE academics_teachingassignment
                ADD COLUMN IF NOT EXISTS enabled_assessments jsonb NOT NULL DEFAULT '[]'::jsonb;
            """,
            reverse_sql="""
                ALTER TABLE academics_teachingassignment
                DROP COLUMN IF EXISTS enabled_assessments;
            """,
            # Tell Django's state machine the same as the original AddField
            state_operations=[
                migrations.AddField(
                    model_name='teachingassignment',
                    name='enabled_assessments',
                    field=models.JSONField(blank=True, default=list),
                ),
            ],
        ),
    ]
