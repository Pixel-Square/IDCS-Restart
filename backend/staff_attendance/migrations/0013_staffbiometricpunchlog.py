from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('staff_attendance', '0012_special_department_date_limits'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='StaffBiometricPunchLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('raw_uid', models.CharField(blank=True, db_index=True, default='', max_length=64)),
                ('raw_staff_id', models.CharField(blank=True, db_index=True, default='', max_length=64)),
                ('punch_time', models.DateTimeField(db_index=True)),
                ('direction', models.CharField(choices=[('IN', 'IN'), ('OUT', 'OUT'), ('UNKNOWN', 'UNKNOWN')], default='UNKNOWN', max_length=10)),
                ('source', models.CharField(db_index=True, default='essl_realtime', max_length=40)),
                ('device_ip', models.GenericIPAddressField(blank=True, null=True)),
                ('device_port', models.PositiveIntegerField(blank=True, null=True)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='biometric_punch_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'staff_biometric_punch_log',
                'ordering': ['-punch_time', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='staffbiometricpunchlog',
            index=models.Index(fields=['user', 'punch_time'], name='staff_biome_user_id_16fc4d_idx'),
        ),
        migrations.AddIndex(
            model_name='staffbiometricpunchlog',
            index=models.Index(fields=['source', 'punch_time'], name='staff_biome_source_9bbd35_idx'),
        ),
        migrations.AddConstraint(
            model_name='staffbiometricpunchlog',
            constraint=models.UniqueConstraint(fields=('raw_uid', 'raw_staff_id', 'punch_time', 'direction', 'source'), name='unique_staff_biometric_punch'),
        ),
    ]
