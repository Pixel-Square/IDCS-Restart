# COL Holiday Handling Implementation Summary

## Overview
Implemented comprehensive holiday handling for COL (Compensatory Off Leave) with 5 distinct scenarios.

## Scenarios Implemented

### Scenario 1: Staff Work on Holiday
**Issue**: When some staff come to college on a holiday, system should save their attendance only without marking absent staff.

**Implementation**:
- Location: `backend/staff_attendance/views.py` - `upload()` method
- Logic: On holidays, only save attendance records if biometric data (IN/OUT times) exists
- If no biometric data on holiday, skip record creation (don't mark absent)
- Award COL automatically when staff work on holidays

**Status**: ✅ Passing

### Scenario 2: COL Form Approval on Holidays
**Issue**: When staff applies for COL (to earn COL by working on holiday) and form is approved, system should treat that holiday as a normal working day and create attendance records.

**Implementation**:
- Location: `backend/staff_requests/views.py` - `_process_attendance_action()` method
- Added logic to detect COL earn templates and permission forms (like Late Entry)
- For these templates, do NOT skip holidays - process them as working days
- Creates attendance records on holiday dates when COL form is approved

**Changes**:
```python
# Check if template is COL earn or permission form
is_col_earn = (
    leave_policy and 
    leave_policy.get('action') == 'earn' and 
    ('compensatory' in template.name.lower() or 'col' in template.name.lower())
)

is_permission_form = (
    attendance_action and 
    attendance_action.get('change_status') == True
)

# Don't skip holidays for these forms
if (is_holiday or is_sunday) and not (is_col_earn or is_permission_form):
    # Skip holiday for regular leave forms only
    logger.info(f'Skipping {date} (Holiday/Sunday)')
    continue
```

**Status**: ✅ Passing

### Scenario 3: COL Revocation for Absent Staff
**Issue**: If staff has approved COL form but CSV upload shows they were actually absent (no biometric data), remove the COL that was awarded during form approval.

**Implementation**:
- Location: `backend/staff_attendance/views.py` - `_check_and_revoke_col_for_absence()` method
- New method checks if staff has approved COL request for a date
- If attendance record exists but staff is marked absent, revoke the COL
- Called during CSV upload after processing holiday dates

**Method**:
```python
def _check_and_revoke_col_for_absence(self, user, holiday_date):
    """
    Check if staff has approved COL earn form for this holiday but is actually absent.
    If so, revoke the COL that was awarded when form was approved.
    """
    # Find COL template
    col_template = RequestTemplate.objects.filter(...)
    
    # Check for approved COL requests covering this date
    approved_col_requests = StaffRequest.objects.filter(
        applicant=user,
        template=col_template,
        status='approved'
    )
    
    # If request covers date, revoke COL
    if covers_date:
        balance.balance -= 1
        balance.save()
        logger.warning(f"Revoked COL for {user.username} on {holiday_date}")
```

**Integration**: Called in upload() for today, yesterday, and backfill dates when no biometric data exists on holidays

**Status**: ✅ Passing

### Scenario 4: COL Restoration for Late Entry Permission
**Issue**: When late entry permission is approved on a holiday (making staff present after being marked absent), re-award the COL that was previously revoked.

**Implementation**:
- Location: `backend/staff_requests/views.py` - `_process_attendance_action()` method
- Added COL restoration logic at the end of attendance action processing
- Checks if the approval makes staff present on a holiday date
- Awards COL for working on holiday after late entry approval

**Logic**:
```python
# After updating attendance records
is_making_present = (to_status in ['present', 'half_day', 'partial'])

if is_making_present and updated_count > 0:
    for check_date in dates_to_check:
        is_holiday = Holiday.objects.filter(date=check_date).exists()
        if is_holiday:
            # Award COL for working on holiday
            balance.balance += 1
            balance.save()
            logger.info(f"Late entry permission - awarded COL for {check_date}")
```

**Status**: ✅ Passing

### Scenario 5: Multi-Date Backfill After Holidays
**Issue**: When PS uploads attendance after a holiday, should also process the last working day before the holiday gap.

**Implementation**:
- Location: `backend/staff_attendance/views.py` - `upload()` method
- Existing backfill logic already handles this correctly
- Backfill range: D1 to D(yesterday-1) naturally includes last working day
- No additional changes needed

**Example**:
- Upload on March 10 (Monday) after March 8-9 holiday
- Backfill processes D1-D8, which includes March 7 (last working day)

**Status**: ✅ Passing (Already working)

## Bug Fixes Along the Way

### 1. Notes Template Formatting Error
**Issue**: When processing late entry permissions on holidays, notes template expected fields (shift, late_duration) that weren't in form_data, causing KeyError.

**Fix**: Wrapped all `notes_template.format(**form_data)` calls in try-except blocks:
```python
try:
    note = notes_template.format(**form_data)
    if record.notes:
        record.notes = f"{record.notes}; {note}"
    else:
        record.notes = note
except (KeyError, ValueError) as e:
    logger.warning(f'Failed to format notes template: {e}')
```

## Testing

### Test Script: `test_col_holiday_scenarios.py`
Comprehensive test script created to validate all 5 scenarios:

1. Creates test holiday (March 15, 2024)
2. Sets up 3 test users (A, B, C)
3. Runs each scenario independently
4. Validates COL balance changes and attendance records
5. Cleans up test data

### Test Results
```
================================================================================
TEST SUMMARY
================================================================================
✓ Scenario 1: PASS
✓ Scenario 2: PASS
✓ Scenario 3: PASS
✓ Scenario 4: PASS
✓ Scenario 5: PASS

5/5 tests passed

✓ All tests passed!
```

## Files Modified

1. **backend/staff_attendance/views.py**
   - Added `_check_and_revoke_col_for_absence()` method
   - Modified `upload()` to check for absent staff on holidays and revoke COL
   - Updated holiday processing logic for today, yesterday, and backfill

2. **backend/staff_requests/views.py**
   - Modified `_process_attendance_action()` to not skip holidays for COL earn and permission forms
   - Added COL restoration logic for late entry permissions on holidays
   - Wrapped notes template formatting in try-except for error handling

3. **backend/scripts/test_col_holiday_scenarios.py** (NEW)
   - Comprehensive test suite for all 5 COL holiday scenarios

## Database Impact
No schema changes required. All logic uses existing models:
- `Holiday` - tracks holidays
- `AttendanceRecord` - stores attendance with statuses
- `StaffRequest` - leave/permission requests
- `RequestTemplate` - form templates with policies
- `StaffLeaveBalance` - COL and other leave balances

## Backward Compatibility
✅ All changes are backward compatible:
- Existing attendance upload flow unchanged for non-holiday dates
- Holiday handling enhanced but doesn't break existing behavior
- COL auto-award logic preserved for staff who work on holidays
- Additional checks only activate when specific conditions met

## Future Considerations

1. **COL Balance History**: Consider tracking individual COL transactions (earned, used, revoked) for audit trail
2. **Notification System**: Send alerts when COL is revoked or restored
3. **Dashboard Updates**: Show COL earned/revoked in staff calendar views
4. **Bulk Operations**: Handle scenarios where multiple holidays processed in single upload

## Usage Examples

### Staff Works on Holiday
```csv
USER_ID,D15
12345,09:00-17:00
```
Result: Attendance saved, COL +1

### Staff Applies COL Form
1. Staff submits COL form for March 15 (holiday)
2. Form approved → attendance record created
3. CSV uploaded with no data → marked absent, COL revoked
4. Late entry approved → marked present, COL restored

### Upload After Holiday Weekend
- Friday (last working day): D14
- Saturday-Sunday: holidays
- Monday upload: Processes D1-D14 (includes Friday)

## Logging
All operations logged with clear prefixes:
- `[COL_REVOKE]` - COL revocation events
- `[COL_RESTORE]` - COL restoration events
- `[AttendanceAction]` - Form approval processing
- See Django logs for detailed flow

## Conclusion
Successfully implemented complex COL holiday handling with:
- ✅ Smart holiday detection
- ✅ Automatic COL awarding/revoking
- ✅ Form-based holiday processing
- ✅ Late entry support
- ✅ Comprehensive testing
- ✅ Backward compatibility maintained
