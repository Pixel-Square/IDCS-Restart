from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0014_alter_subject_course_alter_semester_unique_together'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='semester',
            name='course',
        ),
    ]
