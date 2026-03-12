# Student Feedback - Elective Subject Display Fix

## Date: March 10, 2026

## Problem Statement

The student feedback page was not displaying elective subjects alongside core subjects. Students could only see core subjects assigned to their section, but not the elective subjects they had chosen through the `ElectiveChoice` system.

### Root Cause

The original implementation in `GetStudentSubjectsView` only fetched teaching assignments for the student's section:

```python
teaching_assignments = TeachingAssignment.objects.filter(
    section=section,
    academic_year__is_active=True,
    is_active=True
)
```

This query worked for core subjects but missed elective subjects because:
1. **Elective subjects are mapped to individual students** through the `ElectiveChoice` model, not just to sections
2. **Teaching assignments for electives** might be created separately from section-level assignments
3. **Students choose specific electives** from available options, so only their chosen electives should appear

## Solution Implemented

### Updated Logic Flow

**Step 1: Fetch Section-Level Teaching Assignments**
```python
teaching_assignments = TeachingAssignment.objects.filter(
    section=section,
    academic_year__is_active=True,
    is_active=True
)
```
- Includes core subjects
- Includes any section-wide electives (if created at section level)

**Step 2: Fetch Student's Elective Choices**
```python
from curriculum.models import ElectiveChoice

elective_choices = ElectiveChoice.objects.filter(
    student=student_profile,
    academic_year=current_ay,
    is_active=True
)
```
- Gets all electives the student has chosen
- Filtered by current academic year

**Step 3: Find Teaching Assignments for Chosen Electives**
```python
for choice in elective_choices:
    elective_subj = choice.elective_subject
    
    # Priority 1: Teaching assignment for this section and elective
    elective_ta = TeachingAssignment.objects.filter(
        elective_subject=elective_subj,
        section=section,
        academic_year=current_ay,
        is_active=True
    ).first()
    
    # Priority 2: Any teaching assignment for this elective (fallback)
    if not elective_ta:
        elective_ta = TeachingAssignment.objects.filter(
            elective_subject=elective_subj,
            academic_year=current_ay,
            is_active=True
        ).first()
```

**Step 4: Combine and Deduplicate**
```python
added_assignment_ids = set()
all_teaching_assignments = []

# Add section-level assignments
for ta in teaching_assignments:
    added_assignment_ids.add(ta.id)
    all_teaching_assignments.append(ta)

# Add elective-specific assignments (avoiding duplicates)
if elective_ta and elective_ta.id not in added_assignment_ids:
    added_assignment_ids.add(elective_ta.id)
    all_teaching_assignments.append(elective_ta)
```

### Key Improvements

1. **Complete Subject List**: Students now see both core subjects AND their chosen electives
2. **No Duplicates**: Tracking added assignment IDs prevents duplicate entries
3. **Flexible Matching**: Falls back to any teaching assignment if section-specific doesn't exist
4. **Debug Logging**: Added comprehensive logging to trace subject fetching

## Database Models Involved

### ElectiveChoice Model
```python
class ElectiveChoice(models.Model):
    student = ForeignKey('academics.StudentProfile')
    elective_subject = ForeignKey('ElectiveSubject')
    academic_year = ForeignKey('academics.AcademicYear')
    is_active = BooleanField(default=True)
    
    class Meta:
        unique_together = ('student', 'elective_subject', 'academic_year')
```

**Purpose**: Maps which elective subjects each student has chosen

### TeachingAssignment Model
```python
class TeachingAssignment(models.Model):
    staff = ForeignKey('StaffProfile')
    section = ForeignKey('Section')
    academic_year = ForeignKey('AcademicYear')
    
    # Multiple subject types supported:
    subject = ForeignKey('Subject')              # Legacy subjects
    curriculum_row = ForeignKey('CurriculumDepartment')  # Core curriculum
    elective_subject = ForeignKey('ElectiveSubject')     # Electives
    custom_subject = CharField()                 # Custom (Sports, Yoga, etc.)
```

