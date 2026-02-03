from django.db import migrations


def forward(apps, schema_editor):
    TeachingAssignment = apps.get_model('academics', 'TeachingAssignment')
    Subject = apps.get_model('academics', 'Subject')
    CurriculumDepartment = apps.get_model('curriculum', 'CurriculumDepartment')

    for ta in TeachingAssignment.objects.select_related('subject', 'section__batch__course__department').filter(curriculum_row__isnull=True).exclude(subject__isnull=True):
        subj = ta.subject
        dept = None
        try:
            dept = ta.section.batch.course.department
        except Exception:
            dept = None

        if subj is None:
            continue

        # try to find matching curriculum row by code or name and department
        qs = CurriculumDepartment.objects.filter()
        matched = None
        try:
            if dept is not None:
                qs = CurriculumDepartment.objects.filter(department=dept)
            else:
                qs = CurriculumDepartment.objects.all()
            matched = qs.filter(course_code__iexact=subj.code).first()
            if not matched:
                matched = qs.filter(course_name__iexact=subj.name).first()
        except Exception:
            matched = None

        if matched:
            ta.curriculum_row = matched
            # Optionally clear subject if you want to canonicalize to curriculum_row only
            # ta.subject = None
            ta.save(update_fields=['curriculum_row'])


def reverse(apps, schema_editor):
    # Do not revert backfill
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0020_teaching_curriculumrow'),
        ('curriculum', '__first__'),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
