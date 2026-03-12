# Student Feedback UI Differentiation - Implementation Guide

## Overview
This document describes the implementation of differentiated student interfaces for the Feedback module based on feedback type. Students now experience different workflows when responding to **Open Feedback** vs **Subject Feedback**.

## Implementation Date
January 8, 2025

## Feature Description

### Two Student Experiences

#### 1. Open Feedback (Type: `OPEN_FEEDBACK`)
**Current Behavior - Unchanged**
- Student clicks "Respond" on a feedback form
- Questions are displayed directly in a modal
- Student answers all questions at once
- Submits feedback for the entire form

**Use Case**: General feedback about facilities, events, or non-academic topics

#### 2. Subject Feedback (Type: `SUBJECT_FEEDBACK`)
**New Behavior - CAMU Style**
- Student clicks "Respond" on a feedback form
- **Subject List View** is displayed first showing all their subjects
- Student must click on each subject individually
- Per-subject questions modal opens for that specific subject
- Student submits feedback for each subject separately
- Progress tracking shows completion status (X / Y subjects completed)
- Final submission enabled only when ALL subjects completed

**Use Case**: Feedback about teaching staff and course delivery

## User Flow Diagrams

### Open Feedback Flow
```
[Feedback Form Card] 
    → Click "Respond" 
    → [Questions Modal Opens]
    → Answer all questions
    → Submit
    → Done ✓
```

### Subject Feedback Flow
```
[Feedback Form Card]
    → Click "Respond"
    → [Subject List View]
    → See all subjects with completion status
    → Click Subject 1
        → [Questions Modal for Subject 1]
        → Answer questions
        → Submit for this subject
        → Back to subject list ✓
    → Click Subject 2
        → [Questions Modal for Subject 2]
        → Answer questions
        → Submit for this subject
        → Back to subject list ✓
    → ... repeat for all subjects
    → All subjects completed ✓
    → Close form
```

## Technical Implementation

### Frontend Changes (FeedbackPage.tsx)

#### 1. New TypeScript Types (Lines 94-115)
```typescript
// Extended FeedbackResponse with teaching_assignment_id
interface FeedbackResponse {
  question: number;
  answer_star?: number;
  answer_text?: string;
  teaching_assignment_id?: number;  // NEW: For subject-specific responses
}

// Student subject data structure
interface StudentSubject {
  teaching_assignment_id: number;
  subject_name: string;
  subject_code: string;
  staff_name: string;
  staff_id: number;
  is_completed: boolean;  // Has student submitted feedback for this subject?
}

// API response for student subjects
interface StudentSubjectsResponse {
  feedback_form_id: number;
  subjects: StudentSubject[];
  total_subjects: number;
  completed_subjects: number;
  all_completed: boolean;
  is_first_year: boolean;
}
```

#### 2. New State Variables (Lines 181-187)
```typescript
const [studentSubjects, setStudentSubjects] = useState<StudentSubjectsResponse | null>(null);
const [loadingStudentSubjects, setLoadingStudentSubjects] = useState(false);
const [selectedSubject, setSelectedSubject] = useState<StudentSubject | null>(null);
const [currentSubjectResponses, setCurrentSubjectResponses] = useState<Record<number, FeedbackResponse>>({});
```

#### 3. Fetch Student Subjects Function (Added after handleCloseForm)
```typescript
const fetchStudentSubjects = async (formId: number) => {
  setLoadingStudentSubjects(true);
  try {
    const response = await fetchWithAuth(`/api/feedback/${formId}/subjects/`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch student subjects');
    }
    
    const data: StudentSubjectsResponse = await response.json();
    setStudentSubjects(data);
  } catch (error) {
    console.error('Error fetching student subjects:', error);
    setResponseError('Failed to load subjects. Please try again.');
  } finally {
    setLoadingStudentSubjects(false);
  }
};
```

#### 4. Auto-Fetch useEffect (Added after fetchStudentSubjects)
```typescript
// Fetch student subjects when SUBJECT_FEEDBACK form is selected
useEffect(() => {
  if (selectedForm && selectedForm.type === 'SUBJECT_FEEDBACK') {
    fetchStudentSubjects(selectedForm.id);
  }
}, [selectedForm]);
```

#### 5. Updated handleCloseForm (Lines 852-859)
- Added reset for `studentSubjects`, `selectedSubject`, `currentSubjectResponses`

#### 6. Updated handleResponseChange (Lines 748-768)
- Now checks if `selectedSubject` is set
- Uses `currentSubjectResponses` for subject mode
- Uses `responses` for open feedback mode

#### 7. Updated handleSubmitResponse (Lines 775-900)
- Determines which response object to use based on mode
- Includes `teaching_assignment_id` in payload for subject feedback
- Refreshes subject list after successful subject submission
- Returns to subject list instead of closing modal
- Shows success message with subject name

