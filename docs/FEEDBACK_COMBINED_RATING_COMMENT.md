# Feedback Module: Combined Star Rating and Text Comment Enhancement

## Overview
Enhanced the Feedback module to allow a single feedback question to accept both **Star Rating (1-5)** and **Text Comment** simultaneously. This improves feedback quality by collecting both quantitative and qualitative responses.

## Problem Statement
Previously, each feedback question could only accept one type of answer:
- **Star Rating (1-5)** - Quantitative feedback
- **Text Response** - Qualitative feedback

HODs had to choose one or the other, limiting the richness of feedback data.

## Solution Implemented
Questions can now support:
- ✅ **Star Rating only**
- ✅ **Text Comment only**
- ✅ **Both Rating and Comment** (NEW!)

This matches modern university feedback systems where students can provide a numerical rating and elaborate with comments.

---

## Changes Implemented

### 1. Backend Model Updates

#### **File:** `backend/feedback/models.py`

**Added Fields to FeedbackQuestion:**
```python
# New flexible fields
allow_rating = models.BooleanField(
    default=True,
    help_text='Allow star rating (1-5) for this question'
)
allow_comment = models.BooleanField(
    default=True,
    help_text='Allow text comment for this question'
)
```

**Updated answer_type field:**
- Added 'BOTH' as a new choice
- Changed default to 'BOTH'
- Kept for backward compatibility

**FeedbackResponse Model:**
- Already had both `answer_star` and `answer_text` fields
- No changes needed - supports storing both values

#### **Migration:** `0007_add_allow_rating_and_comment_fields.py`
- Adds `allow_rating` field (default=True)
- Adds `allow_comment` field (default=True)
- Updates `answer_type` choices and default

---

### 2. Backend Serializer Updates

#### **File:** `backend/feedback/serializers.py`

**FeedbackQuestionSerializer:**
```python
fields = ['id', 'question', 'answer_type', 'allow_rating', 'allow_comment', 'order']
```

**Validation:**
- Ensures at least one answer method is enabled
- Automatically sets `answer_type` based on enabled methods:
  - Both enabled → 'BOTH'
  - Only rating → 'STAR'
  - Only comment → 'TEXT'

**FeedbackFormCreateSerializer:**
- Updated to handle `allow_rating` and `allow_comment` when creating questions
- Maintains backward compatibility with `answer_type` field

**FeedbackSubmissionSerializer:**
- Updated validation logic to check:
  - Rating only: Rating is required
  - Comment only: Comment is required
  - Both: Rating is required, comment is optional
- Stores both values in the same response record

---

### 3. Frontend Type Updates

#### **File:** `frontend/src/pages/feedback/FeedbackPage.tsx`

**Updated Question Type:**
```typescript
type Question = {
  id?: number;
  question: string;
  answer_type?: 'STAR' | 'TEXT' | 'BOTH';  // Legacy
  allow_rating: boolean;
  allow_comment: boolean;
  order: number;
};
```

**State Management:**
```typescript
const [allowRating, setAllowRating] = useState(true);
const [allowComment, setAllowComment] = useState(true);
```

---

### 4. Frontend Question Creation UI

**Before (Radio Button):**
```
Answer Type:
○ Star Rating (1-5)
○ Text Reply
```

**After (Checkboxes):**
```
Answer Type:
☑ ⭐ Star Rating (1-5)
☑ 💬 Text Comment
```

**Features:**
- Both checkboxes can be selected simultaneously
- At least one must be selected (validated)
- Default: Both enabled
- Visual badges show which methods are enabled

---

### 5. Frontend Response Submission UI

**Student/Staff Feedback Form:**

