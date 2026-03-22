from django.db import migrations, models


def ensure_created_at_column(apps, schema_editor):
    table = 'feedback_question_options'
    vendor = schema_editor.connection.vendor

    with schema_editor.connection.cursor() as cursor:
        existing = {c.name for c in schema_editor.connection.introspection.get_table_description(cursor, table)}

    # Add column if missing (fresh DBs created from earlier migrations).
    if 'created_at' not in existing:
        if vendor == 'postgresql':
            schema_editor.execute(
                "ALTER TABLE %s ADD COLUMN created_at timestamp with time zone NOT NULL DEFAULT NOW();" % table
            )
        elif vendor == 'sqlite':
            schema_editor.execute(
                "ALTER TABLE %s ADD COLUMN created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP;" % table
            )
        else:
            # Best-effort fallback.
            schema_editor.execute(
                "ALTER TABLE %s ADD COLUMN created_at datetime NOT NULL;" % table
            )
        return

    # Column exists: ensure safe default/backfill where supported.
    if vendor == 'postgresql':
        schema_editor.execute(
            "ALTER TABLE %s ALTER COLUMN created_at SET DEFAULT NOW();" % table
        )
        schema_editor.execute(
            "UPDATE %s SET created_at = NOW() WHERE created_at IS NULL;" % table
        )
        schema_editor.execute(
            "ALTER TABLE %s ALTER COLUMN created_at SET NOT NULL;" % table
        )


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0015_comment_enabled_default_and_state'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(ensure_created_at_column, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='feedbackquestionoption',
                    name='created_at',
                    field=models.DateTimeField(auto_now_add=True),
                ),
            ],
        ),
    ]
