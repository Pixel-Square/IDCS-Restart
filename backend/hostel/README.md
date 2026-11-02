# Hostel & Student Facilities Module

Django + DRF app that adds a complete hostel / residence / transport ERP on top
of the existing `academics.StudentProfile` student master data.

```
Student (academics) ── OneToOne ── StudentFacilityProfile
                                         │
                    Residence: DAY_SCHOLAR | HOSTELLER
                    Transport: uses_college_bus = Yes / No
                                         │
RoomAllocation (ACTIVE) ── Room ── Floor ── Building (type = HOSTEL)
TransportAssignment ── TransportRoute ── TransportStop ── CollegeBus
```

The module never duplicates student master data. Name, roll number,
department, programme, semester and section always come from the existing
`academics.StudentProfile` records; the hostel app only stores the facility
selection, allocations and hostel operations.

---

## 1. Student page gating (the core requirement)

A student may choose **one residence category** and **independently** opt in to
the College Bus:

| Field | Values |
|---|---|
| `residence_category` | `DAY_SCHOLAR`, `HOSTELLER` |
| `uses_college_bus` | `true` / `false` |

* A Day Scholar **can** use the College Bus (the two options are not mutually
  exclusive).
* The **Hostel portal** (`/api/hostel/me/overview/` and every hostel-only
  student endpoint) is gated on `residence_category == HOSTELLER`.
* Day Scholars and students who have not selected yet receive
  `403 Forbidden` with a clear message from `IsHostellerStudent`.
* The `/api/hostel/me/facility/` endpoint stays available to **all** students so
  they can make or change their selection.

The single source of truth for frontend navigation is `GET /api/accounts/dashboard/`
(and `GET /api/accounts/me/`):

```json
{
  "flags": {
    "is_student": true,
    "is_hosteller": true,
    "hostel_page_access": true,
    "uses_college_bus": false,
    "can_manage_hostel": false,
    "can_admin_hostel": false
  },
  "entry_points": {
    "hostel_portal": true,
    "hostel_admin_portal": false
  }
}
```

Frontend rule:

```tsx
{me.flags.hostel_page_access && <SidebarItem to="/student/hostel" label="Hostel" />}
```

`GET /api/accounts/me/` additionally returns the current `hostel_facility`
object (or `null`).

### Selection window ("start of the semester")

`FacilitySelectionWindow` is scoped to an `academic_year` with `opens_at` /
`closes_at`. While a first-time selection is made:

* outside the window → `400` (`code: NOT_STARTED` / `CLOSED`);
* `allow_self_selection = false` or `require_approval = true` → a
  `FacilityChangeRequest` is created instead of applying the change;
* changing an existing selection → controlled by
  `HostelConfiguration.allow_student_edit_after_selection` and
  `require_approval_for_changes`.

Administrators can override at any time through
`PATCH /api/hostel/students/<reg_no>/facility/`.

---

## 2. Installed app

Registered in `erp/settings.py`:

```python
'hostel.apps.HostelConfig',
```

Mounted at **both** of these prefixes in `erp/urls.py` (the project convention
plus the requested API versioning):

```
/api/hostel/
/api/v1/hostel/
```

---

## 3. Setup (Windows)

```powershell
cd C:\Users\karth\Downloads\IDCS-Restart\backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test hostel
```

The migrations:

| Migration | Purpose |
|---|---|
| `0001_initial.py` | All hostel tables, constraints and indexes |
| `0002_seed_hostel_roles.py` | Creates `COLLEGE_ADMIN`, `HOSTEL_ADMIN`, `WARDEN`, `DEPUTY_WARDEN`, `MATRON`, `MAINTENANCE_STAFF`, `MESS_COORDINATOR`, `TRANSPORT_COORDINATOR`, `SECURITY_STAFF` roles |

`HostelConfiguration` is a singleton created automatically on first access
(`HostelConfiguration.get_solo()`).

Recalculate cached occupancy after manual database changes:

```powershell
.\.venv\Scripts\python.exe manage.py hostel_recalculate_occupancy
```

---

## 4. Roles and permissions

Role checks live in `hostel/permissions.py` and are enforced by DRF permission
classes (hiding frontend links is **not** the security boundary).

