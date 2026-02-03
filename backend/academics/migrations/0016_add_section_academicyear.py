from django.db import migrations, models


def populate_section_academicyear(apps, schema_editor):
    Section = apps.get_model('academics', 'Section')
    Batch = apps.get_model('academics', 'Batch')
    AcademicYear = apps.get_model('academics', 'AcademicYear')

    for sec in Section.objects.select_related('batch').all():
        b = getattr(sec, 'batch', None)
        if not b:
            continue
        # prefer Batch.start_year to find/make an AcademicYear
        start = getattr(b, 'start_year', None)
        if start:
            name = str(start)
            ay, created = AcademicYear.objects.get_or_create(name=name, defaults={'parity': None})
            sec.academic_year = ay
            sec.save(update_fields=['academic_year'])


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0015_remove_semester_course'),
    ]

    operations = [
        migrations.AddField(
            model_name='section',
            name='academic_year',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.PROTECT, related_name='sections', to='academics.academicyear'),
        ),
        migrations.RunPython(populate_section_academicyear, reverse_code=migrations.RunPython.noop),
    ]
