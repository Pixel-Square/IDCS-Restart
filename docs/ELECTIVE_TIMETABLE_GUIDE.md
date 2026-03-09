# Elective Timetable Assignment Guide

## Overview
When assigning electives to timetable periods, staff now assign **elective groups** (EE, PE, OE, etc.) instead of individual elective subjects. Students automatically see their chosen elective when viewing their timetable.

## Key Concept

### Before (Old Behavior)
❌ Staff saw ALL individual elective options in dropdown:
- Machine Learning
- Cloud Computing  
- Data Mining
- Artificial Intelligence
- ...etc

### After (New Behavior)
✅ Staff see only the elective GROUP:
- **EE - Elective Elective** (this represents all elective options)

## How It Works

### 1. Staff Assigns Elective Group to Period

**Timetable Assignment UI:**
- Select period (e.g., Period 3, Monday)
- Select subject from dropdown: **"EE - Elective Elective"**
- Assign staff (optional)
- Save

**Behind the scenes:**
- `TimetableAssignment.curriculum_row` → Points to `CurriculumDepartment` with `is_elective=True`
- This represents the elective slot, not a specific subject

### 2. Students Choose Their Elective

Students use the **Elective Choice** interface to select their specific elective:
- **Student A** chooses: "CS501 - Machine Learning"
- **Student B** chooses: "CS502 - Cloud Computing"
- **Student C** chooses: "CS503 - Data Mining"

**Behind the scenes:**
- `ElectiveChoice` records link `student` → `elective_subject`
- `elective_subject.parent` points to the same `CurriculumDepartment` (EE group)

### 3. Students View Their Timetable

When students view their timetable:
- **Period 3, Monday** shows: **"CS501 - Machine Learning"** (for Student A)
- **Period 3, Monday** shows: **"CS502 - Cloud Computing"** (for Student B)
- **Period 3, Monday** shows: **"CS503 - Data Mining"** (for Student C)

**Behind the scenes:**
- System looks up `ElectiveChoice` for student + elective parent
- Displays the specific chosen subject instead of the group

### 4. Staff View Timetable

When staff view the section's timetable:
- **Period 3, Monday** shows: **"EE - Elective Elective"** (the group)
- Or shows specific elective if there's a `TeachingAssignment` mapping

## Database Models

### CurriculumDepartment (Elective Group)
```python
{
  "id": 450,
  "course_code": "EE",
  "course_name": "Elective Elective",
  "is_elective": True,
  "semester": 5,
  "department": 10
}
```

### ElectiveSubject (Individual Options)
```python
{
  "id": 25,
  "parent_id": 450,  # Points to EE elective group
  "course_code": "CS501",
  "course_name": "Machine Learning",
  "regulation": "R2021",
  "semester": 5
}
```

### ElectiveChoice (Student Selection)
```python
{
  "id": 100,
  "student_id": 1,
  "elective_subject_id": 25,  # Machine Learning
  "academic_year_id": 1,
  "is_active": True
}
```

### TimetableAssignment
```python
{
  "id": 500,
  "period_id": 7,
  "day": 1,
  "section_id": 10,
  "curriculum_row_id": 450,  # Points to EE elective group
  "staff_id": 100
}
```

## API Examples

### Get Subjects for Timetable Assignment
```http
GET /api/timetable/curriculum-by-section/?section_id=10
```

**Response (Only shows elective groups):**
```json
{
  "results": [
    {
      "id": 448,
      "course_code": "CS401",
      "course_name": "Database Management Systems",
      "is_elective": false
    },
    {
      "id": 450,
      "course_code": "EE",
      "course_name": "Elective Elective",
      "is_elective": true
    },
    {
      "id": 451,
      "course_code": "PE",
      "course_name": "Professional Elective",
      "is_elective": true
    }
  ]
}
```

Note: Individual elective subjects (Machine Learning, Cloud Computing, etc.) are **NOT included** in this response.

### Create Timetable Assignment with Elective
```http
POST /api/timetable/assignments/
```

**Request:**
```json
{
  "period_id": 7,
  "day": 1,
  "section_id": 10,
  "curriculum_row_id": 450,  // EE - Elective Elective (group ID)
  "staff_id": 100
}
```

**Response:**
```json
{
  "id": 500,
  "period_id": 7,
  "day": 1,
  "section_id": 10,
  "curriculum_row": {
    "id": 450,
    "course_code": "EE",
    "course_name": "Elective Elective"
  },
  "staff_id": 100
}
```

### Student Views Their Timetable
```http
GET /api/timetable/section/10/
```

**Response (for student who chose Machine Learning):**
```json
{
  "Monday": [
    {
      "period_id": 7,
      "period_index": 3,
      "start_time": "11:00",
      "end_time": "12:00",
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
      "elective_subject_id": 25,
      "staff": {...}
    }
  ]
}
```

## Attendance Marking

### For Elective Periods

When marking attendance for an elective period:

