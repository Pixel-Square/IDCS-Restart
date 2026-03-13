# HOD Department-Specific Feedback Creation - Implementation Guide

## Overview
This document describes the implementation of department-specific feedback creation for HODs (Heads of Department). The system now supports HODs with multiple department assignments, allowing them to switch between departments when creating feedback forms.

## Implementation Date
March 10, 2026

## Feature Description

### Problem Statement
Previously, the feedback module assumed each HOD manages only one department. However, in reality:
- **Most HODs** have a single department assignment (e.g., Computer Science)
- **Some HODs** manage multiple departments (e.g., AI HOD manages both AI & DS and AI & ML)

The system lacked functionality to handle the multi-department HOD scenario.

### Solution
Implement department-aware feedback creation that:
1. Detects HOD department assignments from `DepartmentRole` model
2. Shows department switcher UI only when HOD has multiple departments
3. Automatically uses the single department when HOD has only one
4. Filters all feedback-related data (sections, subjects) by active department
5. Stores selected department in session for persistence across page loads

## User Flows

### Case 1: HOD with Single Department (e.g., Computer Science HOD)

```
[HOD Logs In]
    ↓
[System detects 1 department role]
    ↓
[Auto-select Computer Science department]
    ↓
[Show department label: "Department: Computer Science"]
    ↓
[HOD creates feedback]
    ↓
[Feedback automatically assigned to Computer Science]
```

**UI Display:**
```
┌─────────────────────────────────────────────────────┐
│ Create Feedback Form                  [+ New Form]  │
├─────────────────────────────────────────────────────┤
│ Department: Computer Science                        │
├─────────────────────────────────────────────────────┤
│ [Feedback Form Fields...]                           │
└─────────────────────────────────────────────────────┘
```

### Case 2: HOD with Multiple Departments (e.g., AI HOD)

```
[HOD Logs In]
    ↓
[System detects 2 department roles: AI & DS, AI & ML]
    ↓
[Show department switcher with both options]
    ↓
[Default to first department: AI & DS]
    ↓
[HOD clicks AI & ML button]
    ↓
[System switches active department to AI & ML]
    ↓
[Reload sections/subjects for AI & ML]
    ↓
[HOD creates feedback]
    ↓
[Feedback assigned to AI & ML only]
```

**UI Display:**
```
┌─────────────────────────────────────────────────────┐
│ Create Feedback Form                  [+ New Form]  │
├─────────────────────────────────────────────────────┤
│ Select Department                                   │
│ ┌────────┐ ┌────────┐                               │
││ │ AI & DS│ │ AI &ML │                               │
│ └────────┘ └────────┘                               │
│ Selected: AI & Machine Learning                     │
├─────────────────────────────────────────────────────┤
│ [Feedback Form Fields...]                           │
└─────────────────────────────────────────────────────┘
```

## Technical Implementation

### Database Schema (Existing)

#### DepartmentRole Model
Location: `backend/academics/models.py` (line 822-849)

```python
class DepartmentRole(models.Model):
    class DeptRole(models.TextChoices):
        HOD = 'HOD', 'Head of Department'
        AHOD = 'AHOD', 'Assistant HOD'

    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE)
    role = models.CharField(max_length=10, choices=DeptRole.choices)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            # Only one active HOD per department per academic year
            models.UniqueConstraint(
                fields=['department', 'academic_year'], 
                condition=Q(role='HOD', is_active=True), 
                name='unique_active_hod_per_dept_year'
            )
        ]
```

**Key Characteristics:**
- Links staff to departments with roles (HOD, AHOD)
- Scoped by academic year
- Enforces unique active HOD per department per year
- A staff member can have multiple HOD roles (different departments)

### Backend Changes

#### 1. Enhanced GetUserDepartmentView (API 4)
**File:** `backend/feedback/views.py` (lines 340-500)

**Previous Behavior:**
- Returned single department from `StaffProfile.department`
- No support for multiple departments

**New Behavior:**
- Queries `DepartmentRole` model for HOD roles
- Returns multiple departments if applicable
- Supports `active_department_id` query parameter to set active department
- Stores active department in Django session

**Response Structure:**
```json
{
  "success": true,
  "has_multiple_departments": true,
  "departments": [
    {
      "id": 5,
      "name": "AI & Data Science",
      "code": "AI & DS"
    },
    {
      "id": 6,
      "name": "AI & Machine Learning",
      "code": "AI & ML"
    }
  ],
  "active_department": {
    "id": 5,
    "name": "AI & Data Science",
    "code": "AI & DS"
  }
}
```

