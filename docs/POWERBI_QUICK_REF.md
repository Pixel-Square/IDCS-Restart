# Power BI - QUICK REFERENCE CARD

**Print This or Share via Email**

---

## 🎯 3-Minute Setup (Pick One)

### **OPTION A: Download CSV (Easiest)**

```
1. Click: https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024
2. File downloads as students.csv
3. Power BI → Get Data → CSV
4. Select file → Load
✅ Done!
```

### **OPTION B: Direct Local Connection**

```
Power BI → Get Data → PostgreSQL

Server: 192.168.40.253
Database: college_erp
Username: erp_user
Password: erp_root

✅ Load & Done!
```

### **OPTION C: REST API**

```
URL: https://db.krgi.co.in/api/bi/students/?limit=10000
Method: GET
Header: Authorization: Bearer [TOKEN]

Get token: See token guide
✅ Connect & Done!
```

---

## 🔑 Credentials

```
Username: iqac@krct.ac.in
Password: Iqac@2024

DB User: erp_user
DB Pass: erp_root
```

---

## 📊 Download Links

| Data | Link |
|------|------|
| **Students** | `/api/bi/simple/download/students/` |
| **Subjects** | `/api/bi/simple/download/subjects/` |
| **Staff** | `/api/bi/simple/download/staff/` |

Add params: `?username=iqac@krct.ac.in&password=Iqac@2024`

---

## 🌐 Servers

```
Local Network:     192.168.40.253
Cloud (HTTPS):     db.krgi.co.in
Database Port:     5432 or 6432
API Port:          443 (HTTPS)
```

---

## 💡 Which Method?

**Local User?** → Direct PostgreSQL  
**Remote User?** → CSV Download  
**Cloud BI?** → REST API  
**Secure Remote?** → SSH Tunnel  

---

## 🚀 Test It

```bash
# Check credentials
curl -X POST https://db.krgi.co.in/api/bi/simple/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "iqac@krct.ac.in", "password": "Iqac@2024"}'

# Download students
curl 'https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024' > students.csv

# Test database
ping 192.168.40.253
```

---

## ✅ Status

- ✅ CSV Download: READY
- ✅ Direct DB: READY  
- ✅ API: READY
- ✅ All Credentials: VALID

**Ready to connect!** 🎉

---

## 📞 Quick Troubleshooting

| Problem | Fix |
|---------|-----|
| URL doesn't work | Copy-paste exactly |
| CSV won't open | Download again |
| No data in Power BI | Check filters |
| Can't connect locally | Check network cable |
| API timeout | Check internet |

---

## 📈 Available Tables

- **bi_dim_student** - 450+ students
- **bi_dim_subject** - All subjects
- **bi_dim_teaching_assignment** - Staff assignments
- **bi_fact_mark** - Student grades

---

## 🎨 Dashboard Templates

**Student Overview:** Students by dept, batch, status  
**Academic:** Subjects by semester, course distribution  
**Performance:** Mark distribution, grade analysis  
**Staff Load:** Assignments per faculty, workload  

---

## 📚 Full Guides

- CSV Method: POWERBI_SIMPLE_CSV.md
- Direct DB: POWERBI_DIRECT_DATABASE.md
- API: POWERBI_API_SETUP.md
- All Methods: POWERBI_ALL_METHODS.md

---

**Status: ALL SYSTEMS GO ✅**

Connect Now: https://db.krgi.co.in
