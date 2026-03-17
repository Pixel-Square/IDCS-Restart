# Generated migration for announcements

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('academics', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Announcement',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('content', models.TextField()),
                ('source', models.CharField(choices=[('hod', 'HOD'), ('iqac', 'IQAC')], max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_published', models.BooleanField(default=True)),
                ('published_at', models.DateTimeField(blank=True, null=True)),
                ('scheduled_for', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='announcements_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AnnouncementRead',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('read_at', models.DateTimeField(auto_now_add=True)),
                ('announcement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reads', to='announcements.announcement')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='announcement_reads', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('announcement', 'user')},
            },
        ),
        migrations.CreateModel(
            name='AnnouncementCourse',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('announcement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='course_targets', to='announcements.announcement')),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='announcement_targets', to='academics.course')),
            ],
            options={
                'unique_together': {('announcement', 'course')},
            },
        ),
        migrations.AddField(
            model_name='announcement',
            name='courses',
            field=models.ManyToManyField(blank=True, related_name='announcements', through='announcements.AnnouncementCourse', to='academics.course'),
        ),
        migrations.AddIndex(
            model_name='announcementread',
            index=models.Index(fields=['announcement', 'user'], name='announcements_r_announc_idx'),
        ),
        migrations.AddIndex(
            model_name='announcementread',
            index=models.Index(fields=['user', '-read_at'], name='announcements_r_user_id_idx'),
        ),
        migrations.AddIndex(
            model_name='announcementcourse',
            index=models.Index(fields=['announcement', 'course'], name='announcements_c_announc_idx'),
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['-created_at'], name='announcements_a_created_idx'),
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['source', '-created_at'], name='announcements_a_source_idx'),
        ),
    ]
