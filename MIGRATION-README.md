# IDCS Migration README
## Migration from `iqac2` → `iqac`

**Prepared:** 2026-10-14 18:24 IST  
**Prepared by:** Automated migration package (Antigravity)  
**Archive name:** `IDCS-Migration-iqac.zip`

---

## 1. Source Server & Project

| Field | Value |
|-------|-------|
| Source server | `iqac2` (Ubuntu 24.04) |
| Project path | `/home/iqac2/Desktop/idcs-mt/` |
| Git remote | `https://github.com/Pixel-Square/IDCS-Restart.git` |
| Git branch | `academic-performance-deploy` (HEAD at `20716ae`) |
| Target server | `iqac` |
| Suggested target path | `/home/iqac/IDCS-Restart/` (matches existing `setup-and-run.sh`) |

---

## 2. Database

| Field | Value |
|-------|-------|
| Engine | PostgreSQL 18.3 |
| Database name | `college_erp` |
| Schemas | `public` (305 tables), `reporting` (functions) |
| Extensions | `plpgsql` only (built-in) |
| Live DB size | ~127 MB |
| Application user | `postgres` (current) — consider `erp_user` on iqac |

**Backup files:**

| File | Description | Status |
|------|-------------|--------|
| `backend/database-backup/idcs-production.dump` | Fresh custom-format PG dump (2026-10-14) | ✅ Verified |
| `backend/database-backup/database-info.txt` | Engine, roles, extensions, checksums | ✅ Present |
| `backend/database-backup/RESTORE-INSTRUCTIONS.md` | Step-by-step restore guide for iqac | ✅ Present |

> **Note:** `backup.dump` at the project root is an older snapshot (2026-08-27, 7 MB) preserved as a secondary reference. Use `idcs-production.dump` for the actual migration.

---

## 3. Required Software on `iqac`

### System
- Ubuntu 22.04+ / Debian 12+
- **PostgreSQL 18.x** (strongly recommended; minimum PG 16)
- **Python 3.12**
- **Node.js ≥ 18** (for `whatsapp-server/`)
- **Nginx**
- **Cloudflare Tunnel (`cloudflared`)** — configure for iqac's tunnel credentials
- **Redis** (used by Django cache + sessions)
- **Google Chrome** (for WhatsApp gateway via Puppeteer/whatsapp-web.js)

### Python dependencies
```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Key packages: Django 4.2, DRF 3.16, psycopg2-binary, Gunicorn 25, Pillow, openpyxl, reportlab, pypdf, docker, twilio, google-auth, redis, cryptography

### Node.js dependencies (whatsapp-server)
```bash
cd whatsapp-server
npm install
```

---

## 4. Environment Variables

> **⚠️ Secrets are NOT included in this ZIP.**  
> Transfer the `.env` file via a secure out-of-band method (encrypted file, SSH, secrets vault).

The following `.env` variables must be set in `backend/.env` on `iqac`:

| Variable | Notes |
|----------|-------|
| `DJANGO_SECRET_KEY` | Generate new or reuse source key |
| `DEBUG` | Set to `0` for production |
| `ALLOWED_HOSTS` | Add iqac domain(s) |
| `DB_HOST` | `localhost` |
| `DB_NAME` | `college_erp` |
| `DB_USER` | `postgres` or `erp_user` |
| `DB_PASS` | **Secret — transfer separately** |
| `DB_PORT` | `5432` |
| `REDIS_URL` | `redis://127.0.0.1:6379/1` |
| `SMS_BACKEND` | `whatsapp` |
| `OBE_WHATSAPP_API_URL` | WhatsApp gateway URL |
| `OBE_WHATSAPP_API_KEY` | **Secret** |
| `OBE_WHATSAPP_GATEWAY_BASE_URL` | Gateway base URL |
| `CANVA_CLIENT_ID` | `OC-AZy8WVWcdeX9` |
| `CANVA_CLIENT_SECRET` | **Secret** |
| `CANVA_REDIRECT_URI` | Update to iqac's production URL |
| `N8N_BRANDING_WEBHOOK_URL` | Update to iqac's n8n instance |
| `N8N_WEBHOOK_SECRET` | **Secret** |
| `N8N_API_KEY` | **Secret** |
| `REPORTING_API_KEY` | **Secret** |
| `GOOGLE_OAUTH_CLIENT_ID` | `309215625689-j8af03h2lv4fu7o9i6aihmpm6aquje57.apps.googleusercontent.com` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **Secret** |
| `GOOGLE_OAUTH_REDIRECT_URI` | Update to iqac's domain |
| `ACCESS_TOKEN_MINUTES` | `60` |

**Frontend `.env`** (create `frontend/.env` with):
```
VITE_API_BASE=https://<iqac-domain>/
```

**WhatsApp server env** (set in systemd unit or `whatsapp-server/.env`):
```
NODE_ENV=production
WA_API_KEY=<secret>
OBE_WHATSAPP_API_KEY=<secret>
CHROME_PATH=/usr/bin/google-chrome
```

---

## 5. External Dependencies & Services

