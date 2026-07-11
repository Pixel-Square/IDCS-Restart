import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

import academics.models
import accounts.models

print("=== Academics Models ===")
for name in dir(academics.models):
    obj = getattr(academics.models, name)
    if isinstance(obj, type):
        print(name)

print("\n=== Accounts Models ===")
for name in dir(accounts.models):
    obj = getattr(accounts.models, name)
    if isinstance(obj, type):
        print(name)
