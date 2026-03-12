# Feedback Module - Elective Categories Expand/Collapse Feature

## Quick Reference

### What Changed?

Elective categories in HOD feedback creation now have **expand/collapse** functionality:

- **Collapsed** (default): Shows category heading with count (e.g., "Professional Elective IV (3 options)")
- **Expanded**: Shows all subjects in that category with staff names
- **Click** the category header to toggle between collapsed/expanded states

### Visual Indicators

- **ChevronDown icon** (▼/▶): Rotates to indicate state
  - Pointing down (▼) = Expanded
  - Pointing right (▶) = Collapsed
- **Purple color scheme**: Maintained throughout
- **Hover effect**: Category header has light purple background on hover

## Three Views Explained

### 1. HOD Feedback Creation (This View Uses Expand/Collapse)

**Purpose**: Plan feedback forms and preview curriculum structure

**What HOD Sees**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Core Subjects (8)
├─ Big Data Analytics — Aravind Prasad PB
├─ Deep Learning Techniques — Geetha S
├─ Web Application Technology — Deena Rose D
└─ ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Elective Categories (2)

▶ EM – Emerging Electives (3 options) [CLICK TO EXPAND]
▶ PE – Professional Electives (2 options) [CLICK TO EXPAND]
```

**After Clicking "EM – Emerging Electives"**:
```
▼ EM – Emerging Electives (3 options) [CLICK TO COLLAPSE]
  
  ┌───────────────────────────────────────────────┐
  │ CGI1356  Advanced Cyber Attack and            │
  │          Exploitation Techniques              │
  │ 👤 John Doe                                   │
  └───────────────────────────────────────────────┘
  
  ┌───────────────────────────────────────────────┐
  │ CGI1354  Building RAG Based Solutions         │
  │ 👤 Jane Smith                                 │
  └───────────────────────────────────────────────┘
  
  ┌───────────────────────────────────────────────┐
  │ CGI1352  Generative AI Fundamentals           │
  │ 👤 Dr. Sharma                                 │
  └───────────────────────────────────────────────┘

▶ PE – Professional Electives (2 options)
```

### 2. Student Feedback Submission

**Purpose**: Students rate their assigned subjects

**What Students See**:
```
Your Subjects (6)

