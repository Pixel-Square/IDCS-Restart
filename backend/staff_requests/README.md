# Staff Requests App

A dynamic form and workflow engine for managing Staff Leaves, ODs (On Duty), Permissions, and other staff requests in a College ERP system.

## Features

- **Dynamic Form Builder**: HR can create custom request types with flexible form schemas
- **Sequential Approval Workflow**: Define multi-step approval hierarchies based on user roles
- **Role-Based Access Control**: Configure which roles can submit which request types
- **Approval Dashboard**: Approvers see only requests pending their action
- **Complete Audit Trail**: Track all approval actions with comments and timestamps
- **Workflow Progress Tracking**: Real-time visibility into request status and approval progress

## Architecture

### Models

1. **RequestTemplate**: Defines request types (Leave, OD, etc.) with custom form fields and allowed roles
2. **ApprovalStep**: Defines sequential approval workflow steps with required approver roles
3. **StaffRequest**: Actual request submissions with form data and approval status
4. **ApprovalLog**: Audit trail of all approval/rejection actions

### Key Workflows

#### HR Setup
1. Create RequestTemplate with form_schema (dynamic fields)
2. Define allowed_roles for who can apply
3. Add ApprovalSteps in order (HOD → HR → Principal, etc.)

#### Staff Application
1. Staff selects active RequestTemplate
2. Fills dynamic form based on form_schema
3. Submits StaffRequest with form_data

#### Approval Process
1. Request starts at step 1 (current_step = 1)
2. Approver with matching role sees request in pending_approvals
3. Approver takes action (approve/reject) with comments
4. If approved: moves to next step or marks as approved if final
5. If rejected: request marked as rejected, workflow stops

## API Endpoints

### Request Templates (Admin/HR Only)

```
GET    /api/staff-requests/templates/                      - List all templates
POST   /api/staff-requests/templates/                      - Create template
GET    /api/staff-requests/templates/{id}/                 - Get template details
PUT    /api/staff-requests/templates/{id}/                 - Update template
DELETE /api/staff-requests/templates/{id}/                 - Delete template
GET    /api/staff-requests/templates/active/               - List active only
POST   /api/staff-requests/templates/{id}/add_step/        - Add approval step
POST   /api/staff-requests/templates/{id}/reorder_steps/   - Reorder steps
```

### Staff Requests

```
GET    /api/staff-requests/requests/                       - List user's requests
POST   /api/staff-requests/requests/                       - Submit new request
GET    /api/staff-requests/requests/{id}/                  - Get request details
GET    /api/staff-requests/requests/pending_approvals/     - Pending approvals (KEY)
POST   /api/staff-requests/requests/{id}/process_approval/ - Approve/reject
GET    /api/staff-requests/requests/my_requests/           - User's own requests
GET    /api/staff-requests/requests/department_requests/   - Department requests
GET    /api/staff-requests/requests/{id}/approval_history/ - Approval history
```

## Setup Instructions

### 1. Add to `INSTALLED_APPS`

In your Django `settings.py`:

```python
INSTALLED_APPS = [
    # ... other apps
    'staff_requests',
]
```

### 2. Include URLs

In your main `urls.py`:

```python
urlpatterns = [
    # ... other patterns
    path('api/staff-requests/', include('staff_requests.urls')),
]
```

### 3. Run Migrations

```bash
python manage.py makemigrations staff_requests
python manage.py migrate staff_requests
```

### 4. Configure Role Checking

**IMPORTANT**: Update the `is_user_approver_for_request()` function in `views.py` to match your user/role system:

```python
def is_user_approver_for_request(user, staff_request, approver_role):
    # Example: Check user groups
    if user.groups.filter(name=approver_role).exists():
        return True
    
    # Example: Check user profile
    if hasattr(user, 'profile') and user.profile.role == approver_role:
        return True
    
    # Example: Department hierarchy for HOD
    if approver_role == 'HOD':
        if user.profile.is_hod and user.profile.department_id == staff_request.applicant.profile.department_id:
            return True
    
    return False
```

