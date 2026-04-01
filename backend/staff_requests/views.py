from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q, Prefetch
from django.utils import timezone
from django.contrib.auth import get_user_model
from datetime import date as date_type

from .models import RequestTemplate, ApprovalStep, StaffRequest, ApprovalLog, StaffLeaveBalance
from staff_salary.models import SalaryMonthPublish
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
    
    # Determine if this is an SPL template (robust to casing/extra spaces)
    template_name = (getattr(template, 'name', '') or '').strip()
    is_spl_template = template_name.upper().endswith(' - SPL')
    
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


def template_has_nonzero_allocation_for_user(user, template) -> bool:
    """Return False when template has explicit per-role allotment of 0 for this user.

    This is used to hide templates from availability endpoints. The create endpoint
    still performs a strict validation via StaffRequestViewSet._validate_template_allocation.
    """
    try:
        leave_policy = getattr(template, 'leave_policy', None) or {}
        action = str(leave_policy.get('action') or '').strip().lower()
        if action not in ['deduct', 'neutral']:
            return True

        def is_monthly_reset(policy: dict) -> bool:
            token = str(policy.get('reset_period') or policy.get('reset_duration') or '').strip().lower()
            return token == 'monthly'

        def monthly_period_bounds(dt):
            import calendar
            from datetime import date

            start = date(dt.year, dt.month, 1)
            end = date(dt.year, dt.month, calendar.monthrange(dt.year, dt.month)[1])
            return start, end

        def request_units_in_period(req: StaffRequest, period_start, period_end) -> float:
            # Late entry permissions count as 1 per request.
            name = (getattr(req.template, 'name', '') or '').strip().lower()
            if name in ['late entry permission', 'late entry permission - spl']:
                eff = None
                try:
                    eff = req.form_data.get('date') or req.form_data.get('from_date') or req.form_data.get('start_date')
                except Exception:
                    eff = None
                try:
                    from datetime import datetime
                    if isinstance(eff, str):
                        eff = datetime.strptime(eff.strip(), '%Y-%m-%d').date()
                except Exception:
                    eff = None
                if eff and period_start <= eff <= period_end:
                    return 1.0
                return 0.0

            # Default: sum FN/AN-aware units by date.
            try:
                units_by_date = StaffRequestViewSet()._extract_requested_units_by_date_for_user(req.form_data or {}, user)
            except Exception:
                units_by_date = {}
            total = 0.0
            for d, u in (units_by_date or {}).items():
                if d < period_start or d > period_end:
                    continue
                try:
                    total += float(u or 0.0)
                except (TypeError, ValueError):
                    continue
            return round(total, 2)

        allotment = leave_policy.get('allotment_per_role')
        if not isinstance(allotment, dict) or len(allotment) == 0:
            # No per-role mapping configured: fall back to per-user balance when present.
            # This supports setups where HR sets per-staff quotas for neutral forms
            # (OD/Late Entry/Others) directly in StaffLeaveBalance.
            try:
                from .models import StaffLeaveBalance
                bal = StaffLeaveBalance.objects.filter(
                    staff=user,
                    leave_type__iexact=(getattr(template, 'name', '') or '').strip(),
                ).first()
                if bal is not None:
                    try:
                        allocated = float(bal.balance or 0.0)
                        if allocated <= 0.0:
                            return False

                        if is_monthly_reset(leave_policy):
                            # Hide when monthly allocation is used up.
                            period_start, period_end = monthly_period_bounds(timezone.localdate())
                            used = 0.0
                            qs = StaffRequest.objects.filter(
                                applicant=user,
                                template=template,
                                status__in=['pending', 'approved'],
                            ).select_related('template')
                            for req in qs:
                                used += request_units_in_period(req, period_start, period_end)
                            remaining = round(allocated - used, 2)
                            return remaining > 0.0

                        return True
                    except (TypeError, ValueError):
                        return False
            except Exception:
                pass
            # No mapping and no per-user balance configured => treat as 0 allocation.
            return False

        # Resolve allocation across all assigned roles and use the highest mapped value.
        role_names = []
        if hasattr(user, 'roles'):
            role_names.extend(list(user.roles.values_list('name', flat=True)))
        if hasattr(user, 'user_roles'):
            role_names.extend(list(user.user_roles.values_list('role__name', flat=True)))

        role_keys = []
        for rn in role_names:
            key = str(rn or '').strip().upper()
            if key and key not in role_keys:
                role_keys.append(key)
        if not role_keys:
            role_keys = ['STAFF']

        normalized = {}
        for k, v in allotment.items():
            key = str(k or '').strip().upper()
            if not key:
                continue
            try:
                normalized[key] = float(v)
            except (TypeError, ValueError):
                normalized[key] = 0.0

        allocated = max([float(normalized.get(k, 0.0)) for k in role_keys] or [0.0])
        if allocated <= 0:
            return False

        if is_monthly_reset(leave_policy):
            period_start, period_end = monthly_period_bounds(timezone.localdate())
            used = 0.0
            qs = StaffRequest.objects.filter(
                applicant=user,
                template=template,
                status__in=['pending', 'approved'],
            ).select_related('template')
            for req in qs:
                used += request_units_in_period(req, period_start, period_end)
            remaining = round(allocated - used, 2)
            return remaining > 0.0

        return True
    except Exception:
        return True


