# Staff Requests Frontend Documentation

## Overview

The Staff Requests frontend provides a complete UI for the dynamic form and workflow engine that allows staff to submit various types of requests (leave, OD, permissions) through configurable templates with sequential approval workflows.

## Architecture

### Components Structure

```
frontend/src/
├── pages/staff-requests/
│   ├── TemplateManagementPage.tsx      # HR dashboard for template CRUD
│   ├── TemplateEditorModal.tsx         # Multi-tab form builder
│   ├── MyRequestsPage.tsx              # Staff submission history
│   ├── NewRequestModal.tsx             # Two-step request submission
│   ├── DynamicFormRenderer.tsx         # Renders JSON form schemas
│   ├── RequestDetailsModal.tsx         # Timeline view of request status
│   ├── PendingApprovalsPage.tsx        # Approver dashboard
│   └── ApprovalReviewModal.tsx         # Review and approve/reject interface
├── services/
│   └── staffRequests.ts                # API integration layer
└── types/
    └── staffRequests.ts                # TypeScript type definitions
```

## Features

### 1. Template Management (HR Only)

**Route:** `/staff-requests/manage-templates`  
**Permission Required:** `staff_requests.manage_templates`

**Features:**
- View all request templates with metadata
- Create new templates with dynamic form builder
- Edit existing templates (updates apply to future requests only)
- Toggle templates active/inactive
- Preview approval workflows

**Components:**
- `TemplateManagementPage.tsx` - Main dashboard
- `TemplateEditorModal.tsx` - Three-tab editor:
  - **Details Tab:** Template name, description, allowed roles
  - **Form Fields Tab:** Dynamic field builder with 7 field types
  - **Approval Workflow Tab:** Sequential approval step configuration

**Field Types Supported:**
- Text (single line)
- Textarea (multi-line)
- Number
- Date
- Time
- Email
- Select (dropdown with options)

### 2. My Requests (All Staff)

**Route:** `/staff-requests/my-requests`  
**Access:** All staff (profile type = 'STAFF')

**Features:**
- View all submitted requests with status indicators
- Filter by status (All, Pending, Approved, Rejected)
- Visual progress bars showing approval progress
- Submit new requests from active templates
- View detailed request history with timeline

**Components:**
- `MyRequestsPage.tsx` - Request history dashboard
- `NewRequestModal.tsx` - Two-step submission wizard:
  - **Step 1:** Select from available active templates
  - **Step 2:** Fill dynamic form based on template schema
- `DynamicFormRenderer.tsx` - Renders form fields from JSON
- `RequestDetailsModal.tsx` - Shows workflow progress timeline

**Request Card Information:**
- Template name and description
- Submission date
- Current status (Pending/Approved/Rejected)
- Approval progress (e.g., "2/4 approvals completed")
- Current step and role awaiting action
- Quick preview of submitted data

### 3. Pending Approvals (Approvers)

**Route:** `/staff-requests/pending-approvals`  
**Permission Required:** `staff_requests.approve_requests`

**Who Can Access:**
- Users with `staff_requests.approve_requests` permission
- Role-specific approvers (HOD, AHOD, HR, PRINCIPAL, IQAC, HAA, PS)

**Features:**
- View all requests awaiting current user's approval
- Filter applies automatically on backend
- Review applicant information and request details
- View previous approval history
- Approve or reject with comments
- Real-time count of pending requests

**Components:**
- `PendingApprovalsPage.tsx` - Approver dashboard
- `ApprovalReviewModal.tsx` - Decision interface with:
  - Full applicant information
  - Complete request details formatted for readability
  - Workflow timeline with previous approvals
  - Action selection (Approve/Reject)
  - Comments field (required for rejection)

**Approval Actions:**
- **Approve:** Advances request to next approval step or marks as approved if final step
- **Reject:** Immediately marks request as rejected and stops workflow

## API Integration

### Service Layer (`services/staffRequests.ts`)

All API calls use the shared `apiClient` from `auth.ts` which includes:
- Automatic JWT token attachment
- Token refresh on 401 errors
- Request/response interceptors

**Available Methods:**

