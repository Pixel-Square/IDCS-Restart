# Default Request Templates Setup

This document explains how the 10 default request templates are automatically loaded when setting up the system on a new device.

## Overview

The system includes **10 default templates**:

### Normal Templates (5)
For regular staff (STAFF, FACULTY, ASSISTANT, CLERK):
1. **Casual Leave** - 2-step approval (HOD → HR)
2. **Compensatory leave** - 2-step approval (HOD → HR)
3. **Late Entry Permission** - 2-step approval (HOD → HR)
4. **ON duty** - 2-step approval (HOD → HR)
5. **Others** - 2-step approval (HOD → HR)

### SPL Templates (5)
For administrative roles (IQAC, HR, PS, HOD, CFSW, EDC, COE, HAA):
1. **Casual Leave - SPL** - 1-step approval (PRINCIPAL only)
2. **Compensatory leave - SPL** - 1-step approval (PRINCIPAL only)
3. **Late Entry Permission - SPL** - 1-step approval (PRINCIPAL only)
4. **ON duty - SPL** - 1-step approval (PRINCIPAL only)
5. **Others - SPL** - 1-step approval (PRINCIPAL only)

## Automatic Setup (Recommended)

Templates are **automatically created** when running migrations on a fresh database:

```bash
cd backend
python manage.py migrate
```

This will:
- Create all 10 templates with complete configurations
- Set up approval workflows
- Configure leave policies and allocations
- Set attendance actions
- Assign role permissions

## Manual Setup (Optional)

If you need to reload templates (e.g., after modifications):

```bash
# Load/reload all templates (will skip if templates exist)
python manage.py load_default_templates

# Force reload (WARNING: Deletes existing templates!)
python manage.py load_default_templates --force
```

## Template Configurations

Each template includes:

### 1. Form Schema
- Fields for user input (reason, dates, noon selection, etc.)
- Field types, labels, and validation rules
- Help text for user guidance

### 2. Leave Policy
- **Action**: deduct (for leaves), neutral (for OD/others)
- **Attendance Status**: CL, COL, OD, etc.
- **Allotment**: Role-based leave allocation
  - STAFF: 12 days
  - HOD: 12 days
- **Split Date**: July 1st (for half-yearly allocation)
- **Overdraft**: LOP (Loss of Pay) for overdraft

### 3. Attendance Action
- **Change Status**: Automatically update attendance when approved
- **Status Mapping**: absent → present
- **Date Application**: Apply to from_date and to_date range
- **Notes**: Add approval notes to attendance records

### 4. Approval Workflow
- **Normal Templates**: HOD approval → HR approval
- **SPL Templates**: PRINCIPAL approval only (single step)

### 5. Role Permissions
- **Normal Templates**: ['STAFF', 'FACULTY', 'ASSISTANT', 'CLERK']
- **SPL Templates**: ['IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA']

## Editability

All templates are **fully editable by HR** through the Django admin interface:

1. Navigate to: `/admin/staff_requests/requesttemplate/`
2. Select a template to edit
3. Modify any configuration:
   - Form fields
   - Leave policies
   - Approval steps
   - Role permissions
   - Attendance actions

## Current Allocations (2026)

### Casual Leave
- **Period**: January 1, 2026 - December 31, 2026
- **Allocation**: 12 days per year
- **Split Date**: July 1, 2026 (6 days per semester)
- **Reset**: Monthly
- **Overdraft**: Continues as LOP (Loss of Pay)

### Compensatory Leave (COL)
- **Allocation**: Earned based on holiday work
- **Full Day**: 8 hours = 1.0 COL
- **Half Day**: 4 hours = 0.5 COL
- **Deduction**: Applied when leave is taken

### ON Duty (OD)
- **Types**:
  - ODB - Basic
  - ODR - Research
  - ODP - Professional
  - ODO - Out Reach
- **Attendance**: Marked as present when approved

## Migration Between Devices

When deploying to a new device:

1. **Clone the repository** with main branch
```bash
git clone <repository-url>
cd IDCS-Restart
```

2. **Set up the backend**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

3. **Run migrations** (templates auto-load)
```bash
python manage.py migrate
```

4. **Verify templates**
```bash
python manage.py shell
>>> from staff_requests.models import RequestTemplate
>>> RequestTemplate.objects.count()
10
```

5. **All done!** Templates are ready with:
   - ✓ Complete configurations
   - ✓ Approval workflows
   - ✓ Leave allocations
   - ✓ Role permissions
   - ✓ Ready for HR to edit

## Verification

After setup, verify templates are loaded correctly:

```bash
# Run verification script
Get-Content scripts\verify_templates.py | python manage.py shell
```

Expected output:
```
Template Configuration Verification
================================================================================

Template: Casual Leave
  Active: True
  Allowed Roles: ['STAFF', 'FACULTY', 'ASSISTANT', 'CLERK']
  Form Fields: 5
  Approval Flow: HOD → HR
  Leave Policy: deduct (status: CL)
    Allotment: {'HOD': 12, 'STAFF': 12}
  Attendance: Changes absent → present

[... 9 more templates ...]

Total: 10 templates loaded
✓ All configurations verified
```

## Troubleshooting

### Templates not created
If templates are missing after migration:
```bash
python manage.py load_default_templates
```

### Need to reset templates
1. Backup any custom modifications
2. Run: `python manage.py load_default_templates --force`
3. Reapply custom modifications through admin

### Approval workflow not working
1. Check that Role objects exist for: HOD, HR, PRINCIPAL
2. Verify users have appropriate role assignments
3. Check template approval_steps in admin

## Support

For issues or questions:
1. Check migration status: `python manage.py showmigrations staff_requests`
2. Review migration 0011_load_default_templates
3. Verify template count: `RequestTemplate.objects.count()`
4. Contact system administrator
