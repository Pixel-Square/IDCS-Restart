from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0010_acv2qppattern_order'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='acv2qpassignment',
            name='unique_qp_assignment',
        ),
        migrations.RemoveField(
            model_name='acv2qpassignment',
            name='exam_assignment',
        ),
        migrations.AddField(
            model_name='acv2qpassignment',
            name='exam_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='qp_assignments', to='academic_v2.acv2qppattern'),
        ),
        migrations.AddField(
            model_name='acv2qpassignment',
            name='question_table',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddConstraint(
            model_name='acv2qpassignment',
            constraint=models.UniqueConstraint(fields=('class_type', 'qp_type', 'exam_assignment'), name='unique_qp_assignment'),
        ),
    ]
