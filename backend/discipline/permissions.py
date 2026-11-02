"""Server-side access tiers for the Discipline module.

Mirrors the role names the SPA and KR Tracker already gate on. Of the
permission codes seeded by ``seed_discipline_roles`` only ``manage_config``
and ``log_incident`` are honoured (see ``is_discipline_committee``):

- admin:     configure categories/flow and delete incidents
- committee: view and edit every incident, export student barcodes
- reporter:  any staff member who records incidents (scanner / KR Tracker)
"""

from rest_framework.permissions import BasePermission

_ADMIN_ROLES = {'IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINECOMMITTEEADMIN'}
_COMMITTEE_ROLES = {'DISCIPLINE_COMMITTEE', 'DISCIPLINE COMMITTEE'}
_REPORTER_ROLES = {'STAFF', 'FACULTY'}


def _role_names(user) -> set:
    try:
        return {str(n).strip().upper() for n in user.roles.values_list('name', flat=True)}
    except Exception:
        return set()


def _has_perm(user, code) -> bool:
    try:
        return bool(user.has_perm(code))
    except Exception:
        return False


def _authenticated(user) -> bool:
    return bool(user and getattr(user, 'is_authenticated', False))


def is_discipline_admin(user) -> bool:
    if not _authenticated(user):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return bool(_role_names(user) & _ADMIN_ROLES) or _has_perm(user, 'discipline.manage_config')


def is_discipline_committee(user) -> bool:
    # Role-based only: migration accounts.0036 grants discipline.view_admin and
    # discipline.view_logs to every STAFF/FACULTY role, so those codes cannot
    # distinguish committee members from ordinary staff.
    if is_discipline_admin(user):
        return True
    if not _authenticated(user):
        return False
    return bool(_role_names(user) & _COMMITTEE_ROLES)


def can_report_incident(user) -> bool:
    if is_discipline_committee(user):
        return True
    if not _authenticated(user):
        return False
    if _role_names(user) & _REPORTER_ROLES or _has_perm(user, 'discipline.log_incident'):
        return True
    return getattr(user, 'staff_profile', None) is not None


class IsDisciplineAdmin(BasePermission):
    message = 'Discipline administrator access is required.'

    def has_permission(self, request, view):
        return is_discipline_admin(request.user)


class IsDisciplineCommittee(BasePermission):
    message = 'Discipline committee access is required.'

    def has_permission(self, request, view):
        return is_discipline_committee(request.user)


class CanReportIncident(BasePermission):
    message = 'Only staff can record or look up discipline incidents.'

    def has_permission(self, request, view):
        return can_report_incident(request.user)