┌───────────────────────────────────────────────┐
│ Big Data Analytics — Aravind Prasad PB        │
│ ⭐⭐⭐⭐⭐  [Rate now]                         │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Deep Learning Techniques — Geetha S           │
│ ⭐⭐⭐⭐⭐  [Rate now]                         │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Generative AI Fundamentals — Dr. Sharma       │
│ ⭐⭐⭐⭐⭐  [Rate now]                         │
└───────────────────────────────────────────────┘
```

**Key Points**:
- NO category labels (no "EM", "PE", etc.)
- Only shows subjects they're enrolled in
- Flat list, simple interface
- Staff names clearly visible

### 3. HOD Response View

**Purpose**: Analyze feedback results

**What HOD Sees**:
```
Feedback Responses (45/60 submitted)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Advanced Cyber Attack and Exploitation Techniques
Staff: John Doe
⭐ 4.5/5.0 average (15 responses)
💬 12 comments available

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Building RAG Based Solutions
Staff: Jane Smith
⭐ 4.8/5.0 average (18 responses)
💬 8 comments available

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generative AI Fundamentals
Staff: Dr. Sharma
⭐ 4.2/5.0 average (12 responses)
💬 15 comments available
```

**Key Points**:
- Individual subjects (not categories)
- Staff names visible
- Ratings and comments aggregated
- Can analyze each elective separately

## Technical Implementation

### Backend

**File**: `backend/feedback/views.py` (GetSubjectsByYearView)

**Returns Two Structures**:
1. `elective_categories`: Array of category headers with counts
2. `elective_groups`: Array of categories WITH subject details

**Example Response**:
```json
{
  "elective_categories": [
    {
      "category": "Professional Elective IV",
      "display_name": "Professional Elective IV",
      "count": 2,
      "years": [3]
    }
  ],
  "elective_groups": [
    {
      "category": "Professional Elective IV",
      "count": 2,
      "subjects": [
        {
          "subject_code": "ADB1356",
          "subject_name": "Big Data Analytics",
          "staff_names": "Aravind Prasad PB",
          "sections": "A, B",
          "years": [3],
          "assignment_count": 2
        },
        {
          "subject_code": "ADB1354",
          "subject_name": "Deep Learning Techniques",
          "staff_names": "Geetha S",
          "sections": "A, B",
          "years": [3],
          "assignment_count": 2
        }
      ]
    }
  ]
}
```

**Staff Name Source**: `TeachingAssignment.staff.user.get_full_name()`

### Frontend

**File**: `frontend/src/pages/feedback/FeedbackPage.tsx`

**State Management**:
```typescript
const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
```

**Toggle Function**:
```typescript
onClick={() => {
  const newExpanded = new Set(expandedCategories);
  if (isExpanded) {
    newExpanded.delete(category.category);
  } else {
    newExpanded.add(category.category);
  }
  setExpandedCategories(newExpanded);
}}
```

**Conditional Rendering**:
```typescript
{isExpanded && groupData && groupData.subjects && (
  <div>
    {groupData.subjects.map(subject => (
      // Display subject with staff name
    ))}
  </div>
)}
```

## Testing Instructions

### Test 1: HOD View - Expand/Collapse

1. Login as HOD
2. Navigate to Feedback → Create New Form
3. Select "Subject Feedback"
4. Select years with electives (Year 3 or 4)
5. Scroll to "Elective Categories" section

**Expected**:
- ✅ Categories shown collapsed with count
- ✅ ChevronDown icon pointing right (▶)
- ✅ Click category header to expand
- ✅ Icon rotates to point down (▼)
- ✅ Subjects appear below with:
  - Subject code (purple badge)
  - Subject name
  - Staff name with user icon
- ✅ Click again to collapse
- ✅ Subjects disappear, icon returns to pointing right

### Test 2: Staff Names from TeachingAssignment

1. In expanded category view
2. Check staff names for electives

**Expected**:
- ✅ Staff names show actual faculty (not "Multiple Staff")
- ✅ Staff names match those in Teaching Assignment module
- ✅ If no teaching assignment exists, shows "To be assigned"

### Test 3: Student View - No Categories

1. Login as student
2. Open active feedback form
3. View subject list

**Expected**:
- ✅ No "EM", "PE", "OE" category labels visible
- ✅ Only subjects student is enrolled in
- ✅ Each subject shows: Name — Staff Name
- ✅ Simple flat list (no expand/collapse)

### Test 4: HOD Response View

1. Login as HOD
2. Navigate to Feedback → View Responses
3. Select a form with elective responses

**Expected**:
- ✅ Individual elective subjects visible
- ✅ Staff names shown for each subject
- ✅ Ratings aggregated per subject
- ✅ Can see which electives got better ratings

### Test 5: Color Scheme Consistency

**Expected**:
- ✅ Purple cards for elective categories (`bg-purple-50`)
- ✅ Purple borders (`border-purple-200`)
- ✅ Purple text for category names (`text-purple-800`)
- ✅ Purple badges for subject codes in expanded view (`bg-purple-100`, `text-purple-700`)
- ✅ Hover effect changes to `bg-purple-100`

## Common Issues & Solutions

### Issue: No staff name shown (displays "To be assigned")

**Cause**: Elective exists in curriculum but has no TeachingAssignment

**Solution**: 
1. Navigate to "Teaching Assignments" module
2. Create assignment for that elective subject
3. Assign staff member
4. Return to feedback page and refresh

### Issue: Elective not appearing at all

**Cause**: Elective might not be approved in curriculum or semester mismatch

**Solution**:
1. Check Curriculum → Elective Subjects
2. Verify status is "APPROVED"
3. Check semester matches (ODD year = Sem 1,3,5,7; EVEN year = Sem 2,4,6,8)

### Issue: Clicking category does nothing

**Cause**: JavaScript or React state issue

**Solution**:
1. Check browser console for errors
2. Verify `elective_groups` is present in API response
3. Check network tab → API response includes both `elective_categories` and `elective_groups`

### Issue: Student sees categories (EM, PE)

**Cause**: Wrong API endpoint or incorrect data structure

**Solution**:
- Student endpoint should use `GetStudentSubjectsView` (not `GetSubjectsByYearView`)
- This endpoint returns flat list, not grouped data

## Benefits Summary

### For HOD
✅ Clean initial view (not overwhelming)
✅ On-demand detailed information
✅ Verify staff assignments during planning
✅ Easy to expand/collapse multiple categories
✅ Understand curriculum structure at a glance

### For Students
✅ Simple, focused interface
✅ Only see relevant subjects
✅ Clear staff attribution
✅ No confusing category labels

### For Administration
✅ Better data organization
✅ Easier to analyze by category
✅ Staff assignments clearly tracked
✅ Response data granular by subject

---

**Implementation Status**: ✅ Complete
**Version**: 3.0  
**Last Updated**: March 10, 2026
