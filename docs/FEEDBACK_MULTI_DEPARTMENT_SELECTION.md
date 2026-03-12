# Multi-Department Feedback Selection - Implementation Guide

## Overview
This document describes the enhancement to allow HODs with multiple departments to select and apply a single feedback form to multiple departments simultaneously. Instead of switching between departments to create separate feedback forms, HODs can now select multiple departments and create one feedback form with common questions that applies to all selected departments.

## Implementation Date
March 10, 2026

## Feature Description

### Problem Statement
Previously, HODs with multiple departments (e.g., AI HOD managing both AI & DS and AI & ML) had to:
1. Switch to Department 1
2. Create feedback form for Department 1
3. Switch to Department 2
4. Recreate the same feedback form for Department 2

This was repetitive and time-consuming, especially when the same questions needed to be asked across multiple departments.

### Solution
Implemented multi-department selection with checkboxes, allowing HODs to:
1. Open feedback form creation
2. Select multiple departments via checkboxes
3. Create one feedback form with common questions
4. Backend automatically creates feedback records for each selected department
5. Students from all selected departments see the same feedback form

## User Flows

### Case 1: Single-Department HOD (Computer Science)

```
[HOD Opens Feedback Page]
    ↓
[Clicks "New Form"]
    ↓
[Form shows: "Department: Computer Science" (static display)]
    ↓
[No checkbox selection needed - auto-assigned to Computer Science]
    ↓
[Fill out feedback details and questions]
    ↓
[Submit → Feedback created for Computer Science]
```

**UI Display:**
```
┌─────────────────────────────────────────────────────┐
│ Department: Computer Science (CSE)                  │
├─────────────────────────────────────────────────────┤
│ [Target Type: Student/Staff]                        │
│ [Feedback Type: Subject/Open]                       │
│ [Years/Sections/Questions...]                       │
└─────────────────────────────────────────────────────┘
```

### Case 2: Multi-Department HOD Selecting All Departments

```
[HOD Opens Feedback Page]
    ↓
[Clicks "New Form"]
    ↓
[Form shows department checkboxes - ALL checked by default]
    ☑ AI & Data Science (AI & DS)
    ☑ AI & Machine Learning (AI & ML)
    ↓
[Fill out feedback details and questions]
    ↓
[Submit → Backend creates 2 feedback forms:]
    • Feedback for AI & DS (same questions)
    • Feedback for AI & ML (same questions)
```

### Case 3: Multi-Department HOD Selecting Specific Departments

```
[HOD Opens Feedback Page]
    ↓
[Clicks "New Form"]
    ↓
[Form shows department checkboxes - all checked by default]
    ☑ AI & Data Science (AI & DS)
    ☑ AI & Machine Learning (AI & ML)
    ↓
[HOD unchecks AI & ML]
    ☑ AI & Data Science (AI & DS)
    ☐ AI & Machine Learning (AI & ML)
    ↓
[Sections reload to show only AI & DS sections]
    ↓
[Fill out feedback details and questions]
    ↓
[Submit → Feedback created only for AI & DS]
```

**UI Display:**
```
┌─────────────────────────────────────────────────────┐
│ Select Department(s) *                              │
├─────────────────────────────────────────────────────┤
│ ☑ AI & Data Science (AI & DS)                      │
│ ☑ AI & Machine Learning (AI & ML)                  │
│                                                     │
│ Selected: 2 department(s)                          │
├─────────────────────────────────────────────────────┤
│ [Target Type: Student/Staff]                        │
│ [Feedback Type: Subject/Open]                       │
│ [Years/Sections/Questions...]                       │
└─────────────────────────────────────────────────────┘
```

## Technical Implementation

### Backend Changes

#### 1. Updated CreateFeedbackFormView (API 1)
**File:** `backend/feedback/views.py` (API 1: Create Feedback Form)

**Previous Behavior:**
- Accepted single `department` ID in request payload
- Created one feedback form for one department
- Multi-department HODs had to make separate API calls for each department

**New Behavior:**
- Accepts `departments` array in request payload
- Loops through all selected departments
- Creates feedback form for each department with same questions
- Returns count of created forms and any errors

**Key Changes:**