**Purpose**: Links staff to subjects for specific sections

## Example Scenario

### Student Profile
- **Name**: Raj Kumar
- **Year**: 3rd Year
- **Section**: CSE-A
- **Elective Choices**:
  - Professional Elective IV: "Big Data Analytics"
  - Open Elective III: "Microsoft Azure Infrastructure and Security"

### Before Fix
**Student sees (5 subjects)**:
```
1. Deep Learning Techniques — Geetha S
2. Web Application Technology — Ganga Naidu K
3. Comprehension — Sumathi A
4. Design Project — Shyamsundar T
5. Web Application Technology Lab — Reetha Jeyarani M A
```
❌ Missing elective subjects!

### After Fix
**Student sees (7 subjects)**:
```
1. Big Data Analytics — Aravind Prasad PB          ← Added (Elective)
2. Deep Learning Techniques — Geetha S
3. Web Application Technology — Ganga Naidu K
4. Microsoft Azure Infrastructure... — John Doe    ← Added (Elective)
5. Comprehension — Sumathi A
6. Design Project — Shyamsundar T
7. Web Application Technology Lab — Reetha Jeyarani M A
```
✅ All subjects displayed correctly!

## API Endpoint

**Endpoint**: `GET /api/feedback/<form_id>/subjects/`

**Request Headers**:
```
Authorization: Bearer <jwt_token>
```

**Response** (After Fix):
```json
{
  "feedback_form_id": 42,
  "subjects": [
    {
      "teaching_assignment_id": 123,
      "subject_name": "Big Data Analytics",
      "subject_code": "ADB1322",
      "staff_name": "Aravind Prasad PB",
      "staff_id": 45,
      "is_completed": true
    },
    {
      "teaching_assignment_id": 156,
      "subject_name": "Deep Learning Techniques",
      "subject_code": "AGB1322",
      "staff_name": "Geetha S",
      "staff_id": 67,
      "is_completed": false
    },
    {
      "teaching_assignment_id": 189,
      "subject_name": "Microsoft Azure Infrastructure and Security",
      "subject_code": "OEB1355",
      "staff_name": "John Doe",
      "staff_id": 89,
      "is_completed": false
    }
  ],
  "total_subjects": 7,
  "completed_subjects": 1,
  "all_completed": false
}
```

## Debug Logging

The updated code includes comprehensive logging:

```
[GetStudentSubjectsView] User: raj.kumar, Form ID: 42
[GetStudentSubjectsView] Found 5 teaching assignments for section CSE-A
[GetStudentSubjectsView] Found 2 elective choices for student
[GetStudentSubjectsView] Added elective teaching assignment: Big Data Analytics
[GetStudentSubjectsView] Added elective teaching assignment: Microsoft Azure Infrastructure and Security
[GetStudentSubjectsView] Total teaching assignments (core + chosen electives): 7
[GetStudentSubjectsView] Adding subject: Big Data Analytics - Aravind Prasad PB
[GetStudentSubjectsView] Adding subject: Deep Learning Techniques - Geetha S
...
[GetStudentSubjectsView] Returning 7 subjects, 1 completed
```

## Testing

### Test Case 1: Student with Elective Choices
**Setup**:
1. Create student profile in Section CSE-A, Year 3
2. Assign core teaching assignments to Section CSE-A
3. Create elective subjects (Professional Elective, Open Elective)
4. Create teaching assignments for electives
5. Map student to specific electives via ElectiveChoice

**Expected Result**:
- ✅ Student sees all core subjects
- ✅ Student sees chosen elective subjects with staff names
- ✅ No duplicate subjects
- ✅ Each subject shows correct staff name (not "Multiple Staff")

### Test Case 2: Student without Elective Choices
**Setup**:
1. Create student profile
2. Assign only core teaching assignments
3. Do NOT create any ElectiveChoice records

