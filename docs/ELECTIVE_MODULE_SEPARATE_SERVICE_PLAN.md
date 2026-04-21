# Elective Module as Separate Service (Separate Domain + Separate Stack)

## 1) Goal

Create a **new Elective Module** that runs independently (own backend, frontend, DB, deployment, domain), while still using data from the current IDCS system.

Key requirements covered:
- Separate backend, frontend, and database
- Run on separate domain (example: `elective.krgi.co.in`)
- Use current site data (students, departments, curriculum/elective parents)
- Support elective subject create/import
- Keep data mapped with current IDCS
- Run polling for students to choose electives
- Store final choices as authoritative records

---

## 2) Recommended Architecture (Best for scale + safety)

### Source of Truth split

- **IDCS Monolith DB (existing)** = source of truth for core academic data
  - students, sections, departments, semesters, academic year, parent elective rows
- **Elective Service DB (new)** = source of truth for polling lifecycle and module operations
  - poll campaigns, poll options, student votes, audit logs, sync queue

### Data movement pattern

Use **event-driven sync + periodic reconciliation**:
1. Pull/import core master data from IDCS into Elective Service mirror tables
2. When electives are created/imported in Elective Service, publish write-back event/API call to IDCS
3. When students vote, write vote to Elective Service DB, then sync `ElectiveChoice` to IDCS
4. Nightly reconciliation job verifies both sides are consistent

Why this approach:
- Service is independent and can scale/deploy separately
- Avoids hard coupling to IDCS DB schema in runtime queries
- Gives clear recovery path if sync fails (replay from outbox)

---

## 3) High-Level Components

## 3.1 Elective Backend (new)
- Tech: Django + DRF (same stack as existing for team speed)
- Own DB (PostgreSQL)
- Modules:
  - `catalog` (elective subjects, import, mapping)
  - `polling` (campaigns, options, windows, voting rules)
  - `choices` (student elective choices and status)
  - `sync` (IDCS connector, outbox, retries, reconciliation)
  - `auth` (JWT trust / SSO integration)

## 3.2 Elective Frontend (new)
- Tech: React + Vite (same as existing)
- User roles:
  - Admin/IQAC/HOD: create/import electives, start/stop polls, monitor counts
  - Student: view eligible polls, rank/select elective, submit/modify within window

## 3.3 Elective DB (new)
- Dedicated PostgreSQL schema
- Own migrations and lifecycle

## 3.4 Integration Connector
- Secure API client from Elective Service to IDCS APIs
- Optional webhook endpoint in Elective Service for IDCS-origin updates

---

## 4) Data Model (Elective Service DB)

Create these primary tables:

1. `idcs_student_snapshot`
- `idcs_student_id`, reg_no, name, dept_id, section_id, semester_id, status, updated_at

2. `idcs_elective_parent_snapshot`
- `idcs_parent_id`, regulation, semester, department_id, parent_name, active

3. `elective_subject_local`
- `id`, `idcs_parent_id`, `idcs_subject_id` (nullable until pushed)
- code, name, intake_limit, eligibility_rule, is_active, created_by

4. `poll_campaign`
- `id`, name, academic_year_id, regulation, semester, department_id
- `start_at`, `end_at`, status (`draft/open/closed/published`)
- policy: single-choice or ranked-choice

5. `poll_option`
- `id`, campaign_id, elective_subject_local_id, display_order

6. `student_poll_response`
- `id`, campaign_id, idcs_student_id, selected_option_id (or ranking JSON)
- `submitted_at`, `source_ip`, `is_locked`
- unique `(campaign_id, idcs_student_id)`

7. `final_elective_choice`
- `id`, campaign_id, idcs_student_id, elective_subject_local_id
- `sync_status` (`pending/synced/failed`), `idcs_choice_id`, `sync_error`

8. `sync_outbox`
- event_type, payload, retry_count, next_retry_at, status

9. `sync_audit_log`
- direction, entity, entity_key, result, message, processed_at

---

## 5) Integration Contract with Existing IDCS

Do not query IDCS DB directly from elective runtime. Use APIs and controlled sync jobs.

### Read from IDCS
- Departments
- Active academic year
- Semesters / sections / student eligibility
- Parent curriculum rows where `is_elective=true`
- Existing elective subjects + elective choices (for baseline/backfill)

### Write to IDCS
1. On elective subject create/import in new module:
   - Upsert to IDCS `ElectiveSubject`
   - Store returned `idcs_subject_id`

2. On final poll publish:
   - Upsert each student final selection to IDCS `ElectiveChoice`
   - Mark inactive previous choice for same student+parent+year (business rule controlled)

### Idempotency rule
Use deterministic key:
- subject key: `(idcs_parent_id, course_code, academic_year)`
- choice key: `(idcs_student_id, idcs_subject_id, academic_year)`

