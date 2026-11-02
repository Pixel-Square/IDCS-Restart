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
    import google.auth.exceptions

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

    if credential.refresh_token:
        try:
            creds.refresh(Request())
            credential.access_token = creds.token or credential.access_token or ''
            credential.refresh_token = creds.refresh_token or credential.refresh_token or ''
            credential.save(update_fields=['access_token', 'refresh_token', 'updated_at'])
        except google.auth.exceptions.RefreshError:
            credential.is_active = False
            credential.save(update_fields=['is_active'])
            return None
        except Exception:
            pass

    if not creds.token:
        return None
    return {'Authorization': f'Bearer {creds.token}', 'Accept': 'application/json'}


_SHEET_META_CACHE: dict[str, tuple[float, list[str]]] = {}
_SHEET_VALUES_CACHE: dict[str, tuple[float, tuple[list[list[Any]], str, list[str]]]] = {}


def _get_cached_meta(spreadsheet_id: str) -> list[str] | None:
    now = time.time()
    entry = _SHEET_META_CACHE.get(spreadsheet_id)
    if entry and entry[0] > now:
        return entry[1]
    return None


def _set_cached_meta(spreadsheet_id: str, titles: list[str], ttl: float = 300.0) -> None:
    _SHEET_META_CACHE[spreadsheet_id] = (time.time() + ttl, titles)


def _get_cached_sheet_values(spreadsheet_id: str, sheet_name: str) -> tuple[list[list[Any]], str, list[str]] | None:
    key = f"{spreadsheet_id}::{str(sheet_name or '').strip().lower()}"
    now = time.time()
    entry = _SHEET_VALUES_CACHE.get(key)
    if entry and entry[0] > now:
        return entry[1]
    return None


def _set_cached_sheet_values(
    spreadsheet_id: str,
    sheet_name: str,
    data: tuple[list[list[Any]], str, list[str]],
    ttl: float = 30.0,
) -> None:
    key = f"{spreadsheet_id}::{str(sheet_name or '').strip().lower()}"
    _SHEET_VALUES_CACHE[key] = (time.time() + ttl, data)
    if data[1]:
        res_key = f"{spreadsheet_id}::{str(data[1]).strip().lower()}"
        _SHEET_VALUES_CACHE[res_key] = (time.time() + ttl, data)


def _clear_sheet_cache(spreadsheet_id: str) -> None:
    _SHEET_META_CACHE.pop(spreadsheet_id, None)
    prefix = f"{spreadsheet_id}::"
    keys_to_del = [k for k in _SHEET_VALUES_CACHE if k.startswith(prefix)]
    for k in keys_to_del:
        _SHEET_VALUES_CACHE.pop(k, None)


def _google_api_request_with_retry(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    json_data: Any = None,
    timeout: int = 30,
    max_retries: int = 3,
) -> requests.Response:
    """Execute Google API request with automatic exponential backoff retry for HTTP 429 / 503."""
    last_resp: requests.Response | None = None
    for attempt in range(max_retries + 1):
        try:
            if method.upper() == 'GET':
                resp = requests.get(url, headers=headers, params=params, timeout=timeout)
            elif method.upper() == 'PUT':
                resp = requests.put(url, headers=headers, params=params, json=json_data, timeout=timeout)
            elif method.upper() == 'POST':
                resp = requests.post(url, headers=headers, params=params, json=json_data, timeout=timeout)
            else:
                resp = requests.request(method, url, headers=headers, params=params, json=json_data, timeout=timeout)

            last_resp = resp
            if resp.status_code == 429 or resp.status_code in (500, 502, 503, 504):
                if attempt < max_retries:
                    retry_after = resp.headers.get('Retry-After')
                    if retry_after and retry_after.isdigit():
                        sleep_s = min(float(retry_after), 15.0)
                    else:
                        sleep_s = (2.0 ** attempt) + (0.2 * (attempt + 1))
                    logging.warning(
                        f"Google Sheets API rate limited (status {resp.status_code}) on {url}. Retrying in {sleep_s:.1f}s (attempt {attempt + 1}/{max_retries})..."
                    )
                    time.sleep(sleep_s)
                    continue
            return resp
        except (requests.exceptions.RequestException, requests.exceptions.Timeout) as exc:
            if attempt < max_retries:
                sleep_s = (2.0 ** attempt) + 0.5
                logging.warning(f"Google API network error: {exc}. Retrying in {sleep_s:.1f}s...")
                time.sleep(sleep_s)
                continue
            raise

    return last_resp if last_resp is not None else requests.Response()


def _write_sheet_values(
    *,
    spreadsheet_id: str,
    sheet_name: str,
    rows: list[list[Any]],
    headers: dict[str, str],
) -> None:
    escaped_title = (sheet_name or 'Sheet1').replace("'", "''")
    encoded_range = quote(f"'{escaped_title}'!A1", safe='')
    response = _google_api_request_with_retry(
        'PUT',
        f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{encoded_range}',
        params={'valueInputOption': 'USER_ENTERED'},
        headers={**headers, 'Content-Type': 'application/json'},
        json_data={'values': rows},
        timeout=30,
    )
    _clear_sheet_cache(spreadsheet_id)
    if not response or not response.ok:
        err_msg = response.text if response else 'No response'
        raise GoogleSheetsServiceError(f'Google Sheets write failed for {sheet_name}: {err_msg}')


