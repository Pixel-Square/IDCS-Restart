import base64
import json
import logging
import os
import re
import time
from typing import Any
from urllib.parse import quote

import requests
from django.conf import settings
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key


class GoogleSheetsServiceError(Exception):
    """Raised when Google Sheets creation fails."""


def _normalise_private_key(private_key: str) -> str:
    if not private_key:
        raise GoogleSheetsServiceError('Google service account private key is required.')

    key = str(private_key).replace('\\n', '\n').strip()
    if 'BEGIN PRIVATE KEY' not in key:
        raise GoogleSheetsServiceError('The provided private key is not in PEM format.')
    return key


def _build_jwt_assertion(
    service_account_email: str,
    private_key: str,
    scopes: list[str],
    impersonated_user_email: str | None = None,
) -> str:
    private_key_text = _normalise_private_key(private_key)
    now = int(time.time())
    header = {'alg': 'RS256', 'typ': 'JWT'}
    payload = {
        'iss': service_account_email,
        'scope': ' '.join(scopes),
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': now,
        'exp': now + 3600,
    }
    if impersonated_user_email:
        payload['sub'] = impersonated_user_email

    def _b64url(data: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(data, separators=(',', ':')).encode()).decode().rstrip('=')

    encoded_header = _b64url(header)
    encoded_payload = _b64url(payload)
    signing_input = f'{encoded_header}.{encoded_payload}'.encode()
    private_key_obj = load_pem_private_key(private_key_text.encode(), password=None)
    signature = private_key_obj.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip('=')
    return f'{encoded_header}.{encoded_payload}.{encoded_signature}'


def _get_access_token(
    service_account_email: str,
    private_key: str,
    impersonated_user_email: str | None = None,
) -> str:
    assertion = _build_jwt_assertion(
        service_account_email,
        private_key,
        [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/script.projects',
        ],
        impersonated_user_email=impersonated_user_email,
    )
    response = requests.post(
        'https://oauth2.googleapis.com/token',
        data={
            'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion': assertion,
        },
        timeout=30,
    )
    if not response.ok:
        raise GoogleSheetsServiceError(f'Unable to authenticate with Google: {response.text}')

    payload = response.json()
    token = payload.get('access_token')
    if not token:
        raise GoogleSheetsServiceError('Google token response did not include an access token.')
    return token


def _sanitize_sheet_name(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:\[\]]', '', str(name or 'Sheet')).strip() or 'Sheet'
    return cleaned[:31]


def _extract_drive_error_reason(error_payload: dict[str, Any]) -> tuple[str | None, str | None]:
    if not isinstance(error_payload, dict):
        return None, None

    error_body = error_payload.get('error') or error_payload
    if not isinstance(error_body, dict):
        return None, None

    message = error_body.get('message') or error_body.get('error_description')
    reason = None
    errors = error_body.get('errors')
    if isinstance(errors, list) and errors:
        first = errors[0]
        if isinstance(first, dict):
            reason = first.get('reason')
    return reason, message


def _handle_drive_create_failure(response: requests.Response, impersonated_user_email: str | None) -> None:
    try:
        error_payload = response.json()
    except ValueError:
        # If we can't parse JSON, avoid returning the raw response body to the client.
        text = (response.text or '').strip()
        if 'storageQuotaExceeded' in text:
            if impersonated_user_email:
                raise GoogleSheetsServiceError(
                    "Google Drive create failed: the impersonated user's Drive storage quota has been exceeded. "
                    'Ensure the impersonated user has available Drive quota, or use a shared Drive folder that the service account can write to.'
                )
            raise GoogleSheetsServiceError(
                "Google Drive create failed: the service account's Drive storage quota has been exceeded. "
                'To avoid this, use a shared Drive folder owned by a user with available storage or configure a valid impersonatedUserEmail with domain delegation.'
            )
        raise GoogleSheetsServiceError('Google Drive create failed: Unknown non-JSON response from Google Drive API.')

    reason, message = _extract_drive_error_reason(error_payload)

    # Primary handling for storage quota exceeded errors
    if reason == 'storageQuotaExceeded' or 'storageQuotaExceeded' in json.dumps(error_payload or {}):
        if impersonated_user_email:
            raise GoogleSheetsServiceError(
                'Google Drive create failed: the impersonated user\'s Drive storage quota has been exceeded. '
                'Ensure the impersonated user has available Drive quota, or use a shared Drive folder that the service account can write to.'
            )
        raise GoogleSheetsServiceError(
            'Google Drive create failed: the service account\'s Drive storage quota has been exceeded. '
            'To avoid this, use a shared Drive folder owned by a user with available storage or configure a valid impersonatedUserEmail with domain delegation.'
        )

    # Fall back to a concise message if available; avoid returning raw JSON blobs.
    if message:
        raise GoogleSheetsServiceError(f'Google Drive create failed: {message}')

    raise GoogleSheetsServiceError('Google Drive create failed: unknown error from Google Drive API.')


