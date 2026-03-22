import re

with open("academic_calendar/api_views.py", "r", encoding="utf-8") as f:
    orig = f.read()

new_view = """
@api_view(['GET'])
@permission_classes([AllowAny])
def public_events(request):
    try:
        from academic_calendar.models import AcademicCalendarEvent
        from template_api.models import EventPosterAttachment
    except ImportError:
        pass
    
    qs = AcademicCalendarEvent.objects.all().order_by('-start_date')[:20]
    out = []
    
    for ev in qs:
        # Check if there's a poster
        poster_url = None
        poster = EventPosterAttachment.objects.filter(event_id=str(ev.id)).order_by('-uploaded_at').first()
        if poster and poster.file:
            # Need to prefix with host since this is an API
            poster_url = request.build_absolute_uri(poster.file.url)
            
        out.append({
            'id': str(ev.id),
            'title': ev.title,
            'description': ev.description,
            'date': ev.start_date.isoformat(),
            'location': 'KRGI Campus',
            'image': poster_url,
        })
        
    return Response(out, status=200)
"""

if "def public_events" not in orig:
    if "from rest_framework.decorators import api_view, permission_classes" not in orig:
        orig = orig.replace("from rest_framework.decorators import api_view", "from rest_framework.decorators import api_view, permission_classes\nfrom rest_framework.permissions import AllowAny")
    orig += "\n" + new_view

    with open("academic_calendar/api_views.py", "w", encoding="utf-8") as f:
        f.write(orig)
    print("Added public_events to api_views.py")

with open("academic_calendar/api_urls.py", "r", encoding="utf-8") as f:
    urls_orig = f.read()

if "public-events" not in urls_orig:
    urls_orig = urls_orig.replace(
        "urlpatterns = [",
        "urlpatterns = [\n    path('api/public-events/', api_views.public_events, name='academic_calendar_public_events'),\n    path('public-events/', api_views.public_events)," 
    ) # added both to be safe
    with open("academic_calendar/api_urls.py", "w", encoding="utf-8") as f:
        f.write(urls_orig)
    print("Added public_events to api_urls.py")