```python
# OLD: Single department logic
active_department_id = request.data.get('department_id')
mutable_data['department'] = active_department_id
serializer = FeedbackFormCreateSerializer(data=mutable_data)
feedback_form = serializer.save(created_by=request.user)

# NEW: Multi-department logic
departments_payload = request.data.get('departments', [])
selected_department_ids = []

if departments_count > 1:
    # Multi-department HOD
    if departments_payload and len(departments_payload) > 0:
        # Validate all selected departments belong to HOD
        dept_ids = [dr.department.id for dr in department_roles]
        for dept_id in departments_payload:
            if int(dept_id) not in dept_ids:
                return Response({'detail': 'You do not have HOD access...'}, status=403)
        selected_department_ids = [int(d) for d in departments_payload]
    else:
        return Response({'detail': 'Please select at least one department.'}, status=400)

# Create feedback for each selected department
created_forms = []
errors = []

for dept_id in selected_department_ids:
    mutable_data = request.data.copy()
    mutable_data['department'] = dept_id
    
    serializer = FeedbackFormCreateSerializer(data=mutable_data)
    if serializer.is_valid():
        feedback_form = serializer.save(created_by=request.user)
        created_forms.append(feedback_form)
    else:
        errors.append({'department_id': dept_id, 'errors': serializer.errors})

# Return results
return Response({
    'detail': f'Successfully created {len(created_forms)} feedback form(s).',
    'created_count': len(created_forms),
    'created_forms': [FeedbackFormSerializer(form).data for form in created_forms]
}, status=HTTP_201_CREATED)
```

**Validation:**
- Verifies each selected department belongs to the HOD
- Requires at least one department to be selected
- Returns 403 if HOD tries to select unauthorized department

**Response Examples:**

**Success (All Forms Created):**
```json
{
  "detail": "Successfully created 2 feedback form(s).",
  "created_count": 2,
  "created_forms": [
    {
      "id": 101,
      "title": "Mid-Semester Subject Feedback",
      "department": 5,
      "questions": [...]
    },
    {
      "id": 102,
      "title": "Mid-Semester Subject Feedback",
      "department": 6,
      "questions": [...]
    }
  ]
}
```

**Partial Success:**
```json
{
  "detail": "Created 1 feedback form(s), but 1 failed.",
  "created_count": 1,
  "created_forms": [{ "id": 101, ... }],
  "errors": [
    {
      "department_id": 6,
      "errors": { "year": ["This field is required."] }
    }
  ]
}
```

**Validation Failure:**
```json
{
  "detail": "You do not have HOD access to department ID 7."
}
```

#### 2. Updated GetClassOptionsView (API 5)
**File:** `backend/feedback/views.py` (API 5: Get Class Options)

**Purpose:** Returns years, semesters, and sections for feedback form creation

**Previous Behavior:**
- Used single `active_hod_department_id` from session
- Filtered sections by one department only

**New Behavior:**
- Accepts `departments` query parameter (array)
- Filters sections by multiple departments using `department__in`
- Returns sections from all selected departments

**Key Changes:**

```python
# OLD: Single department filtering
user_department = None
if departments_count > 1:
    active_dept_id = request.session.get('active_hod_department_id')
    user_department = Department.objects.get(id=active_dept_id)

sections_filter['batch__course__department'] = user_department

# NEW: Multi-department filtering
user_departments = []
departments_param = request.GET.getlist('departments[]')
if not departments_param:
    departments_param = request.GET.get('departments', '').split(',')

if departments_count > 1 and departments_param:
    # Validate and use selected departments
    available_dept_ids = [dr.department.id for dr in department_roles]
    for dept_id_str in departments_param:
        if dept_id_str:
            dept_id = int(dept_id_str)
            if dept_id in available_dept_ids:
                dept = Department.objects.get(id=dept_id)
                user_departments.append(dept)

sections_filter['batch__course__department__in'] = user_departments
```

**API Usage:**

```
GET /api/feedback/class-options/?departments[]=5&departments[]=6
```

**Response:**
```json
{
  "success": true,
  "years": [
    {"value": 1, "label": "1st Year"},
    {"value": 2, "label": "2nd Year"},
    {"value": 3, "label": "3rd Year"},
    {"value": 4, "label": "4th Year"}
  ],
  "sections": [
    {"value": 11, "label": "Section A", "year": 2},  // AI & DS
    {"value": 12, "label": "Section B", "year": 2},  // AI & DS
    {"value": 21, "label": "Section A", "year": 2},  // AI & ML
    {"value": 22, "label": "Section B", "year": 2}   // AI & ML
  ],
  "year_sections": {
    "2": [
      {"value": 11, "label": "Section A", "year": 2},
      {"value": 12, "label": "Section B", "year": 2},
      {"value": 21, "label": "Section A", "year": 2},
      {"value": 22, "label": "Section B", "year": 2}
    ]
  }
}
```

**Behavior Note:** If a department's year has no sections (e.g., AI & ML 3rd year has no sections), those sections simply won't appear in the response. The UI will naturally show only available sections.

### Frontend Changes

