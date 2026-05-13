from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0017_rename_acv2_cqi_a_draft_u_5d77e2_idx_acv2_cqi_as_draft_u_5411c8_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='acv2cycle',
            name='inactive_semester_ids',
            field=models.JSONField(blank=True, default=list),
        ),
    ]