# Full Day Leave Feature Implementation

## Overview
Added "Full day" option to leave form dropdowns (Casual Leave, ON duty, COL) to support more flexible leave applications with accurate day counting for leave balance deduction.

## Changes Made

### 1. Template Schema Updates
**Script**: `backend/scripts/add_full_day_option.py`

Added "Full day" option to `from_noon` and `to_noon` dropdowns in three templates:
- Casual Leave
- ON duty  
- Compensatory leave

**Options now available**: `['Full day', 'FN', 'AN']`

### 2. Attendance Processing Updates
**File**: `backend/staff_requests/views.py` → `_process_attendance_action()`

- Normalized "Full day" selection to internal 'FULL' code
- Updated logic to handle "Full day" for:
  - Single date applications
  - Date range applications  
  - Mixed scenarios (e.g., Full day → FN)

**Behavior**:
- `"FN"`: Only FN session marked as leave, AN preserved/untouched
- `"AN"`: Only AN session marked as leave, FN preserved/untouched  
- `"Full day"`: Both FN and AN sessions marked as leave

### 3. Leave Balance Calculation Updates
**File**: `backend/staff_requests/views.py` → `_calculate_days_from_form_data()`

Updated to calculate **calendar days** (not fractional days) for leave balance deduction:

#### Calculation Logic:
- **Calendar Day Count**: `(to_date - from_date) + 1` days
- **Single Day**: Always 1 day deducted (regardless of shift selection)
- **Multi-Day**: Full calendar day count (from_date to to_date inclusive)

**Important**: Shift selection (FN/AN/Full day) affects attendance marking only, not balance deduction.

#### Examples:

| Scenario | from_date | to_date | Days Deducted | Attendance Marking |
|----------|-----------|---------|---------------|-------------------|
| Single day (FN) | 2024-03-10 | - | 1 | Day 1: FN=Leave, AN=unchanged |
| Single day (Full day) | 2024-03-10 | - | 1 | Day 1: FN=Leave, AN=Leave |
| 2 days (Full day → FN) | 2024-03-10 | 2024-03-11 | 2 | Day 1: FN=Leave, AN=Leave<br>Day 2: FN=Leave, AN=unchanged |
| 2 days (FN → AN) | 2024-03-10 | 2024-03-11 | 2 | Day 1: FN=Leave, AN=unchanged<br>Day 2: FN=unchanged, AN=Leave |
| 2 days (Full → Full) | 2024-03-10 | 2024-03-11 | 2 | Both days: FN=Leave, AN=Leave |
| 3 days (FN → AN) | 2024-03-10 | 2024-03-12 | 3 | Day 1: FN=Leave<br>Day 2: FN=Leave, AN=Leave<br>Day 3: AN=Leave |

### 4. LOP (Loss of Pay) Calculation
LOP now increases based on calendar days (not number of forms):

- If staff has 1 day CL balance and applies for 2 days:
  - 1 day deducted from CL balance → balance becomes 0
  - 1 day overflow to LOP → LOP increases by 1

- If staff has 6 days CL and applies for 2 days:
  - 2 days deducted from CL → balance becomes 4
  - No LOP increase

**Key Point**: Calendar days from_date to to_date count for balance deduction, regardless of shift selection.

## Testing

**Test Script**: `backend/scripts/test_day_calculation.py`

Comprehensive test coverage for 15 scenarios:
- Single day applications (Full day, FN, AN)
- Same day with different shift combinations
- Multi-day ranges with various shift patterns
- Edge cases (FN to AN across 3-4 days)

**Result**: ✓ All 15 tests passed

## User-Facing Benefits

1. **More flexible leave applications**: Staff can now apply for full days or specific sessions (FN/AN)
2. **Simple balance tracking**: Leave balance deducts by calendar days (easy to understand)
3. **Fair LOP calculation**: LOP increments based on calendar days, not number of forms
4. **Accurate attendance marking**: 
   - Shifts are respected in attendance records (Full day → both sessions, FN → FN only)
   - Day 2 AN in "Full day → FN" scenario shows actual attendance if uploaded by PS
   - If no attendance uploaded for non-leave sessions, shows as "no record"

## Example

**Application**: CL from 2024-03-10 (Full day) to 2024-03-11 (FN)

**Leave Balance Deduction**:
- Initial: 6 days
- Deducted: 2 days (calendar days: 10th and 11th)
- Final: 4 days

**Attendance Records**:
- 2024-03-10: FN=CL, AN=CL (full day leave)
- 2024-03-11: FN=CL (leave), AN=preserved (shows PS upload or "no record")

## Backend Logic Flow

### When a leave request is approved:

1. **Day Calculation** (`_calculate_days_from_form_data`):
   - Parses from_date, to_date, from_noon, to_noon
   - Calculates total days considering shifts
   - Returns fractional days (e.g., 1.5 for Full day → FN)

2. **Leave Balance Deduction** (`_process_leave_balance`):
   - Deducts calculated days from leave balance
   - If insufficient balance, overflow goes to LOP
   - Handles COL claiming if applicable

3. **Attendance Update** (`_process_attendance_action`):
   - Creates/updates AttendanceRecord for each date in range
   - Sets fn_status/an_status based on shift selection
   - Preserves existing attendance data for non-leave sessions

## Important Notes

- Backward compatible: Old forms without "Full day" option continue to work
- Attendance records created with leave status won't be overwritten by PS uploads (protected by `update_status()` logic)
- Frontend calendar already supports FN/AN display (no changes needed)
- "Full day" option appears at the start of dropdown for easy access
- **Leave balance deducts by calendar days** (from_date to to_date inclusive), regardless of shift selection
- **Attendance marking respects shifts** (FN/AN/Full day) to show accurate session-wise attendance

## Files Modified

- `backend/staff_requests/views.py`: Updated day calculation and attendance processing logic
- Template schemas for: Casual Leave, ON duty, Compensatory leave

## Scripts Added

- `backend/scripts/add_full_day_option.py`: Adds "Full day" to template dropdowns
- `backend/scripts/test_day_calculation.py`: Comprehensive test suite for day calculation logic