#### 1. Updated State Management
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx`

**New State Variables:**
```typescript
// Added for multi-department selection
const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]);
```

**Existing State (Unchanged):**
```typescript
const [departmentData, setDepartmentData] = useState<DepartmentResponse | null>(null);
const [activeDepartment, setActiveDepartment] = useState<Department | null>(null);
```

#### 2. Department Selection Initialization
**New useEffect:**

```typescript
// Initialize selectedDepartments when form is opened
useEffect(() => {
  if (showCreateForm && departmentData) {
    if (departmentData.has_multiple_departments) {
      // For multi-department HODs, default to ALL departments selected
      const allDeptIds = departmentData.departments.map(d => d.id);
      setSelectedDepartments(allDeptIds);
      // Fetch class options for all departments
      fetchClassOptions(allDeptIds);
    } else {
      // Single department - set to that department
      setSelectedDepartments(activeDepartment ? [activeDepartment.id] : []);
    }
  } else if (!showCreateForm) {
    // Reset when form is closed
    setSelectedDepartments([]);
  }
}, [showCreateForm, departmentData]);
```

**Default Behavior:**
- When multi-department HOD opens form: **All departments checked by default**
- Rationale: Most common use case is creating feedback for all departments
- HOD can uncheck departments they don't want to include

#### 3. Department Checkbox UI
**Location:** Inside `showCreateForm` section, before Target Type selection

```tsx
{/* Department Selection - Multi-Select for HODs with multiple departments */}
{departmentData && departmentData.has_multiple_departments && (
  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
    <div className="flex items-center gap-3 mb-3">
      <Users className="w-5 h-5 text-indigo-600" />
      <label className="text-sm font-semibold text-indigo-900">
        Select Department(s) <span className="text-red-500">*</span>
      </label>
    </div>
    <div className="space-y-2">
      {departmentData.departments.map((dept) => (
        <label
          key={dept.id}
          className="flex items-center gap-3 p-3 bg-white border border-indigo-200 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors"
        >
          <input
            type="checkbox"
            checked={selectedDepartments.includes(dept.id)}
            onChange={(e) => {
              if (e.target.checked) {
                const newSelected = [...selectedDepartments, dept.id];
                setSelectedDepartments(newSelected);
                // Reload class options for selected departments
                fetchClassOptions(newSelected);
              } else {
                const newSelected = selectedDepartments.filter(id => id !== dept.id);
                setSelectedDepartments(newSelected);
                // Reload class options for selected departments
                fetchClassOptions(newSelected.length > 0 ? newSelected : undefined);
              }
            }}
            className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-slate-900">{dept.name}</span>
          <span className="text-xs text-slate-500">({dept.code})</span>
        </label>
      ))}
    </div>
    {selectedDepartments.length > 0 && (
      <p className="text-xs text-indigo-700 mt-3">
        Selected: <span className="font-semibold">{selectedDepartments.length} department(s)</span>
      </p>
    )}
  </div>
)}

{/* Single Department Display - Show inside form for single-department HODs */}
{departmentData && !departmentData.has_multiple_departments && activeDepartment && (
  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
    <Users className="w-4 h-4 text-slate-600" />
    <span className="text-sm text-slate-700">
      Department: <span className="font-semibold text-slate-900">{activeDepartment.name}</span>
    </span>
  </div>
)}
```

**UI Behavior:**
- Checkboxes only shown for multi-department HODs
- Single-department HODs see static department label
- Checking/unchecking reloads sections via `fetchClassOptions(selectedDepts)`
- Counter shows "Selected: X department(s)"

#### 4. Updated fetchClassOptions Function

```typescript
const fetchClassOptions = async (deptIds?: number[]) => {
  if (canCreateFeedback) {
    try {
      setLoadingClassOptions(true);
      
      // Build URL with departments parameter if provided
      let url = '/api/feedback/class-options/';
      if (deptIds && deptIds.length > 0) {
        const params = new URLSearchParams();
        deptIds.forEach(id => params.append('departments[]', id.toString()));
        url += `?${params.toString()}`;
      }
      
      const response = await fetchWithAuth(url);
      // ... rest of fetch logic
    }
  }
};
```

**Usage:**
- Called with `deptIds` when department checkboxes change
- Sends `?departments[]=5&departments[]=6` to backend
- Updates available sections based on selected departments

#### 5. Updated Form Submission

**Validation:**
```typescript
// Validate department selection for multi-department HODs
if (departmentData && departmentData.has_multiple_departments) {
  if (selectedDepartments.length === 0) {
    setSubmitError('Please select at least one department');
    return;
  }
}
```

**Payload Construction:**
```typescript
// Determine departments to send
let departmentsToSend: number[] = [];
if (departmentData && departmentData.has_multiple_departments) {
  // Multi-department HOD - use selected departments
  departmentsToSend = selectedDepartments;
} else if (activeDepartment) {
  // Single department - use active department
  departmentsToSend = [activeDepartment.id];
}

