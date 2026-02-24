# Timetable Swap Issues - Root Cause Analysis & Fixes

**Date:** February 23, 2026  
**Issue:** Period swaps not displaying correctly for both staff members

---

## ROOT CAUSES IDENTIFIED

### 1. **Staff Visibility Problem** (CRITICAL)
**Location:** `backend/timetable/views.py` - `StaffTimetableView` class (lines ~1354-1375)

**The Problem:**
When a swap was created between two different subjects taught by different staff:
- Period 2: Subject A (Staff X) ↔ Period 3: Subject B (Staff Y)

The swap created TWO `SpecialTimetableEntry` records:
1. Period 2 entry: `staff=Staff Y` (the new staff for this period)
2. Period 3 entry: `staff=Staff X` (the new staff for this period)

The original `StaffTimetableView` logic was:
```python
if explicit_staff:
    # Only show to the explicitly assigned staff
    if getattr(explicit_staff, 'id', None) == getattr(staff_profile, 'id', None):
        include_special = True
```

**Result:**
- Staff X only saw Period 3 swap (where they were assigned)
- Staff Y only saw Period 2 swap (where they were assigned)
- **Neither staff saw the COMPLETE picture of the swap!**

**The Fix:**
Added special handling for swap entries to show them to BOTH staff members involved:
```python
if is_swap_entry:
    # For swaps: check if current staff teaches any subject in this section on this day
    swap_section = getattr(e.timetable, 'section', None)
    if swap_section:
        day_of_week = e.date.isoweekday()
        staff_teaches_here = TimetableAssignment.objects.filter(
            section=swap_section, day=day_of_week, staff=staff_profile
        ).exists()
        if staff_teaches_here:
            include_special = True
```

**Logic:** If it's a swap entry, show it to ANY staff member who teaches in that section on that day.

---

### 2. **Period Numbering Confusion**
**Location:** `frontend/src/pages/staff/TimetableView.tsx`

**The Problem:**
Period numbers displayed in the swap confirmation were showing:
- Database IDs (e.g., Period 243, Period 244)
- OR grid indices including breaks (e.g., Period 4 when user selected 3rd teaching period)

**The Fix:**
Added `getPeriodNumber()` helper function:
```typescript
const getPeriodNumber = (periodId: number, periods: any[]): number => {
  let count = 0
  for (const p of periods) {
    if (!p.is_break && !p.is_lunch) count++
    if (p.id === periodId) return count
  }
  return count
}
```

This counts only actual teaching periods (excluding breaks/lunch) to show correct numbering (1, 2, 3, ...).

---

### 3. **Swap Display Logic**
**Location:** `frontend/src/pages/staff/TimetableView.tsx` (lines ~563-571)

**The Problem:**
Swap entries were showing "[SWAP] 2026-02-28" instead of the actual swapped subject name.

**The Fix:**
Updated the display logic to:
```typescript
{isSwapEntry 
  ? shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
  : isSpecial 
    ? (a.timetable_name?.replace(/^\[SWAP\]\s*\S+\s*/, '') || 'Special') 
    : shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
}
```

Now swap entries show the actual subject name, not the timetable name.

---

## TESTING THE FIX

### 1. **Use the Debug Script**
```bash
cd backend
python manage.py shell < scripts/debug_swap.py
```

This will show:
- Normal timetable assignments for the section/day
- All swap entries created
- Which staff should see what

### 2. **What to Verify**

After applying the fix and restarting the Django server:

1. **Create a swap** between two different subjects (Period 2 & Period 3, Sunday)
2. **Check Staff X's timetable:**
   - Should see BOTH periods with swap indicators
   - Period 2 should show Subject B with Staff Y
   - Period 3 should show Subject A with Staff X
3. **Check Staff Y's timetable:**
   - Should see BOTH periods with swap indicators  
   - Period 2 should show Subject B with Staff Y
   - Period 3 should show Subject A with Staff X

### 3. **Check the Logs**
After creating a swap, check Django logs for:
```
Creating swap for section AI&DS 2023 A on 2026-02-23:
  Period <ID>: <Subject A> (staff=<X>) → <Subject B> (staff=<Y>)
  Period <ID>: <Subject B> (staff=<Y>) → <Subject A> (staff=<X>)
```

---

## FILES MODIFIED

1. **backend/timetable/views.py**
   - Line ~560: Added debug logging for swap creation
   - Line ~1360: Fixed staff filtering for swap entries

2. **frontend/src/pages/staff/TimetableView.tsx**
   - Line ~76: Added `getPeriodNumber()` helper
   - Line ~74: Added period numbers to swap confirmation state
   - Line ~414: Updated confirmation dialog to show correct period numbers
   - Line ~565: Fixed swap entry display to show subject name

3. **backend/scripts/debug_swap.py** (NEW)
   - Debug utility to inspect swap entries

---

## EXPECTED BEHAVIOR AFTER FIX

✅ **Both staff members** see the complete swap in their timetables  
✅ **Period numbers** show correctly (1-7, excluding breaks)  
✅ **Swap entries** display the actual subject names  
✅ **Confirmation dialog** shows correct period numbers and subject names  
✅ **Logs** show detailed swap creation information  

---

## TO RESTART THE SERVER

```bash
cd backend
python manage.py runserver
```

Then test the swap functionality in the frontend.
