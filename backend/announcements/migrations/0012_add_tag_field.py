from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("announcements", "0011_remove_announcement_announcemen_created_da46df_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="tag",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
    ]
