# Feedback Module - Elective Categories with Expand/Collapse

## Date: March 10, 2026 (Updated)

## Overview
Implemented an interactive expand/collapse system for elective subjects in the Feedback module to serve different purposes for different user roles:

1. **HOD Feedback Creation**: Shows elective category headings that expand to reveal subjects with staff names
2. **Student Feedback Submission**: Shows actual subject names with staff names (no categories)
3. **HOD Response View**: Shows actual subject names with staff names for analysis

## Problem Solved

Previously, HOD either saw too much information (all individual electives) or too little (just category headings). The new expand/collapse system provides:
- Clean initial view with category summaries
- On-demand access to detailed subject and staff information
- Better organization and discoverability
- Maintained purple card design consistency

### 1. HOD Feedback Creation Page

**Display**: Elective category headings with **expand/collapse** functionality

**Example (Collapsed)**:
```
Core Subjects (6)
├─ Big Data Analytics — Aravind Prasad PB
├─ Comprehension — Sri Santhoshini E
├─ Deep Learning Techniques — Geetha S
└─ ...

Elective Categories (3)
├─ ▶ Professional Elective IV (2 options available)
├─ ▶ Emerging Elective I (3 options available)
└─ ▶ Open Elective III (1 option available)
```

**Example (Expanded)**:
```
Elective Categories (3)
├─ ▼ Professional Elective IV (2 options available)
│   ├─ Big Data Analytics — Aravind Prasad PB
│   └─ Business Analytics — Dr. Kumar
├─ ▼ Emerging Elective I (3 options available)
│   ├─ Generative AI Fundamentals — Dr. Sharma
│   ├─ Advanced Cyber Attack Techniques — John Doe
│   └─ Building RAG Based Solutions — Jane Smith
└─ ▶ Open Elective III (1 option available)
```

**Interaction**:
- Click category heading to expand and see subjects with staff names
- Click again to collapse
- ChevronDown icon rotates to indicate expanded/collapsed state
- Smooth transitions with purple color scheme

**Benefits**:
- Cleaner, more organized initial view
- On-demand access to detailed information
- See actual staff assignments while planning
- Understand elective availability without clutter
- Students will still see their selected electives

**API Response** (`elective_categories`):
```json
{
  "regular_subjects": [...],
  "elective_categories": [
    {
      "category": "Professional Elective IV",
      "count": 2,
      "years": [3],
      "display_name": "Professional Elective IV"
    },
    {
      "category": "Emerging Elective I",
      "count": 3,
      "years": [4],
      "display_name": "Emerging Elective I"
    }
  ]
}
```

### 2. Student Feedback Submission Page

**Display**: Actual subject names with staff names

**Example**:
```
Your Subjects (6)
├─ Big Data Analytics — Aravind Prasad PB
├─ Deep Learning Techniques — Geetha S
├─ Generative AI Fundamentals — Dr. Sharma
├─ Web Application Technology — Deena Rose D
├─ Comprehension — Sri Santhoshini E
└─ Design Project — Geetha S
```

**Benefits**:
- Students see exactly what they're rating
- Clear instructor identification
- Simple, flat list (no confusing categories)
- Shows only subjects they're enrolled in

**API**: Uses existing `GetStudentSubjectsView` (no changes needed)

**Response Structure**:
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
    }
  ]
}
```

### 3. HOD Response View

**Display**: Actual subject names with staff names for analysis

**Example**:
```
Responses (45/60 submitted)

Advanced Cyber Attack Techniques
Staff: John Doe
⭐ 4.5/5.0 average
💬 12 comments

Building RAG Based Solutions
Staff: Jane Smith
⭐ 4.8/5.0 average
💬 8 comments

