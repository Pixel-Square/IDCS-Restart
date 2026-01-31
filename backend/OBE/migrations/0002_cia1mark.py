from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0003_teachingassignment'),
        ('OBE', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Cia1Mark',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mark', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cia1_marks', to='academics.subject')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cia1_marks', to='academics.studentprofile')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('subject', 'student'), name='unique_cia1_mark_per_subject_student'),
                ],
            },
        ),
    ]