#### 8. Conditional Modal Content (Lines 2050-2150)
**Subject List View** (when `type === 'SUBJECT_FEEDBACK' && !selectedSubject`)
- Loading state with spinner
- First-year student message (feedback not available)
- Progress indicator card (X / Y completed)
- Subject cards grid (2 columns)
  - Green border + checkmark for completed subjects
  - Gray border + empty circle for pending subjects
  - Shows subject name, code, staff name
- Click subject → sets `selectedSubject` state

**Questions View** (when `type === 'OPEN_FEEDBACK' || selectedSubject`)
- Same question rendering as before
- Star ratings and text comments
- Uses correct response object (`currentSubjectResponses` vs `responses`)

#### 9. Modal Header Updates (Lines 2040-2070)
- Back button when viewing subject questions (← arrow icon)
- Displays subject name when `selectedSubject` is set
- Shows subject code and staff name in subtitle

#### 10. Submit Button Logic (Lines 2292-2335)
**When viewing questions:**
- "Submit for This Subject" button (subject mode)
- "Submit Feedback" button (open mode)
- Back button returns to subject list
- Cancel button closes modal

**When viewing subject list:**
- Yellow warning if not all subjects completed
- Green success message if all subjects completed
- Close button to exit modal

### Backend API Used

#### GetStudentSubjectsView (API 9)
**Endpoint**: `GET /api/feedback/<form_id>/subjects/`

**Purpose**: Fetch list of subjects for the logged-in student for a specific feedback form

**Response Structure**:
```json
{
  "feedback_form_id": 123,
  "subjects": [
    {
      "teaching_assignment_id": 456,
      "subject_name": "Data Structures",
      "subject_code": "CS201",
      "staff_name": "Dr. Smith",
      "staff_id": 78,
      "is_completed": false
    },
    {
      "teaching_assignment_id": 457,
      "subject_name": "Algorithms",
      "subject_code": "CS202",
      "staff_name": "Dr. Johnson",
      "staff_id": 79,
      "is_completed": true
    }
  ],
  "total_subjects": 2,
  "completed_subjects": 1,
  "all_completed": false,
  "is_first_year": false
}
```

**Special Cases**:
- First-year students: Returns `is_first_year: true` with empty subjects list
- No subjects assigned: Returns empty subjects list
- Completion tracking: `is_completed` based on existing FeedbackResponse records

## UI Components

### Subject List Card (Pending)
```
┌─────────────────────────────────────┐
│  Data Structures                  ◯ │
│  CS201                              │
│  ─────────────────────────────────  │
│  👥 Dr. Smith                       │
└─────────────────────────────────────┘
```

### Subject List Card (Completed)
```
┌─────────────────────────────────────┐
│  Algorithms                       ✓ │
│  CS202                              │
│  ─────────────────────────────────  │
│  👥 Dr. Johnson                     │
└─────────────────────────────────────┘
```

### Progress Indicator
```
┌─────────────────────────────────────┐
│  Your Subjects              2 / 5   │
│  Complete feedback for all          │
│  subjects to submit       Completed │
└─────────────────────────────────────┘
```

## Testing Checklist

### Open Feedback Testing
- [ ] Click "Respond" on Open Feedback form
- [ ] Questions modal opens directly
- [ ] Answer star ratings and comments
- [ ] Submit button works
- [ ] Modal closes after submission
- [ ] Success message appears
- [ ] Form marked as submitted

### Subject Feedback Testing (Non-First Year Student)
- [ ] Click "Respond" on Subject Feedback form
- [ ] Subject list view appears (not questions)
- [ ] Loading spinner shows while fetching subjects
- [ ] All student's subjects are listed (6-8 subjects typical)
- [ ] Progress indicator shows "0 / X Completed"
- [ ] Pending subjects have gray border + empty circle
- [ ] Completed subjects have green border + checkmark
- [ ] Click first subject
  - [ ] Questions modal opens for that subject
  - [ ] Modal header shows subject name, code, staff name
  - [ ] Back button (← arrow) appears in header
  - [ ] Answer star ratings and comments
  - [ ] Submit button text: "Submit for This Subject"
  - [ ] Back button text: "Back"
  - [ ] Click Submit
  - [ ] Returns to subject list (not closes modal)
  - [ ] Subject now marked as completed (green, checkmark)
  - [ ] Progress updated: "1 / X Completed"
- [ ] Repeat for remaining subjects
- [ ] After all subjects completed
  - [ ] Progress shows "X / X Completed"
  - [ ] Green success message appears
  - [ ] All subject cards have green borders + checkmarks
  - [ ] Close button to exit modal

### Subject Feedback Testing (First Year Student)
- [ ] Click "Respond" on Subject Feedback form
- [ ] Blue message box appears
- [ ] Message: "Subject feedback is not available for first year students"
- [ ] No subjects listed
- [ ] Close button to exit modal

### Edge Cases
- [ ] Student with 0 subjects assigned → "No Subjects Found" message
- [ ] API error → Error message displayed
- [ ] Submit per-subject response multiple times → Backend prevents duplicates (unique constraint)
- [ ] Close modal mid-subject → State resets correctly
- [ ] Switch between open/subject feedback forms → Correct view rendered

