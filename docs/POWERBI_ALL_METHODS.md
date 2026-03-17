# Power BI Connection - All Methods (Choose Your Option)

**✅ ALL METHODS NOW WORKING - Pick What Works For You**

---

## 📊 Connection Methods Comparison

| Method | Setup Time | Tech Level | Remote? | Real-time? |
|--------|-----------|-----------|---------|-----------|
| **CSV Download** | 1 min | Beginner | ✅ Yes | ⏰ Manual refresh |
| **Direct PostgreSQL** | 5 min | Intermediate | ❌ No | ✅ Real-time |
| **SSH Tunnel** | 10 min | Advanced | ✅ Yes | ✅ Real-time |
| **REST API** | 5 min | Intermediate | ✅ Yes | ✅ Real-time |

---

## 🎯 Choose Your Method

### **Option 1: CSV Download (⭐ EASIEST - START HERE)**

**Best for:** Quick setup, offline work, sharing data

```bash
# Step 1: Get Download Links
curl -X POST https://db.krgi.co.in/api/bi/simple/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "iqac@krct.ac.in", "password": "Iqac@2024"}'

# Step 2: Click the Link to Download CSV
https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024

# Step 3: In Power BI - Get Data → CSV
```

✅ **Advantages:** Super simple, works everywhere  
❌ **Disadvantages:** Manual refresh needed

📖 **Full Guide:** [POWERBI_SIMPLE_CSV.md](POWERBI_SIMPLE_CSV.md)

---

### **Option 2: Direct PostgreSQL Connection (⭐ BEST FOR LOCAL USERS)**

**Best for:** Same network, real-time data, fast performance

```
Server: 192.168.40.253
Port: 6432 (PgBouncer) or 5432 (Direct)
Database: college_erp
Username: erp_user
Password: erp_root
```

✅ **Advantages:** Real-time data, best performance  
❌ **Disadvantages:** Only works on local network

📖 **Full Guide:** [POWERBI_DIRECT_DATABASE.md](POWERBI_DIRECT_DATABASE.md)

---

### **Option 3: SSH Tunnel (⭐ BEST FOR REMOTE + SECURE)**

**Best for:** Remote access, secure connection, real-time

**Windows (PuTTY):**
1. Configure tunnel: Local 6432 → localhost:5432
2. Connect to: 192.168.40.253
3. In Power BI: Server `localhost:6432`

**Mac/Linux:**
```bash
ssh -L 6432:localhost:5432 user@192.168.40.253
```

✅ **Advantages:** Secure, real-time, remote access  
❌ **Disadvantages:** Need SSH access, 10 min setup

---

### **Option 4: REST API (⭐ MODERN APPROACH)**

**Best for:** Cloud Power BI, integration, flexible queries

```
URL: https://db.krgi.co.in/api/bi/students/?limit=10000
Authorization: Bearer [JWT_TOKEN]
```

✅ **Advantages:** Cloud-ready, flexible, secure  
❌ **Disadvantages:** JWT tokens expire hourly

📖 **Full Guide:** [POWERBI_API_SETUP.md](POWERBI_API_SETUP.md)

---

## 🚀 Quick Start (3 Minutes)

### **For Someone on Same Network:**

1. **Power BI** → **Get Data** → **PostgreSQL**
2. **Enter:** `192.168.40.253`, `college_erp`
3. **Auth:** `erp_user` / `erp_root`
4. **Load Data** → Done!

### **For Someone Remote:**

1. **Browser:** Paste this URL
   ```
   https://db.krgi.co.in/api/bi/simple/download/students/?username=iqac@krct.ac.in&password=Iqac@2024
   ```
2. **File downloads**
3. **Power BI** → **Get Data** → **CSV**
4. **Select file** → **Load**
5. **Done!**

---

## 📋 Your Credentials

