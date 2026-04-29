from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RequestTemplateViewSet, StaffRequestViewSet, ApprovalStepViewSet, EventAttendingViewSet

# Create a router and register our viewsets
router = DefaultRouter()
router.register(r'templates', RequestTemplateViewSet, basename='request-template')
router.register(r'requests', StaffRequestViewSet, basename='staff-request')
router.register(r'approval-steps', ApprovalStepViewSet, basename='approval-step')
router.register(r'event-attending', EventAttendingViewSet, basename='event-attending')

urlpatterns = [
    path('', include(router.urls)),
]

# Available endpoints:
# 
# REQUEST TEMPLATES (Admin/HR only):
# GET    /api/staff-requests/templates/                      - List all templates
# POST   /api/staff-requests/templates/                      - Create new template
# GET    /api/staff-requests/templates/{id}/                 - Get template details
# PUT    /api/staff-requests/templates/{id}/                 - Update template
# PATCH  /api/staff-requests/templates/{id}/                 - Partial update
# DELETE /api/staff-requests/templates/{id}/                 - Delete template
# GET    /api/staff-requests/templates/active/               - List active templates only
# POST   /api/staff-requests/templates/{id}/add_step/        - Add approval step
# POST   /api/staff-requests/templates/{id}/reorder_steps/   - Reorder steps
#
# STAFF REQUESTS (All authenticated users):
# GET    /api/staff-requests/requests/                       - List user's own requests
# POST   /api/staff-requests/requests/                       - Submit new request
# GET    /api/staff-requests/requests/{id}/                  - Get request details
# GET    /api/staff-requests/requests/pending_approvals/     - Get requests pending user's approval
# POST   /api/staff-requests/requests/{id}/process_approval/ - Approve/reject request
# GET    /api/staff-requests/requests/my_requests/           - Get user's own requests
# GET    /api/staff-requests/requests/department_requests/   - Get department requests
# GET    /api/staff-requests/requests/{id}/approval_history/ - Get approval history
#
# APPROVAL STEPS (Admin/HR only):
# GET    /api/staff-requests/approval-steps/                 - List all steps
# POST   /api/staff-requests/approval-steps/                 - Create step
# GET    /api/staff-requests/approval-steps/{id}/            - Get step details
# PUT    /api/staff-requests/approval-steps/{id}/            - Update step
# DELETE /api/staff-requests/approval-steps/{id}/            - Delete step
#
# EVENT ATTENDING:
# GET    /api/staff-requests/event-attending/approved_od_forms/            - Approved OD forms
# POST   /api/staff-requests/event-attending/submit_event_form/           - Submit expense form
# GET    /api/staff-requests/event-attending/my_event_forms/              - User's event forms
# GET    /api/staff-requests/event-attending/{id}/event_form_detail/      - Form details
# GET    /api/staff-requests/event-attending/pending_event_approvals/     - Pending approvals
# POST   /api/staff-requests/event-attending/{id}/process_event_approval/ - Approve/reject
# GET    /api/staff-requests/event-attending/event_workflow_settings/     - Workflow rules
# POST   /api/staff-requests/event-attending/save_event_workflow_settings/- Save workflow
# GET    /api/staff-requests/event-attending/staff_declarations/          - IQAC: all staff budgets
# POST   /api/staff-requests/event-attending/save_staff_declaration/      - IQAC: save budget
# POST   /api/staff-requests/event-attending/apply_all_declaration/       - IQAC: apply to all
# GET    /api/staff-requests/event-attending/my_event_budget/             - User's budget info