def _read_sheet_values(
    *,
    spreadsheet_id: str,
    sheet_name: str,
    headers: dict[str, str],
    bypass_cache: bool = False,
) -> tuple[list[list[Any]], str, list[str]]:
    """Read all rows/columns from the specified sheet tab with robust caching, tab resolution, and 429 retry.

    Returns (values, resolved_sheet_name, available_sheet_titles).
    """
    target_sheet = str(sheet_name or '').strip()

    if not bypass_cache:
        cached = _get_cached_sheet_values(spreadsheet_id, target_sheet)
        if cached is not None:
            return cached

    # 1. Fetch metadata (cached for 5 min)
    sheet_titles = _get_cached_meta(spreadsheet_id)
    if sheet_titles is None:
        try:
            meta_resp = _google_api_request_with_retry(
                'GET',
                f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}?fields=sheets(properties(sheetId,title))',
                headers={**headers, 'Accept': 'application/json'},
                timeout=20,
            )
            if meta_resp and meta_resp.ok:
                meta = meta_resp.json() or {}
                sheet_titles = [
                    s.get('properties', {}).get('title')
                    for s in meta.get('sheets', [])
                    if s.get('properties', {}).get('title')
                ]
                if sheet_titles:
                    _set_cached_meta(spreadsheet_id, sheet_titles, ttl=300.0)
        except Exception:
            pass

    if sheet_titles is None:
        sheet_titles = []

    # 2. Resolve tab title
    resolved_title = None
    if sheet_titles:
        if target_sheet in sheet_titles:
            resolved_title = target_sheet
        else:
            norm_target = target_sheet.lower().replace(' ', '').replace('_', '').replace('-', '')
            match = next((t for t in sheet_titles if t.strip().lower() == target_sheet.lower()), None)
            if not match:
                roman_map = {'1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi'}
                candidates = [norm_target]
                for arabic, roman in roman_map.items():
                    if arabic in norm_target:
                        candidates.append(norm_target.replace(arabic, roman))
                    if roman in norm_target:
                        candidates.append(norm_target.replace(roman, arabic))
                for cand in candidates:
                    match = next(
                        (
                            t for t in sheet_titles
                            if cand in t.lower().replace(' ', '').replace('_', '').replace('-', '')
                            or t.lower().replace(' ', '').replace('_', '').replace('-', '') in cand
                        ),
                        None,
                    )
                    if match:
                        break
            if not match:
                target_keywords = [k for k in ('lab', 'cia', 'ssa', 'formative', 'model', 'cycle', 'exp', 'internal') if k in target_sheet.lower()]
                for kw in target_keywords:
                    match = next((t for t in sheet_titles if kw in t.lower()), None)
                    if match:
                        break
            if not match:
                match = next((t for t in sheet_titles if any(k in t.lower() for k in ('cycle', 'lab', 'exp', 'cia', 'mark', 'sheet'))), None)

            resolved_title = match if match else sheet_titles[0]

    if not resolved_title:
        resolved_title = target_sheet or (sheet_titles[0] if sheet_titles else 'Sheet1')

    # 3. Read values using A1 range
    escaped_title = resolved_title.replace("'", "''")
    range_candidates = [
        f"'{escaped_title}'!A1:ZZ5000",
        f"'{escaped_title}'!A:ZZ",
        f"'{escaped_title}'!1:5000",
        f"'{escaped_title}'",
        resolved_title,
    ]

    last_error_text = ''
    for candidate in range_candidates:
        encoded_range = quote(candidate, safe='')
        response = _google_api_request_with_retry(
            'GET',
            f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{encoded_range}',
            headers={**headers, 'Accept': 'application/json'},
            timeout=30,
        )
        if response and response.ok:
            payload = response.json() or {}
            vals = payload.get('values') or []
            res_tuple = (vals, resolved_title, sheet_titles)
            _set_cached_sheet_values(spreadsheet_id, target_sheet, res_tuple, ttl=30.0)
            return res_tuple
        if response:
            last_error_text = response.text

    # Fallback to first tab if needed
    if sheet_titles and resolved_title != sheet_titles[0]:
        first_title = sheet_titles[0]
        esc_first = first_title.replace("'", "''")
        enc = quote(f"'{esc_first}'!A1:ZZ5000", safe='')
        resp = _google_api_request_with_retry(
            'GET',
            f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{enc}',
            headers={**headers, 'Accept': 'application/json'},
            timeout=30,
        )
        if resp and resp.ok:
            payload = resp.json() or {}
            vals = payload.get('values') or []
            res_tuple = (vals, first_title, sheet_titles)
            _set_cached_sheet_values(spreadsheet_id, target_sheet, res_tuple, ttl=30.0)
            return res_tuple

    # Fallback to expired cache if available before raising error
    stale_key = f"{spreadsheet_id}::{target_sheet.strip().lower()}"
    stale_entry = _SHEET_VALUES_CACHE.get(stale_key)
    if stale_entry:
        logging.warning(f"Using stale cached sheet values for {spreadsheet_id} due to rate limit: {last_error_text}")
        return stale_entry[1]

    avail_msg = f' Available sheet tabs in spreadsheet: {", ".join(sheet_titles)}.' if sheet_titles else ''
    raise GoogleSheetsServiceError(f'Google Sheets read failed for "{sheet_name}": {last_error_text}.{avail_msg}')


def _column_label_to_index(label: str | None) -> int | None:
    """Convert spreadsheet column label (A, B, AA) to zero-based index."""
    text = str(label or '').strip().upper()
    if not text or not re.fullmatch(r'[A-Z]+', text):
        return None

    index = 0
    for ch in text:
        index = index * 26 + (ord(ch) - ord('A') + 1)
    return index - 1


def _index_to_column_label(index: int) -> str:
    """Convert zero-based column index to spreadsheet column label (A, B, AA)."""
    if index < 0:
        return 'A'
    label = []
    n = index + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        label.append(chr(ord('A') + rem))
    return ''.join(reversed(label))


def _safe_row_value(row: list[Any], index: int | None) -> Any:
    if index is None or index < 0 or index >= len(row):
        return None
    return row[index]


