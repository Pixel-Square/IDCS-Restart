import re

with open('OBE/views.py', 'r') as f:
    views_code = f.read()

def repl_find(match):
    return """def _find_cqi_page_snapshot(pages: dict, page_key: str | None, assessment_type: str | None, co_numbers: list[int]):
    if not isinstance(pages, dict) or not pages:
        return None

    if page_key and isinstance(pages.get(page_key), dict):
        return pages.get(page_key)

    # First pass: exact match for co_numbers
    for snapshot in pages.values():
        if not isinstance(snapshot, dict):
            continue
        snap_assessment = _normalize_cqi_assessment_type(snapshot.get('assessmentType', snapshot.get('assessment_type')))
        snap_co_numbers = _normalize_cqi_co_numbers(snapshot.get('coNumbers', snapshot.get('co_numbers')))
        if assessment_type and snap_assessment and snap_assessment != assessment_type:
            continue
        if co_numbers and snap_co_numbers and snap_co_numbers == co_numbers:
            return snapshot

    # Second pass: superset match for co_numbers (e.g. asking for [1,2] from legacy [1,2,3,4,5])
    for snapshot in pages.values():
        if not isinstance(snapshot, dict):
            continue
        snap_assessment = _normalize_cqi_assessment_type(snapshot.get('assessmentType', snapshot.get('assessment_type')))
        snap_co_numbers = _normalize_cqi_co_numbers(snapshot.get('coNumbers', snapshot.get('co_numbers')))
        if assessment_type and snap_assessment and snap_assessment != assessment_type:
            continue
        if co_numbers and snap_co_numbers and all(c in snap_co_numbers for c in co_numbers):
            return snapshot

    return None"""

views_code = re.sub(
    r"def _find_cqi_page_snapshot\(pages: dict, page_key: str \| None, assessment_type: str \| None, co_numbers: list\[int\]\):.*?    return None",
    repl_find,
    views_code,
    flags=re.DOTALL
)

def repl_extract(match):
    return """def _extract_cqi_page_state(raw_entries, page_key: str | None, assessment_type: str | None, co_numbers: list[int], legacy_co_numbers=None):
    merged_entries, pages = _split_cqi_entries_payload(raw_entries)
    if pages:
        snapshot = _find_cqi_page_snapshot(pages, page_key, assessment_type, co_numbers)
        if not isinstance(snapshot, dict):
            return None
        entries = snapshot.get('entries') if isinstance(snapshot.get('entries'), dict) else {}
        return {
            'entries': entries,
            'co_numbers': _normalize_cqi_co_numbers(snapshot.get('coNumbers', snapshot.get('co_numbers'))),
            'assessment_type': _normalize_cqi_assessment_type(snapshot.get('assessmentType', snapshot.get('assessment_type'))),
            'updated_at': snapshot.get('updatedAt'),
            'updated_by': snapshot.get('updatedBy'),
            'published_at': snapshot.get('publishedAt'),
            'published_by': snapshot.get('publishedBy'),
        }

    if not isinstance(raw_entries, dict):
        return None

    legacy_nums = _normalize_cqi_co_numbers(legacy_co_numbers)
    if page_key and co_numbers and legacy_nums:
        if not all(c in legacy_nums for c in co_numbers):
            return None"""

views_code = re.sub(
    r"def _extract_cqi_page_state\(raw_entries, page_key: str \| None, assessment_type: str \| None, co_numbers: list\[int\], legacy_co_numbers=None\):.*?    if page_key and co_numbers and legacy_nums and legacy_nums != co_numbers:\n        return None",
    repl_extract,
    views_code,
    flags=re.DOTALL
)

with open('OBE/views.py', 'w') as f:
    f.write(views_code)

print("Patched.")
