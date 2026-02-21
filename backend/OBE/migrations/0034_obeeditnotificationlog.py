from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0033_iqacresetnotification'),
    ]

    operations = [
        migrations.CreateModel(
            name='ObeEditNotificationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('channel', models.CharField(choices=[('EMAIL', 'Email'), ('WHATSAPP', 'WhatsApp')], db_index=True, max_length=16)),
                ('status', models.CharField(choices=[('SUCCESS', 'Success'), ('FAILED', 'Failed'), ('SKIPPED', 'Skipped')], db_index=True, max_length=16)),
                ('recipient', models.CharField(blank=True, default='', max_length=255)),
                ('message', models.TextField(blank=True, default='')),
                ('response_status_code', models.IntegerField(blank=True, null=True)),
                ('response_body', models.TextField(blank=True, default='')),
                ('error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('edit_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notification_logs', to='OBE.obeeditrequest')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='obeeditnotificationlog',
            index=models.Index(fields=['edit_request', 'channel', 'created_at'], name='obe_editnotif_req_chan_idx'),
        ),
        migrations.AddIndex(
            model_name='obeeditnotificationlog',
            index=models.Index(fields=['channel', 'status', 'created_at'], name='obe_editnotif_chan_stat_idx'),
        ),
    ]