**Backend Logic:**
```python
# Get HOD department roles
department_roles = DepartmentRole.objects.select_related('department').filter(
    staff=staff_profile,
    role='HOD',
    is_active=True,
    academic_year=active_ay
)

departments_count = department_roles.count()

if departments_count == 1:
    # Single department - no switch needed
    active_department = department_roles.first().department
elif departments_count > 1:
    # Multiple departments - enable switcher
    # Use session or query parameter for active department
    active_dept_id = request.GET.get('active_department_id') or request.session.get('active_hod_department_id')
    
    # Store in session for persistence
    request.session['active_hod_department_id'] = active_dept_id
```

#### 2. Updated CreateFeedbackFormView (API 1)
**File:** `backend/feedback/views.py` (lines 18-120)

**Changes:**
- Determines active department from `DepartmentRole` or session
- Validates department ownership for HODs with multiple departments
- Automatically sets `department` field in feedback form payload

**Key Code:**
```python
# Get HOD department roles
department_roles = DepartmentRole.objects.filter(
    staff=staff_profile,
    role='HOD',
    is_active=True,
    academic_year=active_ay
)

departments_count = department_roles.count()

if departments_count > 1:
    # Multiple departments - require explicit department_id
    active_department_id = request.data.get('department_id') or request.session.get('active_hod_department_id')
    
    # Verify HOD has access to this department
    dept_ids = [dr.department.id for dr in department_roles]
    if int(active_department_id) not in dept_ids:
        return Response({'detail': 'You do not have HOD access to this department.'}, status=403)
        
elif departments_count == 1:
    # Single department - use automatically
    active_department_id = department_roles.first().department.id
```

#### 3. Updated GetClassOptionsView (API 5)
**File:** `backend/feedback/views.py` (lines 550-630)

**Changes:**
- Filters sections by active department from session for multi-department HODs
- Falls back to `StaffProfile.department` for single-department HODs

**Key Code:**
```python
# For HODs with multiple departments, use active department from session
department_roles = DepartmentRole.objects.filter(
    staff=staff_profile,
    role='HOD',
    is_active=True,
    academic_year=active_ay
)

if department_roles.count() > 1:
    # Multiple departments - use session
    active_dept_id = request.session.get('active_hod_department_id')
    user_department = Department.objects.get(id=active_dept_id)
else:
    # Single department
    user_department = department_roles.first().department

# Filter sections by active department
sections_filter['batch__course__department'] = user_department
```

#### 4. Updated GetSubjectsByYearView (API 10)
**File:** `backend/feedback/views.py` (lines 1018-1100)

**Changes:**
- Auto-determines active department if not provided in query params
- Uses session storage for multi-department HODs
- Filters teaching assignments by active department

**Key Code:**
```python
if not department_id:
    department_roles = DepartmentRole.objects.filter(
        staff=staff_profile,
        role='HOD',
        is_active=True,
        academic_year=active_ay
    )
    
    if department_roles.count() > 1:
        # Multiple departments - use session
        department_id = request.session.get('active_hod_department_id')
    else:
        # Single department
        department_id = department_roles.first().department.id
```

### Frontend Changes

#### 1. New TypeScript Types
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx` (lines 120-128)

```typescript
type Department = {
  id: number;
  name: string;
  code: string;
};

type DepartmentResponse = {
  success: boolean;
  has_multiple_departments: boolean;
  departments: Department[];
  active_department: Department;
};
```

#### 2. Updated State Management
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx` (lines 165-168)

**Previous:**
```typescript
const [hodDepartment, setHodDepartment] = useState<{id: number; name: string} | null>(null);
```

**New:**
```typescript
const [departmentData, setDepartmentData] = useState<DepartmentResponse | null>(null);
const [activeDepartment, setActiveDepartment] = useState<Department | null>(null);
```

#### 3. Department Fetching Logic
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx` (lines 298-355)

**Changes:**
- Fetches all HOD departments from API
- Parses `has_multiple_departments` flag
- Stores active department in state

```typescript
const fetchHODDepartments = async () => {
  const response = await fetchWithAuth('/api/feedback/department/');
  const data: DepartmentResponse = await response.json();
  
  if (data.success && data.active_department) {
    setDepartmentData(data);
    setActiveDepartment(data.active_department);
  }
};
```

#### 4. Department Switching Handler
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx` (lines 918-938)

