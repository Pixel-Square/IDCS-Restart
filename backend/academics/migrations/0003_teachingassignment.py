from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0002_add_masters_and_fk_changes'),
    ]

    operations = [
        migrations.CreateModel(
            name='TeachingAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_active', models.BooleanField(default=True)),
                ('academic_year', models.ForeignKey(on_delete=models.PROTECT, related_name='teaching_assignments', to='academics.academicyear')),
                ('section', models.ForeignKey(on_delete=models.CASCADE, related_name='teaching_assignments', to='academics.section')),
                ('staff', models.ForeignKey(on_delete=models.CASCADE, related_name='teaching_assignments', to='academics.staffprofile')),
                ('subject', models.ForeignKey(on_delete=models.CASCADE, related_name='teaching_assignments', to='academics.subject')),
            ],
            options={
                'verbose_name': 'Teaching Assignment',
                'verbose_name_plural': 'Teaching Assignments',
            },
        ),
        migrations.AddConstraint(
            model_name='teachingassignment',
            constraint=models.UniqueConstraint(fields=('staff', 'subject', 'section', 'academic_year'), name='unique_staff_subject_section_year'),
        ),
    ]
