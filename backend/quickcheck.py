import os, django, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()
from academics.models import Department
print("DEPTS:", list(Department.objects.values_list("code","name","short_name","is_teaching")))