| Role | Access |
|---|---|
| Superuser / `ADMIN` / `COLLEGE_ADMIN` / `PRINCIPAL` / `IQAC` | Everything |
| `HOSTEL_ADMIN` | All hostel configuration and operations |
| `WARDEN` / `DEPUTY_WARDEN` / `MATRON` | Read + operate their assigned buildings (`HostelWardenAssignment`) |
| `MAINTENANCE_STAFF` | Complaints, assets, maintenance |
| `MESS_COORDINATOR` | Mess menus, feedback, mess requests |
| `TRANSPORT_COORDINATOR` | Routes, stops, buses, transport assignments |
| `SECURITY_STAFF` | Visitors, late entries, movement |
| `STUDENT` | Own facility selection + hostel portal when Hosteller |

Wardens only see rows whose building is assigned to them
(`_scope_to_warden_buildings` in `views.py`). Every administrative mutation
writes a `HostelAuditLog` entry.

---

## 5. Data model

### Infrastructure

`Building → Floor → Room → Bed`, plus `RoomAllocation`.

* Room numbers are unique per building (`uniq_room_number_per_building`).
* A room's floor must belong to its building (validated in model + serializer).
* `Room.occupied_count` is **always** recalculated from active allocations —
  never entered manually.
* Rooms display `status` derived from occupancy
  (`AVAILABLE` / `PARTIALLY_OCCUPIED` / `FULL`) while `MAINTENANCE` and
  `INACTIVE` are preserved.
* `Building.planned_floors` is display-only; the actual floor count is computed
  from `Floor` rows (`actual_floor_count`).

### Allocation integrity

`RoomAllocation` has two partial unique constraints:

```python
UniqueConstraint(fields=['student'], condition=Q(status='ACTIVE'), ...)
UniqueConstraint(fields=['bed'], condition=Q(status='ACTIVE', bed__isnull=False), ...)
```

Allocation, transfer and vacating run inside `transaction.atomic()` with
`select_for_update()` on the student, room and bed rows, then re-count active
allocations before inserting. Capacity can never be exceeded, even under
concurrent requests.

Changing a Hosteller to Day Scholar **does not** release the room unless
`HostelConfiguration.release_room_on_category_change` is enabled. The normal
path is an approved vacating / transfer workflow.

### Gender-based allocation (mandatory)

Student gender is stored on the student master record
(`academics.StudentProfile.gender` — `MALE` / `FEMALE` / `OTHER`).

Hostel gender is configured at two levels:

| Level | Field | Values |
|---|---|---|
| Building | `Building.hostel_category` | `BOYS`, `GIRLS`, `STAFF`, `MIXED`, blank |
| Room | `Room.hostel_category` | `BOYS`, `GIRLS`, `STAFF`, `MIXED`, blank |

A room **inherits** the building category when its own category is blank
(`Room.effective_hostel_category`).

`services.allocate_room()` (and therefore the API, transfers and any future
management command) enforces all of the following:

1. The student must have a gender recorded.
2. The room (or its building) must have a hostel category.
3. A `BOYS` room accepts only `MALE` students.
4. A `GIRLS` room accepts only `FEMALE` students.
5. `STAFF` rooms cannot be allocated to students.
6. `MIXED` rooms accept any recorded gender.

The rule is enforced inside the allocation transaction, so it cannot be
bypassed by calling the API directly.

`POST /allocations/` accepts an optional `gender` field to make the selection
explicit. When the student master record has no gender, the supplied value is
saved to `academics.StudentProfile.gender` before the allocation is validated.
If a gender is already recorded, a conflicting value is rejected with HTTP 400
(an existing gender is never silently overwritten).

Dashboard, directory and allocation filters (Boys and Girls separately):

```
?gender=MALE|FEMALE|OTHER
?hostel_category=BOYS|GIRLS|MIXED
```

The same filters apply to the allocation list:

```
GET /api/hostel/allocations/?gender=MALE&hostel_category=BOYS
GET /api/hostel/allocations/?gender=FEMALE&hostel_category=GIRLS
```

The dashboard also reports `male_hostellers`, `female_hostellers`,
`boys_hostel_rooms`, `girls_hostel_rooms`, `boys_beds`, `girls_beds`,
`boys_occupied_beds`, `girls_occupied_beds`, `boys_vacant_beds` and
`girls_vacant_beds`.

Seed demo Boys/Girls hostel data — buildings, floors, rooms and beds (idempotent):

```powershell
.\.venv\Scripts\python.exe manage.py seed_hostel_gender_demo
```

