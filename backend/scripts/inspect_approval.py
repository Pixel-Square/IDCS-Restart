import os, sys
backend_dir = r'C:\Users\ABIVARSAN\Hash\Projects\IDCS-Restart\backend'
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django
django.setup()

from applications.models import Application
from applications.services.approval_engine import get_current_approval_step, user_can_act, _get_flow_for_application
from accounts.models import User

app = Application.objects.filter(application_type__code__iexact='LEAVE').first()
if not app:
    print('No LEAVE application found')
    sys.exit(0)

print('Application id:', app.id, 'status:', app.status, 'current_step_id:', app.current_step_id)
cs = get_current_approval_step(app)
print('get_current_approval_step ->', cs and (cs.id, cs.order, cs.role_id, getattr(cs.role, 'name', None)))
flow = _get_flow_for_application(app)
print('flow ->', flow and (flow.id, getattr(flow.application_type, 'code', None), flow.department_id))
if flow:
    print('flow steps:')
    for s in flow.steps.order_by('order'):
        print(' - step id', s.id, 'order', s.order, 'role', s.role_id, getattr(s.role, 'name', None), 'auto_skip', s.auto_skip_if_unavailable, 'can_override', s.can_override)

print('\nChecking users (first 20) whether they can act:')
for u in User.objects.filter(is_active=True)[:20]:
    try:
        print(u.id, u.username, 'roles:', [r.name for r in u.roles.all()], 'can_act=', user_can_act(app,u))
    except Exception as e:
        print('error for user', u.username, e)