def _load_service_account_credentials(config: dict[str, Any]) -> tuple[str | None, str | None]:
    service_account_email = str(config.get('serviceAccountEmail') or '').strip()
    private_key = str(config.get('privateKey') or '').strip()

    if service_account_email and private_key:
        return service_account_email, private_key

    candidate_email = (
        service_account_email
        or getattr(settings, 'GOOGLE_SERVICE_ACCOUNT_EMAIL', None)
        or getattr(settings, 'GOOGLE_OAUTH_CLIENT_EMAIL', None)
        or getattr(settings, 'GOOGLE_CLIENT_EMAIL', None)
        or os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '').strip()
        or os.environ.get('GOOGLE_OAUTH_CLIENT_EMAIL', '').strip()
        or os.environ.get('GOOGLE_CLIENT_EMAIL', '').strip()
    )
    candidate_private_key = (
        private_key
        or getattr(settings, 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', None)
        or getattr(settings, 'GOOGLE_OAUTH_PRIVATE_KEY', None)
        or getattr(settings, 'GOOGLE_PRIVATE_KEY', None)
        or os.environ.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', '').strip()
        or os.environ.get('GOOGLE_OAUTH_PRIVATE_KEY', '').strip()
        or os.environ.get('GOOGLE_PRIVATE_KEY', '').strip()
    )

    if candidate_email and candidate_private_key:
        return candidate_email, candidate_private_key

    for env_name in ('GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_OAUTH_SERVICE_ACCOUNT_JSON', 'GOOGLE_APPLICATION_CREDENTIALS'):
        credentials_path = os.environ.get(env_name, '').strip()
        if not credentials_path:
            continue
        try:
            with open(credentials_path, 'r', encoding='utf-8') as handle:
                credentials_payload = json.load(handle)
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            continue

        parsed_email = str(credentials_payload.get('client_email') or credentials_payload.get('service_account_email') or '').strip()
        parsed_private_key = str(credentials_payload.get('private_key') or '').strip()
        if parsed_email and parsed_private_key:
            return parsed_email, parsed_private_key

    return candidate_email or None, candidate_private_key or None


def _get_db_oauth_headers() -> dict[str, str] | None:
    from .models import AcV2GoogleSheetsOAuthCredential

    credential = AcV2GoogleSheetsOAuthCredential.objects.filter(is_active=True).order_by('-updated_at').first()
    if not credential:
        return None

    token_uri = credential.token_uri or getattr(settings, 'GOOGLE_OAUTH_TOKEN_URI', None) or os.environ.get('GOOGLE_OAUTH_TOKEN_URI', 'https://oauth2.googleapis.com/token')
    client_id = credential.client_id or getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', None) or os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
    client_secret = credential.client_secret or getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', None) or os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '')
    scopes = credential.scopes or ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']

    creds = Credentials(
        token=credential.access_token or '',
        refresh_token=credential.refresh_token or '',
        token_uri=token_uri,
        client_id=client_id,
        client_secret=client_secret,
        scopes=scopes,
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        credential.access_token = creds.token or credential.access_token or ''
        credential.refresh_token = creds.refresh_token or credential.refresh_token or ''
        credential.save(update_fields=['access_token', 'refresh_token', 'updated_at'])

    if not creds.token:
        return None
    return {'Authorization': f'Bearer {creds.token}', 'Accept': 'application/json'}


def _write_sheet_values(
    *,
    spreadsheet_id: str,
    sheet_name: str,
    rows: list[list[Any]],
    headers: dict[str, str],
) -> None:
    encoded_sheet_name = quote(sheet_name, safe='')
    response = requests.put(
        f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{encoded_sheet_name}!A1',
        params={'valueInputOption': 'USER_ENTERED'},
        headers={**headers, 'Content-Type': 'application/json'},
        json={'values': rows},
        timeout=30,
    )
    if not response.ok:
        raise GoogleSheetsServiceError(f'Google Sheets write failed for {sheet_name}: {response.text}')


def _read_sheet_values(
    *,
    spreadsheet_id: str,
    sheet_name: str,
    headers: dict[str, str],
) -> list[list[Any]]:
    encoded_sheet_name = quote(sheet_name, safe='')
    response = requests.get(
        f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{encoded_sheet_name}!A1:Z1000',
        headers={**headers, 'Accept': 'application/json'},
        timeout=30,
    )
    if not response.ok:
        raise GoogleSheetsServiceError(f'Google Sheets read failed for {sheet_name}: {response.text}')

    payload = response.json() or {}
    return payload.get('values') or []


def _column_label_to_index(label: str | None) -> int | None:
    """Convert spreadsheet column label (A, B, AA) to zero-based index."""
    text = str(label or '').strip().upper()
    if not text or not re.fullmatch(r'[A-Z]+', text):
        return None

    index = 0
    for ch in text:
        index = index * 26 + (ord(ch) - ord('A') + 1)
    return index - 1


def _safe_row_value(row: list[Any], index: int | None) -> Any:
    if index is None or index < 0 or index >= len(row):
        return None
    return row[index]


def _get_qp_specs_for_exam(exam_assignment) -> list[dict[str, Any]]:
    pattern = getattr(exam_assignment, 'qp_pattern', None) or {}
    if not isinstance(pattern, dict):
        return []

    questions: list[dict[str, Any]] = []
    titles = pattern.get('titles') or []
    marks_list = pattern.get('marks') or []
    cos = pattern.get('cos') or []
    btls = pattern.get('btls') or []
    enabled = pattern.get('enabled') or []

    for i in range(len(titles)):
        if i < len(enabled) and not enabled[i]:
            continue
        questions.append({
            'id': f'q{i + 1}',
            'title': titles[i] if i < len(titles) else str(i + 1),
            'max_marks': marks_list[i] if i < len(marks_list) else 0,
            'co': cos[i] if i < len(cos) else 0,
            'btl': btls[i] if i < len(btls) else None,
        })
    return questions


def _build_sheet_rows_for_exam(exam_assignment) -> list[list[Any]]:
    questions = _get_qp_specs_for_exam(exam_assignment)
    headers_row = ['ROLL NO', 'NAME']
    for q in questions:
        header_text = q['title']
        details = []
        if q.get('max_marks'):
            details.append(f"MAX: {q['max_marks']}")
        if q.get('co'):
            details.append(f"CO{q['co']}")
        if q.get('btl'):
            details.append(f"{q['btl']}")
        if details:
            header_text += f" ({', '.join(details)})"
        headers_row.append(header_text)
    headers_row.extend(['TOTAL', 'ABSENT'])

    rows = [headers_row]

    from academics.models import StudentSectionAssignment
    from .models import AcV2StudentMark

    student_assignments = (
        StudentSectionAssignment.objects
        .filter(section=exam_assignment.section.teaching_assignment.section, end_date__isnull=True)
        .select_related('student__user')
        .order_by('student__reg_no')
    )

    existing_marks = {
        str(sm.student_id): sm
        for sm in AcV2StudentMark.objects.filter(exam_assignment=exam_assignment)
    }

    for sa in student_assignments:
        sp = sa.student
        sm = existing_marks.get(str(sp.id))
        mark_val = None
        question_marks = {}
        is_absent_val = False
        if sm:
            mark_val = float(sm.total_mark) if sm.total_mark is not None else None
            question_marks = sm.question_marks if isinstance(sm.question_marks, dict) else {}
            is_absent_val = bool(sm.is_absent)

        row = [sp.reg_no or '', str(sp.user) if sp.user else sp.reg_no or '']
        for q in questions:
            q_id = q['id']
            value = question_marks.get(q_id)
            if value is None:
                try:
                    idx = q_id.replace('q', '')
                    value = question_marks.get(idx)
                except Exception:
                    value = None
            row.append(float(value) if value is not None else '')
        row.append(mark_val if mark_val is not None else '')
        row.append('Yes' if is_absent_val else 'No')
        rows.append(row)

    return rows


def sync_marks_to_google_sheet(
    *,
    exam_assignment,
    spreadsheet_id: str,
    config: dict[str, Any],
    sheet_name: str | None = None,
) -> dict[str, Any]:
    from academics.models import StudentProfile

    rows = _build_sheet_rows_for_exam(exam_assignment)
    sheet_title = sheet_name or (exam_assignment.exam_display_name or exam_assignment.exam or 'Marks')
    headers = _build_google_auth_headers(config)
    _write_sheet_values(
        spreadsheet_id=spreadsheet_id,
        sheet_name=sheet_title,
        rows=rows,
        headers=headers,
    )
    return {'spreadsheetId': spreadsheet_id, 'sheetName': sheet_title, 'updatedRows': len(rows) - 1}


def sync_google_sheet_to_backend(
    *,
    exam_assignment,
    spreadsheet_id: str,
    config: dict[str, Any],
    sheet_name: str | None = None,
    column_mapping: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from academics.models import StudentProfile
    from .models import AcV2StudentMark

    sheet_title = sheet_name or (exam_assignment.exam_display_name or exam_assignment.exam or 'Marks')
    headers = _build_google_auth_headers(config)
    values = _read_sheet_values(
        spreadsheet_id=spreadsheet_id,
        sheet_name=sheet_title,
        headers=headers,
    )
    if not values:
        return {'spreadsheetId': spreadsheet_id, 'sheetName': sheet_title, 'updatedRows': 0}

    questions = _get_qp_specs_for_exam(exam_assignment)
    if not questions:
        return {'spreadsheetId': spreadsheet_id, 'sheetName': sheet_title, 'updatedRows': 0}

    reg_column_index = _column_label_to_index((column_mapping or {}).get('regNoColumn') or (column_mapping or {}).get('reg_no_column') or 'A')
    name_column_index = _column_label_to_index((column_mapping or {}).get('nameColumn') or (column_mapping or {}).get('name_column') or 'B')
    raw_question_columns = (column_mapping or {}).get('questionColumns') or (column_mapping or {}).get('question_columns') or {}

    title_to_column_index: dict[str, int] = {}
    if isinstance(raw_question_columns, dict):
        for title, column_label in raw_question_columns.items():
            column_index = _column_label_to_index(str(column_label or ''))
            if column_index is None:
                continue
            normalized_title = str(title or '').strip().lower()
            if normalized_title:
                title_to_column_index[normalized_title] = column_index

    updated_count = 0
    for row in values[1:]:
        if not row:
            continue
        reg_no = str(_safe_row_value(row, reg_column_index) or '').strip()
        student_name = str(_safe_row_value(row, name_column_index) or '').strip()
        if not reg_no:
            continue

        student = StudentProfile.objects.filter(reg_no__iexact=reg_no).first()
        if not student:
            continue

        question_marks = {}
        for index, question in enumerate(questions):
            question_title_key = str(question.get('title') or '').strip().lower()
            mapped_col_index = title_to_column_index.get(question_title_key)
            col_index = mapped_col_index if mapped_col_index is not None else (index + 2)
            raw_value = _safe_row_value(row, col_index)
            if raw_value in ('', None):
                continue
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            question_marks[question['id']] = value

        total_value = None

        absent_value = False

        mark_obj, _ = AcV2StudentMark.objects.update_or_create(
            exam_assignment=exam_assignment,
            student=student,
            defaults={
                'reg_no': reg_no,
                'student_name': student_name or student.student_name or student.user.get_full_name() if getattr(student, 'user', None) else '',
                'question_marks': question_marks,
                'total_mark': total_value,
                'is_absent': absent_value,
                'is_exempted': False,
            },
        )
        qp_pattern = exam_assignment.get_qp_pattern()
        mark_obj.calculate_co_marks(qp_pattern)
        mark_obj.calculate_total()
        mark_obj.save(update_fields=['reg_no', 'student_name', 'question_marks', 'total_mark', 'is_absent', 'is_exempted', 'co1_mark', 'co2_mark', 'co3_mark', 'co4_mark', 'co5_mark', 'co6_mark'])
        updated_count += 1

    return {'spreadsheetId': spreadsheet_id, 'sheetName': sheet_title, 'updatedRows': updated_count}


def _build_google_auth_headers(config: dict[str, Any]) -> dict[str, str]:
    service_account_email, private_key = _load_service_account_credentials(config)
    service_account_email = str(service_account_email or '').strip()
    private_key = str(private_key or '').strip()
    impersonated_user_email = str(config.get('impersonatedUserEmail') or '').strip() or None
    if impersonated_user_email and 'gserviceaccount.com' in impersonated_user_email.lower():
        impersonated_user_email = None

    headers = _get_db_oauth_headers()
    if headers is None:
        access_token = _get_access_token(service_account_email, private_key, impersonated_user_email)
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
        }
    return headers


def create_google_spreadsheet(
    *,
    title: str,
    assignments: list[str],
    config: dict[str, Any],
    folder_id: str | None = None,
    course_code: str | None = None,
    webhook_url: str | None = None,
    sheet_data: dict[str, list[list[Any]]] | None = None,
) -> dict[str, Any]:
    service_account_email, private_key = _load_service_account_credentials(config)
    service_account_email = str(service_account_email or '').strip()
    private_key = str(private_key or '').strip()
    sharing_domain = str(config.get('sharingDomain') or '').strip()
    impersonated_user_email = str(config.get('impersonatedUserEmail') or '').strip() or None
    if impersonated_user_email and 'gserviceaccount.com' in impersonated_user_email.lower():
        impersonated_user_email = None
    folder_id = str(folder_id or '').strip() or None

    if not folder_id:
        raise GoogleSheetsServiceError(
            'Google Drive folder ID is required to create the spreadsheet directly inside the shared folder. '
            'This prevents service account storage quota errors by charging the file to the folder owner.'
        )

    logger = logging.getLogger('academic_v2.google_sheets')

    headers = _build_google_auth_headers(config)
    if not service_account_email:
        service_account_email = str(config.get('serviceAccountEmail') or '').strip()
    if not private_key:
        private_key = str(config.get('privateKey') or '').strip()
    if not service_account_email and not private_key and _get_db_oauth_headers() is None:
        raise GoogleSheetsServiceError(
            'Google service account email is required unless OAuth credentials have been authorized in the UI. '
            'Set GOOGLE_SERVICE_ACCOUNT_EMAIL or provide a service-account JSON file via GOOGLE_APPLICATION_CREDENTIALS.'
        )
    if not private_key and _get_db_oauth_headers() is None:
        raise GoogleSheetsServiceError(
            'Google service account private key is required unless OAuth credentials have been authorized in the UI. '
            'Set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY or provide a service-account JSON file via GOOGLE_APPLICATION_CREDENTIALS.'
        )

    body: dict[str, Any] = {
        'name': title,
        'mimeType': 'application/vnd.google-apps.spreadsheet',
        'parents': [folder_id],
    }

    create_file_resp = requests.post(
        'https://www.googleapis.com/drive/v3/files',
        params={'supportsAllDrives': 'true', 'fields': 'id,webViewLink'},
        headers={**headers, 'Content-Type': 'application/json'},
        json=body,
        timeout=30,
    )

    # If the first attempt failed due to storage quota, and there's an explicit
    # impersonation email in config, attempt a single retry using that
    # impersonation. This helps when the service account itself has exceeded
    # its Drive quota but a domain user has available storage.
    if not create_file_resp.ok:
        try:
            err_json = create_file_resp.json()
        except Exception:
            err_json = None
        reason, _ = _extract_drive_error_reason(err_json)
        logger.warning('Drive create failed on first attempt', extra={'reason': reason, 'status_code': create_file_resp.status_code})

        if reason == 'storageQuotaExceeded' and impersonated_user_email:
            logger.info('Retrying Drive create using impersonation for %s', impersonated_user_email)
            # Build a fresh token explicitly with impersonation and retry once.
            access_token_imp = _get_access_token(service_account_email, private_key, impersonated_user_email)
            headers_imp = {
                'Authorization': f'Bearer {access_token_imp}',
                'Accept': 'application/json',
            }
            retry_resp = requests.post(
                'https://www.googleapis.com/drive/v3/files',
                params={'supportsAllDrives': 'true', 'fields': 'id,webViewLink'},
                headers={**headers_imp, 'Content-Type': 'application/json'},
                json=body,
                timeout=30,
            )
            if retry_resp.ok:
                create_file_resp = retry_resp
            else:
                try:
                    logger.error('Drive create retry failed: %s', retry_resp.json())
                except Exception:
                    logger.error('Drive create retry failed: %s', retry_resp.text)
                _handle_drive_create_failure(retry_resp, impersonated_user_email)
        else:
            _handle_drive_create_failure(create_file_resp, impersonated_user_email)

    created_file = create_file_resp.json()
    spreadsheet_id = created_file.get('id') or created_file.get('spreadsheetId')
    if not spreadsheet_id:
        raise GoogleSheetsServiceError('Google Drive did not return a spreadsheet ID.')

    sheet_names = [_sanitize_sheet_name(name) for name in assignments or ['Marks']]
    sheet_requests = []
    for sheet_name in sheet_names:
        sheet_requests.append({'addSheet': {'properties': {'title': sheet_name}}})

    config_sheet_title = '__ERP_CONFIG__'
    sheet_requests.append({'addSheet': {'properties': {'title': config_sheet_title}}})

    sheets_resp = requests.post(
        f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}:batchUpdate',
        headers={**headers, 'Content-Type': 'application/json'},
        json={'requests': sheet_requests},
        timeout=30,
    )
    if not sheets_resp.ok:
        raise GoogleSheetsServiceError(f'Google Sheets tab creation failed: {sheets_resp.text}')

    batch_payload = sheets_resp.json() or {}
    replies = batch_payload.get('replies', [])
    sheet_ids_by_title: dict[str, int] = {}
    for index, reply in enumerate(replies):
        add_sheet_reply = reply.get('addSheet') or {}
        properties = add_sheet_reply.get('properties') or {}
        sheet_id = properties.get('sheetId')
        if sheet_id is None:
            continue
        sheet_title = sheet_requests[index]['addSheet']['properties']['title']
        sheet_ids_by_title[sheet_title] = sheet_id

    for sheet_title, rows in (sheet_data or {}).items():
        if not rows:
            continue
        try:
            _write_sheet_values(
                spreadsheet_id=spreadsheet_id,
                sheet_name=sheet_title,
                rows=rows,
                headers=headers,
            )
        except GoogleSheetsServiceError:
            raise

    config_sheet_id = sheet_ids_by_title.get(config_sheet_title)
    if config_sheet_id is not None:
        config_row_values = [
            {'values': [{'userEnteredValue': {'stringValue': 'Course_ID'}}, {'userEnteredValue': {'stringValue': str(course_code or '').strip() or ''}}]},
            {'values': [{'userEnteredValue': {'stringValue': 'Webhook_URL'}}, {'userEnteredValue': {'stringValue': str(webhook_url or '').strip() or 'https://your-idcs-api.krct.ac.in/api/marks/sync'}}]},
        ]
        config_setup_resp = requests.post(
            f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}:batchUpdate',
            headers={**headers, 'Content-Type': 'application/json'},
            json={
                'requests': [
                    {
                        'updateSheetProperties': {
                            'properties': {'sheetId': config_sheet_id, 'hidden': True},
                            'fields': 'hidden',
                        }
                    },
                    {
                        'updateCells': {
                            'range': {
                                'sheetId': config_sheet_id,
                                'startRowIndex': 0,
                                'endRowIndex': 2,
                                'startColumnIndex': 0,
                                'endColumnIndex': 2,
                            },
                            'rows': config_row_values,
                            'fields': 'userEnteredValue',
                            'valueInputOption': 'USER_ENTERED',
                        }
                    },
                ]
            },
            timeout=30,
        )
        if not config_setup_resp.ok:
            raise GoogleSheetsServiceError(f'Google Sheets config sheet setup failed: {config_setup_resp.text}')

    if sharing_domain:
        share_resp = requests.post(
            f'https://www.googleapis.com/drive/v3/files/{spreadsheet_id}/permissions',
            params={'supportsAllDrives': 'true'},
            headers={**headers, 'Content-Type': 'application/json'},
            json={
                'type': 'domain',
                'domain': sharing_domain,
                'role': 'writer',
            },
            timeout=30,
        )
        if not share_resp.ok:
            raise GoogleSheetsServiceError(f'Google Drive share failed: {share_resp.text}')

    return {
        'spreadsheetId': spreadsheet_id,
        'sheetUrl': f'https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit',
        'title': title,
    }


