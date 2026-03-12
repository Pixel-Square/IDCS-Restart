# Feedback Elective Subject Grouping Enhancement

## Overview
Enhanced the Feedback module to display elective subjects differently for HOD and Student views. HODs now see electives grouped by category (Professional Elective, Emerging Elective, Open Elective, etc.), while students see a flat list of subjects with staff names.

## Implementation Date
March 10, 2026

## Problem Statement

### Issues Identified:
1. **Elective subjects not displaying**: Elective subjects defined in the curriculum module were not appearing in HOD feedback creation because the API only fetched subjects from `TeachingAssignment` table
2. **4th year subjects missing**: 4th year subjects did not display even when they existed in the curriculum
3. **Missing teaching assignments**: Subjects without teaching assignments were not shown, even though they exist in the curriculum

### Root Cause:
The `GetSubjectsByYearView` API only fetched subjects that had teaching assignments. If electives or core subjects were defined in the curriculum but staff had not yet been assigned to teach them, they would not appear in the subject list.

## Solution Overview

Modified the backend API to fetch subjects from **two sources**:
1. **TeachingAssignment table** (subjects with assigned staff)
2. **Curriculum module** (ElectiveSubject and CurriculumDepartment models)

This ensures all subjects appear in the HOD view, even if teaching assignments haven't been created yet.

## Changes Made

### 1. Backend API Updates

#### Modified: `backend/feedback/views.py`

##### GetSubjectsByYearView (API 10)
**Purpose**: Returns subjects for HOD when creating feedback forms

**Key Changes**:
- Added debug logging to help diagnose issues with 4th year subjects not displaying
- Enhanced subject fetching to identify and group elective subjects
- **NEW: Fetch elective subjects directly from curriculum module**
- **NEW: Fetch core subjects from curriculum when no teaching assignments exist**
- **NEW: Calculate semesters based on academic year parity for curriculum queries**
- Modified response structure to include:
  - `subjects`: All subjects (backward compatible)
  - `regular_subjects`: Core/regular subjects only
  - `elective_subjects`: All electives as a flat list
  - `elective_groups`: Electives grouped by their parent category
  - `has_electives`: Boolean flag indicating presence of electives
  - `debug_info`: Additional debugging information when no sections are found

**Subject Fetching Strategy**:
```python
# Step 1: Fetch from TeachingAssignment (subjects with assigned staff)
teaching_assignments = TeachingAssignment.objects.filter(...)

# Step 2: Calculate semesters for selected years based on AY parity
# Year 1 → Sem 1 or 2, Year 2 → Sem 3 or 4, etc.
semesters_for_years = calculate_semesters(years, academic_year.parity)

# Step 3: Fetch electives from curriculum module
curriculum_electives = ElectiveSubject.objects.filter(
    department=department,
    semester__in=semesters_for_years,
    approval_status='APPROVED'
)

# Step 4: If no sections/teaching assignments, also fetch core subjects
if not teaching_assignments:
    curriculum_rows = CurriculumDepartment.objects.filter(
        department=department,
        semester__in=semesters_for_years,
        is_elective=False
    )

# Step 5: Merge all subjects, avoiding duplicates
```

**Elective Categorization Logic**:
```python
# For ElectiveSubject assignments
if assignment.elective_subject:
    elective_category = assignment.elective_subject.parent.category
    # Examples: "Professional Elective IV", "Emerging Elective I", "Open Elective III"

# For CurriculumDepartment with is_elective=True
elif assignment.curriculum_row and assignment.curriculum_row.is_elective:
    elective_category = assignment.curriculum_row.category
```

**Response Structure**:
```json
{
  "subjects": [...],  // All subjects (for backward compatibility)
  "regular_subjects": [
    {
      "subject_name": "Data Structures",
      "subject_code": "CS301",
      "staff_names": "Dr. John Doe",
      "sections": "A, B",
      "years": [2, 3],
      "assignment_count": 2
    }
  ],
  "elective_groups": [
    {
      "category": "Professional Elective IV",
      "subjects": [
        {
          "subject_name": "Big Data Analytics",
          "subject_code": "ADB1322",
          "staff_names": "Aravind Prasad PB",
          "sections": "A",
          "years": [3],
          "assignment_count": 1
        },
        {
          "subject_name": "Deep Learning Techniques",
          "subject_code": "AGB1322",
          "staff_names": "Geetha S",
          "sections": "A",
          "years": [3],
          "assignment_count": 1
        }
      ],
      "count": 2
    },
    {
      "category": "Emerging Elective I",
      "subjects": [
        {
          "subject_name": "Generative AI Fundamentals",
          "subject_code": "CGI1257",
          "staff_names": "Dr. Sharma",
          "sections": "B",
          "years": [4],
          "assignment_count": 1
        }
      ],
      "count": 1
    }
  ],
  "total_subjects": 15,
  "has_electives": true
}
```

