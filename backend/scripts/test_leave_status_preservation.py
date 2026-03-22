#!/usr/bin/env python
"""
Test script to verify that CSV uploads preserve leave statuses while overriding biometric statuses.

This demonstrates the fix for the issue where:
1. Default 'absent' statuses CAN be overridden by CSV uploads (expected behavior)
2. Leave form statuses (CL, OD, etc.) CANNOT be overridden by CSV uploads (must be preserved)
"""
import os
import sys
import django
from datetime import date, time

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.contrib.auth import get_user_model
from staff_attendance.models import AttendanceRecord, AttendanceSettings

User = get_user_model()

def setup_test_data():
    """Create test user and attendance settings"""
    print("Setting up test data...")
    
    # Get or create a test user
    user, created = User.objects.get_or_create(
        username='teststaff001',
        defaults={'email': 'teststaff@example.com'}
    )
    if created:
        print(f"  Created test user: {user.username}")
    else:
        print(f"  Using existing test user: {user.username}")
    
    # Ensure attendance settings exist
    settings, created = AttendanceSettings.objects.get_or_create(
        id=1,
        defaults={
            'apply_time_based_absence': True,
            'attendance_in_time_limit': time(8, 45),
            'attendance_out_time_limit': time(17, 0),
            'mid_time_split': time(13, 0),
        }
    )
    if created:
        print(f"  Created attendance settings")
    else:
        print(f"  Using existing attendance settings")
    
    return user