const payload = {
  target_type: formData.target_type,
  type: formData.type,
  departments: departmentsToSend,  // Array of department IDs
  status: formData.status,
  questions: formData.questions,
  // ... rest of payload
};
```

**Old Payload Format:**
```json
{
  "department": 5,
  "target_type": "STUDENT",
  "questions": [...]
}
```

**New Payload Format:**
```json
{
  "departments": [5, 6],
  "target_type": "STUDENT",
  "questions": [...]
}
```

#### 6. Removed Department Switcher
**What was removed:**
- Department switcher buttons shown outside the form
- `handleDepartmentSwitch` function (no longer needed)
- Session-based active department storage for form creation

**Why:**
- No longer needed to switch between departments
- Multi-select checkboxes provide better UX
- Department selection happens during form creation, not before

## UI/UX Flow Comparison

### Old Flow (Department Switching)

```
┌─────────────────────────────────────────┐
│ Feedback Page                           │
├─────────────────────────────────────────┤
│ Select Department:                      │
│ [AI & DS] [AI & ML]  ← Switcher Buttons│
│ Selected: AI & Data Science             │
├─────────────────────────────────────────┤
│ [+ New Form]                            │
└─────────────────────────────────────────┘
        ↓ Click AI & DS
┌─────────────────────────────────────────┐
│ Create Feedback Form                    │
├─────────────────────────────────────────┤
│ Target: Student / Staff                 │
│ Type: Subject / Open                    │
│ [Questions...]                          │
│ [Submit] ← Creates for AI & DS only     │
└─────────────────────────────────────────┘
        ↓ Back to page
┌─────────────────────────────────────────┐
│ Select Department:                      │
│ [AI & DS] [AI & ML]  ← Switch to AI & ML│
└─────────────────────────────────────────┘
        ↓ Click AI & ML
┌─────────────────────────────────────────┐
│ Create Feedback Form                    │
│ (Repeat same form creation)             │
│ [Submit] ← Creates for AI & ML          │
└─────────────────────────────────────────┘
```

**Issues:**
- ❌ Repetitive: Must create form twice
- ❌ Time-consuming: Switch → Create → Submit → Switch → Create → Submit
- ❌ Error-prone: Might forget to create for second department

### New Flow (Multi-Select Checkboxes)

```
┌─────────────────────────────────────────┐
│ Feedback Page                           │
├─────────────────────────────────────────┤
│ [+ New Form]                            │
└─────────────────────────────────────────┘
        ↓ Click New Form
┌─────────────────────────────────────────┐
│ Create Feedback Form                    │
├─────────────────────────────────────────┤
│ Select Department(s) *                  │
│ ☑ AI & Data Science (AI & DS)          │
│ ☑ AI & Machine Learning (AI & ML)      │
│ Selected: 2 department(s)              │
├─────────────────────────────────────────┤
│ Target: Student / Staff                 │
│ Type: Subject / Open                    │
│ [Questions...]                          │
│ [Submit] ← Creates for BOTH departments │
└─────────────────────────────────────────┘
```

**Benefits:**
- ✅ One-time creation: Single form for all departments
- ✅ Faster: No switching required
- ✅ Intuitive: Clear visual feedback on selections
- ✅ Flexible: Can select all or specific departments

## Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    HOD Opens "New Form"                        │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
         GET /api/feedback/department/
                     ↓
    ┌────────────────────────────────┐
    │ Response:                      │
    │ {                              │
    │   has_multiple_departments: T  │
    │   departments: [               │
    │     {id: 5, name: "AI & DS"},  │
    │     {id: 6, name: "AI & ML"}   │
    │   ]                            │
    │ }                              │
    └────────────────┬───────────────┘
                     ↓
    ┌────────────────────────────────────────┐
    │ Frontend initializes:                  │
    │ selectedDepartments = [5, 6]  (ALL)    │
    └────────────────┬───────────────────────┘
                     ↓
    GET /api/feedback/class-options/
    ?departments[]=5&departments[]=6
                     ↓
    ┌────────────────────────────────────────┐
    │ Backend filters sections by:           │
    │ batch__course__department__in=[5, 6]   │
    └────────────────┬───────────────────────┘
                     ↓
    ┌────────────────────────────────────────┐
    │ Response:                              │
    │ {                                      │
    │   sections: [                          │
    │     {id: 11, year: 2},  // AI & DS     │
    │     {id: 12, year: 2},  // AI & DS     │
    │     {id: 21, year: 2},  // AI & ML     │
    │     {id: 22, year: 2}   // AI & ML     │
    │   ]                                    │
    │ }                                      │
    └────────────────┬───────────────────────┘
                     ↓
    ┌────────────────────────────────────────┐
    │ HOD fills form and clicks Submit       │
    └────────────────┬───────────────────────┘
                     ↓
    POST /api/feedback/create/
    {
      "departments": [5, 6],
      "target_type": "STUDENT",
      "type": "SUBJECT_FEEDBACK",
      "questions": [
        {"text": "How is teaching effectiveness?"}
      ]
    }
                     ↓
    ┌────────────────────────────────────────┐
    │ Backend loops:                         │
    │                                        │
    │ for dept_id in [5, 6]:                 │
    │   FeedbackForm.objects.create(         │
    │     department_id=dept_id,             │
    │     questions=questions,               │
    │     created_by=hod_user                │
    │   )                                    │
    └────────────────┬───────────────────────┘
                     ↓
    ┌────────────────────────────────────────┐
    │ Response:                              │
    │ {                                      │
    │   detail: "Successfully created 2...", │
    │   created_count: 2,                    │
    │   created_forms: [                     │
    │     {id: 101, department: 5, ...},     │
    │     {id: 102, department: 6, ...}      │
    │   ]                                    │
    │ }                                      │
    └────────────────────────────────────────┘
```