def is_salary_month_locked(target_date):
    month_start = date_type(target_date.year, target_date.month, 1)
    return SalaryMonthPublish.objects.filter(month=month_start, is_active=True).exists()


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
            and template_has_nonzero_allocation_for_user(request.user, template)
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

        if is_salary_month_locked(check_date):
            return Response({
                'templates': [],
                'is_holiday': False,
                'is_absent': False,
                'total_available': 0,
                'message': f'Forms are locked for {check_date.strftime("%Y-%m")} because salary is published for this month.'
            })
        
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
                and template_has_nonzero_allocation_for_user(request.user, template)
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

            if not template_has_nonzero_allocation_for_user(request.user, template):
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

        locked_month_message = self._validate_month_publish_lock(form_data)
        if locked_month_message:
            return Response({'error': locked_month_message}, status=status.HTTP_400_BAD_REQUEST)

        # Special rules for Late Entry Permission (normal + SPL):
        # - 10 mins is allowed only for FN, never for AN.
        # - 10 mins can be auto-approved only when actual morning_in is within
        #   department in-time limit + 10 minutes (and after the in-time limit).
        # - 1 hr follows regular approval workflow (no auto-approve).
        late_entry_validation_error = self._validate_late_entry_rules(request.user, template, form_data)
        if late_entry_validation_error:
            return Response({'error': late_entry_validation_error}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if user can apply with this template
        if not can_user_apply_with_template(request.user, template):
            return Response(
                {'error': 'You are not authorized to use this request template'},
                status=status.HTTP_403_FORBIDDEN
            )

        allocation_error = self._validate_template_allocation(request.user, template, form_data=form_data)
        if allocation_error:
            return Response({'error': allocation_error}, status=status.HTTP_400_BAD_REQUEST)
        
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

        # Auto-approve 10 mins FN late entry only when biometric in-time confirms eligibility.
        if self._should_auto_approve_late_entry(request.user, template, form_data):
            with transaction.atomic():
                # Mark approved immediately (no manual approver step)
                staff_request.mark_approved()

                # Keep an audit log row to make the auto-approval explicit in history.
                ApprovalLog.objects.create(
                    request=staff_request,
                    approver=request.user,
                    step_order=staff_request.current_step,
                    action='approved',
                    comments='Auto-approved: 10 mins late entry within allowed cutoff window.'
                )

                # Apply final-approval side effects.
                self._run_final_approval_side_effects(staff_request, acted_by=request.user)
        
        # Return detailed response
        response_serializer = StaffRequestDetailSerializer(staff_request)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def _is_monthly_reset_policy(self, leave_policy: dict) -> bool:
        token = str((leave_policy or {}).get('reset_period') or (leave_policy or {}).get('reset_duration') or '').strip().lower()
        return token == 'monthly'

    def _monthly_period_bounds(self, dt):
        import calendar
        from datetime import date

        start = date(dt.year, dt.month, 1)
        end = date(dt.year, dt.month, calendar.monthrange(dt.year, dt.month)[1])
        return start, end

    def _request_units_for_usage(self, template, form_data, user, *, period_start=None, period_end=None) -> float:
        """Compute how much allocation a request consumes for monthly usage checks."""
        if self._is_late_entry_template(template):
            # Late entry always consumes 1 unit per request, but monthly usage must
            # still respect the request's effective date window.
            if period_start or period_end:
                effective_date = self._get_request_effective_date(form_data or {})
                if not effective_date:
                    return 0.0
                if period_start and effective_date < period_start:
                    return 0.0
                if period_end and effective_date > period_end:
                    return 0.0
            return 1.0

        units_by_date = self._extract_requested_units_by_date_for_user(form_data or {}, user)
        if not units_by_date:
            return 0.0

        total = 0.0
        for d, u in units_by_date.items():
            if period_start and d < period_start:
                continue
            if period_end and d > period_end:
                continue
            try:
                total += float(u or 0.0)
            except (TypeError, ValueError):
                continue
        return round(total, 2)

    def _used_units_in_month(self, user, template, *, period_start, period_end) -> float:
        qs = StaffRequest.objects.filter(
            applicant=user,
            template=template,
            status__in=['pending', 'approved'],
        ).select_related('template')

        used = 0.0
        for req in qs:
            used += self._request_units_for_usage(template, req.form_data or {}, user, period_start=period_start, period_end=period_end)
        return round(used, 2)

    def _resolve_template_allocation(self, user, template) -> float:
        """Resolve allocation for user+template.

        Priority:
        1) leave_policy.allotment_per_role (role based)
        2) StaffLeaveBalance (per-user configured allocation)
        Missing allocation defaults to 0.
        """
        leave_policy = getattr(template, 'leave_policy', None) or {}
        allotment = leave_policy.get('allotment_per_role')

        if isinstance(allotment, dict) and len(allotment) > 0:
            role_names = []
            if hasattr(user, 'roles'):
                role_names.extend(list(user.roles.values_list('name', flat=True)))
            if hasattr(user, 'user_roles'):
                role_names.extend(list(user.user_roles.values_list('role__name', flat=True)))

            role_keys = []
            for rn in role_names:
                key = str(rn or '').strip().upper()
                if key and key not in role_keys:
                    role_keys.append(key)
            if not role_keys:
                role_keys = ['STAFF']

            normalized = {}
            for k, v in allotment.items():
                key = str(k or '').strip().upper()
                if not key:
                    continue
                try:
                    normalized[key] = float(v)
                except (TypeError, ValueError):
                    normalized[key] = 0.0
            return max([float(normalized.get(k, 0.0)) for k in role_keys] or [0.0])

        try:
            bal = StaffLeaveBalance.objects.filter(
                staff=user,
                leave_type__iexact=(getattr(template, 'name', '') or '').strip(),
            ).first()
            if bal is None:
                return 0.0
            return float(bal.balance or 0.0)
        except Exception:
            return 0.0

    def _validate_template_allocation(self, user, template, *, form_data=None):
        """Block applying forms when allocated count for the user's role is 0.

        Applies only to deduct/neutral templates that have an explicit
        `allotment_per_role` mapping. If mapping exists but user's role is missing,
        it is treated as 0 allocation (safer default).
        """
        leave_policy = getattr(template, 'leave_policy', None) or {}
        action = str(leave_policy.get('action') or '').strip().lower()
        if action not in ['deduct', 'neutral']:
            return None

        allocated = float(self._resolve_template_allocation(user, template) or 0.0)
        if allocated <= 0.0:
            return 'You cannot apply this form because the allocated count is 0.'

        # Monthly reset policy: block once used up for the month.
        if self._is_monthly_reset_policy(leave_policy):
            effective_date = self._get_request_effective_date(form_data or {}) or timezone.localdate()
            period_start, period_end = self._monthly_period_bounds(effective_date)

            used = self._used_units_in_month(user, template, period_start=period_start, period_end=period_end)
            requested = self._request_units_for_usage(template, form_data or {}, user, period_start=period_start, period_end=period_end)
            remaining = round(allocated - used, 2)
            if remaining + 1e-9 < requested or remaining <= 0.0:
                return 'You cannot apply this form because your monthly allocation is exhausted.'

        return None

    def _compute_overuse_lop_units(self, user, *, as_of_date=None):
        """Compute LOP units generated purely by over-usage of allocated forms.

        This covers cases like OD / Late Entry / CL etc where approved usage can
        exceed the role allocation (balance overflow to LOP). Recalculation flows
        must include this so LOP doesn't get overwritten back to absence-only.
        """
        from datetime import datetime

        if as_of_date is None:
            as_of_date = timezone.localdate()

        approved_requests = (
            StaffRequest.objects.filter(
                applicant=user,
                status='approved',
                template__leave_policy__action__in=['deduct', 'neutral'],
            )
            .select_related('template')
            .order_by('id')
        )

        # Group by template id to avoid re-parsing policy repeatedly.
        by_template = {}
        for req in approved_requests:
            by_template.setdefault(req.template_id, []).append(req)

        user_role = self._get_primary_role(user)
        role_key = str(user_role or '').strip().upper()

        total_overuse = 0.0
        for _, reqs in by_template.items():
            template = reqs[0].template
            leave_policy = getattr(template, 'leave_policy', None) or {}
            action = str(leave_policy.get('action') or '').strip().lower()
            if action not in ['deduct', 'neutral']:
                continue

            allotment = leave_policy.get('allotment_per_role')
            if not isinstance(allotment, dict) or len(allotment) == 0:
                continue

            normalized_allotment = {}
            for k, v in allotment.items():
                key = str(k or '').strip().upper()
                if not key:
                    continue
                try:
                    normalized_allotment[key] = float(v)
                except (TypeError, ValueError):
                    normalized_allotment[key] = 0.0

            full_allotment = float(normalized_allotment.get(role_key, 0.0))
            if full_allotment < 0:
                full_allotment = 0.0

            # Split policy: before split_date only first half is considered allocated.
            effective_allotment = full_allotment
            split_date_str = leave_policy.get('split_date')
            if split_date_str:
                try:
                    split_date = datetime.strptime(str(split_date_str).strip(), '%Y-%m-%d').date()
                    if as_of_date < split_date:
                        effective_allotment = full_allotment / 2
                except Exception:
                    pass

            window_from = None
            window_to = None
            from_str = leave_policy.get('from_date')
            to_str = leave_policy.get('to_date')
            if from_str and to_str:
                try:
                    window_from = datetime.strptime(str(from_str).strip(), '%Y-%m-%d').date()
                    window_to = datetime.strptime(str(to_str).strip(), '%Y-%m-%d').date()
                except Exception:
                    window_from = None
                    window_to = None

            used_units = 0.0
            for req in reqs:
                # When claim_col is enabled for deduct forms, CL is not deducted at all.
                if action == 'deduct':
                    try:
                        if bool((req.form_data or {}).get('claim_col')):
                            continue
                    except Exception:
                        pass

                units_by_date = self._extract_requested_units_by_date_for_user(req.form_data or {}, user)
                for d, units in units_by_date.items():
                    if window_from and d < window_from:
                        continue
                    if window_to and d > window_to:
                        continue
                    try:
                        used_units += float(units or 0.0)
                    except (TypeError, ValueError):
                        continue

            used_units = round(used_units, 2)
            overuse = max(0.0, round(used_units - float(effective_allotment or 0.0), 2))
            total_overuse += overuse

        return round(total_overuse, 2)

    def _month_start(self, target_date):
        return date_type(target_date.year, target_date.month, 1)

    def _is_month_published_and_locked(self, target_date):
        return SalaryMonthPublish.objects.filter(
            month=self._month_start(target_date),
            is_active=True,
        ).exists()

    def _validate_month_publish_lock(self, form_data):
        target_dates = {d for d, _ in self._extract_attendance_targets_from_form_data(form_data)}
        for dt in sorted(target_dates):
            if self._is_month_published_and_locked(dt):
                return f'Cannot apply forms for {dt.strftime("%Y-%m")}. Salary is published and locked for that month.'
        return None

    def _is_late_entry_template(self, template):
        name = (getattr(template, 'name', '') or '').strip().lower()
        return name in ['late entry permission', 'late entry permission - spl']

    def _normalize_late_duration(self, duration_value):
        token = str(duration_value or '').strip().lower().replace(' ', '')
        if token in ['10', '10min', '10mins', '10minute', '10minutes']:
            return '10 mins'
        if token in ['60', '1hr', '1hour', '60min', '60mins']:
            return '1 hr'
        return str(duration_value or '').strip()

    def _normalize_shift(self, shift_value):
        token = str(shift_value or '').strip().upper()
        return token

    def _get_request_effective_date(self, form_data):
        from datetime import datetime

        for key in ['date', 'from_date', 'start_date', 'fromDate', 'startDate']:
            value = form_data.get(key)
            if not value:
                continue
            try:
                if isinstance(value, str):
                    return datetime.strptime(value, '%Y-%m-%d').date()
                return value
            except Exception:
                continue
        return None

    def _get_user_in_time_limit(self, user):
        """Resolve in-time limit using department-specific settings first, then global."""
        from datetime import time
        from staff_attendance.models import AttendanceSettings, DepartmentAttendanceSettings

        # Default fallback
        default_limit = time(hour=8, minute=45)

        try:
            dept = None
            if hasattr(user, 'staff_profile'):
                if hasattr(user.staff_profile, 'get_current_department'):
                    dept = user.staff_profile.get_current_department()
                if not dept:
                    dept = user.staff_profile.department

            if dept:
                dept_cfg = DepartmentAttendanceSettings.objects.filter(
                    departments=dept,
                    enabled=True
                ).first()
                if dept_cfg and dept_cfg.attendance_in_time_limit:
                    return dept_cfg.attendance_in_time_limit
        except Exception:
            pass

        global_cfg = AttendanceSettings.objects.first()
        if global_cfg and global_cfg.attendance_in_time_limit:
            return global_cfg.attendance_in_time_limit

        return default_limit

    def _get_user_out_time_limit(self, user, target_date=None):
        """Resolve out-time limit with staff override, special date, dept, then global fallback."""
        from datetime import time
        from django.db.models import Q
        from staff_attendance.models import (
            AttendanceSettings,
            DepartmentAttendanceSettings,
            StaffAttendanceTimeLimitOverride,
            SpecialDepartmentDateAttendanceLimit,
        )

        default_limit = time(hour=17, minute=0)
        target_date = target_date or timezone.localdate()

        try:
            staff_override = StaffAttendanceTimeLimitOverride.objects.filter(
                user=user,
                enabled=True,
            ).first()
            if staff_override and staff_override.attendance_out_time_limit:
                return staff_override.attendance_out_time_limit
        except Exception:
            pass

        try:
            dept = None
            if hasattr(user, 'staff_profile'):
                if hasattr(user.staff_profile, 'get_current_department'):
                    dept = user.staff_profile.get_current_department()
                if not dept:
                    dept = user.staff_profile.department

            if dept:
                special = SpecialDepartmentDateAttendanceLimit.objects.filter(
                    enabled=True,
                    departments=dept,
                    from_date__lte=target_date,
                ).filter(
                    Q(to_date__isnull=True, from_date=target_date)
                    | Q(to_date__isnull=False, to_date__gte=target_date)
                ).order_by('-from_date', '-id').first()
                if special and special.attendance_out_time_limit:
                    return special.attendance_out_time_limit

                dept_cfg = DepartmentAttendanceSettings.objects.filter(
                    departments=dept,
                    enabled=True,
                ).first()
                if dept_cfg and dept_cfg.attendance_out_time_limit:
                    return dept_cfg.attendance_out_time_limit
        except Exception:
            pass

        global_cfg = AttendanceSettings.objects.first()
        if global_cfg and global_cfg.attendance_out_time_limit:
            return global_cfg.attendance_out_time_limit

        return default_limit

    def _is_gatepass_auto_template(self, template):
        name = (getattr(template, 'name', '') or '').strip().lower()
        if name.startswith('casual leave'):
            return True
        if name.startswith('on duty'):
            return True
        if name.startswith('others'):
            return True
        if name.startswith('late entry permission'):
            return True
        return False

    def _is_an_gatepass_eligible_request(self, staff_request):
        if not self._is_gatepass_auto_template(staff_request.template):
            return False

        form_data = staff_request.form_data or {}
        shift = self._normalize_shift(
            form_data.get('shift', form_data.get('from_noon', form_data.get('from_shift')))
        )
        if shift != 'AN':
            return False

        name = (getattr(staff_request.template, 'name', '') or '').strip().lower()
        if name.startswith('late entry permission'):
            return self._normalize_late_duration(form_data.get('late_duration')) == '1 hr'

        return name.startswith('casual leave') or name.startswith('on duty') or name.startswith('others')

    def _resolve_gatepass_application_type(self):
        from applications.models import ApplicationType

        return (
            ApplicationType.objects.filter(is_active=True)
            .filter(
                Q(code__iexact='GATEPASS')
                | Q(name__iexact='Gatepass')
                | Q(code__icontains='gate')
                | Q(name__icontains='gatepass')
            )
            .order_by('id')
            .first()
        )

    def _build_gatepass_payload(self, gatepass_fields, request_date, out_time, in_time, reason_text):
        payload = {}
        date_str = request_date.isoformat()
        out_str = out_time.strftime('%H:%M')
        in_str = in_time.strftime('%H:%M')

        for fld in gatepass_fields:
            key = fld.field_key
            ftype = str(fld.field_type or '').upper()
            meta = fld.meta or {}

            if ftype == 'DATE OUT IN':
                payload[key] = {
                    'date': date_str,
                    'out_time': out_str,
                    'in_time': in_str,
                }
            elif ftype == 'DATE IN OUT':
                payload[key] = {
                    'date': date_str,
                    'in_time': in_str,
                    'out_time': out_str,
                }
            elif ftype == 'DATE':
                payload[key] = date_str
            elif ftype == 'TIME':
                payload[key] = out_str
            elif ftype == 'TEXT':
                payload[key] = reason_text
            elif ftype == 'NUMBER':
                payload[key] = 1
            elif ftype == 'BOOLEAN':
                payload[key] = True
            elif ftype == 'SELECT':
                options = meta.get('options') if isinstance(meta, dict) else None
                selected = 'AUTO'
                if isinstance(options, list) and options:
                    first_opt = options[0]
                    if isinstance(first_opt, dict):
                        selected = first_opt.get('value') or first_opt.get('label') or 'AUTO'
                    else:
                        selected = first_opt
                payload[key] = selected
            elif ftype == 'FILE':
                payload[key] = ''
            else:
                payload[key] = reason_text

        return payload

    def _auto_create_gatepass_for_request(self, staff_request, acted_by=None):
        """Create and auto-approve a gatepass application for eligible AN approvals."""
        import logging
        from datetime import datetime, timedelta

        from applications import models as app_models
        from applications.services import application_state, approval_engine

        logger = logging.getLogger(__name__)

        if staff_request.status != 'approved':
            return None
        if not self._is_an_gatepass_eligible_request(staff_request):
            return None

        gatepass_type = self._resolve_gatepass_application_type()
        if gatepass_type is None:
            logger.warning('Gatepass application type not found. Skipping auto-create for request %s', staff_request.id)
            return None

        request_date = self._get_request_effective_date(staff_request.form_data or {})
        if not request_date:
            logger.warning('Gatepass auto-create skipped: no effective date on request %s', staff_request.id)
            return None

        out_limit = self._get_user_out_time_limit(staff_request.applicant, request_date)
        out_dt = datetime.combine(request_date, out_limit)

        name = (getattr(staff_request.template, 'name', '') or '').strip().lower()
        if name.startswith('late entry permission'):
            out_dt = out_dt - timedelta(hours=1)
            if out_dt.date() != request_date:
                out_dt = datetime.combine(request_date, datetime.min.time())

        in_dt = out_dt + timedelta(hours=1)

        gatepass_fields = list(
            app_models.ApplicationField.objects.filter(application_type=gatepass_type).order_by('order', 'id')
        )
        if not gatepass_fields:
            logger.warning('Gatepass fields are not configured for application type %s', gatepass_type.id)
            return None

        reason_text = f'Auto gatepass from staff request #{staff_request.id} ({staff_request.template.name})'
        payload = self._build_gatepass_payload(
            gatepass_fields=gatepass_fields,
            request_date=request_date,
            out_time=out_dt.time(),
            in_time=in_dt.time(),
            reason_text=reason_text,
        )

        applicant = staff_request.applicant
        staff_profile = getattr(applicant, 'staff_profile', None)
        student_profile = getattr(applicant, 'student_profile', None)

        application = app_models.Application.objects.create(
            application_type=gatepass_type,
            applicant_user=applicant,
            staff_profile=staff_profile if getattr(staff_profile, 'pk', None) else None,
            student_profile=student_profile if getattr(student_profile, 'pk', None) else None,
            current_state=app_models.Application.ApplicationState.DRAFT,
            status=app_models.Application.ApplicationState.DRAFT,
        )

        field_map = {f.field_key: f for f in gatepass_fields}
        rows = []
        for key, value in payload.items():
            fld = field_map.get(key)
            if fld is None:
                continue
            rows.append(
                app_models.ApplicationData(
                    application=application,
                    field=fld,
                    value=value,
                )
            )
        if rows:
            app_models.ApplicationData.objects.bulk_create(rows)

        try:
            application_state.submit_application(application, applicant)
            application_state.approve_application(application)

            final_step = None
            try:
                flow = approval_engine._get_flow_for_application(application)
                if flow is not None:
                    final_step = flow.steps.filter(is_final=True).order_by('order').first()
                    if final_step is None:
                        final_step = flow.steps.order_by('order').first()
            except Exception:
                final_step = None

            app_models.ApprovalAction.objects.create(
                application=application,
                step=final_step,
                acted_by=acted_by,
                action=app_models.ApprovalAction.Action.APPROVED,
                remarks=reason_text,
            )
        except Exception as exc:
            logger.warning(
                'Gatepass submit/approve flow unavailable for request %s; forcing APPROVED state. Error: %s',
                staff_request.id,
                exc,
            )
            now = timezone.now()
            application.current_state = app_models.Application.ApplicationState.APPROVED
            application.status = app_models.Application.ApplicationState.APPROVED
            application.current_step = None
            application.submitted_at = application.submitted_at or now
            application.final_decision_at = now
            application.save(
                update_fields=['current_state', 'status', 'current_step', 'submitted_at', 'final_decision_at']
            )

        return application

    def _run_final_approval_side_effects(self, staff_request, acted_by=None):
        """Execute all post-final-approval side effects without blocking approval."""
        import logging

        logger = logging.getLogger(__name__)

        try:
            self._process_leave_balance(staff_request)
        except Exception as e:
            logger.exception('Failed to process leave balance for request %s: %s', staff_request.id, str(e))

        try:
            self._process_attendance_action(staff_request)
        except Exception as e:
            logger.exception('Failed to process attendance action for request %s: %s', staff_request.id, str(e))

        try:
            self._auto_create_gatepass_for_request(staff_request, acted_by=acted_by)
        except Exception as e:
            logger.exception('Failed to auto-create gatepass for request %s: %s', staff_request.id, str(e))

    def _validate_late_entry_rules(self, user, template, form_data):
        """Return an error message string when late-entry rules are violated; else None."""
        from datetime import datetime, timedelta
        from staff_attendance.models import AttendanceRecord

        if not self._is_late_entry_template(template):
            return None

        duration = self._normalize_late_duration(form_data.get('late_duration'))
        shift = self._normalize_shift(form_data.get('shift', form_data.get('from_noon')))
        request_date = self._get_request_effective_date(form_data)

        if duration == '10 mins' and shift == 'AN':
            return '10 mins permission is not allowed for AN shift. For AN, apply 1 hr permission.'

        if duration != '10 mins':
            return None

        if shift != 'FN':
            return '10 mins auto-approval is available only for FN shift.'

        if not request_date:
            return 'Date is required for 10 mins late entry validation.'

        attendance = AttendanceRecord.objects.filter(user=user, date=request_date).first()
        if not attendance or not attendance.morning_in:
            return 'Cannot validate 10 mins permission: morning in-time is not available for the selected date.'

        in_limit = self._get_user_in_time_limit(user)
        morning_in = attendance.morning_in

        limit_dt = datetime.combine(request_date, in_limit)
        morning_dt = datetime.combine(request_date, morning_in)
        max_dt = limit_dt + timedelta(minutes=10)

        # Must be truly late and within +10 min window
        if not (morning_dt > limit_dt and morning_dt <= max_dt):
            return (
                f'10 mins permission not allowed: in-time {morning_in.strftime("%H:%M")} '
                f'is outside the allowed window ({in_limit.strftime("%H:%M")} to {max_dt.strftime("%H:%M")}). '
                'Apply 1 hr permission instead.'
            )

        return None

    def _should_auto_approve_late_entry(self, user, template, form_data):
        if not self._is_late_entry_template(template):
            return False
        duration = self._normalize_late_duration(form_data.get('late_duration'))
        shift = self._normalize_shift(form_data.get('shift', form_data.get('from_noon')))
        # Validation already guarantees the window check for this combination.
        return duration == '10 mins' and shift == 'FN'

    def _recompute_overall_status_from_sessions(self, fn_status, an_status):
        """Compute overall attendance status from FN/AN values."""
        fn_val = fn_status
        an_val = an_status

        if fn_val is None and an_val is None:
            return 'absent'
        if fn_val is None:
            return an_val
        if an_val is None:
            return fn_val
        if fn_val == an_val:
            return fn_val
        if fn_val != 'absent' or an_val != 'absent':
            return 'half_day'
        return 'absent'

    def _extract_attendance_targets_from_form_data(self, form_data):
        """
        Build (date, shift) targets from request form_data.
        shift is one of: FN, AN, FULL.
        """
        from datetime import datetime, timedelta

        targets = []

        def parse_date(value):
            if not value:
                return None
            if isinstance(value, str):
                value = value.strip()
                if not value:
                    return None
                return datetime.strptime(value, '%Y-%m-%d').date()
            return value

        def norm_shift(value):
            token = str(value or '').strip().upper()
            if token in ['FN', 'AN', 'FULL']:
                return token
            if token in ['FULL DAY', 'FULLDAY']:
                return 'FULL'
            return None

        from_date = None
        to_date = None
        single_date = None

        for start_key in ['from_date', 'start_date', 'fromDate', 'startDate']:
            if start_key in form_data:
                try:
                    from_date = parse_date(form_data.get(start_key))
                except Exception:
                    from_date = None
                if from_date:
                    break

        for end_key in ['to_date', 'end_date', 'toDate', 'endDate']:
            if end_key in form_data and form_data.get(end_key):
                try:
                    to_date = parse_date(form_data.get(end_key))
                except Exception:
                    to_date = None
                if to_date:
                    break

        if 'date' in form_data:
            try:
                single_date = parse_date(form_data.get('date'))
            except Exception:
                single_date = None

        shift = norm_shift(form_data.get('shift'))
        from_noon = norm_shift(form_data.get('from_noon', form_data.get('from_shift', form_data.get('shift'))))
        to_noon = norm_shift(form_data.get('to_noon', form_data.get('to_shift')))

        # Case 1: date range
        if from_date and to_date:
            current_date = from_date
            while current_date <= to_date:
                target_shift = 'FULL'
                if current_date == from_date and from_noon in ['FN', 'AN', 'FULL']:
                    target_shift = from_noon
                elif current_date == to_date and to_noon in ['FN', 'AN', 'FULL']:
                    target_shift = to_noon
                targets.append((current_date, target_shift))
                current_date += timedelta(days=1)
            return targets

        # Case 2: explicit single date
        if single_date:
            targets.append((single_date, shift if shift in ['FN', 'AN', 'FULL'] else 'FULL'))
            return targets

        # Case 3: from_date only
        if from_date:
            targets.append((from_date, from_noon if from_noon in ['FN', 'AN', 'FULL'] else 'FULL'))
            return targets

        return targets

    def _remove_note_marker(self, notes, marker):
        """Remove an exact semicolon-separated marker token from notes."""
        parts = [p.strip() for p in str(notes or '').split(';') if p.strip()]
        filtered = [p for p in parts if p != marker]
        return '; '.join(filtered)

    def _rollback_late_entry_attendance(self, staff_request):
        """Revert attendance sessions impacted by a late-entry request back to absent."""
        from staff_attendance.models import AttendanceRecord

        lock_marker = f'LATE10_LOCK:req_{staff_request.id}'
        targets = self._extract_attendance_targets_from_form_data(staff_request.form_data or {})
        reverted = 0

        for target_date, target_shift in targets:
            record = AttendanceRecord.objects.filter(user=staff_request.applicant, date=target_date).first()
            if not record:
                continue

            if target_shift == 'FN':
                record.fn_status = 'absent'
            elif target_shift == 'AN':
                record.an_status = 'absent'
            else:
                record.fn_status = 'absent'
                record.an_status = 'absent'

            record.status = self._recompute_overall_status_from_sessions(record.fn_status, record.an_status)
            record.notes = self._remove_note_marker(record.notes, lock_marker)
            record.save()
            reverted += 1

        return reverted

    def _recalculate_lop_for_user(self, user):
        """Recalculate and persist LOP balance for a single user."""
        from staff_attendance.models import AttendanceRecord

        attendance_records = AttendanceRecord.objects.filter(user=user)
        absent_units_by_date = {}
        for record in attendance_records:
            if record.date.weekday() == 6 or self._is_holiday_for_user(record.date, user):
                continue
            units = self._attendance_absent_units(record)
            if units > 0:
                absent_units_by_date[record.date] = units

        absent_units_total = round(sum(absent_units_by_date.values()), 2)

        covered_units = 0.0
        approved_requests = StaffRequest.objects.filter(
            applicant=user,
            status='approved',
            template__leave_policy__action__in=['deduct', 'neutral']
        )

        remaining_absent_units = dict(absent_units_by_date)
        for approved_request in approved_requests:
            request_units_by_date = self._extract_requested_units_by_date_for_user(
                approved_request.form_data,
                user
            )
            for req_date, req_units in request_units_by_date.items():
                absent_left = remaining_absent_units.get(req_date, 0.0)
                if absent_left <= 0:
                    continue
                covered_now = min(absent_left, float(req_units or 0.0))
                if covered_now > 0:
                    covered_units += covered_now
                    remaining_absent_units[req_date] = round(absent_left - covered_now, 2)

        absence_based_lop = round(max(0.0, absent_units_total - covered_units), 2)
        overuse_lop = self._compute_overuse_lop_units(user)
        lop_count = round(absence_based_lop + overuse_lop, 2)

        lop_balance, _ = StaffLeaveBalance.objects.get_or_create(
            staff=user,
            leave_type='LOP',
            defaults={'balance': 0.0}
        )
        lop_balance.balance = lop_count
        lop_balance.save(update_fields=['balance', 'updated_at'])
        return lop_count

    def _late_entry_rows_for_month(self, target_user, year, month):
        """Return monthly late-entry rows and aggregate counts for a user."""
        from datetime import date
        import calendar

        month_start = date(year, month, 1)
        month_end = date(year, month, calendar.monthrange(year, month)[1])

        late_requests = StaffRequest.objects.filter(
            applicant=target_user,
            status='approved',
        ).filter(
            Q(template__name__iexact='Late Entry Permission') |
            Q(template__name__iexact='Late Entry Permission - SPL')
        ).select_related('template').order_by('-created_at')

        rows = []
        ten_mins = 0
        one_hr = 0

        for req in late_requests:
            form_data = req.form_data or {}
            duration = self._normalize_late_duration(form_data.get('late_duration'))
            if duration not in ['10 mins', '1 hr']:
                continue

            targets = self._extract_attendance_targets_from_form_data(form_data)
            if not targets:
                request_date = self._get_request_effective_date(form_data)
                if request_date:
                    targets = [(request_date, self._normalize_shift(form_data.get('shift', form_data.get('from_noon'))) or 'FULL')]

            for target_date, target_shift in targets:
                if not target_date or target_date < month_start or target_date > month_end:
                    continue

                if duration == '10 mins':
                    ten_mins += 1
                elif duration == '1 hr':
                    one_hr += 1

                rows.append({
                    'request_id': req.id,
                    'date': target_date.isoformat(),
                    'shift': target_shift,
                    'late_duration': duration,
                    'template_name': req.template.name,
                    'created_at': req.created_at.isoformat() if req.created_at else None,
                })

        return {
            'month': f'{year:04d}-{month:02d}',
            'ten_mins': ten_mins,
            'one_hr': one_hr,
            'total': ten_mins + one_hr,
            'records': rows,
        }

    @action(detail=False, methods=['get'], url_path='balances/late_entry_monthly')
    def balances_late_entry_monthly(self, request):
        """
        HR/Admin: get monthly late-entry counts and source approved records for a staff user.
        GET /api/staff-requests/requests/balances/late_entry_monthly/?user_id=<id>&month=YYYY-MM
        """
        from datetime import date
        from .permissions import IsAdminOrHR

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.query_params.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        month_param = (request.query_params.get('month') or '').strip()
        if month_param:
            try:
                year, month = map(int, month_param.split('-'))
            except (ValueError, AttributeError):
                return Response({'error': 'Invalid month format, use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            today = date.today()
            year, month = today.year, today.month

        User = get_user_model()
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        data = self._late_entry_rows_for_month(target_user, year, month)
        data['user'] = {
            'id': target_user.id,
            'username': target_user.username,
            'full_name': target_user.get_full_name() or target_user.username,
        }
        return Response(data)

    @action(detail=False, methods=['post'], url_path='balances/late_entry/delete')
    def balances_delete_late_entry_record(self, request):
        """
        HR/Admin: delete an approved late-entry request record and rollback attendance to absent.
        POST /api/staff-requests/requests/balances/late_entry/delete/
        Body: {"request_id": <staff_request_id>, "month": "YYYY-MM"}
        """
        from datetime import date
        from .permissions import IsAdminOrHR

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        request_id = request.data.get('request_id')
        if not request_id:
            return Response({'error': 'request_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        month_param = (request.data.get('month') or '').strip()
        if month_param:
            try:
                year, month = map(int, month_param.split('-'))
            except (ValueError, AttributeError):
                return Response({'error': 'Invalid month format, use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            today = date.today()
            year, month = today.year, today.month

        late_request = StaffRequest.objects.filter(id=request_id).select_related('applicant', 'template').first()
        if not late_request:
            return Response({'error': 'Late entry request not found'}, status=status.HTTP_404_NOT_FOUND)

        if late_request.status != 'approved':
            return Response({'error': 'Only approved late entry records can be deleted'}, status=status.HTTP_400_BAD_REQUEST)

        if not self._is_late_entry_template(late_request.template):
            return Response({'error': 'Only late entry templates are allowed for this action'}, status=status.HTTP_400_BAD_REQUEST)

        target_user = late_request.applicant

        with transaction.atomic():
            reverted_records = self._rollback_late_entry_attendance(late_request)
            late_request.delete()
            lop_balance = self._recalculate_lop_for_user(target_user)

        monthly = self._late_entry_rows_for_month(target_user, year, month)
        return Response({
            'message': 'Late entry record deleted and attendance rolled back successfully',
            'reverted_records': reverted_records,
            'lop_balance': lop_balance,
            'monthly': monthly,
        })

    def destroy(self, request, *args, **kwargs):
        """
        Allow applicant to delete only pending requests.
        Approved/rejected requests are immutable and cannot be deleted.
        """
        staff_request = self.get_object()

        if staff_request.applicant != request.user:
            return Response(
                {'error': 'You can only delete your own requests'},
                status=status.HTTP_403_FORBIDDEN
            )

        if staff_request.status != 'pending':
            return Response(
                {'error': f'Only pending requests can be deleted. Current status: {staff_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff_request.delete()
        return Response({'message': 'Pending request deleted successfully'}, status=status.HTTP_200_OK)
    
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
                    self._run_final_approval_side_effects(staff_request, acted_by=user)
                    
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
        
        # For non-earn approvals that cover absent sessions, reduce LOP by covered units
        # (FN/AN each count as 0.5, full-day as 1.0).
        if action in ['deduct', 'neutral']:
            self._reduce_lop_for_covered_absences(staff_request, leave_policy, form_data)

        # Apply action
        if action == 'deduct':
            overdraft_name = leave_policy.get('overdraft_name', 'LOP')
            
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

            # Monthly-reset neutral forms: treat StaffLeaveBalance as allocation, not a mutable balance.
            # Usage limits are enforced at submission time, so no balance mutation is needed here.
            if self._is_monthly_reset_policy(leave_policy):
                logger.info('[LeaveBalance] Neutral monthly-reset policy - skipping balance mutation for request %s', staff_request.id)
            elif not allotment:
                # No per-role allotment configured: do not mutate balances here.
                # Allocation/limits must be configured via StaffLeaveBalance and are enforced at submission.
                logger.info('[LeaveBalance] Neutral (no allotment) - skipping balance mutation for request %s', staff_request.id)
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
        attendance_status = self._resolve_attendance_status_for_request(
            template=staff_request.template,
            leave_policy=leave_policy,
            form_data=form_data,
        )
        if attendance_status:
            date_list = self._get_date_list_from_form_data(form_data)
            self._sync_attendance(staff_request.applicant, date_list, attendance_status)

    def _resolve_attendance_status_for_request(self, template, leave_policy, form_data):
        """
        Resolve the effective attendance status code for a request.

        For ON duty forms, if the submitted `type` value contains OD subtype code
        (ODB/ODR/ODP/ODO), return that code instead of generic OD.
        """
        if not leave_policy:
            return None

        base_status = (leave_policy.get('attendance_status') or '').strip()
        if not base_status:
            return None

        if base_status.upper() != 'OD':
            return base_status

        form_data = form_data or {}
        raw_type = str(form_data.get('type') or '').strip()
        if not raw_type:
            return base_status

        allowed_od_codes = {'ODB', 'ODR', 'ODP', 'ODO'}

        # Accept values like "ODB - Basic" or plain "ODB".
        code_token = raw_type.split('-', 1)[0].strip().replace(' ', '').upper()
        if code_token in allowed_od_codes:
            return code_token

        raw_upper = raw_type.replace(' ', '').upper()
        if raw_upper in allowed_od_codes:
            return raw_upper

        return base_status

    def _reduce_lop_for_covered_absences(self, staff_request, leave_policy, form_data):
        """
        Reduce LOP when an approved non-earn request compensates absent sessions.

        Session math:
        - absent FN only => 0.5
        - absent AN only => 0.5
        - absent FN+AN => 1.0
        - request coverage applies similarly based on from_noon/to_noon/shift fields.
        """
        import logging
        from .models import StaffLeaveBalance

        logger = logging.getLogger(__name__)
        overdraft_name = leave_policy.get('overdraft_name', 'LOP')

        requested_units_by_date = self._extract_requested_units_by_date(form_data)
        if not requested_units_by_date:
            return

        covered_absent_units = self._calculate_covered_absent_units(
            staff_request.applicant,
            requested_units_by_date
        )

        if covered_absent_units <= 0:
            return

        lop_balance, _ = StaffLeaveBalance.objects.get_or_create(
            staff=staff_request.applicant,
            leave_type=overdraft_name,
            defaults={'balance': 0.0}
        )

        old_lop = float(lop_balance.balance or 0.0)
        lop_balance.balance = max(0.0, old_lop - covered_absent_units)
        lop_balance.save()

        logger.info(
            '[LOP] Reduced %s by %.2f covered absent units: %.2f -> %.2f',
            overdraft_name,
            covered_absent_units,
            old_lop,
            lop_balance.balance,
        )

    def _calculate_covered_absent_units(self, user, requested_units_by_date):
        """
        Return how many requested units overlap with absent attendance units.
        Coverage per date is min(requested_units, absent_units_on_that_date).
        """
        from staff_attendance.models import AttendanceRecord

        request_dates = list(requested_units_by_date.keys())
        if not request_dates:
            return 0.0

        attendance_map = {
            rec.date: rec
            for rec in AttendanceRecord.objects.filter(user=user, date__in=request_dates)
        }

        total = 0.0
        for request_date, requested_units in requested_units_by_date.items():
            rec = attendance_map.get(request_date)
            absent_units = self._attendance_absent_units(rec)
            total += min(float(requested_units or 0.0), absent_units)

        return round(total, 2)

    def _attendance_absent_units(self, attendance_record):
        """
        Convert attendance record into absent units using FN/AN granularity.
        """
        if not attendance_record:
            return 0.0

        fn_status = (attendance_record.fn_status or '').strip().lower()
        an_status = (attendance_record.an_status or '').strip().lower()

        if fn_status or an_status:
            units = 0.0
            if fn_status == 'absent':
                units += 0.5
            if an_status == 'absent':
                units += 0.5
            return units

        return 1.0 if (attendance_record.status or '').strip().lower() == 'absent' else 0.0

    def _extract_requested_units_by_date(self, form_data):
        """
        Build per-date requested leave units from form_data.
        Holiday dates and Sundays are excluded so CL/OD/etc. are not auto-applied
        to non-working dates.
        """
        from datetime import datetime, timedelta

        start_date = None
        end_date = None

        for start_key in ['start_date', 'from_date', 'startDate', 'fromDate', 'from']:
            if start_key in form_data:
                start_date = form_data[start_key]
                break

        for end_key in ['end_date', 'to_date', 'endDate', 'toDate', 'to']:
            if end_key in form_data and form_data[end_key]:
                end_date = form_data[end_key]
                break

        if not start_date and 'date' in form_data:
            start_date = form_data['date']
        if not end_date and 'date' in form_data:
            end_date = form_data['date']

        if not start_date:
            return {}

        try:
            if isinstance(start_date, str):
                if not start_date.strip():
                    return {}
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
            else:
                start = start_date

            if isinstance(end_date, str):
                if not end_date.strip():
                    end = start
                else:
                    end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
            else:
                end = end_date or start

            if end < start:
                end = start
        except (ValueError, AttributeError, TypeError):
            return {}

        from_noon = self._normalize_shift_value(
            form_data.get('from_noon', form_data.get('from_shift', form_data.get('shift', '')))
        )
        to_noon = self._normalize_shift_value(
            form_data.get('to_noon', form_data.get('to_shift', form_data.get('shift', '')))
        )

        if start == end:
            if start.weekday() == 6 or self._is_holiday_for_user(start, getattr(self, 'request', None).user if getattr(self, 'request', None) else None):
                return {}
            return {start: self._single_day_units(from_noon, to_noon)}

        units = {}
        current = start
        while current <= end:
            # Never auto-apply leave coverage on holidays/Sundays.
            if current.weekday() == 6 or self._is_holiday_for_user(current, getattr(self, 'request', None).user if getattr(self, 'request', None) else None):
                current += timedelta(days=1)
                continue

            day_units = 1.0
            if current == start and from_noon == 'AN':
                day_units = 0.5
            if current == end and to_noon == 'FN':
                day_units = 0.5
            units[current] = day_units
            current += timedelta(days=1)

        return units

    def _is_holiday_for_user(self, target_date, user):
        """
        Department-aware holiday check.
        College-wide holidays (no departments) apply to everyone.
        """
        from staff_attendance.models import Holiday

        holidays = Holiday.objects.filter(date=target_date).prefetch_related('departments')
        if not holidays.exists():
            return False

        user_dept_id = None
        try:
            if user and hasattr(user, 'staff_profile'):
                dept = user.staff_profile.get_current_department()
                if dept:
                    user_dept_id = dept.id
        except Exception:
            user_dept_id = None

        for holiday in holidays:
            dept_ids = list(holiday.departments.values_list('id', flat=True))
            if not dept_ids:
                return True
            if user_dept_id is not None and user_dept_id in dept_ids:
                return True

        return False

    def _normalize_shift_value(self, value):
        token = str(value or '').strip().upper()
        if token == 'FULL DAY':
            token = 'FULL'
        return token

    def _single_day_units(self, from_noon, to_noon):
        if from_noon in ['FN', 'AN'] and to_noon in ['FN', 'AN']:
            return 0.5 if from_noon == to_noon else 1.0
        if from_noon in ['FN', 'AN'] and not to_noon:
            return 0.5
        if to_noon in ['FN', 'AN'] and not from_noon:
            return 0.5
        if from_noon == 'FULL' or to_noon == 'FULL':
            return 1.0
        return 1.0
    
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
        
        # Single date - support half-day markers even when only from_date is provided
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

                # Normalize single-day shift markers
                fn = str(form_data.get('from_noon', form_data.get('from_shift', form_data.get('shift', '')))).strip().upper()
                tn = str(form_data.get('to_noon', form_data.get('to_shift', ''))).strip().upper()
                if fn == 'FULL DAY':
                    fn = 'FULL'
                if tn == 'FULL DAY':
                    tn = 'FULL'

                # Single-day half-day handling:
                # FN only or AN only => 0.5
                # FN+AN (different sessions) or FULL => 1.0
                if fn in ['FN', 'AN'] and tn in ['FN', 'AN']:
                    return 0.5 if fn == tn else 1.0
                if fn in ['FN', 'AN'] and not tn:
                    return 0.5
                if tn in ['FN', 'AN'] and not fn:
                    return 0.5
                if fn == 'FULL' or tn == 'FULL':
                    return 1.0

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

        # Never apply leave attendance statuses on holidays/Sundays.
        filtered_dates = [
            dt for dt in date_list
            if dt.weekday() != 6 and not self._is_holiday_for_user(dt, user)
        ]

        if not filtered_dates:
            logger.info('[AttendanceSync] All dates skipped (holidays/Sundays)')
            return

        try:
            from staff_attendance.models import AttendanceRecord

            for dt in filtered_dates:
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

            logger.info(
                f'[AttendanceSync] Synced {len(filtered_dates)} dates '
                f'(skipped {len(date_list) - len(filtered_dates)} holidays/Sundays) '
                f'for user {getattr(user, "username", user)} -> {attendance_status}'
            )

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
        lock_marker = f'LATE10_LOCK:req_{staff_request.id}'
        is_late_10_lock = (
            self._is_late_entry_template(template)
            and self._normalize_late_duration(staff_request.form_data.get('late_duration')) == '10 mins'
        )

        def apply_late10_lock(record):
            if not is_late_10_lock:
                return
            existing_notes = record.notes or ''
            if lock_marker in existing_notes:
                return
            record.notes = f"{existing_notes}; {lock_marker}" if existing_notes else lock_marker
        
        form_data = staff_request.form_data or {}

        # Determine the target status to apply
        # Priority: leave_policy.attendance_status (for leave) > attendance_action.to_status (for permissions)
        # This ensures leave templates (CL, OD, ML) use the correct status code
        to_status = None
        from_status = 'absent'
        
        if leave_policy and leave_policy.get('attendance_status'):
            # Use leave_policy configuration (for CL, OD, ML, etc.) - PRIORITY
            to_status = self._resolve_attendance_status_for_request(
                template=template,
                leave_policy=leave_policy,
                form_data=form_data,
            )
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
                
                # Check if this is a COL earn template (Compensatory Off Leave).
                # Only COL earn forms are allowed to write attendance on holidays.
                is_col_earn = (
                    leave_policy and 
                    leave_policy.get('action') == 'earn' and 
                    ('compensatory' in template.name.lower() or 'col' in template.name.lower())
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
                    
                    # Skip holidays/Sundays for every form except COL earn.
                    if (is_holiday or is_sunday) and not is_col_earn:
                        # Skip creating attendance record for holidays and Sundays
                        skipped_holidays += 1
                        logger.info(f'[AttendanceAction] Skipping {current_date} (Holiday/Sunday)')
                        current_date += timedelta(days=1)
                        continue
                    
                    if is_col_earn and (is_holiday or is_sunday):
                        logger.info(f'[AttendanceAction] Processing {current_date} on holiday (COL earn)')
                    
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

                    apply_late10_lock(record)
                    
                    record.save()
                    updated_count += 1
                    logger.info(f'[AttendanceAction] Updated {current_date}: FN={record.fn_status}, AN={record.an_status}, Overall={record.status}')
                    
                    current_date += timedelta(days=1)
                
                logger.info(f'[AttendanceAction] Updated {updated_count} working days from {from_date} to {to_date} (skipped {skipped_holidays} holidays/Sundays)')
            
            # Case 2: Single date with optional shift
            elif single_date:
                # Import Holiday model to check for holidays
                from staff_attendance.models import Holiday
                
                # Check if this is a COL earn template (Compensatory Off Leave).
                # Only COL earn forms are allowed to write attendance on holidays.
                is_col_earn = (
                    leave_policy and 
                    leave_policy.get('action') == 'earn' and 
                    ('compensatory' in template.name.lower() or 'col' in template.name.lower())
                )
                
                # Check if single date is a holiday or Sunday
                is_sunday = single_date.weekday() == 6
                is_holiday = Holiday.objects.filter(date=single_date).exists()
                
                # Skip holidays/Sundays for every form except COL earn.
                if (is_holiday or is_sunday) and not is_col_earn:
                    # Skip creating attendance record for holidays and Sundays
                    logger.info(f'[AttendanceAction] Skipping {single_date} (Holiday/Sunday) - no attendance record created')
                else:
                    if is_col_earn and (is_holiday or is_sunday):
                        logger.info(f'[AttendanceAction] Processing {single_date} on holiday (COL earn)')
                    
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

                    apply_late10_lock(record)
                    
                    record.save()
                    updated_count += 1
            
            # Case 3: Single from_date without to_date (half-day or full-day)
            elif from_date:
                logger.info(f'[AttendanceAction] Case 3: Single date {from_date}, from_noon={from_noon}')
                
                # Check if from_date is a holiday or Sunday (department-aware)
                is_sunday = from_date.weekday() == 6
                is_holiday = self._is_holiday_for_user(from_date, staff_request.applicant)
                
                # Check if this is a COL earn form
                is_col_earn = (
                    leave_policy and 
                    leave_policy.get('action') == 'earn' and 
                    ('compensatory' in template.name.lower() or 'col' in template.name.lower())
                )

                # For every form except COL earn, never create attendance records on holidays/Sundays.
                if (is_holiday or is_sunday) and not is_col_earn:
                    logger.info(
                        f'[AttendanceAction] Skipping {from_date} (Holiday/Sunday) for leave form {template.name}'
                    )
                    return
                
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

                apply_late10_lock(record)
                
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
            template_by_name = {t.name: t for t in templates}

            def _monthly_display_balance_for_template(target_user, template_obj):
                leave_policy_local = getattr(template_obj, 'leave_policy', None) or {}
                action_local = str(leave_policy_local.get('action') or '').strip().lower()
                if action_local not in ['deduct', 'neutral']:
                    return None
                today_local = timezone.localdate()

                # Split-period policies (from/to + split_date) take precedence over
                # monthly flags because CL uses split entitlement across one period.
                split_date_str = leave_policy_local.get('split_date')
                from_date_str = leave_policy_local.get('from_date')
                to_date_str = leave_policy_local.get('to_date')
                if split_date_str and from_date_str and to_date_str:
                    try:
                        from datetime import datetime
                        split_date_local = datetime.strptime(str(split_date_str).strip(), '%Y-%m-%d').date()
                        period_start_local = datetime.strptime(str(from_date_str).strip(), '%Y-%m-%d').date()
                        period_end_local = datetime.strptime(str(to_date_str).strip(), '%Y-%m-%d').date()
                    except Exception:
                        return None

                    # Outside configured period, don't override persisted balance.
                    if today_local < period_start_local or today_local > period_end_local:
                        return None

                    allocated_local = float(self._resolve_template_allocation(target_user, template_obj) or 0.0)
                    if allocated_local <= 0.0:
                        return 0.0

                    effective_alloc_local = allocated_local / 2.0 if today_local < split_date_local else allocated_local

                    used_local = 0.0
                    qs_local = StaffRequest.objects.filter(
                        applicant=target_user,
                        template=template_obj,
                        status='approved',
                    ).select_related('template')
                    for req_local in qs_local:
                        used_local += self._request_units_for_usage(
                            template_obj,
                            req_local.form_data or {},
                            target_user,
                            period_start=period_start_local,
                            period_end=min(period_end_local, today_local),
                        )

                    return round(max(0.0, effective_alloc_local - used_local), 2)

                # Monthly-reset policies: allocation - current-month usage (pending+approved).
                if self._is_monthly_reset_policy(leave_policy_local):
                    allocated_local = float(self._resolve_template_allocation(target_user, template_obj) or 0.0)
                    if allocated_local <= 0.0:
                        return 0.0

                    period_start_local, period_end_local = self._monthly_period_bounds(today_local)
                    used_local = self._used_units_in_month(
                        target_user,
                        template_obj,
                        period_start=period_start_local,
                        period_end=period_end_local,
                    )
                    return round(max(0.0, allocated_local - used_local), 2)

                return None
            
            # Create sets of template names and overdraft names relevant to the user
            applicable_template_names = {template.name for template in templates}
            applicable_overdraft_names = set()
            for template in templates:
                policy = template.leave_policy or {}
                overdraft_name = policy.get('overdraft_name')
                if overdraft_name:
                    applicable_overdraft_names.add(overdraft_name)
            
            # Get all persisted balances for the user, and include:
            # 1) balances matching applicable templates
            # 2) balances matching applicable overdraft names (e.g., LOP)
            balances_qs = StaffLeaveBalance.objects.filter(staff=user)
            
            balance_data = []
            for balance_obj in balances_qs:
                if (
                    balance_obj.leave_type in applicable_template_names
                    or balance_obj.leave_type in applicable_overdraft_names
                ):
                    display_balance = balance_obj.balance
                    template_obj = template_by_name.get(balance_obj.leave_type)
                    if template_obj is not None:
                        monthly_display = _monthly_display_balance_for_template(user, template_obj)
                        if monthly_display is not None:
                            display_balance = monthly_display

                    balance_data.append({
                        'leave_type': balance_obj.leave_type,
                        'balance': display_balance,
                        'updated_at': balance_obj.updated_at.isoformat() if balance_obj.updated_at else None
                    })
                    logger.info(f'[Balances] {balance_obj.leave_type}: {display_balance}')
            
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
                        monthly_display = _monthly_display_balance_for_template(user, template)
                        if monthly_display is not None:
                            balance_data.append({
                                'leave_type': leave_type,
                                'balance': monthly_display,
                                'updated_at': None
                            })
                            existing_leave_types.add(leave_type)
                            continue

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
    def staff_validation_overview(self, request):
        """
        HR/Admin summary table for staff validation with date and department filters.
        GET /api/staff-requests/requests/staff_validation_overview/?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&department_id=<id>
        """
        from datetime import datetime
        from .permissions import IsAdminOrHR
        from staff_attendance.models import AttendanceRecord

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        from_date_str = request.query_params.get('from_date')
        to_date_str = request.query_params.get('to_date') or from_date_str
        department_id = request.query_params.get('department_id')

        if not from_date_str:
            return Response({'error': 'from_date is required (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
            to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        if from_date > to_date:
            return Response({'error': 'from_date must be before or equal to to_date'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        staff_qs = User.objects.filter(is_active=True, staff_profile__isnull=False).select_related('staff_profile', 'staff_profile__department')
        if department_id:
            staff_qs = staff_qs.filter(staff_profile__department_id=department_id)

        staff_users = list(staff_qs.order_by('first_name', 'username'))
        staff_ids = [u.id for u in staff_users]

        # Attendance aggregation (session-wise: FN + AN => 1 day)
        attendance_map = {sid: {'present_days': 0.0, 'absent_days': 0.0} for sid in staff_ids}
        if staff_ids:
            attendance_qs = AttendanceRecord.objects.filter(
                user_id__in=staff_ids,
                date__gte=from_date,
                date__lte=to_date
            ).values('user_id', 'fn_status', 'an_status')

            for row in attendance_qs:
                uid = row['user_id']
                fn = str(row.get('fn_status') or '').strip().lower()
                an = str(row.get('an_status') or '').strip().lower()
                if fn == 'present':
                    attendance_map[uid]['present_days'] += 0.5
                elif fn == 'absent':
                    attendance_map[uid]['absent_days'] += 0.5

                if an == 'present':
                    attendance_map[uid]['present_days'] += 0.5
                elif an == 'absent':
                    attendance_map[uid]['absent_days'] += 0.5

        # Balance aggregation
        balances_map = {}
        if staff_ids:
            balances_qs = StaffLeaveBalance.objects.filter(staff_id__in=staff_ids).values('staff_id', 'leave_type', 'balance')
            for row in balances_qs:
                sid = row['staff_id']
                leave_type = str(row['leave_type'] or '').strip()
                balances_map.setdefault(sid, {})[leave_type] = float(row['balance'] or 0)

        def pick_balance(staff_balance_map, keys):
            for k in keys:
                if k in staff_balance_map:
                    return float(staff_balance_map.get(k) or 0)
            return 0.0

        # Pre-fetch late-entry templates to compute available counts when balances absent
        from .models import RequestTemplate, StaffRequest

        late_templates = list(RequestTemplate.objects.filter(name__icontains='late entry'))

        rows = []
        for idx, user_obj in enumerate(staff_users, start=1):
            profile = getattr(user_obj, 'staff_profile', None)
            dept = getattr(profile, 'department', None) if profile else None
            staff_balance_map = balances_map.get(user_obj.id, {})
            # Determine late entry available count:
            late_balance_val = pick_balance(staff_balance_map, ['Late Entry Permission', 'Late Entry Permission - SPL'])
            if late_balance_val and late_balance_val > 0:
                late_available = float(late_balance_val)
            else:
                # No explicit balance stored; derive from template allotment minus approved uses in date range
                user_role = self._get_primary_role(user_obj)
                # Prefer SPL template for SPL roles
                tpl = None
                if any(r in ['HOD', 'IQAC', 'HR', 'PS', 'CFSW', 'EDC', 'COE', 'HAA'] for r in [user_role]):
                    tpl = next((t for t in late_templates if t.name.lower().endswith('- spl')), None)
                if not tpl:
                    tpl = next((t for t in late_templates if 'late entry' in t.name.lower()), None)

                allotment = 0.0
                used_count = 0
                if tpl:
                    try:
                        allotment = float((tpl.leave_policy or {}).get('allotment_per_role', {}).get(user_role, 0) or 0)
                    except Exception:
                        allotment = 0.0

                    used_count = StaffRequest.objects.filter(
                        applicant=user_obj,
                        template=tpl,
                        status='approved',
                        created_at__date__gte=from_date,
                        created_at__date__lte=to_date,
                    ).count()

                late_available = max(0.0, allotment - float(used_count))

            rows.append({
                's_no': idx,
                'staff_user_id': user_obj.id,
                'staff_id': getattr(profile, 'staff_id', None) or user_obj.username,
                'staff_name': user_obj.get_full_name() or user_obj.username,
                'department': {
                    'id': dept.id if dept else None,
                    'name': dept.name if dept else 'N/A',
                },
                'present_days': round(attendance_map.get(user_obj.id, {}).get('present_days', 0.0), 2),
                'absent_days': round(attendance_map.get(user_obj.id, {}).get('absent_days', 0.0), 2),
                'balances': {
                    'lop': pick_balance(staff_balance_map, ['LOP']),
                    'cl': pick_balance(staff_balance_map, ['Casual Leave', 'Casual Leave - SPL', 'CL']),
                    'col': pick_balance(staff_balance_map, ['Compensatory leave', 'Compensatory leave - SPL', 'COL']),
                    'od': pick_balance(staff_balance_map, ['ON duty', 'ON duty - SPL', 'OD']),
                    'others': pick_balance(staff_balance_map, ['Others', 'Others - SPL', 'OTHERS']),
                    'late_entry_permission': late_available,
                }
            })

        return Response({
            'filters': {
                'from_date': from_date_str,
                'to_date': to_date_str,
                'department_id': department_id,
            },
            'count': len(rows),
            'results': rows,
        })

    @action(detail=False, methods=['get'])
    def staff_validation_calendar(self, request):
        """
        HR/Admin attendance calendar data for one staff between dates.
        GET /api/staff-requests/requests/staff_validation_calendar/?staff_user_id=<id>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
        """
        from datetime import datetime
        from .permissions import IsAdminOrHR
        from staff_attendance.models import AttendanceRecord

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        staff_user_id = request.query_params.get('staff_user_id')
        from_date_str = request.query_params.get('from_date')
        to_date_str = request.query_params.get('to_date') or from_date_str

        if not staff_user_id or not from_date_str:
            return Response({'error': 'staff_user_id and from_date are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
            to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        try:
            target_user = User.objects.select_related('staff_profile', 'staff_profile__department').get(id=staff_user_id)
        except User.DoesNotExist:
            return Response({'error': 'Staff user not found'}, status=status.HTTP_404_NOT_FOUND)

        records = AttendanceRecord.objects.filter(
            user=target_user,
            date__gte=from_date,
            date__lte=to_date
        ).order_by('date')

        data = []
        for record in records:
            data.append({
                'date': record.date.isoformat(),
                'status': record.status,
                'fn_status': record.fn_status,
                'an_status': record.an_status,
                'morning_in': record.morning_in.strftime('%H:%M') if record.morning_in else None,
                'evening_out': record.evening_out.strftime('%H:%M') if record.evening_out else None,
                'notes': record.notes,
            })

        profile = getattr(target_user, 'staff_profile', None)
        dept = getattr(profile, 'department', None) if profile else None
        return Response({
            'staff': {
                'id': target_user.id,
                'staff_id': getattr(profile, 'staff_id', None) or target_user.username,
                'name': target_user.get_full_name() or target_user.username,
                'department': dept.name if dept else 'N/A',
            },
            'from_date': from_date_str,
            'to_date': to_date_str,
            'records': data,
        })

    @action(detail=False, methods=['get'])
    def hr_templates_for_staff(self, request):
        """
        HR/Admin fetch templates as if target staff is applying on a given date.
        GET /api/staff-requests/requests/hr_templates_for_staff/?staff_user_id=<id>&date=YYYY-MM-DD
        """
        from datetime import datetime
        from .permissions import IsAdminOrHR
        from staff_attendance.models import Holiday, AttendanceRecord

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        staff_user_id = request.query_params.get('staff_user_id')
        date_str = request.query_params.get('date')

        if not staff_user_id or not date_str:
            return Response({'error': 'staff_user_id and date are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            check_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        try:
            target_user = User.objects.get(id=staff_user_id)
        except User.DoesNotExist:
            return Response({'error': 'Staff user not found'}, status=status.HTTP_404_NOT_FOUND)

        user_dept_id = None
        try:
            if hasattr(target_user, 'staff_profile'):
                dept = target_user.staff_profile.get_current_department()
                if dept:
                    user_dept_id = dept.id
        except Exception:
            pass

        holiday_obj = Holiday.objects.filter(date=check_date).first()
        if holiday_obj:
            dept_ids = list(holiday_obj.departments.values_list('id', flat=True))
            is_holiday = (not dept_ids) or (user_dept_id is not None and user_dept_id in dept_ids)
        else:
            is_holiday = False

        is_sunday = check_date.weekday() == 6
        is_holiday_or_sunday = is_holiday or is_sunday

        attendance = AttendanceRecord.objects.filter(user=target_user, date=check_date).first()
        if attendance and attendance.status == 'absent':
            absent_templates = RequestTemplate.objects.filter(is_active=True).exclude(leave_policy__action='earn')
            filtered_absent = [
                template for template in absent_templates
                if can_user_apply_with_template(target_user, template)
            ]
            return Response({
                'templates': RequestTemplateSerializer(filtered_absent, many=True).data,
                'message': 'Absent date - All forms except Earn available',
                'is_holiday': is_holiday_or_sunday,
                'is_absent': True,
            })

        templates = RequestTemplate.objects.filter(is_active=True).exclude(leave_policy={})
        filtered = []
        for template in templates:
            if not can_user_apply_with_template(target_user, template):
                continue
            leave_policy = template.leave_policy
            if not leave_policy or 'action' not in leave_policy:
                continue
            action = leave_policy.get('action')
            if is_holiday_or_sunday and action == 'earn':
                filtered.append(template)
            elif not is_holiday_or_sunday and action in ['deduct', 'neutral']:
                filtered.append(template)

        return Response({
            'templates': RequestTemplateSerializer(filtered, many=True).data,
            'is_holiday': is_holiday_or_sunday,
            'is_absent': False,
            'message': f'{"Earn forms available (Holiday)" if is_holiday_or_sunday else "Deduct/Neutral forms available (Working day)"}'
        })

    @action(detail=False, methods=['post'])
    def hr_apply_request(self, request):
        """
        HR/Admin creates a request on behalf of staff and auto-approves it immediately.
        POST /api/staff-requests/requests/hr_apply_request/

        Body: {"staff_user_id": 123, "template_id": 1, "form_data": {...}}
        """
        from .permissions import IsAdminOrHR

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        staff_user_id = request.data.get('staff_user_id')
        if not staff_user_id:
            return Response({'error': 'staff_user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        try:
            target_user = User.objects.get(id=staff_user_id)
        except User.DoesNotExist:
            return Response({'error': 'Staff user not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(data={
            'template_id': request.data.get('template_id'),
            'form_data': request.data.get('form_data', {})
        })
        serializer.is_valid(raise_exception=True)

        template = serializer.validated_data.get('template')
        form_data = serializer.validated_data.get('form_data', {})

        if not can_user_apply_with_template(target_user, template):
            return Response(
                {'error': 'Target staff role is not allowed to use this request template'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Reuse late-entry rule validation with target staff attendance profile.
        late_entry_validation_error = self._validate_late_entry_rules(target_user, template, form_data)
        if late_entry_validation_error:
            return Response({'error': late_entry_validation_error}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            staff_request = serializer.save(applicant=target_user)
            staff_request.mark_approved()

            ApprovalLog.objects.create(
                request=staff_request,
                approver=request.user,
                step_order=1,
                action='approved',
                comments='Auto-approved by HR/Admin (applied on behalf of staff).'
            )

            self._run_final_approval_side_effects(staff_request, acted_by=request.user)

        response_serializer = StaffRequestDetailSerializer(staff_request)
        return Response({
            'message': 'Request applied and auto-approved successfully',
            'request': response_serializer.data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def hr_apply_cl_for_lop(self, request):
        """
        HR/Admin bulk apply CL for selected staff against absent sessions in a month.
        POST /api/staff-requests/requests/hr_apply_cl_for_lop/

        Body: {
          "month": "YYYY-MM",
          "staff_user_ids": [1,2,3]
        }
        """
        from datetime import date
        import calendar
        from .permissions import IsAdminOrHR
        from staff_attendance.models import AttendanceRecord

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        month_str = str(request.data.get('month') or '').strip()
        staff_user_ids = request.data.get('staff_user_ids') or []

        if not month_str:
            return Response({'error': 'month is required (YYYY-MM)'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(staff_user_ids, list) or len(staff_user_ids) == 0:
            return Response({'error': 'staff_user_ids must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            year, month = map(int, month_str.split('-'))
            month_start = date(year, month, 1)
            month_end = date(year, month, calendar.monthrange(year, month)[1])
        except Exception:
            return Response({'error': 'Invalid month format, use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)

        if is_salary_month_locked(month_start):
            return Response({'error': f'Cannot apply CL. Salary is published and locked for {month_str}.'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        users = list(User.objects.filter(id__in=staff_user_ids, is_active=True).select_related('staff_profile', 'staff_profile__department'))
        user_map = {u.id: u for u in users}

        # Templates
        cl_tpl = RequestTemplate.objects.filter(is_active=True, name__iexact='Casual Leave').first()
        cl_spl_tpl = RequestTemplate.objects.filter(is_active=True, name__iexact='Casual Leave - SPL').first()

        if not cl_tpl and not cl_spl_tpl:
            return Response({'error': 'Casual Leave template(s) not configured'}, status=status.HTTP_400_BAD_REQUEST)

        split_roles = {'HOD', 'IQAC', 'HR', 'PS', 'CFSW', 'EDC', 'COE', 'HAA'}
        per_staff = []
        total_applied_units = 0.0
        total_created_requests = 0

        with transaction.atomic():
            for user_id in staff_user_ids:
                target_user = user_map.get(int(user_id))
                if not target_user:
                    per_staff.append({'staff_user_id': user_id, 'status': 'skipped', 'reason': 'User not found'})
                    continue

                role = self._get_primary_role(target_user)
                use_spl = role in split_roles
                template = cl_spl_tpl if use_spl and cl_spl_tpl else cl_tpl
                if not template:
                    per_staff.append({
                        'staff_user_id': target_user.id,
                        'staff_id': getattr(getattr(target_user, 'staff_profile', None), 'staff_id', None) or target_user.username,
                        'status': 'skipped',
                        'reason': 'Matching CL template not available',
                    })
                    continue

                if not can_user_apply_with_template(target_user, template):
                    per_staff.append({
                        'staff_user_id': target_user.id,
                        'staff_id': getattr(getattr(target_user, 'staff_profile', None), 'staff_id', None) or target_user.username,
                        'status': 'skipped',
                        'reason': 'Template not allowed for target user role',
                    })
                    continue

                cl_leave_keys = ['Casual Leave - SPL', 'Casual Leave', 'CL'] if use_spl else ['Casual Leave', 'CL', 'Casual Leave - SPL']
                cl_balance = 0.0
                for key in cl_leave_keys:
                    bal = StaffLeaveBalance.objects.filter(staff=target_user, leave_type=key).first()
                    if bal:
                        cl_balance = float(bal.balance or 0.0)
                        break

                if cl_balance <= 0:
                    per_staff.append({
                        'staff_user_id': target_user.id,
                        'staff_id': getattr(getattr(target_user, 'staff_profile', None), 'staff_id', None) or target_user.username,
                        'status': 'skipped',
                        'reason': 'No CL balance available',
                    })
                    continue

                records = AttendanceRecord.objects.filter(
                    user=target_user,
                    date__gte=month_start,
                    date__lte=month_end,
                ).order_by('date')

                targets = []
                for rec in records:
                    fn_absent = str(rec.fn_status or '').strip().lower() == 'absent'
                    an_absent = str(rec.an_status or '').strip().lower() == 'absent'
                    if fn_absent and an_absent:
                        targets.append((rec.date, 'FULL', 1.0))
                    elif fn_absent:
                        targets.append((rec.date, 'FN', 0.5))
                    elif an_absent:
                        targets.append((rec.date, 'AN', 0.5))

                if not targets:
                    per_staff.append({
                        'staff_user_id': target_user.id,
                        'staff_id': getattr(getattr(target_user, 'staff_profile', None), 'staff_id', None) or target_user.username,
                        'status': 'skipped',
                        'reason': 'No absent sessions in selected month',
                    })
                    continue

                applied_units = 0.0
                applied_count = 0

                for target_date, shift, units in targets:
                    if cl_balance + 1e-9 < units:
                        continue

                    form_data = {
                        'date': target_date.isoformat(),
                        'shift': shift,
                    }

                    # Fill one required text/number field with a safe default when present.
                    for field in template.form_schema or []:
                        if not field.get('required'):
                            continue
                        fname = str(field.get('name') or '').strip()
                        ftype = str(field.get('type') or '').strip().lower()
                        if not fname or fname in form_data:
                            continue
                        if ftype in ['text', 'textarea']:
                            form_data[fname] = '-'
                            break
                        if ftype in ['number']:
                            form_data[fname] = 0
                            break

                    staff_request = StaffRequest.objects.create(
                        applicant=target_user,
                        template=template,
                        form_data=form_data,
                        status='approved',
                        current_step=1,
                    )

                    ApprovalLog.objects.create(
                        request=staff_request,
                        approver=request.user,
                        step_order=1,
                        action='approved',
                        comments='Auto-approved by HR bulk Apply CL for LOP.'
                    )

                    self._run_final_approval_side_effects(staff_request, acted_by=request.user)

                    applied_units += units
                    applied_count += 1
                    cl_balance = max(0.0, cl_balance - units)

                # Ensure LOP reflects latest absence coverage after bulk run.
                lop_after = self._recalculate_lop_for_user(target_user)

                if applied_count == 0:
                    per_staff.append({
                        'staff_user_id': target_user.id,
                        'staff_id': getattr(getattr(target_user, 'staff_profile', None), 'staff_id', None) or target_user.username,
                        'status': 'skipped',
                        'reason': 'Insufficient CL balance for available absent sessions',
                        'lop_after': lop_after,
                    })
                else:
                    per_staff.append({
                        'staff_user_id': target_user.id,
                        'staff_id': getattr(getattr(target_user, 'staff_profile', None), 'staff_id', None) or target_user.username,
                        'status': 'applied',
                        'template': template.name,
                        'applied_requests': applied_count,
                        'applied_units': round(applied_units, 2),
                        'lop_after': lop_after,
                    })
                    total_applied_units += applied_units
                    total_created_requests += applied_count

        return Response({
            'message': 'Bulk CL apply completed',
            'month': month_str,
            'total_staff_selected': len(staff_user_ids),
            'total_created_requests': total_created_requests,
            'total_applied_units': round(total_applied_units, 2),
            'results': per_staff,
        })

    @action(detail=False, methods=['get'], url_path='balances/by_user')
    def balances_by_user(self, request):
        """
        HR/Admin: view balances for any staff user.
        Returns all applicable leave types for the user's role, including ones not yet in DB.
        GET /api/staff-requests/requests/balances/by_user/?user_id=<id>
        """
        from .permissions import IsAdminOrHR

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.query_params.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        # Get user's primary role
        user_role = self._get_primary_role(target_user)

        # Get all active request templates that this user can apply
        templates = RequestTemplate.objects.filter(is_active=True).exclude(leave_policy={})
        applicable_templates = [
            template for template in templates
            if can_user_apply_with_template(target_user, template)
        ]

        def _monthly_display_balance_for_template(target_user_local, template_obj):
            leave_policy_local = getattr(template_obj, 'leave_policy', None) or {}
            action_local = str(leave_policy_local.get('action') or '').strip().lower()
            if action_local not in ['deduct', 'neutral']:
                return None
            today_local = timezone.localdate()

            # Split-period policies (from/to + split_date) take precedence over
            # monthly flags because CL uses split entitlement across one period.
            split_date_str = leave_policy_local.get('split_date')
            from_date_str = leave_policy_local.get('from_date')
            to_date_str = leave_policy_local.get('to_date')
            if split_date_str and from_date_str and to_date_str:
                try:
                    from datetime import datetime
                    split_date_local = datetime.strptime(str(split_date_str).strip(), '%Y-%m-%d').date()
                    period_start_local = datetime.strptime(str(from_date_str).strip(), '%Y-%m-%d').date()
                    period_end_local = datetime.strptime(str(to_date_str).strip(), '%Y-%m-%d').date()
                except Exception:
                    return None

                # Outside configured period, don't override persisted balance.
                if today_local < period_start_local or today_local > period_end_local:
                    return None

                allocated_local = float(self._resolve_template_allocation(target_user_local, template_obj) or 0.0)
                if allocated_local <= 0.0:
                    return 0.0

                effective_alloc_local = allocated_local / 2.0 if today_local < split_date_local else allocated_local

                used_local = 0.0
                qs_local = StaffRequest.objects.filter(
                    applicant=target_user_local,
                    template=template_obj,
                    status='approved',
                ).select_related('template')
                for req_local in qs_local:
                    used_local += self._request_units_for_usage(
                        template_obj,
                        req_local.form_data or {},
                        target_user_local,
                        period_start=period_start_local,
                        period_end=min(period_end_local, today_local),
                    )

                return round(max(0.0, effective_alloc_local - used_local), 2)

            # Monthly-reset policies: allocation - current-month usage (pending+approved).
            if self._is_monthly_reset_policy(leave_policy_local):
                allocated_local = float(self._resolve_template_allocation(target_user_local, template_obj) or 0.0)
                if allocated_local <= 0.0:
                    return 0.0

                period_start_local, period_end_local = self._monthly_period_bounds(today_local)
                used_local = self._used_units_in_month(
                    target_user_local,
                    template_obj,
                    period_start=period_start_local,
                    period_end=period_end_local,
                )
                return round(max(0.0, allocated_local - used_local), 2)

            return None
        
        # Get existing balances from DB
        existing_balances = {
            b.leave_type: b.balance
            for b in StaffLeaveBalance.objects.filter(staff=target_user)
        }
        
        # Build complete balance list with monthly-reset display logic.
        balance_data = []
        seen = set()

        for template in sorted(applicable_templates, key=lambda t: t.name.lower()):
            leave_type = template.name
            monthly_display = _monthly_display_balance_for_template(target_user, template)

            if monthly_display is not None:
                display_balance = monthly_display
            else:
                if leave_type in existing_balances:
                    display_balance = existing_balances[leave_type]
                else:
                    action = str((template.leave_policy or {}).get('action') or '').strip().lower()
                    if action in ['deduct', 'neutral']:
                        display_balance = float(self._resolve_template_allocation(target_user, template) or 0.0)
                    else:
                        display_balance = 0.0

            balance_data.append({
                'leave_type': leave_type,
                'balance': display_balance,
            })
            seen.add(leave_type)

        # Keep additional balances that are not represented by applicable templates
        # (e.g., custom/manual leave types, overdraft types).
        for leave_type, balance in sorted(existing_balances.items()):
            if leave_type not in seen:
                balance_data.append({
                    'leave_type': leave_type,
                    'balance': balance,
                })
                seen.add(leave_type)
        
        # Always include LOP as an editable field (even if not in templates)
        if 'LOP' not in seen:
            balance_data.append({
                'leave_type': 'LOP',
                'balance': existing_balances.get('LOP', 0.0),
            })
            seen.add('LOP')

        return Response({
            'user': {
                'id': target_user.id,
                'username': target_user.username,
                'full_name': target_user.get_full_name() or target_user.username,
                'role': user_role,
            },
            'balances': balance_data,
        })

    @action(detail=False, methods=['get'], url_path='balances/staff_search')
    def balances_staff_search(self, request):
        """
        HR/Admin: search staff users for balance editing UI.
        GET /api/staff-requests/requests/balances/staff_search/?q=<name_or_username>
        """
        from .permissions import IsAdminOrHR

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

        q = (request.query_params.get('q') or '').strip()
        User = get_user_model()

        users_qs = User.objects.filter(is_active=True).select_related('staff_profile', 'staff_profile__department')
        if q:
            users_qs = users_qs.filter(
                Q(username__icontains=q) |
                Q(first_name__icontains=q) |
                Q(last_name__icontains=q) |
                Q(staff_profile__staff_id__icontains=q)
            )

        users_qs = users_qs.order_by('first_name', 'username')[:100]

        data = []
        for u in users_qs:
            profile = getattr(u, 'staff_profile', None)
            dept = getattr(profile, 'department', None) if profile else None
            data.append({
                'id': u.id,
                'username': u.username,
                'full_name': u.get_full_name() or u.username,
                'staff_id': getattr(profile, 'staff_id', None),
                'department': {
                    'id': dept.id,
                    'name': dept.name,
                    'code': dept.code,
                } if dept else None,
            })

        return Response({'results': data, 'count': len(data)})

    @action(detail=False, methods=['post'], url_path='balances/set')
    def set_balance(self, request):
        """
        HR/Admin: set any leave balance value for any staff.
        POST /api/staff-requests/requests/balances/set/
        Body: {"user_id": 12, "leave_type": "Casual Leave", "balance": 8.5}
        """
        from .permissions import IsAdminOrHR

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can update balances'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get('user_id')
        leave_type = request.data.get('leave_type')
        balance = request.data.get('balance')

        if user_id is None or not leave_type or balance is None:
            return Response(
                {'error': 'user_id, leave_type, and balance are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            balance_value = float(balance)
        except (TypeError, ValueError):
            return Response({'error': 'balance must be a number'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            balance_obj, _ = StaffLeaveBalance.objects.get_or_create(
                staff=target_user,
                leave_type=str(leave_type).strip(),
                defaults={'balance': 0.0}
            )
            balance_obj.balance = balance_value
            balance_obj.save(update_fields=['balance', 'updated_at'])

        return Response({
            'message': 'Balance updated successfully',
            'user': {
                'id': target_user.id,
                'username': target_user.username,
                'full_name': target_user.get_full_name() or target_user.username,
            },
            'balance': {
                'leave_type': balance_obj.leave_type,
                'balance': balance_obj.balance,
                'updated_at': balance_obj.updated_at.isoformat() if balance_obj.updated_at else None,
            }
        })

    def _extract_requested_units_by_date_for_user(self, form_data, user):
        """Extract date->requested units from form_data (FN/AN-aware) for a specific user."""
        from datetime import datetime
        from datetime import timedelta

        dates = {}
        start_date = None
        end_date = None

        for start_key in ['start_date', 'from_date', 'startDate', 'fromDate', 'from']:
            if start_key in form_data:
                start_date = form_data[start_key]
                break

        for end_key in ['end_date', 'to_date', 'endDate', 'toDate', 'to']:
            if end_key in form_data:
                end_date = form_data[end_key]
                break

        if not start_date and 'date' in form_data:
            start_date = form_data['date']
        if not end_date and 'date' in form_data:
            end_date = form_data['date']

        if not (start_date and end_date):
            return dates

        try:
            if isinstance(start_date, str):
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).date()
            else:
                start = start_date

            if isinstance(end_date, str):
                end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).date()
            else:
                end = end_date

            from_noon = self._normalize_shift_value(
                form_data.get('from_noon', form_data.get('from_shift', form_data.get('shift', '')))
            )
            to_noon = self._normalize_shift_value(
                form_data.get('to_noon', form_data.get('to_shift', form_data.get('shift', '')))
            )

            if start == end:
                if start.weekday() == 6 or self._is_holiday_for_user(start, user):
                    return {}
                return {start: self._single_day_units(from_noon, to_noon)}

            current = start
            while current <= end:
                if current.weekday() == 6 or self._is_holiday_for_user(current, user):
                    current += timedelta(days=1)
                    continue

                units = 1.0
                if current == start and from_noon == 'AN':
                    units = 0.5
                if current == end and to_noon == 'FN':
                    units = 0.5
                dates[current] = units
                current += timedelta(days=1)
        except Exception:
            pass

        return dates

    @action(detail=False, methods=['post'], url_path='balances/recalculate_lop')
    def recalculate_lop_balances(self, request):
        """
        HR/Admin: recalculate LOP for all active staff from current attendance and approved requests.
        POST /api/staff-requests/requests/balances/recalculate_lop/
        """
        from .permissions import IsAdminOrHR
        from staff_attendance.models import AttendanceRecord

        if not IsAdminOrHR().has_permission(request, self):
            return Response({'error': 'Only HR/Admin can recalculate LOP'}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        users = User.objects.filter(is_active=True, staff_profile__isnull=False).distinct()

        processed_users = 0
        updated_users = 0

        for user in users:
            processed_users += 1

            attendance_records = AttendanceRecord.objects.filter(user=user)
            absent_units_by_date = {}
            for record in attendance_records:
                if record.date.weekday() == 6 or self._is_holiday_for_user(record.date, user):
                    continue
                units = self._attendance_absent_units(record)
                if units > 0:
                    absent_units_by_date[record.date] = units

            absent_units_total = round(sum(absent_units_by_date.values()), 2)

            covered_units = 0.0
            approved_requests = StaffRequest.objects.filter(
                applicant=user,
                status='approved',
                template__leave_policy__action__in=['deduct', 'neutral']
            )

            remaining_absent_units = dict(absent_units_by_date)
            for approved_request in approved_requests:
                request_units_by_date = self._extract_requested_units_by_date_for_user(
                    approved_request.form_data,
                    user
                )
                for req_date, req_units in request_units_by_date.items():
                    absent_left = remaining_absent_units.get(req_date, 0.0)
                    if absent_left <= 0:
                        continue
                    covered_now = min(absent_left, float(req_units or 0.0))
                    if covered_now > 0:
                        covered_units += covered_now
                        remaining_absent_units[req_date] = round(absent_left - covered_now, 2)

            absence_based_lop = round(max(0.0, absent_units_total - covered_units), 2)
            overuse_lop = self._compute_overuse_lop_units(user)
            lop_count = round(absence_based_lop + overuse_lop, 2)

            lop_balance, _ = StaffLeaveBalance.objects.get_or_create(
                staff=user,
                leave_type='LOP',
                defaults={'balance': 0.0}
            )

            old_lop = float(lop_balance.balance or 0.0)
            if old_lop != lop_count:
                lop_balance.balance = lop_count
                lop_balance.save(update_fields=['balance', 'updated_at'])
                updated_users += 1

        return Response({
            'success': True,
            'message': 'LOP recalculation completed successfully',
            'processed_users': processed_users,
            'updated_users': updated_users,
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
        
        # Calculate total absence units (supports half-day entries)
        total_days = self._calculate_absence_units(absence_dates)
        
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
            'message': f'Processed {total_days} absence units for {target_user.get_full_name() or target_user.username}',
            'processed_days': total_days,
            'absence_dates': absence_dates,
            'balances': balance_data
        })

    def _calculate_absence_units(self, absence_dates):
        """
        Calculate absence units from payload.

        Supported item formats in absence_dates:
        - "YYYY-MM-DD" => 1.0
        - "YYYY-MM-DD:FN" or "YYYY-MM-DD:AN" => 0.5
        - "YYYY-MM-DD:FULL" => 1.0
        - {"date": "YYYY-MM-DD", "shift": "FN"|"AN"|"FULL"} => 0.5/1.0
        - {"units": 0.5} => 0.5
        - numeric value => that unit count
        """
        total = 0.0

        for item in absence_dates or []:
            if isinstance(item, (int, float)):
                total += float(item)
                continue

            if isinstance(item, dict):
                units = item.get('units', item.get('day_units', item.get('value')))
                if units is not None:
                    try:
                        total += float(units)
                        continue
                    except (TypeError, ValueError):
                        pass

                shift = str(item.get('shift', item.get('session', item.get('from_noon', '')))).strip().upper()
                if shift == 'FULL DAY':
                    shift = 'FULL'
                total += 0.5 if shift in ['FN', 'AN'] else 1.0
                continue

            if isinstance(item, str):
                token = item.strip()
                if not token:
                    continue

                if ':' in token or '|' in token:
                    separator = ':' if ':' in token else '|'
                    shift_token = token.split(separator)[-1].strip().upper()
                    if shift_token == 'FULL DAY':
                        shift_token = 'FULL'
                    total += 0.5 if shift_token in ['FN', 'AN'] else 1.0
                else:
                    total += 1.0

        return round(total, 2)


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
