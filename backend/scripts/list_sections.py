import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from academics.models import Section

sections = Section.objects.all()[:20]
print(f"Found {Section.objects.count()} sections total\n")
print("First 20 sections:")
for s in sections:
    print(f"  ID={s.id}: {s.name}")