## Student Visibility

### Filtering Logic
**Backend:** `FeedbackForm.objects.filter(department=student.department)`

**Example:**
- **AI & DS Students** see feedback with `department=5` (AI & DS)
- **AI & ML Students** see feedback with `department=6` (AI & ML)
- Both see the **same questions** but records are department-specific

### Database Records Example

**Scenario:** HOD creates feedback for AI & DS and AI & ML

**FeedbackForm Table:**
```sql
| id  | title                | department_id | created_by | questions                |
|-----|----------------------|---------------|------------|--------------------------|
| 101 | Subject Feedback     | 5 (AI & DS)   | hod_user   | [Q1, Q2, Q3]             |
| 102 | Subject Feedback     | 6 (AI & ML)   | hod_user   | [Q1, Q2, Q3]  ← Same Q's |
```

**Student Query (AI & DS Student):**
```python
feedback_forms = FeedbackForm.objects.filter(
    department=student.department  # 5 (AI & DS)
)
# Returns: [101]
```

**Student Query (AI & ML Student):**
```python
feedback_forms = FeedbackForm.objects.filter(
    department=student.department  # 6 (AI & ML)
)
# Returns: [102]
```

**Key Point:** Students only see their department's feedback, even though questions are identical.

## Edge Cases & Handling

### Edge Case 1: No Departments Selected
**Scenario:** Multi-department HOD unchecks all departments

**Frontend Validation:**
```typescript
if (selectedDepartments.length === 0) {
  setSubmitError('Please select at least one department');
  return;
}
```

**UI Behavior:**
- Submit button enabled (no early disable)
- On submit, shows error: "Please select at least one department"
- Sections cleared when last department unchecked

### Edge Case 2: Partial Section Availability
**Scenario:** AI & DS has sections for Year 2, AI & ML has no sections for Year 2

**Backend Response:**
```json
{
  "year_sections": {
    "2": [
      {"value": 11, "label": "Section A", "year": 2},  // AI & DS only
      {"value": 12, "label": "Section B", "year": 2}   // AI & DS only
    ]
  }
}
```

**UI Result:**
- Year 2 shows only AI & DS sections
- HOD can still create feedback - AI & ML feedback will apply to all AI & ML Year 2 students without section filtering

### Edge Case 3: Single Department HOD
**Scenario:** Computer Science HOD has only one department

**UI Behavior:**
- No checkboxes shown
- Static label: "Department: Computer Science"
- `selectedDepartments` set to `[activeDepartment.id]`
- Backend receives `departments: [3]` (single-element array)

**Backend Handling:**
```python
elif departments_count == 1:
    # Single department - use it automatically
    selected_department_ids = [department_roles.first().department.id]
```

### Edge Case 4: Unauthorized Department Access
**Scenario:** HOD manually edits request to include unauthorized department

**Payload (tampered):**
```json
{
  "departments": [5, 6, 7],  // 7 = Computer Science (not HOD's dept)
  "questions": [...]
}
```

**Backend Response:**
```json
{
  "detail": "You do not have HOD access to department ID 7."
}
```

**Status Code:** 403 Forbidden

### Edge Case 5: Partial Form Creation Failure
**Scenario:** AI & DS form created successfully, AI & ML form fails validation

