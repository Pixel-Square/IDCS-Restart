from typing import Dict, Iterable
from django.core.exceptions import ValidationError

from applications import models as app_models


def _type_check(value, field_type, meta) -> bool:
    if value is None:
        return True
    if field_type == 'TEXT':
        return isinstance(value, str)
    if field_type == 'DATE':
        # Expect ISO date string or date object; basic check
        from datetime import date
        return isinstance(value, str) or isinstance(value, date)
    if field_type == 'BOOLEAN':
        return isinstance(value, bool)
    if field_type == 'NUMBER':
        return isinstance(value, (int, float))
    if field_type == 'SELECT':
        # value should be one of choices provided in meta['choices'] if present
        return True
    if field_type == 'FILE':
        # file uploads handled elsewhere; accept dict or str placeholder
        return True
    return True


def validate_application_data(form_version: app_models.ApplicationFormVersion, application_data: Iterable[app_models.ApplicationData]):
    """Validate ApplicationData rows against `form_version.schema`.

    schema format (expected): {
      'fields': [
         { 'field_key': str, 'field_type': 'TEXT'|'DATE'|..., 'is_required': bool, 'meta': {...} }
      ]
    }
    """
    if form_version is None:
        # No schema to validate against
        return True

    schema = form_version.schema or {}
    fields = schema.get('fields', [])
    field_map: Dict[str, dict] = {f['field_key']: f for f in fields}

    data_map = {ad.field.field_key: ad.value for ad in application_data}

    errors = {}

    # Check required and type constraints
    for fk, spec in field_map.items():
        val = data_map.get(fk)
        if spec.get('is_required') and (val is None or val == ''):
            errors[fk] = 'This field is required.'
            continue

        if val is not None and val != '':
            ftype = spec.get('field_type')
            meta = spec.get('meta', {})
            # type check
            if not _type_check(val, ftype, meta):
                errors[fk] = f'Invalid type for field {fk} (expected {ftype}).'
                continue

            # length checks for text
            if ftype == 'TEXT':
                if 'max_length' in meta and isinstance(val, str) and len(val) > meta['max_length']:
                    errors[fk] = f'Maximum length is {meta["max_length"]}.'
                if 'min_length' in meta and isinstance(val, str) and len(val) < meta['min_length']:
                    errors[fk] = f'Minimum length is {meta["min_length"]}.'

            # enum choices for SELECT
            if ftype == 'SELECT' and 'choices' in meta:
                choices = meta.get('choices', [])
                if val not in choices:
                    errors[fk] = f'Invalid choice: {val}.'

    if errors:
        raise ValidationError(errors)

    return True
