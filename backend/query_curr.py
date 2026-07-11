import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from academics.models import Section
from timetable.views import get_timetable_curriculum_for_section

section = Section.objects.get(id=41)
# wait, get_timetable_curriculum_for_section is probably an internal function or just a query
# Let's find out how timetable app gets the curriculum
