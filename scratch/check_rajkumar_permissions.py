import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from accounts.serializers import MeSerializer
from accounts.utils import get_user_permissions

User = get_user_model()
u = User.objects.filter(username__iexact='RAJKUMAR T').first()
serializer = MeSerializer(u)
print("=== RAJKUMAR T MeSerializer Data ===")
for k, v in serializer.data.items():
    if k in ['roles', 'permissions', 'profile_type']:
        print(f"{k}: {v}")