**New Function:**
```typescript
const handleDepartmentSwitch = async (department: Department) => {
  setActiveDepartment(department);
  
  // Notify backend by calling department API with active_department_id
  const response = await fetchWithAuth(`/api/feedback/department/?active_department_id=${department.id}`);
  
  if (response.ok) {
    // Reload class options for new department
    fetchClassOptions();
    
    // Reload subjects if viewing subject feedback
    if (formData.type === 'SUBJECT_FEEDBACK' && formData.years.length > 0) {
      setSubjectsByYear(null); // Triggers re-fetch
    }
  }
};
```

#### 5. Department Switcher UI
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx` (lines 1029-1070)

**Component Structure:**
```tsx
{/* Department Switcher - Only show if HOD has multiple departments */}
{departmentData && departmentData.has_multiple_departments && (
  <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
    <div className="flex items-center gap-3 mb-2">
      <Users className="w-5 h-5 text-indigo-600" />
      <h3 className="text-sm font-semibold text-indigo-900">Select Department</h3>
    </div>
    <div className="flex flex-wrap gap-2">
      {departmentData.departments.map((dept) => (
        <button
          key={dept.id}
          onClick={() => handleDepartmentSwitch(dept)}
          className={/* Active/Inactive styling */}
        >
          {dept.code}
        </button>
      ))}
    </div>
    <p className="text-xs text-indigo-700 mt-2">
      Selected: <span className="font-semibold">{activeDepartment?.name}</span>
    </p>
  </div>
)}

{/* Single Department Display */}
{departmentData && !departmentData.has_multiple_departments && activeDepartment && (
  <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
    <Users className="w-4 h-4 text-slate-600" />
    <span>Department: <strong>{activeDepartment.name}</strong></span>
  </div>
)}
```

**Styling:**
- **Active Department Button:** Indigo background with white text, shadow
- **Inactive Department Button:** White background with indigo text, hover effects
- **Single Department Display:** Subtle gray background with label

#### 6. Updated Form Submission
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx` (lines 667-686)

**Changes:**
- Includes `activeDepartment.id` in feedback creation payload
- Validates active department exists before submission

```typescript
const payload = {
  target_type: formData.target_type,
  type: formData.type,
  department: activeDepartment.id,  // Active department
  status: formData.status,
  questions: formData.questions,
  // ... other fields
};
```

#### 7. Dependency Updates
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx`

**Updated All References:**
- `hodDepartment` → `activeDepartment` (9 occurrences)
- Dependent useEffect hooks updated to watch `activeDepartment` changes
- Conditional rendering based on `activeDepartment` availability

## Session Management

### Backend Session Storage
**Key:** `active_hod_department_id`  
**Storage Location:** Django session (server-side)  
**Persistence:** Lasts entire browser session  

**Set Session:**
```python
request.session['active_hod_department_id'] = department_id
```

**Get Session:**
```python
active_dept_id = request.session.get('active_hod_department_id')
```

### Session Flow
```
1. HOD logs in
2. System fetches departments from DepartmentRole
3. If multiple departments:
   a. Check session for `active_hod_department_id`
   b. If session exists, use that department
   c. If no session, default to first department
   d. Store in session
4. HOD clicks department switch button
5. Frontend calls API with `?active_department_id=X`
6. Backend updates session
7. Subsequent API calls use session value
```

## Data Flow Diagrams

### Multi-Department HOD Flow
```
┌─────────────────────────────────────────────────────────────┐
│                    HOD Opens Feedback Page                  │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
         GET /api/feedback/department/
                    ↓
    ┌───────────────┴────────────────┐
    │                                │
    ├─ Query DepartmentRole          │
    ├─ Filter: staff=HOD, role=HOD   │
    ├─ Filter: academic_year=current │
    ├─ Filter: is_active=True        │
    └───────────────┬────────────────┘
                    ↓
            Count departments
                    │
    ┌───────────────┴────────────────┐
    │                                │
   = 1                             > 1
    │                                │
    ↓                                ↓