def _build_apps_script_source(
    *,
    backend_url: str,
    section_id: str,
    exam_configs: list[dict[str, Any]],
) -> str:
    """Build the Google Apps Script source code (.gs) tailored to this section's exam assignments.

    The generated script:
    - Reads each exam assignment's sheet tab (from CONFIG)
    - Finds student rows by register number (column A by default, or configured)
    - POSTs the full section data to our backend webhook on edit + hourly trigger
    """
    configs_json = json.dumps(exam_configs, separators=(',', ':'))

    return f"""
// ============================================================
// AUTO-GENERATED BY IDCS ERP — DO NOT EDIT MANUALLY
// Section ID: {section_id}
// ============================================================

var BACKEND_URL = "{backend_url}";
var SECTION_ID = "{section_id}";
var EXAM_CONFIGS = {configs_json};

// ---------- Triggers ----------

function setupTriggers() {{
  // Remove all existing triggers first to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {{
    ScriptApp.deleteTrigger(triggers[i]);
  }}
  // On every edit, push data
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  // Also push every hour automatically
  ScriptApp.newTrigger('pushAllData').timeBased().everyHours(1).create();
}}

function onSheetEdit(e) {{
  var sheet = e ? e.range.getSheet() : null;
  if (!sheet) return;
  var sheetName = sheet.getName();
  // Find matching exam config
  for (var i = 0; i < EXAM_CONFIGS.length; i++) {{
    var cfg = EXAM_CONFIGS[i];
    if ((cfg.sheetTab || cfg.examId) === sheetName) {{
      pushExamData(cfg);
      break;
    }}
  }}
}}

function pushAllData() {{
  for (var i = 0; i < EXAM_CONFIGS.length; i++) {{
    pushExamData(EXAM_CONFIGS[i]);
  }}
}}

// ---------- Core push ----------

function pushExamData(cfg) {{
  var ss = SpreadsheetApp.getActive();
  var tabName = cfg.sheetTab || cfg.examId || '';
  if (!tabName) return;

  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return;

  var allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headerRow = allValues[0];

  // Determine register column (0-based index from column letter, default A=0)
  var regColIdx = letterToIndex(cfg.regNoColumn || 'A');
  var nameColIdx = letterToIndex(cfg.nameColumn || 'B');

  // Build question column map: question title -> 0-based index
  var questionCols = cfg.questionColumns || {{}};

  var rows = [];
  for (var r = 1; r < allValues.length; r++) {{
    var row = allValues[r];
    var regNo = String(row[regColIdx] || '').trim();
    if (!regNo) continue;

    var studentName = nameColIdx >= 0 && nameColIdx < row.length ? String(row[nameColIdx] || '').trim() : '';
    var marks = {{}};

    for (var qKey in questionCols) {{
      var colLetter = questionCols[qKey];
      var colIdx = letterToIndex(colLetter);
      if (colIdx >= 0 && colIdx < row.length) {{
        var val = row[colIdx];
        if (val !== '' && val !== null && val !== undefined) {{
          marks[qKey] = val;
        }}
      }}
    }}

    rows.push({{ regNo: regNo, name: studentName, marks: marks }});
  }}

  if (rows.length === 0) return;

  var payload = {{
    sectionId: SECTION_ID,
    examAssignmentId: cfg.examId,
    sheetTab: tabName,
    rows: rows
  }};

  try {{
    UrlFetchApp.fetch(BACKEND_URL + '/api/academic-v2/google-sheets/webhook/', {{
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }});
  }} catch (err) {{
    Logger.log('IDCS push error: ' + err.toString());
  }}
}}

// ---------- Helpers ----------

function letterToIndex(letter) {{
  if (!letter) return 0;
  letter = String(letter).trim().toUpperCase();
  var idx = 0;
  for (var i = 0; i < letter.length; i++) {{
    idx = idx * 26 + (letter.charCodeAt(i) - 64);
  }}
  return idx - 1;
}}
"""


