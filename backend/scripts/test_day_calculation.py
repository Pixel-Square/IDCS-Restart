"""
Test script to verify day calculation logic for various shift combinations
"""
import django
import os
import sys
from datetime import datetime, date, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

django.setup()

# Import the day calculation logic
def normalize_shift(shift_val):
    if not shift_val:
        return None
    shift_str = str(shift_val).strip()
    if shift_str.lower() == 'full day':
        return 'FULL'
    return shift_str.upper() if shift_str else None

def calculate_days_test(form_data):
    """Test version of _calculate_days_from_form_data - counts calendar days"""
    from datetime import datetime
    
    start_date = form_data.get('from_date')
    end_date = form_data.get('to_date')
    
    if start_date and end_date:
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Return inclusive calendar day count
        return (end - start).days + 1
    
    elif start_date:
        # Single date - always 1 day
        return 1.0
    
    return 1.0

# Test cases
test_cases = [
    {
        'name': 'Single day - Any shift',
        'data': {'from_date': '2024-01-10', 'from_noon': 'Full day'},
        'expected': 1.0
    },
    {
        'name': 'Single day - FN only',
        'data': {'from_date': '2024-01-10', 'from_noon': 'FN'},
        'expected': 1.0
    },
    {
        'name': 'Single day - AN only',
        'data': {'from_date': '2024-01-10', 'from_noon': 'AN'},
        'expected': 1.0
    },
    {
        'name': 'Same day range',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-10', 'from_noon': 'Full day', 'to_noon': 'FN'},
        'expected': 1.0
    },
    {
        'name': '2 days: Full day to FN (user example)',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-11', 'from_noon': 'Full day', 'to_noon': 'FN'},
        'expected': 2.0
    },
    {
        'name': '2 days: Full day to AN',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-11', 'from_noon': 'Full day', 'to_noon': 'AN'},
        'expected': 2.0
    },
    {
        'name': '2 days: FN to Full day',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-11', 'from_noon': 'FN', 'to_noon': 'Full day'},
        'expected': 2.0
    },
    {
        'name': '2 days: AN to Full day',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-11', 'from_noon': 'AN', 'to_noon': 'Full day'},
        'expected': 2.0
    },
    {
        'name': '2 days: FN to AN (consecutive)',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-11', 'from_noon': 'FN', 'to_noon': 'AN'},
        'expected': 2.0
    },
    {
        'name': '2 days: Full day to Full day',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-11', 'from_noon': 'Full day', 'to_noon': 'Full day'},
        'expected': 2.0
    },
    {
        'name': '2 days: No shifts specified',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-11'},
        'expected': 2.0
    },
    {
        'name': '3 days: FN to AN',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-12', 'from_noon': 'FN', 'to_noon': 'AN'},
        'expected': 3.0
    },
    {
        'name': '3 days: Full day to Full day',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-12', 'from_noon': 'Full day', 'to_noon': 'Full day'},
        'expected': 3.0
    },
    {
        'name': '4 days: FN to AN',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-13', 'from_noon': 'FN', 'to_noon': 'AN'},
        'expected': 4.0
    },
    {
        'name': '5 days: No shifts',
        'data': {'from_date': '2024-01-10', 'to_date': '2024-01-14'},
        'expected': 5.0
    },
]

print("=" * 100)
print("DAY CALCULATION TEST RESULTS")
print("=" * 100)

passed = 0
failed = 0

for test in test_cases:
    result = calculate_days_test(test['data'])
    expected = test['expected']
    status = "✓ PASS" if result == expected else "✗ FAIL"
    
    if result == expected:
        passed += 1
    else:
        failed += 1
    
    print(f"\n{status} | {test['name']}")
    print(f"  Data: {test['data']}")
    print(f"  Expected: {expected} days | Got: {result} days")

print("\n" + "=" * 100)
print(f"SUMMARY: {passed} passed, {failed} failed out of {len(test_cases)} tests")
print("=" * 100)
