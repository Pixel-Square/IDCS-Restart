# Default Templates Implementation Summary

## Overview

Successfully implemented a system for automatically loading 10 default request templates with all configurations when deploying to a new device.

## What Was Implemented

### 1. Management Command: `load_default_templates`
**Location:** `backend/staff_requests/management/commands/load_default_templates.py`

**Features:**
- Programmatic template creation
- Complete configuration (form schemas, approval workflows, leave policies, etc.)
- Idempotent (safe to run multiple times)
- Force reload option (`--force`)

**Usage:**
```bash
# Load templates (skips if already exist)
python manage.py load_default_templates

# Force reload (deletes existing)
python manage.py load_default_templates --force
```

### 2. Data Migration: `0011_load_default_templates`
**Location:** `backend/staff_requests/migrations/0011_load_default_templates.py`

**Features:**
- Automatically runs during `python manage.py migrate`
- Creates all 10 templates on fresh database
- Skips if templates already exist (safe for re-running)
- Self-contained (no external dependencies)

### 3. Documentation: `DEFAULT_TEMPLATES_SETUP.md`
**Location:** `docs/DEFAULT_TEMPLATES_SETUP.md`

**Contents:**
- Complete template overview
- Automatic vs manual setup instructions
- Template configuration details
- Migration guide for new devices
- Troubleshooting section
- Verification procedures

### 4. Test Scripts

#### a. `test_default_templates.py`
**Location:** `backend/scripts/test_default_templates.py`

**Tests:**
- Phase 1: Template count (10 total: 5 normal + 5 SPL)
- Phase 2: Role permissions (COMMON_ROLES vs SPL_ROLES)
- Phase 3: Approval workflows (HOD→HR vs PRINCIPAL)
- Phase 4: Leave policies (action, status, allotment)
- Phase 5: Form schemas (field counts)
- Phase 6: HR editability

**Usage:**
```bash
Get-Content scripts\test_default_templates.py | python manage.py shell
```

#### b. `verify_templates.py`
**Location:** `backend/scripts/verify_templates.py`

**Purpose:** Quick verification of all template configurations

**Usage:**
```bash
Get-Content scripts\verify_templates.py | python manage.py shell
```

## Template Specifications

### Normal Templates (5)
**For:** STAFF, FACULTY, ASSISTANT, CLERK  
**Approval:** HOD → HR (2 steps)

1. **Casual Leave**
   - Form: 5 fields (reason, from_date, from_noon, to_date, to_noon)
   - Leave Policy: Deduct (CL status, 12 days/year, split on July 1st)
   - Attendance: absent → present
   - Overdraft: LOP

2. **Compensatory leave**
   - Form: 5 fields (same as Casual Leave)
   - Leave Policy: Deduct (COL status, earned from holiday work)
   - Attendance: absent → present

3. **Late Entry Permission**
   - Form: 3 fields (reason, date, in_time)
   - Leave Policy: Neutral (no deduction)
   - Attendance: No change

4. **ON duty**
   - Form: 6 fields (type, reason, from_date, from_noon, to_date, to_noon)
   - Leave Policy: Neutral (OD status)
   - Attendance: absent → present

5. **Others**
   - Form: 5 fields (reason, from_date, from_noon, to_date, to_noon)
   - Leave Policy: Neutral
   - Attendance: No change

### SPL Templates (5)
**For:** IQAC, HR, PS, HOD, CFSW, EDC, COE, HAA  
**Approval:** PRINCIPAL (1 step)

Same configurations as normal templates but with:
- " - SPL" suffix
- SPL roles only
- Single-step approval (PRINCIPAL)

