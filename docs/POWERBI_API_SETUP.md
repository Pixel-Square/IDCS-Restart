# Power BI REST API - Setup & Usage Guide

## Overview

Secure REST API for Power BI data access that works through HTTPS (port 443) - no need for SSH tunneling or custom ports.

---

## API Endpoints

All endpoints require **JWT Bearer Token** authentication and are read-only (suitable for Power BI).

### Base URL
```
https://db.krgi.co.in/api/bi/
```

### Endpoints

#### 1. Students Dimension
```
GET /api/bi/students/                    - List all students (paginated)
GET /api/bi/students/{id}/               - Get specific student
GET /api/bi/students/summary/             - Get student summary statistics
```

**Query Parameters:**
- `search`: Search by name, username, email, reg_no
- `dept_code`: Filter by department code
- `batch_name`: Filter by batch name
- `course_name`: Filter by course name
- `status`: Filter by status
- `ordering`: Order by field (e.g., `first_name`, `-batch_name`)

**Example:**
```
GET /api/bi/students/?dept_code=CSE&batch_name=2024&search=john
GET /api/bi/students/summary/
```

#### 2. Subjects Dimension
```
GET /api/bi/subjects/                    - List all subjects
GET /api/bi/subjects/{id}/               - Get specific subject
```

**Query Parameters:**
- `search`: Search by subject_code, subject_name, course_name
- `semester_no`: Filter by semester
- `course_name`: Filter by course
- `dept_code`: Filter by department

**Example:**
```
GET /api/bi/subjects/?semester_no=4&course_name=B.Tech
```

#### 3. Teaching Assignments
```
GET /api/bi/teaching-assignments/        - List all assignments
GET /api/bi/teaching-assignments/{id}/   - Get specific assignment
```

**Query Parameters:**
- `search`: Search by staff name, subject name
- `is_active`: Filter by status (true/false)
- `academic_year`: Filter by academic year
- `dept_code`: Filter by department

**Example:**
```
GET /api/bi/teaching-assignments/?is_active=true&academic_year=2025-26
```

#### 4. Mark Facts
```
GET /api/bi/marks/                       - List all marks
GET /api/bi/marks/{id}/                  - Get specific mark record
```

**Query Parameters:**
- `source_table`: Filter by source table
- `component_key`: Filter by component key

---

## Authentication

All requests require JWT Bearer Token in the `Authorization` header.

### Step 1: Get JWT Token

```bash
curl -X POST https://db.krgi.co.in/api/accounts/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

**Response:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

Save the `access` token.

### Step 2: Use Token in Requests

```bash
curl -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..." \
  https://db.krgi.co.in/api/bi/students/
```

### Token Expiry

- **Access Token**: Valid for 60 minutes (default)
- **Refresh Token**: Use to get a new access token when expired

**Refresh Token:**
```bash
curl -X POST https://db.krgi.co.in/api/accounts/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{"refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."}'
```

---

## Power BI Setup

### Method 1: Power BI Web Connector

1. **In Power BI Desktop:**
   - **Get Data** → **Web**

2. **Configure Connection:**
   - **URL**: `https://db.krgi.co.in/api/bi/students/?format=json`
   - Click **OK**

3. **Authentication:**
   - Select **Web API**
   - For advanced: Use **Basic** or **Custom** with Bearer token

### Method 2: Power BI Web Content Connector (Recommended)

1. **Create Parameter for Base URL:**
   ```
   Power Query Editor → Home → New Source → Blank Query
   
   Content = 
   let
       Token = "your_jwt_access_token_here",
       BaseUrl = "https://db.krgi.co.in/api/bi",
       Headers = [Authorization = "Bearer " & Token],
       Source = ...
   in
       Source
   ```

2. **Load Student Data:**
   ```
   let
       Token = "eyJ0eXAi...",
       BaseUrl = "https://db.krgi.co.in/api/bi",
       Headers = [Authorization = "Bearer " & Token],
       Url = BaseUrl & "/students/?limit=10000",
       Source = Json.Document(Web.Contents(Url, [Headers = Headers])),
       Data = Source[results],
       Table = Table.FromList(Data, Splitter.SplitByNothing(), null, null, ExtraValues.Error)
   in
       Table
   ```

### Method 3: Direct REST API Call

**Using curl to export data:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://db.krgi.co.in/api/bi/students/?limit=10000&format=json" \
  > students.json
