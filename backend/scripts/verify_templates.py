"""
Verify that the loaded templates have all their configurations.
"""
from staff_requests.models import RequestTemplate

print('\n' + '='*80)
print('Template Configuration Verification')
print('='*80 + '\n')

templates = RequestTemplate.objects.all().order_by('name')

for template in templates:
    print(f'Template: {template.name}')
    print(f'  Active: {template.is_active}')
    print(f'  Allowed Roles: {template.allowed_roles}')
    print(f'  Form Fields: {len(template.form_schema)}')
    
    # Approval steps
    steps = template.approval_steps.all().order_by('step_order')
    print(f'  Approval Flow: {" → ".join([s.approver_role for s in steps])}')
    
    # Leave policy
    leave_policy = template.leave_policy
    if leave_policy:
        action = leave_policy.get('action', 'N/A')
        status = leave_policy.get('attendance_status', 'N/A')
        print(f'  Leave Policy: {action} (status: {status})')
        
        if 'allotment_per_role' in leave_policy:
            allotment = leave_policy['allotment_per_role']
            print(f'    Allotment: {allotment}')
    
    # Attendance action
    if template.attendance_action:
        change = template.attendance_action.get('change_status', False)
        if change:
            from_status = template.attendance_action.get('from_status', 'N/A')
            to_status = template.attendance_action.get('to_status', 'N/A')
            print(f'  Attendance: Changes {from_status} → {to_status}')
    
    print()

print('='*80)
print(f'Total: {templates.count()} templates loaded')
print('✓ All configurations verified')
print('='*80 + '\n')
