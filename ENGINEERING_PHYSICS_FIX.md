# Engineering Physics Subject Fix

## Problem
The Engineering Physics (Theory) subject with code **GEA1101** was missing from the department curriculum page (https://idcs.zynix.us/curriculum/department).

The page was showing:
- **GEA1102** - Engineering Physics Lab (PRACTICAL) ✓
- But **GEA1101** - Engineering Physics (THEORY) was missing ✗

## Solution
Created migration **0029_add_missing_engineering_physics.py** to add the missing subject to the database.

### What the migration does:

1. **Automatically detects the correct regulation**:
   - Looks for existing regulations that have GEA1102 (Engineering Physics Lab)
   - Creates GEA1101 for the same regulation(s)
   - Falls back to R2023 if no existing regulations are found

2. **Creates CurriculumMaster entry for GEA1101**:
   - Course Code: **GEA1101**
   - Course Name: **Engineering Physics**
   - Class Type: **THEORY**
   - Category: **ES** (Engineering Science)
   - Credits: **3**
   - Internal Marks: **40**
   - External Marks: **60**
   - Total Marks: **100**
   - L:T:P:S Hours: 2:0:0:0
   - For All Departments: **true** (applies to all teaching departments)
   - Editable: **false** (protected master data)

3. **Automatic propagation**:
   - Uses existing signal `propagate_master_to_departments` to automatically create **CurriculumDepartment** entries for all teaching departments
   - No manual backfill needed

### Frontend Impact:
- No changes needed to frontend code
- Frontend has no filtering that would hide this subject
- Subject will appear in curriculum table, sorted by course code (1101 < 1102)
- Will display in Semester 1 curriculum for all departments

### How to Apply:
```bash
cd backend
python3 manage.py migrate curriculum
```

The migration will:
1. Find GEA1102 entries to determine correct regulation(s)
2. Create GEA1101 in CurriculumMaster
3. Signal automatically creates department entries
4. Subject appears in frontend curriculum page

### Reverse (if needed):
```bash
python3 manage.py migrate curriculum 0028_dynamic_class_type_validation
```

This will remove all GEA1101 entries from the database.

## Files Modified
- **backend/curriculum/migrations/0029_add_missing_engineering_physics.py** (new)

## Database Models Involved
1. **CurriculumMaster** - Master curriculum data (where GEA1101 is created)
2. **CurriculumDepartment** - Department-specific curriculum (auto-created by signal)
3. **Semester** - Semester 1 reference
4. **Department** - All teaching departments

## Architecture Notes
- The signal `propagate_master_to_departments` in [backend/curriculum/signals.py](backend/curriculum/signals.py#L5) handles automatic propagation from master to departments
- No subject is hidden by frontend filtering - all subjects are displayed
- Course sorting is by course_code within each semester