#### Templates
```typescript
getActiveTemplates()           // Get all active templates
getAllTemplates()              // Get all templates (HR only)
createTemplate(data)           // Create new template
updateTemplate(id, data)       // Update existing template
deleteTemplate(id)             // Delete template
```

#### Requests
```typescript
getMyRequests()                // Get current user's requests
getRequestById(id)             // Get single request with workflow_progress
createRequest(data)            // Submit new request
```

#### Approvals
```typescript
getPendingApprovals()          // Get requests awaiting user's approval
processApproval(id, {action, comments})  // Approve or reject
```

## Type Definitions (`types/staffRequests.ts`)

### Key Types

```typescript
interface FormField {
  id: string;
  label: string;
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'email' | 'select';
  placeholder?: string;
  required: boolean;
  options?: string[];  // For select fields
}

interface ApprovalStep {
  id: number;
  step_order: number;
  approver_role: string;
}

interface RequestTemplate {
  id: number;
  name: string;
  description: string;
  form_schema: FormField[];
  approval_steps: ApprovalStep[];
  allowed_roles: string[];
  is_active: boolean;
}

interface WorkflowProgress {
  step_order: number;
  approver_role: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approver_name?: string;
  comments?: string;
  processed_at?: string;
}

interface StaffRequest {
  id: number;
  template: RequestTemplate;
  applicant: User;
  form_data: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  current_step: number;
  total_steps: number;
  completed_steps: number;
  workflow_progress?: WorkflowProgress[];
  approval_logs?: ApprovalLog[];
  created_at: string;
}
```

## Routing

### Routes Configured in `App.tsx`

```typescript
// HR Template Management (requires permission)
<Route
  path="/staff-requests/manage-templates"
  element={<ProtectedRoute user={user} requiredPermissions={['staff_requests.manage_templates']} element={<TemplateManagementPage />} />}
/>

// Staff My Requests (all staff)
<Route
  path="/staff-requests/my-requests"
  element={<ProtectedRoute user={user} requiredProfile={'STAFF'} element={<MyRequestsPage />} />}
/>

// Pending Approvals (requires permission)
<Route
  path="/staff-requests/pending-approvals"
  element={<ProtectedRoute user={user} requiredPermissions={['staff_requests.approve_requests']} element={<PendingApprovalsPage />} />}
/>
```

## Navigation Sidebar

### Conditional Links (`DashboardSidebar.tsx`)

The sidebar displays links based on user permissions:

```typescript
// HR: Manage Request Templates
if (permsLower.includes('staff_requests.manage_templates')) {
  items.push({ 
    key: 'staff_requests_templates', 
    label: 'Manage Request Templates', 
    to: '/staff-requests/manage-templates' 
  });
}

// All Staff: My Requests
if (flags.is_staff) {
  items.push({ 
    key: 'staff_requests_my', 
    label: 'My Requests', 
    to: '/staff-requests/my-requests' 
  });
}

// Approvers: Pending Approvals
if (permsLower.includes('staff_requests.approve_requests')) {
  items.push({ 
    key: 'staff_requests_approvals', 
    label: 'Pending Approvals', 
    to: '/staff-requests/pending-approvals' 
  });
}
```

**Icon Mappings:**
- Template Management: `FileText`
- My Requests: `ClipboardList`
- Pending Approvals: `Bell`

## RBAC Implementation

### Permission Checks

The system uses three permission levels:

1. **`staff_requests.manage_templates`**
   - Assigned to: HR
   - Allows: Create, edit, delete templates
   - Access: Template Management dashboard

2. **`staff_requests.approve_requests`**
   - Assigned to: HR, PRINCIPAL, IQAC, HAA
   - Allows: Approve/reject requests at their step
   - Access: Pending Approvals dashboard

3. **Profile Type = 'STAFF'**
   - All faculty and staff
   - Allows: Submit requests, view own submissions
   - Access: My Requests dashboard

### Role-Based Workflow

Approval steps are assigned roles (HOD, AHOD, HR, PRINCIPAL, etc.). The backend automatically:
- Filters pending approvals by role matching
- Checks `user_roles` for global roles (HR, PRINCIPAL, IQAC)
- Checks `academics.DepartmentRole` for department-specific roles (HOD, AHOD)