Auto-select               Enable Department Switcher
single dept                        │
    │                              ↓
    │                   ┌──────────────────────┐
    │                   │ User Clicks Dept B   │
    │                   └──────────┬───────────┘
    │                              ↓
    │           GET /api/feedback/department/
    │           ?active_department_id=B
    │                              ↓
    │           ┌─────────────────────────┐
    │           │ session['active_hod..'] │
    │           │ = B                     │
    │           └──────────┬──────────────┘
    │                      ↓
    │            Reload Sections & Subjects
    │                      │
    └──────────────────────┴─────────────────────┐
                                                 ↓
                              HOD Creates Feedback
                                                 ↓
                           Feedback assigned to
                            active department
```

## Testing Guide

### Test Case 1: Single-Department HOD
**Setup:**
1. Create HOD user with one DepartmentRole entry:
   - Department: Computer Science
   - Role: HOD
   - Academic Year: Current
   - is_active: True

**Expected Behavior:**
- ✓ Department label shows: "Department: Computer Science"
- ✓ No department switcher visible
- ✓ "New Form" button enabled
- ✓ Feedback creation assigns to Computer Science automatically
- ✓ Sections filtered by Computer Science
- ✓ Subjects filtered by Computer Science

**Test Steps:**
1. Log in as single-department HOD
2. Navigate to Feedback page
3. Verify single department label displays
4. Click "New Form"
5. Select "Subject Feedback"
6. Select Year 2
7. Verify subjects shown belong to Computer Science only
8. Create feedback form
9. Verify feedback assigned to Computer Science in database

### Test Case 2: Multi-Department HOD (Initial Load)
**Setup:**
1. Create HOD user with two DepartmentRole entries:
   - Department 1: AI & Data Science (ID: 5)
   - Department 2: AI & Machine Learning (ID: 6)
   - Role: HOD for both
   - Academic Year: Current
   - is_active: True for both

**Expected Behavior:**
- ✓ Department switcher visible
- ✓ Two buttons: "AI & DS" and "AI & ML"
- ✓ First department (AI & DS) selected by default
- ✓ "Selected: AI & Data Science" label shows
- ✓ Sections and subjects filtered by AI & DS initially

**Test Steps:**
1. Log in as multi-department HOD
2. Navigate to Feedback page
3. Verify department switcher with 2 buttons
4. Verify "AI & DS" button has active styling (indigo background)
5. Verify "AI & ML" button has inactive styling (white background)
6. Verify "Selected: AI & Data Science" text
7. Click "New Form" → "Subject Feedback" → Year 2
8. Verify subjects belong to AI & DS only

### Test Case 3: Multi-Department HOD (Switch Department)
**Setup:** Same as Test Case 2

**Expected Behavior:**
- ✓ Clicking "AI & ML" button switches active department
- ✓ Button styling updates (AI & ML becomes active, AI & DS becomes inactive)
- ✓ "Selected" label updates to "AI & Machine Learning"
- ✓ Sections reload for AI & ML department
- ✓ Subjects reload for AI & ML department
- ✓ Session stores new active department
- ✓ Page refresh maintains selected department (session persistence)

**Test Steps:**
1. Complete Test Case 2 first
2. Click "AI & ML" button
3. Verify button styling switches (AI & ML now indigo, AI & DS now white)
4. Verify "Selected: AI & Machine Learning" label
5. If subject preview open, verify subjects reload
6. Create new feedback form
7. Verify feedback assigned to AI & ML in database
8. Refresh page
9. Verify AI & ML still selected (session persistence)

### Test Case 4: Department Validation on Form Creation
**Setup:** Same as Test Case 2

**Expected Behavior:**
- ✓ HOD cannot create feedback for Department C (not assigned)
- ✓ Backend returns 403 Forbidden error
- ✓ Frontend shows appropriate error message

**Test Steps:**
1. Log in as multi-department HOD (AI & DS, AI & ML)
2. Using browser dev tools or API client (Postman), send POST to:
   ```
   POST /api/feedback/create/
   Body: {
     "department": 7,  // Computer Science (not assigned to this HOD)
     "target_type": "STUDENT",
     "type": "SUBJECT_FEEDBACK",
     "questions": [...]
   }
   ```
3. Verify response: 403 Forbidden
4. Verify error message: "You do not have HOD access to this department."

### Test Case 5: Session Persistence Across API Calls
**Setup:** Same as Test Case 2

**Expected Behavior:**
- ✓ After switching to AI & ML, all subsequent API calls use AI & ML
- ✓ GetClassOptionsView returns AI & ML sections only
- ✓ GetSubjectsByYearView returns AI & ML subjects only
- ✓ Session persists until browser close or logout

**Test Steps:**
1. Log in as multi-department HOD
2. Switch to AI & ML department
3. Call GET /api/feedback/class-options/
4. Verify sections belong to AI & ML only
5. Call GET /api/feedback/subjects-by-year/?years=2
6. Verify subjects belong to AI & ML only
7. Close tab and reopen (same browser session)
8. Verify AI & ML still active
9. Logout and login again
10. Verify resets to first department (AI & DS)

## Edge Cases

### Edge Case 1: HOD with No DepartmentRole Entries
**Scenario:** Staff profile has no DepartmentRole entries, but has `feedback.create` permission

**Expected Behavior:**
- Fall back to `StaffProfile.department`
- If `StaffProfile.department` is also null, disable form creation
- Show tooltip: "Department information required. Please contact administrator."

**Implementation:**
```python
if departments_count == 0:
    # Fall back to staff profile department
    if staff_profile.department:
        active_department_id = staff_profile.department.id
    else:
        return Response({'success': False, 'department': None}, status=200)
