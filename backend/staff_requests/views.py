from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q, Prefetch
from django.utils import timezone

from .models import RequestTemplate, ApprovalStep, StaffRequest, ApprovalLog
from .serializers import (
    RequestTemplateSerializer,
    RequestTemplateDetailSerializer,
    ApprovalStepSerializer,
    ApprovalStepCreateSerializer,
    StaffRequestListSerializer,
    StaffRequestDetailSerializer,
    ProcessApprovalSerializer,
    ApprovalLogSerializer
)


def is_user_approver_for_request(user, staff_request, approver_role):
    """
    Checks if the current user has the authority to approve the request at this step.
    Integrates with the academics app's role system (user_roles and DepartmentRole).
    
    Args:
        user: The user model instance
        staff_request: The StaffRequest instance
        approver_role: The role name string (e.g., 'HOD', 'HR', 'PRINCIPAL')
    
    Returns:
        bool: True if user can approve this request at this step
    """
    # 1. Superuser can approve anything
    if user.is_superuser:
        return True
        
    # 2. Check for Global Roles (HR, PRINCIPAL, IQAC, PS, etc.)
    if approver_role in ['HR', 'PRINCIPAL', 'IQAC', 'PS', 'ADMIN']:
        if hasattr(user, 'user_roles') and user.user_roles.filter(role__name=approver_role).exists():
            return True
            
    # 3. Check for Department-Specific Roles (HOD)
    if approver_role == 'HOD':
        try:
            from academics.models import DepartmentRole, AcademicYear
            
            # Get the applicant's department
            applicant_profile = getattr(staff_request.applicant, 'staff_profile', None)
            if not applicant_profile or not applicant_profile.department:
                return False
            applicant_dept = applicant_profile.department
            
            # Get the approver's profile
            user_profile = getattr(user, 'staff_profile', None)
            if not user_profile:
                return False
                
            # Check active academic year
            current_year = AcademicYear.objects.filter(is_active=True).first()
            if not current_year:
                return False
                
            # Check if the current user is the HOD for the applicant's department
            is_hod_of_dept = DepartmentRole.objects.filter(
                staff=user_profile,
                department=applicant_dept,
                role__in=['HOD', 'AHOD'],  # Include AHOD if they are also allowed to approve
                academic_year=current_year,
                is_active=True
            ).exists()
            
            return is_hod_of_dept
            
        except Exception as e:
            print(f"Error checking HOD role: {e}")
            return False
            
    return False


def can_user_apply_with_template(user, template):
    """
    Check if a user's role allows them to apply using this template.
    
    Args:
        user: The user model instance
        template: The RequestTemplate instance
    
    Returns:
        bool: True if user can apply with this template
    """
    if not template.is_active:
        return False
    
    if not template.allowed_roles:
        return True  # No restrictions
    
    # PLACEHOLDER: Implement your role checking logic
    # Example implementations:
    
    # Check user groups
    if hasattr(user, 'groups'):
        user_groups = set(user.groups.values_list('name', flat=True))
        if any(role in user_groups for role in template.allowed_roles):
            return True
    
    # Check user profile role
    if hasattr(user, 'profile') and hasattr(user.profile, 'role'):
        if user.profile.role in template.allowed_roles:
            return True
    
    # Superuser override
    if user.is_superuser:
        return True
    
    return False


class RequestTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Request Templates.
    
    Admin/HR only. Allows CRUD operations on templates and nested approval steps.
    
    Endpoints:
    - GET /api/request-templates/ - List all templates
    - POST /api/request-templates/ - Create new template
    - GET /api/request-templates/{id}/ - Retrieve template details
    - PUT/PATCH /api/request-templates/{id}/ - Update template
    - DELETE /api/request-templates/{id}/ - Delete template
    - GET /api/request-templates/active/ - List only active templates
    """
    queryset = RequestTemplate.objects.prefetch_related('approval_steps')
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        """Use detail serializer for create/update, basic for list/retrieve"""
        if self.action in ['create', 'update', 'partial_update']:
            return RequestTemplateDetailSerializer
        return RequestTemplateSerializer
    
    def get_permissions(self):
        """
        Only admin/HR should be able to manage templates.
        Override this based on your permission system.
        """
        permissions = super().get_permissions()
        
        # PLACEHOLDER: Add your admin/HR permission check
        # Example: permissions.append(IsAdminOrHR())
        
        return permissions
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """
        List only active templates.
        GET /api/request-templates/active/
        """
        active_templates = self.queryset.filter(is_active=True)
        serializer = self.get_serializer(active_templates, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_step(self, request, pk=None):
        """
        Add a new approval step to a template.
        POST /api/request-templates/{id}/add_step/
        
        Body: {"step_order": 1, "approver_role": "HOD"}
        """
        template = self.get_object()
        serializer = ApprovalStepCreateSerializer(data={
            **request.data,
            'template': template.id
        })
        
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def reorder_steps(self, request, pk=None):
        """
        Reorder approval steps for a template.
        POST /api/request-templates/{id}/reorder_steps/
        
        Body: {"steps": [{"id": 1, "step_order": 2}, {"id": 2, "step_order": 1}]}
        """
        template = self.get_object()
        steps_data = request.data.get('steps', [])
        
        with transaction.atomic():
            for step_data in steps_data:
                step_id = step_data.get('id')
                new_order = step_data.get('step_order')
                
                try:
                    step = template.approval_steps.get(id=step_id)
                    step.step_order = new_order
                    step.save()
                except ApprovalStep.DoesNotExist:
                    return Response(
                        {'error': f'Step with id {step_id} not found'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
        
        # Return updated template
        serializer = self.get_serializer(template)
        return Response(serializer.data)


class StaffRequestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Staff Requests - the core workflow engine.
    
    Endpoints:
    - GET /api/staff-requests/ - List user's own requests
    - POST /api/staff-requests/ - Submit a new request
    - GET /api/staff-requests/{id}/ - View request details
    - GET /api/staff-requests/pending_approvals/ - Get requests pending user's approval
    - POST /api/staff-requests/{id}/process_approval/ - Approve or reject a request
    - GET /api/staff-requests/my_requests/ - Get all requests by current user
    - GET /api/staff-requests/department_requests/ - Get requests from user's department
    """
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Base queryset with optimized prefetches.
        Further filtering in individual actions.
        """
        return StaffRequest.objects.select_related(
            'applicant',
            'template'
        ).prefetch_related(
            'template__approval_steps',
            'approval_logs__approver'
        )
    
    def get_serializer_class(self):
        """Use list serializer for list views, detail for everything else"""
        if self.action == 'list':
            return StaffRequestListSerializer
        return StaffRequestDetailSerializer
    
    def list(self, request, *args, **kwargs):
        """
        List requests. Default: show user's own requests.
        Filter by status using ?status=pending
        """
        queryset = self.get_queryset().filter(applicant=request.user)
        
        # Filter by status if provided
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    def create(self, request, *args, **kwargs):
        """
        Submit a new staff request.
        POST /api/staff-requests/
        
        Body: {
            "template_id": 1,
            "form_data": {
                "from_date": "2026-03-10",
                "to_date": "2026-03-12",
                "reason": "Personal work"
            }
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        template = serializer.validated_data.get('template')
        
        # Check if user can apply with this template
        if not can_user_apply_with_template(request.user, template):
            return Response(
                {'error': 'You are not authorized to use this request template'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if template has approval steps configured
        if not template.approval_steps.exists():
            return Response(
                {'error': 'This template has no approval workflow configured'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create the request with current user as applicant
        staff_request = serializer.save(applicant=request.user)
        
        # Return detailed response
        response_serializer = StaffRequestDetailSerializer(staff_request)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['get'])
    def pending_approvals(self, request):
        """
        Get all requests pending approval by the current user.
        This is the crucial endpoint for approvers to see their pending tasks.
        
        GET /api/staff-requests/pending_approvals/
        
        Logic:
        1. Find all pending StaffRequests
        2. For each, check if the current_step's required approver_role matches user's roles
        3. Return only those where the user is the designated approver
        """
        user = request.user
        pending_requests = []
        
        # Get all pending requests
        all_pending = self.get_queryset().filter(status='pending')
        
        for staff_request in all_pending:
            required_role = staff_request.get_required_approver_role()
            
            if required_role and is_user_approver_for_request(user, staff_request, required_role):
                pending_requests.append(staff_request)
        
        # Return the filtered list directly (no pagination on Python lists)
        serializer = StaffRequestDetailSerializer(pending_requests, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def process_approval(self, request, pk=None):
        """
        Process an approval decision (approve or reject).
        POST /api/staff-requests/{id}/process_approval/
        
        Body: {
            "action": "approve",  // or "reject"
            "comments": "Approved for the requested dates"
        }
        
        Logic:
        1. Verify user has permission to approve at current step
        2. If reject: mark request as rejected, create log, done
        3. If approve: create log, check if final step
           - If final: mark as approved
           - If not final: advance to next step
        """
        staff_request = self.get_object()
        user = request.user
        
        # Validate input
        input_serializer = ProcessApprovalSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        
        action_type = input_serializer.validated_data['action']
        comments = input_serializer.validated_data.get('comments', '')
        
        # Check if request is still pending
        if staff_request.status != 'pending':
            return Response(
                {'error': f'This request has already been {staff_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user has permission to approve at this step
        required_role = staff_request.get_required_approver_role()
        if not required_role:
            return Response(
                {'error': 'Invalid approval workflow configuration'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not is_user_approver_for_request(user, staff_request, required_role):
            return Response(
                {'error': f'You do not have permission to approve this request. Required role: {required_role}'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if this step has already been processed
        if staff_request.approval_logs.filter(step_order=staff_request.current_step).exists():
            return Response(
                {'error': 'This approval step has already been processed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Process the approval action
        with transaction.atomic():
            if action_type == 'reject':
                # Create rejection log
                ApprovalLog.objects.create(
                    request=staff_request,
                    approver=user,
                    step_order=staff_request.current_step,
                    action='rejected',
                    comments=comments
                )
                
                # Mark request as rejected
                staff_request.mark_rejected()
                
                message = 'Request rejected successfully'
            
            else:  # action_type == 'approve'
                # Create approval log
                ApprovalLog.objects.create(
                    request=staff_request,
                    approver=user,
                    step_order=staff_request.current_step,
                    action='approved',
                    comments=comments
                )
                
                # Check if this is the final step
                if staff_request.is_final_step():
                    staff_request.mark_approved()
                    message = 'Request approved successfully (final approval)'
                else:
                    staff_request.advance_to_next_step()
                    next_role = staff_request.get_required_approver_role()
                    message = f'Request approved. Advanced to step {staff_request.current_step} (awaiting {next_role})'
        
        # Return updated request details
        response_serializer = StaffRequestDetailSerializer(staff_request)
        return Response({
            'message': message,
            'request': response_serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def my_requests(self, request):
        """
        Get all requests submitted by the current user.
        GET /api/staff-requests/my_requests/
        
        Supports filtering by status: ?status=approved
        """
        queryset = self.get_queryset().filter(applicant=request.user)
        
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = StaffRequestDetailSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = StaffRequestDetailSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def department_requests(self, request):
        """
        Get all requests from users in the same department.
        Useful for HODs and department heads.
        
        GET /api/staff-requests/department_requests/
        
        PLACEHOLDER: Implement department filtering based on your user model
        """
        user = request.user
        
        # PLACEHOLDER: Implement your department logic
        # Example:
        # if hasattr(user, 'profile') and hasattr(user.profile, 'department_id'):
        #     department_id = user.profile.department_id
        #     queryset = self.get_queryset().filter(
        #         applicant__profile__department_id=department_id
        #     )
        # else:
        #     queryset = self.get_queryset().none()
        
        # For now, return empty queryset
        queryset = self.get_queryset().none()
        
        serializer = StaffRequestDetailSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def approval_history(self, request, pk=None):
        """
        Get detailed approval history for a specific request.
        GET /api/staff-requests/{id}/approval_history/
        """
        staff_request = self.get_object()
        
        # Check if user has permission to view this request
        if staff_request.applicant != request.user and not request.user.is_staff:
            # PLACEHOLDER: Add more sophisticated permission checking
            # e.g., allow HOD to view department requests
            pass
        
        logs = staff_request.approval_logs.all()
        serializer = ApprovalLogSerializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_approvals(self, request):
        """
        Get all approval logs processed by the current user.
        GET /api/staff-requests/requests/my_approvals/

        Returns list of approval log entries with a small request summary.
        """
        user = request.user
        logs = ApprovalLog.objects.filter(approver=user).select_related('request', 'request__template', 'request__applicant').order_by('-action_date')

        results = []
        for log in logs:
            item = ApprovalLogSerializer(log).data
            # attach small request summary
            item['request_summary'] = {
                'id': log.request.id,
                'template_name': getattr(log.request.template, 'name', None),
                'applicant_name': getattr(log.request.applicant, 'get_full_name', lambda: None)() or getattr(log.request.applicant, 'username', None),
                'status': log.request.status,
            }
            results.append(item)

        return Response(results)


class ApprovalStepViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing individual Approval Steps.
    
    Admin/HR only. Allows CRUD operations on approval steps.
    Typically used in conjunction with RequestTemplateViewSet.
    """
    queryset = ApprovalStep.objects.select_related('template')
    serializer_class = ApprovalStepSerializer
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Only admin/HR should manage approval steps"""
        permissions = super().get_permissions()
        # PLACEHOLDER: Add admin/HR permission
        return permissions
    
    def get_queryset(self):
        """Filter by template if template_id provided in query params"""
        queryset = super().get_queryset()
        template_id = self.request.query_params.get('template_id')
        
        if template_id:
            queryset = queryset.filter(template_id=template_id)
        
        return queryset
