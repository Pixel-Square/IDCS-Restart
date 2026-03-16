# Connect Power BI to IDCS Database - Fresh Setup Guide

**For Remote Users on Another Device**

---

## 📋 Prerequisites

**On your computer, have ready:**
- Power BI Desktop (Download: https://powerbi.microsoft.com/desktop)
- Internet connection
- Username: `iqac@krct.ac.in`
- Password: `Iqac@2024`

---

## 🎯 Complete Steps (Start to Finish)

---

## **STEP 1: Get Your Access Token** 
### *(Do this first on the server - IQAC side)*

### On Server Terminal:
```bash
curl -X POST https://db.krgi.co.in/api/accounts/token/ \
  -H "Content-Type: application/json" \
  -d '{"identifier": "iqac@krct.ac.in", "password": "Iqac@2024"}'
```

### Response (Copy the `access` value):
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": 8645,
  "name": "IQAC",
  "roles": ["IQAC"]
}
```

**✅ SAVE THE `access` TOKEN** - You'll need this in Power BI

---

## **STEP 2: Share Connection Details with Remote User**

### Send this to the person on the other device:

```
API Server: https://db.krgi.co.in/api/bi/

Access Token: [PASTE THE ACCESS TOKEN HERE]

Students Endpoint: https://db.krgi.co.in/api/bi/students/?limit=10000
Subjects Endpoint: https://db.krgi.co.in/api/bi/subjects/?limit=10000
Staff Endpoint: https://db.krgi.co.in/api/bi/teaching-assignments/?limit=10000
Marks Endpoint: https://db.krgi.co.in/api/bi/marks/?limit=10000
```

---

## **STEP 3: On the Remote Device - Open Power BI Desktop**

### Click: **File** → **New**

---

## **STEP 4: Connect to Data Source**

### Click: **Get Data** (Home ribbon)

![Get Data Location]

---

## **STEP 5: Select Web Connector**

### Search and select: **Web**

![Web Connector]

---

## **STEP 6: Enter API URL**

### In the dialog, paste:
```
https://db.krgi.co.in/api/bi/students/?limit=10000
```

### Click: **OK**

---

## **STEP 7: Add Authentication Header**

### When prompted, select: **Custom**

### Paste this in the header section:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

*(Replace with your actual `access` token)*

### Click: **Connect**

---

## **STEP 8: Data Will Load**

### You should see:
```
[results]    : Table
[count]      : Number
[next]       : Text
[previous]   : Text
```

### Click on **[results]** → Preview student records

---

## **STEP 9: Transform Data (Power Query Editor)**

### The JSON structure needs to be flattened:

```
1. Click the table icon next to [results]
2. Click "Convert to Table" 
3. Click the expand arrow in the data column
4. Select all fields → OK
```

### Now you'll see student data in columns:
```
student_id | reg_no | first_name | last_name | email | batch_name | course_name | dept_code | ...
```

### Click: **Close & Apply**

---

## **STEP 10: Create Your First Visualization**

### In Power BI:
1. Click **Visualizations** → Select chart type (Bar, Pie, Table, etc.)
2. Drag fields to axes
3. See your dashboard come alive!

**Example Visualizations:**
- **Table**: All student records
- **Pie Chart**: Students by department
- **Bar Chart**: Students per batch
- **Card**: Total student count

---

## 📊 Load Additional Data

### Create new queries for:

**Query 2 - Subjects:**
```
https://db.krgi.co.in/api/bi/subjects/?limit=10000
```

**Query 3 - Staff Assignments:**
```
https://db.krgi.co.in/api/bi/teaching-assignments/?limit=10000
```

**Query 4 - Marks:**
```
https://db.krgi.co.in/api/bi/marks/?limit=10000
```

Repeat Steps 4-9 for each data source.

---

## 🔗 Create Relationships

### In Power BI:
1. **Model** → **Manage Relationships**
2. Link tables by common fields:
   - Student → Marks (by `student_id`)
   - Subject → Teaching Assignment (by `subject_id`)

---

## ✅ Final Dashboard Structure

```
┌─ Students (453 records)
├─ Subjects (by semester)
├─ Staff Assignments
└─ Marks & Grades
```

### Sample Dashboard Pages:

**Page 1: Overview**
- Total students
- Students by department
- Active vs inactive count

**Page 2: Academic**
- Subjects offered
- Courses per department
- Semesters

**Page 3: Staff**
- Teaching assignments
- Faculty load
- Academic year data

**Page 4: Performance**
- Student marks distribution
- Grade analysis
- Assessment scores

---

## ⚠️ Important Notes

### Token Expiry
- **Your token is valid for 60 minutes**
- After 60 minutes, refresh Power BI or get new token
- In Power BI: **Refresh** → Will prompt for new authentication

### Getting a New Token
```bash
# Run this when token expires:
curl -X POST https://db.krgi.co.in/api/accounts/token/ \
  -H "Content-Type: application/json" \
  -d '{"identifier": "iqac@krct.ac.in", "password": "Iqac@2024"}'
```

### Handling Large Datasets
- Default: 10,000 records per query
- Use filters to reduce size:
  ```
  https://db.krgi.co.in/api/bi/students/?dept_code=CSE&limit=5000
  ```

---

## 🔧 Troubleshooting

| Error | Solution |
|-------|----------|
| **"Cannot connect to https://db.krgi.co.in"** | Check internet connection, server might be down |
| **"Authorization failed"** | Check token is correct, may have expired |
| **"No results"** | Endpoint might be returning empty, try `/students/?limit=10` |
| **"Invalid JSON"** | Make sure you're using correct header: `Authorization: Bearer TOKEN` |
| **Data looks messy** | Click [results] → Convert to Table in Power Query |

---

## 📱 Share Dashboard

### After creating dashboard:

1. **Save**: File → Save (give it a name)
2. **Publish** (optional):
   - Click **Publish** in Power BI Desktop
   - Log in with Microsoft account
   - Choose workspace
   - Share with team members

---

## 🎯 Quick Reference URLs

```
Base API: https://db.krgi.co.in/api/bi/

Endpoints:
✓ /students/                    (453 records)
✓ /subjects/                    (curriculum)
✓ /teaching-assignments/        (staff)
✓ /marks/                       (grades)

Authentication:
Header: Authorization: Bearer [YOUR_TOKEN]
Content-Type: application/json
```

---

## 📞 Support

**If connection fails:**
1. Verify credentials work: `iqac@krct.ac.in` / `Iqac@2024`
2. Get fresh token using curl command above
3. Check internet connection to `https://db.krgi.co.in`
4. Ensure Power BI is up to date

---

## 🎉 Success Checklist

- [ ] Got access token
- [ ] Shared token with remote user
- [ ] Remote user opened Power BI Desktop
- [ ] Connected to Web data source
- [ ] Entered API URL
- [ ] Added Bearer token in authentication
- [ ] Data loaded successfully
- [ ] Converted data to table format
- [ ] Created first visualization
- [ ] Dashboard is working!

**🚀 You're all set! Start creating your Power BI dashboards now.**
