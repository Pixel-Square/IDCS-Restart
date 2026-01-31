import base64
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from django.core.files.storage import default_storage
from django.utils.text import slugify

from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import QuestionBankTitle, QuestionBankQuestion


def _co_numbers(co_raw: Optional[str]) -> Optional[str]:
    if not co_raw:
        return None
    nums = sorted({int(x) for x in re.findall(r'\d+', co_raw)})
    if not nums:
        return None
    return ','.join(str(n) for n in nums)


def _maybe_letter_to_option(v: Optional[str], options: Optional[list]) -> Optional[str]:
    if not v:
        return v
    options_list = options if isinstance(options, list) else []

    m = re.fullmatch(r'\(?\s*([A-Da-d])\s*\)?', str(v).strip())
    if not m:
        return v

    idx = ord(m.group(1).upper()) - ord('A')
    if 0 <= idx < len(options_list):
        return str(options_list[idx])
    return m.group(1).upper()


def _save_data_url_image(data_url: str, base_path: str, index: int) -> str:
    # data:image/png;base64,....
    m = re.match(r'^data:([^;]+);base64,(.+)$', data_url)
    if not m:
        raise ValueError('Invalid data URL')

    mime = m.group(1).strip().lower()
    b64 = m.group(2)
    blob = base64.b64decode(b64)

    ext = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
    }.get(mime, 'png')

    ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')
    rel_path = os.path.join(base_path, f'{ts}_{index}.{ext}')
    saved = default_storage.save(rel_path, content=blob)
    try:
        return default_storage.url(saved)
    except Exception:
        return saved


def _normalize_images(images: Any, title_slug: str) -> Optional[List[str]]:
    if not images:
        return None

    base_path = os.path.join('question_bank', title_slug or 'untitled', datetime.utcnow().strftime('%Y%m%d'))

    out: List[str] = []
    items = images if isinstance(images, list) else [images]
    for i, item in enumerate(items):
        if item is None:
            continue

        if isinstance(item, dict):
            if item.get('url'):
                out.append(str(item['url']))
                continue
            if item.get('base64'):
                item = item['base64']

        if isinstance(item, str):
            s = item.strip()
            if s.startswith('http://') or s.startswith('https://'):
                out.append(s)
                continue
            if s.startswith('data:image/'):
                out.append(_save_data_url_image(s, base_path, i))
                continue

            # plain base64 fallback (assume png)
            if re.fullmatch(r'[A-Za-z0-9+/=]+', s) and len(s) > 128:
                out.append(_save_data_url_image(f'data:image/png;base64,{s}', base_path, i))
                continue

        # unsupported binary types in JSON

    return out or None