**Backend Response:**
```json
{
  "detail": "Created 1 feedback form(s), but 1 failed.",
  "created_count": 1,
  "created_forms": [
    {"id": 101, "department": 5, ...}
  ],
  "errors": [
    {
      "department_id": 6,
      "errors": {"year": ["This field is required."]}
    }
  ]
}
```

**Status Code:** 207 Multi-Status

**Frontend Handling:**
- Could show partial success message
- List which departments succeeded and which failed
- *(Current implementation may need enhancement for this UI)*

## Testing Guide

### Test Case 1: Multi-Department HOD - Create for All Departments
**Setup:**
1. Create HOD user with two DepartmentRole entries:
   - Department 1: AI & Data Science (ID: 5)
   - Department 2: AI & Machine Learning (ID: 6)
   - Role: HOD for both

**Steps:**
1. Log in as multi-department HOD
2. Navigate to Feedback page
3. Click "New Form"
4. Verify checkboxes appear with both departments **checked by default**
5. Verify counter shows "Selected: 2 department(s)"
6. Select Target Type: "Students"
7. Select Feedback Type: "Subject Feedback"
8. Select Year: 2
9. Verify sections from **both departments** appear
10. Add question: "How is the teaching effectiveness?"
11. Click Submit
12. Verify success message: "Successfully created 2 feedback form(s)."

**Expected Result:**
- ✅ Two feedback forms created in database (one per department)
- ✅ Both forms have same questions
- ✅ AI & DS students see feedback ID 101
- ✅ AI & ML students see feedback ID 102

### Test Case 2: Multi-Department HOD - Create for Single Department
**Setup:** Same as Test Case 1

**Steps:**
1. Log in as multi-department HOD
2. Click "New Form"
3. **Uncheck "AI & Machine Learning"**
4. Verify "AI & Data Science" still checked
5. Verify counter shows "Selected: 1 department(s)"
6. Verify sections reload to show only AI & DS sections
7. Fill rest of form and submit

**Expected Result:**
- ✅ One feedback form created (department=5 only)
- ✅ AI & DS students see feedback
- ✅ AI & ML students do NOT see feedback

### Test Case 3: Single-Department HOD
**Setup:**
1. Create HOD user with one DepartmentRole entry:
   - Department: Computer Science (ID: 3)
   - Role: HOD

**Steps:**
1. Log in as single-department HOD
2. Click "New Form"
3. Verify static label: "Department: Computer Science"
4. Verify **no checkboxes** appear
5. Fill form and submit

**Expected Result:**
- ✅ One feedback form created (department=3)
- ✅ No checkbox UI shown

### Test Case 4: Validation - No Departments Selected
**Setup:** Multi-department HOD

**Steps:**
1. Click "New Form"
2. Uncheck all departments
3. Fill rest of form
4. Click Submit

**Expected Result:**
- ✅ Error message: "Please select at least one department"
- ✅ Form not submitted

### Test Case 5: Sections Reload on Department Change
**Setup:** Multi-department HOD

**Steps:**
1. Click "New Form"
2. All departments checked by default
3. Note sections shown (AI & DS + AI & ML sections)
4. Uncheck "AI & Machine Learning"
5. Verify sections reload
6. Verify only AI & DS sections shown
7. Re-check "AI & Machine Learning"
8. Verify sections reload again
9. Verify both department sections shown

**Expected Result:**
- ✅ Sections dynamically update based on selected departments
- ✅ API called with correct `departments[]` parameter

### Test Case 6: Backend Authorization Check
**Setup:** Multi-department HOD (AI & DS, AI & ML)

**Steps:**
1. Use API client (Postman) to send POST request:
   ```
   POST /api/feedback/create/
   Body: {
     "departments": [5, 6, 3],  // 3 = Computer Science (unauthorized)
     "target_type": "STUDENT",
     "questions": [...]
   }
   ```

**Expected Result:**
- ✅ Response: 403 Forbidden
- ✅ Message: "You do not have HOD access to department ID 3."

## Performance Considerations

### Database Queries
**CreateFeedbackFormView:**
- **Old:** 1 INSERT per API call
- **New:** N INSERTs per API call (where N = number of selected departments)
- **Optimization:** Uses transaction (implicit in Django ORM)

**GetClassOptionsView:**
- **Old:** Filter by single department: `department=5`
- **New:** Filter by multiple departments: `department__in=[5, 6]`
- **Performance:** Minimal impact - indexed foreign key

### API Call Reduction
**Old Flow:**
- API calls per feedback form: 2 (one per department)
- Total for 2 departments: 2 CREATE calls

**New Flow:**
- API calls per feedback form: 1 (handles all departments)
- Total for 2 departments: 1 CREATE call
- **Improvement:** 50% reduction in API calls

