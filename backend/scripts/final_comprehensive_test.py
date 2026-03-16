"""
Final comprehensive verification of SPL template and balance separation.
"""
from django.contrib.auth import get_user_model
from staff_requests.models import RequestTemplate, StaffLeaveBalance
from staff_requests.views import can_user_apply_with_template

User = get_user_model()

print('\n' + '='*80)
print('FINAL COMPREHENSIVE VERIFICATION')
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

# Get templates
all_templates = RequestTemplate.objects.filter(is_active=True)
normal_templates = [t for t in all_templates if not t.name.endswith(' - SPL')]
spl_templates = [t for t in all_templates if t.name.endswith(' - SPL')]

print('-'*80)
print('Template Configuration')
print('-'*80)
print(f'Normal templates: {len(normal_templates)}')
print(f'SPL templates: {len(spl_templates)}')
print(f'Total: {len(all_templates)}')

# Test 1: Regular User
print('\n' + '-'*80)
print('Test 1: Regular User (STAFF/FACULTY/ASSISTANT/CLERK)')
print('-'*80)

if regular_user:
    print(f'User: {regular_user.username}')
    print(f'Roles: {list(regular_user.user_roles.values_list("role__name", flat=True))}')
    
    # Check templates
    visible_templates = [t for t in all_templates if can_user_apply_with_template(regular_user, t)]
    visible_normal = [t for t in visible_templates if not t.name.endswith(' - SPL')]
    visible_spl = [t for t in visible_templates if t.name.endswith(' - SPL')]
    
    print(f'\nTemplate visibility:')
    print(f'  Can see normal: {len(visible_normal)}/{len(normal_templates)} ✓' if len(visible_normal) == len(normal_templates) else f'  Can see normal: {len(visible_normal)}/{len(normal_templates)} ✗')
    print(f'  Can see SPL: {len(visible_spl)}/0 ✓' if len(visible_spl) == 0 else f'  Can see SPL: {len(visible_spl)}/0 ✗')
    
    # Check balances
    balances = StaffLeaveBalance.objects.filter(staff=regular_user)
    applicable_templates = {t.name for t in visible_templates}
    wrong_balances = [b for b in balances if b.leave_type not in applicable_templates]
    
    print(f'\nBalance records:')
    print(f'  Total: {balances.count()}')
    print(f'  Correct: {balances.count() - len(wrong_balances)}')
    print(f'  Wrong: {len(wrong_balances)} ✓' if len(wrong_balances) == 0 else f'  Wrong: {len(wrong_balances)} ✗')
    
    if wrong_balances:
        for b in wrong_balances:
            print(f'    ✗ {b.leave_type}: {b.balance}')
    
    test1_pass = len(visible_normal) == len(normal_templates) and len(visible_spl) == 0 and len(wrong_balances) == 0
    print(f'\n{"✓ PASS" if test1_pass else "✗ FAIL"}: Regular user test')

# Test 2: SPL User
print('\n' + '-'*80)
print('Test 2: SPL User (HOD/IQAC/HR/PS/etc)')
print('-'*80)

if spl_user:
    print(f'User: {spl_user.username}')
    print(f'Roles: {list(spl_user.user_roles.values_list("role__name", flat=True))}')
    
    # Check templates
    visible_templates = [t for t in all_templates if can_user_apply_with_template(spl_user, t)]
    visible_normal = [t for t in visible_templates if not t.name.endswith(' - SPL')]
    visible_spl = [t for t in visible_templates if t.name.endswith(' - SPL')]
    
    print(f'\nTemplate visibility:')
    print(f'  Can see normal: {len(visible_normal)}/0 ✓' if len(visible_normal) == 0 else f'  Can see normal: {len(visible_normal)}/0 ✗')
    print(f'  Can see SPL: {len(visible_spl)}/{len(spl_templates)} ✓' if len(visible_spl) == len(spl_templates) else f'  Can see SPL: {len(visible_spl)}/{len(spl_templates)} ✗')
    
    # Check balances
    balances = StaffLeaveBalance.objects.filter(staff=spl_user)
    applicable_templates = {t.name for t in visible_templates}
    wrong_balances = [b for b in balances if b.leave_type not in applicable_templates]
    
    print(f'\nBalance records:')
    print(f'  Total: {balances.count()}')
    print(f'  Correct: {balances.count() - len(wrong_balances)}')
    print(f'  Wrong: {len(wrong_balances)} ✓' if len(wrong_balances) == 0 else f'  Wrong: {len(wrong_balances)} ✗')
    
    if wrong_balances:
        for b in wrong_balances:
            print(f'    ✗ {b.leave_type}: {b.balance}')
    
    test2_pass = len(visible_normal) == 0 and len(visible_spl) == len(spl_templates) and len(wrong_balances) == 0
    print(f'\n{"✓ PASS" if test2_pass else "✗ FAIL"}: SPL user test')

# Final result
print('\n' + '='*80)
print('FINAL RESULT')
print('='*80)

if test1_pass and test2_pass:
    print('\n✓✓✓ ALL TESTS PASSED ✓✓✓')
    print('\nSPL Template & Balance Separation Working:')
    print('  ✓ Regular staff see only normal templates')
    print('  ✓ Regular staff have only normal template balances')
    print('  ✓ SPL admins see only SPL templates')
    print('  ✓ SPL admins have only SPL template balances')
    print('  ✓ No cross-contamination between user types')
else:
    print('\n✗✗✗ SOME TESTS FAILED ✗✗✗')

print('\n' + '='*80 + '\n')
