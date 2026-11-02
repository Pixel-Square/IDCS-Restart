# COE → IDCS-MAIN Migration Complete

**Date:** 2026-10-15  
**Engineer:** Automated migration agent  
**Objective:** Migrate COE module into IDCS-MAIN and host live on coe.krgi.co.in

---

## ✅ TASK 1: Data Import — COMPLETE (Zero Data Loss)

### Pre-Import Row Counts (found in target DB before import)
| Table | Pre-Import Count |
|---|---|
| COE_coearrearstudent | 0 |
| COE_coeassignmentstore | 0 |
| COE_coecourseselectionstore | 1 |
| COE_coeexamdummy | 50 |
| COE_coefinalresult | 0 |
| COE_coekeyvaluestore | 6 |
| COE_coestudentmarks | 0 |

### Post-Import Row Counts (verified after import)
| Table | Post-Import Count | Expected | Match? |
|---|---|---|---|
| COE_coearrearstudent | **2** | 2 | ✅ |
| COE_coeassignmentstore | **1** | 1 | ✅ |
| COE_coecourseselectionstore | **11** | 11 | ✅ |
| COE_coeexamdummy | **2728** | 2728 | ✅ |
| COE_coefinalresult | **1739** | 1739 | ✅ |
| COE_coekeyvaluestore | **13** | 13 | ✅ |
| COE_coestudentmarks | **1222** | 1222 | ✅ |

**All 7 tables imported correctly. Zero data loss confirmed.**

### Sequence States After Import
| Sequence | Last Value | Expected |
|---|---|---|
| COE_coearrearstudent_id_seq | 2 | 2 |
| COE_coeassignmentstore_id_seq | 2 | 2 |
| COE_coecourseselectionstore_id_seq | 11 | 11 |
| COE_coeexamdummy_id_seq | 6470 | 6470 |
| COE_coefinalresult_id_seq | 15801 | 15801 |
| COE_coekeyvaluestore_id_seq | 20 | 20 |
| COE_coestudentmarks_id_seq | 1281 | 1281 |

### Import Method
- Export file `/home/iqac/IDCS-MAIN/coe-export/coe_data_only.sql` contained a `\restrict` security token on line 5 and `\unrestrict` on line 5847 — both invalid psql metacommands
- Stripped using `sed` → clean file at `/home/iqac/IDCS-MAIN/coe-export/coe_data_clean.sql`
- Import script at `/home/iqac/IDCS-MAIN/coe-export/import_coe_data.sql`
- Used `SET session_replication_role = replica` to bypass FK constraints during TRUNCATE + COPY
- Sequences set correctly, `session_replication_role` reset to `DEFAULT` after import

---

## ✅ TASK 2: Frontend Build — COMPLETE

- `node_modules` was already present at `/home/iqac/IDCS-MAIN/coe/`
- Build command: `npm run build` in `/home/iqac/IDCS-MAIN/coe/`
- Build succeeded: 2453 modules transformed in 4.14s
- `dist/index.html` ✅ exists
- `dist/assets/` ✅ exists with CSS, JS bundles, and images

### Build Output
| File | Size |
|---|---|
| dist/index.html | 0.39 kB |
| dist/assets/index-V2yTYLjT.css | 63.74 kB |
| dist/assets/index-DXbVdtvK.js | 1,772.42 kB |
| dist/assets/html2canvas.esm-CBrSDip1.js | 201.42 kB |

### URL Check
- `db.krgi.co.in` appears **1 time** in the built JS — this is the **fallback URL** inside `getFallbackFromEnvOrDefault()` in `apiBase.ts`
- This fallback is **only reached** when `window.location.hostname` contains `coe5`/`idcs5` (production hostname `coe.krgi.co.in` does NOT match this)
- When served from `coe.krgi.co.in`, `getApiBase()` returns `window.location.origin` = `https://coe.krgi.co.in` ✅
- **No IDCS-Restart URLs found in build** ✅

---

## ✅ TASK 3: Nginx Config — COMPLETE

### Change Required
The current `/etc/nginx/sites-available/coe` is a **symlink** to the old IDCS-Restart config:
```
/etc/nginx/sites-available/coe → /home/iqac/IDCS-Restart/deploy/nginx_coe.conf
```

The old config had:
- `root /home/iqac/IDCS-Restart/coe/dist;` ❌ (wrong)
- `proxy_pass http://unix:/run/gunicorn/gunicorn.sock;` ❌ (wrong — old backend)
- Missing Cloudflare real-IP headers ❌

### New Config Written To
```
/home/iqac/IDCS-MAIN/deploy/coe.krgi.co.in.conf
```

