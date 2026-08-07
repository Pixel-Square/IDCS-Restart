import re
from collections import defaultdict, deque


def _build_import_question_column_map(headers, question_cols, total_col=None, absent_col=None):
    """Map imported Excel columns to question keys without skipping the first question column."""

    def _norm_header(v) -> str:
        return str(v or '').strip()

    def _normalize_import_header(v) -> str:
        text = _norm_header(v)
        text = re.sub(r'\s*\([^)]*\)$', '', text).strip()
        return text.lower()

    q_title_to_keys = defaultdict(deque)
    for q in question_cols:
        title_key = _normalize_import_header(q.get('title') or q.get('question_number') or '')
        if title_key:
            q_title_to_keys[title_key].append(q.get('key') or q.get('id') or '')

    header_q_map = {}
    for c_idx, h in enumerate(headers):
        h_norm = _normalize_import_header(h)
        if h_norm in q_title_to_keys and q_title_to_keys[h_norm]:
            header_q_map[c_idx] = q_title_to_keys[h_norm].popleft()

    student_name_col = None
    for idx, h in enumerate(headers):
        if _normalize_import_header(h).lower() in ('student name', 'name'):
            student_name_col = idx
            break

    if total_col is None:
        for idx, h in enumerate(headers):
            if _normalize_import_header(h).lower() in ('total', 'marks', 'total marks', 'total mark'):
                total_col = idx
                break
    if absent_col is None:
        for idx, h in enumerate(headers):
            if _normalize_import_header(h).lower() in ('absent', 'abs', 'absent?'):
                absent_col = idx
                break

    start_col = student_name_col + 1 if student_name_col is not None else 0
    end_col = total_col if total_col is not None else absent_col if absent_col is not None else len(headers)

    if start_col < len(headers):
        candidate_cols = []
        for idx in range(start_col, end_col if end_col is not None else len(headers)):
            if idx < 0 or idx >= len(headers):
                continue
            if idx in header_q_map:
                continue
            candidate_cols.append(idx)

        for q_idx, q in enumerate(question_cols):
            if q_idx >= len(candidate_cols):
                break
            col_idx = candidate_cols[q_idx]
            if col_idx in header_q_map:
                continue
            header_q_map[col_idx] = q.get('key') or q.get('id') or ''

    return header_q_map
