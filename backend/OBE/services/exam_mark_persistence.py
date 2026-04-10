from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, Iterable, Optional, Tuple

from django.db import transaction

from academics.models import StudentProfile
from OBE.models import (
    LabExamCOMark,
    LabExamMark,
    ModelExamCOMark,
    ModelExamMark,
    ObeBatchQpPatternOverride,
    ObeQpPatternConfig,
)


def _to_decimal(value: Any) -> Optional[Decimal]:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _to_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except Exception:
        return None


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _ta_filter_kwargs(teaching_assignment) -> Dict[str, Any]:
    if teaching_assignment is None:
        return {"teaching_assignment__isnull": True}
    return {"teaching_assignment": teaching_assignment}


def _resolve_model_pattern(*, class_type: str, qp_type: str, batch_id: Optional[int]) -> Optional[dict]:
    cls = str(class_type or "").strip().upper() or "THEORY"
    qp = str(qp_type or "").strip().upper()
    qp_for_db = qp if (cls == "THEORY" and qp in {"QP1", "QP2"}) else None

    try:
        if batch_id:
            row = ObeBatchQpPatternOverride.objects.filter(
                batch_id=batch_id,
                class_type=cls,
                question_paper_type=qp_for_db,
                exam="MODEL",
            ).first()
            if row and isinstance(getattr(row, "pattern", None), dict):
                return row.pattern
    except Exception:
        pass

    row = ObeQpPatternConfig.objects.filter(
        class_type=cls,
        question_paper_type=qp_for_db,
        exam="MODEL",
    ).first()
    return row.pattern if row and isinstance(getattr(row, "pattern", None), dict) else None


def _default_model_marks_and_cos(class_type: str) -> Tuple[list[float], list[int]]:
    cls = str(class_type or "").strip().upper()
    if cls in {"THEORY", "SPECIAL", ""}:
        marks = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 14, 14, 14, 14, 14, 10]
        cos = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5, 5]
        return [float(x) for x in marks], [int(x) for x in cos]
    return [], []


def _extract_student_from_model_row(row_key: str, row: dict) -> Optional[StudentProfile]:
    sid = None
    if isinstance(row, dict):
        sid = row.get("studentId")
    if sid is None and isinstance(row_key, str) and row_key.startswith("id:"):
        sid = row_key.split(":", 1)[1]

    try:
        sid_int = int(sid)
    except Exception:
        return None

    return StudentProfile.objects.filter(id=sid_int).first()


def persist_model_exam_marks(*, subject, teaching_assignment, data: dict) -> int:
    if not isinstance(data, dict):
        return 0

    class_type = str(data.get("classType") or "").strip().upper()
    qp_type = str(data.get("qpType") or "").strip().upper()

    sheet_key = "tcplSheet" if class_type in {"TCPL", "TCPR"} else "theorySheet"
    sheet = data.get(sheet_key)
    if not isinstance(sheet, dict):
        return 0

    batch_id = getattr(getattr(teaching_assignment, "section", None), "batch_id", None)
    pattern = _resolve_model_pattern(class_type=class_type, qp_type=qp_type, batch_id=batch_id) or {}
    marks = pattern.get("marks") if isinstance(pattern.get("marks"), list) else []
    cos = pattern.get("cos") if isinstance(pattern.get("cos"), list) else []

    if not marks:
        marks, cos = _default_model_marks_and_cos(class_type)
    else:
        marks = [float(_to_float(m) or 0.0) for m in marks]
        if not cos or len(cos) != len(marks):
            _, fallback_cos = _default_model_marks_and_cos(class_type)
            cos = (fallback_cos[: len(marks)] if fallback_cos else [1] * len(marks))
        cos = [max(1, int(_to_float(c) or 1)) for c in cos]

    seen_parent_ids = set()
    upserted = 0

    with transaction.atomic():
        for row_key, row in sheet.items():
            if not isinstance(row, dict):
                continue

            student = _extract_student_from_model_row(str(row_key), row)
            if not student:
                continue

            absent = bool(row.get("absent"))
            q = row.get("q") if isinstance(row.get("q"), dict) else {}

            sum_by_co: Dict[int, float] = {}
            max_by_co: Dict[int, float] = {}

            for i, mx in enumerate(marks):
                q_key = f"q{i + 1}"
                co = max(1, int(cos[i]))
                max_by_co[co] = max_by_co.get(co, 0.0) + float(mx)
                if absent:
                    continue
                n = _to_float(q.get(q_key))
                if n is None:
                    continue
                sum_by_co[co] = sum_by_co.get(co, 0.0) + _clamp(n, 0.0, float(mx))

            total_val = 0.0 if absent else float(sum(sum_by_co.values()))
            parent, _ = ModelExamMark.objects.update_or_create(
                subject=subject,
                student=student,
                teaching_assignment=teaching_assignment,
                defaults={"total_mark": _to_decimal(total_val)},
            )
            seen_parent_ids.add(parent.id)
            upserted += 1

            ModelExamCOMark.objects.filter(model_exam_mark=parent).delete()
            for co_num in sorted(max_by_co.keys()):
                co_max = float(max_by_co.get(co_num, 0.0))
                co_mark = float(sum_by_co.get(co_num, 0.0)) if not absent else 0.0
                pct = (co_mark / co_max) * 100.0 if co_max > 0 else None
                ModelExamCOMark.objects.create(
                    model_exam_mark=parent,
                    co_num=int(co_num),
                    mark=_to_decimal(round(co_mark, 2)),
                    percentage=_to_decimal(round(pct, 2)) if pct is not None else None,
                )

        stale_qs = ModelExamMark.objects.filter(subject=subject, **_ta_filter_kwargs(teaching_assignment))
        if seen_parent_ids:
            stale_qs = stale_qs.exclude(id__in=seen_parent_ids)
        stale_qs.delete()

    return upserted


