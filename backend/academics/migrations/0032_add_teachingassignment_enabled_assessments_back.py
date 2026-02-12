from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0031_remove_teachingassignment_enabled_assessments_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='teachingassignment',
            name='enabled_assessments',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
