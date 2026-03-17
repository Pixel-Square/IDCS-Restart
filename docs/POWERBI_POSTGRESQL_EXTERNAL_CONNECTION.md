# Power BI Desktop - External PostgreSQL Connection Guide

## Your Current Database Configuration

```
Database: college_erp
Host: localhost
Port: 6432
User: erp_user
Password: erp_root
```

---

## Problem Statement

✗ Other user's laptop is on **different network** (no SSH/VPN access)
✗ Cannot directly access local PostgreSQL database
✗ Need secure connection method for Power BI Desktop

---

## Solution Options

### **Option 1: SSH Tunnel (RECOMMENDED - Most Secure)**

#### Requirements:
- SSH access to your server enabled
- SSH credentials/key pair
- User's laptop has SSH client (built-in on Mac/Linux, PuTTY on Windows)

#### Steps for Other User:

**Windows (PuTTY):**
1. Download & Install PuTTY
2. In PuTTY SSH Settings:
   - Host: `<YOUR_SERVER_IP>`
   - Protocol: SSH
   - Auth: Add private key file
3. In Connection → SSH → Tunnels:
   - Source port: `6432`
   - Destination: `localhost:6432`
   - Click "Add"
4. Connect (keep PuTTY open)
5. In Power BI:
   - Server: `localhost`
   - Port: `6432`

**Mac/Linux Terminal:**
```bash
ssh -L 6432:localhost:6432 your_user@YOUR_SERVER_IP
# Keep this terminal running while using Power BI
```

#### Action Required NOW:
- [ ] Verify SSH is running: `sudo systemctl status ssh`
- [ ] Get SSH public key from other user
- [ ] Add to `/home/iqac/.ssh/authorized_keys`
- [ ] Provide them: Server IP + SSH credentials

---

### **Option 2: Expose PostgreSQL Directly (LESS SECURE)**

#### Steps:

1. **Edit PostgreSQL Configuration:**
   ```bash
   sudo nano /etc/postgresql/*/main/postgresql.conf
   ```
   - Find: `#listen_addresses = 'localhost'`
   - Change to: `listen_addresses = '*'`
   - Save (Ctrl+X, Y, Enter)

2. **Edit PostgreSQL Client Authentication:**
   ```bash
   sudo nano /etc/postgresql/*/main/pg_hba.conf
   ```
   - Add at the end:
   ```
   host    college_erp    erp_user    0.0.0.0/0    md5
   ```

3. **Restart PostgreSQL:**
   ```bash
   sudo systemctl restart postgresql
   ```

4. **Verify Port is Open:**
   ```bash
   sudo ufw allow 6432/tcp
   sudo ufw status
   ```

5. **Provide to Other User:**
   - Server IP: `<YOUR_PUBLIC_IP>`
   - Port: `6432`
   - Database: `college_erp`
   - Username: `erp_user`
   - Password: `erp_root`

#### ⚠️ Security Risks:
- Database exposed to internet
- Anyone with credentials can access
- No authentication beyond password

---

### **Option 3: AWS RDS Tunnel / Cloud Proxy (HYBRID)**

#### Requirements:
- Cloud account (AWS, Azure, etc.)
- SSH tunnel service (e.g., CloudFlare Tunnel)

#### Benefits:
- Secure, managed connection
- No direct internet exposure
- Works across all networks

See separate guide: `POWERBI_CLOUD_TUNNEL_SETUP.md`

---

## Power BI Desktop Connection Steps

### **For Any Method:**

1. **Open Power BI Desktop**
2. **Get Data** → **PostgreSQL Database**
3. **Enter Connection Details:**
   - Server: `localhost` (for SSH) or `<SERVER_IP>` (for direct)
   - Port: `6432`
   - Database: `college_erp`
   - **Data Connectivity Mode: DirectQuery** (recommended for live data)

4. **Database Credentials:**
   - Username: `erp_user`
   - Password: `erp_root`
   - ⚠️ Enable "Encrypt connection" if available

5. **Select Tables** (available are those the user has access to)

---

## Network Requirements

| Method | Requires Port Open | Requires SSH | Security | Ease |
|--------|-------------------|--------------|----------|------|
| SSH Tunnel | ❌ (22 only)     | ✅          | ⭐⭐⭐   | ⭐⭐⭐ |
| Direct Expose | ✅ (6432)       | ❌          | ⭐      | ⭐⭐⭐⭐ |
| Cloud Tunnel | ✅ (varies)      | Optional    | ⭐⭐⭐   | ⭐⭐ |

---

## Immediate Action Checklist

- [ ] **Decide on method** (SSH Tunnel recommended)
- [ ] **Check Server IP**: `hostname -I`
- [ ] **Test SSH Access**: 
  ```bash
  ssh -v <other_user_ip>  # From other laptop
  ```
- [ ] **Create DB User** (if needed):
  ```bash
  sudo -u postgres psql -c "CREATE USER powerbi_user WITH PASSWORD 'secure_password';"
  sudo -u postgres psql -c "GRANT CONNECT ON DATABASE college_erp TO powerbi_user;"
  sudo -u postgres psql -d college_erp -c "GRANT USAGE ON SCHEMA public TO powerbi_user;"
  sudo -u postgres psql -d college_erp -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO powerbi_user;"
  ```
- [ ] **Provide Connection Details** to other user with chosen method

---

## Verification Commands

```bash
# Check if PostgreSQL is listening
sudo netstat -tulpn | grep 6432

# Check firewall status
sudo ufw status

# Test PostgreSQL connection locally
psql -h localhost -p 6432 -U erp_user -d college_erp

# Check active connections
sudo -u postgres psql -d college_erp -c "SELECT * FROM pg_stat_activity;"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Connection refused" | PostgreSQL not listening on that port/address |
| "Authentication failed" | Wrong username/password or pg_hba.conf rule missing |
| "Network unreachable" | Firewall blocking port - check `ufw status` |
| "Permission denied (SSH)" | SSH public key not in authorized_keys |
| "Power BI can't get data" | Try "Edit Queries" → "Edit Settings" → change mode to Import |

---

## Security Recommendations

1. **Create dedicated read-only user** instead of using `erp_user`
2. **If exposing to internet**: Use VPN/WireGuard instead of direct exposure
3. **Monitor connections**: `sudo tail -f /var/log/postgresql/postgresql-*.log`
4. **Rotate passwords** monthly in production
5. **Use encrypted SSH keys** instead of passwords