**When Both Enabled:**
```
┌─────────────────────────────────────────────────────┐
│ 1  How do you rate the teaching effectiveness?      │
│    [Rating] [Comment]                                │
├─────────────────────────────────────────────────────┤
│ Rate (1-5 stars) *                                   │
│ ⭐ ⭐ ⭐ ⭐ ⭐                                          │
│                                                      │
│ Comment (Optional)                                   │
│ ┌──────────────────────────────────────────────┐   │
│ │ Add your comments here (optional)...         │   │
│ └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**When Rating Only:**
```
Rate (1-5 stars) *
⭐ ⭐ ⭐ ⭐ ⭐
```

**When Comment Only:**
```
Comment
┌──────────────────────────────────────────────┐
│ Type your response here...                   │
└──────────────────────────────────────────────┘
```

---

## Database Schema

### FeedbackQuestion Table
```sql
CREATE TABLE feedback_questions (
    id INTEGER PRIMARY KEY,
    feedback_form_id INTEGER,
    question TEXT,
    answer_type VARCHAR(10) DEFAULT 'BOTH',
    allow_rating BOOLEAN DEFAULT TRUE,
    allow_comment BOOLEAN DEFAULT TRUE,
    order INTEGER,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### FeedbackResponse Table (Unchanged)
```sql
CREATE TABLE feedback_responses (
    id INTEGER PRIMARY KEY,
    feedback_form_id INTEGER,
    question_id INTEGER,
    user_id INTEGER,
    answer_star INTEGER NULL,      -- 1-5 rating
    answer_text TEXT NULL,          -- Text comment
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(feedback_form_id, question_id, user_id)
);
```

---

## API Examples

### Creating a Question with Both Rating and Comment

**Request:**
```json
POST /api/feedback/create
{
  "target_type": "STUDENT",
  "type": "SUBJECT_FEEDBACK",
  "department": 1,
  "status": "ACTIVE",
  "questions": [
    {
      "question": "How do you rate the teaching effectiveness?",
      "allow_rating": true,
      "allow_comment": true,
      "order": 1
    }
  ]
}
```

### Submitting a Response with Both Rating and Comment

**Request:**
```json
POST /api/feedback/submit
{
  "feedback_form_id": 123,
  "responses": [
    {
      "question": 1,
      "answer_star": 5,
      "answer_text": "Excellent teaching methods and clear explanations."
    }
  ]
}
```

---

## User Flows

### HOD Creates Feedback Form

1. HOD navigates to Feedback module
2. Clicks "New Form"
3. Fills in form details (target, type, classes)
4. Adds questions:
   - Types question text
   - Checks ☑ Star Rating
   - Checks ☑ Text Comment
   - Clicks "Add Question"
5. Question appears with both badges: [Rating] [Comment]
6. HOD publishes the form

### Student Submits Feedback

1. Student sees active feedback form
2. Clicks "Respond"
3. For each question:
   - Sees star rating selector (required)
   - Clicks on stars to select rating (1-5)
   - Sees text area for comments (optional)
   - Can optionally add written feedback
4. Clicks "Submit Feedback"
5. Response is validated and saved

---

## Validation Logic

### Question Creation
- At least one answer method must be enabled
- Cannot create question with both unchecked

### Response Submission

| Question Type       | Rating Required | Comment Required |
|---------------------|-----------------|------------------|
| Rating Only         | ✅ Yes          | ❌ No            |
| Comment Only        | ❌ No           | ✅ Yes           |
| Both Rating+Comment | ✅ Yes          | ❌ No (Optional) |

**Note:** When both are enabled, rating is mandatory but comment is optional.

---

## Backward Compatibility

✅ **Existing Forms:** Old questions with `answer_type='STAR'` or `answer_type='TEXT'` will continue to work  
✅ **Migration Safe:** Default values set automatically  
✅ **API Compatible:** Old API requests still accepted  
✅ **Data Preserved:** All existing responses remain intact  

### Migration Strategy for Existing Questions

During migration, the following happens automatically:
```python
# Old questions are updated:
answer_type='STAR' → allow_rating=True, allow_comment=False
answer_type='TEXT' → allow_rating=False, allow_comment=True
```

---

## Benefits

✅ **Richer Data:** Combines quantitative ratings with qualitative feedback  
✅ **Flexibility:** HODs can choose which input methods to enable  
✅ **Optional Comments:** Students aren't forced to write if they don't want to  
✅ **Better Analytics:** Can correlate ratings with written feedback  
✅ **Modern UX:** Matches industry standard feedback forms  
✅ **Backward Compatible:** Existing forms continue working  

---

## Testing Checklist

### Backend Tests
- [x] Migration runs without errors
- [x] Questions created with both rating and comment
- [x] Questions created with only rating
- [x] Questions created with only comment
- [x] Validation rejects questions with neither enabled
- [x] Responses validated correctly for each type
- [x] Both rating and comment stored in same response

### Frontend Tests
- [x] Checkboxes display correctly in form creation
- [x] At least one checkbox must be selected
- [x] Questions display with correct badges
- [x] Response form shows rating input when enabled
- [x] Response form shows comment input when enabled
- [x] Response form shows both when both enabled
- [x] Validation works for required fields
- [x] Submission successful with both rating and comment

### Integration Tests
- [x] HOD creates form with mixed question types
- [x] Student submits responses successfully
- [x] Response statistics display correctly
- [x] View responses shows both rating and comments
- [x] Existing forms still work after migration

---

## Display Examples

### Question Badge in Form Creation
```
Q1: How do you rate the course content?
[Rating] [Comment]
```

### Question Badge in Response Modal
```
1  What is your overall satisfaction level?
   [Rating] [Comment]
   
   Rate (1-5 stars) *
   ⭐ ⭐ ⭐ ⭐ ⭐
   
   Comment (Optional)
   [Text area for additional feedback...]
```

---

## Files Modified

### Backend
1. `backend/feedback/models.py`
   - Added `allow_rating` and `allow_comment` fields
   - Updated `answer_type` choices

2. `backend/feedback/migrations/0007_add_allow_rating_and_comment_fields.py`
   - Migration for new fields

3. `backend/feedback/serializers.py`
   - Updated serializers to handle new fields
   - Enhanced validation logic

### Frontend
1. `frontend/src/pages/feedback/FeedbackPage.tsx`
   - Updated Question type definition
   - Changed UI from radio to checkboxes
   - Enhanced response submission UI
   - Updated validation logic

---

## Future Enhancements

Potential improvements for future iterations:
- 📊 Analytics showing correlation between ratings and comments
- 🎯 Sentiment analysis on text comments
- 📈 Trend analysis over time
- 🔍 Search/filter responses by rating or keywords
- 📱 Mobile-optimized input interfaces
- 🌐 Multi-language support for questions
- 📤 Export responses to Excel with both rating and comment columns

---

## Migration Command

To apply the database changes:

```bash
cd backend
python manage.py migrate feedback 0007
```

---

## Date
March 10, 2026

## Author
GitHub Copilot (Claude Sonnet 4.5)
