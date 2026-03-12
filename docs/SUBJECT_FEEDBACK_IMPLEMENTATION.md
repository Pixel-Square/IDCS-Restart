# CAMU-Style Subject Feedback Implementation

## Overview
Implemented comprehensive CAMU-style subject feedback workflow where students rate multiple subjects separately instead of completing a single form.

## Recent Enhancement: Year-Based Subject Preview for HOD ✅ COMPLETE

### API 10: Get Subjects by Year (HOD Form Creation)

**Endpoint:** `GET /api/feedback/subjects-by-year/?year=3&semester=5&department_id=1`  
**View:** `GetSubjectsByYearView` in `backend/feedback/views.py`  
**URL Pattern:** Added to `backend/feedback/urls.py`

**Purpose:** When HOD creates "Subject Feedback" form and selects a year, automatically fetch and display all subjects for that year so HOD can preview what will be included.

**Request Parameters:**
- `year` (required): Student year (1, 2, 3, 4)
- `semester` (optional): Semester ID
- `department_id` (optional): Department ID (auto-filled from HOD's department)

**Response Format:**
```json
{
  "subjects": [
    {
      "subject_name": "Database Management Systems",
      "subject_code": "CS301",
      "staff_names": "Dr. Kumar, Prof. Singh",
      "sections": "A, B",
      "teaching_assignment_ids": [45, 46],
      "assignment_count": 2
    }
  ],
  "total_subjects": 5,
  "year": 3,
  "semester_id": 5,
  "department_id": 1
}
```

**Frontend Integration:**
- **File:** `frontend/src/pages/feedback/FeedbackPage.tsx`
- Added state: `subjectsByYear`, `loadingSubjects`
- useEffect hook triggers API call when:
  - Feedback type is "SUBJECT_FEEDBACK"
  - Years are selected
  - HOD department is available
- Display: Blue-bordered card below section selection with scrollable subject list
- Shows: Subject name, code, staff names, sections, assignment count
- Loading indicator while fetching

**UI Features:**
- Automatically fetches when year checkbox changes
- Displays total subject count
- Scrollable list (max-height: 240px) with custom scrollbar
- Empty state with helpful message if no subjects found
- Each subject card shows:
  - Subject name and code
  - Teaching staff names
  - Section names
  - Number of teaching assignments

---

## Backend Implementation ✅ COMPLETE

### 1. Database Changes

**File:** `backend/feedback/models.py`

Updated `FeedbackResponse` model with three new fields:
```python
teaching_assignment = ForeignKey('academics.TeachingAssignment')  # Links to subject-staff assignment
subject = ForeignKey('curriculum.CurriculumDepartment')           # Denormalized subject reference
staff = ForeignKey('academics.StaffProfile')                      # Denormalized staff reference
```

**Unique constraint updated:** `('feedback_form', 'question', 'user', 'teaching_assignment')`
- For subject feedback: Each student can respond once per subject
- For open feedback: teaching_assignment is NULL

**Migration:** `0008_add_subject_feedback_fields.py` (Applied)

### 2. New API Endpoint

**Endpoint:** `GET /api/feedback/<form_id>/subjects/`  
**View:** `GetStudentSubjectsView` in `backend/feedback/views.py`

**Purpose:** Fetches list of subjects for a student to rate

**Features:**
- ✅ Excludes 1st year students (returns `is_first_year: true`)
- ✅ Automatically determines student year from batch/academic year
- ✅ Fetches teaching assignments from student's section
- ✅ Tracks completion status per subject
- ✅ Returns subject name, code, staff name, completion status

**Response Format:**
```json
{
  "feedback_form_id": 123,
  "subjects": [
    {
      "teaching_assignment_id": 45,
      "subject_name": "Database Management Systems",
      "subject_code": "CS301",
      "staff_name": "Dr. Kumar",
      "staff_id": 12,
      "is_completed": false
    },
    ...
  ],
  "total_subjects": 5,
  "completed_subjects": 2,
  "all_completed": false
}
```

### 3. Updated Submission Logic

**File:** `backend/feedback/views.py` - `SubmitFeedbackView`

**Changes:**
- ✅ Accepts `teaching_assignment_id` in request payload
- ✅ Different duplicate checks:
  - **Subject feedback:** Check if student submitted for specific subject
  - **Open feedback:** Check if student submitted for form (teaching_assignment = NULL)
- ✅ Prevents duplicate submissions per subject

**File:** `backend/feedback/serializers.py` - `FeedbackSubmissionSerializer`

**Changes:**
- ✅ Added `teaching_assignment_id` field (optional)
- ✅ `save()` method stores teaching_assignment, subject, and staff with each response
- ✅ Backward compatible with open feedback (teaching_assignment_id = null)

### 4. URL Routing

**File:** `backend/feedback/urls.py`

Added route:
```python
path('<int:form_id>/subjects/', GetStudentSubjectsView.as_view(), name='feedback-subjects')
```

## Frontend Implementation 🚧 TODO

### Required Changes

#### 1. Update FeedbackPage.tsx Types

Add new types:
```typescript
type SubjectFeedbackData = {
  teaching_assignment_id: number;
  subject_name: string;
  subject_code: string;
  staff_name: string;
  staff_id: number;
  is_completed: boolean;
};

type SubjectListResponse = {
  feedback_form_id: number;
  subjects: SubjectFeedbackData[];
  total_subjects: number;
  completed_subjects: number;
  all_completed: boolean;
};
```

#### 2. Fetch Subjects for Subject Feedback

When student opens a SUBJECT_FEEDBACK form, call:
```typescript
const fetchSubjects = async (formId: number) => {
  const response = await fetchWithAuth(`/api/feedback/${formId}/subjects/`);
  if (response.ok) {
    const data: SubjectListResponse = await response.json();
    
    // Check if first year
    if (data.is_first_year) {
      alert('Subject feedback is not applicable for 1st year students.');
      return;
    }
    
    // Store subjects in state
    setSubjects(data.subjects);
  }
};
```

#### 3. Create Subject List UI

Display subjects as clickable cards:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {subjects.map((subject) => (
    <div 
      key={subject.teaching_assignment_id}
      onClick={() => handleSubjectClick(subject)}
      className={`p-4 border rounded-lg cursor-pointer ${
        subject.is_completed ? 'bg-green-50 border-green-500' : 'bg-white border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{subject.subject_name}</h3>
          <p className="text-sm text-slate-600">{subject.subject_code}</p>
          <p className="text-sm text-slate-500">Staff: {subject.staff_name}</p>
        </div>
        {subject.is_completed ? (
          <CheckCircle className="w-6 h-6 text-green-600" />
        ) : (
          <Circle className="w-6 h-6 text-slate-400" />
        )}
      </div>
    </div>
  ))}
</div>
```

#### 4. Open Questions for Selected Subject

When subject card clicked:
```typescript
const handleSubjectClick = (subject: SubjectFeedbackData) => {
  setSelectedSubject(subject);
  setShowQuestions(true);
  
  // Initialize responses for this subject
  const initialResponses: Record<number, FeedbackResponse> = {};
  feedbackForm.questions.forEach(q => {
    initialResponses[q.id!] = {
      question: q.id!,
      answer_star: undefined,
      answer_text: ''
    };
  });
  setResponses(initialResponses);
};
```

#### 5. Submit Subject-Specific Feedback

When submitting for a specific subject:
```typescript
const handleSubmitSubjectFeedback = async () => {
  const responsesArray = Object.values(responses);
  
  const payload = {
    feedback_form_id: feedbackForm.id,
    teaching_assignment_id: selectedSubject.teaching_assignment_id,  // KEY FIELD
    responses: responsesArray
  };
  
  const response = await fetchWithAuth('/api/feedback/submit/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (response.ok) {
    // Mark subject as completed
    setSubjects(subjects.map(s => 
      s.teaching_assignment_id === selectedSubject.teaching_assignment_id
        ? { ...s, is_completed: true }
        : s
    ));
    
    // Close questions view
    setShowQuestions(false);
    setSelectedSubject(null);
    
    alert('Feedback submitted for ' + selectedSubject.subject_name);
  }
};
```

#### 6. Track Overall Completion

```typescript
const completedCount = subjects.filter(s => s.is_completed).length;
const totalCount = subjects.length;
const allCompleted = completedCount === totalCount;

// Show progress
<div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
  <p className="text-sm font-medium text-blue-800">
    Progress: {completedCount} / {totalCount} subjects completed
  </p>
  <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
    <div 
      className="bg-blue-600 h-2 rounded-full transition-all"
      style={{ width: `${(completedCount / totalCount) * 100}%` }}
    />
  </div>
</div>
```

#### 7. Enable Final Submit Only When All Complete

```tsx
<button
  onClick={handleFinalSubmit}
  disabled={!allCompleted}
  className={`px-6 py-3 rounded-lg font-semibold ${
    allCompleted
      ? 'bg-green-600 text-white hover:bg-green-700'
      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
  }`}
>
  {allCompleted ? 'Submit Final Feedback' : 'Complete All Subjects First'}
</button>
```

## Key Workflows

### HOD Workflow
1. Select "Students" as target
2. Select "Subject Feedback" as type
3. Create common questions (applies to all subjects)
4. Select years/sections
5. Publish form

### Student Workflow
1. Open feedback form
2. **IF first year:** See message "Not applicable"
3. **ELSE:** See list of subjects from timetable
4. Click subject → Opens questions
5. Rate questions for that subject
6. Submit → Subject marked complete ✓
7. Repeat for all subjects
8. Final submit enabled when all done

## Testing Checklist

### Backend Testing
- [ ] Test GET `/api/feedback/<form_id>/subjects/` for different students
- [ ] Verify 1st year exclusion works
- [ ] Test duplicate submission prevention per subject
- [ ] Verify teaching_assignment_id is stored correctly
- [ ] Test completion status tracking
- [ ] Check that subject/staff fields are populated

### Frontend Testing
- [ ] Subject list displays correctly
- [ ] Completion checkmarks appear after submission
- [ ] Questions open when subject clicked
- [ ] Responses are isolated per subject
- [ ] Progress bar updates correctly
- [ ] Final submit only enabled when all completed
- [ ] Error handling for API failures

## Database Schema

**Before:**
```
feedback_responses:
- id
- feedback_form_id
- question_id
- user_id
- answer_star
- answer_text
- created_at
- updated_at

UNIQUE (feedback_form_id, question_id, user_id)
```

**After:**
```
feedback_responses:
- id
- feedback_form_id
- question_id
- user_id
- teaching_assignment_id  ← NEW
- subject_id              ← NEW (denormalized)
- staff_id                ← NEW (denormalized)
- answer_star
- answer_text
- created_at
- updated_at

UNIQUE (feedback_form_id, question_id, user_id, teaching_assignment_id)
```

## Backward Compatibility

✅ **Open Feedback Still Works:**
- `teaching_assignment_id` is NULL for open feedback
- Existing open feedback submissions unaffected
- Old frontend code continues to work
- New fields are optional

## Files Modified

### Backend
- ✅ `backend/feedback/models.py` - Added fields to FeedbackResponse
- ✅ `backend/feedback/views.py` - Added GetStudentSubjectsView, updated SubmitFeedbackView
- ✅ `backend/feedback/serializers.py` - Updated FeedbackSubmissionSerializer
- ✅ `backend/feedback/urls.py` - Added new route
- ✅ `backend/feedback/migrations/0008_add_subject_feedback_fields.py` - Migration

### Frontend (TODO)
- 🚧 `frontend/src/pages/feedback/FeedbackPage.tsx` - Add subject feedback UI
- 🚧 Add state management for subjects
- 🚧 Add subject list component
- 🚧 Update submission logic
- 🚧 Add completion tracking

## Notes

1. **Year Calculation:** Automatically calculated from batch start year vs current academic year
2. **Subject Sources:** Supports regular subjects, curriculum rows, elective subjects, custom subjects
3. **Staff Association:** Each response linked to specific staff member teaching that subject
4. **Completion Tracking:** Checked by querying existing FeedbackResponse records per teaching_assignment
5. **Performance:** Uses select_related() to minimize database queries

## Migration Status

✅ Migration 0008 applied (faked because columns already existed from previous development)

## API Endpoint Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/feedback/forms/` | List all forms |
| POST | `/api/feedback/create/` | HOD creates form |
| POST | `/api/feedback/submit/` | Submit responses (updated for subject feedback) |
| GET | `/api/feedback/<id>/subjects/` | Get student's subjects (NEW) |
| GET | `/api/feedback/<id>/responses/` | HOD views responses |
| GET | `/api/feedback/<id>/statistics/` | Response statistics |

