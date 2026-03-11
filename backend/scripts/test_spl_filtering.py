"""
Test script to verify SPL template filtering logic.

Tests the can_user_apply_with_template function with different user scenarios.
"""
from django.contrib.auth import get_user_model
from staff_requests.models import RequestTemplate
from staff_requests.views import can_user_apply_with_template
from accounts.models import UserRole, Role

User = get_user_model()

print('\n' + '='*80)
print('SPL Template Filtering Test')
print('='*80 + '\n')

# Get templates
normal_templates = list(RequestTemplate.objects.filter(is_active=True).exclude(name__endswith=' - SPL'))
spl_templates = list(RequestTemplate.objects.filter(is_active=True, name__endswith=' - SPL'))

print(f'Normal Templates: {len(normal_templates)}')
for t in normal_templates:
    print(f'  - {t.name}')

print(f'\nSPL Templates: {len(spl_templates)}')
for t in spl_templates:
    print(f'  - {t.name}')

print('\n' + '-'*80)
print('Test 1: Regular staff user (ONLY STAFF role, no SPL roles)')
print('-'*80)

# Find a user with ONLY regular roles (no SPL roles)
SPL_ROLES = {'IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA'}
COMMON_ROLES = {'STAFF', 'FACULTY', 'ASSISTANT', 'CLERK'}

test_staff = None
for user in User.objects.filter(is_superuser=False).select_related():
    user_role_names = set(user.user_roles.values_list('role__name', flat=True))
    # Find user with ONLY common roles, no SPL roles
    if user_role_names and not (user_role_names & SPL_ROLES) and (user_role_names & COMMON_ROLES):
        test_staff = user
        break

if test_staff:
    print(f'User: {test_staff.username}')
    
    # Get user's roles
    user_roles = list(test_staff.user_roles.values_list('role__name', flat=True))
    print(f'Roles: {user_roles}')
    
    # Check what templates they can see
    normal_visible = [t.name for t in normal_templates if can_user_apply_with_template(test_staff, t)]
    spl_visible = [t.name for t in spl_templates if can_user_apply_with_template(test_staff, t)]
    
    print(f'\nCan see normal templates: {len(normal_visible)}')
    for name in normal_visible:
        print(f'  ✓ {name}')
    
    print(f'\nCan see SPL templates: {len(spl_visible)}')
    if spl_visible:
        for name in spl_visible:
            print(f'  ✗ {name} (SHOULD NOT SEE!)')
    else:
        print('  (none - correct!)')
else:
    print('No regular staff user found (without SPL roles)')

print('\n' + '-'*80)
print('Test 2: User with SPL role (HOD)')
print('-'*80)

# Find a user with HOD role
hod_role = Role.objects.filter(name='HOD').first()
if hod_role:
    hod_user_role = UserRole.objects.filter(role=hod_role).first()
    if hod_user_role:
        hod_user = hod_user_role.user
        print(f'User: {hod_user.username}')
        
        # Get user's roles
        user_roles = list(hod_user.user_roles.values_list('role__name', flat=True))
        print(f'Roles: {user_roles}')
        
        # Check what templates they can see
        normal_visible = [t.name for t in normal_templates if can_user_apply_with_template(hod_user, t)]
        spl_visible = [t.name for t in spl_templates if can_user_apply_with_template(hod_user, t)]
        
        print(f'\nCan see normal templates: {len(normal_visible)}')
        if normal_visible:
            for name in normal_visible:
                print(f'  ✗ {name} (SHOULD NOT SEE!)')
        else:
            print('  (none - correct!)')
        
        print(f'\nCan see SPL templates: {len(spl_visible)}')
        for name in spl_visible:
            print(f'  ✓ {name}')
    else:
        print('No user with HOD role found')
else:
    print('HOD role not found')

print('\n' + '='*80)
print('Test Complete')
print('='*80 + '\n')
