# Staff Requests App - Integration Guide

## Quick Start

### 1. Install the App

Add to `settings.py`:

```python
INSTALLED_APPS = [
    # ... existing apps
    'staff_requests',
]
```

### 2. Include URLs

In your main `urls.py`:

```python
from django.urls import path, include

urlpatterns = [
    # ... existing patterns
    path('api/staff-requests/', include('staff_requests.urls')),
]
```

### 3. Run Migrations

```bash
cd backend
python manage.py makemigrations staff_requests
python manage.py migrate
```

### 4. Create Superuser (if not already created)

```bash
python manage.py createsuperuser
```

## Critical Integration Steps

### Step 1: Configure Role Checking

**File: `backend/staff_requests/views.py`**

Update the `is_user_approver_for_request()` function to match your user model:

```python
def is_user_approver_for_request(user, staff_request, approver_role):
    """
    Implement your role checking logic here.
    Return True if user can approve this request at this step.
    """
    
    # Example for your ERP system:
    
    # 1. Check if user is in the approver role group
    if user.groups.filter(name=approver_role).exists():
        return True
    
    # 2. For HOD role, check department hierarchy
    if approver_role == 'HOD':
        try:
            # Assuming you have a Department model and profile
            user_dept = user.profile.department
            applicant_dept = staff_request.applicant.profile.department
            
            if user_dept == applicant_dept and user.profile.is_hod:
                return True
        except AttributeError:
            pass
    
    # 3. For HR role
    if approver_role == 'HR':
        if hasattr(user, 'profile') and user.profile.is_hr:
            return True
    
    # 4. For Principal role
    if approver_role == 'PRINCIPAL':
        if hasattr(user, 'profile') and user.profile.is_principal:
            return True
    
    # 5. Superuser override
    if user.is_superuser:
        return True
    
    return False
```

Update `can_user_apply_with_template()` similarly:

```python
def can_user_apply_with_template(user, template):
    """Check if user's role allows them to use this template"""
    
    if not template.is_active:
        return False
    
    if not template.allowed_roles:
        return True  # No restrictions
    
    # Check user's role/group
    user_role = getattr(user.profile, 'role', None) if hasattr(user, 'profile') else None
    
    if user_role in template.allowed_roles:
        return True
    
    # Check user groups
    if user.groups.filter(name__in=template.allowed_roles).exists():
        return True
    
    return user.is_superuser
```

### Step 2: Add Permissions

Update ViewSet permissions as needed:

```python
from .permissions import IsAdminOrHR

class RequestTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrHR]
```

### Step 3: Setup Initial Data

Create an admin script to set up initial templates:

**File: `backend/staff_requests/management/commands/setup_request_templates.py`**

```python
from django.core.management.base import BaseCommand
from staff_requests.models import RequestTemplate, ApprovalStep


class Command(BaseCommand):
    help = 'Set up initial request templates'
    
    def handle(self, *args, **options):
        # Leave Request Template
        leave_template, created = RequestTemplate.objects.get_or_create(
            name='Leave Request',
            defaults={
                'description': 'General leave application for all staff',
                'is_active': True,
                'form_schema': [
                    {
                        'name': 'from_date',
                        'type': 'date',
                        'label': 'From Date',
                        'required': True
                    },
                    {
                        'name': 'to_date',
                        'type': 'date',
                        'label': 'To Date',
                        'required': True
                    },
                    {
                        'name': 'leave_type',
                        'type': 'select',
                        'label': 'Leave Type',
                        'required': True,
                        'options': ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Maternity Leave']
                    },
                    {
                        'name': 'reason',
                        'type': 'textarea',
                        'label': 'Reason',
                        'required': True
                    }
                ],
                'allowed_roles': ['FACULTY', 'STAFF']
            }
        )
        
        if created:
            # Create approval steps
            ApprovalStep.objects.create(
                template=leave_template,
                step_order=1,
                approver_role='HOD'
            )
            ApprovalStep.objects.create(
                template=leave_template,
                step_order=2,
                approver_role='HR'
            )
            ApprovalStep.objects.create(
                template=leave_template,
                step_order=3,
                approver_role='PRINCIPAL'
            )
            
            self.stdout.write(self.style.SUCCESS('✓ Leave Request template created'))
        
        # OD Request Template
        od_template, created = RequestTemplate.objects.get_or_create(
            name='OD Request',
            defaults={
                'description': 'On Duty request for official work',
                'is_active': True,
                'form_schema': [
                    {
                        'name': 'date',
                        'type': 'date',
                        'label': 'Date',
                        'required': True
                    },
                    {
                        'name': 'purpose',
                        'type': 'textarea',
                        'label': 'Purpose',
                        'required': True
                    },
                    {
                        'name': 'location',
                        'type': 'text',
                        'label': 'Location',
                        'required': True
                    }
                ],
                'allowed_roles': ['FACULTY', 'STAFF']
            }
        )
        
        if created:
            ApprovalStep.objects.create(
                template=od_template,
                step_order=1,
                approver_role='HOD'
            )
            ApprovalStep.objects.create(
                template=od_template,
                step_order=2,
                approver_role='PRINCIPAL'
            )
            
            self.stdout.write(self.style.SUCCESS('✓ OD Request template created'))
        
        # Permission Request Template
        permission_template, created = RequestTemplate.objects.get_or_create(
            name='Permission',
            defaults={
                'description': 'Short permission for few hours',
                'is_active': True,
                'form_schema': [
                    {
                        'name': 'date',
                        'type': 'date',
                        'label': 'Date',
                        'required': True
                    },
                    {
                        'name': 'from_time',
                        'type': 'time',
                        'label': 'From Time',
                        'required': True
                    },
                    {
                        'name': 'to_time',
                        'type': 'time',
                        'label': 'To Time',
                        'required': True
                    },
                    {
                        'name': 'reason',
                        'type': 'textarea',
                        'label': 'Reason',
                        'required': True
                    }
                ],
                'allowed_roles': ['FACULTY', 'STAFF']
            }
        )
        
        if created:
            ApprovalStep.objects.create(
                template=permission_template,
                step_order=1,
                approver_role='HOD'
            )
            
            self.stdout.write(self.style.SUCCESS('✓ Permission template created'))
        
        self.stdout.write(self.style.SUCCESS('\nSetup complete! ✓'))
```

