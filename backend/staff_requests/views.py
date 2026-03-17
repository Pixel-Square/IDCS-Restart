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
        if hasattr(user, 'user_roles') and user.user_roles.filter(role__name__iexact=approver_role).exists():
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
    
    Special handling for SPL (Special) templates:
    - SPL templates (ending with " - SPL") are only for special roles: IQAC, HR, PS, HOD, CFSW, EDC, COE, HAA
    - Normal templates are hidden from users with special roles
    - Users with special roles see only SPL forms
    - Regular staff see only normal forms
    
    Args:
        user: The user model instance
        template: The RequestTemplate instance
    
    Returns:
        bool: True if user can apply with this template
    """
    if not template.is_active:
        return False
    
    # Superuser override
    if user.is_superuser:
        return True
    
    # Define special roles that use SPL forms
    SPL_ROLES = {'IQAC', 'HR', 'PS', 'HOD', 'CFSW', 'EDC', 'COE', 'HAA'}
    
    # Get user's roles
    user_role_names = set()
    if hasattr(user, 'user_roles'):
        user_role_names = set(user.user_roles.values_list('role__name', flat=True))
    
    # Check if user has any special role
    has_special_role = bool(user_role_names & SPL_ROLES)
    
    # Determine if this is an SPL template
    is_spl_template = template.name.endswith(' - SPL')
    
    # Apply SPL logic:
    # - If user has special role and template is SPL → allow
    # - If user has special role and template is normal → deny
    # - If user has no special role and template is SPL → deny
    # - If user has no special role and template is normal → check allowed_roles
    
    if is_spl_template:
        # SPL templates: only for users with special roles
        return has_special_role
    else:
        # Normal templates: hide from users with special roles
        if has_special_role:
            return False
        
        # Check normal allowed_roles logic
        # If no roles specified or empty array, allow all authenticated users (except special roles)
        if not template.allowed_roles or len(template.allowed_roles) == 0:
            return True
        
        # Check if user has any of the allowed roles
        if any(role in template.allowed_roles for role in user_role_names):
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
        Read-only endpoints (list, retrieve, active) require only authentication.
        Write operations (create, update, delete) require HR or Admin role.
        """
        from .permissions import IsAdminOrHR
        if self.action in ('list', 'retrieve', 'active', 'filter_for_date'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrHR()]
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """
        List only active templates that the current user can apply with.
        Filters based on user's roles and SPL/normal template logic.
        GET /api/request-templates/active/
        """
        active_templates = self.queryset.filter(is_active=True)
        
        # Filter templates based on user's ability to apply
        filtered_templates = [
            template for template in active_templates
            if can_user_apply_with_template(request.user, template)
        ]
        
        serializer = self.get_serializer(filtered_templates, many=True)
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
    
    @action(detail=False, methods=['post'])
    def filter_for_date(self, request):
        """
        Filter available templates based on date (holiday vs working day) and attendance status.
        POST /api/request-templates/filter_for_date/
        
        Body: {"date": "2026-03-08"}
        
        Rules:
        - Earn forms (action='earn') can only be applied on holidays
        - Deduct/neutral forms can only be applied on working days (non-holidays)
        - No forms can be applied on dates marked as 'absent' in attendance
        """
        date_str = request.data.get('date')
        if not date_str:
            return Response({'error': 'date parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from datetime import datetime
            check_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if date is holiday (department-aware)
        from staff_attendance.models import Holiday, AttendanceRecord

        # Resolve user's current department for dept-scoped holiday check
        user_dept_id = None
        try:
            if hasattr(request.user, 'staff_profile'):
                dept = request.user.staff_profile.get_current_department()
                if dept:
                    user_dept_id = dept.id
        except Exception:
            pass

        holiday_obj = Holiday.objects.filter(date=check_date).first()
        if holiday_obj:
            dept_ids = list(holiday_obj.departments.values_list('id', flat=True))
            # College-wide (no departments) → applies to everyone
            # Dept-scoped → applies only if user's dept is in the list
            is_holiday = (not dept_ids) or (user_dept_id is not None and user_dept_id in dept_ids)
        else:
            is_holiday = False
        
        # Check if it's Sunday (also considered holiday)
        is_sunday = check_date.weekday() == 6
        is_holiday_or_sunday = is_holiday or is_sunday
        
        # Check attendance status for this date
        attendance = AttendanceRecord.objects.filter(
            user=request.user, 
            date=check_date
        ).first()
        
        # For absent dates, show all forms except earn/COL type
        # This allows staff to request late entry, OD, leave, etc. on absent dates
        if attendance and attendance.status == 'absent':
            # Get all active templates except those with 'earn' action
            absent_templates = RequestTemplate.objects.filter(
                is_active=True
            ).exclude(
                leave_policy__action='earn'
            )
            
            # Filter by user roles (SPL logic)
            filtered_absent = [
                template for template in absent_templates
                if can_user_apply_with_template(request.user, template)
            ]
            
            return Response({
                'templates': RequestTemplateSerializer(filtered_absent, many=True).data,
                'message': 'Absent date - All forms except Earn available',
                'is_holiday': is_holiday_or_sunday,
                'is_absent': True,
                'attendance_status': attendance.status,
                'total_available': len(filtered_absent)
            })
        
        # Get all active templates
        templates = RequestTemplate.objects.filter(is_active=True).exclude(leave_policy={})
        
        # Filter based on holiday status and action type
        filtered = []
        for template in templates:
            # Check if user can apply with this template (SPL logic)
            if not can_user_apply_with_template(request.user, template):
                continue
                
            leave_policy = template.leave_policy
            if not leave_policy or 'action' not in leave_policy:
                continue
            
            action = leave_policy.get('action')
            
            # Earn forms (COL, etc.) only on holidays
            if is_holiday_or_sunday and action == 'earn':
                filtered.append(template)
            # Deduct/neutral forms only on working days
            elif not is_holiday_or_sunday and action in ['deduct', 'neutral']:
                filtered.append(template)
        
        return Response({
            'templates': RequestTemplateSerializer(filtered, many=True).data,
            'is_holiday': is_holiday_or_sunday,
            'is_absent': False,
            'total_available': len(filtered),
            'message': f'{"Earn forms available (Holiday)" if is_holiday_or_sunday else "Deduct/Neutral forms available (Working day)"}'
        })


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
                "reason": "Personal work",
                "claim_col": true  // Optional: claim COL instead of regular leave
            }
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        template = serializer.validated_data.get('template')
        form_data = serializer.validated_data.get('form_data', {})
        
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
        
        # Validate COL claim if requested
        claim_col = form_data.get('claim_col', False)
        if claim_col:
            # Only allow COL claim for deduct templates
            if not template.leave_policy or template.leave_policy.get('action') != 'deduct':
                return Response(
                    {'error': 'COL can only be claimed for leave deduction requests'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if user has COL balance
            col_template = RequestTemplate.objects.filter(
                is_active=True,
                leave_policy__action='earn'
            ).filter(
                Q(name__icontains='Compensatory') | Q(name__icontains='COL')
            ).first()
            
            if col_template:
                col_balance = StaffLeaveBalance.objects.filter(
                    staff=request.user,
                    leave_type=col_template.name
                ).first()
                
                if not col_balance or col_balance.balance <= 0:
                    return Response(
                        {'error': 'No COL balance available to claim'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Validate that request dates are after COL earned dates
                from staff_attendance.models import AttendanceRecord, Holiday
                from datetime import datetime
                
                # Get request dates
                request_dates = []
                for field_name in ['date', 'from_date', 'start_date', 'to_date', 'end_date']:
                    if field_name in form_data and form_data[field_name]:
                        try:
                            date_val = form_data[field_name]
                            if isinstance(date_val, str):
                                date_val = datetime.strptime(date_val, '%Y-%m-%d').date()
                            request_dates.append(date_val)
                        except (ValueError, TypeError):
                            pass
                
                if request_dates:
                    earliest_request_date = min(request_dates)
                    
                    # Find last COL earned date
                    last_col_work = AttendanceRecord.objects.filter(
                        user=request.user,
                        date__in=Holiday.objects.values_list('date', flat=True)
                    ).exclude(status='absent').order_by('-date').first()
                    
                    if last_col_work and earliest_request_date <= last_col_work.date:
                        return Response(
                            {'error': f'Cannot claim COL for dates on or before {last_col_work.date.isoformat()} (last COL earned date)'},
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
        
        # Permission check: Only approvers can access this endpoint
        approver_roles = ['HOD', 'AHOD', 'HR', 'HAA', 'IQAC', 'PS', 'PRINCIPAL', 'ADMIN']
        user_roles = set()
        
        if hasattr(user, 'user_roles'):
            user_roles = set(
                user.user_roles.values_list('role__name', flat=True).distinct()
            )
        
        has_approver_role = any(role.upper() in [r.upper() for r in approver_roles] for role in user_roles)
        has_permission = user.has_perm('staff_requests.approve_requests')
        
        if not (has_approver_role or has_permission or user.is_superuser):
            return Response(
                {'detail': 'You do not have permission to access pending approvals.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
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
                    
                    # Process attendance status changes (for late entry permissions, etc.)
                    try:
                        self._process_attendance_action(staff_request)
                    except Exception as e:
                        # Log and continue; do not fail the approval due to attendance processing error
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.exception('Failed to process attendance action for request %s: %s', staff_request.id, str(e))
                    
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
        
        # Apply action
        if action == 'deduct':
            overdraft_name = leave_policy.get('overdraft_name', 'LOP')
            
            # NEW LOP LOGIC: Check if this approval covers absent dates
            # LOP = Total absent days - Approved deduct form days for those absent dates
            request_dates = self._extract_dates_from_form_data(form_data)
            
            if request_dates:
                # Import AttendanceRecord model
                from staff_attendance.models import AttendanceRecord
                
                # Check which request dates were marked absent
                absent_dates_count = AttendanceRecord.objects.filter(
                    user=staff_request.applicant,
                    date__in=request_dates,
                    status='absent'
                ).count()
                
                logger.info(f'[LOP] Request covers {len(request_dates)} dates, {absent_dates_count} were absent')
                
                # If this deduct form covers absent dates, reduce LOP
                if absent_dates_count > 0:
                    lop_balance, created = StaffLeaveBalance.objects.get_or_create(
                        staff=staff_request.applicant,
                        leave_type=overdraft_name,
                        defaults={'balance': 0.0}
                    )
                    
                    # Reduce LOP by the number of absent dates being covered
                    # (These absent dates are now "explained" by approved leave)
                    old_lop = lop_balance.balance
                    lop_balance.balance = max(0, lop_balance.balance - absent_dates_count)
                    lop_balance.save()
                    
                    logger.info(f'[LOP] Reduced LOP for {absent_dates_count} covered absent dates: {old_lop} -> {lop_balance.balance}')
            
            # Handle regular balance deduction (if allotment configured)
            allotment = leave_policy.get('allotment_per_role', {})
            if allotment:
                # If user has requested to claim COL for this deduct request, try using COL balance first
                claim_col = False
                try:
                    claim_col = bool(staff_request.form_data.get('claim_col'))
                except Exception:
                    claim_col = False

                remaining_days = days

                if claim_col:
                    # Find COL template
                    from .models import RequestTemplate as RQTemplate
                    col_template = RQTemplate.objects.filter(
                        is_active=True,
                        leave_policy__action='earn'
                    ).filter(
                        Q(name__icontains='Compensatory') | Q(name__icontains='COL')
                    ).first()

                    if col_template:
                        col_balance_obj = StaffLeaveBalance.objects.filter(
                            staff=staff_request.applicant,
                            leave_type=col_template.name
                        ).first()

                        col_available = col_balance_obj.balance if col_balance_obj else 0.0
                        if col_available > 0:
                            use_from_col = min(col_available, remaining_days)
                            # Deduct from COL
                            col_balance_obj.balance = col_available - use_from_col
                            col_balance_obj.save()
                            logger.info(f'[LeaveBalance] Claimed {use_from_col} days from COL ({col_template.name}) for request {staff_request.id}')
                            remaining_days -= use_from_col

                    # When claim_col is checked, NEVER deduct from CL regardless of COL balance
                    remaining_days = 0
                    logger.info(f'[LeaveBalance] COL claim active - skipping CL deduction for request {staff_request.id}')

                # If COL covered all days (or claim_col forced skip), skip CL balance deduction
                if remaining_days <= 0:
                    logger.info(f'[LeaveBalance] All days covered by COL for request {staff_request.id}')
                else:
                    # Get or create leave balance only when needed
                    balance_obj, created = StaffLeaveBalance.objects.get_or_create(
                        staff=staff_request.applicant,
                        leave_type=leave_type,
                        defaults={'balance': 0.0}
                    )

                    logger.info(f'[LeaveBalance] Balance object - Created: {created}, Initial Balance: {balance_obj.balance}')

                    # Initialize balance for new entries (deduct action only)
                    if created:
                        from datetime import datetime, date
                        
                        # Get user's role (simplified - use first matching role)
                        user_role = self._get_primary_role(staff_request.applicant)
                        full_allotment = allotment.get(user_role, 0.0)
                        
                        # Check for split_date logic
                        split_date_str = leave_policy.get('split_date')
                        today = date.today()
                        
                        if split_date_str:
                            try:
                                split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                                
                                # If today is before split_date, initialize with first half only
                                if today < split_date:
                                    balance_obj.balance = full_allotment / 2
                                    logger.info(f'[LeaveBalance] Initialized with first half (split not reached): {balance_obj.balance}')
                                else:
                                    # After split_date, initialize with full allotment
                                    balance_obj.balance = full_allotment
                                    logger.info(f'[LeaveBalance] Initialized with full allotment (after split): {balance_obj.balance}')
                            except (ValueError, TypeError):
                                # If split_date parsing fails, use full allotment
                                balance_obj.balance = full_allotment
                                logger.warning(f'[LeaveBalance] Invalid split_date format, using full allotment: {balance_obj.balance}')
                        else:
                            # No split, use full allotment
                            balance_obj.balance = full_allotment
                            logger.info(f'[LeaveBalance] Initialized deduct balance for role {user_role}: {balance_obj.balance}')
                        
                        balance_obj.save()

                    # Now handle remaining_days using normal deduct logic
                    if balance_obj.balance >= remaining_days:
                        # Sufficient balance - deduct normally
                        old_balance = balance_obj.balance
                        balance_obj.balance -= remaining_days
                        balance_obj.save()
                        logger.info(f'[LeaveBalance] Deducted {remaining_days} days: {old_balance} -> {balance_obj.balance}')
                    else:
                        # Insufficient balance - deduct all and overflow to LOP
                        overflow = remaining_days - balance_obj.balance
                        balance_obj.balance = 0.0
                        balance_obj.save()

                        # Add overflow to LOP (this is additional LOP on top of absent-based LOP)
                        lop_balance, _ = StaffLeaveBalance.objects.get_or_create(
                            staff=staff_request.applicant,
                            leave_type=overdraft_name,
                            defaults={'balance': 0.0}
                        )
                        lop_balance.balance += overflow
                        lop_balance.save()
                        logger.info(f'[LeaveBalance] Insufficient balance - overflow {overflow} days to {overdraft_name}')
        
        elif action == 'earn':
            # Get or create balance for earn action
            balance_obj, created = StaffLeaveBalance.objects.get_or_create(
                staff=staff_request.applicant,
                leave_type=leave_type,
                defaults={'balance': 0.0}
            )
            logger.info(f'[LeaveBalance] Earn - Balance object - Created: {created}, Initial Balance: {balance_obj.balance}')
            
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
            # For neutral forms (like OD), use allotment-based deduction similar to deduct forms
            # HR allocates days per role (e.g., 12 OD days)
            # Usage decrements from allotment (12 → 11 → 10 ... → 0)
            # When it reaches 0, additional usage goes to LOP
            
            allotment = leave_policy.get('allotment_per_role', {})
            overdraft_name = leave_policy.get('overdraft_name', 'LOP')
            
            if not allotment:
                # If no allotment configured, just record as neutral without limits
                balance_obj, created = StaffLeaveBalance.objects.get_or_create(
                    staff=staff_request.applicant,
                    leave_type=leave_type,
                    defaults={'balance': 0.0}
                )
                logger.info(f'[LeaveBalance] Neutral (no allotment) - Balance object - Created: {created}, Initial Balance: {balance_obj.balance}')
                
                old_balance = balance_obj.balance
                balance_obj.balance += days
                balance_obj.save()
                logger.info(f'[LeaveBalance] Neutral action - added {days} days: {old_balance} -> {balance_obj.balance}')
            else:
                # Allotment configured - use deduction logic
                balance_obj, created = StaffLeaveBalance.objects.get_or_create(
                    staff=staff_request.applicant,
                    leave_type=leave_type,
                    defaults={'balance': 0.0}
                )
                
                logger.info(f'[LeaveBalance] Neutral (with allotment) - Balance object - Created: {created}, Initial Balance: {balance_obj.balance}')
                
                # Initialize balance for new entries
                if created:
                    from datetime import datetime, date
                    
                    # Get user's role
                    user_role = self._get_primary_role(staff_request.applicant)
                    full_allotment = allotment.get(user_role, 0.0)
                    
                    # Check for split_date logic (same as deduct forms)
                    split_date_str = leave_policy.get('split_date')
                    today = date.today()
                    
                    if split_date_str:
                        try:
                            split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                            
                            if today < split_date:
                                balance_obj.balance = full_allotment / 2
                                logger.info(f'[LeaveBalance] Neutral initialized with first half (split not reached): {balance_obj.balance}')
                            else:
                                balance_obj.balance = full_allotment
                                logger.info(f'[LeaveBalance] Neutral initialized with full allotment (after split): {balance_obj.balance}')
                        except (ValueError, TypeError):
                            balance_obj.balance = full_allotment
                            logger.warning(f'[LeaveBalance] Invalid split_date format, using full allotment: {balance_obj.balance}')
                    else:
                        balance_obj.balance = full_allotment
                        logger.info(f'[LeaveBalance] Neutral initialized for role {user_role}: {balance_obj.balance}')
                    
                    balance_obj.save()
                
                # Now handle deduction
                if balance_obj.balance >= days:
                    # Sufficient balance - deduct normally
                    old_balance = balance_obj.balance
                    balance_obj.balance -= days
                    balance_obj.save()
                    logger.info(f'[LeaveBalance] Neutral deducted {days} days: {old_balance} -> {balance_obj.balance}')
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
                    logger.info(f'[LeaveBalance] Neutral insufficient balance - overflow {overflow} days to {overdraft_name}')
        
        logger.info(f'[LeaveBalance] Processing complete for request #{staff_request.id}')
        
        # Sync attendance if configured
        attendance_status = leave_policy.get('attendance_status')
        if attendance_status:
            date_list = self._get_date_list_from_form_data(form_data)
            self._sync_attendance(staff_request.applicant, date_list, attendance_status)
    
    def _calculate_days_from_form_data(self, form_data):
        """
        Extract date range from form_data and calculate number of working days (excluding holidays).
        For leave balance deduction: counts working days only (excludes holidays and Sundays).
        For attendance marking: shifts are respected separately in _process_attendance_action.
        
        Example: 
        - March 6-10 (5 calendar days) with Sunday March 8:
          Working days = 4 (excludes Sunday)
          Leave balance deducted = 4 days (not 5)
        """
        from datetime import datetime, timedelta
        from staff_attendance.models import Holiday
        
        start_date = None
        end_date = None
        
        # Try different field name patterns
        for start_key in ['start_date', 'from_date', 'startDate', 'fromDate', 'from']:
            if start_key in form_data:
                start_date = form_data[start_key]
                break
        
        for end_key in ['end_date', 'to_date', 'endDate', 'toDate', 'to']:
            if end_key in form_data and form_data[end_key]:  # Check not empty
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
        
        # Calculate from date range (count working days, excluding holidays)
        if start_date and end_date:
            try:
                # Parse dates (handle both date strings and date objects)
                if isinstance(start_date, str):
                    # Handle empty string
                    if not start_date.strip():
                        start_date = None
                    else:
                        start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
                else:
                    start = start_date
                
                if isinstance(end_date, str):
                    # Handle empty string
                    if not end_date.strip():
                        end_date = None
                    else:
                        end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
                else:
                    end = end_date
                
                # If we have both valid dates, count working days only
                if start and end:
                    # Get all holidays in this date range
                    holidays_in_range = set(
                        Holiday.objects.filter(
                            date__gte=start,
                            date__lte=end
                        ).values_list('date', flat=True)
                    )
                    
                    # Count working days (exclude holidays and Sundays)
                    working_days = 0
                    current_date = start
                    while current_date <= end:
                        # Check if it's a Sunday (weekday() returns 6 for Sunday)
                        is_sunday = current_date.weekday() == 6
                        # Check if it's a marked holiday
                        is_holiday = current_date in holidays_in_range
                        
                        # Only count if it's not a holiday or Sunday
                        if not is_holiday and not is_sunday:
                            working_days += 1
                        
                        current_date += timedelta(days=1)

                    # Normalize shift markers
                    fn = str(form_data.get('from_noon', form_data.get('from_shift', ''))).strip().upper()
                    tn = str(form_data.get('to_noon', form_data.get('to_shift', ''))).strip().upper()
                    if fn == 'FULL DAY':
                        fn = 'FULL'
                    if tn == 'FULL DAY':
                        tn = 'FULL'

                    # Single-day leave/permission: explicit FN or AN must count as 0.5 day.
                    if start == end:
                        if fn in ['FN', 'AN'] and tn in ['FN', 'AN']:
                            return 0.5 if fn == tn else 1.0
                        if fn in ['FN', 'AN'] and not tn:
                            return 0.5
                        if tn in ['FN', 'AN'] and not fn:
                            return 0.5
                        if fn == 'FULL' or tn == 'FULL':
                            return 1.0
                        return float(working_days)

                    # Multi-day adjustment:
                    # from_noon='AN' → first day starts at AN, FN of first day skipped (-0.5)
                    # to_noon='FN'   → last day ends at FN, AN of last day skipped (-0.5)
                    half_day_adj = (0.5 if fn == 'AN' else 0.0) + (0.5 if tn == 'FN' else 0.0)
                    return max(0.0, working_days - half_day_adj)
            except (ValueError, AttributeError):
                pass
        
        # Single date - check if it's a holiday/Sunday
        if start_date:
            try:
                if isinstance(start_date, str):
                    if not start_date.strip():
                        return 1.0
                    single_date = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
                else:
                    single_date = start_date
                
                # Check if it's a holiday or Sunday
                is_sunday = single_date.weekday() == 6
                is_holiday = Holiday.objects.filter(date=single_date).exists()
                
                # If it's a holiday/Sunday, return 0 days (no leave deduction)
                if is_holiday or is_sunday:
                    return 0.0
                return 1.0
            except (ValueError, AttributeError):
                return 1.0
        
        # Default to 1 day if no valid date info found
        return 1.0
    
    def _extract_dates_from_form_data(self, form_data):
        """
        Extract all date values from form_data as a list of date objects.
        Returns a list of date objects for checking against attendance records.
        """
        from datetime import datetime, timedelta
        
        dates = []
        start_date = None
        end_date = None
        
        # Try different field name patterns for date ranges
        for start_key in ['start_date', 'from_date', 'startDate', 'fromDate', 'from']:
            if start_key in form_data:
                start_date = form_data[start_key]
                break
        
        for end_key in ['end_date', 'to_date', 'endDate', 'toDate', 'to']:
            if end_key in form_data:
                end_date = form_data[end_key]
                break

        # Support single 'date' field
        if not start_date and 'date' in form_data:
            start_date = form_data['date']
        if not end_date and 'date' in form_data:
            end_date = form_data['date']
        
        # Parse and generate date range
        if start_date and end_date:
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
                
                # Generate all dates in range
                current = start
                while current <= end:
                    dates.append(current)
                    current += timedelta(days=1)
            except Exception:
                pass
        
        return dates
    
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
        SPL roles (HOD, IQAC, HR, PS, CFSW, EDC, COE, HAA) take priority over
        generic FACULTY/STAFF roles so that a user who holds both an SPL role
        and a Staff role is allocated the SPL quota, not the Staff quota.
        Defaults to 'STAFF' if no roles found.
        """
        try:
            # Get all role names for this user
            user_roles = list(user.roles.values_list('name', flat=True))
            
            if not user_roles:
                return 'STAFF'
            
            # SPL roles first, then generic roles — ensures SPL allotment wins
            role_priority = ['HOD', 'IQAC', 'HR', 'PS', 'CFSW', 'EDC', 'COE', 'HAA',
                             'AHOD', 'FACULTY', 'STAFF']
            
            # Return first role that matches priority order
            for priority_role in role_priority:
                if priority_role in user_roles:
                    return priority_role
            
            # If no priority match, return first role
            return user_roles[0]
        except Exception:
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
    
    def _process_attendance_action(self, staff_request):
        """
        Process attendance status changes based on template attendance_action configuration.
        Used for requests like Late Entry Permission or Leave that should update attendance status when approved.
        Supports shift-based updates (FN/AN) with date range support:
        - Single shift: shift field (backward compatibility)
        - Date range with shifts: from_noon + to_noon for from_date + to_date
        
        Also handles leave templates by checking leave_policy.attendance_status if attendance_action is not configured.
        
        Args:
            staff_request: StaffRequest instance
        """
        import logging
        from datetime import datetime, timedelta
        
        logger = logging.getLogger(__name__)
        template = staff_request.template
        attendance_action = template.attendance_action
        leave_policy = template.leave_policy
        
        # Determine the target status to apply
        # Priority: leave_policy.attendance_status (for leave) > attendance_action.to_status (for permissions)
        # This ensures leave templates (CL, OD, ML) use the correct status code
        to_status = None
        from_status = 'absent'
        
        if leave_policy and leave_policy.get('attendance_status'):
            # Use leave_policy configuration (for CL, OD, ML, etc.) - PRIORITY
            to_status = leave_policy.get('attendance_status')
            logger.info(f'[AttendanceAction] Using leave_policy.attendance_status: {to_status}')
        elif attendance_action and attendance_action.get('change_status'):
            # Use attendance_action configuration (for Late Entry Permission, etc.)
            from_status = attendance_action.get('from_status', 'absent')
            to_status = attendance_action.get('to_status', 'present')
            logger.info(f'[AttendanceAction] Using attendance_action: {from_status} -> {to_status}')
        else:
            # No configuration - skip
            logger.info(f'[AttendanceAction] Skipping - no attendance action or leave policy for template {template.name}')
            return
        
        # Get additional settings from attendance_action if available
        add_notes = attendance_action.get('add_notes', False) if attendance_action else False
        notes_template = attendance_action.get('notes_template', '') if attendance_action else ''
        
        form_data = staff_request.form_data
        # Support both old and new field names for backward compatibility
        shift = form_data.get('shift', None)  # Old field (backward compatibility)
        # Also fall back to 'shift' so that forms like Late Entry (which have a 'shift' select
        # field and a 'from_date' field) are handled correctly in the single-from_date case (Case 3).
        from_noon = form_data.get('from_noon', form_data.get('from_shift', form_data.get('shift', None)))
        to_noon = form_data.get('to_noon', form_data.get('to_shift', None))  # New field name
        
        # Clean up the shift values - strip whitespace and handle empty strings
        if from_noon:
            from_noon = str(from_noon).strip()
            if not from_noon or from_noon == '':
                from_noon = None
        if to_noon:
            to_noon = str(to_noon).strip()
            if not to_noon or to_noon == '':
                to_noon = None
        if shift:
            shift = str(shift).strip()
            if not shift or shift == '':
                shift = None
        
        logger.info(f'[AttendanceAction] Processing request #{staff_request.id} - Template: {template.name}')
        logger.info(f'[AttendanceAction] Change: {from_status} -> {to_status}, Shift: {shift}, From_noon: {from_noon}, To_noon: {to_noon}')
        logger.info(f'[AttendanceAction] Form data: {form_data}')
        
        # Handle date range with shifts (from_date + to_date + from_shift + to_shift)
        from_date = None
        to_date = None
        
        # Try to find from_date and to_date
        for start_key in ['from_date', 'start_date', 'fromDate', 'startDate']:
            if start_key in form_data:
                try:
                    date_val = form_data[start_key]
                    if isinstance(date_val, str):
                        from_date = datetime.strptime(date_val, '%Y-%m-%d').date()
                    else:
                        from_date = date_val
                    break
                except (ValueError, AttributeError) as e:
                    logger.warning(f'[AttendanceAction] Failed to parse {start_key}: {e}')
        
        for end_key in ['to_date', 'end_date', 'toDate', 'endDate']:
            if end_key in form_data and form_data[end_key]:  # Check value is not empty
                try:
                    date_val = form_data[end_key]
                    if isinstance(date_val, str):
                        # Skip empty strings
                        if not date_val.strip():
                            continue
                        to_date = datetime.strptime(date_val, '%Y-%m-%d').date()
                    else:
                        to_date = date_val
                    break
                except (ValueError, AttributeError) as e:
                    logger.warning(f'[AttendanceAction] Failed to parse {end_key}: {e}')
        
        # Single date field
        single_date = None
        if 'date' in form_data:
            try:
                date_val = form_data['date']
                if isinstance(date_val, str):
                    single_date = datetime.strptime(date_val, '%Y-%m-%d').date()
                else:
                    single_date = date_val
            except (ValueError, AttributeError) as e:
                logger.warning(f'[AttendanceAction] Failed to parse date: {e}')
        
        # Update attendance records
        try:
            from staff_attendance.models import AttendanceRecord
            
            updated_count = 0
            
            # Case 1: Date range with optional shifts (from_date to to_date)
            if from_date and to_date:
                # Import Holiday model to check for holidays
                from staff_attendance.models import Holiday
                
                # Check if this is a COL earn template (Compensatory Off Leave)
                # OR a permission template that changes attendance status (like Late Entry)
                # For these templates, we should NOT skip holidays - treat them as working days
                is_col_earn = (
                    leave_policy and 
                    leave_policy.get('action') == 'earn' and 
                    ('compensatory' in template.name.lower() or 'col' in template.name.lower())
                )
                
                is_permission_form = (
                    attendance_action and 
                    attendance_action.get('change_status') == True
                )
                
                # Get all holidays in this date range
                holidays_in_range = set(
                    Holiday.objects.filter(
                        date__gte=from_date,
                        date__lte=to_date
                    ).values_list('date', flat=True)
                )
                
                current_date = from_date
                date_count = 0
                skipped_holidays = 0
                
                while current_date <= to_date:
                    date_count += 1
                    
                    # Check if current date is a holiday or Sunday
                    is_sunday = current_date.weekday() == 6
                    is_holiday = current_date in holidays_in_range
                    
                    # For COL earn forms or permission forms, don't skip holidays
                    # For other forms (regular leave), skip holidays and Sundays
                    if (is_holiday or is_sunday) and not (is_col_earn or is_permission_form):
                        # Skip creating attendance record for holidays and Sundays
                        skipped_holidays += 1
                        logger.info(f'[AttendanceAction] Skipping {current_date} (Holiday/Sunday)')
                        current_date += timedelta(days=1)
                        continue
                    
                    if (is_col_earn or is_permission_form) and (is_holiday or is_sunday):
                        logger.info(f'[AttendanceAction] Processing {current_date} on holiday (COL earn or permission form)')
                    
                    # Determine which shift to update for this date
                    # Normalize shift values: 'Full day' -> 'FULL'
                    normalized_from_noon = None
                    normalized_to_noon = None
                    
                    if from_noon:
                        from_noon_str = str(from_noon).strip()
                        if from_noon_str.lower() == 'full day':
                            normalized_from_noon = 'FULL'
                        else:
                            normalized_from_noon = from_noon_str.upper()
                    
                    if to_noon:
                        to_noon_str = str(to_noon).strip()
                        if to_noon_str.lower() == 'full day':
                            normalized_to_noon = 'FULL'
                        else:
                            normalized_to_noon = to_noon_str.upper()
                    
                    target_shift = None
                    if current_date == from_date and normalized_from_noon and normalized_from_noon in ['FN', 'AN', 'FULL']:
                        target_shift = normalized_from_noon
                    elif current_date == to_date and normalized_to_noon and normalized_to_noon in ['FN', 'AN', 'FULL']:
                        target_shift = normalized_to_noon
                    elif current_date == from_date == to_date:
                        # Same day - apply both shifts if both specified
                        if normalized_from_noon and normalized_to_noon:
                            target_shift = 'FULL'  # Both FN and AN
                        elif normalized_from_noon:
                            target_shift = normalized_from_noon
                        elif normalized_to_noon:
                            target_shift = normalized_to_noon
                    else:
                        # Middle date - full day
                        target_shift = 'FULL'
                    
                    logger.info(f'[AttendanceAction] Date {current_date}: target_shift={target_shift}')
                    
                    # Get or create attendance record
                    record, created = AttendanceRecord.objects.get_or_create(
                        user=staff_request.applicant,
                        date=current_date,
                        defaults={
                            'status': 'absent',
                            'fn_status': 'absent',
                            'an_status': 'absent'
                        }
                    )
                    
                    # Update based on target shift
                    if target_shift == 'FN':
                        record.fn_status = to_status
                    elif target_shift == 'AN':
                        record.an_status = to_status
                    elif target_shift == 'FULL' or not target_shift:
                        record.fn_status = to_status
                        record.an_status = to_status
                    
                    # Recalculate overall status
                    if record.fn_status == record.an_status:
                        # Both sessions have same status - use that status
                        record.status = record.fn_status
                    elif record.fn_status != 'absent' or record.an_status != 'absent':
                        # One session has a non-absent status - half day
                        record.status = 'half_day'
                    else:
                        # Both sessions absent
                        record.status = 'absent'
                    
                    # Add notes if configured
                    if add_notes and notes_template:
                        try:
                            note = notes_template.format(**form_data)
                            if record.notes:
                                record.notes = f"{record.notes}; {note}"
                            else:
                                record.notes = note
                        except (KeyError, ValueError) as e:
                            logger.warning(f'[AttendanceAction] Failed to format notes template: {e}')
                    
                    record.save()
                    updated_count += 1
                    logger.info(f'[AttendanceAction] Updated {current_date}: FN={record.fn_status}, AN={record.an_status}, Overall={record.status}')
                    
                    current_date += timedelta(days=1)
                
                logger.info(f'[AttendanceAction] Updated {updated_count} working days from {from_date} to {to_date} (skipped {skipped_holidays} holidays/Sundays)')
            
            # Case 2: Single date with optional shift
            elif single_date:
                # Import Holiday model to check for holidays
                from staff_attendance.models import Holiday
                
                # Check if this is a COL earn template (Compensatory Off Leave)
                # OR a permission template that changes attendance status (like Late Entry)
                # For these templates, we should NOT skip holidays - treat them as working days
                is_col_earn = (
                    leave_policy and 
                    leave_policy.get('action') == 'earn' and 
                    ('compensatory' in template.name.lower() or 'col' in template.name.lower())
                )
                
                is_permission_form = (
                    attendance_action and 
                    attendance_action.get('change_status') == True
                )
                
                # Check if single date is a holiday or Sunday
                is_sunday = single_date.weekday() == 6
                is_holiday = Holiday.objects.filter(date=single_date).exists()
                
                # For COL earn forms or permission forms, don't skip holidays
                # For other forms (regular leave), skip holidays and Sundays
                if (is_holiday or is_sunday) and not (is_col_earn or is_permission_form):
                    # Skip creating attendance record for holidays and Sundays
                    logger.info(f'[AttendanceAction] Skipping {single_date} (Holiday/Sunday) - no attendance record created')
                else:
                    if (is_col_earn or is_permission_form) and (is_holiday or is_sunday):
                        logger.info(f'[AttendanceAction] Processing {single_date} on holiday (COL earn or permission form)')
                    
                    # For COL on holidays with half-day (FN/AN), only save the requested session
                    is_holiday_col_half_day = (is_col_earn and (is_holiday or is_sunday) and 
                                               shift and shift.upper() in ['FN', 'AN'])
                    
                    record, created = AttendanceRecord.objects.get_or_create(
                        user=staff_request.applicant,
                        date=single_date,
                        defaults={
                            'status': 'absent',
                            'fn_status': 'absent',
                            'an_status': 'absent'
                        }
                    )
                    
                    # If shift is specified (FN or AN), update only that session
                    if shift and shift.upper() in ['FN', 'AN']:
                        shift_field = 'fn_status' if shift.upper() == 'FN' else 'an_status'
                        other_shift_field = 'an_status' if shift.upper() == 'FN' else 'fn_status'
                        
                        setattr(record, shift_field, to_status)
                        
                        # For half-day COL on holidays, leave the other session null (no data)
                        if is_holiday_col_half_day:
                            setattr(record, other_shift_field, None)
                        
                        # Recalculate overall status
                        fn_val = record.fn_status
                        an_val = record.an_status
                        
                        if fn_val is None and an_val is None:
                            # Both sessions null - no status
                            record.status = 'absent'
                        elif fn_val is None or an_val is None:
                            # One session has data - use that session's status
                            record.status = fn_val if an_val is None else an_val
                        elif fn_val == an_val:
                            # Both sessions have same status - use that status
                            record.status = fn_val
                        elif fn_val != 'absent' or an_val != 'absent':
                            # One session has a non-absent status - half day
                            record.status = 'half_day'
                        else:
                            # Both sessions absent
                            record.status = 'absent'
                        
                        logger.info(f'[AttendanceAction] Updated {shift} session for {single_date}')
                    else:
                        # Full day
                        record.fn_status = to_status
                        record.an_status = to_status
                        record.status = to_status
                        logger.info(f'[AttendanceAction] Updated full day for {single_date}')
                    
                    # Add notes if configured
                    if add_notes and notes_template:
                        try:
                            note = notes_template.format(**form_data)
                            if record.notes:
                                record.notes = f"{record.notes}; {note}"
                            else:
                                record.notes = note
                        except (KeyError, ValueError) as e:
                            logger.warning(f'[AttendanceAction] Failed to format notes template: {e}')
                    
                    record.save()
                    updated_count += 1
            
            # Case 3: Single from_date without to_date (half-day or full-day)
            elif from_date:
                logger.info(f'[AttendanceAction] Case 3: Single date {from_date}, from_noon={from_noon}')
                
                # Import Holiday model to check if this is a holiday
                from staff_attendance.models import Holiday
                
                # Check if from_date is a holiday or Sunday
                is_sunday = from_date.weekday() == 6
                is_holiday = Holiday.objects.filter(date=from_date).exists()
                
                # Check if this is a COL earn form
                is_col_earn = (
                    leave_policy and 
                    leave_policy.get('action') == 'earn' and 
                    ('compensatory' in template.name.lower() or 'col' in template.name.lower())
                )
                
                # Normalize from_noon to determine if it's half-day
                normalized_from_noon = None
                if from_noon:
                    from_noon_str = str(from_noon).strip()
                    if from_noon_str.lower() == 'full day':
                        normalized_from_noon = 'FULL'
                    else:
                        normalized_from_noon = from_noon_str.upper()
                
                # For COL on holidays with half-day (FN/AN), only save the requested session
                is_holiday_col_half_day = (
                    is_col_earn and 
                    (is_holiday or is_sunday) and 
                    normalized_from_noon in ['FN', 'AN']
                )
                
                record, created = AttendanceRecord.objects.get_or_create(
                    user=staff_request.applicant,
                    date=from_date,
                    defaults={
                        'status': 'absent',
                        'fn_status': 'absent',
                        'an_status': 'absent'
                    }
                )
                
                logger.info(f'[AttendanceAction] Record {"created" if created else "retrieved"}: FN={record.fn_status}, AN={record.an_status}')
                
                # If from_noon is specified (FN, AN, or FULL), handle accordingly
                if normalized_from_noon and normalized_from_noon in ['FN', 'AN']:
                    session = normalized_from_noon
                    logger.info(f'[AttendanceAction] Updating {session} session to {to_status}')
                    
                    if session == 'FN':
                        record.fn_status = to_status
                        # For half-day COL on holidays, leave the other session null
                        if is_holiday_col_half_day:
                            record.an_status = None
                    else:
                        record.an_status = to_status
                        # For half-day COL on holidays, leave the other session null
                        if is_holiday_col_half_day:
                            record.fn_status = None
                    
                    # Recalculate overall status
                    fn_val = record.fn_status
                    an_val = record.an_status
                    
                    if fn_val is None and an_val is None:
                        # Both sessions null - no status
                        record.status = 'absent'
                    elif fn_val is None or an_val is None:
                        # One session has data - use that session's status
                        record.status = fn_val if an_val is None else an_val
                    elif fn_val == an_val:
                        # Both sessions have same status - use that status
                        record.status = fn_val
                    elif fn_val != 'absent' or an_val != 'absent':
                        # One session has a non-absent status - half day
                        record.status = 'half_day'
                    else:
                        # Both sessions absent
                        record.status = 'absent'
                    
                    logger.info(f'[AttendanceAction] After update: FN={record.fn_status}, AN={record.an_status}, Overall={record.status}')
                elif normalized_from_noon == 'FULL':
                    # Full day explicitly selected
                    logger.info(f'[AttendanceAction] Full day selected, applying to both sessions')
                    record.fn_status = to_status
                    record.an_status = to_status
                    record.status = to_status
                    logger.info(f'[AttendanceAction] Updated full day: FN={record.fn_status}, AN={record.an_status}, Overall={record.status}')
                else:
                    # No valid session specified - default to full day
                    logger.info(f'[AttendanceAction] No valid session specified (from_noon={from_noon}), applying full day')
                    record.fn_status = to_status
                    record.an_status = to_status
                    record.status = to_status
                    logger.info(f'[AttendanceAction] Updated full day: FN={record.fn_status}, AN={record.an_status}, Overall={record.status}')
                
                # Add notes if configured
                if add_notes and notes_template:
                    try:
                        note = notes_template.format(**form_data)
                        if record.notes:
                            record.notes = f"{record.notes}; {note}"
                        else:
                            record.notes = note
                    except (KeyError, ValueError) as e:
                        logger.warning(f'[AttendanceAction] Failed to format notes template: {e}')
                
                record.save()
                updated_count += 1
            
            else:
                logger.warning(f'[AttendanceAction] No valid dates found in form_data')
            
            # SCENARIO 4: Re-award COL for late entry permissions on holidays
            # If this is a late entry permission (or similar) that makes staff present on a holiday, award COL
            is_making_present = (to_status in ['present', 'half_day', 'partial'])
            if is_making_present and updated_count > 0:
                # Check if any of the updated dates are holidays
                from staff_attendance.models import Holiday
                
                dates_to_check = []
                if from_date and to_date:
                    current = from_date
                    while current <= to_date:
                        dates_to_check.append(current)
                        current += timedelta(days=1)
                elif single_date:
                    dates_to_check.append(single_date)
                elif from_date:
                    dates_to_check.append(from_date)
                
                for check_date in dates_to_check:
                    is_holiday = Holiday.objects.filter(date=check_date).exists()
                    if is_holiday:
                        # This late entry permission makes them present on a holiday - award COL
                        from staff_requests.models import RequestTemplate, StaffLeaveBalance
                        
                        col_template = RequestTemplate.objects.filter(
                            is_active=True,
                            leave_policy__action='earn'
                        ).filter(
                            Q(name__icontains='Compensatory') | Q(name__icontains='COL')
                        ).first()
                        
                        if col_template:
                            balance, created = StaffLeaveBalance.objects.get_or_create(
                                staff=staff_request.applicant,
                                leave_type=col_template.name,
                                defaults={'balance': 0}
                            )
                            old_balance = balance.balance
                            balance.balance += 1
                            balance.save()
                            logger.info(
                                f"[COL_RESTORE] Late entry permission approved for {staff_request.applicant.username} "
                                f"on holiday {check_date}. Awarded COL: {old_balance} -> {balance.balance}"
                            )
            
            logger.info(f'[AttendanceAction] Updated {updated_count} attendance record(s) for request #{staff_request.id}')
            
        except Exception as e:
            logger.exception(f'[AttendanceAction] Failed to update attendance: {e}')
    
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
        from academics.models import StaffProfile
        
        user = request.user
        logs = ApprovalLog.objects.filter(approver=user).select_related('request', 'request__template', 'request__applicant').order_by('-action_date')

        results = []
        for log in logs:
            item = ApprovalLogSerializer(log).data
            
            # Get applicant staff_id
            applicant_staff_id = None
            try:
                staff_profile = StaffProfile.objects.filter(user=log.request.applicant).first()
                applicant_staff_id = staff_profile.staff_id if staff_profile else log.request.applicant.username
            except Exception:
                applicant_staff_id = log.request.applicant.username
            
            # Get first text field value from form_data
            form_reason = None
            if log.request.template and hasattr(log.request.template, 'form_schema') and log.request.template.form_schema:
                # Find first text or textarea field
                for field in log.request.template.form_schema:
                    if field.get('type') in ['text', 'textarea']:
                        field_name = field.get('name')
                        if field_name and log.request.form_data.get(field_name):
                            form_reason = str(log.request.form_data[field_name])[:60]
                        break
            
            # attach small request summary
            item['request_summary'] = {
                'id': log.request.id,
                'template_name': getattr(log.request.template, 'name', None),
                'applicant_name': getattr(log.request.applicant, 'get_full_name', lambda: None)() or getattr(log.request.applicant, 'username', None),
                'applicant_username': getattr(log.request.applicant, 'username', None),
                'applicant_staff_id': applicant_staff_id,
                'form_reason': form_reason or '—',
                'status': log.request.status,
            }
            item['request_id'] = log.request.id
            results.append(item)

        return Response(results)
    
    @action(detail=False, methods=['get'])
    def balances(self, request):
        """
        Get leave balances for the current user.
        GET /api/staff-requests/balances/
        
        Returns persisted balances from StaffLeaveBalance table.
        Balances are updated when requests are approved via process_approval action.
        """
        import logging
        from .models import RequestTemplate
        
        logger = logging.getLogger(__name__)
        user = request.user
        
        try:
            logger.info(f'[Balances] Fetching persisted balances for user {user.username}')
            
            # Get all active templates with leave policies
            all_templates = RequestTemplate.objects.filter(is_active=True).exclude(leave_policy={})
            
            # Filter templates based on user roles (SPL logic)
            templates = [
                template for template in all_templates
                if can_user_apply_with_template(request.user, template)
            ]
            
            # Create a set of template names that user can apply for
            applicable_template_names = {template.name for template in templates}
            
            # Get all persisted balances for the user, but only for applicable templates
            balances_qs = StaffLeaveBalance.objects.filter(staff=user)
            
            balance_data = []
            for balance_obj in balances_qs:
                # Only include balances for templates the user can apply for
                if balance_obj.leave_type in applicable_template_names:
                    balance_data.append({
                        'leave_type': balance_obj.leave_type,
                        'balance': balance_obj.balance,
                        'updated_at': balance_obj.updated_at.isoformat() if balance_obj.updated_at else None
                    })
                    logger.info(f'[Balances] {balance_obj.leave_type}: {balance_obj.balance}')
            
            # Also include templates with leave_policy that don't have balances yet (show as 0)
            existing_leave_types = set(b['leave_type'] for b in balance_data)
            
            for template in templates:
                leave_policy = template.leave_policy
                if not leave_policy or 'action' not in leave_policy:
                    continue
                
                leave_type = template.name
                
                # Skip if already in balance_data
                if leave_type in existing_leave_types:
                    continue
                
                # For deduct/earn/neutral templates, show with 0 balance if no record exists
                action = leave_policy.get('action')
                if action in ['deduct', 'earn', 'neutral']:
                    # For deduct and neutral actions, initialize with allotment
                    if action in ['deduct', 'neutral']:
                        from datetime import datetime, date
                        
                        allotment_per_role = leave_policy.get('allotment_per_role', {})
                        user_role = self._get_primary_role(user)
                        full_allotment = allotment_per_role.get(user_role, 0)
                        
                        # Check for split_date logic
                        split_date_str = leave_policy.get('split_date')
                        today = date.today()
                        
                        if split_date_str:
                            try:
                                split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                                
                                # If today is before split_date, show only first half
                                if today < split_date:
                                    allotment = full_allotment / 2
                                else:
                                    # After split_date, show full allotment (second half should have been added)
                                    # This is initial display; actual balance will be from DB if it exists
                                    allotment = full_allotment
                            except (ValueError, TypeError):
                                # If split_date parsing fails, use full allotment
                                allotment = full_allotment
                        else:
                            # No split, use full allotment
                            allotment = full_allotment
                        
                        balance_data.append({
                            'leave_type': leave_type,
                            'balance': allotment,
                            'updated_at': None
                        })
                    else:
                        # earn action starts at 0
                        balance_data.append({
                            'leave_type': leave_type,
                            'balance': 0,
                            'updated_at': None
                        })
                    
                    existing_leave_types.add(leave_type)
            
            # Add overdraft types (LOP, etc.) with 0 if not present
            all_overdraft_names = set()
            for template in templates:
                policy = template.leave_policy
                if policy and 'overdraft_name' in policy:
                    all_overdraft_names.add(policy['overdraft_name'])
            
            for overdraft_name in all_overdraft_names:
                if overdraft_name not in existing_leave_types:
                    balance_data.append({
                        'leave_type': overdraft_name,
                        'balance': 0,
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
            logger.exception(f'[Balances] Error fetching balances for user {user.username}: {e}')
            return Response(
                {
                    'error': 'Failed to fetch balances',
                    'detail': str(e),
                    'user': {
                        'id': user.id,
                        'username': user.username,
                    },
                    'balances': []
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def late_entry_stats(self, request):
        """
        Get current-month Late Entry Permission usage counts for the requesting user.
        GET /api/staff-requests/requests/late_entry_stats/
        Optional query param: ?month=YYYY-MM  (defaults to current month)

        Returns:
          {
            "month": "2026-03",
            "ten_mins": <count of approved requests with late_duration="10 mins">,
            "one_hr":   <count of approved requests with late_duration="1 hr">,
            "total":    <combined count>
          }
        """
        from datetime import date
        import calendar

        month_param = request.query_params.get('month')
        if month_param:
            try:
                year, month = map(int, month_param.split('-'))
            except (ValueError, AttributeError):
                return Response({'error': 'Invalid month format, use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            today = date.today()
            year, month = today.year, today.month

        month_start = date(year, month, 1)
        month_end = date(year, month, calendar.monthrange(year, month)[1])

        # Find approved Late Entry requests for this user in the month
        late_requests = StaffRequest.objects.filter(
            applicant=request.user,
            template__name__icontains='late entry',
            status='approved',
            created_at__date__gte=month_start,
            created_at__date__lte=month_end,
        )

        ten_mins = 0
        one_hr = 0
        for req in late_requests:
            duration = (req.form_data or {}).get('late_duration', '')
            if duration == '10 mins':
                ten_mins += 1
            elif duration == '1 hr':
                one_hr += 1

        return Response({
            'month': f'{year:04d}-{month:02d}',
            'ten_mins': ten_mins,
            'one_hr': one_hr,
            'total': ten_mins + one_hr,
        })

    @action(detail=False, methods=['get'])
    def col_claimable_info(self, request):
        """
        Get COL balance and claimable dates for the current user.
        
        Returns:
        - col_balance: Current COL count
        - claimable_dates: List of future/today dates that are NOT holidays where COL can be claimed
        - earned_dates: Dates when COL was earned (for reference)
        """
        user = request.user
        current_date = timezone.now().date()
        
        # Find COL template
        col_template = RequestTemplate.objects.filter(
            is_active=True,
            leave_policy__action='earn'
        ).filter(
            Q(name__icontains='Compensatory') | Q(name__icontains='COL')
        ).first()
        
        if not col_template:
            return Response({
                'col_balance': 0,
                'claimable_dates': [],
                'earned_dates': [],
                'message': 'COL template not found'
            })
        
        # Get COL balance
        col_balance_obj = StaffLeaveBalance.objects.filter(
            staff=user,
            leave_type=col_template.name
        ).first()
        
        col_balance = col_balance_obj.balance if col_balance_obj else 0
        
        # Get dates when COL was earned (attendance on holidays)
        from staff_attendance.models import AttendanceRecord, Holiday
        
        # Find all attendance records on holidays
        earned_dates = []
        holiday_work_records = AttendanceRecord.objects.filter(
            user=user,
            date__in=Holiday.objects.values_list('date', flat=True)
        ).exclude(status='absent').order_by('-date')
        
        for record in holiday_work_records[:5]:  # Last 5
            earned_dates.append({
                'date': record.date.isoformat(),
                'day_name': record.date.strftime('%A'),
                'status': record.status
            })
        
        # Generate list of claimable dates (working days from today onwards for next 30 days)
        claimable_dates = []
        if col_balance > 0:
            from datetime import timedelta
            
            # Check next 30 days for working days
            for i in range(30):
                check_date = current_date + timedelta(days=i)
                is_holiday = Holiday.objects.filter(date=check_date).exists()
                is_sunday = check_date.weekday() == 6
                
                # Only working days (not holidays, not Sundays)
                if not is_holiday and not is_sunday:
                    claimable_dates.append({
                        'date': check_date.isoformat(),
                        'day_name': check_date.strftime('%A')
                    })
                    
                    if len(claimable_dates) >= 10:  # Limit to 10 dates
                        break
        
        return Response({
            'col_balance': col_balance,
            'col_template_name': col_template.name if col_template else None,
            'claimable_dates': claimable_dates,
            'earned_dates': earned_dates,
            'message': f'You have {col_balance} COL days available' if col_balance > 0 else 'No COL balance available'
        })
    
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
            from datetime import datetime, date
            
            allotment = leave_policy.get('allotment_per_role', {})
            user_role = self._get_primary_role(target_user)
            full_allotment = allotment.get(user_role, 0.0)
            
            # Check for split_date logic
            split_date_str = leave_policy.get('split_date')
            today = date.today()
            
            if split_date_str:
                try:
                    split_date = datetime.strptime(split_date_str, '%Y-%m-%d').date()
                    
                    # If today is before split_date, initialize with first half only
                    if today < split_date:
                        balance_obj.balance = full_allotment / 2
                        logger.info(f'[ProcessAbsences] Initialized with first half (split not reached): {balance_obj.balance}')
                    else:
                        # After split_date, initialize with full allotment
                        balance_obj.balance = full_allotment
                        logger.info(f'[ProcessAbsences] Initialized with full allotment (after split): {balance_obj.balance}')
                except (ValueError, TypeError):
                    # If split_date parsing fails, use full allotment
                    balance_obj.balance = full_allotment
                    logger.warning(f'[ProcessAbsences] Invalid split_date format, using full allotment: {balance_obj.balance}')
            else:
                # No split, use full allotment
                balance_obj.balance = full_allotment
                logger.info(f'[ProcessAbsences] Initialized balance for {user_role}: {balance_obj.balance}')
            
            balance_obj.save()

        
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
