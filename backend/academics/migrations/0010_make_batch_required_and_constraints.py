from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0008_populate_batch_from_semester'),
    ]

    operations = [
        # Make batch non-nullable now that data migration populated it
        migrations.AlterField(
            model_name='section',
            name='batch',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sections', to='academics.batch'),
        ),
        # Enforce unique_together (name, batch)
        migrations.AlterUniqueTogether(
            name='section',
            unique_together={('name', 'batch')},
        ),
        # Now safe to remove the old semester field
        migrations.RemoveField(
            model_name='section',
            name='semester',
        ),
    ]