def inject_apps_script_to_sheet(
    *,
    spreadsheet_id: str,
    section_id: str,
    exam_configs: list[dict[str, Any]],
    backend_url: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Create (or update) a Google Apps Script project bound to the given spreadsheet.

    IMPORTANT: The Apps Script REST API only accepts user OAuth 2.0 tokens —
    service account JWT tokens are rejected with 401 UNAUTHENTICATED.
    The admin MUST authorize Google via the Connect tab first.

    Returns a dict with 'scriptId' and 'success'.
    """
    # Apps Script API requires a user OAuth token — service account JWT won't work.
    oauth_headers = _get_db_oauth_headers()
    if oauth_headers is None:
        raise GoogleSheetsServiceError(
            'Google Apps Script injection requires a Google account authorization. '
            'Go to the Connect tab and click "Authorize Google" to grant access, then retry.'
        )

    # Verify the token has the script.projects scope.
    from .models import AcV2GoogleSheetsOAuthCredential
    credential = AcV2GoogleSheetsOAuthCredential.objects.filter(is_active=True).order_by('-updated_at').first()
    stored_scopes = credential.scopes if credential else []
    has_script_scope = any('script.projects' in str(s) for s in (stored_scopes or []))
    if not has_script_scope:
        raise GoogleSheetsServiceError(
            'The saved Google authorization does not include the Apps Script scope. '
            'Go to the Connect tab and click "Re-authorize Google" to grant the updated permissions, then retry.'
        )

    headers = oauth_headers
    script_source = _build_apps_script_source(
        backend_url=backend_url,
        section_id=section_id,
        exam_configs=exam_configs,
    )

    # Step 1: Create a new Apps Script project bound to the spreadsheet
    create_resp = requests.post(
        'https://script.googleapis.com/v1/projects',
        headers={**headers, 'Content-Type': 'application/json'},
        json={
            'title': f'IDCS Marks Sync – {section_id}',
            'parentId': spreadsheet_id,
        },
        timeout=30,
    )

    if not create_resp.ok:
        raise GoogleSheetsServiceError(
            f'Apps Script project creation failed ({create_resp.status_code}): {create_resp.text}'
        )

    script_id = create_resp.json().get('scriptId') or ''
    if not script_id:
        raise GoogleSheetsServiceError('Apps Script API did not return a scriptId.')

    # Step 2: Upload the script content
    update_resp = requests.put(
        f'https://script.googleapis.com/v1/projects/{script_id}/content',
        headers={**headers, 'Content-Type': 'application/json'},
        json={
            'files': [
                {
                    'name': 'Code',
                    'type': 'SERVER_JS',
                    'source': script_source,
                },
                {
                    'name': 'appsscript',
                    'type': 'JSON',
                    'source': json.dumps({
                        'timeZone': 'Asia/Kolkata',
                        'dependencies': {},
                        'exceptionLogging': 'STACKDRIVER',
                        'runtimeVersion': 'V8',
                        'oauthScopes': [
                            'https://www.googleapis.com/auth/spreadsheets',
                            'https://www.googleapis.com/auth/script.external_request',
                            'https://www.googleapis.com/auth/script.scriptapp',
                        ],
                    }),
                },
            ]
        },
        timeout=30,
    )

    if not update_resp.ok:
        raise GoogleSheetsServiceError(
            f'Apps Script content upload failed ({update_resp.status_code}): {update_resp.text}'
        )

    return {
        'scriptId': script_id,
        'success': True,
        'message': (
            'Apps Script injected successfully. Open the spreadsheet → Extensions → '
            'Apps Script → Run setupTriggers() once to activate automatic sync.'
        ),
    }