def test_scenario_1_default_absent_can_be_overridden():
    """
    Scenario 1: Default 'absent' statuses CAN be overridden by CSV uploads
    
    Flow:
    1. Today's CSV upload (9 AM) creates record with morning_in, no evening_out
       - FN: 'present' (came on time)
       - AN: 'absent' (no evening_out yet)
    2. Tomorrow's CSV upload provides yesterday's evening_out
       - Should UPDATE AN from 'absent' to 'present'
    """
    print("\n" + "="*80)
    print("SCENARIO 1: Default 'absent' status CAN be overridden by CSV upload")
    print("="*80)
    
    user = User.objects.get(username='teststaff001')
    test_date = date(2026, 3, 10)
    
    # Step 1: Today's upload (9 AM on March 10) - only morning_in available
    print("\nStep 1: Today's CSV upload (9 AM) - staff arrived at 8:30, no evening_out yet")
    record = AttendanceRecord.objects.create(
        user=user,
        date=test_date,
        morning_in=time(8, 30),  # Came on time
        evening_out=None,        # Not available yet
        source_file='march_2026.csv'
    )
    record.update_status()
    record.save()
    
    print(f"  Created record:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'present', f"Expected FN='present', got '{record.fn_status}'"
    assert record.an_status == 'absent', f"Expected AN='absent', got '{record.an_status}'"
    print("  ✓ FN is 'present' (came on time)")
    print("  ✓ AN is 'absent' (no evening_out yet)")
    
    # Step 2: Tomorrow's upload (9 AM on March 11) - yesterday's evening_out now available
    print("\nStep 2: Tomorrow's CSV upload (9 AM next day) - yesterday's evening_out=17:00")
    record.evening_out = time(17, 0)  # Staff left at 5 PM yesterday
    record.update_status()
    record.save()
    
    print(f"  Updated record:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'present', f"Expected FN='present', got '{record.fn_status}'"
    assert record.an_status == 'present', f"Expected AN='present', got '{record.an_status}'"
    assert record.status == 'present', f"Expected status='present', got '{record.status}'"
    print("  ✓ AN updated from 'absent' to 'present' (evening_out provided)")
    print("  ✓ Overall status updated to 'present' (full day present)")
    
    # Cleanup
    record.delete()
    print("\n✅ SCENARIO 1 PASSED: Default 'absent' was successfully overridden")


def test_scenario_2_leave_status_cannot_be_overridden():
    """
    Scenario 2: Leave form statuses CANNOT be overridden by CSV uploads
    
    Flow:
    1. Today's CSV upload (9 AM) creates record with morning_in, no evening_out
       - FN: 'present' (came on time)
       - AN: 'absent' (no evening_out yet)
    2. Staff submits leave form for today's AN at 10 AM, form approved
       - AN: 'CL' (casual leave approved)
    3. Tomorrow's CSV upload provides yesterday's evening_out
       - Should NOT override AN (keep 'CL')
       - Should keep FN as 'present'
    """
    print("\n" + "="*80)
    print("SCENARIO 2: Leave status CANNOT be overridden by CSV upload")
    print("="*80)
    
    user = User.objects.get(username='teststaff001')
    test_date = date(2026, 3, 11)
    
    # Step 1: Today's upload (9 AM on March 11) - only morning_in available
    print("\nStep 1: Today's CSV upload (9 AM) - staff arrived at 8:35, no evening_out yet")
    record = AttendanceRecord.objects.create(
        user=user,
        date=test_date,
        morning_in=time(8, 35),  # Came on time
        evening_out=None,        # Not available yet
        source_file='march_2026.csv'
    )
    record.update_status()
    record.save()
    
    print(f"  Created record:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'present', f"Expected FN='present', got '{record.fn_status}'"
    assert record.an_status == 'absent', f"Expected AN='absent', got '{record.an_status}'"
    print("  ✓ FN is 'present' (came on time)")
    print("  ✓ AN is 'absent' (no evening_out yet)")
    
    # Step 2: Leave form approved (10 AM same day) - sets AN to 'CL'
    print("\nStep 2: Leave form approved at 10 AM - AN set to 'CL' (Casual Leave)")
    record.an_status = 'CL'  # Leave form sets AN to Casual Leave
    record.update_status()   # Recalculate overall status
    record.save()
    
    print(f"  Updated record after leave form:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'present', f"Expected FN='present', got '{record.fn_status}'"
    assert record.an_status == 'CL', f"Expected AN='CL', got '{record.an_status}'"
    assert record.status == 'half_day', f"Expected status='half_day', got '{record.status}'"
    print("  ✓ AN is 'CL' (leave form approved)")
    print("  ✓ Overall status is 'half_day' (FN present, AN leave)")
    
    # Step 3: Tomorrow's upload (9 AM on March 12) - yesterday's evening_out now available
    print("\nStep 3: Tomorrow's CSV upload (9 AM next day) - yesterday's evening_out=17:00")
    print("  This should NOT override the 'CL' status on AN")
    record.evening_out = time(17, 0)  # Staff's biometric shows they left at 5 PM
    record.update_status()  # Should preserve 'CL' status on AN
    record.save()
    
    print(f"  Updated record after CSV upload:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'present', f"Expected FN='present', got '{record.fn_status}'"
    assert record.an_status == 'CL', f"Expected AN='CL' (preserved), got '{record.an_status}'"
    assert record.status == 'half_day', f"Expected status='half_day', got '{record.status}'"
    print("  ✓ AN status preserved as 'CL' (NOT overridden by CSV)")
    print("  ✓ FN remains 'present'")
    print("  ✓ Overall status remains 'half_day'")
    
    # Cleanup
    record.delete()
    print("\n✅ SCENARIO 2 PASSED: Leave status 'CL' was successfully preserved")


def test_scenario_3_full_day_leave_preserved():
    """
    Scenario 3: Full day leave status preserved even with biometric times
    
    Flow:
    1. Leave form approved for full day: FN='OD', AN='OD', status='OD'
    2. CSV upload provides biometric times (morning_in, evening_out)
    3. Should preserve both FN and AN as 'OD' (not recalculate to 'present')
    """
    print("\n" + "="*80)
    print("SCENARIO 3: Full day leave status preserved with biometric times")
    print("="*80)
    
    user = User.objects.get(username='teststaff001')
    test_date = date(2026, 3, 12)
    
    # Step 1: Leave form approved for full day OD
    print("\nStep 1: Leave form approved for full day ON duty")
    record = AttendanceRecord.objects.create(
        user=user,
        date=test_date,
        morning_in=None,
        evening_out=None,
        fn_status='OD',   # ON duty full day
        an_status='OD',
        status='OD',
        source_file='leave_form'
    )
    
    print(f"  Created record from leave form:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'OD', f"Expected FN='OD', got '{record.fn_status}'"
    assert record.an_status == 'OD', f"Expected AN='OD', got '{record.an_status}'"
    assert record.status == 'OD', f"Expected status='OD', got '{record.status}'"
    print("  ✓ Full day ON duty leave approved")
    
    # Step 2: CSV upload provides biometric times (staff attended despite leave)
    print("\nStep 2: CSV upload provides biometric times (08:30 - 17:00)")
    print("  Staff came to work despite having approved leave")
    print("  Should preserve 'OD' status (leave takes precedence)")
    record.morning_in = time(8, 30)
    record.evening_out = time(17, 0)
    record.update_status()  # Should preserve 'OD' status
    record.save()
    
    print(f"  Updated record after CSV upload:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'OD', f"Expected FN='OD' (preserved), got '{record.fn_status}'"
    assert record.an_status == 'OD', f"Expected AN='OD' (preserved), got '{record.an_status}'"
    assert record.status == 'OD', f"Expected status='OD' (preserved), got '{record.status}'"
    print("  ✓ FN status preserved as 'OD'")
    print("  ✓ AN status preserved as 'OD'")
    print("  ✓ Overall status preserved as 'OD'")
    print("  ✓ Biometric times stored but leave status takes precedence")
    
    # Cleanup
    record.delete()
    print("\n✅ SCENARIO 3 PASSED: Full day leave status was successfully preserved")


def test_scenario_4_mixed_fn_leave_an_biometric():
    """
    Scenario 4: Mixed statuses - FN has leave, AN has biometric
    
    Flow:
    1. Leave form sets FN='CL', AN is default 'absent'
    2. CSV upload provides evening_out
    3. Should preserve FN='CL' but update AN to 'present'
    """
    print("\n" + "="*80)
    print("SCENARIO 4: Mixed - FN leave preserved, AN biometric updated")
    print("="*80)
    
    user = User.objects.get(username='teststaff001')
    test_date = date(2026, 3, 13)
    
    # Step 1: Leave form sets FN='CL', came at noon for AN
    print("\nStep 1: Leave form approved for FN only (CL), staff came at 12:00 for AN")
    record = AttendanceRecord.objects.create(
        user=user,
        date=test_date,
        morning_in=time(12, 0),  # Came at noon
        evening_out=None,        # Not available yet
        fn_status='CL',          # Forenoon leave approved
        an_status='absent',      # Default (will be updated)
        source_file='leave_form_and_csv'
    )
    record.update_status()
    record.save()
    
    print(f"  Created record:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'CL', f"Expected FN='CL', got '{record.fn_status}'"
    assert record.an_status == 'absent', f"Expected AN='absent', got '{record.an_status}'"
    print("  ✓ FN is 'CL' (forenoon leave)")
    print("  ✓ AN is 'absent' (came at noon but no evening_out yet)")
    
    # Step 2: CSV upload provides evening_out
    print("\nStep 2: CSV upload provides evening_out=17:30")
    record.evening_out = time(17, 30)
    record.update_status()
    record.save()
    
    print(f"  Updated record:")
    print(f"    morning_in: {record.morning_in}")
    print(f"    evening_out: {record.evening_out}")
    print(f"    fn_status: {record.fn_status}")
    print(f"    an_status: {record.an_status}")
    print(f"    status: {record.status}")
    
    assert record.fn_status == 'CL', f"Expected FN='CL' (preserved), got '{record.fn_status}'"
    assert record.an_status == 'present', f"Expected AN='present', got '{record.an_status}'"
    assert record.status == 'half_day', f"Expected status='half_day', got '{record.status}'"
    print("  ✓ FN preserved as 'CL' (leave status not overridden)")
    print("  ✓ AN updated to 'present' (came at noon, left at 17:30)")
    print("  ✓ Overall status is 'half_day' (FN leave, AN present)")
    
    # Cleanup
    record.delete()
    print("\n✅ SCENARIO 4 PASSED: Mixed statuses handled correctly")


def main():
    """Run all test scenarios"""
    print("\n" + "="*80)
    print("ATTENDANCE STATUS PRESERVATION TESTS")
    print("Testing fix: CSV uploads preserve leave statuses while updating biometric statuses")
    print("="*80)
    
    user = setup_test_data()
    
    try:
        test_scenario_1_default_absent_can_be_overridden()
        test_scenario_2_leave_status_cannot_be_overridden()
        test_scenario_3_full_day_leave_preserved()
        test_scenario_4_mixed_fn_leave_an_biometric()
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED!")
        print("="*80)
        print("\nSummary:")
        print("  ✓ Default 'absent' statuses CAN be overridden by CSV uploads")
        print("  ✓ Leave statuses (CL, OD, ML, COL) CANNOT be overridden by CSV uploads")
        print("  ✓ Full day leave statuses are preserved even with biometric times")
        print("  ✓ Mixed statuses (FN leave + AN biometric) handled correctly")
        print("\nThe fix ensures that:")
        print("  • update_status() is always called to recalculate statuses")
        print("  • The method intelligently preserves leave codes while updating biometric codes")
        print("  • Leave forms take precedence over biometric data")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
