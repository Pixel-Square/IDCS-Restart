from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0068_merge_20260313_1122'),
        ('OBE', '0052_ta_scoped_drafts_and_published_sheets'),
    ]


    def _build_ta_lookup(TeachingAssignment, Q):
        active_tas = list(
            TeachingAssignment.objects.filter(is_active=True)
            .select_related('subject', 'curriculum_row', 'curriculum_row__master', 'section')
        )

        by_subject_code = {}
        for ta in active_tas:
            codes = set()
            try:
                if getattr(getattr(ta, 'subject', None), 'code', None):
                    codes.add(str(ta.subject.code).strip().upper())
            except Exception:
                pass
            try:
                if getattr(getattr(ta, 'curriculum_row', None), 'course_code', None):
                    codes.add(str(ta.curriculum_row.course_code).strip().upper())
            except Exception:
                pass
            try:
                master = getattr(getattr(ta, 'curriculum_row', None), 'master', None)
                if getattr(master, 'course_code', None):
                    codes.add(str(master.course_code).strip().upper())
            except Exception:
                pass

            for code in codes:
                by_subject_code.setdefault(code, []).append(ta)

        return by_subject_code


    def _pick_ta_for_row(row, by_subject_code, StudentSectionAssignment):
        try:
            subject_code = str(getattr(getattr(row, 'subject', None), 'code', '') or '').strip().upper()
            if not subject_code:
                return None
        except Exception:
            return None

        candidates = list(by_subject_code.get(subject_code, []))
        if not candidates:
            return None

        student = getattr(row, 'student', None)
        student_section_id = getattr(student, 'section_id', None)

        active_assignment_section_ids = set()
        try:
            if student is not None:
                active_assignment_section_ids = set(
                    StudentSectionAssignment.objects.filter(student_id=student.id, end_date__isnull=True)
                    .values_list('section_id', flat=True)
                )
        except Exception:
            active_assignment_section_ids = set()

        def _matches_student_section(ta):
            sec_id = getattr(ta, 'section_id', None)
            if sec_id is None:
                return False
            if student_section_id is not None and sec_id == student_section_id:
                return True
            return sec_id in active_assignment_section_ids

        section_matched = [ta for ta in candidates if _matches_student_section(ta)]
        if len(section_matched) == 1:
            return section_matched[0]
        if len(candidates) == 1:
            return candidates[0]
        return None


    def backfill_mark_teaching_assignment(apps, schema_editor):
        Q = __import__('django.db.models').db.models.Q
        TeachingAssignment = apps.get_model('academics', 'TeachingAssignment')
        StudentSectionAssignment = apps.get_model('academics', 'StudentSectionAssignment')

        mark_model_names = [
            'Cia1Mark',
            'Cia2Mark',
            'Ssa1Mark',
            'Ssa2Mark',
            'Review1Mark',
            'Review2Mark',
            'Formative1Mark',
            'Formative2Mark',
        ]

        by_subject_code = Migration._build_ta_lookup(TeachingAssignment, Q)

        for model_name in mark_model_names:
            Model = apps.get_model('OBE', model_name)
            qs = Model.objects.filter(teaching_assignment__isnull=True).select_related('subject', 'student')
            for row in qs.iterator():
                ta = Migration._pick_ta_for_row(row, by_subject_code, StudentSectionAssignment)
                if ta is None:
                    continue
                row.teaching_assignment_id = ta.id
                row.save(update_fields=['teaching_assignment'])


    def reverse_backfill_mark_teaching_assignment(apps, schema_editor):
        # No destructive reverse needed; keep populated teaching_assignment values.
        return

    operations = [
        migrations.AddField(
            model_name='cia1mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='cia1_marks', to='academics.teachingassignment'),
        ),
        migrations.AddField(
            model_name='cia2mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='cia2_marks', to='academics.teachingassignment'),
        ),
        migrations.AddField(
            model_name='formative1mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='formative1_marks', to='academics.teachingassignment'),
        ),
        migrations.AddField(
            model_name='formative2mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='formative2_marks', to='academics.teachingassignment'),
        ),
        migrations.AddField(
            model_name='review1mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='review1_marks', to='academics.teachingassignment'),
        ),
        migrations.AddField(
            model_name='review2mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='review2_marks', to='academics.teachingassignment'),
        ),
        migrations.AddField(
            model_name='ssa1mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='ssa1_marks', to='academics.teachingassignment'),
        ),
        migrations.AddField(
            model_name='ssa2mark',
            name='teaching_assignment',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='ssa2_marks', to='academics.teachingassignment'),
        ),

        migrations.RunPython(backfill_mark_teaching_assignment, reverse_backfill_mark_teaching_assignment),

        migrations.RemoveConstraint(
            model_name='cia1mark',
            name='unique_cia1_mark_per_subject_student',
        ),
        migrations.RemoveConstraint(
            model_name='cia2mark',
            name='unique_cia2_mark_per_subject_student',
        ),
        migrations.RemoveConstraint(
            model_name='formative1mark',
            name='unique_formative1_mark_per_subject_student',
        ),
        migrations.RemoveConstraint(
            model_name='formative2mark',
            name='unique_formative2_mark_per_subject_student',
        ),
        migrations.RemoveConstraint(
            model_name='review1mark',
            name='unique_review1_mark_per_subject_student',
        ),
        migrations.RemoveConstraint(
            model_name='review2mark',
            name='unique_review2_mark_per_subject_student',
        ),
        migrations.RemoveConstraint(
            model_name='ssa1mark',
            name='unique_ssa1_mark_per_subject_student',
        ),
        migrations.RemoveConstraint(
            model_name='ssa2mark',
            name='unique_ssa2_mark_per_subject_student',
        ),

        migrations.AddConstraint(
            model_name='cia1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_cia1_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='cia1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_cia1_mark_subject_student_legacy'),
        ),
        migrations.AddConstraint(
            model_name='cia2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_cia2_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='cia2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_cia2_mark_subject_student_legacy'),
        ),
        migrations.AddConstraint(
            model_name='formative1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_formative1_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='formative1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_formative1_mark_subject_student_legacy'),
        ),
        migrations.AddConstraint(
            model_name='formative2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_formative2_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='formative2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_formative2_mark_subject_student_legacy'),
        ),
        migrations.AddConstraint(
            model_name='review1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_review1_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='review1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_review1_mark_subject_student_legacy'),
        ),
        migrations.AddConstraint(
            model_name='review2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_review2_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='review2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_review2_mark_subject_student_legacy'),
        ),
        migrations.AddConstraint(
            model_name='ssa1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_ssa1_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='ssa1mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_ssa1_mark_subject_student_legacy'),
        ),
        migrations.AddConstraint(
            model_name='ssa2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=False), fields=('subject', 'student', 'teaching_assignment'), name='unique_ssa2_mark_subject_student_ta'),
        ),
        migrations.AddConstraint(
            model_name='ssa2mark',
            constraint=models.UniqueConstraint(condition=Q(teaching_assignment__isnull=True), fields=('subject', 'student'), name='unique_ssa2_mark_subject_student_legacy'),
        ),
    ]
