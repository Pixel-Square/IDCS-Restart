from django.db import migrations, models


def ensure_comment_mode_column(apps, schema_editor):
    """Ensure feedback_forms.comment_mode exists and is non-null for all rows.

    Some deployments already have this legacy column (NOT NULL, no default).
    Other deployments may not. This migration adds the field to Django state
    and conditionally adds the DB column if missing.
    """

    table_name = 'feedback_forms'
    column_name = 'comment_mode'

    with schema_editor.connection.cursor() as cursor:
        existing_cols = {
            col.name for col in schema_editor.connection.introspection.get_table_description(cursor, table_name)
        }

    if column_name not in existing_cols:
        FeedbackForm = apps.get_model('feedback', 'FeedbackForm')
        field = FeedbackForm._meta.get_field('comment_mode')
        schema_editor.add_field(FeedbackForm, field)

    # Backfill any NULLs defensively.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            f"UPDATE {table_name} SET {column_name} = %s WHERE {column_name} IS NULL",
            ['question_wise'],
        )


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0019_common_comment_fields'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(ensure_comment_mode_column, reverse_code=migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='feedbackform',
                    name='comment_mode',
                    field=models.CharField(
                        choices=[('question_wise', 'Question-wise'), ('common', 'Common')],
                        default='question_wise',
                        help_text='Legacy field: how comments are collected. Kept for DB compatibility.',
                        max_length=20,
                    ),
                ),
            ],
        ),
    ]
