from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0040_acv2internalmark_co6_total_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AcV2GoogleSheetLink',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('sheet_url', models.URLField(max_length=1024)),
                ('spreadsheet_id', models.CharField(max_length=255)),
                ('exam_configs', models.JSONField(blank=True, default=dict)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('section', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='google_sheet_link', to='academic_v2.acv2section')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='acv2_google_sheet_links_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Google Sheet Link',
                'verbose_name_plural': 'Google Sheet Links',
                'db_table': 'acv2_google_sheet_link',
            },
        ),
        migrations.AddIndex(
            model_name='acv2googlesheetlink',
            index=models.Index(fields=['spreadsheet_id'], name='acv2_googl_spreads_5035d0_idx'),
        ),
        migrations.AddIndex(
            model_name='acv2googlesheetlink',
            index=models.Index(fields=['is_active'], name='acv2_googl_is_acti_261a95_idx'),
        ),
    ]
