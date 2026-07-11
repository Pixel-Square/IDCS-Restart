import inspect
import sys
sys.path.append("backend")
import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.views import HODSectionsView
print(inspect.getsource(HODSectionsView))
