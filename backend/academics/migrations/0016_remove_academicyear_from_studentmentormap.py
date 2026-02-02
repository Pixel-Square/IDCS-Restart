from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0015_remove_semester_course'),
    ]

    operations = [
        # Remove academic_year FK and adjust uniqueness constraint
        # Drop the old named constraint first (defensive for SQLite table rewrite)
        migrations.RemoveConstraint(
            name='unique_active_mentor_per_student_year',
            model_name='studentmentormap',
        ),
        migrations.AlterUniqueTogether(
            name='studentmentormap',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='studentmentormap',
            name='academic_year',
        ),
    ]
