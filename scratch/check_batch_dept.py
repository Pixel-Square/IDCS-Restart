import os, sys
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
import django
django.setup()
from academics.models import Section
sec = Section.objects.get(id=52) # Section L
print(f"Section L: batch={sec.batch.name}, batch.department_id={sec.batch.department_id}, batch.course_id={sec.batch.course_id}")
