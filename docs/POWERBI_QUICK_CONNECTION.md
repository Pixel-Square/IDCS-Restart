# IMMEDIATE: Power BI PostgreSQL Connection Setup

## ✅ Your Server Status: READY

✓ PostgreSQL listening on **0.0.0.0:5432** (all addresses)  
✓ PgBouncer listening on **0.0.0.0:6432** (all addresses)  
✓ Firewall port 6432 **OPEN** to Anywhere  
✓ SSH Active on port 22  

---

## 📋 INFORMATION TO PROVIDE TO OTHER USER

### Option A: Use Direct Connection (RECOMMENDED FOR YOUR SETUP)

**Connection Details for Power BI Desktop:**
```
Server:      YOUR_SERVER_IP          |  Ask: What's your public IP?
Port:        5432                    |  (or 6432 if using pgbouncer)
Database:    college_erp
Username:    erp_user
Password:    erp_root
```

**Steps for Other User:**
1. Open **Power BI Desktop**
2. Click **Get Data** → Search **PostgreSQL Database**
3. Enter:
   - Server: `YOUR_SERVER_IP` (get your public IP first)
   - Database: `college_erp`
4. When prompted for credentials:
   - Username: `erp_user`
   - Password: `erp_root`
5. Click **Direct Query** (for live data) or **Import** (for snapshot)

---

### Option B: Use SSH Tunnel (More Secure)

If other user wants SSH tunneling:

**For them to setup (Mac/Linux):**
```bash
ssh -L 5432:localhost:5432 iqac@YOUR_SERVER_IP
# Keep this open while using Power BI
# Then in Power BI, use: localhost:5432
```

**For them to setup (Windows with PuTTY):**
1. Download PuTTY
2. Hostname: `YOUR_SERVER_IP`
3. Go to Connection → SSH → Tunnels
4. Source port: `5432`
5. Destination: `localhost:5432`
6. Click Add and Connect

---

## 🔍 FIND YOUR PUBLIC IP

Run this command to get your server's IP address:

```bash
curl -s https://api.ipify.org
```

Or from the terminal:

```bash
hostname -I
```

Look for external/public IP (not 127.0.0.1 or 192.168.x.x if they're on different network)

---

## 🛡️ SECURITY: Create Dedicated Read-Only User (OPTIONAL but RECOMMENDED)

If you want to avoid exposing the main `erp_user` credentials:

```bash
sudo -u postgres psql -d college_erp

-- Run inside psql:
CREATE USER powerbi_readonly WITH PASSWORD 'PowerBI@Secure123';
GRANT CONNECT ON DATABASE college_erp TO powerbi_readonly;
GRANT USAGE ON SCHEMA public TO powerbi_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powerbi_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO powerbi_readonly;

-- Verify:
\du

-- Then in Power BI, use:
-- Username: powerbi_readonly
-- Password: PowerBI@Secure123
```

---

## 📊 AVAILABLE TABLES IN college_erp

To see what tables the user can access:

```bash
sudo -u postgres psql -d college_erp -c "\dt"
```

Or from Power BI, after connecting it will show all available tables.

---

## ❌ TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| "Connection refused" | Verify port 5432 is open: `sudo ufw allow 5432` |
| "Authentication failed" | Check username/password are correct. Test locally: `psql -h YOUR_IP -U erp_user -d college_erp` |
| "Connection timeout" | Firewall may be blocking. Run: `sudo ufw allow in from any to any port 5432` |
| "Host not found" | Use correct IP address (not localhost). Run: `hostname -I` |
| "Network unreachable" | Check both machines are on same network or use public IP |

**Test connection locally first:**
```bash
psql -h 192.168.40.253 -p 5432 -U erp_user -d college_erp
# or with pgbouncer:
psql -h 192.168.40.253 -p 6432 -U erp_user -d college_erp
```

---

## 📝 CHECKLIST

- [ ] Get your public IP: `curl -s https://api.ipify.org`
- [ ] Decide: Direct connection or SSH tunnel?
- [ ] (Optional) Create `powerbi_readonly` user
- [ ] Provide other user with:
  - [ ] Server IP
  - [ ] Port (5432 or 6432)
  - [ ] Database name: college_erp
  - [ ] Username + Password
  - [ ] Connection method (Direct/SSH)
- [ ] Have other user test connection from Power BI Desktop

---

## 🔗 TESTING CONNECTION STRING

Use this to test before sharing with other user:

```bash
# Test with erp_user
psql "host=192.168.40.253 port=5432 user=erp_user password=erp_root dbname=college_erp"

# Test with pgbouncer (recommended, better performance)
psql "host=192.168.40.253 port=6432 user=erp_user password=erp_root dbname=college_erp"
```

If you see `college_erp=>` prompt, connection is working!

