# Leave Status Preservation in Attendance Upload

## Issue Description

When staff attendance CSV is uploaded, it should:
1. **Override default biometric statuses** (present, absent, partial, half_day) with updated data
2. **Preserve leave form statuses** (CL, OD, ML, COL, etc.) set by approved leave applications

### Problem Scenario

**Real-world flow:**
1. **9:00 AM (Today)** - PS uploads attendance CSV
   - Staff arrived at 8:30 AM
   - No evening_out time yet (staff still working)
   - System creates: FN='present', AN='absent'

2. **10:00 AM (Today)** - Staff submits leave form for afternoon
   - Leave form approved: AN='CL' (Casual Leave)
   - System updates: FN='present', AN='CL'

3. **9:00 AM (Tomorrow)** - PS uploads next day's attendance CSV
   - D9 column contains yesterday's full data: "08:30 - 17:00"
   - System should:
     - ✅ Keep FN='present' (already correct)
     - ✅ Keep AN='CL' (MUST preserve leave status)
     - ❌ Should NOT change AN to 'present' based on biometric time

## Root Cause

The original code in `backend/staff_attendance/views.py` checked if the **overall status** was biometric before calling `update_status()`:

```python
BIOMETRIC_STATUSES = ['present', 'absent', 'partial', 'half_day']
if record.status in BIOMETRIC_STATUSES:
    record.update_status()
```

**Problem:** This check was too broad. If the overall status was 'half_day' (FN present + AN leave), it would call `update_status()`, which correctly preserved leave statuses. But if the overall status was a leave code like 'CL', it would skip the update entirely - even if some sessions had biometric statuses that should be recalculated.

## Solution

**Remove the outer conditional check** and always call `update_status()`. The method itself has granular checks for each session (FN/AN):

### Updated Code (views.py lines 632-638)

```python
# Always recompute status for both NEW and UPDATED records
# The update_status() method intelligently preserves leave statuses (CL, OD, ML, COL, etc.)
# for individual FN/AN sessions while recalculating biometric statuses (present, absent, etc.)
# This ensures:
# 1. Default 'absent' statuses CAN be overridden by CSV uploads (e.g., tomorrow's upload adds evening_out)
# 2. Leave form statuses (CL, OD, etc.) CANNOT be overridden by CSV uploads (preserved by update_status)
record.update_status()
```

### How update_status() Preserves Leave Statuses (models.py)

The `update_status()` method checks **each session individually**:

```python
BIOMETRIC_STATUSES = ['present', 'absent', 'partial', 'half_day']

# Calculate FN status (only if current status is biometric)
if self.fn_status in BIOMETRIC_STATUSES:
    # Recalculate FN based on morning_in time
    if self.morning_in:
        if self.morning_in <= in_limit:
            self.fn_status = 'present'
        else:
            self.fn_status = 'absent'
    else:
        self.fn_status = 'absent'
# else: Preserve leave status (CL, OD, ML, COL, etc.)

# Calculate AN status (only if current status is biometric)
if self.an_status in BIOMETRIC_STATUSES:
    # Recalculate AN based on morning_in, evening_out, and time limits
    if self.morning_in and self.evening_out:
        if self.morning_in > mid_split or self.evening_out < out_limit:
            self.an_status = 'absent'
        else:
            self.an_status = 'present'
    # ... more logic
# else: Preserve leave status (CL, OD, ML, COL, etc.)

# Recalculate overall status based on FN and AN
if self.fn_status == self.an_status:
    self.status = self.fn_status
elif self.fn_status != 'absent' or self.an_status != 'absent':
    self.status = 'half_day'
else:
    self.status = 'absent'
```

## Test Scenarios

### ✅ Scenario 1: Default 'absent' CAN be overridden

**Flow:**
1. CSV upload (Day 1, 9 AM): morning_in=08:30, evening_out=None
   - FN='present', AN='absent'
2. CSV upload (Day 2, 9 AM): evening_out=17:00
   - FN='present', AN='present' ← **Updated from 'absent'**

**Result:** Default 'absent' successfully overridden with actual status.

### ✅ Scenario 2: Leave status CANNOT be overridden  

**Flow:**
1. CSV upload (Day 1, 9 AM): morning_in=08:35, evening_out=None
   - FN='present', AN='absent'
2. Leave form approved (Day 1, 10 AM): AN='CL'
   - FN='present', AN='CL'
3. CSV upload (Day 2, 9 AM): evening_out=17:00
   - FN='present', AN='CL' ← **Preserved (not changed to 'present')**

**Result:** Leave status 'CL' preserved despite biometric data showing evening_out.

### ✅ Scenario 3: Full day leave preserved with biometric times

**Flow:**
1. Leave form approved: FN='OD', AN='OD', status='OD'
2. CSV upload provides: morning_in=08:30, evening_out=17:00
   - FN='OD', AN='OD', status='OD' ← **All preserved**

**Result:** Full day ON duty status preserved even though staff came to work.

### ✅ Scenario 4: Mixed statuses (FN leave + AN biometric)

**Flow:**
1. Leave form sets FN='CL', staff came at noon
   - FN='CL', AN='absent'
2. CSV upload provides: evening_out=17:30
   - FN='CL' ← **Preserved**
   - AN='present' ← **Updated from 'absent'**

**Result:** FN leave preserved, AN biometric recalculated correctly.

## Verification

Run the test script:

```bash
cd backend
python scripts/test_leave_status_preservation.py
```

**Expected output:**
```
✅ ALL TESTS PASSED!

Summary:
  ✓ Default 'absent' statuses CAN be overridden by CSV uploads
  ✓ Leave statuses (CL, OD, ML, COL) CANNOT be overridden by CSV uploads
  ✓ Full day leave statuses are preserved even with biometric times
  ✓ Mixed statuses (FN leave + AN biometric) handled correctly
```

## Impact

### Before Fix
- If overall status was a leave code, CSV uploads might not recalculate any statuses
- Risk of inconsistent states where biometric times exist but statuses aren't updated

### After Fix
- CSV uploads always recalculate statuses intelligently
- Leave statuses are guaranteed to be preserved at the session level (FN/AN)
- Biometric statuses are properly updated when new data arrives
- System correctly handles mixed scenarios (one session leave, other session biometric)

## Related Files

- **backend/staff_attendance/views.py**: `_upsert_record()` method (lines 581-655)
- **backend/staff_attendance/models.py**: `update_status()` method (lines 49-145)
- **backend/scripts/test_leave_status_preservation.py**: Comprehensive test suite

## Summary

The fix ensures that:
1. **Always call `update_status()`** after updating attendance times
2. The method itself has proper checks to **preserve leave statuses** for individual sessions
3. **Biometric statuses** (present, absent, partial, half_day) are recalculated based on new data
4. **Leave form statuses** (CL, OD, ML, COL, etc.) take precedence over biometric data
5. Mixed scenarios (one session leave, other biometric) are handled correctly

**Key principle:** Leave forms represent official HR decisions and must not be overridden by automated biometric calculations. Biometric times are stored for reference, but leave statuses take precedence.
