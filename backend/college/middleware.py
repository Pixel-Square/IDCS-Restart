"""
College context middleware.

Sets ``request.college``, ``request.college_id`` and the tenant
:class:`ContextVar` for the duration of every request based on the
``X-College-Id`` header.  Resets the ContextVar in ``finally`` so that
no college context leaks to the next request served by the same thread.
"""

from .tenant import set_current_college_id


def _is_super_admin(user) -> bool:
    """Return True if *user* is a Django superuser or has the SUPER_ADMIN role."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        return user.roles.filter(name='SUPER_ADMIN').exists()
    except Exception:
        return False


def _user_college_id(user) -> int | None:
    """Return the college id from the user's student or staff profile."""
    if not user or not user.is_authenticated:
        return None
    sp = getattr(user, 'student_profile', None)
    if sp is not None and getattr(sp, 'college_id', None) is not None:
        return sp.college_id
    st = getattr(user, 'staff_profile', None)
    if st is not None and getattr(st, 'college_id', None) is not None:
        return st.college_id
    return None


class CollegeContextMiddleware:
    """Resolve current college from header → path prefix → user profile.

    * Sets ``request.college`` and ``request.college_id``.
    * Non-super-admins may only use their own college (403 otherwise).
    * Super admins with no header get global mode (no college filter).
    * Super admins with a header get college-scoped preview mode.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def _from_header(self, request) -> int | None:
        raw = request.META.get('HTTP_X_COLLEGE_ID', '').strip()
        if not raw:
            return None
        try:
            return int(raw)
        except (ValueError, TypeError):
            return None

    def _from_user(self, request) -> int | None:
        if not request.user or not request.user.is_authenticated:
            return None
        return _user_college_id(request.user)

    def __call__(self, request):
        cid = self._from_header(request) or self._from_user(request)

        college = None
        if cid is not None:
            from .models import College
            college = College.objects.filter(pk=cid, is_active=True).first()
            if college is None:
                cid = None  # inactive or deleted college → fall back

        # Non-super-admins may only use their own college.
        if college is not None and not _is_super_admin(request.user):
            user_cid = _user_college_id(request.user)
            if user_cid is not None and user_cid != college.pk:
                from django.http import JsonResponse
                return JsonResponse(
                    {'detail': 'You do not have access to this college.'},
                    status=403,
                )

        request.college = college
        request.college_id = college.pk if college else None
        set_current_college_id(request.college_id)

        try:
            return self.get_response(request)
        finally:
            set_current_college_id(None)