## User Workflows

### HR: Create New Template

1. Navigate to `/staff-requests/manage-templates`
2. Click "New Template"
3. **Details Tab:**
   - Enter template name (e.g., "Leave Request")
   - Add description
   - Select allowed roles (FACULTY, STAFF)
4. **Form Fields Tab:**
   - Click "Add Field"
   - Configure: label, type, placeholder, required
   - Reorder fields as needed
   - For select fields, add options
5. **Approval Workflow Tab:**
   - Add approval steps in sequence
   - Select approver role for each step
   - System enforces sequential order (1, 2, 3...)
6. Click "Save Template"
7. Toggle "Active" to make available to staff

### Staff: Submit Request

1. Navigate to `/staff-requests/my-requests`
2. Click "New Request"
3. **Step 1: Select Template**
   - Browse active templates filtered by user's role
   - View template description and approval workflow
   - Click "Select" on desired template
4. **Step 2: Fill Form**
   - Complete all required fields
   - System validates based on field types
   - Review approval workflow preview
5. Click "Submit Request"
6. View confirmation and track status on dashboard

### Approver: Review Request

1. Navigate to `/staff-requests/pending-approvals`
2. View list of requests awaiting approval
3. Click on request to open review modal
4. **Review:**
   - Applicant information
   - Request details (all form data)
   - Previous approvals and comments
5. **Take Action:**
   - Select "Approve" or "Reject"
   - Add comments (required for rejection)
   - Click "Confirm Approval" or "Confirm Rejection"
6. Request automatically advances or closes

## UI Components Details

### Status Indicators

```typescript
// Status Badge Colors
PENDING  → Yellow (bg-yellow-100, text-yellow-800)
APPROVED → Green (bg-green-100, text-green-800)
REJECTED → Red (bg-red-100, text-red-800)
```

### Timeline Visualization

The `RequestDetailsModal` shows workflow progress as a vertical timeline:

```
✓ Step 1: HOD        [APPROVED]
  Dr. John Doe
  "Approved for academic reasons"
  Jan 15, 2026 10:30 AM

○ Step 2: PRINCIPAL  [PENDING]
  Awaiting approval...

○ Step 3: HR         [PENDING]
  Not yet reached
```

**Icons:**
- `CheckCircle` (green) - Approved
- `XCircle` (red) - Rejected
- `Clock` (yellow) - Current pending step
- Empty circle (gray) - Future step

### Progress Bars

Visual indicators show approval progress:
```
[████████████░░░░░░░░] 60%
2 of 3 approvals completed
```

## State Management

All components use React hooks for state:
```typescript
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [data, setData] = useState<Type[]>([]);
```

**Error Handling Pattern:**
```typescript
try {
  const result = await apiCall();
  setData(result);
} catch (err: any) {
  setError(err?.response?.data?.detail || 'Default error message');
} finally {
  setLoading(false);
}
```

## Styling

### Tailwind CSS Classes

**Consistent Patterns:**
- Cards: `border border-gray-200 rounded-lg p-4 hover:shadow-lg`
- Buttons: `px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700`
- Modals: `fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center`
- Form inputs: `border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500`

**Status Colors:**
- Success: `green-600`, `green-100`
- Warning: `yellow-600`, `yellow-100`
- Error: `red-600`, `red-100`
- Info: `blue-600`, `blue-100`
- Neutral: `gray-600`, `gray-100`

## Testing Checklist

### HR Template Management
- [ ] Create template with all field types
- [ ] Edit template name and description
- [ ] Add/remove form fields
- [ ] Reorder form fields
- [ ] Configure select field options
- [ ] Add/remove approval steps
- [ ] Toggle template active/inactive
- [ ] Delete template (should fail if has requests)

### Staff Request Submission
- [ ] View only templates for user's role
- [ ] Submit request with all field types
- [ ] Required field validation
- [ ] Email field validation
- [ ] Number field validation
- [ ] Date/time field input
- [ ] View submission confirmation
- [ ] Track request in history

