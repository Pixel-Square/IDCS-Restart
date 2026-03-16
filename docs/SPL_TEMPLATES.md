# SPL (Special) Templates Implementation

## Overview

Special versions of 5 request forms have been created for specific administrative roles. These SPL templates have streamlined approval (Principal only) while maintaining all the same leave balance, attendance, and request processing logic as the normal forms.

## SPL Roles

The following roles use SPL forms instead of normal forms:
- **IQAC** - Internal Quality Assurance Cell
- **HR** - Human Resources
- **PS** - Personal Secretary
- **HOD** - Head of Department
- **CFSW** - Coordinator for Student Welfare
- **EDC** - Entrepreneurship Development Cell
- **COE** - Controller of Examinations
- **HAA** - Head Administrative Assistant

## SPL Templates Created

1. **Casual Leave - SPL**
   - Approval: Principal only (1 step)
   - Leave Policy: Same as normal CL (12 days allotment, LOP tracking, split allocation on July 1st)
   - Attendance Status: CL

2. **Compensatory leave - SPL**
   - Approval: Principal only (1 step)
   - Leave Policy: Same as normal COL (earn action for working on holidays)
   - Attendance Status: COL

3. **Late Entry Permission - SPL**
   - Approval: Principal only (1 step)
   - Attendance Action: Changes status from absent to present
   - Leave Policy: Neutral (no balance deduction)

4. **ON duty - SPL**
   - Approval: Principal only (1 step)  
   - Leave Policy: Same as normal OD
   - Attendance Status: OD

5. **Others - SPL**
   - Approval: Principal only (1 step)
   - Leave Policy: Same as normal Others form

## Template Visibility Logic

### For Users with SPL Roles:
- ✅ Can see and apply with **SPL templates only**
- ❌ Cannot see normal templates

### For Regular Staff:
- ✅ Can see and apply with **normal templates only**
- ❌ Cannot see SPL templates

### For Superusers:
- ✅ Can see and apply with **all templates**

## Implementation Details

### Backend Changes

1. **Management Command** (`create_spl_templates.py`):
   - Deletes/deactivates "Test Casual Leave" template
   - Creates 5 SPL templates with identical configurations
   - Sets approval workflow to Principal only
   - Sets allowed_roles to SPL roles

2. **Template Visibility** (`views.py` - `can_user_apply_with_template`):
   ```python
   # SPL logic:
   # - If user has any SPL role → show only SPL templates
   # - If user has no SPL role → show only normal templates
   # - Superusers → show all templates
   ```

3. **API Filtering** (`views.py` - `active()` endpoint):
   - `/api/staff-requests/templates/active/` now filters based on user's roles
   - Frontend only receives templates user can actually apply with

### Database State

All templates properly configured:
- **Normal templates**: 2-step approval (HOD → HR typically)
- **SPL templates**: 1-step approval (Principal only)
- **Test Casual Leave**: Marked inactive (had existing requests, couldn't delete)

### Leave Balance & Attendance Logic

✅ **Unchanged** - All SPL templates use the same:
- `leave_policy` (allotment, deduction, earning, LOP tracking)
- `attendance_action` (status changes on approval)
- Form schemas (same fields)

The only difference is the approval workflow.

## Usage

### Creating SPL Templates (Already Done)
```bash
python manage.py create_spl_templates
```

### Re-running After Template Changes
If the normal templates are updated and you want to sync changes to SPL templates:
```bash
python manage.py create_spl_templates
```
This will update existing SPL templates with the latest configurations from normal templates.

### Checking Template Status
```bash
python manage.py shell --command="from staff_requests.models import RequestTemplate; print('\n'.join([f'{t.name} - Active: {t.is_active}, Steps: {t.approval_steps.count()}' for t in RequestTemplate.objects.all().order_by('name')]))"
```

## Testing

### Test Scenario 1: SPL Role User
1. Login as user with IQAC/HR/PS/HOD/CFSW/EDC/COE/HAA role
2. Navigate to "New Request" modal
3. ✅ Should see only SPL templates (with " - SPL" suffix)
4. ❌ Should NOT see normal templates

### Test Scenario 2: Regular Staff User  
1. Login as user with only STAFF/FACULTY role (no SPL roles)
2. Navigate to "New Request" modal
3. ✅ Should see only normal templates
4. ❌ Should NOT see SPL templates

### Test Scenario 3: Application Processing
1. SPL user applies for "Casual Leave - SPL"
2. Request goes to Principal for approval
3. Upon approval:
   - Leave balance decreases correctly
   - Attendance marked as CL
   - LOP tracking works correctly
4. All logic matches normal Casual Leave behavior

### Test Scenario 4: Dual Role User
1. User has both STAFF and HOD roles
2. User is considered an SPL role user (has HOD)
3. ✅ Should see only SPL templates
4. ❌ Should NOT see normal templates

## Troubleshooting

### Issue: Normal templates showing to SPL users
**Solution**: Check that user has the correct role assigned in `accounts_userrole` table.

### Issue: No templates showing at all
**Solution**: 
1. Verify user has `user_roles` relationship populated
2. Check template `is_active` status
3. Ensure `allowed_roles` is correctly set

### Issue: Backend rejects request submission
**Solution**: The `can_user_apply_with_template` check runs on both:
- Template listing (frontend display)
- Request creation (backend validation)

If frontend shows template but backend rejects, check for:
- Race condition (template updated between list and create)
- Frontend cache (hard refresh)

## File Locations

- **Backend**:
  - Template logic: `backend/staff_requests/views.py`
  - Models: `backend/staff_requests/models.py`
  - Management command: `backend/staff_requests/management/commands/create_spl_templates.py`

- **Frontend**:
  - No changes required (automatically uses filtered templates from API)
  - Service: `frontend/src/services/staffRequests.ts`
  - New Request Modal: `frontend/src/pages/staff-requests/NewRequestModal.tsx`

## Future Enhancements

1. **Dynamic SPL Role Configuration**: Store SPL roles in database settings instead of hardcoding
2. **Template Inheritance**: Create a parent-child relationship between normal and SPL templates
3. **Bulk Updates**: Command to sync all SPL templates when normal templates change
4. **Audit Trail**: Log when users are shown SPL vs normal templates
