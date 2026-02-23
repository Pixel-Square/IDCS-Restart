import logging
import time
from typing import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

logger = logging.getLogger('django.request')


class SlowRequestLoggingMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest):
        enabled = bool(getattr(settings, 'SLOW_REQUEST_LOG_ENABLED', True))
        if not enabled:
            return self.get_response(request)

        threshold_ms = int(getattr(settings, 'SLOW_REQUEST_LOG_MS', 1200))
        started = time.perf_counter()
        response = self.get_response(request)
        elapsed_ms = (time.perf_counter() - started) * 1000.0

        if elapsed_ms >= threshold_ms:
            logger.warning(
                'SLOW_REQUEST method=%s path=%s status=%s duration_ms=%.2f user=%s',
                request.method,
                request.path,
                getattr(response, 'status_code', 'NA'),
                elapsed_ms,
                getattr(getattr(request, 'user', None), 'username', 'anonymous') if getattr(request, 'user', None) and getattr(request.user, 'is_authenticated', False) else 'anonymous',
            )
        return response