### Frontend State Management
- `selectedDepartments` updated on checkbox change
- `fetchClassOptions` debounced (could be enhanced with debounce if needed)
- No excessive re-renders - state updates tied to user actions

## Security Considerations

### Department Ownership Verification
**Check:** Backend always validates department IDs against HOD's DepartmentRole

```python
dept_ids = [dr.department.id for dr in department_roles]
if int(dept_id) not in dept_ids:
    return Response({'detail': 'Unauthorized'}, status=403)
```

### Session-Based vs. Payload-Based Department Selection
**Old:** Session-based `active_hod_department_id`
- ✅ Secure: Server-side storage
- ❌ Issue: Could become stale

**New:** Payload-based `departments` array
- ✅ Secure: Validated on every request
- ✅ Stateless: No session dependency for form creation
- ✅ Flexible: Supports multi-selection

### CSRF Protection
- Django CSRF middleware enabled
- `fetchWithAuth` includes CSRF token
- All POST requests protected

### XSS Prevention
- React auto-escapes user input
- Department names rendered via `{dept.name}` (auto-escaped)

## Future Enhancements

### Enhancement 1: Bulk Edit Feedback
**Proposal:** Allow HOD to edit existing feedback forms for multiple departments at once

**Implementation:**
- Add "Edit for all departments" option in feedback list
- Backend: Update multiple feedback forms in one transaction
- Frontend: Multi-select existing forms

### Enhancement 2: Department-Specific Questions
**Proposal:** Allow different questions for different departments while creating in one form

**UI Mockup:**
```
☑ AI & Data Science
  [Questions: Q1, Q2, Q3]
  
☑ AI & Machine Learning
  [Questions: Q1, Q2, Q4]  ← Q4 instead of Q3
```

**Complexity:** High - requires nested question arrays per department

### Enhancement 3: Template-Based Feedback
**Proposal:** Save feedback form as template for reuse across departments/semesters

**Features:**
- "Save as Template" button
- "Load from Template" option when creating new form
- Template library with search/filter

### Enhancement 4: Smart Department Suggestions
**Proposal:** If HOD creates feedback for Year 2, auto-suggest departments that have Year 2 courses

**Logic:**
```python
# Suggest departments with active Year 2 teaching assignments
departments_with_year2 = Department.objects.filter(
    course__batch__section__teachingassignment__year=2
).distinct()
```

## Files Modified

### Backend Files
1. **backend/feedback/views.py**
   - `CreateFeedbackFormView` (API 1): Changed to accept `departments` array, loop through and create feedback for each (lines ~18-140)
   - `GetClassOptionsView` (API 5): Updated to accept `departments[]` query parameter and filter sections by multiple departments (lines ~600-670)

### Frontend Files
1. **frontend/src/pages/feedback/FeedbackPage.tsx**
   - Added `selectedDepartments` state (line ~169)
   - Added useEffect to initialize selectedDepartments with all departments by default (lines ~350-365)
   - Updated `fetchClassOptions` to accept and pass `deptIds` parameter (lines ~367-390)
   - Moved department selection UI **inside** form creation section with checkboxes (lines ~1110-1175)
   - Removed old department switcher buttons (previously shown outside form)
   - Updated form submission validation and payload to use `departments` array (lines ~665-690)

## Migration Guide

### For Existing Single-Department HODs
**No Action Required**
- System automatically uses single department
- UI shows static department label (no checkboxes)
- Existing workflow unchanged

### For Multi-Department HODs (New Setup)
**Step 1:** Ensure DepartmentRole entries exist
```python
# Verify HOD has multiple active department roles
DepartmentRole.objects.filter(
    staff__user=hod_user,
    role='HOD',
    is_active=True,
    academic_year__is_active=True
).count()  # Should be >= 2
```

**Step 2:** Test multi-department feedback creation
1. Log in as HOD
2. Click "New Form"
3. Verify checkboxes appear
4. Create test feedback with all departments selected
5. Verify feedback forms created in database
6. Log in as student from each department and verify feedback visibility

### For Administrators
**No Database Migration Needed**
- Existing feedback forms unaffected
- New forms use same `FeedbackForm` model
- Only difference: Created via loop instead of single create

**Monitoring:**
- Check feedback forms created per API call (should be > 1 for multi-dept HODs)
- Monitor for partial failures (207 status codes)

## Troubleshooting

### Problem: Checkboxes not appearing for multi-department HOD
**Diagnosis:**
1. Check DepartmentRole entries:
   ```python
   DepartmentRole.objects.filter(staff__user=hod_user, is_active=True)
   ```
2. Verify `has_multiple_departments` in API response:
   ```
   GET /api/feedback/department/
   ```
