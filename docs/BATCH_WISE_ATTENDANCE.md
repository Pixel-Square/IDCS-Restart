# Batch-Wise Attendance Implementation

## Overview
This document describes the batch-wise attendance feature that enables staff to mark attendance only for the specific batches they are assigned to through timetable assignments.

## Feature Description

### Scenario
- **Period 1** → Assigned to **Batch B1** (with Staff A assigned to B1)
- **Period 2** → Assigned to **Batch B2** (with Staff B assigned to B2)

### Behavior
- Only Staff A can mark attendance for Period 1 (Batch B1)
- Only Staff B can mark attendance for Period 2 (Batch B2)
- Each period's attendance is isolated by batch

## Database Schema

### Models Updated

#### 1. StudentSubjectBatch
```python
class StudentSubjectBatch(models.Model):
    name = models.CharField(max_length=200)
    teaching_assignment = models.ForeignKey('TeachingAssignment', on_delete=models.CASCADE)
    students = models.ManyToManyField('StudentProfile')
    staff = models.ForeignKey('StaffProfile', on_delete=models.SET_NULL, null=True, blank=True)
    created_by = models.ForeignKey('StaffProfile', on_delete=models.SET_NULL, null=True, blank=True)
```

#### 2. TimetableAssignment
```python
class TimetableAssignment(models.Model):
    period = models.ForeignKey('TimetableSlot', on_delete=models.CASCADE)
    day = models.PositiveSmallIntegerField(choices=DAYS_OF_WEEK)
    section = models.ForeignKey('academics.Section', on_delete=models.CASCADE)
    staff = models.ForeignKey('academics.StaffProfile', on_delete=models.SET_NULL)
    curriculum_row = models.ForeignKey('curriculum.CurriculumDepartment', on_delete=models.SET_NULL)
    subject_batch = models.ForeignKey('academics.StudentSubjectBatch', on_delete=models.SET_NULL)  # NEW
```

#### 3. PeriodAttendanceSession
```python
class PeriodAttendanceSession(models.Model):
    section = models.ForeignKey('Section', on_delete=models.CASCADE)
    period = models.ForeignKey('timetable.TimetableSlot', on_delete=models.CASCADE)
    date = models.DateField()
    timetable_assignment = models.ForeignKey('timetable.TimetableAssignment')
    teaching_assignment = models.ForeignKey('TeachingAssignment')
    subject_batch = models.ForeignKey('StudentSubjectBatch', on_delete=models.SET_NULL)  # NEW
    
    class Meta:
        unique_together = [
            ('section', 'period', 'date', 'teaching_assignment', 'subject_batch')  # UPDATED
        ]
```

## Implementation Details

### Backend Changes

#### 1. Serializers (academics/serializers.py)

**PeriodAttendanceSessionSerializer**:
- Added `subject_batch` field (read-only, returns batch details)
- Added `subject_batch_id` field (write-only for API)
- Added `get_subject_batch()` method to serialize batch information

```python
subject_batch = serializers.SerializerMethodField(read_only=True)
subject_batch_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

def get_subject_batch(self, obj):
    try:
        b = obj.subject_batch
        if not b:
            return None
        return {
            'id': b.id, 
            'name': b.name,
            'student_count': b.students.count()
        }
    except Exception:
        return None
```

#### 2. Views (academics/views.py)

**PeriodAttendanceSessionViewSet.perform_create()**:
- Checks if timetable assignment has a batch
- Verifies if current staff is assigned to that batch (created_by OR staff field)
- Raises PermissionDenied if staff is not assigned to the batch
- Automatically copies subject_batch from timetable to attendance session

```python
# Check if timetable has a batch - if so, verify staff is assigned to that batch
if ta and getattr(ta, 'subject_batch', None):
    batch = ta.subject_batch
    is_batch_staff = (
        getattr(batch, 'created_by_id', None) == staff_profile.id or
        getattr(batch, 'staff_id', None) == staff_profile.id
    )
    if not is_batch_staff and not (user.is_superuser or 'academics.mark_attendance' in perms):
        raise PermissionDenied(f'You are not assigned to batch "{batch.name}".')
```

**PeriodAttendanceSessionViewSet.bulk_mark()**:
- Same batch permission check as perform_create
- Creates separate attendance sessions per batch
- Filters student list to only include students in the batch

**Timetable Assignment Resolution**:
- First checks for batch-specific timetable assignments
- Verifies staff is assigned to the batch before allowing access
- Falls back to regular timetable assignments if no batch

