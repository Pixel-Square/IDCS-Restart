from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0012_seed_publish_requests'),
        ('academics', '0029_periodattendancesession_periodattendancerecord'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ObeEditRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject_code', models.CharField(db_index=True, max_length=64)),
                ('subject_name', models.CharField(blank=True, default='', max_length=255)),
                (
                    'assessment',
                    models.CharField(
                        choices=[
                            ('ssa1', 'SSA1'),
                            ('ssa2', 'SSA2'),
                            ('cia1', 'CIA1'),
                            ('cia2', 'CIA2'),
                            ('formative1', 'Formative1'),
                            ('formative2', 'Formative2'),
                            ('model', 'MODEL'),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    'scope',
                    models.CharField(
                        choices=[('MARK_ENTRY', 'Mark Entry'), ('MARK_MANAGER', 'Mark Manager')],
                        db_index=True,
                        max_length=24,
                    ),
                ),
                ('reason', models.TextField(blank=True, default='')),
                (
                    'status',
                    models.CharField(
                        choices=[('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')],
                        db_index=True,
                        default='PENDING',
                        max_length=16,
                    ),
                ),
                ('approved_until', models.DateTimeField(blank=True, null=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'academic_year',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='obe_edit_requests',
                        to='academics.academicyear',
                    ),
                ),
                (
                    'reviewed_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='obe_edit_requests_reviewed',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'staff_user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='obe_edit_requests',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name='obeeditrequest',
            index=models.Index(fields=['status', 'created_at'], name='OBE_obeedit_status_4e3a6d_idx'),
        ),
        migrations.AddIndex(
            model_name='obeeditrequest',
            index=models.Index(fields=['staff_user', 'assessment'], name='OBE_obeedit_staff_u_9e98a5_idx'),
        ),
        migrations.AddIndex(
            model_name='obeeditrequest',
            index=models.Index(fields=['academic_year', 'assessment'], name='OBE_obeedit_academi_5e7b0e_idx'),
        ),
        migrations.AddIndex(
            model_name='obeeditrequest',
            index=models.Index(fields=['subject_code', 'assessment', 'scope'], name='OBE_obeedit_subject_5d53a6_idx'),
        ),
    ]
