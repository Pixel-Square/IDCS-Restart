import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from academics.models import Subject

subjects = Subject.objects.filter(code__icontains='MEC144')
for subject in subjects:
    print(f"Subject ID: {subject.id}, Code: {subject.code}, Name: {subject.name}")
