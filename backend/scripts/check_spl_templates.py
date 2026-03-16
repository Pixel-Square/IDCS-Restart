from staff_requests.models import RequestTemplate, ApprovalStep

spl_templates = RequestTemplate.objects.filter(name__endswith=' - SPL')
print(f'\nSPL Templates ({spl_templates.count()}):\n')

for t in spl_templates:
    print(f'{t.name}:')
    print(f'  Active: {t.is_active}')
    print(f'  Roles: {t.allowed_roles}')
    steps = [f"Step {s.step_order}: {s.approver_role}" for s in t.approval_steps.all()]
    print(f'  Approval Steps: {steps}')
    print()
