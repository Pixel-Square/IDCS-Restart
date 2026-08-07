import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from accounts.models import Role

roles_to_create = [
    ('CODE_ADMIN', 'Coder Admin - full access to coding platform'),
    ('CODE_COURSE_INCHARGE', 'Coder Course Incharge - can create sessions and questions'),
    ('CODE_SECTION_INCHARGE', 'Coder Section Incharge - can view student analytics'),
]

for name, desc in roles_to_create:
    role, created = Role.objects.get_or_create(name=name, defaults={'description': desc})
    if created:
        print(f"Created role: {name}")
    else:
        print(f"Role already exists: {name}")

print("Done!")
