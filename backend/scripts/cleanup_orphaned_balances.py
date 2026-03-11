"""
Clean up leave balance records that don't match any active template.

This removes orphaned balance records from the database.
"""
from staff_requests.models import StaffLeaveBalance, RequestTemplate

print('\n' + '='*80)
print('Leave Balance Cleanup')
print('='*80 + '\n')

# Get all active template names
active_template_names = set(RequestTemplate.objects.filter(is_active=True).values_list('name', flat=True))

print(f'Active templates: {len(active_template_names)}')
for name in sorted(active_template_names):
    print(f'  - {name}')

# Find balances that don't match any active template
all_balances = StaffLeaveBalance.objects.all()
orphaned_balances = []

for balance in all_balances:
    if balance.leave_type not in active_template_names:
        orphaned_balances.append(balance)

print(f'\nTotal balance records: {all_balances.count()}')
print(f'Orphaned balance records: {len(orphaned_balances)}')

if orphaned_balances:
    print('\nOrphaned balances to be deleted:')
    for balance in orphaned_balances:
        print(f'  - {balance.staff.username}: {balance.leave_type} = {balance.balance}')
    
    # Delete orphaned balances
    deleted_count = 0
    for balance in orphaned_balances:
        balance.delete()
        deleted_count += 1
    
    print(f'\n✓ Deleted {deleted_count} orphaned balance records')
else:
    print('\n✓ No orphaned balance records found')

print('\n' + '='*80 + '\n')
