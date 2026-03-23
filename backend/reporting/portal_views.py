from __future__ import annotations

import csv
import os
from functools import wraps

from django.http import HttpResponse
from django.shortcuts import redirect, render

from .services import query_reporting_view


SESSION_USER_KEY = 'reporting_portal_user'


def _load_portal_users() -> dict[str, str]:
    users: dict[str, str] = {}

    # Preferred: REPORTING_PORTAL_USERS="user1:pass1,user2:pass2"
    raw_users = str(os.getenv('REPORTING_PORTAL_USERS', '') or '').strip()
    if raw_users:
        for chunk in raw_users.split(','):
            part = chunk.strip()
            if not part or ':' not in part:
                continue
            username, password = part.split(':', 1)
            username = username.strip()
            password = password.strip()
            if username and password:
                users[username] = password

    # Fallback single user style.
    single_user = str(os.getenv('REPORTING_PORTAL_USERNAME', '') or '').strip()
    single_pass = str(os.getenv('REPORTING_PORTAL_PASSWORD', '') or '').strip()
    if single_user and single_pass and single_user not in users:
        users[single_user] = single_pass

    return users


def _portal_authenticated(request) -> bool:
    return bool(request.session.get(SESSION_USER_KEY))


def portal_login_required(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not _portal_authenticated(request):
            return redirect('reporting_portal_login')
        return view_func(request, *args, **kwargs)

    return _wrapped


def portal_login(request):
    if _portal_authenticated(request):
        return redirect('reporting_portal_home')

    error = ''
    users = _load_portal_users()

    if request.method == 'POST':
        username = str(request.POST.get('username', '') or '').strip()
        password = str(request.POST.get('password', '') or '').strip()

        if not users:
            error = 'Portal users are not configured. Set REPORTING_PORTAL_USERS in backend/.env and restart gunicorn.'
        elif not username or not password:
            error = 'Enter username and password.'
        elif users.get(username) != password:
            error = 'Invalid username or password.'
        else:
            request.session[SESSION_USER_KEY] = username
            # 8-hour portal session.
            request.session.set_expiry(60 * 60 * 8)
            return redirect('reporting_portal_home')

    return render(request, 'reporting/portal_login.html', {'error': error})


@portal_login_required
def portal_logout(request):
    request.session.pop(SESSION_USER_KEY, None)
    return redirect('reporting_portal_login')


@portal_login_required
def portal_home(request):
    context = {
        'portal_user': request.session.get(SESSION_USER_KEY),
        'filters': {
            'year': request.GET.get('year', ''),
            'sem': request.GET.get('sem', ''),
            'dept': request.GET.get('dept', ''),
            'sec': request.GET.get('sec', ''),
            'course_type': request.GET.get('course_type', ''),
            'course_code': request.GET.get('course_code', ''),
            'course_category': request.GET.get('course_category', ''),
        },
    }
    return render(request, 'reporting/portal_home.html', context)


@portal_login_required
def portal_export_csv(request, format_key: str):
    filters = {
        'year': request.GET.get('year'),
        'sem': request.GET.get('sem'),
        'dept': request.GET.get('dept'),
        'sec': request.GET.get('sec'),
        'course_type': request.GET.get('course_type'),
        'course_code': request.GET.get('course_code'),
        'course_category': request.GET.get('course_category'),
    }

    try:
        result = query_reporting_view(
            format_key=format_key,
            filters=filters,
            page=1,
            page_size=200000,
        )
    except ValueError as exc:
        return HttpResponse(str(exc), status=400)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="powerbi_{format_key}_portal_export.csv"'

    writer = csv.writer(response)
    writer.writerow(result.columns)
    for row in result.rows:
        writer.writerow([row.get(c) for c in result.columns])

    return response
