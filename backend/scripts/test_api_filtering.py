"""
Simplified test to verify template filtering logic in practice.
Tests what templates each user type would see based on the filtering function.
"""
from django.contrib.auth import get_user_model
from staff_requests.models import RequestTemplate
from staff_requests.views import can_user_apply_with_template

User = get_user_model()

print('\n' + '='*80)
print('Template Filtering Logic Test')
print('='*80 + '\n')

# Find test users
SPL_ROLES = {'IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA'}
COMMON_ROLES = {'STAFF', 'FACULTY', 'ASSISTANT', 'CLERK'}

regular_user = None
spl_user = None

for user in User.objects.filter(is_superuser=False).prefetch_related('user_roles__role'):
    user_role_names = set(user.user_roles.values_list('role__name', flat=True))
    if user_role_names:
        if not regular_user and not (user_role_names & SPL_ROLES) and (user_role_names & COMMON_ROLES):
            regular_user = user
        if not spl_user and (user_role_names & SPL_ROLES):
            spl_user = user
    if regular_user and spl_user:
        break

# Get all active templates
all_templates = RequestTemplate.objects.filter(is_active=True)
normal_templates = [t for t in all_templates if not t.name.endswith(' - SPL')]
spl_templates = [t for t in all_templates if t.name.endswith(' - SPL')]

print('-'*80)
print('Template Inventory')
print('-'*80)
print(f'Normal templates: {len(normal_templates)}')
for t in normal_templates:
    print(f'  - {t.name} (allowed_roles: {t.allowed_roles})')
print(f'\nSPL templates: {len(spl_templates)}')
for t in spl_templates:
    print(f'  - {t.name} (allowed_roles: {t.allowed_roles})')

print('\n' + '-'*80)
print('Test 1: Regular Staff User')
print('-'*80)

if regular_user:
    print(f'User: {regular_user.username}')
    print(f'Roles: {list(regular_user.user_roles.values_list("role__name", flat=True))}')
    
    # Simulate what the active() endpoint would return
    visible_templates = [t for t in all_templates if can_user_apply_with_template(regular_user, t)]
    
    print(f'\nVisible templates: {len(visible_templates)}')
    for t in visible_templates:
        marker = '(SPL)' if t.name.endswith(' - SPL') else '(normal)'
        print(f'  - {t.name} {marker}')
    
    # Check categorization
    visible_normal = [t for t in visible_templates if not t.name.endswith(' - SPL')]
    visible_spl = [t for t in visible_templates if t.name.endswith(' - SPL')]
    
    print(f'\nBreakdown:')
    print(f'  Normal: {len(visible_normal)} (expected: {len(normal_templates)})')
    print(f'  SPL: {len(visible_spl)} (expected: 0)')
    
    if visible_spl:
        print(f'\n  ⚠ ERROR: Regular user should not see SPL templates!')
    else:
        print(f'\n  ✓ SUCCESS: Regular user correctly sees only normal templates')
else:
    print('No regular user found')

print('\n' + '-'*80)
print('Test 2: SPL User (HOD/IQAC/etc)')
print('-'*80)

if spl_user:
    print(f'User: {spl_user.username}')
    print(f'Roles: {list(spl_user.user_roles.values_list("role__name", flat=True))}')
    
    # Simulate what the active() endpoint would return
    visible_templates = [t for t in all_templates if can_user_apply_with_template(spl_user, t)]
    
    print(f'\nVisible templates: {len(visible_templates)}')
    for t in visible_templates:
        marker = '(SPL)' if t.name.endswith(' - SPL') else '(normal)'
        print(f'  - {t.name} {marker}')
    
    # Check categorization
    visible_normal = [t for t in visible_templates if not t.name.endswith(' - SPL')]
    visible_spl = [t for t in visible_templates if t.name.endswith(' - SPL')]
    
    print(f'\nBreakdown:')
    print(f'  Normal: {len(visible_normal)} (expected: 0)')
    print(f'  SPL: {len(visible_spl)} (expected: {len(spl_templates)})')
    
    if visible_normal:
        print(f'\n  ⚠ ERROR: SPL user should not see normal templates!')
    else:
        print(f'\n  ✓ SUCCESS: SPL user correctly sees only SPL templates')
else:
    print('No SPL user found')

print('\n' + '='*80)
print('Test Complete')
print('='*80 + '\n')