##### GetStudentSubjectsView (API 9)
**Purpose**: Returns subjects for students to provide feedback on

**No Changes Required**: This view already returns a flat list of subjects without grouping, which is the desired behavior for students.

**Student Response Structure**:
```json
{
  "subjects": [
    {
      "teaching_assignment_id": 123,
      "subject_name": "Big Data Analytics",
      "subject_code": "ADB1322",
      "staff_name": "Aravind Prasad PB",
      "staff_id": 45,
      "is_completed": false
    },
    {
      "teaching_assignment_id": 124,
      "subject_name": "Deep Learning Techniques",
      "subject_code": "AGB1322",
      "staff_name": "Geetha S",
      "staff_id": 46,
      "is_completed": false
    }
  ],
  "total_subjects": 6,
  "completed_subjects": 0,
  "all_completed": false
}
```

### 2. Frontend UI Updates

#### Modified: `frontend/src/pages/feedback/FeedbackPage.tsx`

**Type Definitions Updated**:
- Enhanced `subjectsByYear` state to include new fields for grouped electives

**HOD View Changes**:
1. **Core Subjects Section**: Regular/core subjects displayed with blue theme
2. **Elective Subjects Section**: Grouped electives displayed with purple theme
3. **Category Headers**: Each elective category (Professional Elective, Emerging Elective, etc.) gets its own header
4. **Visual Distinction**: 
   - Core subjects: Blue border and background
   - Elective subjects: Purple border and background
   - Category badges indicate the count of subjects in each group

**Student View**:
- No changes required - students already see a flat list of subjects with staff names
- Elective type/category is NOT shown to students

### 3. Debug Enhancements

Added comprehensive logging to help diagnose the "4th year subjects not showing" issue:

```python
print(f"[GetSubjectsByYearView] Academic year: {current_ay.name}, acad_start: {acad_start}")
print(f"[GetSubjectsByYearView] Requested years: {years}, calculated batch_start_years: {batch_start_years}")
print(f"[GetSubjectsByYearView] Found {sections.count()} sections")
print(f"[GetSubjectsByYearView] Found {teaching_assignments.count()} teaching assignments")
```

When no sections are found, the API now returns debug information:
```json
{
  "subjects": [],
  "total_subjects": 0,
  "message": "No sections found for year(s): 4",
  "debug_info": {
    "requested_years": [4],
    "batch_start_years": [2022],
    "sections_found_without_dept_filter": 5
  }
}
```

## Database Schema Context

### Elective Subject Structure

```
CurriculumDepartment (parent row)
├── is_elective: True
├── category: "Professional Elective IV" (or similar)
└── ElectiveSubject (children)
    ├── course_name: "Big Data Analytics"
    ├── course_code: "ADB1322"
    └── parent: FK to CurriculumDepartment
```

### Teaching Assignment Links

TeachingAssignment can reference:
1. `curriculum_row` - Regular subjects
2. `elective_subject` - Elective subjects
3. `subject` - Legacy subjects
4. `custom_subject` - Special subjects (Sports, Yoga, etc.)

## Expected Behavior

### HOD Feedback Creation Page

When HOD selects year(s) to create subject feedback:

1. **Display Structure**:
   ```
   Found 15 subject(s) • 9 core, 6 electives

   Core Subjects (9)
   ├── Data Structures - Dr. John Doe
   ├── Operating Systems - Dr. Jane Smith
   └── ...

   Elective Subjects (6)
   ├── Professional Elective IV (2)
   │   ├── Big Data Analytics - Aravind Prasad PB
   │   └── Deep Learning Techniques - Geetha S
   ├── Emerging Elective I (3)
   │   ├── Generative AI Fundamentals - Dr. Sharma
   │   ├── Business Analytics - Prof. Kumar
   │   └── Agile Scrum Master - Ms. Patel
   └── Open Elective III (1)
       └── Career Advancement Skills - Dr. Reddy
   ```

2. **Benefits for HOD**:
   - Clear view of curriculum structure
   - Easy identification of elective categories
   - Better understanding of teaching assignments
   - Organized view for feedback form creation

### Student Feedback Submission Page

When students view available subjects to provide feedback:

1. **Display Structure**:
   ```
   Your Subjects (6)
   ├── Big Data Analytics — Aravind Prasad PB
   ├── Deep Learning Techniques — Geetha S
   ├── Web Application Technology — Deena Rose D
   ├── Design Project — Geetha S
   ├── Comprehension — Sri Santhoshini E
   └── Web Application Technology Lab — Deena Rose D
   ```

2. **Benefits for Students**:
   - Simple, flat list without confusing categories
   - Focus on subject name and instructor
   - Easy to navigate and submit feedback
   - No need to understand curriculum structure

