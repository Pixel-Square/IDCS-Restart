# Power BI Connection - SIMPLE METHOD (Username/Password Only)

**⭐ NO JWT TOKENS NEEDED - Just your username & password!**

---

## 🎯 Super Simple Setup (3 Minutes)

### Your Credentials
```
Username: iqac@krct.ac.in
Password: Iqac@2024
```

---

## **Method 1: Download CSV Files (Easiest for Power BI)**

### **Step 1: Get Download Links**

Open terminal/PowerShell and run:

```bash
curl -X POST https://db.krgi.co.in/api/bi/simple/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "iqac@krct.ac.in", "password": "Iqac@2024"}'
```

**Response:**
```json
{
    "status": "Success",
    "download_links": {
        "students": "https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024",
        "subjects": "https://db.krgi.co.in/api/bi/simple/download/subjects/?username=iqac@krct.ac.in&password=Iqac@2024",
        "staff": "https://db.krgi.co.in/api/bi/simple/download/staff/?username=iqac@krct.ac.in&password=Iqac@2024"
    }
}
```

### **Step 2: Download CSV Files**

Simply **click these links** or paste in browser:

**Students Data:**
```
https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024
```

**Subjects Data:**
```
https://db.krgi.co.in/api/bi/simple/download/subjects/?username=iqac@krct.ac.in&password=Iqac@2024
```

**Staff Data:**
```
https://db.krgi.co.in/api/bi/simple/download/staff/?username=iqac@krct.ac.in&password=Iqac@2024
```

Files will download as:
- `students.csv` 
- `subjects.csv`
- `staff.csv`

### **Step 3: In Power BI - Import CSV**

1. **Home** → **Get Data** → **Text/CSV**
2. **Browse** → Select downloaded CSV file
3. Click **Load**
4. **Done!** Data is now in Power BI

---

## **Method 2: Direct Connection from URLs (Advanced)**

### For Remote Users

**Share this with remote Power BI users:**

1. **In Power BI:** Get Data → **Web**

2. **Paste URL:**
   ```
   https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024
   ```

3. **Click OK** → CSV data loads directly into Power BI

4. **Close & Apply**

---

## 📊 Available CSV Downloads

| Data | URL |
|------|-----|
| **Students** | `/api/bi/simple/download/students/` |
| **Subjects** | `/api/bi/simple/download/subjects/` |
| **Staff** | `/api/bi/simple/download/staff/` |

**Add filters to the URL:**
```
?username=iqac@krct.ac.in&password=Iqac@2024&dept_code=CSE
?username=iqac@krct.ac.in&password=Iqac@2024&batch_name=2024
```

---

## 🎯 Quick Example

### Download CSE Department Students

```
https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024&dept_code=CSE
```

### Download Batch 2024 Students

```
https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024&batch_name=2024
```

---

## ✅ Advantages

✅ **No JWT tokens** - Just use your password  
✅ **CSV format** - Universal, works everywhere  
✅ **Simple URLs** - Easy to share  
✅ **Works offline** - Download and use anywhere  
✅ **No Cloudflare issues** - Direct HTTPS  

---

## 🔄 Refresh Data

To get fresh data:
1. Delete old CSV file
2. Download new CSV using same URL
3. Replace data in Power BI
4. Refresh Power BI queries

---

## 📋 CSV Structure

### Students CSV
```
StudentID, RegistrationNumber, FirstName, LastName, Email, 
Batch, Course, Department, Status, Section
```

### Subjects CSV
```
SubjectID, SubjectCode, SubjectName, Semester, 
Course, Department
```

### Staff CSV
```
AssignmentID, StaffName, StaffID, Subject, 
AcademicYear, Department, Active
```

---

## 🚀 For Remote Users (Share This)

### **Copy & Send to Remote Power BI User:**

```
Username: iqac@krct.ac.in
Password: Iqac@2024

Students URL: https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024

Subjects URL: https://db.krgi.co.in/api/bi/simple/download/subjects/?username=iqac@krct.ac.in&password=Iqac@2024

Staff URL: https://db.krgi.co.in/api/bi/simple/download/staff/?username=iqac@krct.ac.in&password=Iqac@2024

Steps:
1. Click any URL above → CSV will download
2. Open Power BI → Get Data → Text/CSV
3. Select downloaded file → Load
4. Create your dashboard!
```

---

## 🎨 Power BI Dashboard Ideas

Once you have the CSV files loaded:

**Page 1: Student Overview**
- Total unique students
- Students by department (pie chart)
- Students by batch (bar chart)
- Active vs inactive count

**Page 2: Academics**
- Subjects by semester (table)
- Course distribution
- Department-wise subjects

**Page 3: Staff**
- Teaching assignments
- Faculty workload
- Department-wise staff

---

## 📞 Troubleshooting

| Issue | Solution |
|-------|----------|
| URL returns error | Check you typed it exactly |
| Can't open CSV in Power BI | File might be corrupted - download again |
| No data returned | Try without filters first |
| File won't download | Check internet, try incognito mode |

---

## ✨ That's It!

✅ **Credentials ready**  
✅ **URLs working**  
✅ **CSV files downloadable**  
✅ **Ready for Power BI**  

**Start downloading your data now!** 🎉

---

**Last Updated:** March 16, 2026  
**Status:** ✅ WORKING
