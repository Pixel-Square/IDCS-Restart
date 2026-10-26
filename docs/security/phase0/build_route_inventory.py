"""Enumerate every URL route with its view, HTTP methods and permission classes (no data access)."""
import json
import os

from django.urls import get_resolver, URLPattern, URLResolver
from rest_framework.views import APIView


def walk(patterns, prefix=''):
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from walk(p.url_patterns, prefix + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefix + str(p.pattern), p.callback


rows = []
for route, cb in walk(get_resolver().url_patterns):
    view_cls = getattr(cb, 'view_class', None) or getattr(cb, 'cls', None)
    initkw = getattr(cb, 'initkwargs', {}) or {}
    actions = getattr(cb, 'actions', None)
    module = getattr(cb, '__module__', '')
    name = getattr(cb, '__name__', '')
    perms, auth, kind, methods = [], [], 'django', []
    if view_cls is not None:
        module, name = view_cls.__module__, view_cls.__name__
        if issubclass(view_cls, APIView):
            kind = 'drf'
            perms = [c.__name__ for c in (initkw.get('permission_classes') or view_cls.permission_classes)]
            auth = [c.__name__ for c in (initkw.get('authentication_classes') if 'authentication_classes' in initkw else view_cls.authentication_classes)]
            if actions:
                methods = sorted({m.upper() for m in actions})
            else:
                methods = sorted(m.upper() for m in view_cls.http_method_names if hasattr(view_cls, m) and m not in ('options', 'head'))
    rows.append({'route': route, 'module': module, 'view': name, 'kind': kind, 'methods': methods, 'perms': perms, 'auth': auth})

with open(os.environ['ROUTES_OUT'], 'w', encoding='utf-8') as fh:
    json.dump(rows, fh, indent=1)
print('routes:', len(rows))
