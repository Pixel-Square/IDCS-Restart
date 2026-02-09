from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0019_classtypeweights'),
        ('academics', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Review1Mark',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mark', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review1_marks', to='academics.studentprofile')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review1_marks', to='academics.subject')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('subject', 'student'), name='unique_review1_mark_per_subject_student')],
            },
        ),
        migrations.CreateModel(
            name='Review2Mark',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mark', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review2_marks', to='academics.studentprofile')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review2_marks', to='academics.subject')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('subject', 'student'), name='unique_review2_mark_per_subject_student')],
            },
        ),
        migrations.AlterField(
            model_name='assessmentdraft',
            name='assessment',
            field=models.CharField(
                choices=[
                    ('ssa1', 'SSA1'),
                    ('review1', 'Review1'),
                    ('ssa2', 'SSA2'),
                    ('review2', 'Review2'),
                    ('cia1', 'CIA1'),
                    ('cia2', 'CIA2'),
                    ('formative1', 'Formative1'),
                    ('formative2', 'Formative2'),
                    ('model', 'MODEL'),
                ],
                max_length=20,
            ),
        ),
    ]