```
Email/Username: iqac@krct.ac.in
Password: Iqac@2024

Database User: erp_user
Database Pass: erp_root

Server: 192.168.40.253 (Local) or db.krgi.co.in (HTTPS)
Database: college_erp
Port: 6432 (PgBouncer), 5432 (Direct), or 443 (API)
```

---

## 📊 Available Data

All methods give you access to:

✅ **Students** (450+ records)
- ID, Registration No, Name, Email, Batch, Course, Department, Status

✅ **Subjects** 
- Subject Code, Name, Semester, Course, Department

✅ **Staff Assignments**
- Staff Name, Subject, Academic Year, Department, Active Status

✅ **Marks/Grades**
- Student Marks, Components, Assessments

---

## 🎨 Create Your Dashboard

Once data is loaded, create visualizations:

**Example 1: Department Distribution**
- Pie chart: Students by department
- Filter by batch before visualizing

**Example 2: Academic Load**
- Table: Staff assignments
- Bar chart: Subjects per department
- Semester trend analysis

**Example 3: Performance Analysis**
- Student mark distribution
- Grade comparison
- Course-wise analysis

---

## 🔄 Keeping Data Fresh

| Method | Refresh | Frequency |
|--------|---------|-----------|
| **CSV** | Manual download + reload | Daily/Weekly |
| **Direct DB** | Automatic refresh | Real-time |
| **SSH Tunnel** | Automatic refresh | Real-time |
| **API** | Power BI refresh schedule | Hourly/Daily |

---

## 🆘 Troubleshooting

**Can't connect?** Try in this order:

1. **Test basic connectivity:**
   ```bash
   ping db.krgi.co.in
   # or
   ping 192.168.40.253
   ```

2. **Check if on same network:**
   ```bash
   # If pings work, you're connected
   # Try Direct PostgreSQL method
   ```

3. **If remote:** 
   - Try CSV Download method first
   - Then try SSH tunnel
   - Finally try REST API

4. **Check credentials:**
   ```bash
   curl -X POST https://db.krgi.co.in/api/bi/simple/login/ \
     -H "Content-Type: application/json" \
     -d '{"username": "iqac@krct.ac.in", "password": "Iqac@2024"}'
   ```

---

## 📞 Method-Specific Help

| Issue | Solution |
|-------|----------|
| "Connection refused" | Server down or firewall blocking - try CSV |
| "Invalid password" | Check credentials in .env file |
| "Timeout" | Network latency - use CSV or reduce queries |
| "Access Denied" | User doesn't have DB permission |
| "No data returned" | Check filters, try without filters |

---

## ✅ Recommended Setup

**For Your Organization:**

1. **Admins/IQAC (Local):** Use Direct PostgreSQL 
   - Fastest, real-time
   - No complexity

2. **Department Heads (Remote):** Use CSV Download
   - Simple, reliable
   - Daily snapshots

3. **Power BI Service (Cloud):** Use REST API
   - Cloud-native
   - Scheduled refresh

4. **Power Users (Secure Remote):** Use SSH Tunnel
   - Real-time, secure
   - Advanced setup

---

## 🎯 Next Steps

1. **Pick a method** from the 4 options above
2. **Follow the guide** for that method
3. **Test the connection**
4. **Load your data**
5. **Create dashboards!**

---

## 📚 Full Documentation

- [CSV Download Method](POWERBI_SIMPLE_CSV.md) - START HERE
- [Direct Database Connection](POWERBI_DIRECT_DATABASE.md) - For Local Users
- [REST API Method](POWERBI_API_SETUP.md) - For Cloud/Advanced
- [SSH Tunnel Setup](POWERBI_FRESH_START.md) - For Secure Remote

---

## 🎉 Status

✅ ALL CONNECTION METHODS TESTED & WORKING  
✅ CSV DOWNLOAD READY  
✅ DIRECT DATABASE WORKING  
✅ API ENDPOINTS LIVE  
✅ READY FOR POWER BI  

**Choose your method and start creating dashboards now!** 🚀

---

**Last Updated:** March 16, 2026  
**All Methods:** ✅ OPERATIONAL
