from django.db import migrations, models
import django.db.models.deletion


def backfill_teaching_assignment(apps, schema_editor):
    PeriodAttendanceSession = apps.get_model('academics', 'PeriodAttendanceSession')
    TeachingAssignment = apps.get_model('academics', 'TeachingAssignment')

    # TimetableAssignment is in another app; access via apps registry
    TimetableAssignment = apps.get_model('timetable', 'TimetableAssignment')

    qs = PeriodAttendanceSession.objects.filter(teaching_assignment__isnull=True)

    for session in qs.iterator():
        staff = getattr(session, 'created_by', None)
        section = getattr(session, 'section', None)
        timetable_assignment_id = getattr(session, 'timetable_assignment_id', None)

        if staff is None or section is None:
            continue

        curriculum_row_id = None
        try:
            if timetable_assignment_id:
                ta = TimetableAssignment.objects.filter(pk=timetable_assignment_id).first()
                curriculum_row_id = getattr(ta, 'curriculum_row_id', None)
        except Exception:
            curriculum_row_id = None

        ta_qs = TeachingAssignment.objects.filter(is_active=True, staff_id=getattr(staff, 'id', None)).filter(
            models.Q(section_id=getattr(section, 'id', None)) | models.Q(section__isnull=True)
        )

        if curriculum_row_id:
            ta_qs = ta_qs.filter(
                models.Q(curriculum_row_id=curriculum_row_id)
                | models.Q(elective_subject__parent_id=curriculum_row_id)
            )

        # Prefer exact section match when available
        chosen = ta_qs.order_by(models.Case(
            models.When(section_id=getattr(section, 'id', None), then=models.Value(0)),
            default=models.Value(1),
            output_field=models.IntegerField(),
        ), 'id').first()

        if chosen is None:
            continue

        PeriodAttendanceSession.objects.filter(pk=session.pk, teaching_assignment__isnull=True).update(
            teaching_assignment_id=chosen.id
        )


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0038_alter_teachingassignment_custom_subject'),
    ]

    operations = [
        migrations.AddField(
            model_name='periodattendancesession',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='period_attendance_sessions', to='academics.teachingassignment'),
        ),
        migrations.AlterUniqueTogether(
            name='periodattendancesession',
            unique_together={('section', 'period', 'date', 'teaching_assignment')},
        ),
        migrations.RunPython(backfill_teaching_assignment, migrations.RunPython.noop),
    ]