**Expected Result**:
- ✅ Student sees all core subjects
- ✅ No errors or empty subject list
- ✅ System handles missing elective choices gracefully

### Test Case 3: Elective without Teaching Assignment
**Setup**:
1. Create ElectiveChoice for student
2. Do NOT create corresponding TeachingAssignment

**Expected Result**:
- ✅ Warning logged: "No teaching assignment found for elective"
- ✅ Core subjects still displayed
- ✅ No crash or error

## Edge Cases Handled

1. **No Elective Choices**: If student hasn't chosen any electives, only core subjects are shown
2. **Missing Teaching Assignment**: If elective choice exists but no teaching assignment, logs warning and continues
3. **Duplicate Assignments**: Deduplication ensures no subject appears twice
4. **Section-Wide Electives**: If elective has teaching assignment at section level, it's included
5. **Individual Electives**: If elective has no section-level assignment, searches for any assignment in current AY

## Files Modified

### Backend
- **File**: `backend/feedback/views.py`
- **Class**: `GetStudentSubjectsView`
- **Method**: `get()`
- **Lines**: ~1280-1330

### Key Changes
1. Added import for `ElectiveChoice` model
2. Added logic to fetch student's elective choices
3. Added loop to find teaching assignments for each elective choice
4. Added deduplication logic with `added_assignment_ids` set
5. Enhanced debug logging

## Migration Notes

**No database migrations required** - this is a logic-only fix that works with existing database structure.

## Rollback Instructions

If issues occur, revert to original logic:
```python
teaching_assignments = TeachingAssignment.objects.filter(
    section=section,
    academic_year__is_active=True,
    is_active=True
)
```

Remove elective choice fetching code and deduplication logic.

## Future Enhancements

1. **Batch Optimization**: Use `prefetch_related()` for elective choices to reduce queries
2. **Caching**: Cache teaching assignments to improve performance
3. **Elective Grouping**: Group electives by category in student view
4. **Staff Photos**: Include staff profile photos in response
5. **Subject Status**: Show whether subject is core or elective in UI

## Related Documentation

- [FEEDBACK_THREE_TIER_DISPLAY.md](FEEDBACK_THREE_TIER_DISPLAY.md) - HOD/Student/Response view differences
- [FEEDBACK_ELECTIVE_EXPAND_COLLAPSE.md](FEEDBACK_ELECTIVE_EXPAND_COLLAPSE.md) - HOD expand/collapse feature
- [FEEDBACK_FIX_SUMMARY.md](FEEDBACK_FIX_SUMMARY.md) - Previous elective display fixes

## Support

### Common Issue: Elective Still Not Showing

**Checklist**:
1. ✅ Verify `ElectiveChoice` record exists for student
2. ✅ Check `elective_choice.is_active = True`
3. ✅ Verify `academic_year` matches current active AY
4. ✅ Confirm `TeachingAssignment` exists for elective
5. ✅ Check `teaching_assignment.is_active = True`
6. ✅ Verify staff is assigned to the elective

**Debug Query**:
```python
from curriculum.models import ElectiveChoice
from academics.models import TeachingAssignment, AcademicYear, StudentProfile

student = StudentProfile.objects.get(user__username='raj.kumar')
current_ay = AcademicYear.objects.filter(is_active=True).first()

# Check elective choices
choices = ElectiveChoice.objects.filter(
    student=student,
    academic_year=current_ay,
    is_active=True
)
print(f"Student has {choices.count()} elective choices")

# Check teaching assignments for those electives
for choice in choices:
    tas = TeachingAssignment.objects.filter(
        elective_subject=choice.elective_subject,
        academic_year=current_ay,
        is_active=True
    )
    print(f"{choice.elective_subject.course_name}: {tas.count()} teaching assignments")
```

---

**Implementation Status**: ✅ Complete and Tested  
**Version**: 3.1  
**Last Updated**: March 10, 2026
