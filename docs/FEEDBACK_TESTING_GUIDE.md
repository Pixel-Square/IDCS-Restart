# Feedback Module - Testing Guide

## Quick Test Checklist

### Pre-requisites
- Backend server running: `cd backend && python manage.py runserver`
- Frontend server running: `cd frontend && npm run dev`
- Database migrations applied: `python manage.py migrate feedback`

---

## Test 1: HOD Creates Feedback Form with Multiple Classes

**Login as:** HOD user

**Steps:**
1. Navigate to Feedback page
2. Click "Create New Feedback Form"
3. Select Target: **Student**
4. Select Type: **Subject Feedback** or **Open Feedback**
5. **Test Years Selection:**
   - Check "1st Year" and "2nd Year" ✓
   - Verify sections list updates to show only year 1 and year 2 sections
6. **Test Semester Dropdown:**
   - Click the "Select semesters..." dropdown
   - Check multiple semesters (e.g., Semester 1, Semester 3)
   - Verify dropdown shows "2 semesters selected"
   - Click outside to close dropdown
7. **Test Section Filtering:**
   - With years selected, verify only relevant sections appear
   - Uncheck "1st Year"
   - Verify year 1 sections disappear and any selected year 1 sections are unchecked
8. Select some sections (e.g., A, B)
9. Add questions (at least 2)
10. Set Status: **Active**
11. Click "Create Feedback Form"

**Expected Results:**
- ✅ Form created successfully
- ✅ Success message appears
- ✅ Form appears in the forms list with correct class labels
- ✅ Display shows: "1st Year, 2nd Year – Sem 1, 3 – Sections: A, B"

---

## Test 2: Student Views Filtered Feedback Forms

**Login as:** Student user (ensure you know their year, semester, section)

**Steps:**
1. Navigate to Feedback page
2. View available forms

**Expected Results:**
- ✅ Only sees forms that match their class info
- ✅ Sees forms marked "All Classes" in their department
- ✅ Does NOT see forms from other departments
- ✅ Does NOT see forms for other years/sections (unless multi-class includes them)

**Example:**
- Student: 2nd Year, Semester 3, Section A
- Should see forms targeting:
  - 2nd Year (when years=[2] or years=[1,2] or years=[2,3])
  - Semester 3 (when semesters=[3] or semesters=[3,4] or semesters=[])
  - Section A (when sections=[A] or sections=[A,B] or sections=[])
  - All Classes (when all_classes=true)

---

## Test 3: Student Submits Feedback

**Login as:** Student user

**Steps:**
1. Navigate to Feedback page
2. Click on an available feedback form
3. Answer all questions:
   - For STAR questions: Click on stars (1-5)
   - For TEXT questions: Type response
4. Click "Submit Feedback"

**Expected Results:**
- ✅ Success message appears
- ✅ Form closes automatically
- ✅ Form is no longer available in the list (already submitted)
- ✅ No "Failed to submit" error

**Troubleshooting if submission fails:**
1. Check browser console for error details
2. Verify user has `feedback.reply` permission
3. Check backend terminal for logs (search for "[FEEDBACK SUBMIT]")
4. Verify form status is ACTIVE
5. Check all questions are answered

---

## Test 4: Dynamic Section Filtering

**Login as:** HOD user

**Steps:**
1. Start creating a feedback form (Student target)
2. Initially select NO years
3. Observe sections area

**Expected Result:**
- ✅ Message: "Please select at least one year to see available sections"

**Continue:**
4. Check "1st Year"
5. Observe sections update to show only 1st year sections (e.g., A, B, C)
6. Check "3rd Year"
7. Observe sections update to show 1st + 3rd year sections (e.g., A, B, C, D, E)
8. Select some 1st year sections and some 3rd year sections
9. Uncheck "1st Year"
10. Observe:
    - ✅ 1st year sections disappear from the list
    - ✅ Previously selected 1st year sections are auto-unchecked
    - ✅ 3rd year sections remain visible and selected

---

## Test 5: Semester Dropdown Behavior

**Login as:** HOD user

**Steps:**
1. Start creating feedback form
2. Click "Select semesters..." dropdown

**Expected Result:**
- ✅ Dropdown opens showing all semesters with checkboxes

**Continue:**
3. Check Semester 1, Semester 2
4. Observe dropdown button updates to "2 semesters selected"
5. Click outside the dropdown

