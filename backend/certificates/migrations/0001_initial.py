from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import certificates.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0032_login_lockdown'),
        ('academics', '0090_systemtransitionlog'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Certificate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('certificate_type', models.CharField(choices=[('COURSE_COMPLETION', 'Course Completion'), ('WORKSHOP', 'Workshop'), ('SEMINAR', 'Seminar'), ('HACKATHON', 'Hackathon'), ('COMPETITION', 'Competition'), ('INTERNSHIP', 'Internship'), ('ONLINE_COURSE', 'Online Course'), ('CONFERENCE', 'Conference'), ('CERTIFICATION', 'Professional Certification'), ('AWARD', 'Award'), ('OTHER', 'Other')], max_length=40)),
                ('title', models.CharField(max_length=255)),
                ('issuing_organization', models.CharField(max_length=255)),
                ('issue_date', models.DateField()),
                ('expiry_date', models.DateField(blank=True, null=True)),
                ('file', models.FileField(upload_to=certificates.models.certificate_upload_path)),
                ('file_hash', models.CharField(db_index=True, max_length=64)),
                ('status', models.CharField(choices=[('PENDING_MENTOR_REVIEW', 'Pending Mentor Review'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')], default='PENDING_MENTOR_REVIEW', max_length=32)),
                ('rejection_reason', models.CharField(blank=True, choices=[('INVALID_FORMAT', 'Invalid document format'), ('UNCLEAR', 'Certificate unclear'), ('UNRECOGNISED_ORG', 'Organization not recognized'), ('OUTSIDE_SCOPE', 'Outside scope'), ('DUPLICATE', 'Already submitted'), ('OTHER', 'Custom')], max_length=64, null=True)),
                ('rejection_message', models.TextField(blank=True, default='', max_length=500)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('mentor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mentee_certificates', to='academics.staffprofile')),
                ('reviewer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_certificates', to=settings.AUTH_USER_MODEL)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='certificates', to='academics.studentprofile')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='StudentAchievement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('achievement_type', models.CharField(choices=[('CERTIFICATION', 'Certification'), ('EVENT_BADGE', 'Event Badge'), ('AWARD', 'Award'), ('WORKSHOP', 'Workshop'), ('INTERNSHIP', 'Internship'), ('OTHER', 'Other')], max_length=32)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, default='')),
                ('issuing_body', models.CharField(max_length=255)),
                ('date_earned', models.DateField()),
                ('verified_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('certificate', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='achievement', to='certificates.certificate')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='achievements', to='academics.studentprofile')),
                ('verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='verified_achievements', to='academics.staffprofile')),
            ],
            options={
                'ordering': ['-date_earned', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='CertificateAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('UPLOADED', 'Uploaded'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected'), ('RE_UPLOADED', 'Re-uploaded')], max_length=24)),
                ('details', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='certificate_audit_logs', to=settings.AUTH_USER_MODEL)),
                ('certificate', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='audit_logs', to='certificates.certificate')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='certificate',
            index=models.Index(fields=['student', 'status', '-created_at'], name='certific_studen_14c3b0_idx'),
        ),
        migrations.AddIndex(
            model_name='certificate',
            index=models.Index(fields=['mentor', 'status', '-created_at'], name='certific_mentor_6d2d0f_idx'),
        ),
        migrations.AddIndex(
            model_name='certificate',
            index=models.Index(fields=['file_hash'], name='certific_file_h_3e2fd1_idx'),
        ),
        migrations.AddIndex(
            model_name='studentachievement',
            index=models.Index(fields=['student', '-date_earned'], name='achieve_studen_0c92f3_idx'),
        ),
    ]
