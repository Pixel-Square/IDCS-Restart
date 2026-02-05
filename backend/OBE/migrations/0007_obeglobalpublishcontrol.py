from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0006_obedueschedule_obepublishrequest'),
        ('academics', '__first__'),
    ]

    operations = [
        migrations.CreateModel(
            name='ObeGlobalPublishControl',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assessment', models.CharField(choices=[('ssa1', 'SSA1'), ('ssa2', 'SSA2'), ('cia1', 'CIA1'), ('cia2', 'CIA2'), ('formative1', 'Formative1'), ('formative2', 'Formative2')], max_length=20)),
                ('is_open', models.BooleanField(default=True)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('academic_year', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='obe_global_publish_controls', to='academics.academicyear')),
            ],
            options={},
        ),
        migrations.AddConstraint(
            model_name='obeglobalpublishcontrol',
            constraint=models.UniqueConstraint(fields=('academic_year', 'assessment'), name='unique_obe_global_publish_control'),
        ),
        migrations.AddIndex(
            model_name='obeglobalpublishcontrol',
            index=models.Index(fields=['academic_year', 'assessment'], name='OBE_obeglo_academi_e47b9f_idx'),
        ),
        migrations.AddIndex(
            model_name='obeglobalpublishcontrol',
            index=models.Index(fields=['assessment', 'updated_at'], name='OBE_obeglo_assessm_299f79_idx'),
        ),
    ]
