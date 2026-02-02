from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0019_remove_studentmentormap_unique_active_mentor_per_student_year_and_more'),
        ('curriculum', '__first__'),
    ]

    operations = [
        migrations.AddField(
            model_name='teachingassignment',
            name='curriculum_row',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='teaching_assignments', to='curriculum.curriculumdepartment'),
        ),
        migrations.AlterField(
            model_name='teachingassignment',
            name='subject',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='teaching_assignments', to='academics.subject'),
        ),
        migrations.RemoveConstraint(
            model_name='teachingassignment',
            name='unique_staff_subject_section_year',
        ),
        migrations.AddConstraint(
            model_name='teachingassignment',
            constraint=models.UniqueConstraint(fields=('staff', 'curriculum_row', 'section', 'academic_year'), name='unique_staff_curriculum_section_year'),
        ),
    ]
