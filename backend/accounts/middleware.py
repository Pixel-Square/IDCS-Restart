from django.http import JsonResponse

class ShutdownLockdownMiddleware:
    """
    Middleware to lock down the IDCS system.
    Blocks all access to the API for non-superusers while keeping the server running.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 1. Always allow access to the Django Admin panel
        if request.path.startswith('/admin/'):
            return self.get_response(request)
            
        # 2. Allow access if the user is somehow already authenticated and is a superuser
        if getattr(request, 'user', None) and request.user.is_authenticated and request.user.is_superuser:
            return self.get_response(request)
            
        # 3. Block everything else (Login attempts, data fetching, etc.)
        return JsonResponse({
            'detail': 'The IDCS system has been officially decommissioned and is no longer accepting logins.',
            'status': 'shutdown'
        }, status=503)