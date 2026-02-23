from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0042_remove_cdappublished_teaching_assignment_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='obeeditrequest',
            name='hod_user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='obe_edit_requests_hod_inbox',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='obeeditrequest',
            name='hod_approved',
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.AddField(
            model_name='obeeditrequest',
            name='hod_reviewed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='obe_edit_requests_hod_reviewed',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='obeeditrequest',
            name='hod_reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='obeeditrequest',
            index=models.Index(fields=['hod_user', 'hod_approved', 'status'], name='obeedit_hodstat_idx'),
        ),
    ]
