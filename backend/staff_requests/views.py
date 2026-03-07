from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q, Prefetch
from django.utils import timezone

from .models import RequestTemplate, ApprovalStep, StaffRequest, ApprovalLog, StaffLeaveBalance
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
                    
                    # Process leave and attendance balance updates
                    try:
                        self._process_leave_balance(staff_request)
                    except Exception as e:
                        # Log and continue; do not fail the approval due to balance processing error
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.exception('Failed to process leave balance for request %s: %s', staff_request.id, str(e))
                    
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
    
    def _process_leave_balance(self, staff_request):
        """
        Process leave balance updates after final approval.
        Handles deduct/earn/neutral actions based on template leave_policy.
        """
        import logging
        from datetime import datetime, timedelta
        from .models import StaffLeaveBalance
        
        logger = logging.getLogger(__name__)
        template = staff_request.template
        leave_policy = template.leave_policy
        
        logger.info(f'[LeaveBalance] Processing request #{staff_request.id} - Template: {template.name}, Policy: {leave_policy}')
        
        # Skip if no leave policy configured
        if not leave_policy or 'action' not in leave_policy:
            logger.warning(f'[LeaveBalance] Skipping - no action in leave_policy for template {template.name}')
            return
        
        action = leave_policy.get('action')
        leave_type = template.name  # Use template name as leave type
        form_data = staff_request.form_data
        
        logger.info(f'[LeaveBalance] Action: {action}, Leave Type: {leave_type}, Form Data: {form_data}')
        
        # Calculate number of days
        days = self._calculate_days_from_form_data(form_data)
        logger.info(f'[LeaveBalance] Calculated days: {days}')
        
        if days <= 0:
            logger.warning(f'[LeaveBalance] Skipping - days <= 0')
            return
        
        # Get or create leave balance
        balance_obj, created = StaffLeaveBalance.objects.get_or_create(
            staff=staff_request.applicant,
            leave_type=leave_type,
            defaults={'balance': 0.0}
        )
        
        logger.info(f'[LeaveBalance] Balance object - Created: {created}, Initial Balance: {balance_obj.balance}')
        
        # Initialize balance for new entries (deduct action only)
        if created and action == 'deduct':
            allotment = leave_policy.get('allotment_per_role', {})
            # Get user's role (simplified - use first matching role)
            user_role = self._get_primary_role(staff_request.applicant)
            balance_obj.balance = allotment.get(user_role, 0.0)
            balance_obj.save()
            logger.info(f'[LeaveBalance] Initialized deduct balance for role {user_role}: {balance_obj.balance}')
        
        # Apply action
        if action == 'deduct':
            overdraft_name = leave_policy.get('overdraft_name', 'LOP')
            
            if balance_obj.balance >= days:
                # Sufficient balance - deduct normally
                old_balance = balance_obj.balance
                balance_obj.balance -= days
                balance_obj.save()
                logger.info(f'[LeaveBalance] Deducted {days} days: {old_balance} -> {balance_obj.balance}')
            else:
                # Insufficient balance - deduct all and overflow to LOP
                overflow = days - balance_obj.balance
                balance_obj.balance = 0.0
                balance_obj.save()
                
                # Add overflow to LOP
                lop_balance, _ = StaffLeaveBalance.objects.get_or_create(
                    staff=staff_request.applicant,
                    leave_type=overdraft_name,
                    defaults={'balance': 0.0}
                )
                lop_balance.balance += overflow
                lop_balance.save()
                logger.info(f'[LeaveBalance] Insufficient balance - overflow {overflow} days to {overdraft_name}')
        
        elif action == 'earn':
            overdraft_name = leave_policy.get('overdraft_name', 'LOP')
            
            # Get LOP balance
            lop_balance = StaffLeaveBalance.objects.filter(
                staff=staff_request.applicant,
                leave_type=overdraft_name
            ).first()
            
            if lop_balance and lop_balance.balance > 0:
                # Pay down LOP first
                if lop_balance.balance >= days:
                    lop_balance.balance -= days
                    lop_balance.save()
                    days = 0
                    logger.info(f'[LeaveBalance] Paid down LOP completely, remaining days: {days}')
                else:
                    days -= lop_balance.balance
                    lop_balance.balance = 0.0
                    lop_balance.save()
                    logger.info(f'[LeaveBalance] Paid down LOP partially, remaining days: {days}')
            
            # Add remaining to leave type balance
            if days > 0:
                old_balance = balance_obj.balance
                balance_obj.balance += days
                balance_obj.save()
                logger.info(f'[LeaveBalance] Earned {days} days: {old_balance} -> {balance_obj.balance}')
        
        elif action == 'neutral':
            # Simply add days
            old_balance = balance_obj.balance
            balance_obj.balance += days
            balance_obj.save()
            logger.info(f'[LeaveBalance] Neutral action - added {days} days: {old_balance} -> {balance_obj.balance}')
        
        logger.info(f'[LeaveBalance] Processing complete for request #{staff_request.id}')
        
        # Sync attendance if configured
        attendance_status = leave_policy.get('attendance_status')
        if attendance_status:
            date_list = self._get_date_list_from_form_data(form_data)
            self._sync_attendance(staff_request.applicant, date_list, attendance_status)
    
    def _calculate_days_from_form_data(self, form_data):
        """
        Extract date range from form_data and calculate number of days.
        Looks for start_date/end_date or from_date/to_date field pairs.
        Returns inclusive day count (defaults to 1 if no dates found).
        """
        from datetime import datetime
        
        start_date = None
        end_date = None
        
        # Try different field name patterns
        for start_key in ['start_date', 'from_date', 'startDate', 'fromDate', 'from']:
            if start_key in form_data:
                start_date = form_data[start_key]
                break
        
        for end_key in ['end_date', 'to_date', 'endDate', 'toDate', 'to']:
            if end_key in form_data:
                end_date = form_data[end_key]
                break

        # Support single 'date' field for single-day requests
        if not start_date and 'date' in form_data:
            start_date = form_data['date']
        if not end_date and 'date' in form_data:
            end_date = form_data['date']
        
        # Also check for explicit 'days' or 'number_of_days' field
        if 'days' in form_data:
            try:
                return float(form_data['days'])
            except (ValueError, TypeError):
                pass
        
        if 'number_of_days' in form_data:
            try:
                return float(form_data['number_of_days'])
            except (ValueError, TypeError):
                pass
        
        # Calculate from date range
        if start_date and end_date:
            try:
                # Parse dates (handle both date strings and date objects)
                if isinstance(start_date, str):
                    start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
                else:
                    start = start_date
                
                if isinstance(end_date, str):
                    end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
                else:
                    end = end_date
                
                # Calculate inclusive days
                return (end - start).days + 1
            except (ValueError, AttributeError):
                pass
        
        # Default to 1 day if no valid date info found
        return 1.0
    
    def _get_date_list_from_form_data(self, form_data):
        """
        Generate list of dates from start_date/end_date in form_data.
        Returns list of date objects for attendance sync.
        """
        from datetime import datetime, timedelta
        
        start_date = None
        end_date = None
        
        # Try different field name patterns
        for start_key in ['start_date', 'from_date', 'startDate', 'fromDate', 'from']:
            if start_key in form_data:
                start_date = form_data[start_key]
                break
        
        for end_key in ['end_date', 'to_date', 'endDate', 'toDate', 'to']:
            if end_key in form_data:
                end_date = form_data[end_key]
                break
        
        # Support single 'date' field for single-day requests
        if not start_date and 'date' in form_data:
            start_date = form_data['date']
        if not end_date and 'date' in form_data:
            end_date = form_data['date']
        
        if not start_date or not end_date:
            return []
        
        try:
            # Parse dates
            if isinstance(start_date, str):
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
            else:
                start = start_date
            
            if isinstance(end_date, str):
                end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
            else:
                end = end_date
            
            # Generate date list
            date_list = []
            current = start
            while current <= end:
                date_list.append(current)
                current += timedelta(days=1)
            
            return date_list
        except (ValueError, AttributeError):
            return []
    
    def _get_primary_role(self, user):
        """
        Get user's primary role for leave allotment lookup.
        Checks user_roles relationship and returns first matching role.
        Defaults to 'STAFF' if no roles found.
        """
        if hasattr(user, 'user_roles'):
            first_role = user.user_roles.first()
            if first_role and hasattr(first_role, 'role') and hasattr(first_role.role, 'name'):
                return first_role.role.name.upper()
        
        return 'STAFF'
    
    def _sync_attendance(self, user, date_list, attendance_status):
        """
        Placeholder for syncing attendance register.
        
        Args:
            user: User model instance
            date_list: List of date objects to mark
            attendance_status: Status code (e.g., 'CL', 'OD', 'LOP')
        
        TODO: Integrate with your staff_attendance app
        Example:
            from staff_attendance.models import AttendanceRecord
            for date in date_list:
                AttendanceRecord.objects.update_or_create(
                    staff=user,
                    date=date,
                    defaults={'status': attendance_status}
                )
        """
        import logging
        logger = logging.getLogger(__name__)

        if not date_list:
            logger.info('[AttendanceSync] No dates to sync')
            return

        try:
            from staff_attendance.models import AttendanceRecord

            for dt in date_list:
                # Use update_or_create to set attendance status for the date
                AttendanceRecord.objects.update_or_create(
                    user=user,
                    date=dt,
                    defaults={
                        'status': attendance_status,
                        'morning_in': None,
                        'evening_out': None,
                        'notes': f'Updated by leave approval ({attendance_status})'
                    }
                )

            logger.info(f'[AttendanceSync] Synced {len(date_list)} dates for user {getattr(user, "username", user)} -> {attendance_status}')

        except Exception as e:
            logger.exception(f'[AttendanceSync] Failed to sync attendance: {e}')
    
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
    
    @action(detail=False, methods=['get'])
    def balances(self, request):
        """
        Get leave balances for the current user.
        GET /api/staff-requests/balances/
        
        Dynamically calculates balances based on:
        1. Monthly allotment from templates
        2. Approved leave requests this month
        3. Approved compensatory/earn requests this month  
        4. Absence records from attendance system
        
        Returns calculated balances for the current month.
        """
        import logging
        from datetime import date
        from .models import RequestTemplate
        
        logger = logging.getLogger(__name__)
        user = request.user
        
        try:
            # Get current month/year
            today = date.today()
            current_year = today.year
            current_month = today.month
            
            logger.info(f'[Balances] Calculating for user {user.username}, month {current_year}-{current_month}')
            
            # Get all active templates with leave policies
            templates = RequestTemplate.objects.filter(is_active=True).exclude(leave_policy={})
            
            # Calculate balances for each leave type
            balance_data = []
            overdraft_entries = {}
            
            for template in templates:
                leave_policy = template.leave_policy
                if not leave_policy or 'action' not in leave_policy:
                    continue
                
                action = leave_policy.get('action')
                leave_type = template.name
                overdraft_name = leave_policy.get('overdraft_name', 'LOP')
                
                logger.info(f'[Balances] Processing template: {leave_type}, action: {action}')
                
                # Get allotment for user's role
                allotment = 0
                if action == 'deduct':
                    allotment_per_role = leave_policy.get('allotment_per_role', {})
                    user_role = self._get_primary_role(user)
                    allotment = allotment_per_role.get(user_role, 0)
                    logger.info(f'[Balances] Allotment for role {user_role}: {allotment}')
                
                # Get approved requests for this template this month
                approved_requests = self.get_queryset().filter(
                    applicant=user,
                    template=template,
                    status='approved',
                    created_at__year=current_year,
                    created_at__month=current_month
                )
                
                # Calculate total days from approved requests
                total_request_days = 0
                for req in approved_requests:
                    days = self._calculate_days_from_form_data(req.form_data)
                    total_request_days += days
                    logger.info(f'[Balances] Approved request #{req.id}: {days} days')
                
                # Calculate balance based on action type
                if action == 'deduct':
                    # Start with allotment, subtract approved requests
                    balance = allotment - total_request_days
                    logger.info(f'[Balances] {leave_type}: allotment={allotment}, requests={total_request_days}, balance={balance}')
                    
                    # If negative, move to overdraft
                    if balance < 0:
                        overflow = abs(balance)
                        balance = 0
                        overdraft_entries[overdraft_name] = overdraft_entries.get(overdraft_name, 0) + overflow
                        logger.info(f'[Balances] Overflow to {overdraft_name}: {overflow}')
                    
                    balance_data.append({
                        'leave_type': leave_type,
                        'balance': balance,
                        'updated_at': None
                    })
                    
                elif action == 'earn':
                    # Earned leave adds up
                    balance = total_request_days
                    logger.info(f'[Balances] {leave_type} earned: {balance} days')
                    
                    balance_data.append({
                        'leave_type': leave_type,
                        'balance': balance,
                        'updated_at': None
                    })
                
                elif action == 'neutral':
                    # Neutral just tracks
                    balance = total_request_days
                    balance_data.append({
                        'leave_type': leave_type,
                        'balance': balance,
                        'updated_at': None
                    })
            
            # Process absences from attendance system
            try:
                # Fetch absence records from staff_attendance app
                from staff_attendance.models import AttendanceRecord
                
                absence_records = AttendanceRecord.objects.filter(
                    user=user,
                    date__year=current_year,
                    date__month=current_month,
                    status='absent'
                )
                absence_count = absence_records.count()
                
                logger.info(f'[Balances] Absence count: {absence_count}')
                
                if absence_count > 0:
                    # Find primary deduct template
                    primary_template = templates.filter(leave_policy__action='deduct').first()
                    if primary_template:
                        leave_type = primary_template.name
                        overdraft_name = primary_template.leave_policy.get('overdraft_name', 'LOP')
                        
                        # Calculate how many absences are covered:
                        # Approved leave requests cover some absences
                        # Remaining balance covers more absences
                        # Anything left goes to LOP
                        
                        # Find the leave balance entry
                        for entry in balance_data:
                            if entry['leave_type'] == leave_type:
                                current_balance = entry['balance']
                                
                                # Absences minus available balance = LOP
                                if absence_count > current_balance:
                                    uncovered = absence_count - current_balance
                                    overdraft_entries[overdraft_name] = overdraft_entries.get(overdraft_name, 0) + uncovered
                                    logger.info(f'[Balances] {absence_count} absences, {current_balance} available, {uncovered} to {overdraft_name}')
                                else:
                                    logger.info(f'[Balances] All {absence_count} absences covered by available balance')
                                break
            except Exception as e:
                logger.exception(f'[Balances] Failed to process absences: {e}')
            
            # Don't automatically use compensatory to pay down LOP
            # Users may want to track them separately and apply manually
            # If automatic paydown is needed, uncomment below:
            #
            # for entry in balance_data[:]:
            #     leave_type = entry['leave_type']
            #     template = templates.filter(name=leave_type, leave_policy__action='earn').first()
            #     if template and entry['balance'] > 0:
            #         overdraft_name = template.leave_policy.get('overdraft_name', 'LOP')
            #         if overdraft_name in overdraft_entries and overdraft_entries[overdraft_name] > 0:
            #             if entry['balance'] >= overdraft_entries[overdraft_name]:
            #                 entry['balance'] -= overdraft_entries[overdraft_name]
            #                 paid = overdraft_entries[overdraft_name]
            #                 overdraft_entries[overdraft_name] = 0
            #                 logger.info(f'[Balances] Used {paid} {leave_type} to pay down {overdraft_name}')
            #             else:
            #                 overdraft_entries[overdraft_name] -= entry['balance']
            #                 paid = entry['balance']
            #                 entry['balance'] = 0
            #                 logger.info(f'[Balances] Used {paid} {leave_type} to partially pay {overdraft_name}')
            
            # Collect all possible overdraft names from templates to ensure they appear even with 0 balance
            all_overdraft_names = set()
            for template in templates:
                policy = template.leave_policy
                if policy and 'overdraft_name' in policy:
                    all_overdraft_names.add(policy['overdraft_name'])
            
            # Add overdraft entries (LOP and others), ensuring all overdraft types appear even if 0
            for overdraft_name in all_overdraft_names:
                balance = overdraft_entries.get(overdraft_name, 0)
                balance_data.append({
                    'leave_type': overdraft_name,
                    'balance': balance,
                    'updated_at': None
                })
        
            return Response({
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'full_name': user.get_full_name() or user.username
                },
                'balances': balance_data
            })
        
        except Exception as e:
            logger.exception(f'[Balances] Error calculating balances for user {user.username}: {e}')
            return Response(
                {
                    'error': 'Failed to calculate balances',
                    'detail': str(e),
                    'user': {
                        'id': user.id,
                        'username': user.username,
                    },
                    'balances': []
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def process_absences(self, request):
        """
        Process absence records and update leave balances.
        POST /api/staff-requests/requests/process_absences/
        
        Body: {
            "user_id": 123,  // Optional, defaults to current user
            "year": 2026,
            "month": 3,
            "absence_dates": ["2026-03-01", "2026-03-05", "2026-03-10"]  // Optional, auto-fetch if not provided
        }
        
        This endpoint:
        1. Gets absence records for the specified period
        2. Finds the "Leave request" template (or first deduct template)
        3. Deducts from leave balance, overflows to LOP
        4. Uses compensatory leave to pay down LOP if available
        """
        import logging
        from datetime import datetime, date
        from .models import StaffLeaveBalance, RequestTemplate
        
        logger = logging.getLogger(__name__)
        user = request.user
        
        # Get target user (allow HR/HOD to process for others)
        target_user_id = request.data.get('user_id')
        if target_user_id:
            # TODO: Add permission check for HR/HOD
            from django.contrib.auth import get_user_model
            User = get_user_model()
            target_user = User.objects.get(id=target_user_id)
        else:
            target_user = user
        
        year = request.data.get('year')
        month = request.data.get('month')
        absence_dates = request.data.get('absence_dates', [])
        
        if not year or not month:
            return Response(
                {'error': 'year and month are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # If absence_dates not provided, fetch from attendance system
        if not absence_dates:
            # TODO: Integrate with your staff_attendance app
            # Example:
            # from staff_attendance.models import AttendanceRecord
            # records = AttendanceRecord.objects.filter(
            #     user=target_user,
            #     date__year=year,
            #     date__month=month,
            #     status='absent'
            # )
            # absence_dates = [str(r.date) for r in records]
            return Response(
                {'error': 'absence_dates required (automatic fetch not yet implemented)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Find the primary leave deduction template
        leave_template = RequestTemplate.objects.filter(
            is_active=True,
            leave_policy__action='deduct'
        ).first()
        
        if not leave_template:
            return Response(
                {'error': 'No active leave deduction template found'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        leave_policy = leave_template.leave_policy
        leave_type = leave_template.name
        overdraft_name = leave_policy.get('overdraft_name', 'LOP')
        
        # Calculate total absence days
        total_days = len(absence_dates)
        
        logger.info(f'[ProcessAbsences] User: {target_user.username}, Days: {total_days}, Dates: {absence_dates}')
        
        # Get or create leave balance
        balance_obj, created = StaffLeaveBalance.objects.get_or_create(
            staff=target_user,
            leave_type=leave_type,
            defaults={'balance': 0.0}
        )
        
        # Initialize balance for new entries
        if created:
            allotment = leave_policy.get('allotment_per_role', {})
            user_role = self._get_primary_role(target_user)
            balance_obj.balance = allotment.get(user_role, 0.0)
            balance_obj.save()
            logger.info(f'[ProcessAbsences] Initialized balance for {user_role}: {balance_obj.balance}')
        
        initial_balance = balance_obj.balance
        
        # Deduct absences from leave balance
        if balance_obj.balance >= total_days:
            # Sufficient balance
            balance_obj.balance -= total_days
            balance_obj.save()
            overflow_days = 0
            logger.info(f'[ProcessAbsences] Deducted {total_days} days: {initial_balance} -> {balance_obj.balance}')
        else:
            # Insufficient balance - overflow to LOP
            overflow_days = total_days - balance_obj.balance
            balance_obj.balance = 0.0
            balance_obj.save()
            
            # Add to LOP
            lop_balance, _ = StaffLeaveBalance.objects.get_or_create(
                staff=target_user,
                leave_type=overdraft_name,
                defaults={'balance': 0.0}
            )
            lop_balance.balance += overflow_days
            lop_balance.save()
            logger.info(f'[ProcessAbsences] Insufficient balance - added {overflow_days} days to LOP')
        
        # Try to use compensatory/earned leave to pay down LOP
        lop_balance = StaffLeaveBalance.objects.filter(
            staff=target_user,
            leave_type=overdraft_name
        ).first()
        
        if lop_balance and lop_balance.balance > 0:
            # Find all earned/neutral leave types with positive balance
            earned_balances = StaffLeaveBalance.objects.filter(
                staff=target_user,
                balance__gt=0
            ).exclude(leave_type__in=[leave_type, overdraft_name])
            
            for earned_balance in earned_balances:
                if lop_balance.balance <= 0:
                    break
                
                # Use earned leave to pay down LOP
                if earned_balance.balance >= lop_balance.balance:
                    earned_balance.balance -= lop_balance.balance
                    paid = lop_balance.balance
                    lop_balance.balance = 0.0
                else:
                    lop_balance.balance -= earned_balance.balance
                    paid = earned_balance.balance
                    earned_balance.balance = 0.0
                
                earned_balance.save()
                lop_balance.save()
                logger.info(f'[ProcessAbsences] Used {paid} days from {earned_balance.leave_type} to pay down LOP')
        
        # Get final balances
        final_balances = StaffLeaveBalance.objects.filter(staff=target_user).order_by('leave_type')
        balance_data = [{
            'leave_type': b.leave_type,
            'balance': b.balance,
            'updated_at': b.updated_at
        } for b in final_balances]
        
        return Response({
            'message': f'Processed {total_days} absence days for {target_user.get_full_name() or target_user.username}',
            'processed_days': total_days,
            'absence_dates': absence_dates,
            'balances': balance_data
        })


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
