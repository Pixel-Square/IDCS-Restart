# Power BI - Direct PostgreSQL Connection Guide

**Alternative Method: Connect Directly to Database**

---

## 🗄️ Database Connection Details

```
Database: college_erp
Server: localhost (via tunnel) OR 192.168.40.253 (direct)
Port: 6432 (via PgBouncer) OR 5432 (direct)
Username: erp_user
Password: erp_root
```

---

## 🎯 For Local Network Users (Same LAN)

If you're on the **same network** as the database server:

### Power BI Connection:

1. **Home** → **Get Data** → **PostgreSQL database**

2. **Enter Details:**
   ```
   Server: 192.168.40.253
   Database: college_erp
   ```

3. **Click OK** → Enter Credentials:
   ```
   Username: erp_user
   Password: erp_root
   ```

4. **Connect** → Select tables and load!

✅ **Done! Direct database connection.**

---

## 🔌 For Remote Users (Different Network)

### Use SSH Tunnel Method

#### **Windows - Using PuTTY**

1. **Download PuTTY:** https://www.putty.org/

2. **Configure Connection:**
   - Host: `192.168.40.253`
   - Port: `22`
   - Go to **Connection → SSH → Tunnels**
   - Local port: `6432`
   - Destination: `localhost:5432`
   - Click **Add**

3. **Open Connection** → Login

4. **Keep PuTTY window open**

5. **In Power BI:**
   ```
   Server: localhost
   Port: 6432
   Database: college_erp
   Username: erp_user
   Password: erp_root
   ```

#### **Mac/Linux - SSH Command**

```bash
ssh -L 6432:localhost:5432 user@192.168.40.253
```

Then in Power BI:
```
Server: localhost:6432
Database: college_erp
```

---

## 📊 PostgreSQL Available Tables

### BI Dimension Tables (Read-Only)
```
bi_dim_student
bi_dim_subject
bi_dim_teaching_assignment
bi_fact_mark
```

### Query Example in Power BI

```sql
SELECT * FROM bi_dim_student LIMIT 100
```

---

## ⚙️ Power BI Native PostgreSQL Connector

### Advanced: Using Power Query

1. **Get Data** → **PostgreSQL database**

2. **Server & Database**

3. **Advanced Options** → SQL Statement:
   ```sql
   SELECT 
       student_id, 
       reg_no, 
       first_name, 
       last_name, 
       email, 
       batch_name, 
       course_name, 
       dept_code,
       status
   FROM bi_dim_student
   WHERE status = 'ACTIVE'
   LIMIT 10000
   ```

4. **Load**

---

## 🔐 Security Notes

⚠️ **For Production:**
- Never use default credentials
- Change `erp_root` to strong password
- Use SSH tunnels for remote access
- Enable SSL/TLS on connections
- Restrict network access with firewall

---

## 🆚 Comparison: Methods

| Method | Setup | Security | Performance |
|--------|-------|----------|-------------|
| **CSV Download** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Direct Local** | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **SSH Tunnel** | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **REST API** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 📞 Troubleshooting

| Error | Fix |
|-------|-----|
| Connection refused | Server not running or firewall blocking |
| Invalid credentials | Check username/password |
| Timeout | Network issue or SSH tunnel not open |
| "unsupported frontend protocol" | Wrong port (use 5432 or 6432) |

---

## 🎨 Query Examples for Power BI

### Get Students by Department
```sql
SELECT * FROM bi_dim_student WHERE dept_code = 'CSE'
```

### Get Active Teaching Assignments
```sql
SELECT * FROM bi_dim_teaching_assignment WHERE is_active = true
```

### Join Student with Assignment
```sql
SELECT 
    s.first_name,
    s.email,
    ta.subject_name,
    ta.academic_year
FROM bi_dim_student s
JOIN bi_dim_teaching_assignment ta ON s.student_id = ta.staff_profile_id
```

---

## 📋 Configuration Checklist

- [ ] Network connection to database server confirmed
- [ ] PostgreSQL port accessible (5432 or 6432)
- [ ] SSH tunnel open (if required)
- [ ] Credentials verified (erp_user / erp_root)
- [ ] Power BI PostgreSQL connector installed
- [ ] Test query successful
- [ ] Data loading in Power BI

---

## ✅ Direct Local Connection Setup

**Best for:** Users on same network

```
Step 1: Power BI → Get Data → PostgreSQL
Step 2: Server = 192.168.40.253, Database = college_erp
Step 3: Username = erp_user, Password = erp_root
Step 4: Select BI tables → Load
Step 5: Create visualizations!
```

---

## 🚀 Recommended Approach

**For your setup:**
1. **Local Users**: Use Direct Connection above
2. **Remote Users**: Use CSV Download Method  
3. **Power BI Cloud**: Use REST API Method

---

**Choose the method that works for your network setup!** 🎯
