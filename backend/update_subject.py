import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from academics.models import Subject

try:
    subjects = Subject.objects.filter(code='MEC1447')
    count = subjects.count()
    if count == 0:
        print("No subject with code MEC1447 found.")
    else:
        for subject in subjects:
            print(f"Found Subject ID: {subject.id}, Code: {subject.code}, Name: {subject.name}")
            subject.code = 'MEC1448'
            subject.name = 'ADVANCED MATERIALS'
            subject.save()
            print(" -> Updated to MEC1448 - ADVANCED MATERIALS")
except Exception as e:
    print(f"Error: {e}")
