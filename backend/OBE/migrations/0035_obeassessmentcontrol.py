from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0034_obeeditnotificationlog'),
    ]

    operations = [
        migrations.CreateModel(
            name='ObeAssessmentControl',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject_code', models.CharField(db_index=True, max_length=64)),
                ('subject_name', models.CharField(blank=True, default='', max_length=255)),
                ('assessment', models.CharField(choices=[('ssa1', 'SSA 1'), ('review1', 'Review 1'), ('ssa2', 'SSA 2'), ('review2', 'Review 2'), ('formative1', 'Formative 1'), ('formative2', 'Formative 2'), ('cia1', 'CIA 1'), ('cia2', 'CIA 2'), ('model', 'Model')], max_length=20)),
                ('is_enabled', models.BooleanField(default=True)),
                ('is_open', models.BooleanField(default=True)),
                ('created_by', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('academic_year', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='obe_assessment_controls', to='academics.academicyear')),
                ('semester', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='obe_assessment_controls', to='academics.semester')),
            ],
        ),
        migrations.AddConstraint(
            model_name='obeassessmentcontrol',
            constraint=models.UniqueConstraint(fields=('semester', 'subject_code', 'assessment'), name='unique_obe_assessment_control_semester'),
        ),
        migrations.AddIndex(
            model_name='obeassessmentcontrol',
            index=models.Index(fields=['semester', 'assessment'], name='obe_assessctrl_sem_assess_idx'),
        ),
        migrations.AddIndex(
            model_name='obeassessmentcontrol',
            index=models.Index(fields=['academic_year', 'assessment'], name='obe_assessctrl_ay_assess_idx'),
        ),
        migrations.AddIndex(
            model_name='obeassessmentcontrol',
            index=models.Index(fields=['subject_code', 'assessment'], name='obe_assessctrl_code_assess_idx'),
        ),
    ]
