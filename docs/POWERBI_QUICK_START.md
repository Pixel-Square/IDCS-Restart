# Power BI Dashboard - Quick Start Guide

## 🎯 What's New

Your Power BI dashboard can now connect using a **secure REST API** instead of direct database access. This works through standard HTTPS (port 443) which is available everywhere - no firewall issues!

---

## 📊 Quick Connection Steps for Power BI User

### Step 1: Get Your API Token

**Using curl (Terminal/PowerShell):**
```bash
curl -X POST https://db.krgi.co.in/api/accounts/token/ \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"your_username\", \"password\": \"your_password\"}"
```

**Response** (save the `access` token):
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ..."
}
```

---

### Step 2: Test Connection (Optional)

**Windows PowerShell:**
```powershell
$token = "your_access_token_here"
$headers = @{ Authorization = "Bearer $token" }
$response = Invoke-RestMethod -Uri "https://db.krgi.co.in/api/bi/students/?limit=10" -Headers $headers
$response.results | Format-Table
```

**Result**: Should show 10 student records ✅

---

### Step 3: Connect in Power BI Desktop

#### **Method A: Using Web Connector (Easiest)**

1. **File** → **Get Data** → **Web**
2. **URL**: 
   ```
   https://db.krgi.co.in/api/bi/students/?limit=10000
   ```
3. **Click OK** → A dialog appears for authentication
4. Select **Custom** and paste:
   ```
   Authorization: Bearer YOUR_ACCESS_TOKEN
   ```
5. Click **Connect**

#### **Method B: Using Power Query (Advanced)**

1. **Get Data** → **Web**
2. **URL**: `https://db.krgi.co.in/api/bi/students/`
3. In the editor, edit the query:

```powerquery
let
    Token = "eyJ0eXAi...",  // Your access token
    Source = Json.Document(Web.Contents(
        "https://db.krgi.co.in/api/bi/students/?limit=10000",
        [Headers = [Authorization = "Bearer " & Token]]
    )),
    Data = Source[results],
    Table = Table.FromRecords(Data)
in
    Table
```

---

## 📚 Available Data Endpoints

### Students Endpoint
```
https://db.krgi.co.in/api/bi/students/
```
**Fields**: student_id, reg_no, name, email, batch, course, department, status
**Filters**: dept_code, batch_name, course_name, status

**Example:**
```
https://db.krgi.co.in/api/bi/students/?dept_code=CSE&batch_name=2024
```

### Subjects Endpoint
```
https://db.krgi.co.in/api/bi/subjects/
```
**Fields**: subject_id, code, name, semester, course, department

### Teaching Assignments Endpoint
```
https://db.krgi.co.in/api/bi/teaching-assignments/
```
**Fields**: staff info, subject, academic year, section

### Marks/Grades Endpoint
```
https://db.krgi.co.in/api/bi/marks/
```
**Fields**: student marks, components, assessments

---

## 🔑 Token Management

### Token Expires After 60 Minutes

**Get a new token when it expires:**
```bash
curl -X POST https://db.krgi.co.in/api/accounts/token/refresh/ \
  -H "Content-Type: application/json" \
  -d "{\"refresh\": \"your_refresh_token\"}"
```

---

## 📈 Full Data Export Examples

### Export All Students to CSV

**Python:**
```python
import requests
import pandas as pd

token = "your_access_token"
headers = {"Authorization": f"Bearer {token}"}
url = "https://db.krgi.co.in/api/bi/students/?limit=10000"

response = requests.get(url, headers=headers)
students = response.json()['results']

df = pd.DataFrame(students)
df.to_csv('students.csv', index=False)
print(f"Exported {len(students)} students")
```

### Export by Department

```python
url = "https://db.krgi.co.in/api/bi/students/?dept_code=CSE&limit=10000"
response = requests.get(url, headers=headers)
students = response.json()['results']
```

---

## 🌐 Database Connection Comparison

### ❌ OLD Way (Direct PostgreSQL)
```
Server: localhost:6432
Database: college_erp
User: erp_user
Issue: Cloudflare blocks port 6432 ❌
```

### ✅ NEW Way (REST API)
```
URL: https://db.krgi.co.in/api/bi/
Port: 443 (HTTPS - always available)
Auth: JWT Bearer Token
Works Everywhere: ✅
```

---

## ✨ Benefits of REST API

✅ **Works from anywhere** - No port blocking  
✅ **Secure authentication** - JWT tokens  
✅ **Public internet ready** - Through HTTPS  
✅ **Filtered queries** - Reduced data transfer  
✅ **Pagination** - Efficient for large datasets  
✅ **No VPN/SSH tunnel needed**  

---

## 📋 Troubleshooting

### "Unauthorized" Error
```
❌ Authorization: Bearer invalid_token
✅ Get new token: POST /api/accounts/token/
```

### "Connection Refused" 
```
❌ Trying port 6432: db.krgi.co.in:6432
✅ Use HTTPS endpoint: https://db.krgi.co.in/api/bi/
```

### "Rate Limit Exceeded"
```
✅ Wait a few minutes before retrying
✅ Use pagination with limit parameter
```

### Empty Results
```
✅ Check filters are correct
✅ Try without filters first:
   https://db.krgi.co.in/api/bi/students/?limit=10
```

---

## 📖 Full Documentation

For complete documentation including:
- All query parameters
- Response formats
- Error codes
- Advanced filtering
- Performance tips

👉 See: `docs/POWERBI_API_SETUP.md`

---

## 🚀 Next Steps

1. **Get your access token** from admin
2. **Test the endpoints** using provided URLs
3. **Connect in Power BI** using Web connector
4. **Create your dashboard** using the data endpoints

---

## 💬 Support

**API Status Check:**
```bash
curl https://db.krgi.co.in/api/bi/students/?limit=1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: 200 OK response with student data

---

## 📞 Contact

For API access or issues:
- Ask admin for: Username & password for API access
- Request: API token
- Share: Your Power BI requirements

---

**Share this guide with your Power BI team!** 📊
