# Holiday Exclusion in Leave Applications

## Issue Description

When staff applies for leave across multiple days, holidays (including Sundays and marked holidays) should be:
1. **Excluded from leave balance deduction** - Only working days count
2. **Excluded from attendance record creation** - No records created for holidays

### Problem Scenario

**Before fix:**
- Staff applies leave from March 6-10 (5 calendar days)
- March 8 is a Sunday
- CL balance: 6 → 1 (deducted 5 days) ❌
- Attendance records: 5 records created (including Sunday) ❌

**After fix:**
- Staff applies leave from March 6-10 (5 calendar days)
- March 8 is a Sunday  
- CL balance: 6 → 2 (deducted 4 working days) ✅
- Attendance records: 4 records created (excludes Sunday) ✅

## User Requirement

> "If a staff applies leave from 6th march to 10th march (5 calendar days), and there is a Sunday holiday on 8th March, the CL count should change from 6 to 2 (not as 1). It should count as 4 days not as 5 days. And if CL is 0, the LOP should be from 0 to 4 (not as 5)."

## Solution

Modified two methods in `backend/staff_requests/views.py`:

### 1. Day Calculation (_calculate_days_from_form_data)

**Before:** Counted all calendar days in the date range
```python
if start and end:
    return (end - start).days + 1  # Counted all calendar days
```

**After:** Counts only working days (excludes holidays and Sundays)
```python
if start and end:
    # Get holidays in date range
    holidays_in_range = set(
        Holiday.objects.filter(date__gte=start, date__lte=end)
        .values_list('date', flat=True)
    )
    
    # Count working days only
    working_days = 0
    current_date = start
    while current_date <= end:
        is_sunday = current_date.weekday() == 6
        is_holiday = current_date in holidays_in_range
        
        if not is_holiday and not is_sunday:
            working_days += 1
        
        current_date += timedelta(days=1)
    
    return working_days
```

### 2. Attendance Record Creation (_process_attendance_action)

**Before:** Created attendance records for all dates in range
```python
while current_date <= to_date:
    # Create attendance record for current_date
    record, created = AttendanceRecord.objects.get_or_create(...)
    current_date += timedelta(days=1)
```

**After:** Skips creating records for holidays and Sundays
```python
# Get holidays in date range
holidays_in_range = set(
    Holiday.objects.filter(date__gte=from_date, date__lte=to_date)
    .values_list('date', flat=True)
)

while current_date <= to_date:
    # Skip holidays and Sundays
    is_sunday = current_date.weekday() == 6
    is_holiday = current_date in holidays_in_range
    
    if is_holiday or is_sunday:
        logger.info(f'Skipping {current_date} (Holiday/Sunday)')
        current_date += timedelta(days=1)
        continue
    
    # Create attendance record only for working days
    record, created = AttendanceRecord.objects.get_or_create(...)
    current_date += timedelta(days=1)
```

## Test Scenarios

### ✅ Scenario 1: Exclude Sunday from leave day count

**Setup:**
- CL balance: 6
- Date range: March 6-10 (5 calendar days)
- Holiday: March 8 (Sunday)

**Expected:**
- Working days calculated: 4
- CL balance after: 2 (6 - 4 = 2, not 6 - 5 = 1)
- Attendance records: 4 (March 6, 7, 9, 10 only)
- No record for March 8

**Result:** ✅ PASSED

### ✅ Scenario 2: LOP with holidays

**Setup:**
- CL balance: 0
- Date range: March 6-10 (5 calendar days)
- Holiday: March 8 (Sunday)

**Expected:**
- Working days calculated: 4
- LOP increase: 4 (not 5)

**Result:** ✅ PASSED

### ✅ Scenario 3: Multiple holidays in date range

**Setup:**
- Date range: March 6-15 (10 calendar days)
- Holidays: March 8 (Sunday), March 10 (Holiday), March 15 (Sunday)

**Expected:**
- Working days calculated: 7 (10 - 3 = 7)

**Result:** ✅ PASSED

### ✅ Scenario 4: Single day leave on a Sunday

**Setup:**
- Date: March 8 (Sunday single day)

