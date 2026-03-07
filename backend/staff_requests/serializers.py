from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import RequestTemplate, ApprovalStep, StaffRequest, ApprovalLog

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
            'form_schema', 'allowed_roles',
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
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'full_name', 'first_name', 'last_name']
        read_only_fields = fields
    
    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class ApproverSerializer(serializers.ModelSerializer):
    """Minimal user serializer for approver info"""
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name']
        read_only_fields = fields
    
    def get_full_name(self, obj):
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
    
    class Meta:
        model = StaffRequest
        fields = [
            'id', 'applicant', 'template', 'template_id',
            'form_data', 'status', 'current_step',
            'current_approver_role', 'total_steps', 'completed_steps',
            'is_final_step', 'workflow_progress',
            'approval_logs',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'applicant', 'status', 'current_step',
            'created_at', 'updated_at'
        ]
    
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