### Facility history

Every applied change appends a `FacilityHistory` row (source:
`SELF` / `ADMIN` / `APPROVAL` / `IMPORT`) and closes the previous row's
`effective_to`. Pending changes live in `FacilityChangeRequest` with
`requested_by`, `reviewed_by` and review remarks.

### Other tables

| Area | Models |
|---|---|
| Transport | `TransportRoute`, `TransportStop`, `CollegeBus`, `TransportAssignment` |
| Fees | `FeeStructure`, `StudentFee`, `FeePayment` |
| Complaints | `Complaint`, `ComplaintStatusHistory` |
| Mess | `MessMenu`, `MessPreference`, `MessFeedback`, `MessRequest` |
| Visitors / movement | `Visitor`, `StudentLeaveRequest`, `LateEntry` |
| Inventory | `Asset`, `AssetMaintenanceLog` |
| Notices | `HostelNotice`, `HostelNoticeRead` |
| Vacating | `VacatingRequest`, `ClearanceRecord` |
| Audit / imports | `HostelAuditLog`, `StudentSyncRun` |

---

## 6. API reference

### Student endpoints (JWT required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hostel/me/facility/` | Current selection, window state, policy, allocation, transport |
| `POST` | `/api/hostel/me/facility/` | Select `DAY_SCHOLAR` / `HOSTELLER` + College Bus; returns `applied` or `requires_approval` |
| `GET` | `/api/hostel/me/overview/` | **Hostellers only** — hostel landing page payload |
| `GET` | `/api/hostel/me/allocation/` | Allocation history |
| `GET` | `/api/hostel/me/fees/` | Fee obligations + payments + summary |
| `GET/POST` | `/api/hostel/me/complaints/` | Submit / view complaints |
| `GET` | `/api/hostel/me/mess/menu/` | Published menu (`?days=7`) |
| `GET/POST` | `/api/hostel/me/mess/feedback/` | Meal feedback |
| `GET/POST` | `/api/hostel/me/mess/preference/` | Meal preference |
| `GET/POST` | `/api/hostel/me/mess/requests/` | Special meal / change requests |
| `GET/POST` | `/api/hostel/me/leaves/` | Leave requests |
| `GET` | `/api/hostel/me/visitors/` | Visitor history |
| `GET` | `/api/hostel/me/transport/` | Bus assignment (available to Day Scholars too) |
| `GET` | `/api/hostel/me/notices/` | Audience-filtered notices |
| `POST` | `/api/hostel/me/notices/` | `{"notice": <id>}` mark as read |
| `GET/POST` | `/api/hostel/me/vacating/` | Vacating request |

`POST /api/hostel/me/facility/` body:

```json
{
  "residence_category": "DAY_SCHOLAR",
  "uses_college_bus": true,
  "day_scholar_address": "12 Main Street",
  "emergency_contact_name": "Parent",
  "emergency_contact_phone": "+91..."
}
```

`202 Accepted` means a change request is awaiting approval. `200 OK` means the
selection is live.

### Administration endpoints

