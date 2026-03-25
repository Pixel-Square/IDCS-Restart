from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0001_initial'),
        ('announcements', '0003_refactor_announcement_targeting'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='announcement',
            name='attachment',
            field=models.FileField(blank=True, null=True, upload_to='announcements/'),
        ),
        migrations.AddField(
            model_name='announcement',
            name='target_departments',
            field=models.ManyToManyField(blank=True, related_name='department_announcements', to='academics.department'),
        ),
        migrations.CreateModel(
            name='AnnouncementReadStatus',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_read', models.BooleanField(default=False)),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                ('announcement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='read_statuses', to='announcements.announcement')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='announcement_read_statuses', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('user', 'announcement')},
            },
        ),
        migrations.AddIndex(
            model_name='announcementreadstatus',
            index=models.Index(fields=['user', 'is_read'], name='announcemen_user_id_32ac91_idx'),
        ),
        migrations.AddIndex(
            model_name='announcementreadstatus',
            index=models.Index(fields=['announcement', 'user'], name='announcemen_announc_7e38ac_idx'),
        ),
    ]
