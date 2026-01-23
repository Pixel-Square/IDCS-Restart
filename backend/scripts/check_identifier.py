import sys
import os

if len(sys.argv) < 3:
    print('Usage: check_identifier.py <identifier> <password>')
    sys.exit(2)

ident = sys.argv[1]
pw = sys.argv[2]

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
import django
django.setup()

from academics.models import StudentProfile, StaffProfile
from django.contrib.auth import get_user_model

User = get_user_model()

print('IDENT=', ident)
sp = StudentProfile.objects.filter(reg_no__iexact=ident).select_related('user').first()
if sp:
    u = sp.user
    print('Found StudentProfile -> user:', u.username, u.email, 'is_active=', u.is_active)
    print('Password OK:', u.check_password(pw))
else:
    print('No StudentProfile match')

st = StaffProfile.objects.filter(staff_id__iexact=ident).select_related('user').first()
if st:
    u = st.user
    print('Found StaffProfile -> user:', u.username, u.email, 'is_active=', u.is_active)
    print('Password OK:', u.check_password(pw))
else:
    print('No StaffProfile match')

ue = User.objects.filter(email__iexact=ident).first()
if ue:
    print('Found User by email:', ue.username, ue.email, 'is_active=', ue.is_active, 'Password OK=', ue.check_password(pw))
else:
    print('No User with that email')

uu = User.objects.filter(username__iexact=ident).first()
if uu:
    print('Found User by username:', uu.username, uu.email, 'is_active=', uu.is_active, 'Password OK=', uu.check_password(pw))
else:
    print('No User with that username')
