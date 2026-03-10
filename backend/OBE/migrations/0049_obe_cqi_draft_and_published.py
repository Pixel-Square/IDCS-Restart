from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        (
            'OBE',
            '0048_rename_obe_pubreq_hod_idx_obe_obepubl_hod_use_55268b_idx',
        ),
    ]

    operations = [
        migrations.CreateModel(
            name='ObeCqiDraft',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entries', models.JSONField(default=dict)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='obe_cqi_drafts', to='academics.subject')),
                ('teaching_assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='obe_cqi_drafts', to='academics.teachingassignment')),
            ],
            options={
                'db_table': 'obe_cqi_draft',
            },
        ),
        migrations.CreateModel(
            name='ObeCqiPublished',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('co_numbers', models.JSONField(default=list)),
                ('entries', models.JSONField(default=dict)),
                ('published_by', models.IntegerField(blank=True, null=True)),
                ('published_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='obe_cqi_published', to='academics.subject')),
                ('teaching_assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='obe_cqi_published', to='academics.teachingassignment')),
            ],
            options={
                'db_table': 'obe_cqi_published',
            },
        ),
        migrations.AddConstraint(
            model_name='obecqidraft',
            constraint=models.UniqueConstraint(fields=('subject', 'teaching_assignment'), name='unique_obe_cqi_draft_per_ta'),
        ),
        migrations.AddConstraint(
            model_name='obecqipublished',
            constraint=models.UniqueConstraint(fields=('subject', 'teaching_assignment'), name='unique_obe_cqi_published_per_ta'),
        ),
        migrations.AddIndex(
            model_name='obecqidraft',
            index=models.Index(fields=['subject', 'updated_at'], name='obe_cqi_draft_subj_upd_idx'),
        ),
        migrations.AddIndex(
            model_name='obecqidraft',
            index=models.Index(fields=['teaching_assignment', 'updated_at'], name='obe_cqi_draft_ta_upd_idx'),
        ),
        migrations.AddIndex(
            model_name='obecqipublished',
            index=models.Index(fields=['subject', 'published_at'], name='obe_cqi_pub_subj_pubat_idx'),
        ),
        migrations.AddIndex(
            model_name='obecqipublished',
            index=models.Index(fields=['teaching_assignment', 'published_at'], name='obe_cqi_pub_ta_pubat_idx'),
        ),
    ]
