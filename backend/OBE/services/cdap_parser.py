from __future__ import annotations

import io
import re
from typing import Any, Dict, List, Optional

from openpyxl import load_workbook


def _to_text(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


_NUMERIC_TITLE_RE = re.compile(r"^\s*\d+(?:\.0+)?\s*$")


def _as_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("true", "t", "yes", "y", "1", "x"):
            return True
        if s in ("false", "f", "no", "n", "0", ""):
            return False
    return bool(v)


def _col_letter_to_index(col: str) -> int:
    """A -> 1, Z -> 26, AA -> 27, ..."""
    col = col.strip().upper()
    n = 0
    for ch in col:
        if not ("A" <= ch <= "Z"):
            continue
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n


def parse_cdap_excel(file_obj) -> Dict[str, Any]:
    """Parse CDAP Excel file (Revised CDP sheet) into the expected payload."""
    file_bytes = file_obj.read() if hasattr(file_obj, "read") else bytes(file_obj)
    wb = load_workbook(io.BytesIO(file_bytes), data_only=True)

    if not wb.worksheets:
        return {
            "rows": [],
            "books": {"textbook": "", "reference": ""},
            "active_learning": {"grid": [], "dropdowns": [], "optionsByRow": []},
        }

    all_sheet_titles = [ws.title for ws in wb.worksheets]
    ws_cdap_candidate = wb.worksheets[6] if len(wb.worksheets) >= 7 else None
    ws_cdap = ws_cdap_candidate or wb.worksheets[0]

    col_start_base = _col_letter_to_index("A")
    col_end_base = _col_letter_to_index("AG")

    def _norm_label(v: Any) -> str:
        s = _to_text(v).lower()
        s = re.sub(r"\s+", " ", s).strip()
        return s

    def _effective_cell_text(ws, r: int, c: int) -> str:
        v = ws.cell(row=r, column=c).value
        if v not in (None, ""):
            return _norm_label(v)
        try:
            ranges = list(getattr(ws, "merged_cells", None).ranges)  # type: ignore[attr-defined]
        except Exception:
            ranges = []
        if not ranges:
            return ""
        for rng in ranges:
            try:
                if rng.min_row <= r <= rng.max_row and rng.min_col <= c <= rng.max_col:
                    tl = ws.cell(row=rng.min_row, column=rng.min_col).value
                    return _norm_label(tl)
            except Exception:
                continue
        return ""

    def _find_cdp_header_row(ws) -> Optional[int]:
        max_scan_row = min(ws.max_row or 0, 80)
        for r in range(1, max_scan_row + 1):
            for c in range(col_start_base, col_end_base + 1):
                v = _effective_cell_text(ws, r, c)
                if re.fullmatch(r"content\s*[- ]?\s*type", v or ""):
                    return r
        return None

    def _find_header_col(ws, header_row: int, label_pattern: str) -> Optional[int]:
        if not header_row:
            return None
        for c in range(col_start_base, col_end_base + 1):
            v = _effective_cell_text(ws, header_row, c)
            if re.search(label_pattern, v or ""):
                return c
        return None

    detected_header_row_2 = _find_cdp_header_row(ws_cdap)
    header_row_2 = detected_header_row_2 or 12
    header_row_1 = max(1, header_row_2 - 1)

    row_delta = header_row_2 - 12
    data_start = header_row_2 + 1
    data_end = data_start + 48
    unit_start_rows = [data_start + (i * 10) for i in range(5)]
    rows_per_unit = 9

    content_col_actual = _find_header_col(ws_cdap, header_row_2, r"content\s*[- ]?\s*type")
    expected_content_col = _col_letter_to_index("D")
    col_shift = 0
    if content_col_actual is not None:
        col_shift = content_col_actual - expected_content_col
    col_start = col_start_base + col_shift
    col_end = col_end_base + col_shift

    keys: List[str] = [
        "unit",
        "unit_name",
        "co",
        "content_type",
        "part_no",
        "topics",
        "sub_topics",
        "bt_level",
        "total_hours_required",
        *[f"po{i}" for i in range(1, 12)],
        *[f"pso{i}" for i in range(1, 4)],
        "kd_hours",
        "kd_reference",
        "kd_support",
        "kd_activity",
        "assess_ssa1",
        "assess_fa1",
        "assess_cia_qb",
        "assess_ssa2",
        "assess_fa2",
        "assess_activity",
    ]
    if len(keys) != (col_end - col_start + 1):
        return {
            "rows": [],
            "books": {"textbook": "", "reference": ""},
            "active_learning": {"grid": [], "dropdowns": [], "optionsByRow": []},
            "warnings": [{"warning": "CDAP parser misconfigured: schema/column count mismatch"}],
        }

    parsed_rows: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    checkbox_keys = {f"po{i}" for i in range(1, 12)} | {f"pso{i}" for i in range(1, 4)}

    def read_row(r: int, unit_index: int, unit_title: str) -> Dict[str, Any]:
        values: List[Any] = []
        for c in range(col_start, col_end + 1):
            values.append(ws_cdap.cell(row=r, column=c).value)
        record: Dict[str, Any] = {
            "excel_row": r,
            "unit_index": unit_index,
            "unit_title": unit_title,
        }
        for idx, k in enumerate(keys):
            v = values[idx] if idx < len(values) else None
            if k in checkbox_keys:
                record[k] = _as_bool(v)
            else:
                record[k] = "" if v is None else v
        if record.get("unit") in (None, ""):
            record["unit"] = unit_index
        if record.get("unit_name") in (None, ""):
            record["unit_name"] = unit_title
        return record

    for unit_idx, start_row in enumerate(unit_start_rows, start=1):
        if start_row < data_start or start_row > data_end:
            continue
        unit_title = _to_text(ws_cdap.cell(row=start_row, column=_col_letter_to_index("B")).value)
        if not unit_title:
            warnings.append({"unit": unit_idx, "row": start_row, "warning": "Missing unit title in column B"})

        for offset in range(rows_per_unit):
            r = start_row + offset
            if r < data_start or r > data_end:
                continue
            rec = read_row(r, unit_idx, unit_title)
            parsed_rows.append(rec)

    def best_text_in_row(r: int, col_a: str = "A", col_b: str = "E") -> str:
        start = _col_letter_to_index(col_a)
        end = _col_letter_to_index(col_b)
        candidates: List[str] = []
        for c in range(start, end + 1):
            v = _to_text(ws_cdap.cell(row=r, column=c).value)
            if not v:
                continue
            if _NUMERIC_TITLE_RE.match(v):
                continue
            low = v.strip().lower()
            if low in {"textbook", "text book", "reference", "reference book", "reference books"}:
                continue
            candidates.append(v)
        if not candidates:
            return ""
        return max(candidates, key=len)

    def best_text_near_row(target_row: int) -> str:
        v = best_text_in_row(target_row)
        if v:
            return v
        for d in range(1, 6):
            down = best_text_in_row(target_row + d)
            if down:
                return down
            up = best_text_in_row(target_row - d)
            if up:
                return up
        return ""

    textbook_text = best_text_near_row(64 + row_delta)
    reference_text = best_text_near_row(68 + row_delta)

    def split_dropdown_options(text: str) -> List[str]:
        s = _to_text(text)
        if not s:
            return []
        s = s.replace("\r\n", "\n").replace("\r", "\n")
        parts = [p.strip() for p in re.split(r"[\n,;]+", s) if p and p.strip()]
        out: List[str] = []
        seen = set()
        for p in parts:
            if p not in seen:
                out.append(p)
                seen.add(p)
        return out

    g_col = _col_letter_to_index("G")
    active_learning_dropdown_rows = list(range(64 + row_delta, 71 + row_delta))
    active_learning_dropdown_options: List[List[str]] = []
    for r in active_learning_dropdown_rows:
        cell_text = ws_cdap.cell(row=r, column=g_col).value
        active_learning_dropdown_options.append(split_dropdown_options(_to_text(cell_text)))

    return {
        "rows": parsed_rows,
        "books": {"textbook": textbook_text, "reference": reference_text},
        "active_learning": {
            "grid": [],
            "dropdowns": ["" for _ in range(7)],
            "optionsByRow": active_learning_dropdown_options,
        },
        "meta": {
            "sheet_used": ws_cdap.title,
            "sheet_index_1based": (all_sheet_titles.index(ws_cdap.title) + 1) if ws_cdap.title in all_sheet_titles else None,
        },
        "warnings": warnings,
    }
