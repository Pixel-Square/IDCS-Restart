from decimal import Decimal, InvalidOperation

from django.db import migrations


def _to_decimal_or_none(raw):
    if raw is None:
        return None
    if isinstance(raw, str) and raw.strip() == '':
        return None
    try:
        return Decimal(str(raw))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _resolve_student_id(StudentProfile, row_key, row_payload):
    if isinstance(row_payload, dict):
        sid_raw = row_payload.get('studentId')
        try:
            sid = int(sid_raw)
            if sid > 0:
                return sid
        except Exception:
            pass

    key = str(row_key or '').strip()
    if key.isdigit():
        try:
            sid = int(key)
            return sid if sid > 0 else None
        except Exception:
            return None

    if key.startswith('id:'):
        try:
            sid = int(key.split(':', 1)[1])
            return sid if sid > 0 else None
        except Exception:
            return None

    if key.startswith('reg:'):
        reg = str(key.split(':', 1)[1]).strip()
        if not reg:
            return None
        student = StudentProfile.objects.filter(reg_no=reg).only('id').first()
        return int(student.id) if student else None

    return None


def _extract_totals(data):
    if not isinstance(data, dict):
        return {}

    class_type = str(data.get('classType') or '').strip().upper()
    if class_type in {'TCPL', 'TCPR'}:
        is_tcpl_like = True
    elif class_type in {'THEORY', 'LAB', 'PRACTICAL'}:
        is_tcpl_like = False
    else:
        raw_tcpl = data.get('tcplLikeKind')
        if isinstance(raw_tcpl, bool):
            is_tcpl_like = raw_tcpl
        else:
            tcpl_key = str(raw_tcpl or '').strip().upper()
            is_tcpl_like = tcpl_key in {'1', 'TRUE', 'YES', 'TCPL', 'TCPR'}

    primary_key = 'tcplSheet' if is_tcpl_like else 'theorySheet'
    fallback_key = 'theorySheet' if is_tcpl_like else 'tcplSheet'

    rows_by = data.get(primary_key, {})
    if not isinstance(rows_by, dict) or not rows_by:
        alt = data.get(fallback_key, {})
        rows_by = alt if isinstance(alt, dict) else {}

    totals_by_sid = {}
    for row_key, row in rows_by.items():
        if not isinstance(row, dict):
            continue

        sid = _resolve_student_id(_extract_totals.StudentProfile, row_key, row)
        if not sid:
            continue

        absent = bool(row.get('absent'))
        absent_kind = str(row.get('absentKind') or 'AL').strip().upper()
        if absent and absent_kind == 'AL':
            totals_by_sid[sid] = Decimal('0')
            continue

        total = Decimal('0')
        q_obj = row.get('q', {})
        if isinstance(q_obj, dict):
            for value in q_obj.values():
                dec = _to_decimal_or_none(value)
                if dec is not None:
                    total += dec

        lab_dec = _to_decimal_or_none(row.get('lab'))
        if lab_dec is not None:
            total += lab_dec

        totals_by_sid[sid] = total

    return totals_by_sid


def backfill_model_exam_marks_v2(apps, schema_editor):
    ModelPublishedSheet = apps.get_model('OBE', 'ModelPublishedSheet')
    ModelExamMark = apps.get_model('OBE', 'ModelExamMark')
    StudentProfile = apps.get_model('academics', 'StudentProfile')

    _extract_totals.StudentProfile = StudentProfile

    qs = ModelPublishedSheet.objects.all().only('id', 'subject_id', 'teaching_assignment_id', 'data')
    for row in qs.iterator(chunk_size=200):
        data = row.data if isinstance(row.data, dict) else {}
        totals_by_sid = _extract_totals(data)
        if not totals_by_sid:
            continue

        for sid, total in totals_by_sid.items():
            student = StudentProfile.objects.filter(id=sid).first()
            if not student:
                continue
            ModelExamMark.objects.update_or_create(
                subject_id=row.subject_id,
                teaching_assignment_id=row.teaching_assignment_id,
                student_id=student.id,
                defaults={'total_mark': total},
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0065_backfill_model_exam_marks_from_published'),
    ]

    operations = [
        migrations.RunPython(backfill_model_exam_marks_v2, noop_reverse),
    ]
