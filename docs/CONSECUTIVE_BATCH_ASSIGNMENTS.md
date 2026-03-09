# Consecutive Batch Assignment & Elective Timetable Guide

## Overview
The IDCS system supports:
1. **Consecutive batch assignments** - Multiple batches for the same period
2. **Elective group assignments** - Common elective names (EE, PE) instead of individual subjects

## Elective Timetable Assignment

### How It Works

**For Elective Subjects:**
- Staff assigns the **elective GROUP** (e.g., "EE - Elective Elective", "PE - Professional Elective") to a period
- Individual elective subjects (e.g., "Machine Learning", "Cloud Computing") are **not shown** in the timetable assignment dropdown
- Students see their **chosen elective subject** when viewing their timetable
- The mapping happens through the `ElectiveChoice` model

**Example:**
```
Timetable Assignment:
Period 3 → "EE - Elective Elective"

Student A sees: "CS501 - Machine Learning" (their choice)
Student B sees: "CS502 - Cloud Computing" (their choice)
Student C sees: "CS503 - Data Mining" (their choice)
```

### Database Structure for Electives

1. **CurriculumDepartment** (with `is_elective=True`)
   - Represents the elective GROUP (EE, PE, OE, etc.)
   - This is what gets assigned to timetable periods
   - Example: `course_code: "EE"`, `course_name: "Elective Elective"`

2. **ElectiveSubject**
   - Individual elective options
   - Has FK `parent` pointing to `CurriculumDepartment`
   - Example: `course_code: "CS501"`, `course_name: "Machine Learning"`

3. **ElectiveChoice**
   - Maps student → elective subject they chose
   - Has FK `elective_subject` pointing to `ElectiveSubject`
   - Only active choices for current academic year are considered

### Timetable Assignment for Electives

**Step 1: Assign Elective Group to Period**
```json
POST /api/timetable/assignments/
{
  "period_id": 7,           // Period 3
  "day": 1,                 // Monday
  "section_id": 10,
  "curriculum_row_id": 450, // Points to "EE - Elective Elective" (CurriculumDepartment)
  "staff_id": 100           // Staff teaching this elective
}
```

**Step 2: Students Choose Their Electives**
Students select their specific elective subject through the elective choice interface:
```json
POST /api/curriculum/elective-choices/
{
  "elective_subject_id": 25,  // "Machine Learning"
  "student_id": 1,
  "academic_year_id": 1
}
```

**Step 3: View Timetable**
- **Staff View**: Shows "EE - Elective Elective" (the group)
- **Student View**: Shows their chosen subject "CS501 - Machine Learning"

### API Response Examples

**Staff Timetable View:**
```json
{
  "period_id": 7,
  "curriculum_row": {
    "id": 450,
    "course_code": "EE",
    "course_name": "Elective Elective"
  },
  "elective_subject": null,
  "subject_text": "EE - Elective Elective"
}
```

**Student Timetable View:**
```json
{
  "period_id": 7,
  "curriculum_row": {
    "id": 450,
    "course_code": "EE",
    "course_name": "Elective Elective"
  },
  "elective_subject": {
    "id": 25,
    "course_code": "CS501",
    "course_name": "Machine Learning"
  },
  "subject_text": "CS501 - Machine Learning",
  "elective_subject_id": 25
}
```

## Consecutive Batch Assignments

### Example Scenario
- **Period 1** (9:00 AM - 10:00 AM)
  - **Batch 1**: Subject A (Python Programming) - Staff: Dr. Smith
  - **Batch 2**: Subject B (Data Structures) - Staff: Dr. Jones

Both batches run concurrently during Period 1, with separate staff and different subjects.

## Database Design

### 1. Timetable Assignment
The `TimetableAssignment` model supports multiple assignments per period through the `subject_batch` field:

```python
class TimetableAssignment(models.Model):
    period = ForeignKey to TimetableSlot
    day = Day of week (1-7)
    section = Which section
    subject_batch = ForeignKey to StudentSubjectBatch (allows multiple batches per period)
    staff = Assigned staff
    curriculum_row = Subject from curriculum
    
    # Constraint: unique on (period, day, section, subject_batch)
    # This allows MULTIPLE assignments for same period/day/section 
    # as long as subject_batch is different
```

### 2. Attendance Sessions
The `PeriodAttendanceSession` model handles batch-wise attendance:

```python
class PeriodAttendanceSession(models.Model):
    section = Which section
    period = TimetableSlot
    date = Attendance date
    subject_batch = Batch for batch-wise attendance
    timetable_assignment = Link to timetable assignment
    assigned_to = Staff assigned to take attendance
    
    # Constraint: unique on (section, period, date, teaching_assignment, subject_batch)
    # Multiple sessions can exist for same section/period/date with different batches
```

## How to Setup Consecutive Batches

### Step 1: Create Student Subject Batches
Before assigning to timetable, create batches with students:

