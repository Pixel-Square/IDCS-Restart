# Power BI Connection - Quick Reference Card

**Print this or share via email**

---

## 🔐 Connection Credentials

```
Server URL:     https://db.krgi.co.in/api/bi/
Authentication: Bearer Token (JWT)
Port:          443 (HTTPS)
Protocol:      REST API (JSON)
```

---

## 📊 Data Endpoints

### Students Data
```
https://db.krgi.co.in/api/bi/students/?limit=10000

Fields: student_id, reg_no, first_name, last_name, email, 
        batch_name, course_name, dept_code, status
```

### Subjects Data
```
https://db.krgi.co.in/api/bi/subjects/?limit=10000

Fields: subject_id, subject_code, subject_name, semester_no, 
        course_name, dept_code
```

### Teaching Assignments Data
```
https://db.krgi.co.in/api/bi/teaching-assignments/?limit=10000

Fields: staff_id, staff_first_name, staff_last_name, subject_name, 
        academic_year, section_name
```

### Marks Data
```
https://db.krgi.co.in/api/bi/marks/?limit=10000

Fields: fact_key, student_id, assessment_key, component_key, marks
```

---

## 🔑 Your Access Token (Valid 60 minutes)

```
[PASTE YOUR TOKEN HERE]
```

**How to get new token:**
```bash
curl -X POST https://db.krgi.co.in/api/accounts/token/ \
  -H "Content-Type: application/json" \
  -d '{"identifier": "iqac@krct.ac.in", "password": "Iqac@2024"}'
```

---

## Power BI Setup - 6 Steps

```
1. Open Power BI Desktop

2. Home → Get Data → Web

3. URL: https://db.krgi.co.in/api/bi/students/?limit=10000

4. Authentication: Custom
   Header: Authorization: Bearer [YOUR_TOKEN]

5. Click Connect

6. Power Query: Click [results] → Convert to Table
   Click Expand Arrow → Select All Fields → OK

7. Close & Apply

✅ Done! Data will load in Power BI
```

---

## Filter Examples

### Get CSE Department Only
```
https://db.krgi.co.in/api/bi/students/?dept_code=CSE&limit=10000
```

### Get 2024 Batch
```
https://db.krgi.co.in/api/bi/students/?batch_name=2024&limit=10000
```

### Get Semester 4 Subjects
```
https://db.krgi.co.in/api/bi/subjects/?semester_no=4&limit=10000
```

### Get Active Teaching Assignments
```
https://db.krgi.co.in/api/bi/teaching-assignments/?is_active=true&limit=10000
```

---

## 🚨 Troubleshooting

### Can't Connect
```
✓ Check internet connection
✓ Verify https://db.krgi.co.in is accessible
✓ Try URL in browser first
```

### "Unauthorized" Error
```
✓ Token has expired (60 min limit)
✓ Get fresh token from server admin
✓ Update Power BI query with new token
```

### No Data Returned
```
✓ Try without filters: /students/?limit=100
✓ Check API endpoint is correct
✓ Verify Bearer token in header
```

### JSON Can't be Converted
```
✓ Make sure you click [results] table first
✓ Then convert to table using Power Query
✓ Expand all fields properly
```

---

## Key Notes

- **Token expires in 60 minutes** - Get new one for long sessions
- **Limit results** - Use filters to improve performance
- **HTTPS only** - Always use secure connection
- **Read-only access** - Perfect for dashboards & reports
- **No direct database access** - All through secure API

---

## Dashboard Ideas

✓ Student demographics by department
✓ Course enrollment trends
✓ Subject curriculum structure
✓ Staff teaching load
✓ Academic performance analysis
✓ Grade distribution charts
✓ Semester-wise subject mapping
✓ Department-wise analytics

---

## Support Contacts

**Need help?**
- 🔧 API Issues: Check endpoint URL and token
- 📱 Power BI Setup: Use POWERBI_FRESH_START.md guide
- 🔐 Authentication: Get new token from admin
- 📊 Data Questions: Ask data owner about available fields

---

**Status: Ready to Connect ✅**

Last Updated: March 16, 2026
