"""
Update normal templates to have explicit allowed_roles.

This makes the intent clearer: normal templates are for regular staff,
SPL templates are for special administrative roles.
"""
from staff_requests.models import RequestTemplate

# Define common roles that should use normal templates
COMMON_ROLES = ['STAFF', 'FACULTY', 'ASSISTANT', 'CLERK']

# Find templates that don't have Late Entry Permission in the name
# (Late Entry Permission already has specific roles)
normal_templates = RequestTemplate.objects.filter(
    is_active=True
).exclude(
    name__endswith=' - SPL'
).exclude(
    name='Late Entry Permission'  # This one already has specific roles
)

print(f'\nUpdating {normal_templates.count()} normal templates...\n')

for template in normal_templates:
    print(f'Updating: {template.name}')
    print(f'  Old roles: {template.allowed_roles}')
    
    # Only update if currently empty
    if not template.allowed_roles or len(template.allowed_roles) == 0:
        template.allowed_roles = COMMON_ROLES
        template.save()
        print(f'  New roles: {template.allowed_roles} ✓')
    else:
        print(f'  Skipped (already has roles)')

print(f'\n✓ Update complete!\n')

# Show all templates with their roles
print('All templates:')
all_templates = RequestTemplate.objects.filter(is_active=True).order_by('name')
for t in all_templates:
    print(f'  {t.name}: {t.allowed_roles}')

