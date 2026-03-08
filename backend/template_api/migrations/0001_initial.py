"""
Auto-generated migration for EventPosterAttachment model.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='EventPosterAttachment',
            fields=[
                ('id',               models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_id',         models.CharField(db_index=True, max_length=128)),
                ('canva_design_id',  models.CharField(blank=True, max_length=256)),
                ('format',           models.CharField(
                    choices=[('png', 'PNG'), ('pdf', 'PDF')],
                    default='png',
                    max_length=10,
                )),
                ('file',             models.FileField(upload_to='event_posters/%Y/%m/')),
                ('source_url',       models.URLField(blank=True, max_length=1024)),
                ('uploaded_at',      models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-uploaded_at'],
            },
        ),
    ]
