from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0008_rename_obe_obeglo_academi_e47b9f_idx_obe_obeglob_academi_d0809f_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='LabPublishedSheet',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assessment', models.CharField(choices=[('formative1', 'Lab 1 (Formative1)'), ('formative2', 'Lab 2 (Formative2)')], max_length=20)),
                ('data', models.JSONField(default=dict)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lab_published_sheets', to='academics.subject')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('subject', 'assessment'), name='unique_lab_published_sheet_per_subject_assessment'),
                ],
            },
        ),
    ]