1. **Without Subject Batches:**
   - All students in the section mark attendance together
   - System shows student's chosen elective name in attendance list

2. **With Subject Batches (Recommended):**
   - Create separate batches for each elective option
   - Mark attendance per batch
   - Only students who chose that specific elective appear in the batch

**Example with Batches:**
```
Period 3 - EE Elective:
├─ Batch 1: Machine Learning (Students 1-15)
├─ Batch 2: Cloud Computing (Students 16-25)
└─ Batch 3: Data Mining (Students 26-30)
```

## Validation Rules

### ✅ Allowed

- Assigning elective group (EE, PE) to any period
- Multiple students choosing different electives under same group
- Student changing elective choice (if allowed by institution)
- Same elective group in multiple periods

### ❌ Not Allowed

- Assigning individual elective subject to timetable (not shown in dropdown)
- Student choosing multiple electives for same elective group
- Elective choice without active academic year

## Common Workflows

### Workflow 1: Setup Elective Timetable (IQAC/Admin)

1. ✅ Create elective group in curriculum: "EE - Elective Elective"
2. ✅ Create individual elective options: ML, Cloud, Data Mining
3. ✅ Link elective options to parent group
4. ✅ Assign elective group to timetable period
5. ✅ Students choose their specific electives
6. ✅ Students view timetable and see their chosen subject

### Workflow 2: Add New Elective Option

1. ✅ Navigate to Curriculum → Elective Subjects
2. ✅ Create new elective subject
3. ✅ Set parent to existing elective group (e.g., EE)
4. ✅ No timetable changes needed!
5. ✅ Students can now choose the new elective
6. ✅ Timetable still shows "EE - Elective Elective"

### Workflow 3: Create Subject Batches for Electives

1. ✅ Navigate to Staff → Assigned Subjects
2. ✅ Find the elective group (EE, PE)
3. ✅ Click "Create Batch"
4. ✅ Select students who chose Machine Learning → Create "ML Batch"
5. ✅ Repeat for each elective option
6. ✅ Assign batches to timetable periods

## Benefits of This Approach

### 1. **Simplified Timetable Management**
- No need to list dozens of elective options
- Easy to see which periods have electives
- Consistent naming across all sections

### 2. **Flexible Elective Options**
- Add/remove elective subjects anytime
- No timetable updates needed
- Students see their specific choice automatically

### 3. **Proper Student View**
- Students always see what they chose
- No confusion about "which elective"
- Individual elective names in reports and transcripts

### 4. **Easy Attendance Tracking**
- Group students by chosen elective using batches
- Staff can mark attendance for their specific elective
- System handles student-to-subject mapping

## Troubleshooting

### Issue: "I can't find Machine Learning in the subject dropdown"
**Solution**: This is expected! Individual elective subjects don't appear in the timetable assignment dropdown. Assign the elective GROUP (e.g., "EE") instead. Students who chose Machine Learning will see it in their timetable.

### Issue: "Student sees 'EE - Elective Elective' instead of their chosen subject"
**Causes:**
1. Student hasn't chosen an elective yet
2. ElectiveChoice is not active (`is_active=False`)
3. Academic year is not active
4. ElectiveChoice is for wrong semester

**Solutions:**
1. Ensure student has selected their elective
2. Check `ElectiveChoice.is_active = True`
3. Verify academic year is active
4. Verify semester matches

### Issue: "How do I assign different staff for different electives?"
**Solution**: Use subject batches!
1. Create batch for each elective option
2. Assign staff to each batch
3. Create timetable assignments with batch + staff
4. System will show correct staff for each batch

### Issue: "Can I still assign a specific elective subject to timetable?"
**Answer**: The UI dropdown won't show individual elective subjects, but existing assignments still work. The recommended approach is to use elective groups + student choices.

## Migration Notes

### For Existing Timetable Assignments

**Good News:** No migration needed!

- Existing assignments that reference individual `ElectiveSubject` entries still work
- New assignments should use the elective group approach
- Both approaches coexist without conflicts
- Gradually migrate old assignments when editing timetables

### For Staff Training

**Key Points to Communicate:**
1. ✅ Don't look for individual elective subjects in dropdown
2. ✅ Assign the elective GROUP (EE, PE, etc.)
3. ✅ Students will see their chosen subject automatically
4. ✅ Use subject batches for different electives in same period
5. ✅ Elective choices are managed separately

## Summary

✅ **Staff assign elective GROUPS (EE, PE) to timetable periods**
✅ **Students choose specific ELECTIVES through elective choice interface**  
✅ **Students see their chosen subject when viewing timetable**
✅ **System handles all the mapping automatically**

This approach separates:
- **Timetable structure** (when electives occur) → Managed by staff
- **Student choices** (which elective they take) → Managed by students
- **Display logic** (what students see) → Handled automatically by system

The result is a cleaner, more maintainable timetable system that scales well with growing elective options!
