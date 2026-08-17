import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

import curriculum.models as m
for attr in dir(m):
    val = getattr(m, attr)
    if isinstance(val, type) and issubclass(val, django.db.models.Model):
        print(val.__name__)
