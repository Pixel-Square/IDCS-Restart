from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0014_backfill_feedbackquestion_question_type'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                # Ensure the column exists and has a safe default.
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE feedback_questions "
                        "ADD COLUMN IF NOT EXISTS comment_enabled boolean NOT NULL DEFAULT true;"
                    ),
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql=(
                        "UPDATE feedback_questions "
                        "SET comment_enabled = true "
                        "WHERE comment_enabled IS NULL;"
                    ),
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE feedback_questions "
                        "ALTER COLUMN comment_enabled SET DEFAULT true;"
                    ),
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='feedbackquestion',
                    name='comment_enabled',
                    field=models.BooleanField(
                        default=True,
                        help_text='Legacy field. Mirrors allow_comment.',
                    ),
                ),
            ],
        ),
    ]
