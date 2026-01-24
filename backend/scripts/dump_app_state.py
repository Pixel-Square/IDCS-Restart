import os, sys
backend_dir = r'C:\Users\ABIVARSAN\Hash\Projects\IDCS-Restart\backend'
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django
django.setup()

from applications.models import Application, ApprovalAction

APP_ID = 1

app = Application.objects.filter(pk=APP_ID).first()
if not app:
    print('Application not found:', APP_ID)
    sys.exit(1)

print('Application:', app.id, 'type:', getattr(app.application_type, 'code', None), 'status:', app.status, 'current_step_id:', app.current_step_id)

print('\nApproval Actions (chronological):')
for a in ApprovalAction.objects.filter(application=app).order_by('acted_at'):
    step_info = f"step_id={getattr(a.step, 'id', None)} order={getattr(a.step, 'order', None)} role={getattr(getattr(a.step, 'role', None), 'name', None)}"
    print(f"- id={a.id} action={a.action} by={getattr(a.acted_by,'username',None)} at={a.acted_at} {step_info} remarks={a.remarks}")

print('\nComputed current step via engine:')
from applications.services.approval_engine import get_current_approval_step
cs = get_current_approval_step(app)
if cs:
    print('current step ->', cs.id, cs.order, getattr(cs.role,'name',None))
else:
    print('No current step computed')

print('\nFlow steps and auto-skip flags:')
flow = app.application_type.approval_flows.first()
if flow:
    for s in flow.steps.order_by('order'):
        print(' - step', s.id, 'order', s.order, 'role', s.role.name, 'auto_skip', s.auto_skip_if_unavailable)
else:
    print('No flow found for application type')
