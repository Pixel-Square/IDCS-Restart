"""Single source of truth for the client IP address.

Nginx sets ``X-Forwarded-For`` to the real client address (taken from Cloudflare's
``CF-Connecting-IP`` when the request comes through the tunnel), overwriting any
value the client sent. With ``NUM_PROXIES`` trusted hops we take the entry those
proxies appended; anything to its left is client-controlled and ignored.
"""

from django.conf import settings


def get_client_ip(request) -> str:
    num_proxies = settings.REST_FRAMEWORK.get('NUM_PROXIES')
    remote_addr = request.META.get('REMOTE_ADDR', '') or ''
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if not num_proxies or not xff:
        return remote_addr
    addrs = [a.strip() for a in xff.split(',') if a.strip()]
    if not addrs:
        return remote_addr
    return addrs[-min(int(num_proxies), len(addrs))]
