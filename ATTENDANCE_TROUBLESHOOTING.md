# Attendance Troubleshooting Guide

## Issue: Saved Attendance Not Showing for Students

### Overview
If staff members are marking attendance but students cannot see their records, follow these debugging steps.

---

## ✅ Step 1: Check Staff Attendance Marking

1. **Open Browser Console** (F12) when marking attendance
2. Mark attendance for a period
3. **Look for these console logs:**
   ```
   Saving attendance with payload: { section_id: X, period_id: Y, date: "YYYY-MM-DD", records: [...] }
   Attendance saved successfully: { ... }
   ```
4. **Verify the success message shows:**
   - Correct date
   - Correct period
   - Correct section
   - Number of students

### Common Issues:
- ❌ **Error in console?** Check if staff has permission to mark attendance
- ❌ **Wrong section ID?** Ensure staff is assigned to that section
- ❌ **No students in records?** Check if students are properly enrolled in the section/batch

---

## ✅ Step 2: Check Student Attendance View

1. **Login as a student** who should have attendance
2. **Open Browser Console** (F12)
3. **Go to "My Attendance" page**
4. **Check the date range** - Default is last 30 days
5. **Look for these console logs:**
   ```
   Fetching student attendance: { startDate: "...", endDate: "...", url: "..." }
   Student attendance response: { recordCount: X, summary: {...}, records: [...] }
   ```

### What to Check:
- ✅ **Date Range:** Does it include the date when attendance was marked?
- ✅ **Record Count:** Should match the number of periods marked
- ✅ **Records Array:** Should contain attendance entries

### Common Issues:
- ❌ **recordCount is 0** but attendance was marked?
  - Student might not be in the section/batch
  - Wrong date range selected
  - Database issue (see Step 3)

---

## ✅ Step 3: Database Verification

Run these commands in your backend terminal:

```bash
# Activate virtual environment
.venv\scripts\activate.ps1  # Windows
# or source .venv/bin/activate  # Linux/Mac

# Open Django shell
python manage.py shell
```

Then run these checks:

### Check if attendance sessions exist:
```python
from academics.models import PeriodAttendanceSession, PeriodAttendanceRecord
from datetime import date

# Check today's sessions
today = date.today()
sessions = PeriodAttendanceSession.objects.filter(date=today)
print(f"Sessions today: {sessions.count()}")
for s in sessions:
    print(f"  - {s.section} | {s.period} | {s.records.count()} records")
```

### Check specific student's records:
```python
from academics.models import StudentProfile, PeriodAttendanceRecord

# Replace with actual student username
student = StudentProfile.objects.filter(user__username="STUDENT_USERNAME").first()
if student:
    records = PeriodAttendanceRecord.objects.filter(student=student)
    print(f"Total records for {student.reg_no}: {records.count()}")
    for r in records[:10]:  # Show last 10
        print(f"  - {r.session.date} | {r.session.period.label} | {r.status}")
else:
    print("Student not found!")
```

### Check if migrations are applied:
```bash
# Exit Django shell (Ctrl+Z then Enter, or exit())
python manage.py showmigrations academics | findstr "period"
```

You should see:
```
[X] 0029_periodattendancesession_periodattendancerecord
```

If not checked [X], run:
```bash
python manage.py migrate academics
```

---

## ✅ Step 4: Common Root Causes

### 1. **Student Not Enrolled in Section/Batch**
**Symptom:** Attendance saves but student sees nothing

**Check:**
```python
# In Django shell
from academics.models import StudentProfile, Section, SubjectBatch

student = StudentProfile.objects.get(user__username="STUDENT_USERNAME")
print(f"Student section: {student.section}")

# Check if student is in the section where attendance was marked
section_id = 123  # Replace with actual section ID from attendance
section = Section.objects.get(id=section_id)
print(f"Is student in section? {student.section == section}")

# For subject batches
batch_id = 456  # Replace with actual batch ID
batch = SubjectBatch.objects.get(id=batch_id)
print(f"Is student in batch? {student in batch.students.all()}")
```

**Fix:** Add student to correct section/batch in admin panel

### 2. **Wrong Timetable Assignment**
**Symptom:** Staff can mark but it's not linked to correct subject

**Check:** In admin panel:
- Timetable → Timetable Assignments
- Verify staff is assigned to correct section + period + day

### 3. **Date Format Issue**
**Symptom:** Attendance saves with wrong date

**Check console logs** - date should be ISO format: `YYYY-MM-DD`

### 4. **Permission Issue**
**Symptom:** API returns 403 Forbidden

**Fix:** Ensure staff user has:
- `staff_profile` assigned
- Teaching assignment for that period
- OR has `academics.mark_attendance` permission

---

## ✅ Step 5: API Testing

### Test Staff Attendance Marking API:
```bash
# Using curl or Postman
POST http://localhost:8000/api/academics/period-attendance/bulk-mark/
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "section_id": 1,
  "period_id": 1,
  "date": "2026-02-10",
  "records": [
    {"student_id": 1, "status": "P"},
    {"student_id": 2, "status": "A"}
  ]
}
```

### Test Student View API:
```bash
GET http://localhost:8000/api/academics/student/attendance/?start_date=2026-02-01&end_date=2026-02-10
Authorization: Bearer STUDENT_ACCESS_TOKEN
```

---

## ✅ Step 6: Quick Fixes

### Force Refresh Student Attendance:
1. Logout and login again
2. Clear browser cache (Ctrl+Shift+Delete)
3. Change date range and click "Refresh" button
4. Check console for errors

### Verify Backend is Running:
```bash
# In backend directory
python manage.py runserver
```

Should show: `Starting development server at http://127.0.0.1:8000/`

### Check Frontend Connection:
In `frontend/.env`:
```
VITE_API_BASE=http://localhost:8000
```

---

## 📊 Success Indicators

When everything works correctly:

**Staff Side (Console):**
```
Saving attendance with payload: {...}
Attendance saved successfully: { id: 123, ... }
```

**Student Side (Console):**
```
Fetching student attendance: { startDate: "2026-01-11", endDate: "2026-02-10" }
Student attendance response: { recordCount: 15, summary: {...}, records: [...] }
```

**Student Side (UI):**
- Attendance rate percentage shown
- Subject-wise breakdown visible
- Individual records listed with dates and statuses

---

## 🆘 Still Not Working?

1. **Check backend logs** for errors
2. **Enable DEBUG = True** in `backend/erp/settings.py` temporarily
3. **Check database directly:**
   ```bash
   python manage.py dbshell
   SELECT * FROM academics_periodattendancerecord ORDER BY id DESC LIMIT 10;
   ```
4. **Verify student profile exists:**
   ```python
   # Django shell
   from accounts.models import User
   from academics.models import StudentProfile
   
   user = User.objects.get(username="STUDENT_USERNAME")
   print(f"Has student_profile: {hasattr(user, 'student_profile')}")
   if hasattr(user, 'student_profile'):
       print(f"Student: {user.student_profile.reg_no}")
   ```

---

## 📝 Notes

- **New Feature Added:** Consecutive period detection dialog
- **Console Logging:** Now enabled for debugging (can be removed in production)
- **Enhanced Error Messages:** Shows detailed info on failures
- **Date Format:** Always use ISO format YYYY-MM-DD
- **Default View:** Students see last 30 days by default

---

## Contact

If issue persists after following all steps, provide:
1. Console logs from both staff and student views
2. Django shell output from Step 3
3. Screenshot of error messages
4. Backend terminal logs during save operation
