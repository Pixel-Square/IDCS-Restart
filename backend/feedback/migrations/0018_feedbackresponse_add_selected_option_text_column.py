# Generated manually on 2026-03-15

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("feedback", "0017_feedbackresponse_selected_option_text"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'feedback_responses'
                              AND column_name = 'selected_option_text'
                        ) THEN
                            ALTER TABLE feedback_responses
                                ADD COLUMN selected_option_text VARCHAR(255);
                        END IF;

                        -- Backfill from legacy column if present.
                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'feedback_responses'
                              AND column_name = 'selected_option'
                        ) THEN
                            UPDATE feedback_responses
                               SET selected_option_text = selected_option
                             WHERE selected_option_text IS NULL
                               AND selected_option IS NOT NULL
                               AND selected_option <> '';
                        END IF;
                    END $$;
                    """,
                    reverse_sql="""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'feedback_responses'
                              AND column_name = 'selected_option_text'
                        ) THEN
                            ALTER TABLE feedback_responses
                                DROP COLUMN selected_option_text;
                        END IF;
                    END $$;
                    """,
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="feedbackresponse",
                    name="selected_option_text",
                    field=models.CharField(
                        max_length=255,
                        null=True,
                        blank=True,
                        db_column="selected_option_text",
                        help_text="Selected radio option text (for radio / rating_radio_comment questions)",
                    ),
                ),
            ],
        )
    ]
