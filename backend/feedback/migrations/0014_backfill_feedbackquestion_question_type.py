from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0013_alter_feedbackquestion_question_type'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "UPDATE feedback_questions "
                "SET question_type = 'rating' "
                "WHERE question_type IS NULL OR question_type = ''"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