## Migration Process for New Device

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd IDCS-Restart
```

### Step 2: Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Step 3: Configure Database
```bash
copy .env.sample .env
# Edit .env with database credentials
```

### Step 4: Run Migrations
```bash
python manage.py migrate
```
**Result:** 10 templates automatically created with all configurations!

### Step 5: Verify
```bash
Get-Content scripts\test_default_templates.py | python manage.py shell
```
**Expected:** All 6 phases pass

### Step 6: Create Superuser & Start
```bash
python manage.py createsuperuser
python manage.py runserver
```

## HR Editability

All templates are fully editable by HR users through Django admin:

**Access:** `/admin/staff_requests/requesttemplate/`

**Editable Fields:**
- Form schema (add/remove/modify fields)
- Leave policy (action, allotment, dates)
- Approval steps (add/remove/reorder)
- Role permissions (allowed_roles list)
- Attendance actions (status changes)
- Description and active status

**Permissions Required:**
- User must have HR role
- Or be superuser/staff with appropriate permissions

## Technical Details

### Template Structure

Each template includes:

1. **Basic Info**
   - name (unique identifier)
   - description
   - is_active (boolean)

2. **Form Schema** (JSONField)
   ```json
   [
     {
       "name": "field_name",
       "type": "text|date|select|time",
       "label": "Human Label",
       "required": true,
       "options": ["opt1", "opt2"],  // for select
       "help_text": "Help text"
     }
   ]
   ```

3. **Allowed Roles** (ArrayField)
   ```python
   ["STAFF", "FACULTY", "ASSISTANT", "CLERK"]
   # or
   ["IQAC", "HR", "PS", "HOD", "CFSW", "EDC", "COE", "HAA"]
   ```

4. **Leave Policy** (JSONField)
   ```json
   {
     "action": "deduct|earn|neutral",
     "attendance_status": "CL|COL|OD|...",
     "allotment_per_role": {"STAFF": 12, "HOD": 12},
     "from_date": "2026-01-01",
     "to_date": "2026-12-31",
     "split_date": "2026-07-01",
     "reset_duration": "monthly",
     "overdraft_name": "LOP"
   }
   ```

5. **Attendance Action** (JSONField)
   ```json
   {
     "change_status": true,
     "from_status": "absent",
     "to_status": "present",
     "apply_to_dates": ["from_date", "to_date"],
     "date_format": "YYYY-MM-DD",
     "add_notes": true,
     "notes_template": "Leave approved"
   }
   ```

6. **Approval Steps** (Related Model)
   - Separate `ApprovalStep` records
   - step_order: 1, 2, 3...
   - approver_role: "HOD", "HR", "PRINCIPAL"

### Database Migrations

**Migration Chain:**
```
0009_add_ledger_policy_field
  ↓
0010_seed_default_templates (empty)
  ↓
0011_load_default_templates (NEW - loads 10 templates)
```

**Key Features:**
- Idempotent (checks if templates exist)
- Atomic transaction (all or nothing)
- Prints progress during migration
- Safe for rollback

## Testing Results

All tests passed ✓

```
Phase 1 (Count): ✓
Phase 2 (Roles): ✓
Phase 3 (Workflows): ✓
Phase 4 (Leave Policies): ✓
Phase 5 (Form Schemas): ✓
Phase 6 (HR Editability): ✓
```

**Summary:**
- 10 templates loaded (5 normal + 5 SPL)
- All configurations correct
- Approval workflows set
- Role permissions assigned
- HR can edit all templates
- Ready for production use

## Files Created/Modified

### New Files
1. `backend/staff_requests/management/commands/load_default_templates.py`
2. `backend/staff_requests/migrations/0011_load_default_templates.py`
3. `docs/DEFAULT_TEMPLATES_SETUP.md`
4. `backend/scripts/test_default_templates.py`
5. `backend/scripts/verify_templates.py`

### Modified Files
1. `README.md` - Added default templates section

## Benefits

1. **Ease of Deployment**
   - No manual template creation
   - Single command: `python manage.py migrate`
   - Consistent across all installations

2. **Version Control**
   - Templates in code (not just database)
   - Changes tracked in Git
   - Easy to review and audit

3. **Maintainability**
   - Centralized configuration
   - Easy to update (modify command, run with --force)
   - Documentation included

4. **Testing**
   - Comprehensive test coverage
   - Verification scripts
   - Easy to validate deployments

5. **Flexibility**
   - HR can edit after loading
   - Force reload option
   - Manual command available

## Future Enhancements

Potential improvements:
1. Add template versioning
2. Export/import individual templates
3. Template cloning functionality
4. Template change history
5. Template validation rules
6. Template testing framework

## Conclusion

Successfully implemented a robust system for default template management that ensures consistent deployment across all devices while maintaining HR editability. All tests passed, documentation complete, and system ready for production deployment.