| Service | Notes |
|---------|-------|
| **Cloudflare Tunnel** | Source uses tunnel `6e7be884-4322-43cb-b93b-795c39be0c0c`. On iqac, configure a separate tunnel or update routing. |
| **Canva Connect API** | Redirect URI must be updated in the Canva Developer Portal to iqac's domain. |
| **Google OAuth** | Redirect URI must be updated in Google Cloud Console. |
| **n8n** | If n8n runs on iqac2, either migrate it or deploy a new instance on iqac. |
| **ESSL Biometric Devices** | LAN-connected devices; IPs in `.env` as `ESSL_DEVICE_IPS`. Verify reachability from iqac. |
| **WhatsApp Gateway** | Requires Google Chrome + active WhatsApp session. Re-scan QR on first start. |
| **Redis** | Must be running on iqac at `redis://127.0.0.1:6379/1`. |
| **Power BI** | `pbi_readonly` / `powerbi_user` roles on DB; update connection string in Power BI. |

---

## 6. Uploaded Media

| Path | Size | Notes |
|------|------|-------|
| `backend/media/` | **165 MB** | Included in ZIP |
| Subdirectories | profile\_images, obe, proposal-docs, proposal-posters, ssa\_assignments, ssa\_submissions, pbas-submissions, audit\_rubrics, discipline, academic\_v2, attendance\_uploads, poster-uploads, question\_bank | All included |

After restore, ensure Nginx has read permissions:
```bash
sudo chown -R iqac:www-data /path/to/backend/media/
```

---

## 7. Static Files

`backend/staticfiles/` (3.8 MB) is **included**. Regenerate if needed:
```bash
python manage.py collectstatic --noinput
```

---

## 8. Setup Steps on `iqac`

```bash
# 1. Extract archive
unzip IDCS-Migration-iqac.zip -d /home/iqac/

# 2. Restore database (see backend/database-backup/RESTORE-INSTRUCTIONS.md)

# 3. Create Python virtualenv & install deps
cd /home/iqac/IDCS-Restart/backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Create backend/.env with all variables (see §4 above)

# 5. Run Django checks
python manage.py check --deploy
python manage.py migrate --check   # should show no pending migrations

# 6. Collect static files
python manage.py collectstatic --noinput

# 7. Build frontend
cd ../frontend
npm install
npm run build

# 8. Install and start WhatsApp gateway
cd ../whatsapp-server
npm install
# Create whatsapp-server/.env from .env.example

# 9. Install systemd services (see deploy/ directory)
#    Adapt paths from /home/iqac2 → /home/iqac
sudo cp deploy/gunicorn-idcs.service /etc/systemd/system/
sudo cp deploy/whatsapp.service      /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gunicorn-idcs whatsapp

# 10. Configure Nginx
sudo cp deploy/idcs.krgi.co.in.conf /etc/nginx/sites-available/idcs.krgi.co.in
#     Edit all /home/iqac2 paths → /home/iqac
sudo nginx -t && sudo systemctl reload nginx

# 11. Configure Cloudflare Tunnel on iqac
#     Update ~/.cloudflared/config.yml with iqac's tunnel credentials
```

---

## 9. Secrets — Transfer Separately (Secure Channel)

The following **must not** be in the ZIP and must be transferred via SSH/encrypted email/vault:

- [ ] `backend/.env` (full file with all passwords and API keys)
- [ ] `whatsapp-server/.env`
- [ ] `~/.cloudflared/*.json` (tunnel credentials file for iqac's tunnel)
- [ ] DB role passwords for: `erp_user`, `inoutx_user`, `pbi_readonly`, `powerbi_user`, `rohit`
- [ ] WhatsApp session (re-scan QR recommended instead of copying session files)
- [ ] Google OAuth client secret
- [ ] Canva client secret
- [ ] n8n API key and webhook secret
- [ ] Reporting API key

---

## 10. What Was Excluded from the ZIP

| Excluded | Reason | Recoverable? |
|----------|--------|--------------|
| `backend/.venv/` | Python virtualenv (1.1 GB) | Yes — `pip install -r requirements.txt` |
| `frontend/node_modules/` | JS dependencies (1.0 GB) | Yes — `npm install` |
| `backend/.env`, `.env.production` | Contains secrets | Transfer separately |
| `whatsapp-server/node_modules/` | JS deps | Yes — `npm install` |
| `whatsapp-server/.wwebjs_auth/` | Session state | Re-scan QR on iqac |
| `whatsapp-server/.wwebjs_cache/` | Cache | Regenerated |
| `__pycache__/` | Compiled bytecode | Yes |
| `*.log` | Log files | No — not needed |
| `backend/staticfiles/` | Regeneratable | Yes — `collectstatic` |

> **Source code, migrations, configuration templates, media, and Git history are all included.**

---

## 11. Verification Checklist (After Restore on `iqac`)

- [ ] `pg_size_pretty(pg_database_size('college_erp'))` returns ~127 MB
- [ ] `python manage.py check --deploy` passes with no errors
- [ ] `python manage.py migrate --check` shows no pending migrations
- [ ] Nginx serves frontend at the iqac domain
- [ ] `/api/` requests route to Gunicorn correctly
- [ ] `/media/` and `/static/` serve files
- [ ] WhatsApp OTP service starts (QR scan required)
- [ ] ESSL biometric sync connects to devices

---

*End of MIGRATION-README.md*
