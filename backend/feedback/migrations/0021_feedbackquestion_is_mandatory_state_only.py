from django.db import migrations, models


def ensure_is_mandatory_column(apps, schema_editor):
    """Ensure feedback_questions.is_mandatory exists and is safe for inserts.

    Some deployments already have this legacy column as NOT NULL with no DB default.
    This migration aligns Django state with the DB and prevents future NULL insert failures.
    """

    FeedbackQuestion = apps.get_model('feedback', 'FeedbackQuestion')
    table_name = FeedbackQuestion._meta.db_table
    column_name = 'is_mandatory'
    table_name_quoted = schema_editor.quote_name(table_name)
    column_name_quoted = schema_editor.quote_name(column_name)

    with schema_editor.connection.cursor() as cursor:
        existing_cols = {
            col.name
            for col in schema_editor.connection.introspection.get_table_description(cursor, table_name)
        }
    if column_name not in existing_cols:
        vendor = schema_editor.connection.vendor
        if vendor == 'postgresql':
            schema_editor.execute(
                f"ALTER TABLE {table_name_quoted} ADD COLUMN {column_name_quoted} boolean NOT NULL DEFAULT false"
            )
        elif vendor == 'sqlite':
            schema_editor.execute(
                f"ALTER TABLE {table_name_quoted} ADD COLUMN {column_name_quoted} bool NOT NULL DEFAULT 0"
            )
        else:
            schema_editor.execute(
                f"ALTER TABLE {table_name_quoted} ADD COLUMN {column_name_quoted} boolean NOT NULL DEFAULT 0"
            )

    # Backfill any NULLs defensively.
    vendor = schema_editor.connection.vendor
    false_literal = 'false' if vendor == 'postgresql' else '0'
    schema_editor.execute(
        f"UPDATE {table_name_quoted} SET {column_name_quoted} = {false_literal} WHERE {column_name_quoted} IS NULL"
    )

    # Set a DB-level default where supported (Postgres) so even older code won't insert NULL.
    if schema_editor.connection.vendor == 'postgresql':
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                f"ALTER TABLE {table_name_quoted} ALTER COLUMN {column_name_quoted} SET DEFAULT false"
            )


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0020_feedbackform_comment_mode_state_only'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(ensure_is_mandatory_column, reverse_code=migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='feedbackquestion',
                    name='is_mandatory',
                    field=models.BooleanField(
                        default=False,
                        help_text='Legacy field. Whether this question is mandatory.',
                    ),
                ),
            ],
        ),
    ]