```

### Edge Case 2: HOD Role Deactivated Mid-Session
**Scenario:** HOD has session with `active_hod_department_id` set, but DepartmentRole is_active changed to False

**Expected Behavior:**
- Backend validates department ownership on every create/update operation
- If department no longer active, return 403 error
- Frontend shows error message: "Your department access has changed. Please refresh the page."

**Implementation:**
```python
# Verify department belongs to HOD
dept_ids = [dr.department.id for dr in active_department_roles]
if int(active_department_id) not in dept_ids:
    return Response({'detail': 'You no longer have HOD access to this department.'}, status=403)
```

### Edge Case 3: Academic Year Changes During Session
**Scenario:** HOD's session active when academic year changes

**Expected Behavior:**
- GetUserDepartmentView always queries by `is_active=True` academic year
- Department roles automatically update to reflect new academic year
- If HOD loses HOD role in new academic year, fall back to single department or show error

### Edge Case 4: Student or Staff User Calls Department API
**Scenario:** Non-HOD user calls GET /api/feedback/department/

**Expected Behavior:**
- Return single department from `StaffProfile.department`
- `has_multiple_departments: false`
- No error, graceful degradation

**Implementation:**
```python
if not is_hod:
    # For non-HOD users, return single department
    if staff_profile.department:
        return Response({
            'success': True,
            'has_multiple_departments': False,
            'departments': [single_dept_data],
            'active_department': single_dept_data
        })
