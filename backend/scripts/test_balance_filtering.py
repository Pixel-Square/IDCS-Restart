"""
Test leave balances filtering for SPL vs regular users.
"""
from django.contrib.auth import get_user_model
from staff_requests.models import RequestTemplate, StaffLeaveBalance

User = get_user_model()

print('\n' + '='*80)
print('Leave Balances Filtering Test')
print('='*80 + '\n')

SPL_ROLES = {'IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA'}
COMMON_ROLES = {'STAFF', 'FACULTY', 'ASSISTANT', 'CLERK'}

# Find test users
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

print('-'*80)
print('Test 1: Regular User Balances')
print('-'*80)

if regular_user:
    print(f'User: {regular_user.username}')
    print(f'Roles: {list(regular_user.user_roles.values_list("role__name", flat=True))}')
    
    # Get all balances for this user
    balances = StaffLeaveBalance.objects.filter(staff=regular_user)
    print(f'\nTotal balance records: {balances.count()}')
    
    # Check which templates they should see
    from staff_requests.views import can_user_apply_with_template
    all_templates = RequestTemplate.objects.filter(is_active=True)
    applicable_templates = [t.name for t in all_templates if can_user_apply_with_template(regular_user, t)]
    
    print(f'Applicable templates: {len(applicable_templates)}')
    for name in applicable_templates:
        marker = '(SPL)' if name.endswith(' - SPL') else '(normal)'
        print(f'  - {name} {marker}')
    
    print(f'\nBalances that SHOULD be visible:')
    for balance in balances:
        if balance.leave_type in applicable_templates:
            print(f'  ✓ {balance.leave_type}: {balance.balance}')
        else:
            print(f'  ✗ {balance.leave_type}: {balance.balance} (SHOULD BE HIDDEN)')

print('\n' + '-'*80)
print('Test 2: SPL User Balances')
print('-'*80)

if spl_user:
    print(f'User: {spl_user.username}')
    print(f'Roles: {list(spl_user.user_roles.values_list("role__name", flat=True))}')
    
    # Get all balances for this user
    balances = StaffLeaveBalance.objects.filter(staff=spl_user)
    print(f'\nTotal balance records: {balances.count()}')
    
    # Check which templates they should see
    from staff_requests.views import can_user_apply_with_template
    all_templates = RequestTemplate.objects.filter(is_active=True)
    applicable_templates = [t.name for t in all_templates if can_user_apply_with_template(spl_user, t)]
    
    print(f'Applicable templates: {len(applicable_templates)}')
    for name in applicable_templates:
        marker = '(SPL)' if name.endswith(' - SPL') else '(normal)'
        print(f'  - {name} {marker}')
    
    print(f'\nBalances that SHOULD be visible:')
    for balance in balances:
        if balance.leave_type in applicable_templates:
            print(f'  ✓ {balance.leave_type}: {balance.balance}')
        else:
            print(f'  ✗ {balance.leave_type}: {balance.balance} (SHOULD BE HIDDEN)')

print('\n' + '='*80)
print('Test Complete')
print('='*80 + '\n')
