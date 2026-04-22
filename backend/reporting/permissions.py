from rest_framework.permissions import BasePermission


def is_reporting_api_key_auth(request) -> bool:
    auth = getattr(request, 'auth', None)
    return isinstance(auth, dict) and auth.get('scheme') == 'reporting_api_key'


class HasReportingApiKey(BasePermission):
    message = 'Valid reporting API key is required.'

    def has_permission(self, request, view):
        return is_reporting_api_key_auth(request)