def _parse_co_spec(raw_co: Any, raw_title: Any = '') -> list[int]:
    """Parse CO specification from cell text or header title into a list of CO numbers (1..6).

    Handles:
    - Comma/semicolon-separated lists: '1,2,3', '3,4,5', 'CO1, CO2, CO3', '1, 2, 3' -> [1, 2, 3]
    - Single COs: 'CO1', '1', 'CO 1', 'CO-1' -> [1]
    - Ranges: '1-3', '1 - 3', 'CO1-CO3', 'CO1 to CO3' -> [1, 2, 3]
    - Fallback: extracts CO info from raw_title if raw_co is blank
    """
    co_str = str(raw_co or '').strip()
    title_str = str(raw_title or '').strip()

    def _extract_from_text(text: str) -> list[int]:
        if not text:
            return []
        text_upper = text.upper().strip()

        # If comma-separated or semicolon-separated (e.g. '1,2,3', 'CO1, CO2, CO3', '1, 2, 3')
        if ',' in text_upper or ';' in text_upper or '&' in text_upper:
            nums = []
            for part in re.split(r'[,;&]+', text_upper):
                part = part.strip()
                if not part:
                    continue
                m = re.search(r'\b(?:CO\s*[-_]?)?([1-6])\b', part)
                if not m:
                    m = re.search(r'([1-6])', part)
                if m:
                    val = int(m.group(1))
                    if 1 <= val <= 6 and val not in nums:
                        nums.append(val)
            return sorted(nums)

        # If hyphenated range (e.g. '1-3', 'CO1-CO3', '1 to 3')
        range_match = re.search(r'\b(?:CO\s*[-_]?)?([1-6])\s*(?:-|TO|\.\.)\s*(?:CO\s*[-_]?)?([1-6])\b', text_upper)
        if range_match:
            st, en = int(range_match.group(1)), int(range_match.group(2))
            if 1 <= st <= en <= 6:
                return list(range(st, en + 1))
            elif 1 <= en <= st <= 6:
                return list(range(en, st + 1))

        # Single CO check (e.g. 'CO1', 'CO 1', '1', 'CO-1')
        single_co = re.search(r'\bCO\s*[-_]?([1-6])\b', text_upper)
        if single_co:
            return [int(single_co.group(1))]

        # Exact single digit in string (e.g. '1', '2', '3')
        if text_upper in ('1', '2', '3', '4', '5', '6'):
            return [int(text_upper)]

        # If text is something like 'CO1' with no word boundary issues
        m_co = re.match(r'^CO\s*[-_]?([1-6])$', text_upper)
        if m_co:
            return [int(m_co.group(1))]

        return []

    res = _extract_from_text(co_str)
    if not res and title_str:
        co_title_match = re.search(r'\(?\s*CO\s*[:\-_]?\s*([1-6\s,\-&to/]+)\)?', title_str, re.IGNORECASE)
        if co_title_match:
            res = _extract_from_text(co_title_match.group(1))
        if not res:
            paren_match = re.search(r'\(\s*([1-6\s,\-&to/]+)\s*\)', title_str)
            if paren_match:
                res = _extract_from_text(paren_match.group(1))
        if not res:
            t_clean = title_str.upper().strip()
            # Only accept if title is strictly a CO designation (e.g. '1', 'CO1', 'CO-1', '1,2,3')
            # Avoid extracting numbers from 'CIA 1', 'EXP 1', 'ITEM 1', 'REVIEW 1', etc.
            if not any(ign in t_clean for ign in ('CIA', 'EXP', 'ITEM', 'REVIEW', 'TASK', 'CYCLE', 'PART', 'MODULE', 'UNIT', 'SL', 'SNO', 'Q', 'QUESTION', 'MODEL', 'TEST', 'ASSIGNMENT', 'SSA')):
                if t_clean in ('1', '2', '3', '4', '5', '6') or re.match(r'^CO\s*[-_]?([1-6])$', t_clean):
                    res = _extract_from_text(title_str)

    return res


def _is_summary_or_ignored_column(raw_title: Any, raw_co: Any = '', raw_max: Any = None) -> bool:
    """Check whether a column is a summary, calculated, or meta column that should not be a question."""
    t = str(raw_title or '').strip().upper()
    c = str(raw_co or '').strip().upper()
    m = str(raw_max if raw_max is not None else '').strip()

    if m in ('0', '0.0', '%', '#VALUE!', '#DIV/0!', '#REF!'):
        return True

    ignore_keywords = [
        'TOTAL', 'CONVERTED', 'ATTENDANCE', 'PERCENTAGE', 'PERCENT',
        'SIGNATURE', 'SIGN', 'AVERAGE', 'AVG', 'GRADE', 'REMARKS',
        'ELIGIBILITY', 'ELIGIBLE', 'STATUS', 'RESULT', 'PASS/FAIL',
        'S.NO', 'SL.NO', 'SI.NO', 'SNO', 'SLNO', 'SERIAL', 'REG NO',
        'ROLL NO', 'REGISTER', 'STUDENT NAME', 'NAME OF THE STUDENT',
        'NAME OF THE STUDENTS', 'STUDENTS NAME', 'NAME / MAX MARKS',
        'CLASS STRENGTH', 'SECTION', 'BRANCH', 'DEPT', 'DEPARTMENT',
        'CHECK', 'IMPROVED', 'IMPROVEMENT', 'AFTER CQI', 'BEFORE CQI',
        'POST CQI', 'PRE CQI', 'FINAL INTERNAL', 'INTERNAL MARKS',
        'ATTAINMENT', 'RUBRICS', 'DIRECT', 'INDIRECT', 'OVERALL',
        'BTL ATTAINMENT', 'CO ATTAINMENT',
    ]
    for kw in ignore_keywords:
        if kw in t or kw in c:
            return True

    if not t and not c:
        return True

    # Empty title in an attainment / rubrics / summary block
    if not t and m in ('', '0', '0.0', '10', '17', '%'):
        return True

    # If CO cell is literally just 'COS' or 'CO' or 'BTL' with no numbers, ignore
    if c in ('COS', 'CO', "CO'S", 'BTL', 'MAX MARKS', 'MAX MARKS PER ITEM'):
        return True

    # Ignore summary Cycle / CIA columns like "CYCLE I (50)", "CYCLE II (50)", "CIA 1", "CIA 2", "CIA EXAM" when no explicit CO spec
    if 'CYCLE' in t and ('(50)' in t or '(100)' in t or 'AVG' in t or 'TOTAL' in t or 'CONVERTED' in t or 'CHECK' in t):
        return True
    if any(k in t for k in ('CIA EXAM', 'CIA 1', 'CIA 2', 'CIA-1', 'CIA-2', 'CIA I', 'CIA II')) and not any(c_num in c for c_num in ('1', '2', '3', '4', '5', '6')):
        return True

    return False