```python
# First, check if there's a batch-specific timetable assignment
ta_with_batch = TimetableAssignment.objects.filter(
    section=section, period=period, day=day, subject_batch__isnull=False
).first()

if ta_with_batch:
    batch = getattr(ta_with_batch, 'subject_batch', None)
    if batch:
        is_batch_staff = (
            getattr(batch, 'created_by_id', None) == staff_profile.id or
            getattr(batch, 'staff_id', None) == staff_profile.id
        )
        if is_batch_staff:
            ta = ta_with_batch
```

#### 3. Student Filtering

When attendance session has a subject_batch, only students in that batch are included:

```python
# If timetable assignment has a subject_batch defined, use that student list
students_source = None
if ta and getattr(ta, 'subject_batch', None):
    try:
        students_source = list(ta.subject_batch.students.all())
    except Exception:
        students_source = None
```

## Workflow

### 1. Batch Creation
Staff creates a subject batch with assigned students:
- Navigate to Assigned Subjects page
- Click "Create Batch"
- Assign staff to the batch
- Add students to the batch

### 2. Timetable Assignment
Admin/Staff assigns period with batch:
- In Timetable Assignment page
- Select period (e.g., Period 1)
- Select batch (e.g., Batch B1)
- The timetable now links Period 1 → Batch B1

### 3. Attendance Marking
Staff marks attendance:
- Only staff assigned to Batch B1 can access Period 1's attendance
- Student list shows only students in Batch B1
- Other staff see "You are not assigned to batch" error

### 4. Separate Sessions
Multiple batches for same period:
- Period 1, Batch B1 → Creates Session 1
- Period 1, Batch B2 → Creates Session 2
- Each session is independent with its own student list

## Migrations

1. **0054_add_created_by_to_student_subject_batch.py**
   - Added `created_by` field to StudentSubjectBatch

2. **0055_backfill_created_by_for_batches.py**
   - Data migration to backfill created_by from staff field

3. **0056_add_subject_batch_to_attendance_session.py**
   - Added `subject_batch` field to PeriodAttendanceSession
   - Updated unique_together constraint

## API Endpoints

### Get Attendance Sessions
```
GET /api/academics/period-attendance-sessions/
```

Response includes subject_batch:
```json
{
  "id": 1,
  "section": {...},
  "period": {...},
  "date": "2026-03-08",
  "subject_batch": {
    "id": 5,
    "name": "Batch B1",
    "student_count": 25
  },
  "records": [...]
}
```

### Create Attendance Session
```
POST /api/academics/period-attendance-sessions/
```

Request body:
```json
{
  "section_id": 10,
  "period_id": 1,
  "date": "2026-03-08",
  "subject_batch_id": 5
}
```

### Bulk Mark Attendance
```
POST /api/academics/period-attendance-sessions/bulk-mark/
```

Request body:
```json
{
  "section_id": 10,
  "period_id": 1,
  "date": "2026-03-08",
  "records": [
    {"student_id": 100, "status": "P"},
    {"student_id": 101, "status": "A"}
  ]
}
```

## Permission Logic

### Staff Assignment Check
A staff can mark attendance for a batch if:
1. `batch.created_by_id == staff_profile.id` (Staff created the batch), OR
2. `batch.staff_id == staff_profile.id` (Staff is assigned to the batch), OR
3. User has `academics.mark_attendance` permission, OR
4. User is superuser

### Error Messages
- **Not assigned to batch**: "You are not assigned to batch \"[Batch Name]\". Only assigned staff can mark attendance for this batch."
- **Not assigned to period**: "You are not assigned to this period and cannot mark attendance"

## Frontend Integration

### Batch Selection in Timetable
The timetable assignment UI includes batch selection:
- Dropdown showing available batches for the subject
- Only batches with assigned staff are shown
- Selected batch is stored with the timetable assignment

### Attendance UI
- Displays batch name in attendance header
- Shows filtered student list (only batch members)
- Prevents unauthorized staff from accessing batch attendance

## Benefits

1. **Isolation**: Each batch has separate attendance tracking
2. **Security**: Only assigned staff can mark attendance for their batches
3. **Accuracy**: Students see only relevant attendance records
4. **Flexibility**: Multiple batches can run in parallel for the same subject
5. **Audit Trail**: created_by and staff fields track batch ownership

## Testing Checklist

- [ ] Create batch with assigned staff
- [ ] Assign batch to timetable period
- [ ] Verify only assigned staff can mark attendance
- [ ] Verify student list is filtered by batch
- [ ] Verify separate sessions for different batches
- [ ] Test permission error messages
- [ ] Test with multiple concurrent batches
- [ ] Verify attendance records are batch-specific