**Expected:**
- Working days calculated: 0
- No leave balance deduction
- No attendance record created

**Result:** ✅ PASSED

## Holiday Management

The system uses the `Holiday` model from `staff_attendance` app:

```python
class Holiday(models.Model):
    date = models.DateField(unique=True)
    name = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    is_sunday = models.BooleanField(default=False)
    is_removable = models.BooleanField(default=True)
```

### Creating Holidays

**Via Admin/API:**
```python
Holiday.objects.create(
    date=date(2026, 3, 10),
    name='Public Holiday',
    notes='Independence Day',
    is_sunday=False
)
```

**Auto-generate Sundays (via API):**
```http
POST /api/staff-attendance/holidays/generate_sundays/
{
  "year": 2026,
  "month": 3
}
```

**Remove Sundays (via API):**
```http
POST /api/staff-attendance/holidays/remove_sundays/
{
  "year": 2026,
  "month": 3
}
```

## Impact on Leave Balance Calculations

### Deduct Action (CL, ML, etc.)

**Before fix:**
- March 6-10 leave (5 calendar days) → Deduct 5 days

**After fix:**
- March 6-10 leave (4 working days, 1 Sunday) → Deduct 4 days

### LOP (Loss of Pay)

**Formula:** `LOP = Total absent days - Approved leave days covering those dates`

**Before fix:**
- 5 days absent (including Sunday) → LOP = 5
- Approve 5-day leave → LOP still counted 5

**After fix:**
- 4 working days absent (Sunday excluded) → LOP = 4
- Approve leave for 4 working days → LOP correctly uses 4

### Earn Action (COL - Compensatory Off Leave)

Not affected - COL is earned on holidays/Sundays when staff work, so those dates should be counted.

## Related Files

- **backend/staff_requests/views.py**: 
  * `_calculate_days_from_form_data()` (lines 904-1030)
  * `_process_attendance_action()` (lines 1160-1500)
- **backend/staff_attendance/models.py**: `Holiday` model (lines 238-265)
- **backend/scripts/test_holiday_exclusion.py**: Comprehensive test suite

## Verification

Run test suite:
```bash
cd backend
python scripts/test_holiday_exclusion.py
```

**Expected output:**
```
✅ ALL TESTS PASSED!

Summary:
  ✓ Holidays (including Sundays) are excluded from day count
  ✓ Leave balance deduction uses working days only
  ✓ No attendance records created for holidays
  ✓ LOP calculations exclude holidays

Example from user:
  March 6-10 with Sunday March 8:
    - Calendar days: 5
    - Working days: 4 (excludes Sunday)
    - CL balance: 6 → 2 (deducted 4, not 5)
    - Attendance records: 4 (no record for Sunday)
```

## API Behavior

**Leave Request Form Data:**
```json
{
  "from_date": "2026-03-06",
  "to_date": "2026-03-10",
  "from_noon": "FN",
  "to_noon": "AN",
  "reason": "Personal leave"
}
```

**Processing:**
1. **Day calculation:** System checks Holiday table, excludes March 8 (Sunday)
2. **Working days:** 4 days calculated
3. **Balance update:** CL deducted by 4 (not 5)
4. **Attendance records:** Created for March 6, 7, 9, 10 only (skips March 8)

## Key Benefits

1. **Accurate leave balance tracking** - Only working days count toward leave
2. **Fair LOP calculation** - Staff not penalized for holidays
3. **Cleaner attendance records** - No conflicting records on holidays
4. **Simplified reporting** - Holidays clearly separated from leave days

## Edge Cases Handled

1. **Single day leave on holiday** → 0 days deducted, no record created
2. **Multiple consecutive holidays** → All excluded from count
3. **Date range with mixed holidays and Sundays** → Both types excluded
4. **Split shift leaves spanning holidays** → Only working day shifts processed

## Summary

The fix ensures that holidays (both marked holidays and Sundays) are:
- ✅ Excluded from leave day count calculations
- ✅ Excluded from attendance record creation
- ✅ Properly handled in LOP calculations
- ✅ Consistently treated across all leave types

**Key principle:** Leave is meant for working days. Holidays don't consume leave balance.