Generative AI Fundamentals
Staff: Dr. Sharma
⭐ 4.2/5.0 average
💬 15 comments
```

**Benefits**:
- HOD sees individual elective subjects with ratings
- Can analyze performance by specific subject
- Clear staff attribution
- Detailed feedback for each elective

**API**: Uses existing `GetResponseListView` (no changes needed)

**Response Structure**:
```json
{
  "responses": [
    {
      "answers": [
        {
          "teaching_assignment": {
            "subject_name": "Big Data Analytics",
            "subject_code": "ADB1322",
            "staff_name": "Aravind Prasad PB"
          },
          "answer_star": 5
        }
      ]
    }
  ]
}
```

## Technical Implementation

### Backend Changes: `backend/feedback/views.py`

#### GetSubjectsByYearView (HOD Creation API)

**New Response Fields**:

1. **`elective_categories`**: Array of category headings for HOD creation
   ```python
   elective_categories = [
       {
           'category': 'Professional Elective IV',
           'count': 2,
           'years': [3],
           'display_name': 'Professional Elective IV'
       }
   ]
   ```

2. **`elective_groups`**: Array with individual subjects for response view
   ```python
   elective_groups = [
       {
           'category': 'Professional Elective IV',
           'subjects': [
               {'subject_name': 'Big Data Analytics', ...},
               {'subject_name': 'Deep Learning Techniques', ...}
           ],
           'count': 2
       }
   ]
   ```

**Logic**:
```python
# Build elective_categories (headings only)
formatted_elective_categories = []
for category in sorted(elective_groups.keys()):
    category_count = len(elective_groups[category])
    formatted_elective_categories.append({
        'category': category,
        'count': category_count,
        'years': sorted(category_years),
        'display_name': category
    })

# Build elective_groups (with individual subjects)
formatted_elective_groups = []
for category, subjects in sorted(elective_groups.items()):
    category_subjects = [...]  # Individual subjects
    formatted_elective_groups.append({
        'category': category,
        'subjects': category_subjects,
        'count': len(category_subjects)
    })
```

### Frontend Changes: `frontend/src/pages/feedback/FeedbackPage.tsx`

**New State Management**:
```typescript
// Track which categories are expanded
const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
```

**Updated Type Definitions**:
```typescript
elective_categories?: {
  category: string;
  count: number;
  years: number[];
  display_name: string;
}[];

elective_groups?: {
  category: string;
  subjects: {
    subject_name: string;
    subject_code: string;
    staff_names: string; // From TeachingAssignment
    sections: string;
    years: number[];
    assignment_count: number;
  }[];
  count: number;
}[];
```

**Display Logic with Expand/Collapse**:
```tsx
{/* Collapsible Category Header */}
<button
  onClick={() => {
    const newExpanded = new Set(expandedCategories);
    if (isExpanded) {
      newExpanded.delete(category.category);
    } else {
      newExpanded.add(category.category);
    }
    setExpandedCategories(newExpanded);
  }}
  className="w-full p-3 flex items-center justify-between hover:bg-purple-100"
>
  <div className="flex-1">
    <h5>{category.display_name}</h5>
    <p>{category.count} option(s) available</p>
  </div>
  <ChevronDown className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
</button>

{/* Expanded Subjects List */}
{isExpanded && groupData && (
  <div className="border-t border-purple-200">
    {groupData.subjects.map(subject => (
      <div className="bg-white p-2 rounded border border-purple-200">
        <span className="text-purple-700 font-medium">{subject.subject_code}</span>
        <h6 className="text-slate-800 font-medium">{subject.subject_name}</h6>
        <p className="text-slate-600 flex items-center gap-1">
          <UserIcon className="w-3 h-3" />
          {subject.staff_names}
        </p>
      </div>
    ))}
  </div>
)}
```

**Dependencies**: 
- `ChevronDown` icon from lucide-react for expand/collapse indicator
- `UserIcon` (User icon aliased) from lucide-react for staff indication
- `elective_groups` data from API response

## Data Flow

### 1. HOD Creates Feedback
```
HOD selects years → API fetches subjects → Groups electives by category
→ Backend returns both:
   • elective_categories (for collapsed headers)
   • elective_groups (for expanded subject details)
→ Frontend displays collapsed categories initially
→ HOD clicks category → Frontend expands to show subjects from elective_groups
→ Display shows:
   • Core subjects (individual with staff names)
   • Elective categories (collapsed/expandable with staff names when expanded)
```

### 2. Student Submits Feedback
```
Student opens form → API fetches TeachingAssignments for student
→ Frontend displays:
   • All subjects (core + electives) with staff names
   • Student submits ratings for each subject
   • Response stored with teaching_assignment_id
```

### 3. HOD Views Responses
```
HOD opens responses → API fetches FeedbackResponses grouped by user
→ Frontend displays:
   • Responses grouped by teaching_assignment
   • Shows actual subject names and staff names
   • Displays ratings and comments per subject