3. Check browser console for API errors

**Solution:**
- Ensure at least 2 DepartmentRole entries with `is_active=True`
- Verify both entries have same `academic_year` (current active)

### Problem: Sections not showing for selected departments
**Diagnosis:**
1. Check `departments[]` parameter in API call:
   ```
   GET /api/feedback/class-options/?departments[]=5&departments[]=6
   ```
2. Verify sections exist for those departments:
   ```python
   Section.objects.filter(
       batch__course__department__in=[5, 6]
   ).count()
   ```

**Solution:**
- Ensure Course, Batch, Section data exists for selected departments
- Check that Year calculation is correct (based on batch.start_year)

### Problem: Feedback not created for all departments
**Diagnosis:**
1. Check backend logs for validation errors
2. Verify response status:
   - 201: All created
   - 207: Partial success
   - 400: All failed

**Solution:**
- If 207: Check `errors` array in response for department-specific issues
- If 400: Verify all required fields provided (year, sections, questions)

### Problem: Students not seeing feedback
**Diagnosis:**
1. Verify feedback exists:
   ```python
   FeedbackForm.objects.filter(department=student_department)
   ```
2. Check student's department matches feedback department
3. Verify feedback status is "PUBLISHED"

**Solution:**
- Ensure feedback created with correct `department` ID
- Verify student's `StudentProfile.department` matches
- Check feedback `status` field (must be PUBLISHED for student visibility)

## API Endpoint Summary

### POST /api/feedback/create/
**Purpose:** Create feedback form(s) for selected department(s)

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "departments": [5, 6],  // Array of department IDs
  "target_type": "STUDENT",
  "type": "SUBJECT_FEEDBACK",
  "status": "DRAFT",
  "questions": [
    {
      "text": "How is the teaching effectiveness?",
      "type": "RATING",
      "allow_comment": true
    }
  ],
  "years": [2],
  "sections": [11, 12, 21, 22]
}
```

**Success Response (201):**
```json
{
  "detail": "Successfully created 2 feedback form(s).",
  "created_count": 2,
  "created_forms": [
    {
      "id": 101,
      "title": "Mid-Semester Subject Feedback",
      "department": 5,
      "created_by": 1,
      "questions": [...]
    },
    {
      "id": 102,
      "title": "Mid-Semester Subject Feedback",
      "department": 6,
      "created_by": 1,
      "questions": [...]
    }
  ]
}
```

**Partial Success Response (207):**
```json
{
  "detail": "Created 1 feedback form(s), but 1 failed.",
  "created_count": 1,
  "created_forms": [...],
  "errors": [
    {
      "department_id": 6,
      "errors": {"year": ["This field is required."]}
    }
  ]
}
```

**Error Response (400):**
```json
{
  "detail": "Please select at least one department."
}
```

**Error Response (403):**
```json
{
  "detail": "You do not have HOD access to department ID 7."
}
```

### GET /api/feedback/class-options/
**Purpose:** Get years, semesters, sections for selected departments

**Query Parameters:**
- `departments[]`: Array of department IDs (optional, multi-value)
- `departments`: Comma-separated department IDs (alternative format)

**Example:**
```
GET /api/feedback/class-options/?departments[]=5&departments[]=6
```

**Response:**
```json
{
  "success": true,
  "years": [
    {"value": 1, "label": "1st Year"},
    {"value": 2, "label": "2nd Year"},
    {"value": 3, "label": "3rd Year"},
    {"value": 4, "label": "4th Year"}
  ],
  "sections": [
    {"value": 11, "label": "Section A", "name": "A", "year": 2},
    {"value": 12, "label": "Section B", "name": "B", "year": 2},
    {"value": 21, "label": "Section A", "name": "A", "year": 2},
    {"value": 22, "label": "Section B", "name": "B", "year": 2}
  ],
  "year_sections": {
    "2": [
      {"value": 11, "label": "Section A", "year": 2},
      {"value": 12, "label": "Section B", "year": 2},
      {"value": 21, "label": "Section A", "year": 2},
      {"value": 22, "label": "Section B", "year": 2}
    ]
  }
}
```

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-10 | 2.0.0 | Implemented multi-department selection for feedback creation |
| 2026-03-10 | 1.1.0 | Initial department switching implementation (superseded) |

## Support

For issues or questions, refer to:
- [Feedback Module Documentation](./FEEDBACK_TESTING_GUIDE.md)
- [HOD Department-Specific Feedback Guide](./HOD_DEPARTMENT_SPECIFIC_FEEDBACK.md)
- [DepartmentRole Model Reference](../backend/academics/models.py)
- [API Documentation](./api_applications.md)
