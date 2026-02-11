from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0024_rename_obe_obedues_sem_assess_idx_obe_obedues_semeste_23f4f2_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ObeQpPatternConfig',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('class_type', models.CharField(max_length=16)),
                ('question_paper_type', models.CharField(blank=True, max_length=8, null=True)),
                ('exam', models.CharField(choices=[('CIA', 'CIA'), ('MODEL', 'MODEL')], max_length=8)),
                ('pattern', models.JSONField(blank=True, default=list)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'obe_qp_pattern_config',
            },
        ),
        migrations.AddConstraint(
            model_name='obeqppatternconfig',
            constraint=models.UniqueConstraint(fields=('class_type', 'question_paper_type', 'exam'), name='unique_qp_pattern_per_key'),
        ),
    ]