def _validate_and_normalize_question(q: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    qt = (q.get('question_text') or q.get('question') or q.get('text') or '').strip()
    qt = re.sub(r'\s+', ' ', qt).strip()
    if not qt:
        return None, 'question_text is required'

    options = q.get('options')
    if options is not None and not isinstance(options, list):
        return None, 'options must be an array'

    qtype = q.get('type')
    if qtype is None:
        qtype = 'objective' if options else None

    # marks / btl
    marks_raw = q.get('marks')
    btl_raw = q.get('btl')

    def to_int(v) -> Optional[int]:
        if v is None:
            return None
        if isinstance(v, int):
            return v
        s = str(v).strip()
        if not s:
            return None
        if s.upper() == '(OR)':
            return None
        if s.isdigit():
            return int(s)
        return None

    marks = to_int(marks_raw)
    btl = to_int(btl_raw)

    if btl is not None and not (1 <= btl <= 6):
        return None, 'btl must be between 1 and 6'

    if marks is not None and not (0 < marks <= 100):
        return None, 'marks must be between 1 and 100'

    co = q.get('course_outcomes')
    co = str(co).strip() if co not in (None, '') else None
    co_nums = q.get('course_outcomes_numbers')
    if not co_nums:
        co_nums = _co_numbers(co)

    answer_text = q.get('answer_text')
    answer_text = str(answer_text).strip() if answer_text is not None else ''

    correct_answer = q.get('correct_answer')
    correct_answer = _maybe_letter_to_option(str(correct_answer).strip() if correct_answer else None, options)

    normalized = {
        'question_text': qt,
        'type': qtype,
        'options': options or None,
        'correct_answer': correct_answer,
        'answer_text': answer_text,
        'btl': btl,
        'marks': marks,
        'chapter': q.get('chapter'),
        'course_outcomes': co,
        'course_outcomes_numbers': co_nums,
        'excel_type': q.get('excel_type'),
        'course_code': q.get('course_code'),
        'course_name': q.get('course_name'),
        'semester': q.get('semester'),
        'source_file_path': q.get('source_file_path'),
        'images': q.get('images'),
    }

    # objective validation
    if normalized['type'] == 'objective' and not normalized['options']:
        return None, 'objective questions must include options'

    return normalized, None


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def import_questions(request):
    body = request.data or {}
    title_id = body.get('title_id')
    title = body.get('title')
    status_in = body.get('status') or 'pending'

    exam_type = body.get('exam_type')
    exam_date_raw = body.get('exam_date')
    sections = body.get('sections')
    faculty_identifier = body.get('faculty_id') or body.get('faculty_identifier')

    if not title_id and not title:
        return Response({'detail': 'title_id or title is required'}, status=status.HTTP_400_BAD_REQUEST)

    # resolve/create title
    title_obj = None
    if title_id:
        try:
            title_obj = QuestionBankTitle.objects.get(id=int(title_id), user=request.user)
        except Exception:
            return Response({'detail': 'Invalid title_id or not owned'}, status=status.HTTP_403_FORBIDDEN)
    else:
        exam_date = None
        if exam_date_raw:
            try:
                # supports ISO date like 2026-01-30
                exam_date = datetime.fromisoformat(str(exam_date_raw)).date()
            except Exception:
                exam_date = None

        if sections is not None and not isinstance(sections, list):
            sections = None

        if faculty_identifier is None:
            # best-effort fallback to common user fields
            faculty_identifier = getattr(request.user, 'faculty_id', None) or getattr(request.user, 'staff_id', None) or getattr(request.user, 'employee_id', None)

        title_obj = QuestionBankTitle.objects.create(
            user=request.user,
            title=str(title).strip(),
            exam_type=str(exam_type).strip() if exam_type not in (None, '') else None,
            exam_date=exam_date,
            sections=sections,
            faculty_identifier=str(faculty_identifier).strip() if faculty_identifier not in (None, '') else None,
        )

    title_slug = slugify(title_obj.title) or 'untitled'

    questions = body.get('questions')
    if not isinstance(questions, list):
        return Response({'detail': 'questions must be an array'}, status=status.HTTP_400_BAD_REQUEST)

    failures: List[Dict[str, Any]] = []
    to_create: List[QuestionBankQuestion] = []

    for idx, q in enumerate(questions):
        if not isinstance(q, dict):
            failures.append({'index': idx, 'error': 'question must be an object'})
            continue

        normalized, err = _validate_and_normalize_question(q)
        if err:
            failures.append({'index': idx, 'error': err})
            continue

        image_urls = _normalize_images(normalized.get('images'), title_slug)

        to_create.append(
            QuestionBankQuestion(
                user=request.user,
                title_obj=title_obj,
                title=title_obj.title,
                question_text=normalized['question_text'],
                answer_text=normalized['answer_text'] or '',
                options=normalized['options'],
                image_urls=image_urls,
                correct_answer=normalized['correct_answer'],
                btl=normalized['btl'],
                marks=normalized['marks'],
                chapter=normalized.get('chapter'),
                course_outcomes=normalized.get('course_outcomes'),
                course_outcomes_numbers=normalized.get('course_outcomes_numbers'),
                type=normalized.get('type'),
                status=str(status_in),
                source_file_path=normalized.get('source_file_path'),
                excel_type=normalized.get('excel_type'),
                course_code=normalized.get('course_code'),
                course_name=normalized.get('course_name'),
                semester=normalized.get('semester'),
            )
        )

    if to_create:
        QuestionBankQuestion.objects.bulk_create(to_create)

    return Response({
        'inserted': len(to_create),
        'failed': failures,
    })
