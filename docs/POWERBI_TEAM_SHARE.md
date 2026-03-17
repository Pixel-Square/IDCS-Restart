# Power BI Dashboard - Share with Your Team

## 🎯 What to Share with Power BI Users

Copy and share this section with anyone who needs to connect their Power BI dashboard:

---

## 📊 Connection Details (Share These)

### API Endpoint
```
https://db.krgi.co.in/api/bi/
```

### Available Data Services

| Endpoint | Data Type | URL |
|----------|-----------|-----|
| **Students** | All student records | `/api/bi/students/` |
| **Subjects** | Course curriculum | `/api/bi/subjects/` |
| **Staff** | Teaching assignments | `/api/bi/teaching-assignments/` |
| **Marks** | Student assessments | `/api/bi/marks/` |

### Authentication Required
✅ **Type**: JWT Bearer Token  
✅ **Port**: 443 (HTTPS)  
✅ **Access**: Need credentials from admin  

---

## 🔑 How to Get Your API Token

1. **Contact Admin** for username/password
2. **Run this command**:
   ```bash
   curl -X POST https://db.krgi.co.in/api/accounts/token/ \
     -H "Content-Type: application/json" \
     -d "{\"username\": \"your_username\", \"password\": \"your_password\"}"
   ```
3. **Save the access token** (valid for 60 minutes)

---

## Power BI Connection URL

### For Students Data:
```
https://db.krgi.co.in/api/bi/students/?limit=10000
```

### For Subjects Data:
```
https://db.krgi.co.in/api/bi/subjects/?limit=10000
```

### For Teaching Assignments:
```
https://db.krgi.co.in/api/bi/teaching-assignments/?limit=10000
```

---

## 🌐 Filter Examples

### Get CSE Students Only:
```
https://db.krgi.co.in/api/bi/students/?dept_code=CSE&limit=10000
```

### Get Specific Batch:
```
https://db.krgi.co.in/api/bi/students/?batch_name=2024&limit=10000
```

### Search by Name:
```
https://db.krgi.co.in/api/bi/students/?search=john&limit=1000
```

### Get Subjects for Semester 4:
```
https://db.krgi.co.in/api/bi/subjects/?semester_no=4&limit=10000
```

---

## 📋 Quick Reference for Power BI Users

**Connection Settings:**
```
Protocol: HTTPS
Host: db.krgi.co.in
Port: 443
Path: /api/bi/
Auth: Bearer Token
```

**Header Required:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Test Connection:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://db.krgi.co.in/api/bi/students/?limit=1
```

**When you see 200 OK with student data → Connection works!** ✅

---

## 📊 Power BI Setup (Step by Step)

### In Power BI Desktop:

1. **Home** → **Get Data** → **Web**
2. **Paste URL**:
   ```
   https://db.krgi.co.in/api/bi/students/?limit=10000
   ```
3. **Click OK**
4. **When prompted for authentication**:
   - Type: **Custom**
   - Paste your **Bearer Token**
5. **Click Connect** → Data loads!

---

## 🔄 Token Refresh (After 60 Minutes)

Your token expires after 60 minutes. Get a new one:

```bash
curl -X POST https://db.krgi.co.in/api/accounts/token/refresh/ \
  -H "Content-Type: application/json" \
  -d "{\"refresh\": \"your_refresh_token\"}"
```

Or just get a fresh token using your username/password again.

---

## 📈 Data Available

### Students (~453 records)
- Student ID, Registration No, Name, Email
- Batch, Course, Department
- Status (Active/Inactive)

### Subjects
- Subject Code, Name
- Semester, Course, Department
- Prerequisites

### Staff Assignments
- Staff Name, ID, Department
- Subject Assigned, Academic Year
- Section/Class

### Marks & Assessments
- Student Marks by Component
- Assessment Type
- Grades

---

## ✅ What Works Now

- ✅ Direct HTTPS connection (no VPN needed)
- ✅ Blazing fast (REST API vs direct DB)
- ✅ Secure (JWT authentication)
- ✅ Shareable links with filters
- ✅ Works from any network
- ✅ Cloudflare-friendly (no custom ports)

---

## ❌ OLD Connection (No Longer Works)

```
❌ Server: db.krgi.co.in:6432
❌ Reason: Cloudflare blocks port 6432

✅ USE INSTEAD:
https://db.krgi.co.in/api/bi/ (API)
```

---

## 📚 Full Documentation

Detailed docs available at:
- [POWERBI_API_SETUP.md](../docs/POWERBI_API_SETUP.md) - Complete API reference
- [POWERBI_QUICK_START.md](../docs/POWERBI_QUICK_START.md) - User guide

---

## 🔒 Security Notes

- **Keep tokens private** - Don't share in chat/email
- **Refresh regularly** - Don't store long-lived tokens  
- **Use HTTPS only** - Never user HTTP
- **Limit data** - Use filters to get what you need

---

## 📞 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unauthorized" | Token expired - get new one |
| Connection timeout | Check internet connection |
| No data returned | Verify filters are correct, try without filters |
| "Access Denied" | Need admin to grant permissions |

---

**You're all set!** 🚀 Connect your Power BI dashboard now.

Questions? Check the docs or contact admin.
