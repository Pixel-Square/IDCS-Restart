import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()
from curriculum.models import CurriculumFieldSchema
for s in CurriculumFieldSchema.objects.all():
    print(f"{s.key}: {s.scope}, hidden_for={s.hidden_for_departments.count()}")