| Method | Path | Description |
|---|---|---|
| `GET/PATCH` | `/api/hostel/config/` | Policy switches |
| `CRUD` | `/api/hostel/selection-windows/` | Semester selection windows |
| `GET` | `/api/hostel/dashboard/` | All dashboard tiles (live DB counts) |
| `GET` | `/api/hostel/students/` | Student directory with filters |
| `GET` | `/api/hostel/students/<reg_no>/` | Full student facility profile |
| `PATCH` | `/api/hostel/students/<reg_no>/facility/` | Admin override |
| `POST` | `/api/hostel/students/import/` | CSV facility import (`file`, `overwrite_verified`) |
| `GET` | `/api/hostel/students/sync-runs/` | Import history + counts |
| `CRUD` | `/api/hostel/facility-requests/` | Change requests (`POST .../<id>/decision/`) |
| `GET` | `/api/hostel/facility-history/` | Facility change trail |
| `CRUD` | `/api/hostel/buildings/`, `floors/`, `rooms/`, `beds/`, `wardens/` | Infrastructure |
| `GET` | `/api/hostel/buildings/<id>/summary/` | Floors, rooms and totals |
| `GET` | `/api/hostel/rooms/<id>/occupants/` | Current occupants |
| `CRUD/POST` | `/api/hostel/allocations/` | Allocate (`POST`), `transfer/`, `vacate/` |
| `CRUD` | `/api/hostel/routes/`, `stops/`, `buses/`, `transport-assignments/` | Transport |
| `CRUD` | `/api/hostel/fee-structures/`, `student-fees/`, `payments/` | Fees |
| `CRUD` | `/api/hostel/complaints/` | Complaints (`status_update/`, `assign/`) |
| `CRUD` | `/api/hostel/mess-menus/`, `mess-feedback/`, `mess-requests/` | Mess (`review/`) |
| `CRUD` | `/api/hostel/visitors/` | Visitors (`checkout/`) |
| `CRUD` | `/api/hostel/leave-requests/`, `late-entries/` | Movement (`decision/`, `approve/`) |
| `CRUD` | `/api/hostel/assets/`, `asset-maintenance/` | Inventory (`maintenance/`) |
| `CRUD` | `/api/hostel/notices/` | Notices / announcements |
| `CRUD` | `/api/hostel/vacating-requests/` | Vacating (`verify_step/`, `decision/`) |
| `GET` | `/api/hostel/reports/occupancy/` | Room-wise occupancy |
| `GET` | `/api/hostel/reports/fees/` | Fee totals by type |
| `GET` | `/api/hostel/reports/transport/` | Bus users per route |
| `GET` | `/api/hostel/reports/complaints/` | Complaints by status/category |
| `GET` | `/api/hostel/audit-log/` | Administrative audit trail |
| `GET` | `/api/hostel/lookups/` | Form lookup payload |

### Directory filters

```
?q=                      roll number / name / email
?department=<id|code>
?programme=<id|name>
?academic_year=<batch year id|name>
?residence_category=HOSTELLER|DAY_SCHOLAR|NONE
?uses_college_bus=true|false
?building=<id|code>      only students with an ACTIVE allocation there
?status=ACTIVE|INACTIVE|ALUMNI|DEBAR
?pending_verification=true
&page=1&page_size=50
```

### Dashboard payload

All values are computed with database queries:

```json
{
  "students": {
    "total": 0,
    "active": 0,
    "day_scholars": 0,
    "hostellers": 0,
    "college_bus_users": 0,
    "without_residence_category": 0,
    "pending_profile_verification": 0,
    "pending_change_requests": 0,
    "awaiting_hostel_allocation": 0
  },
  "infrastructure": {
    "buildings": 0,
    "hostel_buildings": 0,
    "floors": 0,
    "rooms": 0,
    "hostel_rooms": 0,
    "configured_hostel_beds": 0,
    "occupied_beds": 0,
    "vacant_beds": 0
  },
  "by_department": [],
  "by_building": []
}
```

A student is counted as an occupied bed **only** with an `ACTIVE`
`RoomAllocation`; Day Scholars and students awaiting allocation are never
counted as occupants.

---

## 7. CSV facility import

Template: `hostel/samples/facility_import_template.csv`

```csv
reg_no,residence_category,uses_college_bus,gender,day_scholar_address,emergency_contact_name,emergency_contact_phone
21CS001,HOSTELLER,false,MALE,,Parent Name,9876543210
21CS002,DAY_SCHOLAR,true,FEMALE,"12 Main Street, Coimbatore",Parent Name,9876543211
```

* `reg_no` aliases: `roll_no`, `registration_number`, `register_no`.
* `gender` aliases: `sex`; accepts `MALE`/`M`/`BOY`, `FEMALE`/`F`/`GIRL`, `OTHER`.
* `residence_category` aliases: `category`, `residence`; accepts
  `HOSTELLER` / `HOSTEL` / `BOARDER` and `DAY_SCHOLAR` / `DAY SCHOLAR`.
* `uses_college_bus` accepts `true/false`, `yes/no`, `1/0`.
* Rows are validated individually. Invalid rows are reported with row numbers;
  valid rows still import.
* Only the hostel facility tables are updated — the student master record is
  never overwritten.
* Verified existing selections are skipped unless `overwrite_verified=true`.
* Every run is stored in `StudentSyncRun` with total / created / updated /
  skipped / failed / duplicate counts.

---

## 8. Security notes

* JWT authentication (`rest_framework_simplejwt`) is inherited from project settings.
* Every endpoint declares an explicit permission class (`IsHostelAdmin`,
  `IsHostelStaff`, `IsHostellerStudent`, `IsStudentUser`, ...).