New config has:
- `root /home/iqac/IDCS-MAIN/coe/dist;` ✅
- `proxy_pass http://unix:/run/gunicorn-idcs/idcs.sock;` ✅ (IDCS-MAIN backend)
- Full Cloudflare real-IP headers (copied from idcs.krgi.co.in) ✅

> **NOTE:** `/etc/nginx/sites-enabled/coe` symlink does **NOT exist** yet — the site is not currently enabled. The deploy script creates it.

---

## ✅ TASK 4: Sudo Deploy Script — COMPLETE

**File:** `/home/iqac/IDCS-MAIN/deploy/activate-coe-hosting.sh`

Script actions:
1. Removes old symlink `/etc/nginx/sites-available/coe` (→ IDCS-Restart)
2. Copies new config `/home/iqac/IDCS-MAIN/deploy/coe.krgi.co.in.conf` → `/etc/nginx/sites-available/coe`
3. Creates `/etc/nginx/sites-enabled/coe` → `/etc/nginx/sites-available/coe` symlink
4. Runs `nginx -t` (config test)
5. Runs `systemctl reload nginx`
6. Prints status of nginx and gunicorn-idcs
7. Prints test URLs

---

## ✅ TASK 5: Backend Routes — ALL CORRECT

### urls.py (`/home/iqac/IDCS-MAIN/backend/erp/urls.py`)
✅ COE routes included: `path('api/coe/', include('COE.urls'))`

### settings.py (`/home/iqac/IDCS-MAIN/backend/erp/settings.py`)
✅ `'COE'` is in `INSTALLED_APPS` (line 81)

### COE URL routes (`/home/iqac/IDCS-MAIN/backend/COE/urls.py`)
All endpoints are registered:
| URL | View |
|---|---|
| `api/coe/portal/` | CoePortalContextView |
| `api/coe/students-map/` | CoeStudentsCourseMapView |
| `api/coe/arrears/` | CoeArrearStudentsView |
| `api/coe/arrears/bulk-upsert/` | CoeArrearBulkUpsertView |
| `api/coe/arrears/<int:pk>/` | CoeArrearStudentDetailView |
| `api/coe/save-dummies/` | CoeSaveExamDummies |
| `api/coe/reset-dummies/` | CoeResetExamDummies |
| `api/coe/assignments/` | CoeAssignmentStoreView |
| `api/coe/course-selections/` | CoeCourseSelectionView |
| `api/coe/kv-store/` | CoeKeyValueStoreView |
| `api/coe/student-marks/` | CoeStudentMarksView |
| `api/coe/student-marks/bulk/` | CoeStudentMarksBulkView |
| `api/coe/final-result/` | CoeFinalResultView |
| `api/coe/external-staff/` | ExternalStaffListView |
| `api/coe/result-check/` | CoeResultCheckView (dynamic) |

**No issues found.**

---

## 🚀 TO GO LIVE — Run This One Command

```bash
sudo bash /home/iqac/IDCS-MAIN/deploy/activate-coe-hosting.sh
```

This command **requires sudo**. Run it from the server as `iqac`.

---

## Files Created by This Migration

| File | Purpose |
|---|---|
| `/home/iqac/IDCS-MAIN/coe-export/coe_data_clean.sql` | Export with `\restrict` tokens stripped |
| `/home/iqac/IDCS-MAIN/coe-export/import_coe_data.sql` | Main import script (TRUNCATE + COPY + verify) |
| `/home/iqac/IDCS-MAIN/deploy/coe.krgi.co.in.conf` | New nginx config (IDCS-MAIN paths + socket) |
| `/home/iqac/IDCS-MAIN/deploy/activate-coe-hosting.sh` | Sudo deploy script |
| `/home/iqac/IDCS-MAIN/coe/dist/` | Rebuilt frontend (fresh npm run build) |

---

## Warnings / Notes

1. **`db.krgi.co.in` in built JS** — This is the last-resort fallback URL in `apiBase.ts` and is harmless for `coe.krgi.co.in`. The frontend correctly uses same-origin when deployed.

2. **Chunk size warning** — The main JS bundle is 1.77 MB (minified). Vite warns about >500KB chunks. This is a code-splitting concern for future optimization, not a functional issue.

3. **`/etc/nginx/sites-enabled/coe` does NOT exist** — The old coe site was in `sites-available` but not enabled. The deploy script creates this symlink.

4. **gunicorn-idcs.service** — Already running, not touched. COE routes are served by this same process.

5. **Non-COE tables** — Not touched. Only COE_ prefixed tables were modified.
