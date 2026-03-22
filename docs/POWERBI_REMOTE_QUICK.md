# Power BI - Remote Device Connection Instructions

**Share this with the person connecting from another device**

---

## 📋 What You'll Receive from Server Admin

- ✅ API Endpoint: `https://db.krgi.co.in/api/bi/`
- ✅ Access Token: (Long JWT token)
- ✅ Username: `iqac@krct.ac.in`
- ✅ Password: `Iqac@2024`

---

## 🎯 3-Minute Setup

### **1. Open Power BI Desktop**

Download from: https://powerbi.microsoft.com/desktop

Click: **File** → **New**

---

### **2. Get Data**

Click: **Get Data** (Home ribbon top)

---

### **3. Select Web**

Search for **Web** and click

---

### **4. Enter URL**

Paste this URL:
```
https://db.krgi.co.in/api/bi/students/?limit=10000
```

Click **OK**

---

### **5. Authenticate**

When prompted:
- Select: **Custom**
- Paste the **Access Token** you received

Click **Connect**

---

### **6. Transform Data**

In Power Query Editor:
- Click the table icon next to `[results]`
- Click **Convert to Table**
- Click the expand arrow
- Select all columns → **OK**

Click **Close & Apply**

---

## ✅ Done!

Your data is now loaded in Power BI. Create visualizations:

- Pie chart: Students by department
- Bar chart: Students per batch
- Table: All student records
- Cards: Total counts

---

## 📊 Other Data Sources

Add more queries for:

| Name | URL |
|------|-----|
| Subjects | `https://db.krgi.co.in/api/bi/subjects/?limit=10000` |
| Staff | `https://db.krgi.co.in/api/bi/teaching-assignments/?limit=10000` |
| Marks | `https://db.krgi.co.in/api/bi/marks/?limit=10000` |

Repeat steps 2-6 for each.

---

## ⚠️ Token Expires in 60 Minutes

If data stops loading:
1. Get new token from server admin
2. Refresh Power BI (Ctrl + Shift + R)
3. Enter new token when prompted

---

## 🎨 Create Dashboard

Combine multiple data sources:

**Dashboard Ideas:**
- Student demographics (by dept, batch, course)
- Subject curriculum (by semester)
- Staff workload (assignments per faculty)
- Academic performance (marks distribution)

---

## 📞 Troubleshooting

| Issue | Fix |
|-------|-----|
| Can't connect | Check internet connection |
| "Unauthorized" | Token expired - get new one |
| No data | Try without filters first |
| Messy display | Make sure to convert JSON to table |

---

**Questions? Ask admin for the full setup guide:** `POWERBI_FRESH_START.md`

---

**Start building dashboards now!** 🚀
