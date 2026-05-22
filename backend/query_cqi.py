import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from OBE.models import ObeCqiPublished
import json

pubs = ObeCqiPublished.objects.all()
found = None
for pub in pubs:
    entries_str = json.dumps(pub.entries)
    if '2403811711421004' in entries_str:
        found = pub
        break

if found:
    print(f"Subject: {found.subject.code}, TA: {found.teaching_assignment_id}")
    pages = found.entries.get('__pages', {})
    print(json.dumps(pages, indent=2))
else:
    print("Not found")