def _normalize_marks(values: Any, exp_count: int) -> list[float]:
    if not isinstance(values, list):
        return [0.0] * max(0, exp_count)
    out: list[float] = []
    for i in range(max(0, exp_count)):
        n = _to_float(values[i]) if i < len(values) else None
        out.append(float(n) if n is not None else 0.0)
    return out


def persist_lab_exam_marks(*, subject, teaching_assignment, assessment: str, data: dict) -> int:
    if not isinstance(data, dict):
        return 0

    sheet = data.get("sheet") if isinstance(data.get("sheet"), dict) else data
    if not isinstance(sheet, dict):
        return 0

    rows = sheet.get("rowsByStudentId") if isinstance(sheet.get("rowsByStudentId"), dict) else {}
    co_configs = sheet.get("coConfigs") if isinstance(sheet.get("coConfigs"), dict) else {}
    enabled_cos = []
    for k, cfg in co_configs.items():
        try:
            n = int(k)
        except Exception:
            continue
        if isinstance(cfg, dict) and bool(cfg.get("enabled")):
            enabled_cos.append(n)
    enabled_cos = sorted(enabled_cos)

    cia_enabled = bool(sheet.get("ciaExamEnabled"))
    cia_exam_max = _to_float(sheet.get("ciaExamMax"))
    if cia_enabled and (cia_exam_max is None or cia_exam_max <= 0):
        cia_exam_max = 50.0

    seen_parent_ids = set()
    upserted = 0

    with transaction.atomic():
        for sid_key, row in rows.items():
            row = row if isinstance(row, dict) else {}
            sid = row.get("studentId", sid_key)
            try:
                sid_int = int(sid)
            except Exception:
                continue

            student = StudentProfile.objects.filter(id=sid_int).first()
            if not student:
                continue

            absent = bool(row.get("absent"))
            marks_by_co = row.get("marksByCo") if isinstance(row.get("marksByCo"), dict) else {}
            cia_by_co = row.get("ciaExamByCo") if isinstance(row.get("ciaExamByCo"), dict) else {}
            legacy_cia = _to_float(row.get("ciaExam"))
            enabled_count = max(1, len(enabled_cos))

            # Keep total_mark aligned to the entered LAB exam mark shown in the UI
            # (e.g. CIA EXAM / review exam column), not summed CO attainment marks.
            if absent:
                parent_total = None
            elif legacy_cia is not None:
                parent_total = max(0.0, legacy_cia)
            else:
                cia_parts = [
                    _to_float(v)
                    for v in (cia_by_co.values() if isinstance(cia_by_co, dict) else [])
                    if _to_float(v) is not None
                ]
                parent_total = max(0.0, float(sum(cia_parts))) if cia_parts else None

            per_co_rows = []

            for co_num in enabled_cos:
                cfg = co_configs.get(str(co_num)) if isinstance(co_configs.get(str(co_num)), dict) else {}
                exp_count = int(_to_float(cfg.get("expCount")) or 0)
                exp_max = float(_to_float(cfg.get("expMax")) or 0.0)

                arr = marks_by_co.get(str(co_num))
                if not isinstance(arr, list):
                    if co_num == 1 and isinstance(row.get("marksA"), list):
                        arr = row.get("marksA")
                    elif co_num == 2 and isinstance(row.get("marksB"), list):
                        arr = row.get("marksB")
                    else:
                        arr = []

                norm = _normalize_marks(arr, exp_count)
                exp_obt = 0.0 if absent else float(sum(_clamp(x, 0.0, exp_max) for x in norm))
                exp_total = float(max(0, exp_count)) * float(max(0.0, exp_max))

                cia_part = 0.0
                cia_max_part = 0.0
                if cia_enabled and not absent:
                    direct = _to_float(cia_by_co.get(str(co_num)))
                    if direct is not None:
                        cia_part = max(0.0, direct)
                        cia_max_part = 0.0
                    elif legacy_cia is not None:
                        cia_part = max(0.0, legacy_cia) / enabled_count
                        cia_max_part = (cia_exam_max or 0.0) / enabled_count

                has_any_value = (exp_obt > 0.0) or (cia_part > 0.0)
                co_mark = (exp_obt + cia_part) if has_any_value and not absent else None
                co_max = exp_total + cia_max_part
                pct = ((co_mark / co_max) * 100.0) if (co_mark is not None and co_max > 0) else None
                per_co_rows.append((co_num, (round(co_mark, 2) if co_mark is not None else None), None if pct is None else round(pct, 2)))

            parent, _ = LabExamMark.objects.update_or_create(
                subject=subject,
                student=student,
                teaching_assignment=teaching_assignment,
                assessment=str(assessment or "model").lower(),
                defaults={"total_mark": (_to_decimal(round(parent_total, 2)) if parent_total is not None else None)},
            )
            seen_parent_ids.add(parent.id)
            upserted += 1

            LabExamCOMark.objects.filter(lab_exam_mark=parent).delete()
            for co_num, co_mark, co_pct in per_co_rows:
                LabExamCOMark.objects.create(
                    lab_exam_mark=parent,
                    co_num=int(co_num),
                    mark=_to_decimal(co_mark),
                    percentage=_to_decimal(co_pct) if co_pct is not None else None,
                )

        stale_qs = LabExamMark.objects.filter(
            subject=subject,
            assessment=str(assessment or "model").lower(),
            **_ta_filter_kwargs(teaching_assignment),
        )
        if seen_parent_ids:
            stale_qs = stale_qs.exclude(id__in=seen_parent_ids)
        stale_qs.delete()

    return upserted
