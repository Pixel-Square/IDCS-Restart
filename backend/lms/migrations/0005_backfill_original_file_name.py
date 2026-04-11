from django.db import migrations
import os


def backfill_original_file_name(apps, schema_editor):
    StudyMaterial = apps.get_model('lms', 'StudyMaterial')

    for row in StudyMaterial.objects.all().only('id', 'title', 'file', 'original_file_name'):
        if (row.original_file_name or '').strip():
            continue

        stored_name = os.path.basename(str(getattr(row, 'file', '') or '').strip())
        stored_ext = os.path.splitext(stored_name)[1]
        title = str(getattr(row, 'title', '') or '').strip()

        derived = ''
        if title:
            if stored_ext and not title.lower().endswith(stored_ext.lower()):
                derived = f"{title}{stored_ext}"
            else:
                derived = title
        elif stored_name:
            derived = stored_name

        if derived:
            StudyMaterial.objects.filter(pk=row.pk).update(original_file_name=derived)


class Migration(migrations.Migration):

    dependencies = [
        ('lms', '0004_studymaterial_original_file_name'),
    ]

    operations = [
        migrations.RunPython(backfill_original_file_name, migrations.RunPython.noop),
    ]