* Allocation integrity relies on database constraints **and** row locks inside
  transactions.
* Uploaded CSV files are decoded defensively and validated row by row; they are
  never executed.
* Administrative actions are written to `HostelAuditLog`.
* The student master data is read-only for this module; missing students are
  reported instead of being created.

---

## 9. Tests

```powershell
.\.venv\Scripts\python.exe manage.py test hostel -v 2
```

Covers selection windows, Day Scholar address validation, approval workflow,
hosteller gating, capacity enforcement, duplicate allocation prevention,
occupancy recalculation, dashboard counts and API permissions.

---

## 10. Operations modules (mess, visitors, movement, announcements, inventory)

These modules extend the existing tables instead of duplicating data.

| Module | Model | Key endpoints |
|---|---|---|
| Mess | `MessMenu`, `MealBooking`, `MessFeedback` | `/api/hostel/mess-menus/`, `/api/hostel/meal-bookings/`, `/api/hostel/mess-feedback/`, `/api/hostel/me/mess/bookings/` |
| Visitors | `Visitor` (`phone_number`, `logged_by`) | `/api/hostel/visitors/`, `.../summary/`, `.../{id}/checkout/` |
| Movement | `GatePass` (optional links to `applications.Application` and `StudentLeaveRequest`) | `/api/hostel/me/gate-passes/`, `/api/hostel/gate-passes/{id}/decision/`, `.../verify-exit/`, `.../verify-entry/`, `.../scan/`, `.../from-application/` |
| Announcements | `HostelNotice` (`priority`, `target_year`) + `HostelNoticeRead` | `/api/hostel/announcements/`, `/api/hostel/me/announcements/` |
| Inventory | `Asset` (`category`, `status`, `cost`) | `/api/hostel/assets/`, `.../summary/`, `.../{id}/status/` |
| Dashboard | aggregation service | `/api/hostel/dashboard/` |

### Gate pass lifecycle

1. Student submits a pass (`POST /api/hostel/me/gate-passes/`). A unique
   `qr_token` and PNG QR data URI are generated.
2. Warden approves or rejects (`POST /api/hostel/gate-passes/{id}/decision/`).
3. Security verifies the token at the gate (`.../scan/`) and records exit
   (`.../verify-exit/`).
4. On return, security records entry (`.../verify-entry/`). A return after
   `expected_in_time` sets `is_late_entry=True` and creates a `LateEntry` row.
5. If the pass is linked to an approved `StudentLeaveRequest`, that leave is
   marked `COMPLETED` on entry.

Existing gate-pass records in `applications.Application` remain the source of
truth for the legacy workflow. Approved applications can be imported with
`POST /api/hostel/gate-passes/from-application/`; the resulting `GatePass`
writes exit/entry scan timestamps back to `Application.gatepass_scanned_at` and
`Application.gatepass_in_scanned_at`, so both screens stay in sync.

### Automatic room allocation

`POST /api/hostel/allocations/auto/` accepts a list of selected Hosteller ids
(`students: [1, 2, ...]`) or `all_eligible: true`. It:

* only considers students whose residence category is `HOSTELLER` and who have
  no active allocation;
* matches rooms by gender (`BOYS` / `GIRLS` / `MIXED`);
* fills the least-occupied eligible rooms first and picks a free bed when the
  room has beds;
* returns each student's building/room/bed in `allocations`, and reports
  skipped students with reasons in `errors`.

The Allocations tab in the hostel admin UI exposes this through the
**Auto allocate** button with per-student checkboxes.

### Residence category rules

* `HOSTELLER` cannot select the College Bus (`uses_college_bus` must be false).
* `DAY_SCHOLAR` cannot be allocated hostel rooms; `allocate_room` rejects it and
  the automatic allocator never includes Day Scholars.
* The student portal disables the bus option for Hostellers and does not expose
  hostel room/mess services to Day Scholars.

### Frontend

The React workspace lives at `/hostel/modules` (staff) and
`/student/hostel/modules` (students). Components are under
`frontend/src/pages/hostel/modules/` and use `frontend/src/services/hostelOps.ts`.

### Tests

```powershell
.\.venv\Scripts\python.exe manage.py test hostel.tests.test_hostel_modules -v 2
```

Covers meal opt-in/headcounts, visitor check-in/out, the full gate pass approval
and late-entry flow, announcement acknowledgments and asset status updates.

