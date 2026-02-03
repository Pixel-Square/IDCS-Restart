from django.db import migrations


def forwards(apps, schema_editor):
    Section = apps.get_model('academics', 'Section')
    Semester = apps.get_model('academics', 'Semester')
    Batch = apps.get_model('academics', 'Batch')

    # For each existing Section that still has a semester relation (legacy),
    # create or get a Batch corresponding to that Semester's course and number,
    # then assign section.batch.
    for sec in Section.objects.all():
        sem_id = getattr(sec, 'semester_id', None)
        if not sem_id:
            continue
        sem = Semester.objects.filter(pk=sem_id).first()
        if not sem:
            continue
        # Batch name chosen to reflect semester number; adjust if you prefer year-based batches
        batch_name = f"Sem{sem.number}"
        batch, created = Batch.objects.get_or_create(name=batch_name, course_id=sem.course_id)
        sec.batch_id = batch.pk
        sec.save(update_fields=['batch_id'])


def reverse(apps, schema_editor):
    Section = apps.get_model('academics', 'Section')
    # Undo: clear batch assignments (do not delete Batch rows)
    for sec in Section.objects.all():
        if getattr(sec, 'batch_id', None):
            sec.batch_id = None
            sec.save(update_fields=['batch_id'])


class Migration(migrations.Migration):

    dependencies = [
        # Ensure this data migration runs after the migration that creates the Batch model
        ('academics', '0009_academicyear_parity_batch_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
