# Power BI PostgreSQL Connection - Complete Setup

## ✅ YOUR SERVER CONFIGURATION (VERIFIED)

**Status:** Network fully configured and ready for external connections

### Server Network Details
```
Local Server IPs:      192.168.40.253
                       192.168.67.136
                       10.144.49.28
                       
Public IP:             115.244.249.218
                       
SSH Port:              22 (OPEN)
PostgreSQL Port:       5432 (OPEN - LISTENING 0.0.0.0)
PgBouncer Port:        6432 (OPEN - LISTENING 0.0.0.0)
Firewall:              UFW Active - All required ports allowed
```

### Database Details
```
Database Name:         college_erp
Database User:         erp_user
Database Password:     erp_root (from .env)
Port Option 1:         5432 (direct PostgreSQL)
Port Option 2:         6432 (pgbouncer - recommended for stability)
```

---

## 👥 INFORMATION TO SHARE WITH OTHER USER

### For Direct Power BI Connection

**User A should use these credentials in Power BI Desktop:**

```
Server (Host):    115.244.249.218          (your public IP)
Port:             5432 or 6432             (pgbouncer recommended)
Database:         college_erp
Username:         erp_user
Password:         erp_root
Connection Type:  DirectQuery (for live data)
                  or Import (for snapshot)
```

### Step-by-Step for Other User (Power BI Desktop)

1. **Open Power BI Desktop**
2. **Click: Get Data** → Search for **"PostgreSQL"**
3. **Click: PostgreSQL Database**
4. **Enter Connection Details:**
   - Server: `115.244.249.218`
   - Database: `college_erp`
   - Click **OK**
5. **Authentication:**
   - Username: `erp_user`
   - Password: `erp_root`
   - ✓ Check "No password only"  (if needed)
   - Click **Connect**
6. **Select Tables:** Choose tables needed from Navigator
7. **Click: Load** or **Transform Data** as needed

---

## 🔒 SECURITY RECOMMENDATION: Create Dedicated Power BI User

**Instead of sharing main credentials**, create a read-only user:

```bash
sudo -u postgres psql -d college_erp
```

Then run (inside the pgSQL prompt):

```sql
-- Create read-only user
CREATE USER powerbi_user WITH PASSWORD 'PowerBI@Secure2024';

-- Grant necessary permissions
GRANT CONNECT ON DATABASE college_erp TO powerbi_user;
GRANT USAGE ON SCHEMA public TO powerbi_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powerbi_user;

-- Make future tables accessible too
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powerbi_user;

-- Verify
\du
\q
```

Then share with other user:
```
Username: powerbi_user
Password: PowerBI@Secure2024
```

---

## 🧪 TESTING - Verify Before Sharing

**Test from your terminal:**

```bash
# Direct connection to PostgreSQL
psql -h 115.244.249.218 -p 5432 -U erp_user -d college_erp

# Or via pgbouncer (pooler)
psql -h 115.244.249.218 -p 6432 -U erp_user -d college_erp
```

If successful, you'll see: `college_erp=>`

**List tables accessible:**
```bash
psql -h 115.244.249.218 -p 5432 -U erp_user -d college_erp -c "\dt"
```

---

## 🌐 Connection Methods Summary

| Method | Best For | Setup Difficulty | Security |
|--------|----------|------------------|----------|
| **Direct (5432)** | Same network, fast access | ✓ Easy | ⭐⭐⭐ |
| **Direct (6432)** | External, stable, pooled | ✓ Easy | ⭐⭐⭐ |
| **SSH Tunnel** | Max security, any network | ⭐⭐ Medium | ⭐⭐⭐⭐⭐ |

---

## ⚠️ TROUBLESHOOTING FOR OTHER USER

| Error | Cause | Fix |
|-------|-------|-----|
| "Connection refused" | Port not open / PostgreSQL down | Check if server IP is correct, try public IP |
| "Host not reachable" | Network blocked | Check firewall, try SSH tunnel |
| "Invalid authentication" | Wrong credentials | Verify username/password match |
| "Connection timeout" | Takes too long | Try port 6432 instead (pgbouncer faster) |
| "Could not resolve hostname" | DNS issue | Use IP address instead of hostname |

---

## 📋 CHECKLIST BEFORE SHARING

- [ ] Verify other user has internet/network access to 115.244.249.218
- [ ] Test connection locally: `psql -h 115.244.249.218 -p 5432 -U erp_user -d college_erp`
- [ ] Confirm firewall allows port 5432 and 6432: `sudo ufw status`
- [ ] Decide: Use erp_user or create dedicated powerbi_user
- [ ] Share correct server IP, port, username, password
- [ ] Provide these instructions to the other user
- [ ] Have them test connection before creating Power BI reports

---

## 🔗 ALTERNATIVE: SSH Tunnel (If Direct Connection Doesn't Work)

**If other user prefers SSH tunnel for max security:**

### For Mac/Linux User:
```bash
ssh -L 5432:localhost:5432 -N iqac@115.244.249.218
# Keep this open while using Power BI
# Then in Power BI connect to: localhost:5432
```

### For Windows User (PuTTY):
1. Download PuTTY
2. Session:
   - Host Name: `115.244.249.218`
   - Port: `22`
3. Connection > SSH > Tunnels:
   - Source port: `5432`
   - Destination: `localhost:5432`
   - Click **Add**
4. Connection > Data:
   - Auto-login username: `iqac`
5. Session > Save: `PostgreSQL-Tunnel`
6. Click **Open**
7. Enter SSH password when prompted
8. In Power BI:
   - Server: `localhost`
   - Port: `5432`
   - Database: `college_erp`

---

## 📝 EXAMPLE POWER BI CONNECTION STRING

```
postgresql://erp_user:erp_root@115.244.249.218:5432/college_erp
```

Or with pgbouncer:
```
postgresql://erp_user:erp_root@115.244.249.218:6432/college_erp
```

---

## 🚀 NEXT STEPS

1. **Run the security setup** (create dedicated powerbi_user)
2. **Test the connection** from your terminal
3. **Provide credentials** to other user with this document
4. **Have them test** in Power BI before creating dashboards
5. **Monitor access** with:
   ```bash
   sudo -u postgres psql -d college_erp -c "SELECT * FROM pg_stat_activity;"
   ```

