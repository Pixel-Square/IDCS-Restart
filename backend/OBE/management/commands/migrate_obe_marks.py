from django.core.management.base import BaseCommand

from OBE.models import LabExamMark, LabPublishedSheet, ModelExamMark, ModelPublishedSheet
from OBE.services.exam_mark_persistence import persist_lab_exam_marks, persist_model_exam_marks

class Command(BaseCommand):
    help = 'Backfill Model/Lab student-wise marks and CO splitups from published JSON sheets.'

    def handle(self, *args, **options):
        model_rows = list(ModelPublishedSheet.objects.select_related('subject', 'teaching_assignment').order_by('-updated_at'))
        lab_rows = list(LabPublishedSheet.objects.select_related('subject', 'teaching_assignment').order_by('-updated_at'))

        seen_model_scopes = set()
        seen_lab_scopes = set()
        valid_model_scopes = set()
        valid_lab_scopes = set()
        model_total = 0
        lab_total = 0

        for row in model_rows:
            scope_key = (row.subject_id, row.teaching_assignment_id)
            if scope_key in seen_model_scopes:
                continue
            seen_model_scopes.add(scope_key)
            valid_model_scopes.add(scope_key)
            model_total += persist_model_exam_marks(
                subject=row.subject,
                teaching_assignment=row.teaching_assignment,
                data=row.data if isinstance(row.data, dict) else {},
            )

        for row in lab_rows:
            scope_key = (row.subject_id, row.teaching_assignment_id, str(row.assessment or '').lower())
            if scope_key in seen_lab_scopes:
                continue
            seen_lab_scopes.add(scope_key)
            valid_lab_scopes.add(scope_key)
            lab_total += persist_lab_exam_marks(
                subject=row.subject,
                teaching_assignment=row.teaching_assignment,
                assessment=str(row.assessment or '').lower(),
                data=row.data if isinstance(row.data, dict) else {},
            )

        # Cleanup stale rows that do not have any currently published scope.
        stale_model_ids = []
        for r in ModelExamMark.objects.values('id', 'subject_id', 'teaching_assignment_id'):
            key = (r['subject_id'], r['teaching_assignment_id'])
            if key not in valid_model_scopes:
                stale_model_ids.append(r['id'])
        if stale_model_ids:
            ModelExamMark.objects.filter(id__in=stale_model_ids).delete()

        stale_lab_ids = []
        for r in LabExamMark.objects.values('id', 'subject_id', 'teaching_assignment_id', 'assessment'):
            key = (r['subject_id'], r['teaching_assignment_id'], str(r['assessment'] or '').lower())
            if key not in valid_lab_scopes:
                stale_lab_ids.append(r['id'])
        if stale_lab_ids:
            LabExamMark.objects.filter(id__in=stale_lab_ids).delete()

        self.stdout.write(self.style.SUCCESS(
            f"Backfill completed: model students synced={model_total}, lab students synced={lab_total}"
        ))