```

---

## Response Format

### List Response (Paginated)
```json
{
  "count": 453,
  "next": "https://db.krgi.co.in/api/bi/students/?page=2",
  "previous": null,
  "results": [
    {
      "student_id": 1,
      "reg_no": "CSE001",
      "username": "john_doe",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@college.edu",
      "batch_name": "2024",
      "course_name": "B.Tech",
      "dept_code": "CSE",
      "dept_name": "Computer Science",
      "status": "active",
      ...
    },
    ...
  ]
}
```

### Pagination
- Default page size: 50 items
- Add `?limit=100&offset=0` to customize

---

## Python Example

```python
import requests
import json

# Step 1: Get JWT Token
auth_url = "https://db.krgi.co.in/api/accounts/token/"
auth_data = {
    "username": "your_username",
    "password": "your_password"
}
auth_response = requests.post(auth_url, json=auth_data)
token = auth_response.json()['access']

# Step 2: Query Students
headers = {"Authorization": f"Bearer {token}"}
students_url = "https://db.krgi.co.in/api/bi/students/?limit=1000"
response = requests.get(students_url, headers=headers)
students = response.json()['results']

# Save as CSV
import pandas as pd
df = pd.DataFrame(students)
df.to_csv('students.csv', index=False)
```

---

## Pagination & Performance

### Large Datasets

For efficient data retrieval:

```bash
# Get first 1000 students
curl -H "Authorization: Bearer TOKEN" \
  "https://db.krgi.co.in/api/bi/students/?limit=1000&offset=0"

# Get next batch
curl -H "Authorization: Bearer TOKEN" \
  "https://db.krgi.co.in/api/bi/students/?limit=1000&offset=1000"
```

### Filtering for Performance

Always filter when possible:

```bash
# Instead of getting all students, filter by department
curl -H "Authorization: Bearer TOKEN" \
  "https://db.krgi.co.in/api/bi/students/?dept_code=CSE&limit=1000"
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Invalid token or token expired"
}
```
**Solution**: Get a new access token using refresh token.

### 403 Forbidden
```json
{
  "detail": "You do not have permission to perform this action"
}
```
**Solution**: User doesn't have permission to access BI data.

### 404 Not Found
```json
{
  "detail": "Not found"
}
```
**Solution**: Invalid ID or endpoint.

### 429 Too Many Requests
**Solution**: Rate limit exceeded. Wait before trying again.

---

## Best Practices

✅ **DO:**
- Use filters to reduce data transfer
- Cache token locally and refresh when needed
- Limit results with `limit` parameter
- Use pagination for large datasets
- Keep tokens secure

❌ **DON'T:**
- Expose tokens in code
- Request all records without filters
- Store passwords in plain text
- Refresh token every request

---

## Data Availability

- **Students**: Daily update (includes active & inactive)
- **Subjects**: Updated during curriculum changes
- **Teaching Assignments**: Updated per academic year
- **Marks**: Real-time from evaluations

---

## Support & Troubleshooting

### Connection Errors
- Verify `https://db.krgi.co.in` is accessible
- Check firewall settings (HTTPS port 443 must be open)
- Ensure token hasn't expired

### Slow Queries
- Use filters to reduce result set
- Request fewer fields with `?fields=id,name`
- Cache results locally

### Authentication Issues
- Verify username/password are correct
- Check token expiry (60 minutes default)
- Refresh token if expired

---

## Example Power BI Query Scripts

### Get All Students CSV
```powerquery
let
    Token = "YOUR_ACCESS_TOKEN",
    Source = Json.Document(Web.Contents(
        "https://db.krgi.co.in/api/bi/students/?limit=10000",
        [Headers = [Authorization = "Bearer " & Token]]
    )),
    Data = Source[results],
    Table = Table.FromRecords(Data)
in
    Table
```

### Get Students by Department
```powerquery
let
    Token = "YOUR_ACCESS_TOKEN",
    DeptCode = "CSE",
    Source = Json.Document(Web.Contents(
        "https://db.krgi.co.in/api/bi/students/?dept_code=" & DeptCode & "&limit=10000",
        [Headers = [Authorization = "Bearer " & Token]]
    )),
    Data = Source[results],
    Table = Table.FromRecords(Data)
in
    Table
```

---

## API Status Check

```bash
curl -H "Authorization: Bearer TOKEN" \
  https://db.krgi.co.in/api/bi/students/?limit=1

# Expected response: 200 OK with a single student record
```

---

## Migration from Direct DB to API

**Before (Direct PostgreSQL):**
```
Host: localhost
Port: 6432
(Now blocked by Cloudflare)
```

**After (REST API):**
```
URL: https://db.krgi.co.in/api/bi/
Authentication: JWT Bearer Token
Port: 443 (HTTPS standard)
```

No more firewall/port issues! 🎉
