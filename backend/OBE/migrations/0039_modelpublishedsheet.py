from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("OBE", "0038_alter_obecqiconfig_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="ModelPublishedSheet",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "subject",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="model_published_sheet", to="academics.subject"),
                ),
                ("data", models.JSONField(default=dict)),
                ("updated_by", models.IntegerField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