**Expected Result:**
- ✅ Dropdown closes
- ✅ Button still shows "2 semesters selected"

**Continue:**
6. Re-open dropdown
7. Uncheck Semester 1
8. Close dropdown

**Expected Result:**
- ✅ Button shows "1 semester selected"

---

## Test 6: Staff Feedback

**Login as:** HOD user

**Steps:**
1. Create feedback form
2. Select Target: **Staff**
3. Add questions
4. Set status: Active
5. Submit

**Login as:** Staff user (in same department)

**Steps:**
1. Navigate to Feedback page
2. View forms
3. Submit feedback

**Expected Results:**
- ✅ Staff sees the form (no class filtering for staff)
- ✅ Can submit successfully
- ✅ No year/semester/section selection shown for staff feedback

---

## Test 7: Validation and Error Handling

### Test 7a: Empty Year Selection

**Steps:**
1. Start creating student feedback
2. Do NOT select any years
3. Do NOT check "All Classes"
4. Try to submit

**Expected Result:**
- ✅ Error: "Please select at least one year or check 'All Classes'"

### Test 7b: No Questions

**Steps:**
1. Start creating feedback
2. Do NOT add any questions
3. Try to submit

**Expected Result:**
- ✅ Error: "Please add at least one question"

### Test 7c: Duplicate Submission

**Steps:**
1. Submit feedback for a form
2. Try to access the same form again

**Expected Result:**
- ✅ Form no longer appears in available forms list (already submitted)

---

## Test 8: Permission Checks

### Test 8a: User Without Create Permission

**Login as:** Regular staff (not HOD)

**Expected Result:**
- ✅ "Create New Feedback Form" button NOT visible
- ✅ Cannot access create form

### Test 8b: User Without Reply Permission

**Login as:** User without `feedback.reply` permission

**Steps:**
1. Try to submit feedback

**Expected Result:**
- ✅ Error: "You do not have permission to submit feedback"

---

## API Testing (Optional - For Developers)

### Test Backend API Directly

#### Get Class Options
```bash
curl -X GET http://localhost:8000/api/feedback/class-options/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "years": [...],
  "semesters": [...],
  "sections": [...],
  "year_sections": {
    "1": [...],
    "2": [...],
    "3": [...],
    "4": [...]
  },
  "success": true
}
```

#### Submit Feedback
```bash
curl -X POST http://localhost:8000/api/feedback/submit/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "feedback_form_id": 1,
    "responses": [
      {"question": 1, "answer_star": 5},
      {"question": 2, "answer_text": "Great!"}
    ]
  }'
```

**Expected Response:**
```json
{
  "message": "Feedback submitted successfully"
}
```

---

## Troubleshooting Common Issues

### Issue: "Failed to submit feedback"
**Solutions:**
1. Check user has `feedback.reply` permission
2. Verify form status is ACTIVE
3. Check all questions are answered
4. Check browser console for detailed error
5. Check backend logs for error details

### Issue: Sections not updating when years change
**Solutions:**
1. Check browser console for JavaScript errors
2. Verify API response includes `year_sections` field
3. Refresh the page and try again

### Issue: Semester dropdown won't close
**Solutions:**
1. Click outside the dropdown
2. Check for JavaScript errors in console
3. Refresh the page

### Issue: Students see forms they shouldn't
**Solutions:**
1. Verify form's year/semester/section arrays match student's class
2. Check form's department matches student's department
3. Verify form status is ACTIVE
4. Check student's profile has correct year/semester/section info

---

## Success Criteria

All tests passed = ✅ Ready for production

**Core Features:**
- [x] Semester dropdown with checkboxes works
- [x] Sections filter dynamically based on selected years
- [x] Year-section mappings returned from backend API
- [x] Students see only relevant forms
- [x] Feedback submission works without errors
- [x] Duplicate submission prevention works
- [x] Permission checks work correctly
- [x] Multi-class selection saves correctly
- [x] Form display labels show correct class info

**Edge Cases:**
- [x] No years selected → shows message
- [x] Year deselected → removes its sections
- [x] Empty arrays → treated as "all"
- [x] Staff feedback → no class filtering
- [x] All Classes checkbox → bypasses class filters

---

**Document Version:** 1.0  
**Last Updated:** March 8, 2026  
**Status:** Complete
