from rest_framework import serializers
from django.db import transaction
from .models import FeedbackForm, FeedbackQuestion, FeedbackResponse
from academics.models import Department
from django.contrib.auth import get_user_model

User = get_user_model()


class FeedbackQuestionSerializer(serializers.ModelSerializer):
    """Serializer for FeedbackQuestion model."""
    
    class Meta:
        model = FeedbackQuestion
        fields = ['id', 'question', 'answer_type', 'allow_rating', 'allow_comment', 'order']
        
    def validate(self, data):
        """Ensure at least one answer method is enabled."""
        allow_rating = data.get('allow_rating', True)
        allow_comment = data.get('allow_comment', True)
        
        # If both are provided, at least one must be True
        if not allow_rating and not allow_comment:
            raise serializers.ValidationError({
                'allow_rating': 'At least one answer method (rating or comment) must be enabled.'
            })
        
        # Set answer_type for backward compatibility
        if allow_rating and allow_comment:
            data['answer_type'] = 'BOTH'
        elif allow_rating:
            data['answer_type'] = 'STAR'
        elif allow_comment:
            data['answer_type'] = 'TEXT'
            
        return data


class FeedbackFormSerializer(serializers.ModelSerializer):
    """Serializer for FeedbackForm with nested questions."""
    
    questions = FeedbackQuestionSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    # Class information fields (legacy)
    semester_number = serializers.IntegerField(source='semester.number', read_only=True, allow_null=True)
    section_name = serializers.CharField(source='section.name', read_only=True, allow_null=True)
    regulation_name = serializers.CharField(source='regulation.name', read_only=True, allow_null=True)
    
    # Multi-class fields
    years = serializers.ListField(child=serializers.IntegerField(), required=False)
    semesters = serializers.ListField(child=serializers.IntegerField(), required=False)
    sections = serializers.ListField(child=serializers.IntegerField(), required=False)
    
    # Display label (computed)
    target_display = serializers.SerializerMethodField()
    is_submitted = serializers.SerializerMethodField()
    
    class Meta:
        model = FeedbackForm
        fields = [
            'id', 'target_type', 'type', 'status', 'created_at', 'updated_at',
            'created_by', 'created_by_name', 'questions', 'active',
            'year', 'semester_number', 'section_name', 'regulation_name', 'all_classes',
            'years', 'semesters', 'sections',
            'target_display', 'is_submitted'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']
    
    def get_target_display(self, obj):
        """Generate display label based on target type and class info."""
        if obj.target_type == 'STAFF':
            return 'Staff Feedback'
        elif obj.target_type == 'STUDENT':
            if obj.all_classes:
                return 'All Classes'
            else:
                parts = []
                
                # Check for multi-class selection
                if obj.years and len(obj.years) > 0:
                    year_names = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}
                    year_labels = [year_names.get(y, str(y)) for y in obj.years]
                    if len(year_labels) > 2:
                        parts.append(f"Years: {', '.join(year_labels)}")
                    else:
                        parts.append(', '.join([f"{y} Year" for y in year_labels]))
                elif obj.year:
                    # Fallback to legacy single year
                    year_names = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}
                    parts.append(f"{year_names.get(obj.year, str(obj.year))} Year")
                
                # Semesters
                if obj.semesters and len(obj.semesters) > 0:
                    from academics.models import Semester
                    sem_objs = Semester.objects.filter(id__in=obj.semesters).values_list('number', flat=True)
                    sem_nums = sorted(sem_objs)
                    if len(sem_nums) > 2:
                        parts.append(f"Sems: {', '.join(map(str, sem_nums))}")
                    else:
                        parts.append(', '.join([f"Sem {s}" for s in sem_nums]))
                elif obj.semester:
                    parts.append(f"Semester {obj.semester.number}")
                
                # Sections
                if obj.sections and len(obj.sections) > 0:
                    from academics.models import Section
                    sec_objs = Section.objects.filter(id__in=obj.sections).values_list('name', flat=True)
                    sec_names = sorted(set(sec_objs))
                    parts.append(f"Sections: {', '.join(sec_names)}")
                elif obj.section:
                    parts.append(f"Section {obj.section.name}")
                
                return ' – '.join(parts) if parts else 'Student Feedback'
        return 'Feedback'
    
    def get_is_submitted(self, obj):
        """Check if the current user has already submitted feedback for this form.
        
        For OPEN_FEEDBACK: Returns True if any response exists.
        For SUBJECT_FEEDBACK: Returns True only if all subjects are completed.
        """
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        
        from .models import FeedbackResponse
        
        # For OPEN_FEEDBACK, just check if any response exists
        if obj.type == 'OPEN_FEEDBACK':
            return FeedbackResponse.objects.filter(
                feedback_form=obj,
                user=request.user
            ).exists()
        
        # For SUBJECT_FEEDBACK, check if all subjects are completed
        elif obj.type == 'SUBJECT_FEEDBACK':
            # Get student's teaching assignments
            try:
                from academics.models import StudentProfile, TeachingAssignment, AcademicYear
                from curriculum.models import ElectiveChoice
                
                student_profile = StudentProfile.objects.get(user=request.user)
                section = student_profile.section
                
                if not section:
                    return False
                
                current_ay = AcademicYear.objects.filter(is_active=True).first()
                
                # Get all teaching assignments for student's section
                all_section_tas = TeachingAssignment.objects.filter(
                    section=section,
                    academic_year__is_active=True,
                    is_active=True
                )
                
                # Get student's elective choices
                student_elective_ids = set(
                    ElectiveChoice.objects.filter(
                        student=student_profile,
                        academic_year=current_ay,
                        is_active=True
                    ).values_list('elective_subject_id', flat=True)
                )
                
                # Count subjects student should complete:
                # Core subjects + student's chosen electives
                total_assignments = 0
                for ta in all_section_tas:
                    is_elective = ta.elective_subject is not None
                    if is_elective:
                        # Only count if student chose this elective
                        if ta.elective_subject.id in student_elective_ids:
                            total_assignments += 1
                    else:
                        # Core subject - always count
                        total_assignments += 1
                
                # Also check for electives taught department-wide (not in section)
                if student_elective_ids:
                    section_elective_ids = set(
                        all_section_tas.filter(elective_subject__isnull=False)
                        .values_list('elective_subject_id', flat=True)
                    )
                    missing_elective_ids = student_elective_ids - section_elective_ids
                    total_assignments += len(missing_elective_ids)
                
                print(f"[is_submitted] Total assignments for student: {total_assignments}")
                
                if total_assignments == 0:
                    # No teaching assignments, so nothing to submit
                    return False
                
                # Count unique teaching assignments the student has submitted feedback for
                completed_assignments = FeedbackResponse.objects.filter(
                    feedback_form=obj,
                    user=request.user,
                    teaching_assignment__isnull=False
                ).values('teaching_assignment_id').distinct().count()
                
                # Debug logging
                import logging
                logger = logging.getLogger(__name__)
                logger.debug(f"[is_submitted] Form #{obj.id}, User: {request.user.username}, "
                           f"Completed: {completed_assignments}/{total_assignments}")
                
                # Return True only if all subjects are completed
                return completed_assignments >= total_assignments
                
            except StudentProfile.DoesNotExist:
                return False
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"[is_submitted] Error checking submission status: {e}")
                return False
        
        return False
class FeedbackFormCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a FeedbackForm with questions."""
    
    questions = FeedbackQuestionSerializer(many=True, write_only=True)
    years = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=True)
    semesters = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=True)
    sections = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=True)
    
    class Meta:
        model = FeedbackForm
        fields = [
            'target_type', 'type', 'is_subject_based', 'department', 'status', 'questions',
            'year', 'semester', 'section', 'regulation', 'all_classes',
            'years', 'semesters', 'sections'
        ]
    
    def validate(self, data):
        """Validate that questions are provided."""
        questions = data.get('questions', [])
        if not questions:
            raise serializers.ValidationError({
                'questions': 'At least one question is required.'
            })
        
        # Ensure multi-class fields are lists (not None)
        if 'years' not in data or data['years'] is None:
            data['years'] = []
        if 'semesters' not in data or data['semesters'] is None:
            data['semesters'] = []
        if 'sections' not in data or data['sections'] is None:
            data['sections'] = []
        
        return data
    
    def create(self, validated_data):
        """Create feedback form with questions in a transaction."""
        questions_data = validated_data.pop('questions')
        
        # Auto-set is_subject_based based on type if not provided
        if 'is_subject_based' not in validated_data:
            validated_data['is_subject_based'] = (validated_data.get('type') == 'SUBJECT_FEEDBACK')
        
        with transaction.atomic():
            # Create the feedback form
            feedback_form = FeedbackForm.objects.create(**validated_data)
            
            # Create questions
            for idx, question_data in enumerate(questions_data):
                # Determine allow_rating and allow_comment from answer_type if not explicitly provided
                allow_rating = question_data.get('allow_rating', True)
                allow_comment = question_data.get('allow_comment', True)
                answer_type = question_data.get('answer_type', 'BOTH')
                
                # Backward compatibility: if answer_type is provided but allow_* fields aren't
                if answer_type == 'STAR' and 'allow_rating' not in question_data:
                    allow_rating = True
                    allow_comment = False
                elif answer_type == 'TEXT' and 'allow_comment' not in question_data:
                    allow_rating = False
                    allow_comment = True
                elif answer_type == 'BOTH':
                    # Both enabled by default
                    pass
                
                FeedbackQuestion.objects.create(
                    feedback_form=feedback_form,
                    order=question_data.get('order', idx + 1),
                    question=question_data['question'],
                    answer_type=answer_type,
                    allow_rating=allow_rating,
                    allow_comment=allow_comment
                )
        
        return feedback_form


class FeedbackResponseSerializer(serializers.Serializer):
    """Serializer for individual feedback responses (for submission)."""
    
    question = serializers.IntegerField(required=True)
    answer_star = serializers.IntegerField(required=False, min_value=1, max_value=5)
    answer_text = serializers.CharField(required=False, allow_blank=True)


class FeedbackSubmissionSerializer(serializers.Serializer):
    """Serializer for submitting feedback responses."""
    
    feedback_form_id = serializers.IntegerField()
    responses = FeedbackResponseSerializer(many=True)
    teaching_assignment_id = serializers.IntegerField(required=False, allow_null=True)  # For subject feedback
    
    def validate_feedback_form_id(self, value):
        """Validate that feedback form exists and is active."""
        try:
            form = FeedbackForm.objects.get(id=value)
            if form.status != 'ACTIVE':
                raise serializers.ValidationError('This feedback form is not active.')
            return value
        except FeedbackForm.DoesNotExist:
            raise serializers.ValidationError('Feedback form not found.')
    
    def validate(self, data):
        """Validate responses match questions and answer types."""
        feedback_form_id = data.get('feedback_form_id')
        responses = data.get('responses', [])
        
        if not responses:
            raise serializers.ValidationError({
                'responses': 'At least one response is required.'
            })
        
        # Get all questions for this form
        questions = FeedbackQuestion.objects.filter(
            feedback_form_id=feedback_form_id
        )
        
        if not questions.exists():
            raise serializers.ValidationError({
                'feedback_form_id': 'This feedback form has no questions.'
            })
        
        # Build question dict with allow_rating and allow_comment info
        question_dict = {
            q.id: {
                'allow_rating': q.allow_rating,
                'allow_comment': q.allow_comment,
                'answer_type': q.answer_type  # For backward compatibility
            } 
            for q in questions
        }
        
        # Validate each response
        errors = []
        for idx, response in enumerate(responses):
            question_id = response.get('question')
            
            if not question_id:
                errors.append(f'Response {idx + 1}: Missing question ID')
                continue
            
            if question_id not in question_dict:
                errors.append(f'Question {question_id} does not belong to this form')
                continue
            
            question_info = question_dict[question_id]
            allow_rating = question_info['allow_rating']
            allow_comment = question_info['allow_comment']
            answer_star = response.get('answer_star')
            answer_text = response.get('answer_text')
            
            # Validate based on what's allowed
            if allow_rating and not allow_comment:
                # Only rating allowed
                if answer_star is None:
                    errors.append(f'Question {question_id} requires a star rating (1-5)')
                elif not isinstance(answer_star, int) or answer_star < 1 or answer_star > 5:
                    errors.append(f'Question {question_id}: Star rating must be between 1 and 5')
            elif allow_comment and not allow_rating:
                # Only comment allowed
                if not answer_text or not str(answer_text).strip():
                    errors.append(f'Question {question_id} requires a text answer')
            elif allow_rating and allow_comment:
                # Both allowed - rating is required, comment is optional
                if answer_star is None:
                    errors.append(f'Question {question_id} requires a star rating (1-5)')
                elif not isinstance(answer_star, int) or answer_star < 1 or answer_star > 5:
                    errors.append(f'Question {question_id}: Star rating must be between 1 and 5')
                # Comment is optional, so no validation needed
        
        if errors:
            raise serializers.ValidationError({
                'responses': errors
            })
        
        return data
    
    def save(self, user):
        """Save feedback responses for the user."""
        feedback_form_id = self.validated_data['feedback_form_id']
        responses = self.validated_data['responses']
        teaching_assignment_id = self.validated_data.get('teaching_assignment_id')
        
        # Get teaching assignment object if provided (for subject feedback)
        teaching_assignment = None
        
        if teaching_assignment_id:
            try:
                from academics.models import TeachingAssignment
                teaching_assignment = TeachingAssignment.objects.get(id=teaching_assignment_id)
            except TeachingAssignment.DoesNotExist:
                pass
        
        with transaction.atomic():
            # Create new responses
            for response_data in responses:
                FeedbackResponse.objects.create(
                    feedback_form_id=feedback_form_id,
                    user=user,
                    question_id=response_data['question'],
                    answer_star=response_data.get('answer_star'),
                    answer_text=response_data.get('answer_text', ''),
                    teaching_assignment=teaching_assignment
                )
        
        return FeedbackForm.objects.get(id=feedback_form_id)
