from django.db import migrations
from django.db.models import Q


def backfill_qp_assignments(apps, schema_editor):
    AcV2QpPattern = apps.get_model('academic_v2', 'AcV2QpPattern')
    AcV2QpType = apps.get_model('academic_v2', 'AcV2QpType')
    AcV2QpAssignment = apps.get_model('academic_v2', 'AcV2QpAssignment')

    patterns = (
        AcV2QpPattern.objects
        .filter(is_active=True)
        .exclude(class_type__isnull=True)
        .iterator()
    )

    for qp_pattern in patterns:
        qp_type_code = (qp_pattern.qp_type or '').strip()
        if not qp_type_code:
            continue

        qp_type_obj = (
            AcV2QpType.objects.filter(is_active=True, code__iexact=qp_type_code)
            .filter(Q(class_type_id=qp_pattern.class_type_id) | Q(class_type__isnull=True))
            .order_by('-class_type_id')
            .first()
        )
        if not qp_type_obj:
            continue

        pattern = qp_pattern.pattern or {}
        titles = pattern.get('titles') or []
        marks = pattern.get('marks') or []
        btls = pattern.get('btls') or []
        cos = pattern.get('cos') or []
        enabled = pattern.get('enabled')
        if enabled is None:
            enabled = [True] * len(titles)

        max_len = max(len(titles), len(marks), len(btls), len(cos), len(enabled))
        question_table = []
        for i in range(max_len):
            question_table.append({
                'index': i,
                'title': titles[i] if i < len(titles) else f'Q{i + 1}',
                'max_marks': marks[i] if i < len(marks) else 0,
                'btl_level': btls[i] if i < len(btls) else None,
                'co_number': cos[i] if i < len(cos) else None,
                'enabled': enabled[i] if i < len(enabled) else True,
            })

        AcV2QpAssignment.objects.update_or_create(
            class_type_id=qp_pattern.class_type_id,
            qp_type_id=qp_type_obj.id,
            exam_assignment_id=qp_pattern.id,
            defaults={
                'is_active': True,
                'config': {
                    'qp_pattern_id': str(qp_pattern.id),
                    'pattern': pattern,
                },
                'question_table': question_table,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0011_acv2qpassignment_store_pattern_and_questions'),
    ]

    operations = [
        migrations.RunPython(backfill_qp_assignments, migrations.RunPython.noop),
    ]
