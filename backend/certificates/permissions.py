from rest_framework.permissions import BasePermission

from academics.models import DepartmentRole, SectionAdvisor, StudentMentorMap


def _has_role(user, role_name: str) -> bool:
    try:
        return user and user.is_authenticated and user.roles.filter(name__iexact=role_name).exists()
    except Exception:
        return False


def is_iqac_user(user) -> bool:
    return bool(getattr(user, 'is_superuser', False) or _has_role(user, 'IQAC'))


class IsCertificateStudent(BasePermission):
    def has_permission(self, request, view):
        return bool(getattr(request.user, 'student_profile', None))


class IsCertificateMentor(BasePermission):
    def has_permission(self, request, view):
        staff = getattr(request.user, 'staff_profile', None)
        return bool(staff and StudentMentorMap.objects.filter(mentor=staff, is_active=True).exists())


class IsCertificateAdvisor(BasePermission):
    def has_permission(self, request, view):
        staff = getattr(request.user, 'staff_profile', None)
        return bool(staff and SectionAdvisor.objects.filter(advisor=staff, is_active=True).exists())


class IsCertificateHOD(BasePermission):
    def has_permission(self, request, view):
        staff = getattr(request.user, 'staff_profile', None)
        return bool(staff and DepartmentRole.objects.filter(staff=staff, role='HOD', is_active=True).exists())


class IsCertificateIQAC(BasePermission):
    def has_permission(self, request, view):
        return is_iqac_user(request.user)
