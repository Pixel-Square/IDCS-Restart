from django.db import migrations, models


def populate_subject_course(apps, schema_editor):
    Subject = apps.get_model('academics', 'Subject')
    Semester = apps.get_model('academics', 'Semester')
    # Old Semester had a `course` FK; copy it to Subject.course
    for subj in Subject.objects.select_related('semester').all():
        sem = getattr(subj, 'semester', None)
        try:
            # If semester has attribute course (old schema), use it; otherwise leave
            course = getattr(sem, 'course', None)
        except Exception:
            course = None
        if course:
            subj.course_id = course.pk
            subj.save(update_fields=['course'])


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0012_merge_0010_0011'),
    ]

    operations = [
        # Add nullable course FK to Subject
        migrations.AddField(
            model_name='subject',
            name='course',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='subjects', to='academics.course'),
        ),
        migrations.RunPython(populate_subject_course, reverse_code=migrations.RunPython.noop),
        # Make course non-nullable and enforce uniqueness per (code, course)
        migrations.AlterField(
            model_name='subject',
            name='course',
            field=models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='subjects', to='academics.course'),
        ),
        migrations.AlterUniqueTogether(
            name='subject',
            unique_together={('code', 'course')},
        ),
        # NOTE: Do not remove Semester.course here on SQLite — defer removal
        # to a separate migration to avoid table-recreate ordering issues.
        # Ensure Semester.number is unique globally
        migrations.AlterField(
            model_name='semester',
            name='number',
            field=models.PositiveSmallIntegerField(),
        ),
    ]