## Troubleshooting 4th Year Issue

### Common Causes

1. **No Sections Created**: 4th year students may not have sections created in the system
2. **Incorrect Batch Start Year**: Section's batch start year doesn't match calculated year
3. **No Teaching Assignments**: Teaching assignments not created for 4th year sections
4. **Department Mismatch**: Sections exist but belong to different department

### Solution Implemented

The API now **fetches subjects from curriculum even when sections don't exist**:

1. **Semester Calculation**: Automatically calculates which semesters correspond to selected years
   ```python
   # For Academic Year 2025-2026 with ODD parity:
   # Year 1 → Semester 1
   # Year 2 → Semester 3
   # Year 3 → Semester 5
   # Year 4 → Semester 7
   
   # For Academic Year 2025-2026 with EVEN parity:
   # Year 1 → Semester 2
   # Year 2 → Semester 4
   # Year 3 → Semester 6
   # Year 4 → Semester 8
   ```

2. **Direct Curriculum Query**: Fetches subjects from curriculum tables using calculated semesters
   - No dependency on sections or teaching assignments
   - Shows all subjects defined in curriculum for those semesters

3. **Fallback Strategy**:
   - **Primary**: If sections exist, fetch from TeachingAssignment (shows assigned staff)
   - **Secondary**: Fetch electives from ElectiveSubject (shows all electives)
   - **Tertiary**: If no teaching assignments, fetch from CurriculumDepartment (shows all core subjects)

### Benefits

- **4th year subjects now appear** even if:
  - Sections are not created
  - Teaching assignments are not made
  - Staff are not assigned yet
  
- HOD can:
  - See complete curriculum structure
  - Create feedback forms in advance
  - Know what subjects will be taught

- Shows appropriate message for subjects without staff:
  - "Multiple Staff" for electives (students choose)
  - "To be assigned" for core subjects without teaching assignment

### Debugging Steps

1. **Check API Response**:
   - Navigate to feedback creation page
   - Select 4th year
   - Check browser console for API response
   - Look for `debug_info` in response

2. **Verify Batch Calculations**:
   ```
   Current Academic Year: 2025-2026
   Academic Start: 2025
   For 4th Year: batch_start_year = 2025 - 4 + 1 = 2022
   ```

3. **Check Database**:
   ```sql
   -- Find sections for 4th year
   SELECT s.id, s.name, b.name, b.start_year, d.code
   FROM academics_section s
   JOIN academics_batch b ON s.batch_id = b.id
   JOIN academics_course c ON b.course_id = c.id
   JOIN academics_department d ON c.department_id = d.id
   WHERE b.start_year = 2022;

   -- Find teaching assignments for these sections
   SELECT ta.id, s.name, staff.user.username, subj.course_name
   FROM academics_teachingassignment ta
   LEFT JOIN academics_section s ON ta.section_id = s.id
   LEFT JOIN academics_staffprofile staff ON ta.staff_id = staff.id
   LEFT JOIN curriculum_curriculumdepartment subj ON ta.curriculum_row_id = subj.id
   WHERE s.batch.start_year = 2022;
   ```

4. **Check Backend Logs**:
   - Look for `[GetSubjectsByYearView]` log entries
   - Verify calculated batch_start_years
   - Check section count and teaching assignment count

## Testing Checklist

- [ ] HOD can see grouped electives when creating feedback
- [ ] Core subjects appear in separate section from electives
- [ ] Elective categories are properly labeled (Professional, Emerging, Open)
- [ ] Multiple electives in same category are grouped together
- [ ] Students see flat list without elective categories
- [ ] Students can submit feedback for elective subjects
- [ ] 4th year subjects display correctly (if they exist)
- [ ] Debug logging helps identify missing subjects
- [ ] Backward compatibility maintained (old `subjects` array still works)

## API Endpoints

### GET /api/feedback/subjects-by-year/
**Used by**: HOD (feedback creation)
**Parameters**:
- `years`: Comma-separated year numbers (e.g., "2,3,4")
- `department_id`: Department ID (optional)
- `sections`: Comma-separated section IDs (optional)
- `semester`: Semester ID (optional)

**Returns**: Grouped subjects with elective categories

### GET /api/feedback/<form_id>/subjects/
**Used by**: Students (feedback submission)
**Returns**: Flat list of subjects without grouping

## Related Files

- `backend/feedback/views.py` - API views
- `frontend/src/pages/feedback/FeedbackPage.tsx` - UI components
- `backend/curriculum/models.py` - ElectiveSubject and CurriculumDepartment models
- `backend/academics/models.py` - TeachingAssignment model

## Future Enhancements

1. Add filtering/search within elective categories
2. Show student enrollment count per elective
3. Add visual indicators for popular electives
4. Export elective grouping for reports
5. Allow HODs to customize category display names