---

## 6) Polling Workflow

1. Admin creates campaign (`draft`)
2. Admin attaches elective options
3. System validates constraints:
   - active students only
   - no duplicate option codes
   - intake limits configured
4. Admin opens campaign (`open`)
5. Students submit choice (or ranked list)
6. On close:
   - freeze responses
   - run allocation (if over-subscribed)
7. Admin publishes results
8. Service syncs final choices to IDCS `ElectiveChoice`
9. Reconciliation job confirms parity

Allocation strategy options:
- MVP: first-come-first-served with intake cap
- Better: merit/CGPA + preference ranking + tie-breaker

---

## 7) Auth and User Experience

### Auth
Recommended: trust existing IDCS JWT issuer.
- Elective frontend logs in using same IDCS login endpoint
- Elective backend verifies token signature (shared public key/secret)
- Role mapping based on existing groups/permissions

### Cross-domain
- Domain: `elective.krgi.co.in`
- Configure CORS + CSRF safely
- Use HTTPS only

---

## 8) Deployment Plan (Separate Domain)

1. New infra units
- `elective-backend` systemd service + gunicorn socket
- `elective-frontend` static build
- `elective-db` PostgreSQL DB

2. Nginx vhost
- new config similar to current `deploy/nginx_idcs.conf`
- `server_name elective.krgi.co.in`
- route `/api/` -> elective gunicorn socket
- route `/` -> elective frontend build

3. Secrets/config
- `IDCS_API_BASE_URL`
- `IDCS_SERVICE_TOKEN` (or OAuth client credentials)
- `DATABASE_URL` for elective DB
- JWT verification key settings

4. Background workers
- Outbox sync worker
- Nightly reconciliation cron/systemd timer

---

## 9) Implementation Phases

## Phase 0: Design freeze (2–3 days)
- Finalize entity ownership and sync contracts
- Define conflict rules (which side wins)

## Phase 1: Bootstrap service (4–6 days)
- New repo/module structure (backend + frontend + deploy)
- Auth integration with existing IDCS tokens
- Health endpoints and base CI/CD

## Phase 2: Catalog management (5–7 days)
- Create/import elective subjects in new module
- Write-back to IDCS `ElectiveSubject`
- Retry + idempotency in outbox

## Phase 3: Polling engine (6–8 days)
- Campaign lifecycle APIs + UI
- Student voting UI with window validation
- Locking + anti-double-submit protections

## Phase 4: Choice publishing and sync (4–6 days)
- Finalize choices
- Upsert to IDCS `ElectiveChoice`
- Reconciliation dashboard

## Phase 5: Pilot + go-live (3–5 days)
- One department pilot
- Compare with monolith reports
- Enable all departments

---

## 10) Risk Controls

1. Sync failure
- Outbox retries with exponential backoff
- Dead-letter + admin retry action

2. Data mismatch
- Nightly parity checks on student count, option count, choice count
- Report and auto-heal script

3. Duplicate submissions
- DB unique constraints + transaction locks

4. Unauthorized changes
- Strict role-based permissions and audit logs

5. Runtime coupling
- No direct cross-DB joins in API request path

---

## 11) MVP Scope (Do first)

For fastest delivery, launch with:
- Single-choice polling (not ranked)
- Basic intake limit
- Manual publish by admin
- Sync to IDCS `ElectiveChoice`
- Reconciliation screen (counts + mismatch list)

Add later:
- Ranked preferences
- Auto-allocation based on merit rules
- Waitlist and auto-promotion

---

## 12) How this maps to your current codebase

Current system already has:
- `ElectiveSubject` model
- `ElectiveChoice` model
- import endpoints for elective choices

So the new service should **integrate with these existing models via API**, not replace them in first iteration. This minimizes risk and keeps old modules working.

---

## 13) Immediate next actions (this week)

1. Confirm authoritative owner per entity:
- elective subject definition: Elective Service (with write-back)
- final student choice: Elective Service (published + synced)

2. Create API contract doc between Elective Service and IDCS:
- read endpoints, write endpoints, payloads, idempotency keys, error codes

3. Scaffold new service skeleton under workspace (example):
- `/elective-service/backend`
- `/elective-service/frontend`
- `/elective-service/deploy`

4. Implement first integration spike:
- Fetch departments/students from IDCS
- Upsert one elective subject to IDCS
- Verify round-trip mapping IDs

---

## 14) Decision recommendation

Choose this model:
- **Separate Elective Service + separate DB + API/event sync with IDCS**

Avoid this model:
- Elective service directly reading/writing IDCS database tables in live request path

Reason: direct DB coupling will break independence and make upgrades risky.
