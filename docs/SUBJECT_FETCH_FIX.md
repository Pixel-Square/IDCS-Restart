# Subject Fetching Fix - Testing Guide

## Issues Fixed

### Backend Issues (Fixed in `backend/feedback/views.py`)

1. **Line 1058**: Changed `batch__start_year=str(batch_start_year)` to `batch__start_year=batch_start_year`
   - **Problem**: Was comparing integer field to string, causing zero matches
   - **Fix**: Use integer comparison directly

2. **Line 1059**: Removed `batch__is_active=True` filter
   - **Problem**: Batch model has no `is_active` field, causing query to fail
   - **Fix**: Removed non-existent field filter

3. **Lines 1109-1111**: Changed `assignment.curriculum_row.subject.name` to `assignment.curriculum_row.course_name`
   - **Problem**: CurriculumDepartment has no `subject` field, has `course_name` instead
   - **Fix**: Access correct field names

4. **Lines 1115-1117**: Changed `assignment.elective_subject.name` to `assignment.elective_subject.course_name`
   - **Problem**: ElectiveSubject uses `course_name` not `name`
   - **Fix**: Use correct field name

5. **Removed invalid select_related**: Removed `'curriculum_row__subject'`
   - **Problem**: This relationship doesn't exist
   - **Fix**: Removed from select_related()

### Frontend Enhancement (Added in `frontend/src/pages/feedback/FeedbackPage.tsx`)

- Added comprehensive console logging to debug API calls
- Logs show:
  - API endpoint being called
  - Response status
  - Data received
  - Any errors

## Backend Verification (Already Tested ✅)

The backend API was tested and confirmed working:

```bash
python test_api_auth.py
```

**Results:**
- ✅ Status Code: 200
- ✅ Total Subjects: 41 for Year 3
- ✅ 6 subjects when filtered by Civil department
- ✅ Proper subject names, codes, staff names returned

**Sample data returned:**
1. Antenna & Millimeter Wave Communication - MANJUNATHAN A, MONISHA S
2. Automobile Engineering - Rajaguru K
3. Big Data Analytics - Aravind Prasad PB, Reetha Jeyarani M A
4. Building Information Modelling - Ramkumar S
5. Business Intelligence - Tamil Thendral S

## Frontend Testing Steps

### 1. Start Backend Server

```bash
cd backend
python manage.py runserver
```

### 2. Start Frontend Dev Server

```bash
cd frontend
npm run dev
```

### 3. Test the Feature

1. **Login as HOD**
   - Navigate to Feedback module
   - Click "New Form" button

2. **Select Feedback Type**
   - Choose "About Subjects" as target type
   - Select "Subject Feedback" as feedback type

3. **Select Year**
   - In the "Years" dropdown, select "3rd Year" (or any year)
   - Check your browser console (F12 → Console tab)

4. **Verify Console Logs**

   You should see logs like:
   ```
   [SubjectFetch] Calling API: /api/feedback/subjects-by-year/?year=3&department_id=X
   [SubjectFetch] Response status: 200 true
   [SubjectFetch] Data received: {subjects: Array(41), total_subjects: 41, year: 3, ...}
   ```

5. **Check UI Display**

   The "Subjects for Selected Year(s)" section should now show:
   - ✅ "Found X subject(s) for the selected year(s)."
   - ✅ Scrollable list of subjects with:
     - Subject name and code
     - Staff names
     - Section names
     - Assignment count

## Expected vs Previous Behavior

### Before Fix ❌
- Message: "No subjects found for the selected year(s). Please ensure teaching assignments exist for this year."
- Reason: Backend query was broken (wrong data types, non-existent fields, wrong field names)

### After Fix ✅
- Shows actual subjects from database
- Example display:
  ```
  Found 41 subject(s) for the selected year(s).

  [Subject Cards:]
  - Antenna & Millimeter Wave Communication (ECB1323)
    Staff: MANJUNATHAN A, MONISHA S
    Sections: A, B
    2 assignments

  - Big Data Analytics (ADB1322)
    Staff: Aravind Prasad PB, Reetha Jeyarani M A
    Sections: A, B
    2 assignments
  
  ... (more subjects)
  ```

## Troubleshooting

### If you still see "No subjects found":

1. **Check Browser Console** (F12 → Console)
   - Look for `[SubjectFetch]` logs
   - Check what the API response status is
   - Check what data was received

2. **Verify Prerequisites**
   - Ensure you're logged in as HOD
   - Ensure teaching assignments exist in database
   - Try: `python check_data.py` to verify data exists

3. **Check Network Tab** (F12 → Network)
   - Find the `/api/feedback/subjects-by-year/` request
   - Check if it's getting HTTP 200
   - Check the response payload

4. **Backend Logs**
   - Check Django console for any errors
   - Verify the API endpoint is being hit

### Common Issues

**Issue**: "Authentication credentials were not provided"
- **Solution**: Ensure you're logged in, check localStorage for tokens

**Issue**: Empty subjects array but 200 status
- **Solution**: Check if teaching assignments exist for that year
- Run: `python check_data.py` to verify

**Issue**: Console shows different year than selected
- **Solution**: Year might be number vs string mismatch, check formData.years

## Files Changed

### Backend
- ✅ `backend/feedback/views.py` - Fixed GetSubjectsByYearView query logic

### Frontend
- ✅ `frontend/src/pages/feedback/FeedbackPage.tsx` - Added debug logging

### Testing Scripts Created
- `backend/check_data.py` - Verify database has teaching assignment data
- `backend/test_api_auth.py` - Test API endpoint directly

## Summary

The issue was caused by multiple bugs in the backend query:
1. String vs integer comparison for batch start_year
2. Filtering by non-existent batch.is_active field
3. Accessing wrong field names for curriculum_row and elective_subject

All bugs have been fixed and the backend API has been tested and confirmed working.
The frontend now includes comprehensive logging to help debug any future issues.
