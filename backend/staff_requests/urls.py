from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RequestTemplateViewSet, StaffRequestViewSet, ApprovalStepViewSet

# Create a router and register our viewsets
router = DefaultRouter()
router.register(r'templates', RequestTemplateViewSet, basename='request-template')
router.register(r'requests', StaffRequestViewSet, basename='staff-request')
router.register(r'approval-steps', ApprovalStepViewSet, basename='approval-step')

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