Similarly, update `can_user_apply_with_template()` for role-based application permissions.

### 5. Update Permissions

In `views.py`, update the permission classes:

```python
from .permissions import IsAdminOrHR

class RequestTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrHR]
```

## Usage Examples

### Creating a Leave Request Template

```json
POST /api/staff-requests/templates/

{
  "name": "Leave Request",
  "description": "General leave application for all staff",
  "is_active": true,
  "form_schema": [
    {
      "name": "from_date",
      "type": "date",
      "label": "From Date",
      "required": true
    },
    {
      "name": "to_date",
      "type": "date",
      "label": "To Date",
      "required": true
    },
    {
      "name": "leave_type",
      "type": "select",
      "label": "Leave Type",
      "required": true,
      "options": ["Casual Leave", "Sick Leave", "Earned Leave"]
    },
    {
      "name": "reason",
      "type": "textarea",
      "label": "Reason",
      "required": true
    }
  ],
  "allowed_roles": ["FACULTY", "STAFF"],
  "approval_steps": [
    {
      "step_order": 1,
      "approver_role": "HOD"
    },
    {
      "step_order": 2,
      "approver_role": "HR"
    },
    {
      "step_order": 3,
      "approver_role": "PRINCIPAL"
    }
  ]
}
```

### Submitting a Request

```json
POST /api/staff-requests/requests/

{
  "template_id": 1,
  "form_data": {
    "from_date": "2026-03-15",
    "to_date": "2026-03-17",
    "leave_type": "Casual Leave",
    "reason": "Family function"
  }
}
```

### Processing Approval

```json
POST /api/staff-requests/requests/5/process_approval/

{
  "action": "approve",
  "comments": "Approved. Ensure handover is complete."
}
```

## Response Structure

### StaffRequest Detail Response

```json
{
  "id": 5,
  "applicant": {
    "id": 10,
    "username": "john.doe",
    "email": "john@example.com",
    "full_name": "John Doe"
  },
  "template": {
    "id": 1,
    "name": "Leave Request",
    "form_schema": [...],
    "approval_steps": [...]
  },
  "form_data": {
    "from_date": "2026-03-15",
    "to_date": "2026-03-17",
    "leave_type": "Casual Leave",
    "reason": "Family function"
  },
  "status": "pending",
  "current_step": 2,
  "current_approver_role": "HR",
  "total_steps": 3,
  "completed_steps": 1,
  "is_final_step": false,
  "workflow_progress": [
    {
      "step_order": 1,
      "approver_role": "HOD",
      "is_current": false,
      "is_completed": true,
      "status": "approved",
      "approver": {...},
      "comments": "Approved",
      "action_date": "2026-03-07T10:30:00Z"
    },
    {
      "step_order": 2,
      "approver_role": "HR",
      "is_current": true,
      "is_completed": false,
      "status": null
    },
    {
      "step_order": 3,
      "approver_role": "PRINCIPAL",
      "is_current": false,
      "is_completed": false,
      "status": null
    }
  ],
  "approval_logs": [...],
  "created_at": "2026-03-07T09:00:00Z",
  "updated_at": "2026-03-07T10:30:00Z"
}
```

## Customization Points

1. **Role Checking**: Update `is_user_approver_for_request()` and `can_user_apply_with_template()` in `views.py`
2. **Permissions**: Customize `IsAdminOrHR` and other permissions in `permissions.py`
3. **Form Validation**: Extend `RequestTemplate.validate_form_data()` for custom validation rules
4. **Notifications**: Add email/SMS notifications in approval action handlers
5. **Department Filtering**: Implement `department_requests` endpoint logic
6. **Auto-rejection**: Add timeout logic for pending requests
7. **Delegation**: Allow approvers to delegate approval authority

## Testing

Run Django tests:

```bash
python manage.py test staff_requests
```

## License

Internal use for College ERP System
