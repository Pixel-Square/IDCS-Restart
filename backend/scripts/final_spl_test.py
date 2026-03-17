"""
Final comprehensive test for SPL template separation.

This test verifies:
1. Template roles are configured correctly
2. can_user_apply_with_template() filters correctly
3. Users see only their applicable templates
"""
from django.contrib.auth import get_user_model
from staff_requests.models import RequestTemplate
from staff_requests.views import can_user_apply_with_template

User = get_user_model()

print('\n' + '='*80)
print('FINAL SPL TEMPLATE SEPARATION TEST')
print('='*80 + '\n')

# Phase 1: Verify template configuration
print('-'*80)
print('Phase 1: Template Configuration Verification')
print('-'*80)

all_templates = RequestTemplate.objects.filter(is_active=True).order_by('name')
normal_templates = [t for t in all_templates if not t.name.endswith(' - SPL')]
spl_templates = [t for t in all_templates if t.name.endswith(' - SPL')]

print(f'\nActive templates: {len(all_templates)} total')
print(f'  Normal: {len(normal_templates)}')
print(f'  SPL: {len(spl_templates)}')

print('\nNormal template roles:')
for t in normal_templates:
    status = '✓' if t.allowed_roles else '✗'
    print(f'  {status} {t.name}: {t.allowed_roles}')

print('\nSPL template roles:')
for t in spl_templates:
    status = '✓' if t.allowed_roles else '✗'
    print(f'  {status} {t.name}: {t.allowed_roles}')

# Check all templates have roles
all_have_roles = all(t.allowed_roles for t in all_templates)
if all_have_roles:
    print('\n✓ ALL TEMPLATES HAVE EXPLICIT ROLES')
else:
    print('\n✗ SOME TEMPLATES MISSING ROLES!')

# Phase 2: Test user filtering
print('\n' + '-'*80)
print('Phase 2: User Template Filtering Test')
print('-'*80)

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

# Test regular user
if regular_user:
    print(f'\nTest User 1 (Regular Staff): {regular_user.username}')
    print(f'  Roles: {list(regular_user.user_roles.values_list("role__name", flat=True))}')
    
    visible = [t for t in all_templates if can_user_apply_with_template(regular_user, t)]
    visible_normal = [t for t in visible if not t.name.endswith(' - SPL')]
    visible_spl = [t for t in visible if t.name.endswith(' - SPL')]
    
    print(f'  Can see: {len(visible)} templates')
    print(f'    Normal: {len(visible_normal)} (expected: {len(normal_templates)})')
    print(f'    SPL: {len(visible_spl)} (expected: 0)')
    
    test1_pass = len(visible_normal) == len(normal_templates) and len(visible_spl) == 0
    if test1_pass:
        print('  ✓ PASS: Regular user sees only normal templates')
    else:
        print('  ✗ FAIL: Unexpected template visibility')
        if visible_spl:
            print('    Wrong templates visible:')
            for t in visible_spl:
                print(f'      - {t.name}')
else:
    print('\n✗ No regular staff user found')
    test1_pass = False

# Test SPL user
if spl_user:
    print(f'\nTest User 2 (SPL Admin): {spl_user.username}')
    print(f'  Roles: {list(spl_user.user_roles.values_list("role__name", flat=True))}')
    
    visible = [t for t in all_templates if can_user_apply_with_template(spl_user, t)]
    visible_normal = [t for t in visible if not t.name.endswith(' - SPL')]
    visible_spl = [t for t in visible if t.name.endswith(' - SPL')]
    
    print(f'  Can see: {len(visible)} templates')
    print(f'    Normal: {len(visible_normal)} (expected: 0)')
    print(f'    SPL: {len(visible_spl)} (expected: {len(spl_templates)})')
    
    test2_pass = len(visible_normal) == 0 and len(visible_spl) == len(spl_templates)
    if test2_pass:
        print('  ✓ PASS: SPL user sees only SPL templates')
    else:
        print('  ✗ FAIL: Unexpected template visibility')
        if visible_normal:
            print('    Wrong templates visible:')
            for t in visible_normal:
                print(f'      - {t.name}')
else:
    print('\n✗ No SPL user found')
    test2_pass = False

# Final summary
print('\n' + '='*80)
print('FINAL RESULT')
print('='*80)

if all_have_roles and test1_pass and test2_pass:
    print('\n✓✓✓ ALL TESTS PASSED ✓✓✓')
    print('\nSPL template separation is working correctly:')
    print('  • All templates have explicit allowed_roles')
    print('  • Regular staff see only normal templates')
    print('  • SPL admins see only SPL templates')
    print('  • Template filtering logic is correct')
else:
    print('\n✗✗✗ SOME TESTS FAILED ✗✗✗')
    if not all_have_roles:
        print('  • Some templates missing allowed_roles')
    if not test1_pass:
        print('  • Regular user filtering failed')
    if not test2_pass:
        print('  • SPL user filtering failed')

print('\n' + '='*80 + '\n')
