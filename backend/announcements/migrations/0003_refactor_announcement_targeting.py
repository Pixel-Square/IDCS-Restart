from django.db import migrations, models
import django.db.models.deletion


def noop_reverse(apps, schema_editor):
    # Keep existing data/mappings intact on reverse.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0001_initial'),
        ('announcements', '0002_rename_announcements_a_created_idx_announcemen_created_da46df_idx_and_more'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='announcement',
            name='courses',
        ),
        migrations.RemoveField(
            model_name='announcement',
            name='source',
        ),
        migrations.RemoveField(
            model_name='announcement',
            name='updated_at',
        ),
        migrations.RemoveField(
            model_name='announcement',
            name='is_published',
        ),
        migrations.RemoveField(
            model_name='announcement',
            name='published_at',
        ),
        migrations.RemoveField(
            model_name='announcement',
            name='scheduled_for',
        ),
        migrations.AddField(
            model_name='announcement',
            name='department',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='announcements', to='academics.department'),
        ),
        migrations.AddField(
            model_name='announcement',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='announcement',
            name='target_class',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='announcements', to='academics.section'),
        ),
        migrations.AddField(
            model_name='announcement',
            name='target_roles',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='announcement',
            name='target_type',
            field=models.CharField(choices=[('ALL', 'All Users'), ('DEPARTMENT', 'Department'), ('CLASS', 'Class'), ('ROLE', 'Role')], default='ALL', max_length=16),
            preserve_default=False,
        ),
        migrations.DeleteModel(
            name='AnnouncementCourse',
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['target_type', '-created_at'], name='announcemen_target__81f6ea_idx'),
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['department', '-created_at'], name='announcemen_departm_5dfc28_idx'),
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['target_class', '-created_at'], name='announcemen_target__27209f_idx'),
        ),
        migrations.AddIndex(
            model_name='announcement',
            index=models.Index(fields=['is_active', '-created_at'], name='announcemen_is_acti_04b713_idx'),
        ),
        migrations.RunPython(noop_reverse, noop_reverse),
    ]
