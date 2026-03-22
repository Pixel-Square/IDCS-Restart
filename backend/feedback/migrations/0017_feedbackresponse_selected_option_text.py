# Generated manually on 2026-03-15

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("feedback", "0016_feedbackquestionoption_created_at"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'feedback_responses'
                              AND column_name = 'selected_option'
                        ) THEN
                            ALTER TABLE feedback_responses
                                ALTER COLUMN selected_option DROP NOT NULL;
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
                              AND column_name = 'selected_option'
                        ) THEN
                            UPDATE feedback_responses
                               SET selected_option = ''
                             WHERE selected_option IS NULL;

                            ALTER TABLE feedback_responses
                                ALTER COLUMN selected_option SET NOT NULL;
                        END IF;
                    END $$;
                    """,
                ),
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="feedbackresponse",
                    name="selected_option",
                ),
                migrations.AddField(
                    model_name="feedbackresponse",
                    name="selected_option_text",
                    field=models.CharField(
                        max_length=255,
                        null=True,
                        blank=True,
                        db_column="selected_option",
                        help_text="Selected radio option text (for radio / rating_radio_comment questions)",
                    ),
                ),
            ],
        )
    ]