1. **Navigate to**: Staff → Assigned Subjects
2. **For each subject**:
   - Click "Create Batch"
   - Select students for Batch 1
   - Create another batch and select students for Batch 2
3. **Assign staff** to each batch (optional)

**API Endpoint**: `POST /api/academics/subject-batches/`
```json
{
  "name": "Batch 1",
  "curriculum_row_id": 123,
  "student_ids": [1, 2, 3, 4, 5],
  "staff_id": 10  // Optional: assign specific staff
}
```

### Step 2: Create Timetable Assignments
Assign each batch to the same period:

**For Batch 1:**
```json
POST /api/timetable/assignments/
{
  "period_id": 5,           // Period 1
  "day": 1,                 // Monday
  "section_id": 10,
  "curriculum_row_id": 123, // Subject A
  "subject_batch_id": 1,    // Batch 1
  "staff_id": 100           // Dr. Smith
}
```

**For Batch 2:**
```json
POST /api/timetable/assignments/
{
  "period_id": 5,           // Same Period 1
  "day": 1,                 // Same Monday
  "section_id": 10,         // Same section
  "curriculum_row_id": 124, // Subject B (different)
  "subject_batch_id": 2,    // Batch 2 (different)
  "staff_id": 101           // Dr. Jones (different)
}
```

**Key Points**:
- Same `period_id` and `day`
- Same `section_id`
- **Different** `subject_batch_id` (required)
- Can have different subjects and staff

### Step 3: Attendance Marking
Each batch gets its own attendance session:

**Batch 1 Attendance**:
```json
POST /api/academics/period-attendance/
{
  "section_id": 10,
  "period_id": 5,
  "date": "2026-03-09",
  "subject_batch_id": 1,    // Only Batch 1 students
  "timetable_assignment_id": 1,
  "students": [
    {"student_id": 1, "status": "PRESENT"},
    {"student_id": 2, "status": "ABSENT"}
  ]
}
```

**Batch 2 Attendance**:
```json
POST /api/academics/period-attendance/
{
  "section_id": 10,
  "period_id": 5,          // Same period
  "date": "2026-03-09",    // Same date
  "subject_batch_id": 2,   // Batch 2 students  
  "timetable_assignment_id": 2,
  "students": [
    {"student_id": 3, "status": "PRESENT"},
    {"student_id": 4, "status": "PRESENT"}
  ]
}
```

## Staff Assignment
- Each batch can have its own assigned staff via `subject_batch.staff`
- The timetable assignment can also specify a staff override
- For attendance marking, the effective staff is:
  1. Batch's assigned staff (if set)
  2. Otherwise, timetable assignment's staff

## Database Constraints

### Timetable Constraints
```sql
-- Allows multiple assignments for same period/day/section with different batches
UNIQUE (period, day, section, subject_batch)
```

### Attendance Constraints  
```sql
-- Allows multiple attendance sessions for same period/date with different batches
UNIQUE (section, period, date, teaching_assignment, subject_batch)
```

## Frontend Implementation

### Timetable View
When displaying timetable, filter assignments by:
```javascript
// Get all assignments for a specific period/day/section
const assignments = timetableAssignments.filter(a => 
  a.period_id === periodId && 
  a.day === dayNumber && 
  a.section_id === sectionId
);

// Group by subject_batch
const batchGroups = assignments.reduce((acc, assignment) => {
  const batchId = assignment.subject_batch?.id || 'no_batch';
  if (!acc[batchId]) acc[batchId] = [];
  acc[batchId].push(assignment);
  return acc;
}, {});

// Display each batch separately
```

### Attendance Marking
When marking attendance for a period:
```javascript
// Show all attendance sessions for the period
const sessions = periodAttendanceSessions.filter(s =>
  s.section_id === sectionId &&
  s.period_id === periodId &&
  s.date === attendanceDate
);

// Each session has its own student list from subject_batch
sessions.forEach(session => {
  const students = session.subject_batch?.students || [];
  // Mark attendance for these students only
});
```

## Best Practices

1. **Always create subject batches first** before timetable assignment
2. **Assign students to batches** to ensure proper attendance tracking
3. **Set staff for each batch** if different instructors teach different batches
4. **Validate no student overlap** between batches in the same period
5. **Use clear batch names** (e.g., "Batch 1 - Python", "Batch 2 - Data Structures")

## Validation Rules

✅ **Allowed**:
- Multiple batches for same period/day/section
- Different subjects for different batches
- Different staff for different batches
- Same students across different periods

❌ **Not Allowed**:
- Same batch assigned twice to same period/day/section
- Student in multiple batches for the same period/section
- Duplicate attendance session for same batch/period/date

## API Examples

### Query Consecutive Batches
```http
GET /api/timetable/assignments/?section_id=10&day=1&period_id=5
```