## Browser Console Logs

### Fetch Student Subjects
```javascript
// On subject list load
'Fetching student subjects for form ID: 123'

// Success
'Student subjects loaded:', {feedback_form_id: 123, subjects: [...], ...}

// Error
'Error fetching student subjects:', Error
```

### Submit Per-Subject Response
```javascript
// On submit
'Submitting feedback payload:', {
  feedback_form_id: 123,
  responses: [
    {
      question: 1,
      answer_star: 5,
      teaching_assignment_id: 456
    },
    ...
  ]
}

// Success
'Response status: 200'
'Response data:', {...}
'Feedback submitted successfully'

// Error
'Submission failed:', 'Error message', {...}
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     Student Opens Feedback                   │
└───────────────────┬──────────────────────────────────────────┘
                    │
                    ├─ type = OPEN_FEEDBACK
                    │    └─→ Show Questions → Submit → Done
                    │
                    └─ type = SUBJECT_FEEDBACK
                         └─→ Fetch Subjects API
                              │
                              ├─ is_first_year = true
                              │    └─→ Show Message → Close
                              │
                              └─ is_first_year = false
                                   └─→ Show Subject List
                                        │
                                        ├─ Click Subject A
                                        │    └─→ Show Questions
                                        │         └─→ Submit with teaching_assignment_id
                                        │              └─→ Refresh Subjects
                                        │                   └─→ Back to List (A ✓)
                                        │
                                        ├─ Click Subject B
                                        │    └─→ Show Questions
                                        │         └─→ Submit with teaching_assignment_id
                                        │              └─→ Refresh Subjects
                                        │                   └─→ Back to List (A ✓, B ✓)
                                        │
                                        └─ All Completed
                                             └─→ Green Success Message
                                                  └─→ Close
```

## Files Modified

1. **frontend/src/pages/feedback/FeedbackPage.tsx**
   - Added TypeScript types for student subjects
   - Added state variables for subject tracking
   - Added `fetchStudentSubjects` function
   - Added useEffect to auto-fetch subjects
   - Updated `handleCloseForm` to reset subject states
   - Updated `handleResponseChange` for dual-mode support
   - Updated `handleSubmitResponse` for per-subject submission
   - Added conditional rendering in modal (subject list vs questions)
   - Updated modal header for subject context
   - Updated submit buttons with conditional logic
   - Added ChevronLeft icon import

## Performance Considerations

### API Calls
- **Open Feedback**: 1 API call (submit)
- **Subject Feedback**: 
  - 1 initial call (fetch subjects)
  - N submit calls (one per subject)
  - N refresh calls (after each submit)
  - Total: 2N + 1 calls for N subjects

### State Management
- Subject list cached in `studentSubjects` state
- Per-subject responses isolated in `currentSubjectResponses`
- Open feedback responses remain in `responses` state
- No prop drilling - all state at page level

### Rendering
- Subject list: O(N) where N = number of subjects
- Questions view: O(M) where M = number of questions
- No unnecessary re-renders (React.memo not needed for current scale)

## Future Enhancements

1. **Batch Submission**
   - Allow students to answer all subjects offline
   - Single final submit after all subjects answered
   - Reduces API calls from 2N+1 to 2

2. **Progress Persistence**
   - Store partial responses in localStorage
   - Resume if browser closes
   - Auto-save drafts every 30 seconds

3. **Subject Filtering**
   - Search subjects by name/code
   - Filter by completion status
   - Sort alphabetically or by staff name

4. **Bulk Actions**
   - "Mark All as Draft" button
   - "Skip Subject" option (optional subjects)
   - Keyboard navigation (arrow keys, Enter to open)

5. **Analytics**
   - Time spent per subject
   - Average completion rate
   - Drop-off analysis (which subjects students abandon)

## Known Limitations

1. **No Draft Saving**: If student closes modal, all unsaved per-subject responses are lost
2. **No Offline Support**: Requires active internet connection
3. **No Mobile Optimization**: Subject list cards not optimized for small screens yet
4. **No Accessibility**: Missing ARIA labels, keyboard navigation incomplete
5. **No Retry Logic**: Failed API calls require manual page refresh

## Related Documentation

- [SUBJECT_FEEDBACK_IMPLEMENTATION.md](./SUBJECT_FEEDBACK_IMPLEMENTATION.md) - Backend implementation guide
- [MULTI_YEAR_SUBJECT_DISPLAY.md](./MULTI_YEAR_SUBJECT_DISPLAY.md) - HOD multi-year subject preview
- [FEEDBACK_TESTING_GUIDE.md](./FEEDBACK_TESTING_GUIDE.md) - Comprehensive testing procedures

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-08 | 1.0.0 | Initial implementation of differentiated student UI |

## Support

For issues or questions, contact the development team or refer to the main [README.md](../README.md).
