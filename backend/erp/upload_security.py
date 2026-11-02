"""Validation for user-uploaded files.

Checks the extension against an allow-list, enforces a size cap, verifies the
file's leading bytes match the claimed type (so ``marksheet.php.jpg`` or an
HTML file renamed to ``.png`` is rejected) and replaces the client filename
with a random one before it reaches storage.
"""

import os
import uuid

from rest_framework.exceptions import ValidationError

# Leading-byte signatures for the types we accept.
_SIGNATURES = {
    'pdf': (b'%PDF-',),
    'png': (b'\x89PNG\r\n\x1a\n',),
    'jpg': (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
    'webp': (b'RIFF',),
}

DOCUMENT_AND_IMAGE_TYPES = ('pdf', 'png', 'jpg', 'jpeg', 'webp')


def validate_upload(file_obj, *, allowed=DOCUMENT_AND_IMAGE_TYPES, max_bytes=5 * 1024 * 1024, field='file'):
    """Validate ``file_obj`` in place and give it a random safe name.

    Raises ``ValidationError`` (HTTP 400) when the file is rejected.
    """
    if file_obj is None:
        raise ValidationError({field: 'A file is required.'})

    original = os.path.basename(str(getattr(file_obj, 'name', '') or ''))
    ext = original.rsplit('.', 1)[-1].lower() if '.' in original else ''
    if ext not in allowed:
        raise ValidationError({field: f'File type not allowed. Allowed: {", ".join(allowed)}.'})

    size = getattr(file_obj, 'size', None)
    if size is None or size <= 0:
        raise ValidationError({field: 'The file is empty.'})
    if size > max_bytes:
        raise ValidationError({field: f'File is too large (max {max_bytes // (1024 * 1024)} MB).'})

    file_obj.seek(0)
    head = file_obj.read(16)
    file_obj.seek(0)
    signatures = _SIGNATURES.get(ext, ())
    if not any(head.startswith(sig) for sig in signatures):
        raise ValidationError({field: 'File content does not match its extension.'})
    if ext == 'webp' and head[8:12] != b'WEBP':
        raise ValidationError({field: 'File content does not match its extension.'})

    file_obj.name = f'{uuid.uuid4().hex}.{"jpg" if ext == "jpeg" else ext}'
    return file_obj
