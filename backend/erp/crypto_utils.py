from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

_ENC_PREFIX = "enc:v1:"


def _build_key() -> bytes:
    explicit = str(getattr(settings, 'DATA_ENCRYPTION_KEY', '') or '').strip()
    if explicit:
        return explicit.encode('utf-8')

    # Fallback: derive deterministic key from Django secret.
    # For strict key separation across environments, set DATA_ENCRYPTION_KEY explicitly.
    secret = str(getattr(settings, 'SECRET_KEY', '') or '').encode('utf-8')
    digest = hashlib.sha256(secret).digest()
    return base64.urlsafe_b64encode(digest)


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    return Fernet(_build_key())


def encrypt_secret(value: str | None) -> str:
    if value is None:
        return ''
    text = str(value)
    if text == '':
        return ''
    if text.startswith(_ENC_PREFIX):
        return text

    token = _fernet().encrypt(text.encode('utf-8')).decode('utf-8')
    return f"{_ENC_PREFIX}{token}"


def decrypt_secret(value: str | None) -> str:
    if value is None:
        return ''
    text = str(value)
    if text == '':
        return ''
    if not text.startswith(_ENC_PREFIX):
        return text

    token = text[len(_ENC_PREFIX):]
    try:
        plain = _fernet().decrypt(token.encode('utf-8'))
        return plain.decode('utf-8')
    except (InvalidToken, ValueError, TypeError):
        # Keep value readable in case of key mismatch instead of crashing runtime.
        return text