def _extract_max_marks(raw_val: Any, default: float = 25.0) -> float:
    """Extract numeric max marks from float, int, or text like 'Max: 50' or '25 Marks'."""
    if raw_val is None or raw_val == '':
        return default
    if isinstance(raw_val, (int, float)):
        v = float(raw_val)
        return v if v > 0 else default
    text = str(raw_val).strip()
    match = re.search(r'(\d+(?:\.\d+)?)', text)
    if match:
        try:
            v = float(match.group(1))
            return v if v > 0 else default
        except Exception:
            pass
    return default


def derive_mark_manager_from_sheet(
    *,
    spreadsheet_id: str,
    sheet_name: str,
    config: dict[str, Any],
    exam_name: str | None = None,
    co_row: int | str = 6,
    max_marks_row: int | str = 8,
    title_row: int | str = 5,
    reg_no_column: str = 'D',
    name_column: str = 'E',
    start_col: str | None = None,
) -> dict[str, Any]:
    """Inspect Google Sheet header rows and derive the complete Mark Manager configuration,

    question structure, and column mappings automatically.
    - Single CO (e.g. CO1, 1): Added to experiments count for that CO with max marks.
    - Multi CO (e.g. 1,2,3 or 3,4,5): Treated as an Exam column with max marks and CIA COs.
    """
    headers = _build_google_auth_headers(config)
    values, resolved_tab, available_tabs = _read_sheet_values(
        spreadsheet_id=spreadsheet_id,
        sheet_name=sheet_name,
        headers=headers,
    )
    if not values:
        raise GoogleSheetsServiceError(f'No data found in sheet tab "{sheet_name}". Ensure the tab exists.')

    try:
        co_row_idx = max(0, int(co_row) - 1)
    except Exception:
        co_row_idx = 5
    try:
        max_marks_row_idx = max(0, int(max_marks_row) - 1)
    except Exception:
        max_marks_row_idx = 7
    try:
        title_row_idx = max(0, int(title_row) - 1)
    except Exception:
        title_row_idx = 4

    reg_no_col_idx = _column_label_to_index(reg_no_column)
    name_col_idx = _column_label_to_index(name_column)

    if start_col:
        start_col_idx = _column_label_to_index(start_col) or 0
    else:
        # Start immediately after the highest index between reg_no and name columns
        base_indices = [idx for idx in (reg_no_col_idx, name_col_idx) if idx is not None]
        start_col_idx = (max(base_indices) + 1) if base_indices else 2

    titles_data = values[title_row_idx] if title_row_idx < len(values) else []
    cos_data = values[co_row_idx] if co_row_idx < len(values) else []
    max_marks_data = values[max_marks_row_idx] if max_marks_row_idx < len(values) else []

    num_cols = max(len(titles_data), len(cos_data), len(max_marks_data))

    # Find where attainment or summary metrics begin to avoid reading attainment formulas
    attainment_col_start = num_cols
    for r_i in range(min(len(values), max_marks_row_idx + 1)):
        row = values[r_i]
        for c_i, cell in enumerate(row):
            txt = str(cell or '').strip().upper()
            if c_i > start_col_idx and any(k in txt for k in ('CO ATTAINMENT', 'BTL ATTAINMENT', 'OVERALL CIA', 'DIRECT ATTAINMENT', 'INDIRECT ATTAINMENT')):
                if c_i < attainment_col_start:
                    attainment_col_start = c_i

    def _get_best_title_for_col(c_idx: int) -> str:
        t = str(_safe_row_value(titles_data, c_idx) or '').strip()
        if t:
            return t
        for r_i in range(co_row_idx):
            cell_v = str(_safe_row_value(values[r_i], c_idx) or '').strip()
            if cell_v and not cell_v.isdigit() and not any(ign in cell_v.upper() for ign in ('S.NO', 'REGISTER', 'NAME', 'SECTION', 'CLASS', 'STRENGTH')):
                return cell_v
        return ''

    co_columns: dict[int, list[dict[str, Any]]] = {c: [] for c in range(1, 7)}
    multi_co_columns: list[dict[str, Any]] = []

    # Scan the entire row from start column up to attainment section
    for c in range(start_col_idx, min(num_cols, attainment_col_start)):
        col_letter = _index_to_column_label(c)
        raw_title = _get_best_title_for_col(c)
        raw_co = str(_safe_row_value(cos_data, c) or '').strip()
        raw_max = _safe_row_value(max_marks_data, c)
        if raw_max is None or str(raw_max).strip() in ('', '0', '0.0', '%', '#VALUE!', '#DIV/0!', '#REF!'):
            continue

        if _is_summary_or_ignored_column(raw_title, raw_co, raw_max):
            continue

        co_nums = _parse_co_spec(raw_co, raw_title)
        if not co_nums:
            continue

        max_mark_val = _extract_max_marks(raw_max, default=25.0 if len(co_nums) == 1 else 50.0)
        if max_mark_val <= 0:
            continue

        if len(co_nums) == 1:
            co = co_nums[0]
            if 1 <= co <= 6:
                co_columns[co].append({
                    'col': col_letter,
                    'col_index': c,
                    'title': raw_title,
                    'raw_title': raw_title,
                    'co': co,
                    'max_marks': max_mark_val,
                    'is_exam': False,
                })
        else:
            multi_co_columns.append({
                'col': col_letter,
                'col_index': c,
                'title': raw_title or f'Exam (CO {", ".join(str(x) for x in co_nums)})',
                'raw_title': raw_title,
                'co': co_nums,
                'max_marks': max_mark_val,
                'is_exam': True,
            })

    # Build Mark Manager configuration and sequential question mapping aligned with ERP pattern order
    cos_config: dict[str, dict[str, Any]] = {}
    parsed_columns: list[dict[str, Any]] = []
    question_columns_mapping: dict[str, str] = {}
    q_idx = 0
    item_name = 'Experiments'

    for co_num in range(1, 7):
        items = co_columns[co_num]
        count = len(items)
        per_item_max = items[0]['max_marks'] if count > 0 else 25.0
        cos_config[str(co_num)] = {
            'enabled': count > 0,
            'num_items': count if count > 0 else 1,
            'max_marks': per_item_max if per_item_max > 0 else 25.0,
            'weight': 0,
        }
        for exp_i, it in enumerate(items):
            q_key = f'q{q_idx}'
            canonical_title = f'CO{co_num} - {item_name} {exp_i + 1}'
            disp_title = it['raw_title'] or canonical_title

            it['question_index'] = q_idx
            it['canonical_id'] = q_key
            it['title'] = disp_title
            it['q_id'] = f'co{co_num}_item_{exp_i + 1}'
            parsed_columns.append(it)

            # Register all lookup keys
            question_columns_mapping[q_key] = it['col']
            question_columns_mapping[f'q_{q_idx}'] = it['col']
            question_columns_mapping[str(q_idx)] = it['col']
            question_columns_mapping[canonical_title] = it['col']
            question_columns_mapping[canonical_title.lower()] = it['col']
            question_columns_mapping[f'CO{co_num} - Experiments {exp_i + 1}'] = it['col']
            question_columns_mapping[f'co{co_num}_item_{exp_i + 1}'] = it['col']
            if it.get('raw_title'):
                question_columns_mapping[it['raw_title']] = it['col']
                question_columns_mapping[it['raw_title'].lower()] = it['col']
            q_idx += 1

    # Map all multi-CO special columns
    exam_columns_payload: list[dict[str, Any]] = []
    for ex_i, exam_item in enumerate(multi_co_columns):
        q_key = f'q{q_idx}'
        lbl = exam_item['raw_title'] or f'Exam {ex_i + 1}'
        exam_item['question_index'] = q_idx
        exam_item['canonical_id'] = q_key
        exam_item['title'] = lbl
        exam_item['q_id'] = f'exam_{ex_i + 1}' if len(multi_co_columns) > 1 else 'exam'
        parsed_columns.append(exam_item)

        question_columns_mapping[q_key] = exam_item['col']
        question_columns_mapping[f'q_{q_idx}'] = exam_item['col']
        question_columns_mapping[str(q_idx)] = exam_item['col']
        question_columns_mapping[lbl] = exam_item['col']
        question_columns_mapping[lbl.lower()] = exam_item['col']
        question_columns_mapping[f'exam_{ex_i + 1}'] = exam_item['col']
        if ex_i == 0:
            question_columns_mapping['exam'] = exam_item['col']
            question_columns_mapping['Exam'] = exam_item['col']
            question_columns_mapping['cia'] = exam_item['col']
            question_columns_mapping['CIA'] = exam_item['col']
        if 'CIA II' in lbl.upper() or 'CIA 2' in lbl.upper():
            question_columns_mapping['CIA II MARKS'] = exam_item['col']
            question_columns_mapping['cia ii marks'] = exam_item['col']
            question_columns_mapping['CIA II'] = exam_item['col']
            question_columns_mapping['CIA 2'] = exam_item['col']
        elif 'CIA I' in lbl.upper() or 'CIA 1' in lbl.upper():
            question_columns_mapping['CIA I MARKS'] = exam_item['col']
            question_columns_mapping['cia i marks'] = exam_item['col']
            question_columns_mapping['CIA I'] = exam_item['col']
            question_columns_mapping['CIA 1'] = exam_item['col']

        exam_columns_payload.append({
            'col': exam_item['col'],
            'title': lbl,
            'label': lbl,
            'co': exam_item['co'],
            'cos': exam_item['co'],
            'max_marks': exam_item['max_marks'],
            'weight': 0,
            'enabled': True,
        })
        q_idx += 1

    cia_enabled = len(exam_columns_payload) > 0
    first_exam = exam_columns_payload[0] if cia_enabled else {}
    cia_label = first_exam.get('label') or 'Exam'
    cia_max_marks = float(first_exam.get('max_marks') or 0.0)
    cia_cos = first_exam.get('cos') or []

    total_marks = sum(
        float(c['max_marks']) * int(c['num_items'])
        for c in cos_config.values()
        if c['enabled']
    ) + sum(float(ex['max_marks']) for ex in exam_columns_payload)

    derived_mark_manager = {
        'enabled': True,
        'mode': 'user_define',
        'item_name': item_name,
        'whole_number': True,
        'arrow_keys': True,
        'cia_enabled': bool(cia_enabled),
        'cia_label': cia_label,
        'cia_max_marks': cia_max_marks,
        'cia_cos': cia_cos,
        'exam_columns': exam_columns_payload,
        'special_columns': exam_columns_payload,
        'cos': cos_config,
    }

    detected_cos = [co for co, c in cos_config.items() if c['enabled']]

    return {
        'derived_mark_manager': derived_mark_manager,
        'parsed_columns': parsed_columns,
        'question_columns_mapping': question_columns_mapping,
        'total_marks': total_marks,
        'detected_cos': [int(co) for co in detected_cos],
        'resolved_sheet_tab': resolved_tab,
        'available_sheet_tabs': available_tabs,
    }