```

## API Endpoints Summary

### 1. GET /api/feedback/department/
**Purpose:** Fetch HOD's department(s)

**Query Parameters:**
- `active_department_id` (optional): Set active department and store in session

**Response:**
```json
{
  "success": true,
  "has_multiple_departments": boolean,
  "departments": [Department],
  "active_department": Department
}
```

**Behavior:**
- Queries `DepartmentRole` for HOD roles
- Returns all assigned departments if multiple
- Sets session if `active_department_id` provided

### 2. POST /api/feedback/create/
**Purpose:** Create feedback form

**Body:**
```json
{
  "department": number,  // Active department ID
  "target_type": "STUDENT" | "STAFF",
  "type": "SUBJECT_FEEDBACK" | "OPEN_FEEDBACK",
  "questions": [Question],
  // ... other fields
}
```

**Validation:**
- Verifies `department` ID belongs to HOD
- Returns 403 if unauthorized
- Uses session for multi-department HODs

### 3. GET /api/feedback/class-options/
**Purpose:** Get available years, semesters, sections

**Behavior:**
- Filters sections by active department (from session for multi-dept HODs)
- Returns year-section mappings for selected department only

### 4. GET /api/feedback/subjects-by-year/
**Purpose:** Preview subjects for feedback form

**Query Parameters:**
- `years`: Comma-separated years (e.g., "2,3")
- `sections`: Comma-separated section IDs (optional)
- `department_id`: Department ID (optional, uses session if not provided)

**Behavior:**
- Auto-determines `department_id` from session if not provided
- Filters teaching assignments by active department

## UI Components

### Department Switcher (Multi-Department)
**Location:** Above feedback form creation area  
**Visibility:** Only when `has_multiple_departments: true`

**Appearance:**
```
┌─────────────────────────────────────────────────────────┐
│ 👥 Select Department                                    │
│                                                         │
│ ┌──────────────┐  ┌──────────────┐                    │
│ │   AI & DS    │  │   AI & ML    │                    │
│ │   (Active)   │  │  (Inactive)  │                    │
│ └──────────────┘  └──────────────┘                    │
│                                                         │
│ Selected: AI & Data Science                            │
└─────────────────────────────────────────────────────────┘
```

**Styling:**
- Container: Light indigo background (`bg-indigo-50`), indigo border
- Active Button: Indigo background (`bg-indigo-600`), white text, shadow
- Inactive Button: White background, indigo text, indigo border, hover effects

### Single Department Display
**Location:** Above feedback form creation area  
**Visibility:** Only when `has_multiple_departments: false`

**Appearance:**
```
┌─────────────────────────────────────────────────────────┐
│ 👥 Department: Computer Science (CSE)                   │
└─────────────────────────────────────────────────────────┘
```

**Styling:**
- Container: Light gray background (`bg-slate-50`), gray border
- Text: Gray label, bold department name

## Performance Considerations

### Database Queries
- **Single Query:** GetUserDepartmentView executes one query to DepartmentRole
- **Eager Loading:** Uses `select_related('department')` to avoid N+1 queries
- **Session Caching:** Active department stored in session, not re-queried every request

### Session Storage Impact
- **Minimal:** Only stores integer department ID
- **Expiry:** Clears on logout or session timeout
- **Scope:** Per-user, not global

### Frontend Rendering
- **Conditional:** Department switcher only renders when needed
- **State Management:** Uses React state for instant UI updates
- **API Calls:** Minimized by checking session before making requests

## Security Considerations

### Backend Validation
1. **Department Ownership:** Always verify HOD has access to department before operations
2. **Session Tampering:** Backend validates session department ID against DepartmentRole
3. **Permission Checks:** Require `feedback.create` permission for all HOD operations
4. **SQL Injection:** Use Django ORM filters exclusively, no raw SQL

### Frontend Sanitization
- **XSS Prevention:** React auto-escapes all user input
- **Type Safety:** TypeScript enforces type checking on department IDs
- **API Error Handling:** Gracefully handle 403/500 errors from backend

### Session Security
- **HTTPS Only:** Session cookies marked as `Secure` in production
- **HTTP-Only:** Session cookie inaccessible to JavaScript
- **CSRF Protection:** Django CSRF middleware enabled

## Maintenance Guide

### Adding New Department for HOD

**Step 1: Create DepartmentRole Entry**
```python
from academics.models import DepartmentRole, Department, StaffProfile, AcademicYear

staff = StaffProfile.objects.get(staff_id='HOD001')
new_dept = Department.objects.get(code='NEW_DEPT')
current_ay = AcademicYear.objects.get(is_active=True)

