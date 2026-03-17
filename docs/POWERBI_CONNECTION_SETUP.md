# Power BI Dashboard - Database Connection Setup

## Server Connection Details

### Production Server
- **Server Domain (API)**: `https://db.krgi.co.in`
- **Frontend URL**: `https://idcs.krgi.co.in`
- **Alternative IP**: `192.168.40.253`

### Database Connection

**Database Type**: PostgreSQL

#### Connection Parameters:
```
Host: localhost
Port: 6432
Database Name: college_erp
Username: erp_user
Password: erp_root
```

#### PostgreSQL Connection String:
```
Server=localhost;Port=6432;Database=college_erp;User Id=erp_user;Password=erp_root;
```

#### Connection String for Tools:
```
postgresql://erp_user:erp_root@localhost:6432/college_erp
```

---

## Power BI Connection Setup

### Method 1: Direct PostgreSQL Connection

1. **In Power BI Desktop**:
   - Go to `Get Data` → `PostgreSQL database`
   - Enter connection details:
     - **Server**: `localhost`
     - **Database**: `college_erp`
     - Click `OK`

2. **Authentication**:
   - When prompted, use:
     - **Username**: `erp_user`
     - **Password**: `erp_root`

### Method 2: Import Data via API

The backend provides REST API endpoints for data access:
- **API Base URL**: `https://db.krgi.co.in`
- **Authentication**: JWT Token-based

1. **Get JWT Token**:
   ```bash
   curl -X POST https://db.krgi.co.in/api/accounts/token/ \
     -H "Content-Type: application/json" \
     -d '{"username": "your-username", "password": "your-password"}'
   ```

2. **Use Bearer Token in Power BI**:
   - Web connector with `Authorization: Bearer <token>`

---

## Available BI Models & Tables

### Main BI Dimension Tables:
- `bi_dim_student` - Student dimension (ID, names, batch, course, department)
- `bi_dim_subject` - Subject dimension (subject code, name, semester, course)
- `bi_fact_*` - Various fact tables for analytics

### Power BI Portal Models:
- `Sheet` - Data sheets available for Power BI consumption
- `SheetColumn` - Column definitions and metadata
- `PowerBIExportLog` - Export audit log

---

## Firewall & Network Configuration

**If connecting from external location:**

1. **Ensure port 6432 is open** for PostgreSQL access
2. **Use VPN or SSH tunnel** if direct connection not available:
   ```bash
   ssh -L 6432:localhost:6432 user@192.168.40.253
   ```
3. **Whitelist your IP** in server firewall rules

---

## Power BI Service (Cloud) Setup

For Power BI Service (Online Dashboard):

1. **Install On-Premises Gateway**:
   - Download: [Power BI Gateway](https://powerbi.microsoft.com/en-us/gateway/)
   - Configure to connect to `localhost:6432`

2. **Create Gateway Connection**:
   - Add `college_erp` PostgreSQL datasource
   - Test connection with credentials above

---

## Security Best Practices

⚠️ **Important**: 
- Change default credentials from `erp_root` to a strong password before production
- Update `.env` file with new credentials
- Restart Django backend after credential changes
- Use VPN/Secure tunnel for remote Power BI connections
- Enable SSL/TLS encryption for all database connections

---

## Sharing Credentials

**For sharing with Power BI analysts**:

```
PostgreSQL Connection:
├── Server: localhost (or reach via VPN)
├── Port: 6432
├── Database: college_erp
├── Username: erp_user
├── Password: [PROVIDE SECURELY]
└── Connection String: postgresql://erp_user:erp_root@localhost:6432/college_erp

API Endpoint: https://db.krgi.co.in
Frontend: https://idcs.krgi.co.in
```

---

## Troubleshooting

### Connection Refused
- Verify PostgreSQL is running on port 6432
- Check firewall rules
- Confirm host/port in connection string

### Authentication Failed
- Verify username/password in `.env` file
- Check role permissions in PostgreSQL
- Ensure user has access to `college_erp` database

### Timeout Issues
- Increase connection timeout (default: 5 seconds)
- Check network latency
- Consider using on-premises gateway for Power BI Service

---

## Support & Documentation

- **Backend Repo**: `/backend/erp/settings.py`
- **BI App**: `/backend/bi/models.py`
- **Power BI Portal**: `/backend/powerbi_portal/`
- **API Base**: `https://db.krgi.co.in`
