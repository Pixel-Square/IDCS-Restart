from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


def _to_text(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _parse_hours(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = _to_text(v)
    if not s:
        return 0.0
    # Extract the first number like 2 or 2.5
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return 0.0
    try:
        return float(m.group(0))
    except Exception:
        return 0.0


def _hours_times_tick(hours: float, tick: Any):
    # CDAP rows store PO/PSO as booleans; be defensive.
    is_on = False
    if isinstance(tick, bool):
        is_on = tick
    elif isinstance(tick, (int, float)):
        is_on = tick != 0
    elif isinstance(tick, str):
        is_on = tick.strip().lower() in {"1", "true", "t", "yes", "y", "x", "✓", "✔"}
    else:
        is_on = bool(tick)

    if not is_on:
        return "-"

    # Keep ints clean for UI
    if float(hours).is_integer():
        return int(hours)
    return hours


def build_articulation_matrix_from_revision_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute articulation matrix purely from saved CDAP revision rows.

    Rule: cell value = hours * tick (tick is 1 if checked else 0). Since tick is boolean,
    this becomes either '-' or the hours value.
    """

    units_out: List[Dict[str, Any]] = []

    current_unit_label: Optional[str] = None
    current_unit_index: Optional[int] = None
    current_unit_co: str = ""
    unit_rows: List[Dict[str, Any]] = []

    def flush_unit():
        nonlocal current_unit_label, current_unit_index, unit_rows, current_unit_co
        if current_unit_label is None:
            return
        units_out.append(
            {
                "unit": current_unit_label,
                "unit_index": current_unit_index,
                "rows": unit_rows,
            }
        )
        current_unit_label = None
        current_unit_index = None
        current_unit_co = ""
        unit_rows = []

    # Serial numbers should restart per unit
    serial_by_unit: Dict[int, int] = {}

    def _co_index(co_value: str) -> Optional[int]:
        m = re.search(r"\bCO\s*(\d+)\b", co_value.strip(), re.I)
        if not m:
            return None
        try:
            return int(m.group(1))
        except Exception:
            return None

    def _normalize_special_label(content_type_value: str, unit_co_value: str) -> str:
        ct = content_type_value.strip()
        co_i = _co_index(unit_co_value) or 0
        if re.search(r"\bssa\b", ct, re.I):
            # CO1-2 => SSA 1, CO3-4 => SSA 2 (fallback to SSA 1)
            return "SSA 2" if co_i in (3, 4) else "SSA 1"
        if re.search(r"active\s*learning", ct, re.I):
            return "Active Learning 2" if co_i in (3, 4) else "Active Learning 1"
        if re.search(r"special\s*activity", ct, re.I):
            return "Special activity"
        return ct

    def _special_sort_key(co_mapped_value: str) -> int:
        s = co_mapped_value.strip().lower()
        if s.startswith("ssa"):
            return 100
        if s.startswith("active learning"):
            return 110
        if s.startswith("special activity"):
            return 120
        return 0

    for r in rows or []:
        unit_idx = r.get("unit_index")
        try:
            unit_idx_int = int(unit_idx) if unit_idx is not None else 0
        except Exception:
            unit_idx_int = 0

        unit_raw = _to_text(r.get("unit"))
        unit_label = unit_raw
        if unit_label and unit_label.isdigit():
            unit_label = f"UNIT {unit_label}"
        if not unit_label and unit_idx_int:
            unit_label = f"UNIT {unit_idx_int}"

        # CO is stored only on the first row of each unit in our CDAP parser
        if _to_text(r.get("co")):
            current_unit_co = _to_text(r.get("co"))

        # Unit boundary detection
        if unit_label and (current_unit_label != unit_label):
            flush_unit()
            current_unit_label = unit_label
            current_unit_index = unit_idx_int

        if current_unit_label is None:
            # still no unit detected; keep going
            continue

        hours = _parse_hours(r.get("total_hours_required"))

        # Decide value for CO MAPPED column:
        # - topic rows: use unit index (1..N)
        # - special rows: normalize into two sets based on CO group (CO1-2 vs CO3-4)
        content_type = _to_text(r.get("content_type"))
        co_mapped: Any = unit_idx_int if unit_idx_int else current_unit_co
        if content_type:
            ct = content_type.strip()
            if re.search(r"\bssa\b", ct, re.I) or re.search(r"active\s*learning", ct, re.I) or re.search(r"special\s*activity", ct, re.I):
                co_mapped = _normalize_special_label(ct, current_unit_co)

        topic_no = _to_text(r.get("part_no"))
        topic_name = _to_text(r.get("topics")) or _to_text(r.get("sub_topics"))

        # Skip fully empty lines
        if not (_to_text(co_mapped) or topic_no or topic_name or content_type):
            continue

        serial_by_unit.setdefault(unit_idx_int, 0)
        serial_by_unit[unit_idx_int] += 1

        po_vals = [_hours_times_tick(hours, r.get(f"po{i}")) for i in range(1, 12)]
        pso_vals = [_hours_times_tick(hours, r.get(f"pso{i}")) for i in range(1, 4)]

        unit_rows.append(
            {
                "excel_row": r.get("excel_row"),
                "s_no": serial_by_unit[unit_idx_int],
                "co_mapped": co_mapped,
                "topic_no": topic_no,
                "topic_name": topic_name,
                "po": po_vals,
                "pso": pso_vals,
                "hours": int(hours) if float(hours).is_integer() else hours,
                "_sort": _special_sort_key(_to_text(co_mapped)),
            }
        )

    flush_unit()

    # Ensure special rows appear at the bottom of each unit (topics first, then SSA/AL/Special)
    for u in units_out:
        rows_list = u.get("rows") or []
        try:
            u["rows"] = sorted(rows_list, key=lambda rr: (rr.get("_sort", 0), rr.get("s_no", 0)))
        except Exception:
            u["rows"] = rows_list
        for rr in u["rows"]:
            if "_sort" in rr:
                rr.pop("_sort", None)

    return {
        "units": units_out,
        "summaries": {},
        "meta": {"source": "cdap_revision"},
    }