DepartmentRole.objects.create(
    staff=staff,
    department=new_dept,
    role='HOD',
    academic_year=current_ay,
    is_active=True
)
```

**Step 2: Test Department Appears**
- Log out and log back in
- Navigate to Feedback page
- Verify new department button appears
- Switch to new department and create test feedback

### Removing Department from HOD

**Option 1: Soft Deactivate (Recommended)**
```python
dept_role = DepartmentRole.objects.get(
    staff__staff_id='HOD001',
    department__code='OLD_DEPT',
    academic_year__is_active=True
)
dept_role.is_active = False
dept_role.save()
```

**Option 2: Hard Delete (Discouraged)**
```python
dept_role.delete()  # Lose historical data
```

**Verification:**
- HOD logs in after change
- Verify old department no longer in switcher
- If only one department remains, switcher disappears

### Troubleshooting

#### Problem: Department switcher not appearing for multi-department HOD
**Diagnosis:**
1. Check DepartmentRole entries:
   ```python
   DepartmentRole.objects.filter(staff__user__username='hod_user', is_active=True)
   ```
2. Verify `academic_year` is current active year
3. Check browser console for API errors

**Solution:**
- Ensure at least 2 DepartmentRole entries with `is_active=True`
- Verify both entries have same `academic_year` (current active)
- Clear browser cache and session

#### Problem: Sections/subjects not updating after department switch
**Diagnosis:**
1. Check session storage:
   ```python
   request.session.get('active_hod_department_id')
   ```
2. Verify API calls include session cookie
3. Check backend logs for department ID used in filters

**Solution:**
- Ensure `fetchClassOptions()` called after department switch
- Verify `setSubjectsByYear(null)` triggers re-fetch
- Check Network tab in browser for session cookie

#### Problem: 403 error when creating feedback
**Diagnosis:**
1. Verify HOD has DepartmentRole for target department
2. Check session department ID matches DepartmentRole
3. Confirm feedback permission exists

**Solution:**
- Create missing DepartmentRole entry
- Clear session and retry
- Verify `feedback.create` permission assigned

## Files Modified

### Backend Files
1. **backend/feedback/views.py**
   - `GetUserDepartmentView`: Enhanced to return multiple departments (lines 340-500)
   - `CreateFeedbackFormView`: Added department validation (lines 18-120)
   - `GetClassOptionsView`: Added active department filtering (lines 550-630)
   - `GetSubjectsByYearView`: Added auto-department detection (lines 1018-1100)

2. **backend/academics/models.py**
   - No changes (referenced existing `DepartmentRole` model)

### Frontend Files
1. **frontend/src/pages/feedback/FeedbackPage.tsx**
   - Added `Department` and `DepartmentResponse` types (lines 120-128)
   - Updated state: `departmentData`, `activeDepartment` (lines 165-168)
   - Enhanced `fetchHODDepartments` function (lines 298-355)
   - Added `handleDepartmentSwitch` function (lines 918-938)
   - Added department switcher UI (lines 1029-1070)
   - Extracted `fetchClassOptions` for reusability (lines 359-390)
   - Updated all `hodDepartment` references to `activeDepartment` (9 occurrences)

### Documentation Files
1. **docs/HOD_DEPARTMENT_SPECIFIC_FEEDBACK.md** (This file)
   - Comprehensive implementation guide

## Migration Guide

### For Existing HODs with Single Department
**No Action Required**
- System automatically detects single department
- UI remains similar (department label instead of switcher)
- Existing feedback forms unaffected

### For New Multi-Department HOD Setup

**Step 1: Create DepartmentRole Entries**
```python
# Example: AI HOD managing AI & DS and AI & ML
ai_hod = StaffProfile.objects.get(staff_id='AI_HOD_001')
ai_ds_dept = Department.objects.get(code='AI & DS')
ai_ml_dept = Department.objects.get(code='AI & ML')
current_ay = AcademicYear.objects.get(is_active=True)

# First department role
DepartmentRole.objects.create(
    staff=ai_hod,
    department=ai_ds_dept,
    role='HOD',
    academic_year=current_ay,
    is_active=True
)

# Second department role
DepartmentRole.objects.create(
    staff=ai_hod,
    department=ai_ml_dept,
    role='HOD',
    academic_year=current_ay,
    is_active=True
)
```

**Step 2: Test Multi-Department Features**
1. Log in as AI HOD
2. Navigate to Feedback module
3. Verify department switcher appears with both departments
4. Switch between departments and verify UI updates
5. Create test feedback for each department
6. Verify feedback assigned to correct department in database

**Step 3: Train HOD Users**
- Explain department switcher purpose
- Show how to switch between departments
- Clarify that feedback created belongs to selected department only
- Explain session persistence (stays active until logout)

## Future Enhancements

### Enhancement 1: Department-Specific Statistics
**Proposal:** Show feedback response statistics per department

**Implementation:**
- Add department filter to response statistics view
- Display "Department A: 85% response rate, Department B: 70% response rate"
- Allow HOD to view cross-department comparison

### Enhancement 2: Bulk Department Operations
**Proposal:** Create identical feedback for all assigned departments at once

**Implementation:**
- Add checkbox: "Apply to all my departments"
- Backend creates multiple feedback forms (one per department)
- Frontend shows success message: "Feedback created for 2 departments"

### Enhancement 3: Department-Specific Permissions
**Proposal:** Fine-grained permissions per department (e.g., read-only access to Dept A, full access to Dept B)

**Implementation:**
- Extend DepartmentRole with `permission_level` field
- Validate operations against department-specific permissions
- Update UI to show permission tags per department

### Enhancement 4: Department Switching History
**Proposal:** Log department switches for audit trail

**Implementation:**
- Create `DepartmentSwitchLog` model
- Log timestamp, user, from_department, to_department
- Admin view to monitor HOD department switching patterns

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-10 | 1.0.0 | Initial implementation of HOD department-specific feedback creation |

## Support

For issues or questions, contact the development team or refer to:
- [Feedback Module Documentation](./README.md)
- [DepartmentRole Model Reference](../backend/academics/models.py)
- [API Documentation](./api_applications.md)