def _get_qp_specs_for_exam(exam_assignment) -> list[dict[str, Any]]:
    try:
        from .views import _get_qp_specs_for_exam as canonical_get_qp_specs
        specs = canonical_get_qp_specs(exam_assignment)
        if specs:
            return specs
    except Exception:
        pass

    pattern = exam_assignment.get_qp_pattern() if hasattr(exam_assignment, 'get_qp_pattern') else (getattr(exam_assignment, 'qp_pattern', None) or {})
    if not isinstance(pattern, dict):
        return []

    questions: list[dict[str, Any]] = []
    if isinstance(pattern.get('questions'), list) and pattern['questions']:
        for i, q in enumerate(pattern['questions']):
            if isinstance(q, dict):
                questions.append({
                    'id': str(q.get('id') or f'q{i}'),
                    'title': str(q.get('question_number') or q.get('title') or f'Q{i + 1}'),
                    'max_marks': q.get('max_marks') or 0,
                    'co': q.get('co_number') or q.get('co') or 0,
                    'btl': q.get('btl_level') or q.get('btl') or None,
                })
        return questions

    titles = pattern.get('titles') or []
    marks_list = pattern.get('marks') or []
    cos = pattern.get('cos') or []
    btls = pattern.get('btls') or []
    enabled = pattern.get('enabled') or []

    for i in range(len(titles)):
        if i < len(enabled) and not enabled[i]:
            continue
        questions.append({
            'id': f'q{i}',
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

    from academics.models import StudentSectionAssignment, StudentProfile
    from .models import AcV2StudentMark

    students: list[StudentProfile] = []
    ta = getattr(getattr(exam_assignment, 'section', None), 'teaching_assignment', None)
    if ta:
        try:
            from .views import _get_active_students_for_teaching_assignment
            students = _get_active_students_for_teaching_assignment(ta)
        except Exception:
            students = []

    if not students:
        acad_sec = getattr(ta, 'section', None)
        if acad_sec:
            for sa in StudentSectionAssignment.objects.filter(section=acad_sec, end_date__isnull=True).select_related('student__user').order_by('student__reg_no'):
                if sa.student and sa.student not in students:
                    students.append(sa.student)

    if not students:
        for sm in AcV2StudentMark.objects.filter(exam_assignment=exam_assignment).select_related('student__user').order_by('student__reg_no'):
            if sm.student and sm.student not in students:
                students.append(sm.student)

    existing_marks = {
        str(sm.student_id): sm
        for sm in AcV2StudentMark.objects.filter(exam_assignment=exam_assignment)
    }

    for sp in students:
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
    from academics.models import StudentProfile, StudentSectionAssignment
    from .models import AcV2StudentMark, AcV2DraftMark

    sheet_title = sheet_name or (exam_assignment.exam_display_name or exam_assignment.exam or 'Marks')
    headers = _build_google_auth_headers(config)
    values, resolved_tab, available_tabs = _read_sheet_values(
        spreadsheet_id=spreadsheet_id,
        sheet_name=sheet_title,
        headers=headers,
    )
    if not values:
        return {'spreadsheetId': spreadsheet_id, 'sheetName': sheet_title, 'updatedRows': 0}

    questions = _get_qp_specs_for_exam(exam_assignment)
    if not questions:
        return {'spreadsheetId': spreadsheet_id, 'sheetName': sheet_title, 'updatedRows': 0}

    reg_column_index = _column_label_to_index((column_mapping or {}).get('regNoColumn') or (column_mapping or {}).get('reg_no_column') or 'D')
    name_column_index = _column_label_to_index((column_mapping or {}).get('nameColumn') or (column_mapping or {}).get('name_column') or 'E')
    raw_question_columns = (column_mapping or {}).get('questionColumns') or (column_mapping or {}).get('question_columns') or {}

    co_row_cfg = (column_mapping or {}).get('coRow') or (column_mapping or {}).get('co_row') or 6
    max_marks_row_cfg = (column_mapping or {}).get('maxMarksRow') or (column_mapping or {}).get('max_marks_row') or 8
    title_row_cfg = (column_mapping or {}).get('titleRow') or (column_mapping or {}).get('title_row') or 5

    is_mark_manager = False
    try:
        raw_p = exam_assignment.get_qp_pattern()
        if isinstance(raw_p, dict):
            mm_raw = raw_p.get('mark_manager')
            if isinstance(mm_raw, dict) and mm_raw.get('enabled'):
                is_mark_manager = True
    except Exception:
        pass

    if is_mark_manager:
        try:
            derived_info = derive_mark_manager_from_sheet(
                spreadsheet_id=spreadsheet_id,
                sheet_name=sheet_title,
                config=config,
                exam_name=getattr(exam_assignment, 'exam_display_name', None) or getattr(exam_assignment, 'exam', None) or sheet_title,
                co_row=co_row_cfg,
                max_marks_row=max_marks_row_cfg,
                title_row=title_row_cfg,
                reg_no_column=(column_mapping or {}).get('regNoColumn') or (column_mapping or {}).get('reg_no_column') or 'D',
                name_column=(column_mapping or {}).get('nameColumn') or (column_mapping or {}).get('name_column') or 'E',
            )
            if derived_info and derived_info.get('parsed_columns'):
                derived_mm = derived_info.get('derived_mark_manager') or {}
                cos_cfg = derived_mm.get('cos', {})
                cia_enabled = derived_mm.get('cia_enabled', False)
                cia_max_marks = float(derived_mm.get('cia_max_marks') or 0)
                cia_cos = derived_mm.get('cia_cos') or []
                cia_label = derived_mm.get('cia_label') or 'Exam'
                item_name = derived_mm.get('item_name') or 'Experiments'

                titles = []
                marks_list = []
                cos_list = []
                btls = []
                enabled = []
                total_max = 0.0
                covered_cos = []

                for co_str in sorted(cos_cfg.keys(), key=lambda x: int(x)):
                    co_num = int(co_str)
                    c_cfg = cos_cfg[co_str]
                    if not c_cfg.get('enabled'):
                        continue
                    covered_cos.append(co_num)
                    num_items = int(c_cfg.get('num_items', 1))
                    per_item_max = float(c_cfg.get('max_marks', 0))
                    total_max += per_item_max * num_items
                    for i in range(num_items):
                        titles.append(f'CO{co_num} - {item_name} {i + 1}')
                        marks_list.append(per_item_max)
                        cos_list.append(co_num)
                        btls.append(None)
                        enabled.append(True)

                exam_cols = derived_mm.get('exam_columns') or derived_mm.get('special_columns')
                if isinstance(exam_cols, list) and exam_cols:
                    for ex_it in exam_cols:
                        ex_lbl = str(ex_it.get('label') or ex_it.get('title') or 'Exam').strip() or 'Exam'
                        ex_max = float(ex_it.get('max_marks') or 0)
                        ex_cos = ex_it.get('cos') or ex_it.get('co')
                        if ex_max > 0:
                            titles.append(ex_lbl)
                            marks_list.append(ex_max)
                            cos_list.append(ex_cos if ex_cos else None)
                            btls.append(None)
                            enabled.append(True)
                            total_max += ex_max
                elif cia_enabled and cia_max_marks > 0:
                    titles.append(cia_label)
                    marks_list.append(cia_max_marks)
                    cos_list.append(cia_cos if cia_cos else None)
                    btls.append(None)
                    enabled.append(True)
                    total_max += cia_max_marks

                new_user_pattern = {
                    'titles': titles,
                    'marks': marks_list,
                    'cos': cos_list,
                    'btls': btls,
                    'enabled': enabled,
                    'mark_manager': {
                        **derived_mm,
                        'confirmed': True,
                    },
                }

                d = exam_assignment.draft_data if isinstance(exam_assignment.draft_data, dict) else {}
                d['user_pattern'] = new_user_pattern
                exam_assignment.draft_data = d
                exam_assignment.max_marks = total_max
                exam_assignment.covered_cos = covered_cos
                exam_assignment.save(update_fields=['draft_data', 'max_marks', 'covered_cos', 'updated_at'])

                # Refresh questions from newly updated pattern
                updated_questions = _get_qp_specs_for_exam(exam_assignment)
                if updated_questions:
                    questions = updated_questions

                derived_q_map = derived_info.get('question_columns_mapping') or {}
                if derived_q_map:
                    raw_question_columns = dict(derived_q_map)

                # Persist updated questionColumns back to GoogleSheetLink exam_configs
                try:
                    sec_link = AcV2GoogleSheetLink.objects.filter(section=exam_assignment.section, is_active=True).first()
                    if sec_link and isinstance(sec_link.exam_configs, dict):
                        ea_cfg = sec_link.exam_configs.get(str(exam_assignment.id))
                        if isinstance(ea_cfg, dict):
                            ea_cfg['questionColumns'] = raw_question_columns
                            sec_link.exam_configs[str(exam_assignment.id)] = ea_cfg
                            sec_link.save(update_fields=['exam_configs', 'updated_at'])
                except Exception:
                    pass
        except Exception:
            pass

    title_to_column_index: dict[str, int] = {}
    if isinstance(raw_question_columns, dict):
        for raw_key, column_label in raw_question_columns.items():
            column_index = _column_label_to_index(str(column_label or ''))
            if column_index is None:
                continue
            key_str = str(raw_key or '').strip()
            if key_str:
                title_to_column_index[key_str] = column_index
                title_to_column_index[key_str.lower()] = column_index
                title_to_column_index[key_str.upper()] = column_index

    # Start row index offset
    start_row_cfg = (column_mapping or {}).get('startRow') or (column_mapping or {}).get('start_row')
    start_row_offset = 0
    if is_mark_manager:
        if start_row_cfg:
            try:
                start_row_offset = max(0, int(start_row_cfg) - 1)
            except Exception:
                start_row_offset = 8
        elif co_row_cfg or max_marks_row_cfg:
            try:
                header_max_row = max(int(co_row_cfg or 6), int(max_marks_row_cfg or 8), int(title_row_cfg or 5))
                start_row_offset = max(0, header_max_row)
            except Exception:
                start_row_offset = 8
        else:
            start_row_offset = 8
    else:
        # For non-mark manager exams, student data begins around row 6-7.
        # Scan from row 0; valid student register numbers will be matched automatically
        # without skipping starting student rows.
        start_row_offset = 0

    # Preload section students for fast, accurate lookup
    sec_students_map: dict[str, StudentProfile] = {}
    try:
        ta_sec = getattr(getattr(exam_assignment.section, 'teaching_assignment', None), 'section', None)
        if ta_sec:
            for sa in StudentSectionAssignment.objects.filter(section=ta_sec, end_date__isnull=True).select_related('student__user'):
                sp = sa.student
                if sp and sp.reg_no:
                    cleaned = re.sub(r'\s+', '', str(sp.reg_no)).upper()
                    sec_students_map[cleaned] = sp
    except Exception:
        pass

    # Base start column for questions if unmapped
    base_indices = [idx for idx in (reg_column_index, name_column_index) if idx is not None]
    start_q_col_idx = (max(base_indices) + 1) if base_indices else 2

    updated_count = 0
    for r_idx, row in enumerate(values):
        if r_idx < start_row_offset:
            continue
        if not row:
            continue
        raw_reg = str(_safe_row_value(row, reg_column_index) or '').strip()
        cleaned_reg = re.sub(r'\s+', '', raw_reg).upper()

        # Look up student first in section, then globally
        student = sec_students_map.get(cleaned_reg) if cleaned_reg else None
        if not student and raw_reg:
            student = StudentProfile.objects.filter(reg_no__iexact=raw_reg).first()
            if not student and cleaned_reg:
                student = StudentProfile.objects.filter(reg_no__iexact=cleaned_reg).first()

        # If not found by configured column, scan first 10 columns for a matching reg_no
        if not student:
            for col_i, cell in enumerate(row[:10]):
                if cell:
                    c_clean = re.sub(r'\s+', '', str(cell)).upper()
                    if c_clean in sec_students_map:
                        student = sec_students_map[c_clean]
                        reg_column_index = col_i
                        name_column_index = col_i + 1
                        raw_reg = str(cell).strip()
                        break
                    cand = StudentProfile.objects.filter(reg_no__iexact=str(cell).strip()).first()
                    if cand:
                        student = cand
                        reg_column_index = col_i
                        name_column_index = col_i + 1
                        raw_reg = str(cell).strip()
                        break

        if not student:
            # Row is not a recognized student (e.g. header row, title row)
            continue

        student_name = str(_safe_row_value(row, name_column_index) or '').strip()

        question_marks = {}
        for index, question in enumerate(questions):
            q_title = str(question.get('title') or '').strip()
            q_id = str(question.get('id') or '').strip()
            # Try specific key matches: canonical id (q0), index (q_0), title, exam alias
            mapped_col_index = (
                title_to_column_index.get(q_id)
                or title_to_column_index.get(q_id.lower())
                or title_to_column_index.get(f"q_{index}")
                or title_to_column_index.get(f"q{index}")
                or title_to_column_index.get(q_title)
                or title_to_column_index.get(q_title.lower())
                or (title_to_column_index.get('exam') if 'exam' in q_title.lower() or 'cia' in q_title.lower() else None)
                or (title_to_column_index.get('Exam') if 'exam' in q_title.lower() or 'cia' in q_title.lower() else None)
                or title_to_column_index.get(str(index))
            )
            col_index = mapped_col_index if mapped_col_index is not None else (start_q_col_idx + index)
            # Guard against reading from Register No. or Student Name column
            if col_index == reg_column_index or col_index == name_column_index:
                continue

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
                'reg_no': student.reg_no or raw_reg,
                'student_name': student_name or getattr(student, 'student_name', '') or (student.user.get_full_name() if getattr(student, 'user', None) else ''),
                'question_marks': question_marks,
                'total_mark': total_value,
                'is_absent': absent_value,
                'is_exempted': False,
            },
        )
        try:
            qp_pattern = exam_assignment.get_qp_pattern()
            mark_obj.calculate_co_marks(qp_pattern)
            mark_obj.calculate_total()
            mark_obj.save(update_fields=['reg_no', 'student_name', 'question_marks', 'total_mark', 'is_absent', 'is_exempted', 'co1_mark', 'co2_mark', 'co3_mark', 'co4_mark', 'co5_mark', 'co6_mark'])
        except Exception:
            mark_obj.save(update_fields=['reg_no', 'student_name', 'question_marks'])

        # Also create/update AcV2DraftMark so draft mark entry views show the marks immediately
        AcV2DraftMark.objects.update_or_create(
            exam_assignment=exam_assignment,
            student=student,
            defaults={
                'reg_no': student.reg_no or raw_reg,
                'student_name': student_name or getattr(student, 'student_name', '') or (student.user.get_full_name() if getattr(student, 'user', None) else ''),
                'question_marks': question_marks,
                'total_mark': mark_obj.total_mark,
                'is_absent': absent_value,
            },
        )
        updated_count += 1

    if updated_count > 0:
        draft_dict = exam_assignment.draft_data if isinstance(exam_assignment.draft_data, dict) else {}
        marks_dict = draft_dict.setdefault('marks', {})
        for dm in AcV2DraftMark.objects.filter(exam_assignment=exam_assignment):
            total_m = float(dm.total_mark) if dm.total_mark is not None else None
            q_m = {str(k): float(v) if v is not None else None for k, v in (dm.question_marks or {}).items()}
            marks_dict[str(dm.student_id)] = {
                'total': total_m,
                'isAbsent': bool(dm.is_absent),
                'questions': q_m,
            }
        exam_assignment.draft_data = draft_dict
        exam_assignment.save(update_fields=['draft_data', 'updated_at'])

    return {
        'spreadsheetId': spreadsheet_id,
        'sheetName': sheet_title,
        'updatedRows': updated_count,
    }


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


_WEBHOOK_TOKEN_SALT = 'academic_v2.google_sheets.webhook'


def webhook_token_for_section(section_id) -> str:
    """Per-section secret the generated Apps Script sends with every webhook push."""
    from django.utils.crypto import salted_hmac
    return salted_hmac(_WEBHOOK_TOKEN_SALT, str(section_id).strip(), algorithm='sha256').hexdigest()


def verify_webhook_token(section_id, token) -> bool:
    from django.utils.crypto import constant_time_compare
    if not token:
        return False
    return constant_time_compare(str(token), webhook_token_for_section(section_id))


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
var WEBHOOK_TOKEN = "{webhook_token_for_section(section_id)}";
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
    token: WEBHOOK_TOKEN,
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