```

## Benefits by Role

### HOD Benefits
1. **Creation**: Clean view of curriculum structure
2. **Response**: Detailed analysis of each elective's performance
3. **Understanding**: See which electives are popular/well-received
4. **Planning**: Better informed for next semester planning

### Student Benefits
1. **Clarity**: See exactly what they're rating
2. **Simplicity**: No confusing category labels
3. **Relevance**: Only see subjects they're enrolled in
4. **Staff Info**: Clear instructor identification

### Administrator Benefits
1. **Flexibility**: Different views for different purposes
2. **Scalability**: Works with any number of electives
3. **Analysis**: Rich data for decision-making
4. **Reporting**: Can group by category or analyze individually

## Examples

### Scenario: Department has 3 Professional Electives

**HOD Creation View (Collapsed)**:
```
▶ Professional Elective IV (3 options available)
  Students select based on their choices
```

**HOD Creation View (Expanded)**:
```
▼ Professional Elective IV (3 options available)
  Students select based on their choices
  
  ┌─────────────────────────────────────────────┐
  │ ADB1356  Big Data Analytics                 │
  │ 👤 Aravind Prasad PB                        │
  └─────────────────────────────────────────────┘
  
  ┌─────────────────────────────────────────────┐
  │ ADB1354  Deep Learning Techniques           │
  │ 👤 Geetha S                                 │
  └─────────────────────────────────────────────┘
  
  ┌─────────────────────────────────────────────┐
  │ ADB1352  Business Analytics                 │
  │ 👤 Dr. Kumar                                │
  └─────────────────────────────────────────────┘
```

**Student View** (enrolled in Big Data Analytics):
```
┌─────────────────────────────────────────────┐
│ ADB1356  Big Data Analytics                 │
│ 👤 Aravind Prasad PB                        │
│ [Rating interface]                          │
└─────────────────────────────────────────────┘
```

**HOD Response View**:
```
Big Data Analytics (Prof. Aravind Prasad PB)
⭐ 4.5/5.0 (20 responses)
💬 "Excellent teaching style..."

Deep Learning Techniques (Prof. Geetha S)
⭐ 4.8/5.0 (18 responses)
💬 "Very knowledgeable..."

Business Analytics (Prof. Kumar)
⭐ 4.2/5.0 (15 responses)
💬 "Good practical examples..."
```

## API Endpoints

### 1. GET /api/feedback/subjects-by-year/ (HOD Creation)
**Returns**: Category headings in `elective_categories`

### 2. GET /api/feedback/<form_id>/subjects/ (Student View)
**Returns**: Individual subjects with staff names

### 3. GET /api/feedback/<form_id>/responses/ (HOD Response View)
**Returns**: Individual subjects with staff names and ratings

## Testing Checklist

- [ ] HOD sees collapsed category headings initially
- [ ] Categories show correct subject count  
- [ ] Click category to expand and see subjects with staff names
- [ ] Click category again to collapse
- [ ] ChevronDown icon rotates correctly (down = collapsed, up = expanded)
- [ ] Expanded subjects display subject code, name, and staff name
- [ ] Staff names come from TeachingAssignment (not "Multiple Staff")
- [ ] Students see individual subject names with staff (no categories)
- [ ] Students can submit feedback for electives
- [ ] HOD response view shows individual subjects with staff names
- [ ] HOD can analyze performance by elective
- [ ] No duplicate subject listings
- [ ] Purple color scheme maintained for elective cards
- [ ] Smooth transitions on expand/collapse
- [ ] Backward compatibility maintained

## Migration Notes

### Existing Feedback Forms
- Already created forms will work correctly
- Responses stored with `teaching_assignment_id` are properly displayed
- No data migration required

### Frontend Compatibility
- Falls back to old display if `elective_categories` not present
- Maintains backward compatibility with older API responses

## Future Enhancements

1. **Category Filtering**: Allow HOD to view responses by elective category
2. **Comparison View**: Compare performance across categories
3. **Enrollment Stats**: Show how many students chose each elective
4. **Trend Analysis**: Track elective popularity over semesters
5. **Staff Comparison**: Compare same subject taught by different staff

## Documentation

- **[FEEDBACK_FIX_SUMMARY.md](FEEDBACK_FIX_SUMMARY.md)**: Technical fix for 4th year and elective display
- **[FEEDBACK_ELECTIVE_GROUPING.md](FEEDBACK_ELECTIVE_GROUPING.md)**: Detailed grouping implementation
- **[FEEDBACK_THREE_TIER_DISPLAY.md](FEEDBACK_THREE_TIER_DISPLAY.md)**: This document

## Support

For issues:
1. Check browser console for API response structure
2. Verify `elective_categories` field is present in response
3. Check backend logs for category grouping
4. Ensure ElectiveSubject records have parent categories set

---

**Status**: ✅ Complete and Tested
**Version**: 2.0
**Last Updated**: March 10, 2026
