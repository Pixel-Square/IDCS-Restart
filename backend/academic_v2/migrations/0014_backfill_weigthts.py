from django.db import migrations


def _normalize_dict(val):
    return val if isinstance(val, dict) else {}


def _normalize_list(val):
    return val if isinstance(val, list) else []


def forwards(apps, schema_editor):
    AcV2ClassType = apps.get_model('academic_v2', 'AcV2ClassType')
    Weigthts = apps.get_model('academic_v2', 'Weigthts')

    # Rebuild from the source of truth (ClassType.exam_assignments)
    Weigthts.objects.all().delete()

    rows = []
    for ct in AcV2ClassType.objects.all():
        for ea in (ct.exam_assignments or []):
            qp_type = (ea.get('qp_type') or '').strip()
            exam = (ea.get('exam') or '').strip()
            if not exam:
                continue

            mm_with = ea.get('mm_co_weights_with_exam')
            mm_without = ea.get('mm_co_weights_without_exam')
            mm_exam_weight = ea.get('mm_exam_weight')

            # Backward compatibility: allow nested keys
            if not mm_with and isinstance(ea.get('mm_with_exam'), dict):
                mm_with = ea.get('mm_with_exam', {}).get('co_weights')
                mm_exam_weight = ea.get('mm_with_exam', {}).get('exam_weight', mm_exam_weight)
            if not mm_without and isinstance(ea.get('mm_without_exam'), dict):
                mm_without = ea.get('mm_without_exam', {}).get('co_weights')

            rows.append(Weigthts(
                class_type=ct,
                qp_type=qp_type,
                exam=exam,
                exam_display_name=(ea.get('exam_display_name') or '').strip(),
                weight=ea.get('weight') or 0,
                co_weights=_normalize_dict(ea.get('co_weights')),
                default_cos=_normalize_list(ea.get('default_cos')),
                mark_manager_enabled=bool(ea.get('mark_manager_enabled', False)),
                mm_co_weights_with_exam=_normalize_dict(mm_with),
                mm_co_weights_without_exam=_normalize_dict(mm_without),
                mm_exam_weight=mm_exam_weight or 0,
            ))

    if rows:
        Weigthts.objects.bulk_create(rows)


def backwards(apps, schema_editor):
    Weigthts = apps.get_model('academic_v2', 'Weigthts')
    Weigthts.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('academic_v2', '0013_weigthts_weigthts_unique_weights_per_class_qp_exam'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
