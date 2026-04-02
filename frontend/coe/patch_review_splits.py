import re

with open('backend/OBE/views.py', 'r') as f:
    content = f.read()

def_extract = """def _extract_review_co_splits(subject, assessment_key, co_keys, ta=None):
    co_splits = {}
    try:
        from .models import AssessmentDraft
        drafts = AssessmentDraft.objects.filter(
            subject=subject,
            assessment=assessment_key,
        ).order_by('-updated_at')
        if ta is not None:
            draft = drafts.filter(teaching_assignment=ta).first() or drafts.first()
        else:
            draft = drafts.first()
        if draft and isinstance(draft.data, dict):
            sheet = draft.data.get('sheet', draft.data)
            rows = sheet.get('rows', []) if isinstance(sheet, dict) else []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                sid = str(row.get('studentId', '')).strip()
                if not sid:
                    continue
                entry = {}
                for ck in co_keys:
                    val = None
                    reviewCoMarks = row.get('reviewCoMarks')
                    if isinstance(reviewCoMarks, dict):
                        raw_arr = reviewCoMarks.get(ck)
                        if isinstance(raw_arr, list):
                            try:
                                val = sum([float(x) for x in raw_arr if x not in ('', None)])
                            except (ValueError, TypeError):
                                pass
                    if val is None:
                        dir_val = row.get(ck)
                        if dir_val not in ('', None):
                            try:
                                val = float(dir_val)
                            except (ValueError, TypeError):
                                pass
                    if val is not None:
                        entry[ck] = val
                if entry:
                    co_splits[sid] = entry
    except Exception:
        pass
    return co_splits

def _extract_ssa_co_splits"""

content = content.replace("def _extract_ssa_co_splits", def_extract)

# Update review1_published
content = content.replace(
    "return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})\n\n@api_view(['GET'])\n",
    "co_splits = _extract_review_co_splits(subject, 'review1', ['co1', 'co2'], ta=ta)\n    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks, 'co_splits': co_splits})\n\n@api_view(['GET'])\n"
)

# Update review2_published
content = content.replace(
    "return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks})\n\n@api_view(['POST', 'GET'])\ndef model_publish",
    "co_splits = _extract_review_co_splits(subject, 'review2', ['co3', 'co4'], ta=ta)\n    return Response({'subject': {'code': subject.code, 'name': subject.name}, 'marks': marks, 'co_splits': co_splits})\n\n@api_view(['POST', 'GET'])\ndef model_publish"
)

with open('backend/OBE/views.py', 'w') as f:
    f.write(content)

