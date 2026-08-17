import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.contrib.auth import get_user_model
from accounts.serializers import MeSerializer

User = get_user_model()
u = User.objects.filter(username__iexact='Oorkalan A').first()
serializer = MeSerializer(u)
print("=== Oorkalan A MeSerializer Data ===")
for k, v in serializer.data.items():
    if k in ['roles', 'permissions', 'profile_type']:
        print(f"{k}: {v}")