Run the command:

```bash
python manage.py setup_request_templates
```

## Frontend Integration

### API Client Example

```javascript
// services/staffRequestsApi.js

const API_BASE = '/api/staff-requests';

export const staffRequestsApi = {
  // Get active templates
  getActiveTemplates: async () => {
    const response = await fetch(`${API_BASE}/templates/active/`);
    return response.json();
  },
  
  // Submit a new request
  submitRequest: async (templateId, formData) => {
    const response = await fetch(`${API_BASE}/requests/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        form_data: formData
      })
    });
    return response.json();
  },
  
  // Get my requests
  getMyRequests: async () => {
    const response = await fetch(`${API_BASE}/requests/my_requests/`);
    return response.json();
  },
  
  // Get pending approvals
  getPendingApprovals: async () => {
    const response = await fetch(`${API_BASE}/requests/pending_approvals/`);
    return response.json();
  },
  
  // Process approval
  processApproval: async (requestId, action, comments) => {
    const response = await fetch(`${API_BASE}/requests/${requestId}/process_approval/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comments })
    });
    return response.json();
  }
};
```

### React Component Example

```jsx
// components/StaffRequestForm.jsx

import { useState, useEffect } from 'react';
import { staffRequestsApi } from '../services/staffRequestsApi';

export function StaffRequestForm() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  
  useEffect(() => {
    loadTemplates();
  }, []);
  
  const loadTemplates = async () => {
    const data = await staffRequestsApi.getActiveTemplates();
    setTemplates(data);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const result = await staffRequestsApi.submitRequest(
        selectedTemplate.id,
        formData
      );
      alert('Request submitted successfully!');
    } catch (error) {
      alert('Error submitting request');
    }
  };
  
  const renderFormField = (field) => {
    switch (field.type) {
      case 'date':
        return (
          <input
            type="date"
            value={formData[field.name] || ''}
            onChange={(e) => setFormData({
              ...formData,
              [field.name]: e.target.value
            })}
            required={field.required}
          />
        );
      
      case 'textarea':
        return (
          <textarea
            value={formData[field.name] || ''}
            onChange={(e) => setFormData({
              ...formData,
              [field.name]: e.target.value
            })}
            required={field.required}
          />
        );
      
      case 'select':
        return (
          <select
            value={formData[field.name] || ''}
            onChange={(e) => setFormData({
              ...formData,
              [field.name]: e.target.value
            })}
            required={field.required}
          >
            <option value="">Select...</option>
            {field.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      
      default:
        return (
          <input
            type="text"
            value={formData[field.name] || ''}
            onChange={(e) => setFormData({
              ...formData,
              [field.name]: e.target.value
            })}
            required={field.required}
          />
        );
    }
  };
  
  return (
    <div>
      <h2>Submit Request</h2>
      
      <div>
        <label>Request Type:</label>
        <select onChange={(e) => {
          const template = templates.find(t => t.id === parseInt(e.target.value));
          setSelectedTemplate(template);
          setFormData({});
        }}>
          <option value="">Select request type...</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      
      {selectedTemplate && (
        <form onSubmit={handleSubmit}>
          {selectedTemplate.form_schema.map(field => (
            <div key={field.name}>
              <label>
                {field.label}
                {field.required && <span>*</span>}
              </label>
              {renderFormField(field)}
            </div>
          ))}
          
          <button type="submit">Submit Request</button>
        </form>
      )}
    </div>
  );
}
```

## Testing the Setup

### 1. Access Django Admin

Visit `http://localhost:8000/admin/staff_requests/`

- Create some RequestTemplates
- Add ApprovalSteps
- Test creating StaffRequests

### 2. Test API Endpoints

```bash
# Get active templates
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/staff-requests/templates/active/

# Submit a request
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": 1,
    "form_data": {
      "from_date": "2026-03-15",
      "to_date": "2026-03-17",
      "leave_type": "Casual Leave",
      "reason": "Family function"
    }
  }' \
  http://localhost:8000/api/staff-requests/requests/

# Get pending approvals
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/staff-requests/requests/pending_approvals/

# Process approval
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "comments": "Approved"
  }' \
  http://localhost:8000/api/staff-requests/requests/1/process_approval/
```

## Next Steps

1. ✅ Implement role checking functions
2. ✅ Set up initial templates
3. ✅ Create frontend UI components
4. Add email/SMS notifications on approval actions
5. Add file attachments support (extend form_schema)
6. Add request cancellation feature
7. Add approval delegation
8. Add analytics/reports

## Troubleshooting

### Issue: Role checking not working

**Solution**: Make sure you've updated `is_user_approver_for_request()` to match your user model structure.

### Issue: Pending approvals not showing

**Solution**: Check that:
1. User has the correct role/group
2. Request is in 'pending' status
3. current_step matches an ApprovalStep with user's role

### Issue: Form validation failing

**Solution**: Ensure `form_data` keys match `form_schema` field names exactly.

## Support

For issues or questions, refer to the README.md or contact the development team.
