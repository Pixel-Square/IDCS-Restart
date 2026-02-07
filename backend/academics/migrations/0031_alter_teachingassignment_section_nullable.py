from django.db import migrations, models
import django.db.models.deletion
import django.db.models as dj_models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0030_teachingassignment_elective_subject_and_more'),
    ]

    operations = [
        # Make section nullable so electives can be department-scoped
        migrations.AlterField(
            model_name='teachingassignment',
            name='section',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='teaching_assignments', to='academics.section'),
        ),
        # Remove old constraints that referenced section for electives
        migrations.RemoveConstraint(
            model_name='teachingassignment',
            name='unique_staff_curriculum_section_year',
        ),
        migrations.RemoveConstraint(
            model_name='teachingassignment',
            name='unique_staff_elective_section_year',
        ),
        # Add conditional constraint for curriculum_row (only when curriculum_row is present)
        migrations.AddConstraint(
            model_name='teachingassignment',
            constraint=models.UniqueConstraint(
                fields=('staff', 'curriculum_row', 'section', 'academic_year'),
                condition=dj_models.Q(curriculum_row__isnull=False),
                name='unique_staff_curriculum_section_year',
            ),
        ),
        # Add elective uniqueness without section (department-wide elective assignment)
        migrations.AddConstraint(
            model_name='teachingassignment',
            constraint=models.UniqueConstraint(
                fields=('staff', 'elective_subject', 'academic_year'),
                condition=dj_models.Q(elective_subject__isnull=False),
                name='unique_staff_elective_year',
            ),
        ),
    ]