Response:
```json
[
  {
    "id": 1,
    "period_id": 5,
    "day": 1,
    "section_id": 10,
    "subject_batch": {
      "id": 1,
      "name": "Batch 1",
      "students": [...]
    },
    "curriculum_row": {"course_code": "CS101", "course_name": "Python"},
    "staff": {"id": 100, "name": "Dr. Smith"}
  },
  {
    "id": 2,
    "period_id": 5,
    "day": 1,
    "section_id": 10,
    "subject_batch": {
      "id": 2,
      "name": "Batch 2",
      "students": [...]
    },
    "curriculum_row": {"course_code": "CS102", "course_name": "Data Structures"},
    "staff": {"id": 101, "name": "Dr. Jones"}
  }
]
```

### Query Attendance Sessions for Period
```http
GET /api/academics/period-attendance/?section_id=10&period_id=5&date=2026-03-09
```

Response:
```json
[
  {
    "id": 1,
    "section_id": 10,
    "period_id": 5,
    "date": "2026-03-09",
    "subject_batch_id": 1,
    "assigned_to": {"id": 100, "name": "Dr. Smith"},
    "records": [
      {"student_id": 1, "status": "PRESENT"},
      {"student_id": 2, "status": "ABSENT"}
    ]
  },
  {
    "id": 2,
    "section_id": 10,
    "period_id": 5,
    "date": "2026-03-09",
    "subject_batch_id": 2,
    "assigned_to": {"id": 101, "name": "Dr. Jones"},
    "records": [
      {"student_id": 3, "status": "PRESENT"},
      {"student_id": 4, "status": "PRESENT"}
    ]
  }
]
```

## Troubleshooting

### Issue: "Duplicate assignment error"
**Cause**: Trying to create assignment with same period/day/section/batch
**Solution**: Change the subject_batch_id or update existing assignment

### Issue: "Students not appearing in attendance"
**Cause**: Subject batch doesn't have students assigned
**Solution**: Edit the batch and add students before marking attendance

### Issue: "Wrong staff showing for attendance"
**Cause**: Staff resolution priority issue
**Solution**: Check:
1. subject_batch.staff (highest priority)
2. timetable_assignment.staff (fallback)
3. Ensure the correct staff is assigned to the batch

### Issue: "Individual elective subjects not showing in timetable assignment"
**Cause**: **This is intentional!** Individual elective subjects are no longer shown in the timetable assignment dropdown
**Solution**: 
1. Assign the elective GROUP (EE, PE, etc.) to the period
2. Students will see their chosen elective automatically via ElectiveChoice
3. No action needed - this is the correct behavior

### Issue: "Students not seeing their elective choice"
**Cause**: Student hasn't selected an elective or ElectiveChoice is not active
**Solution**: 
1. Ensure student has selected their elective through the elective choice interface
2. Check that ElectiveChoice record has `is_active=True`
3. Verify the current academic year is active and matches the ElectiveChoice

## Recent Changes (March 2026)

### Elective Timetable Assignment Simplified
**What Changed:**
- ✅ Individual elective subjects (e.g., "Machine Learning", "Cloud Computing") are **no longer shown** in the subject dropdown when creating timetable assignments
- ✅ Only the elective GROUP (e.g., "EE - Elective Elective", "PE - Professional Elective") appears in the dropdown
- ✅ Staff assign the elective group to a period
- ✅ Students automatically see their chosen elective when viewing their timetable

**Why This Change:**
- Simplifies timetable assignment for staff
- Prevents confusion when multiple elective options exist
- Maintains proper student-specific elective display
- Elective choices are managed separately through the elective choice interface

**Migration Impact:**
- ✅ No database migration needed
- ✅ Existing timetable assignments still work correctly
- ✅ Only affects the UI dropdown for creating new assignments
- ✅ Student views remain unchanged and continue to show chosen electives

**Testing Checklist:**
1. ✅ Verify elective groups (EE, PE) appear in timetable subject dropdown
2. ✅ Verify individual elective subjects do NOT appear in dropdown
3. ✅ Create timetable assignment with elective group
4. ✅ Student with elective choice sees their specific subject
5. ✅ Student without elective choice sees the elective group name
6. ✅ Staff view shows the elective group name

## Summary

The IDCS system is **fully equipped** to handle:
1. **Consecutive batch assignments** for same-period different-subject scenarios
2. **Elective group timetable assignments** with automatic student-specific mapping

### Key Features:

**Consecutive Batches:**
1. ✅ Create separate `StudentSubjectBatch` records for each group
2. ✅ Create multiple `TimetableAssignment` records for the same period with different `subject_batch_id`
3. ✅ Mark attendance separately for each batch using `PeriodAttendanceSession` with correct `subject_batch_id`

**Elective Assignments:**
1. ✅ Assign elective GROUP (EE, PE) to timetable period via `curriculum_row`
2. ✅ Students choose specific electives via `ElectiveChoice` model
3. ✅ Student timetable views automatically show their chosen elective
4. ✅ Staff views show the elective group name

The database constraints ensure data integrity while allowing the flexibility needed for both scenarios.