### Approval Workflow
- [ ] HOD sees only department requests at HOD step
- [ ] HR sees all requests at HR step
- [ ] Approve action advances to next step
- [ ] Reject action stops workflow
- [ ] Comments saved with approval/rejection
- [ ] Final approval marks request as APPROVED
- [ ] Applicant sees approval progress in real-time

### RBAC
- [ ] HR sees Template Management link
- [ ] All staff see My Requests link
- [ ] Approvers see Pending Approvals link
- [ ] Non-staff cannot access any pages
- [ ] Permission-based route protection works

## Future Enhancements

### Potential Features
1. **Email Notifications**
   - Notify applicant when request approved/rejected
   - Notify approvers when request reaches their step

2. **Advanced Filtering**
   - Filter requests by date range
   - Filter by applicant name
   - Filter by template type

3. **Request Delegation**
   - HOD delegates approval to AHOD
   - Temporary approver assignment

4. **Bulk Actions**
   - Approve multiple requests at once
   - Batch rejection with common comment

5. **Analytics Dashboard**
   - Average approval time by template
   - Rejection rate by step
   - Request volume trends

6. **Template Versioning**
   - Track template changes over time
   - Apply updates to pending requests

7. **File Attachments**
   - Add file upload field type
   - Attach supporting documents to requests

8. **Request Comments**
   - Applicant can add clarifications
   - Approvers can request more information

## Troubleshooting

### Common Issues

**1. "Failed to load templates"**
- Check API URL in `services/staffRequests.ts`
- Verify JWT token is valid
- Check browser console for CORS errors

**2. "Permission denied" on route access**
- Verify user permissions in localStorage
- Check ProtectedRoute implementation
- Ensure backend assigned permissions correctly

**3. "Pending approvals not showing"**
- Check user's role matches approval step role
- Verify `is_user_approver_for_request` logic
- Check HOD department assignment

**4. "Dynamic form not rendering"**
- Verify `form_schema` is valid JSON array
- Check FormField type definitions match
- Ensure DynamicFormRenderer field types supported

**5. "Workflow timeline missing data"**
- Check backend includes `workflow_progress` in serializer
- Verify `getRequestById` API call succeeds
- Ensure ApprovalLog records created on approval

## API Endpoints Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/staff-requests/templates/` | List all templates | JWT |
| POST | `/api/staff-requests/templates/` | Create template | JWT + manage_templates |
| GET | `/api/staff-requests/templates/active/` | List active templates | JWT |
| GET | `/api/staff-requests/templates/{id}/` | Get template details | JWT |
| PUT | `/api/staff-requests/templates/{id}/` | Update template | JWT + manage_templates |
| DELETE | `/api/staff-requests/templates/{id}/` | Delete template | JWT + manage_templates |
| GET | `/api/staff-requests/requests/` | List my requests | JWT |
| POST | `/api/staff-requests/requests/` | Create request | JWT |
| GET | `/api/staff-requests/requests/{id}/` | Get request details | JWT |
| GET | `/api/staff-requests/approvals/pending_approvals/` | Get pending approvals | JWT |
| POST | `/api/staff-requests/approvals/{id}/process_approval/` | Approve/reject | JWT + approve_requests |

## Deployment Notes

1. **Environment Variables**
   - Ensure API base URL is configured correctly
   - Set CORS allowed origins to include frontend domain

2. **Build Process**
   - Run `npm run build` to create production build
   - Verify all routes work with React Router's HTML5 history mode

3. **Backend Integration**
   - Ensure backend staff_requests app is in INSTALLED_APPS
   - Run migrations: `python manage.py migrate staff_requests`
   - Create superuser and assign permissions

4. **Initial Setup**
   - Grant HR users `staff_requests.manage_templates` permission
   - Grant approvers `staff_requests.approve_requests` permission
   - Configure user roles (HOD, PRINCIPAL, etc.) in accounts app

## Support

For issues or questions:
1. Check backend logs for API errors
2. Review browser console for frontend errors
3. Verify permissions and roles are correctly assigned
4. Test with sample data in development environment

---

**Version:** 1.0  
**Last Updated:** January 2026  
**Maintained By:** IDCS ERP Development Team
