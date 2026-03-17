"""
Migrate leave balances from normal templates to SPL templates for users with SPL roles.

For users with SPL roles (HOD, IQAC, HR, etc.), transfer their balances from normal
templates to the corresponding SPL templates.
"""
from django.contrib.auth import get_user_model
from staff_requests.models import StaffLeaveBalance, RequestTemplate

User = get_user_model()

print('\n' + '='*80)
print('Migrate Balances to SPL Templates')
print('='*80 + '\n')

SPL_ROLES = {'IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA'}

# Get all active templates
normal_templates = {t.name: t for t in RequestTemplate.objects.filter(is_active=True).exclude(name__endswith=' - SPL')}
spl_templates = {t.name.replace(' - SPL', ''): t for t in RequestTemplate.objects.filter(is_active=True, name__endswith=' - SPL')}

print(f'Normal templates: {len(normal_templates)}')
print(f'SPL templates: {len(spl_templates)}')

# Find users with SPL roles
spl_users = []
for user in User.objects.filter(is_superuser=False).prefetch_related('user_roles__role'):
    user_role_names = set(user.user_roles.values_list('role__name', flat=True))
    if user_role_names & SPL_ROLES:
        spl_users.append(user)

print(f'\nFound {len(spl_users)} users with SPL roles')

# Migrate balances
migrated_count = 0
deleted_count = 0

for user in spl_users:
    user_balances = StaffLeaveBalance.objects.filter(staff=user)
    
    for balance in user_balances:
        # Check if this is a normal template balance
        if balance.leave_type in normal_templates:
            # Check if corresponding SPL template exists
            spl_template_name = balance.leave_type + ' - SPL'
            
            if balance.leave_type in spl_templates:
                print(f'\n{user.username}: Migrating {balance.leave_type} -> {spl_template_name}')
                print(f'  Balance: {balance.balance}')
                
                # Check if SPL balance already exists
                spl_balance, created = StaffLeaveBalance.objects.get_or_create(
                    staff=user,
                    leave_type=spl_template_name,
                    defaults={'balance': balance.balance}
                )
                
                if created:
                    print(f'  ✓ Created new SPL balance')
                    migrated_count += 1
                else:
                    print(f'  ⚠ SPL balance already exists (keeping existing value: {spl_balance.balance})')
                
                # Delete the old normal template balance
                balance.delete()
                deleted_count += 1
                print(f'  ✓ Deleted old normal template balance')

print(f'\n' + '='*80)
print(f'Migration complete!')
print(f'  Migrated: {migrated_count}')
print(f'  Deleted: {deleted_count}')
print('='*80 + '\n')
