from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import (
    RequestTemplate, ApprovalStep, StaffRequest, ApprovalLog,
    EventAttendingForm, EventAttendingFile, EventAttendingApprovalLog,
    EventAttendingApprovalWorkflow, StaffEventDeclaration, EventBudgetCondition,
)

User = get_user_model()


class ApprovalStepSerializer(serializers.ModelSerializer):
    """Serializer for ApprovalStep model"""
    
    class Meta:
        model = ApprovalStep
        fields = ['id', 'step_order', 'approver_role', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class RequestTemplateSerializer(serializers.ModelSerializer):
    """
    Serializer for RequestTemplate with nested ApprovalStep creation.
    Used by HR/Admin to manage request templates.
    """
    approval_steps = ApprovalStepSerializer(many=True, read_only=True)
    total_steps = serializers.SerializerMethodField()
    
    class Meta:
        model = RequestTemplate
        fields = [
            'id', 'name', 'description', 'is_active',
            'form_schema', 'allowed_roles', 'leave_policy', 'attendance_action',
            'approval_steps', 'total_steps',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_total_steps(self, obj):
        """Return the total number of approval steps"""
        return obj.approval_steps.count()
    
    def validate_form_schema(self, value):
        """Validate form_schema structure"""
        if not isinstance(value, list):
            raise serializers.ValidationError("form_schema must be a list of field definitions")
        
        for field in value:
            if not isinstance(field, dict):
                raise serializers.ValidationError("Each field must be a dictionary")
            if 'name' not in field or 'type' not in field:
                raise serializers.ValidationError("Each field must have 'name' and 'type' properties")
        
        return value
    
    def validate_allowed_roles(self, value):
        """Validate allowed_roles structure"""
        if not isinstance(value, list):
            raise serializers.ValidationError("allowed_roles must be a list")
        return value
    
    def validate_leave_policy(self, value):
        """Validate leave_policy structure"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("leave_policy must be a dictionary")
        
        # If leave_policy has an action, validate it
        if 'action' in value:
            allowed_actions = ['deduct', 'earn', 'neutral']
            if value['action'] not in allowed_actions:
                raise serializers.ValidationError(
                    f"action must be one of: {', '.join(allowed_actions)}"
                )
        
        # Validate allotment_per_role if present
        if 'allotment_per_role' in value:
            if not isinstance(value['allotment_per_role'], dict):
                raise serializers.ValidationError("allotment_per_role must be a dictionary")
        
        return value
    
    def validate_attendance_action(self, value):
        """Validate attendance_action structure"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("attendance_action must be a dictionary")
        
        # If attendance_action has change_status enabled, validate required fields
        if value.get('change_status'):
            if 'from_status' not in value or 'to_status' not in value:
                raise serializers.ValidationError(
                    "attendance_action with change_status=True requires 'from_status' and 'to_status'"
                )
            if 'apply_to_dates' not in value or not value['apply_to_dates']:
                raise serializers.ValidationError(
                    "attendance_action with change_status=True requires 'apply_to_dates' array"
                )
        
        return value


class RequestTemplateDetailSerializer(RequestTemplateSerializer):
    """
    Extended serializer with write support for nested approval steps.
    Used for create/update operations.
    """
    approval_steps = ApprovalStepSerializer(many=True, required=False)
    
    class Meta(RequestTemplateSerializer.Meta):
        pass
    
    def create(self, validated_data):
        """Create template with nested approval steps"""
        approval_steps_data = validated_data.pop('approval_steps', [])
        template = RequestTemplate.objects.create(**validated_data)
        
        for step_data in approval_steps_data:
            ApprovalStep.objects.create(template=template, **step_data)
        
        return template
    
    def update(self, instance, validated_data):
        """Update template and optionally replace approval steps"""
        approval_steps_data = validated_data.pop('approval_steps', None)
        
        # Update template fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # If approval_steps provided, replace existing steps
        if approval_steps_data is not None:
            instance.approval_steps.all().delete()
            for step_data in approval_steps_data:
                ApprovalStep.objects.create(template=instance, **step_data)
        
        return instance


class ApplicantSerializer(serializers.ModelSerializer):
    """Minimal user serializer for applicant info"""
    name = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    staff_id = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    date_of_join = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'name', 'full_name',
            'first_name', 'last_name', 'staff_id', 'department', 'date_of_join',
        ]
        read_only_fields = fields

    def get_name(self, obj):
        return obj.get_full_name() or obj.username
    
    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_staff_id(self, obj):
        try:
            from academics.models import StaffProfile
            profile = StaffProfile.objects.filter(user=obj).first()
            return profile.staff_id if profile else obj.username
        except Exception:
            return obj.username

    def get_department(self, obj):
        try:
            profile = getattr(obj, 'staff_profile', None)
            if profile:
                dept = getattr(profile, 'current_department', None) or profile.department
                if dept:
                    return dept.name or dept.short_name or ''
        except Exception:
            pass
        return ''

    def get_date_of_join(self, obj):
        try:
            profile = getattr(obj, 'staff_profile', None)
            if profile and profile.date_of_join:
                return profile.date_of_join
        except Exception:
            pass
        return None


class ApproverSerializer(serializers.ModelSerializer):
    """Minimal user serializer for approver info"""
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name']
        read_only_fields = fields
    
    def get_full_name(self, obj):
        try:
            profile = getattr(obj, 'staff_profile', None)
            if profile:
                name = obj.get_full_name() or obj.username
                return name
        except Exception:
            pass
        return obj.get_full_name() or obj.username


class ApprovalLogSerializer(serializers.ModelSerializer):
    """
    Serializer for ApprovalLog with nested approver details.
    Shows the audit trail of approval actions.
    """
    approver = ApproverSerializer(read_only=True)
    approver_role = serializers.SerializerMethodField()
    
    class Meta:
        model = ApprovalLog
        fields = [
            'id', 'step_order', 'action', 'comments',
            'approver', 'approver_role', 'action_date'
        ]
        read_only_fields = fields
    
    def get_approver_role(self, obj):
        """Get the role name for this approval step"""
        try:
            step = obj.request.template.approval_steps.get(step_order=obj.step_order)
            return step.approver_role
        except ApprovalStep.DoesNotExist:
            return None


class StaffRequestListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing staff requests.
    Used in list views for performance.
    """
    applicant = ApplicantSerializer(read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True)
    current_approver_role = serializers.SerializerMethodField()
    
    class Meta:
        model = StaffRequest
        fields = [
            'id', 'applicant', 'template_name', 'status',
            'current_step', 'current_approver_role',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields
    
    def get_current_approver_role(self, obj):
        """Get the role required for current approval step"""
        return obj.get_required_approver_role()


class StaffRequestDetailSerializer(serializers.ModelSerializer):
    """
    Full serializer for StaffRequest with deep nesting.
    Shows complete request details, template, approval history, and workflow progress.
    """
    applicant = ApplicantSerializer(read_only=True)
    template = RequestTemplateSerializer(read_only=True)
    template_id = serializers.PrimaryKeyRelatedField(
        queryset=RequestTemplate.objects.filter(is_active=True),
        source='template',
        write_only=True
    )
    
    # Approval workflow information
    approval_logs = ApprovalLogSerializer(many=True, read_only=True)
    current_approver_role = serializers.SerializerMethodField()
    total_steps = serializers.SerializerMethodField()
    completed_steps = serializers.SerializerMethodField()
    is_final_step = serializers.SerializerMethodField()
    workflow_progress = serializers.SerializerMethodField()
    budget_details = serializers.SerializerMethodField()
    
    class Meta:
        model = StaffRequest
        fields = [
            'id', 'applicant', 'template', 'template_id',
            'form_data', 'status', 'current_step',
            'current_approver_role', 'total_steps', 'completed_steps',
            'is_final_step', 'workflow_progress',
            'approval_logs', 'budget_details',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'applicant', 'status', 'current_step',
            'created_at', 'updated_at'
        ]
        
    def get_budget_details(self, obj):
        if obj.template.name not in ['ON duty', 'ON duty - SPL']:
            return None
            
        nature = str((obj.form_data or {}).get('nature_of_event', '')).strip().lower()
        is_conf = nature == 'conference'
        
        from .models import StaffEventDeclaration, EventAttendingForm
        try:
            decl = StaffEventDeclaration.objects.get(staff=obj.applicant)
        except StaffEventDeclaration.DoesNotExist:
            return None
            
        def _is_conference(form_data):
            if not form_data: return False
            for v in form_data.values():
                if isinstance(v, str) and 'conference' in str(v).strip().lower():
                    return True
            return False

        # Calculate permanently used (approved claims) to reconstruct allocated amount
        approved_claims = EventAttendingForm.objects.filter(staff=obj.applicant, status='approved').select_related('on_duty_request')
        permanent_used_conf = 0
        permanent_used_normal = 0
        for claim in approved_claims:
            fd = {}
            if claim.on_duty_request: fd.update(claim.on_duty_request.form_data or {})
            if claim.custom_event_details: fd.update(claim.custom_event_details or {})
            if _is_conference(fd):
                permanent_used_conf += float(claim.grand_total or 0)
            else:
                permanent_used_normal += float(claim.grand_total or 0)
                
        allocated_conf = float(decl.conference_budget) + permanent_used_conf
        allocated_normal = float(decl.normal_events_budget) + permanent_used_normal
        allocated = allocated_conf if is_conf else allocated_normal
        
        return {
            'is_conference': is_conf,
            'allocated': allocated,
            'used': decl.get_used_budget(is_conf),
            'available': decl.get_available_budget(is_conf),
            'allocated_conference': allocated_conf,
            'allocated_normal': allocated_normal,
        }
    
    def get_current_approver_role(self, obj):
        """Get the role required for current approval step"""
        return obj.get_required_approver_role()
    
    def get_total_steps(self, obj):
        """Total number of approval steps in the workflow"""
        return obj.template.approval_steps.count()
    
    def get_completed_steps(self, obj):
        """Number of completed approval steps"""
        return obj.approval_logs.filter(action='approved').count()
    
    def get_is_final_step(self, obj):
        """Check if current step is the final approval step"""
        return obj.is_final_step()
    
    def get_workflow_progress(self, obj):
        """
        Return a detailed workflow progress structure showing all steps
        and their current status.
        """
        steps = []
        approval_logs = {log.step_order: log for log in obj.approval_logs.all()}
        
        for step in obj.template.approval_steps.all():
            step_info = {
                'step_order': step.step_order,
                'approver_role': step.approver_role,
                'is_current': step.step_order == obj.current_step,
                'is_completed': step.step_order in approval_logs,
                'status': None,
                'approver': None,
                'comments': None,
                'action_date': None
            }
            
            if step.step_order in approval_logs:
                log = approval_logs[step.step_order]
                step_info.update({
                    'status': log.action,
                    'approver': ApproverSerializer(log.approver).data,
                    'comments': log.comments,
                    'action_date': log.action_date
                })
            
            steps.append(step_info)
        
        return steps
    
    def validate(self, attrs):
        """Validate the request data"""
        template = attrs.get('template')
        form_data = attrs.get('form_data', {})
        
        if template:
            # Validate form_data against template schema
            is_valid, errors = template.validate_form_data(form_data)
            if not is_valid:
                raise serializers.ValidationError({'form_data': errors})
            
            # Check if user's role is allowed for this template
            # Note: Role checking should be done in the view with proper user context
        
        return attrs
    
    def create(self, validated_data):
        """Create a new staff request"""
        # Applicant is set from request.user in the view
        return StaffRequest.objects.create(**validated_data)


class ProcessApprovalSerializer(serializers.Serializer):
    """
    Input serializer for processing approval actions.
    Used in the process_approval action endpoint.
    """
    action = serializers.ChoiceField(choices=['approve', 'reject'], required=True)
    comments = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    
    def validate_action(self, value):
        """Validate action value"""
        if value not in ['approve', 'reject']:
            raise serializers.ValidationError("Action must be 'approve' or 'reject'")
        return value


class ApprovalStepCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating individual approval steps.
    Used in nested routes or standalone step management.
    """
    
    class Meta:
        model = ApprovalStep
        fields = ['id', 'template', 'step_order', 'approver_role']
        read_only_fields = ['id']
    
    def validate(self, attrs):
        """Ensure step_order uniqueness within template"""
        template = attrs.get('template')
        step_order = attrs.get('step_order')
        
        if ApprovalStep.objects.filter(template=template, step_order=step_order).exists():
            raise serializers.ValidationError({
                'step_order': f"Step {step_order} already exists for this template"
            })
        
        return attrs


# ══════════════════════════════════════════════════════════════════════
# Event Attending Serializers
# ══════════════════════════════════════════════════════════════════════

class EventAttendingFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = EventAttendingFile
        fields = ['id', 'expense_type', 'expense_index', 'file', 'file_url', 'original_filename', 'orientation', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class EventAttendingApprovalLogSerializer(serializers.ModelSerializer):
    approver = ApproverSerializer(read_only=True)

    class Meta:
        model = EventAttendingApprovalLog
        fields = ['id', 'step_order', 'action', 'comments', 'approver', 'action_date']
        read_only_fields = fields


class EventAttendingFormListSerializer(serializers.ModelSerializer):
    applicant = ApplicantSerializer(source='staff', read_only=True)
    on_duty_form_data = serializers.SerializerMethodField()
    travel_total = serializers.FloatField(read_only=True)
    food_total = serializers.FloatField(read_only=True)
    other_total = serializers.FloatField(read_only=True)
    grand_total = serializers.FloatField(read_only=True)
    balance = serializers.FloatField(read_only=True)

    class Meta:
        model = EventAttendingForm
        fields = [
            'id', 'applicant', 'status', 'current_step',
            'travel_total', 'food_total', 'other_total', 'grand_total', 'balance',
            'on_duty_form_data', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_on_duty_form_data(self, obj):
        data = {}
        if obj.on_duty_request and obj.on_duty_request.form_data:
            data.update(obj.on_duty_request.form_data)
        if obj.custom_event_details:
            data.update(obj.custom_event_details)
        return data


class EventAttendingFormDetailSerializer(serializers.ModelSerializer):
    applicant = ApplicantSerializer(source='staff', read_only=True)
    on_duty_form_data = serializers.SerializerMethodField()
    on_duty_form_schema = serializers.SerializerMethodField()
    on_duty_template_name = serializers.CharField(source='on_duty_request.template.name', read_only=True)
    files = EventAttendingFileSerializer(many=True, read_only=True)
    approval_logs = EventAttendingApprovalLogSerializer(many=True, read_only=True)
    travel_total = serializers.FloatField(read_only=True)
    food_total = serializers.FloatField(read_only=True)
    other_total = serializers.FloatField(read_only=True)
    grand_total = serializers.FloatField(read_only=True)
    balance = serializers.FloatField(read_only=True)
    workflow_progress = serializers.SerializerMethodField()
    full_workflow = serializers.SerializerMethodField()
    current_approver_role = serializers.SerializerMethodField()
    budget_details = serializers.SerializerMethodField()

    class Meta:
        model = EventAttendingForm
        fields = [
            'id', 'applicant', 'on_duty_request_id', 'on_duty_form_data', 'on_duty_form_schema', 'on_duty_template_name',
            'custom_event_details', 'event_proof',
            'travel_expenses', 'food_expenses', 'other_expenses',
            'total_fees_spend', 'advance_amount_received', 'advance_date',
            'travel_total', 'food_total', 'other_total', 'grand_total', 'balance',
            'status', 'current_step', 'current_approver_role',
            'files', 'approval_logs', 'workflow_progress', 'full_workflow',
            'created_at', 'updated_at', 'budget_details'
        ]
        read_only_fields = fields

    def _is_conference_form(self, form_data):
        """Check if any field value indicates this is a conference event."""
        if not form_data:
            return False
        for v in form_data.values():
            if isinstance(v, str) and 'conference' in v.strip().lower():
                return True
        return False

    def get_budget_details(self, obj):
        from .models import StaffEventDeclaration, EventAttendingForm
        try:
            decl = StaffEventDeclaration.objects.get(staff=obj.staff)
        except StaffEventDeclaration.DoesNotExist:
            return None
            
        combined = {}
        if obj.on_duty_request:
            combined.update(obj.on_duty_request.form_data or {})
        if obj.custom_event_details:
            combined.update(obj.custom_event_details)
        is_conf = self._is_conference_form(combined)
        
        used_conf = decl.get_used_budget(True)
        used_normal = decl.get_used_budget(False)
        
        allocated_conf = decl.get_available_budget(True) + used_conf
        allocated_normal = decl.get_available_budget(False) + used_normal
        
        if is_conf:
            available = decl.get_available_budget(True)
            allocated = allocated_conf
            used = used_conf
        else:
            available = decl.get_available_budget(False)
            allocated = allocated_normal
            used = used_normal
            
        return {
            'is_conference': is_conf,
            'allocated': allocated,
            'used': used,
            'available': available,
            'allocated_conference': allocated_conf,
            'allocated_normal': allocated_normal,
        }

    def get_on_duty_form_schema(self, obj):
        """Return the form schema from the OD template, for dynamic label resolution in frontend/PDF."""
        if obj.on_duty_request and obj.on_duty_request.template:
            return obj.on_duty_request.template.form_schema or []
        return []

    def get_on_duty_form_data(self, obj):
        data = {}
        if obj.on_duty_request and obj.on_duty_request.form_data:
            data.update(obj.on_duty_request.form_data)
        if obj.custom_event_details:
            data.update(obj.custom_event_details)
        return data

    def get_current_approver_role(self, obj):
        step = obj.get_current_approval_step()
        return step.approver_role if step else None

    def get_workflow_progress(self, obj):
        steps = obj.get_applicable_workflow_steps()
        logs = list(obj.approval_logs.all().order_by('id'))
        
        def could_be_role(user, role_name):
            if role_name == 'HOD':
                from academics.models import DepartmentRole
                if hasattr(user, 'staff_profile'):
                    return DepartmentRole.objects.filter(staff=user.staff_profile, role__in=['HOD', 'AHOD']).exists()
                return False
            return hasattr(user, 'user_roles') and user.user_roles.filter(role__name__iexact=role_name).exists()

        result = []
        for step in steps:
            matched_log = None
            
            # 1. Try to match by the approver's actual role
            for log in logs:
                if could_be_role(log.approver, step.approver_role):
                    matched_log = log
                    break
                    
            # 2. Fallback to step_order
            if not matched_log:
                for log in logs:
                    if log.step_order == step.step_order:
                        matched_log = log
                        break

            info = {
                'step_order': step.step_order,
                'approver_role': step.approver_role,
                'is_current': step.step_order == obj.current_step and obj.status == 'pending',
                'is_completed': matched_log is not None,
                'status': None,
                'approver': None,
                'comments': None,
                'action_date': None,
            }
            if matched_log:
                info.update({
                    'status': matched_log.action,
                    'approver': ApproverSerializer(matched_log.approver).data,
                    'comments': matched_log.comments,
                    'action_date': matched_log.action_date,
                })
                logs.remove(matched_log)
                
            result.append(info)
            
        return result

    def get_full_workflow(self, obj):
        from .models import _resolve_staff_primary_role, EventAttendingApprovalWorkflow
        role = _resolve_staff_primary_role(obj.staff)
        steps = EventAttendingApprovalWorkflow.objects.filter(
            applicant_role__iexact=role
        ).order_by('step_order')
        return [
            {
                'step_order': step.step_order,
                'approver_role': step.approver_role,
                'is_active': step.is_active,
            }
            for step in steps
        ]


class EventAttendingApprovalWorkflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventAttendingApprovalWorkflow
        fields = ['id', 'applicant_role', 'step_order', 'approver_role', 'is_active']
        read_only_fields = ['id']


class StaffEventDeclarationSerializer(serializers.ModelSerializer):
    staff_id_display = serializers.SerializerMethodField()
    staff_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    designation = serializers.SerializerMethodField()
    experience_years = serializers.SerializerMethodField()
    user_id = serializers.IntegerField(source='staff.id', read_only=True)

    class Meta:
        model = StaffEventDeclaration
        fields = [
            'id', 'user_id', 'staff_id_display', 'staff_name', 'department_name', 'designation',
            'experience_years', 'normal_events_budget', 'conference_budget', 'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'staff_id_display', 'staff_name', 'department_name', 'designation', 'experience_years', 'updated_at']

    def get_staff_id_display(self, obj):
        try:
            return obj.staff.staff_profile.staff_id
        except Exception:
            return obj.staff.username

    def get_staff_name(self, obj):
        return obj.staff.get_full_name() or obj.staff.username

    def get_department_name(self, obj):
        try:
            return obj.staff.staff_profile.department.name or ''
        except Exception:
            return ''

    def get_designation(self, obj):
        try:
            return obj.staff.staff_profile.designation or ''
        except Exception:
            return ''

    def get_experience_years(self, obj):
        try:
            from django.utils import timezone
            doj = obj.staff.staff_profile.date_of_join
            if not doj:
                return 0
            today = timezone.localdate()
            diff = today - doj
            return round(diff.days / 365.25, 1)
        except Exception:
            return 0


class EventBudgetConditionSerializer(serializers.ModelSerializer):
    """Serializer for IQAC-defined event budget conditions."""

    class Meta:
        model = EventBudgetCondition
        fields = [
            'id', 'event_type', 'designation',
            'exp_from', 'exp_condition', 'exp_value',
            'amount', 'from_date', 'to_date',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

