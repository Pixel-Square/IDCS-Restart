from rest_framework import serializers
from django.db import transaction
from django.db.models import Q
from .models import (
    FeedbackForm,
    FeedbackQuestion,
    FeedbackQuestionOption,
    FeedbackResponse,
    FeedbackFormSubmission,
)
from academics.models import Department
from django.contrib.auth import get_user_model

User = get_user_model()


def get_subject_feedback_completion(feedback_form, user):
    """Return mapped-subject completion counts for a student in a subject feedback form."""
    from academics.models import StudentProfile, TeachingAssignment
    from curriculum.models import ElectiveChoice

    try:
        student_profile = StudentProfile.objects.get(user=user)
        section = student_profile.section
        if not section:
            return {'total_subjects': 0, 'responded_subjects': 0, 'all_completed': False}

        batch = section.batch
        batch_regulation = batch.regulation if batch else None
        regulation_code = getattr(batch_regulation, 'code', None)
        regulation_active_semester_id = getattr(batch_regulation, 'current_active_semester_id', None) if batch_regulation else None
        effective_semester_id = regulation_active_semester_id or section.semester_id

        all_section_tas = TeachingAssignment.objects.filter(
            section=section,
            academic_year__is_active=True,
            is_active=True,
        )

        if regulation_code:
            all_section_tas = all_section_tas.filter(
                Q(curriculum_row__regulation=regulation_code)
                | Q(elective_subject__regulation=regulation_code)
                | Q(curriculum_row__isnull=True, elective_subject__isnull=True)
            )

        if effective_semester_id:
            all_section_tas = all_section_tas.filter(
                Q(curriculum_row__semester_id=effective_semester_id)
                | Q(elective_subject__semester_id=effective_semester_id)
                | Q(section__semester_id=effective_semester_id)
            )

        all_section_tas = all_section_tas.select_related('elective_subject')

        student_elective_ids = set(
            ElectiveChoice.objects.filter(
                student=student_profile,
                academic_year__is_active=True,
                is_active=True,
            ).filter(
                Q(elective_subject__regulation=regulation_code) if regulation_code else Q()
            ).filter(
                Q(elective_subject__semester_id=effective_semester_id) if effective_semester_id else Q()
            ).values_list('elective_subject_id', flat=True)
        )

        eligible_assignment_ids = set()
        section_elective_ids = set()
        for ta in all_section_tas:
            if ta.elective_subject_id:
                section_elective_ids.add(ta.elective_subject_id)
                if ta.elective_subject_id in student_elective_ids:
                    eligible_assignment_ids.add(ta.id)
            else:
                eligible_assignment_ids.add(ta.id)

        if student_elective_ids:
            missing_elective_ids = student_elective_ids - section_elective_ids
            if missing_elective_ids:
                fallback_tas = TeachingAssignment.objects.filter(
                    academic_year__is_active=True,
                    is_active=True,
                    elective_subject_id__in=missing_elective_ids,
                )
                if regulation_code:
                    fallback_tas = fallback_tas.filter(elective_subject__regulation=regulation_code)
                if effective_semester_id:
                    fallback_tas = fallback_tas.filter(elective_subject__semester_id=effective_semester_id)
                eligible_assignment_ids.update(fallback_tas.values_list('id', flat=True))

        total_subjects = len(eligible_assignment_ids)
        responded_subjects = 0
        if total_subjects > 0:
            responded_subjects = FeedbackResponse.objects.filter(
                feedback_form=feedback_form,
                user=user,
                teaching_assignment_id__in=eligible_assignment_ids,
            ).values('teaching_assignment_id').distinct().count()

        return {
            'total_subjects': total_subjects,
            'responded_subjects': responded_subjects,
            'all_completed': total_subjects > 0 and responded_subjects >= total_subjects,
        }
    except StudentProfile.DoesNotExist:
        return {'total_subjects': 0, 'responded_subjects': 0, 'all_completed': False}
    except Exception:
        return {'total_subjects': 0, 'responded_subjects': 0, 'all_completed': False}


class FeedbackQuestionSerializer(serializers.ModelSerializer):
    """Serializer for FeedbackQuestion model."""

    class FeedbackQuestionOptionSerializer(serializers.ModelSerializer):
        class Meta:
            model = FeedbackQuestionOption
            fields = ['id', 'option_text']

    options = FeedbackQuestionOptionSerializer(many=True, required=False)
    question_type = serializers.ChoiceField(
        choices=FeedbackQuestion.QUESTION_TYPE_CHOICES,
        required=False,
    )
    
    class Meta:
        model = FeedbackQuestion
        fields = [
            'id',
            'question',
            'question_type',
            'answer_type',
            'allow_rating',
            'allow_comment',
            'order',
            'options',
        ]

    def _user_is_iqac(self, user) -> bool:
        if not user or not getattr(user, 'is_authenticated', False):
            return False

        role_names = set(
            user.roles.values_list('name', flat=True)
        ) if hasattr(user, 'roles') else set()
        role_names_upper = {str(name).upper() for name in role_names}
        if 'IQAC' in role_names_upper:
            return True

        try:
            from academics.models import RoleAssignment
            return RoleAssignment.objects.filter(user=user, role__name__iexact='IQAC').exists()
        except Exception:
            return False
        
    def validate(self, data):
        """Ensure at least one answer method is enabled."""
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None

        question_type = (data.get('question_type') or 'rating').strip()
        options = data.get('options', None)

        allow_rating = data.get('allow_rating', True)
        allow_comment = data.get('allow_comment', True)

        # Restrict advanced question types to IQAC only.
        if question_type in {'rating_radio_comment', 'radio'} and not self._user_is_iqac(user):
            raise serializers.ValidationError({
                'question_type': 'Own Type questions are allowed only for IQAC.'
            })

        # Normalize behavior by question type.
        # - rating: honor allow_rating/allow_comment
        # - text: comment only
        # - radio: radio options required; comment is optional
        # - rating_radio_comment: rating + comment + radio (options required)
        if question_type == 'text':
            allow_rating = False
            allow_comment = True
            data['allow_rating'] = False
            data['allow_comment'] = True

        if question_type == 'radio':
            allow_rating = False
            data['allow_rating'] = False
            # Do not force allow_comment here; admin controls it.
            allow_comment = data.get('allow_comment', allow_comment)
            data['allow_comment'] = allow_comment

        # Own type enforces rating + comment and requires >=2 radio options.
        if question_type == 'rating_radio_comment':
            allow_rating = True
            data['allow_rating'] = True
            allow_comment = data.get('allow_comment', allow_comment)
            data['allow_comment'] = allow_comment

        if question_type in {'radio', 'rating_radio_comment'}:
            if options is None:
                raise serializers.ValidationError({
                    'options': 'At least two options are required for radio questions.'
                })
            if not isinstance(options, list) or len(options) < 2:
                raise serializers.ValidationError({
                    'options': 'At least two options are required for radio questions.'
                })
            normalized = []
            for idx, opt in enumerate(options):
                if isinstance(opt, dict):
                    text = (opt.get('option_text') or '').strip()
                else:
                    text = ''
                if not text:
                    raise serializers.ValidationError({
                        'options': f'Option {idx + 1} cannot be empty.'
                    })
                normalized.append({'option_text': text})
            data['options'] = normalized

        data['question_type'] = question_type
        
        # Ensure the question collects *something*.
        # For radio questions, selecting an option counts even if allow_comment is False.
        if question_type != 'radio' and not allow_rating and not allow_comment:
            raise serializers.ValidationError({
                'allow_rating': 'At least one answer method (rating or comment) must be enabled.'
            })
        
        # Set answer_type for backward compatibility.
        # Note: radio / rating_radio_comment include option selection; comment is optional.
        if question_type == 'text':
            data['answer_type'] = 'TEXT'
        elif question_type == 'radio':
            data['answer_type'] = 'TEXT'
        elif question_type == 'rating_radio_comment':
            data['answer_type'] = 'BOTH'
        else:
            if allow_rating and allow_comment:
                data['answer_type'] = 'BOTH'
            elif allow_rating:
                data['answer_type'] = 'STAR'
            elif allow_comment:
                data['answer_type'] = 'TEXT'
            
        return data


class FeedbackFormSerializer(serializers.ModelSerializer):
    """Serializer for FeedbackForm with nested questions."""
    
    questions = serializers.SerializerMethodField()
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
    context_display = serializers.SerializerMethodField()
    class_context_display = serializers.SerializerMethodField()
    is_submitted = serializers.SerializerMethodField()
    
    class Meta:
        model = FeedbackForm
        fields = [
            'id', 'target_type', 'type', 'status', 'created_at', 'updated_at',
            'created_by', 'created_by_name', 'questions', 'active',
            'department',
            'common_comment_enabled',
            'year', 'semester_number', 'section_name', 'regulation_name',
            'years', 'semesters', 'sections',
            'target_display', 'context_display', 'class_context_display', 'is_submitted'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def get_questions(self, obj):
        """Return role-appropriate question payload.

        - Creator-facing flows (HOD/IQAC edit/create views): full question shape.
        - Staff/Student response flows: minimal neutral shape with no origin metadata.
        """
        request = self.context.get('request')
        questions_qs = obj.questions.all().order_by('order', 'id')

        is_creator_view = bool(request and request.user and request.user.is_authenticated and obj.created_by_id == request.user.id)
        if is_creator_view:
            return FeedbackQuestionSerializer(questions_qs, many=True).data

        payload = []
        for q in questions_qs:
            entry = {
                'question_id': q.id,
                'question_text': q.question,
                'question_type': getattr(q, 'question_type', 'rating') or 'rating',
                'allow_rating': bool(q.allow_rating),
                'allow_comment': bool(q.allow_comment),
                'rating_scale': '1-5' if q.allow_rating else None,
                'comment_required': bool(q.allow_comment),
            }
            if entry['question_type'] in {'rating_radio_comment', 'radio'}:
                entry['options'] = [
                    {'id': opt.id, 'option_text': opt.option_text}
                    for opt in q.options.all().order_by('id')
                ]
            payload.append(entry)
        return payload

    def _get_section_display_entries(self, obj):
        """Build unique and ordered section display entries: Dept - Yx - Section A."""
        from academics.models import Section, AcademicYear

        current_ay = AcademicYear.objects.filter(is_active=True).first()
        current_acad_year = None
        if current_ay:
            try:
                current_acad_year = int(str(current_ay.name).split('-')[0])
            except Exception:
                current_acad_year = None

        section_ids = []
        if obj.sections:
            section_ids.extend(list(obj.sections))
        if obj.section_id:
            section_ids.append(obj.section_id)

        if not section_ids:
            return []

        sections_qs = Section.objects.filter(id__in=section_ids).select_related(
            'semester',
            'managing_department',
            'batch__course__department',
            'batch__department'
        )

        entries = []
        seen = set()
        for sec in sections_qs:
            if sec.id in seen:
                continue
            seen.add(sec.id)

            department_obj = (
                sec.managing_department
                or (sec.batch.course.department if sec.batch and sec.batch.course_id else None)
                or (sec.batch.department if sec.batch else None)
            )
            department_label = None
            if department_obj:
                department_label = department_obj.short_name or department_obj.code or department_obj.name

            student_year = None
            if sec.batch and sec.batch.start_year and current_acad_year:
                try:
                    student_year = current_acad_year - int(sec.batch.start_year) + 1
                except Exception:
                    student_year = None

            year_text = f"Y{student_year}" if student_year else "Y?"
            dept_text = department_label or "Department"
            display_name = f"{dept_text} - {year_text} - Section {sec.name}"

            entries.append({
                'id': sec.id,
                'department_label': dept_text,
                'year': student_year if student_year else 99,
                'semester_number': sec.semester.number if sec.semester_id else None,
                'section_name': sec.name,
                'display_name': display_name,
            })

        entries.sort(key=lambda item: (item['year'], item['department_label'], item['section_name']))
        return entries

    def get_sections_display(self, obj):
        return [item['display_name'] for item in self._get_section_display_entries(obj)]

    def get_class_context_display(self, obj):
        """Build compact class targeting lines grouped by department, year and semester."""
        if obj.target_type != 'STUDENT':
            return []

        def ordinal(value):
            mapping = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}
            return mapping.get(value, str(value))

        entries = self._get_section_display_entries(obj)
        grouped = {}
        for item in entries:
            dept = item.get('department_label') or 'Department'
            year = item.get('year') if item.get('year') and item.get('year') != 99 else obj.year
            sem = item.get('semester_number')
            if sem is None:
                if obj.semesters and len(obj.semesters) > 0:
                    from academics.models import Semester
                    sem_nums = sorted(Semester.objects.filter(id__in=obj.semesters).values_list('number', flat=True))
                    sem = ', '.join(map(str, sem_nums)) if sem_nums else None
                elif obj.semester:
                    sem = obj.semester.number

            key = (str(dept), year, sem)
            grouped.setdefault(key, [])
            section_name = item.get('section_name')
            if section_name and section_name not in grouped[key]:
                grouped[key].append(section_name)

        lines = []
        for (dept, year, sem), section_names in sorted(grouped.items(), key=lambda row: (row[0][0], row[0][1] or 99, str(row[0][2] or ''))):
            year_label = f"{ordinal(year)} Year" if year else 'Year'
            sem_label = f"Sem {sem}" if sem else 'Sem'
            if section_names:
                section_label = 'Sections' if len(section_names) > 1 else 'Section'
                sections_text = ', '.join(sorted(section_names))
                lines.append(f"{dept} - {year_label} - {sem_label} - {section_label} {sections_text}")
            else:
                lines.append(f"{dept} - {year_label} - {sem_label}")

        # Backward-compatible fallback for older forms with no section mapping.
        if not lines:
            dept_obj = getattr(obj, 'department', None)
            dept = (dept_obj.short_name or dept_obj.code or dept_obj.name) if dept_obj else 'Department'

            year_label = None
            if obj.years and len(obj.years) > 0:
                year_label = ', '.join([f"{ordinal(y)} Year" for y in obj.years])
            elif obj.year:
                year_label = f"{ordinal(obj.year)} Year"

            sem_label = None
            if obj.semesters and len(obj.semesters) > 0:
                from academics.models import Semester
                sem_nums = sorted(Semester.objects.filter(id__in=obj.semesters).values_list('number', flat=True))
                if sem_nums:
                    sem_label = f"Sem {', '.join(map(str, sem_nums))}"
            elif obj.semester:
                sem_label = f"Sem {obj.semester.number}"

            base_parts = [part for part in [dept, year_label, sem_label] if part]
            if base_parts:
                lines.append(' - '.join(base_parts))

        return lines

    def get_context_display(self, obj):
        """Generate consolidated class targeting display for cards and detail headers."""
        if obj.target_type == 'STAFF':
            return 'Staff Feedback'
        if obj.target_type != 'STUDENT':
            return 'Feedback'

        class_lines = self.get_class_context_display(obj)
        if class_lines:
            return class_lines[0]

        parts = []

        year_names = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}
        if obj.years and len(obj.years) > 0:
            year_labels = [f"{year_names.get(y, str(y))} Year" for y in obj.years]
            parts.append(', '.join(year_labels))
        elif obj.year:
            parts.append(f"{year_names.get(obj.year, str(obj.year))} Year")

        sem_nums = []
        if obj.semesters and len(obj.semesters) > 0:
            from academics.models import Semester
            sem_nums = sorted(Semester.objects.filter(id__in=obj.semesters).values_list('number', flat=True))
        elif obj.semester:
            sem_nums = [obj.semester.number]

        if sem_nums:
            parts.append(f"Sem {', '.join(map(str, sem_nums))}")

        sections_display = self.get_sections_display(obj)
        if sections_display:
            parts.append(', '.join(sections_display))
        elif obj.section:
            parts.append(f"Section {obj.section.name}")

        return ' - '.join(parts) if parts else 'Student Feedback'
    
    def get_target_display(self, obj):
        """Return generic target label; detailed class context is in context_display."""
        if obj.target_type == 'STAFF':
            return 'Staff Feedback'
        if obj.target_type == 'STUDENT':
            return 'Student Feedback'
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
            try:
                tracking = FeedbackFormSubmission.objects.filter(
                    feedback_form=obj,
                    user=request.user,
                    submission_status='SUBMITTED',
                ).first()
                if tracking:
                    return True

                completion = get_subject_feedback_completion(obj, request.user)
                return completion['all_completed']
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
            'year', 'semester', 'section', 'regulation',
            'years', 'semesters', 'sections',
            'common_comment_enabled',
        ]
    
    def validate(self, data):
        """Validate mandatory fields and question payload consistency."""
        if not data.get('department'):
            raise serializers.ValidationError({'department': 'Department selection is required.'})

        if not data.get('target_type'):
            raise serializers.ValidationError({'target_type': 'Target audience is required.'})

        if not data.get('type'):
            raise serializers.ValidationError({'type': 'Feedback type is required.'})

        # Keep is_subject_based consistent with type and validate if explicitly provided.
        expected_subject_based = data.get('type') == 'SUBJECT_FEEDBACK'
        provided_subject_based = data.get('is_subject_based', None)
        if provided_subject_based is not None and provided_subject_based != expected_subject_based:
            raise serializers.ValidationError({
                'is_subject_based': 'is_subject_based must match feedback type.'
            })
        data['is_subject_based'] = expected_subject_based

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
        else:
            # Prevent duplicate section ids while preserving selection order.
            data['sections'] = list(dict.fromkeys(data['sections']))

        # Mandatory class targeting for student feedback.
        if data.get('target_type') == 'STUDENT':
            if not data.get('years'):
                raise serializers.ValidationError({'years': 'Please select at least one year.'})
            # Sections are optional: empty sections means all sections of selected year(s).

        # Common comment per subject/form: enforce mutual exclusion with question-wise comments.
        common_comment_enabled = bool(data.get('common_comment_enabled', False))
        if common_comment_enabled:
            questions = data.get('questions', []) or []
            for idx, q in enumerate(questions):
                q_type = (q.get('question_type') or 'rating').strip()
                if q_type == 'text':
                    raise serializers.ValidationError({
                        'common_comment_enabled': (
                            f'Common comment cannot be enabled with text-only questions (question {idx + 1}).'
                        )
                    })

                # Force all question-wise comments off.
                q['allow_comment'] = False
                # Preserve allow_rating as-is; ensure the question still has an answer method.
                allow_rating = bool(q.get('allow_rating', True))
                if not allow_rating and q_type not in {'radio'}:
                    raise serializers.ValidationError({
                        'questions': (
                            f'Question {idx + 1} must allow rating (or be a radio question) when common comment is enabled.'
                        )
                    })
            data['questions'] = questions
        
        return data
    
    def create(self, validated_data):
        """Create feedback form with questions in a transaction."""
        questions_data = validated_data.pop('questions')
        common_comment_enabled = bool(validated_data.get('common_comment_enabled', False))

        # Legacy DB compatibility: feedback_forms.comment_mode is NOT NULL in some deployments.
        # Keep it aligned with the common comment toggle.
        validated_data.setdefault('comment_mode', 'common' if common_comment_enabled else 'question_wise')
        
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
                allow_comment = False if common_comment_enabled else question_data.get('allow_comment', True)
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
                
                question_type = (question_data.get('question_type') or 'rating').strip()
                options = question_data.get('options', []) or []

                if question_type not in {'rating', 'text', 'radio', 'rating_radio_comment'}:
                    raise serializers.ValidationError({
                        'questions': f'Invalid question_type: {question_type}'
                    })

                if question_type == 'text':
                    allow_rating = False
                    allow_comment = False if common_comment_enabled else True
                    answer_type = 'TEXT'

                if question_type == 'radio':
                    allow_rating = False
                    # Radio requires options; question-wise comment is optional.
                    allow_comment = False if common_comment_enabled else bool(question_data.get('allow_comment', allow_comment))
                    answer_type = 'TEXT'

                if question_type in {'radio', 'rating_radio_comment'}:
                    if not isinstance(options, list) or len(options) < 2:
                        raise serializers.ValidationError({
                            'questions': 'At least two options are required for radio questions.'
                        })
                    for idx_opt, opt in enumerate(options):
                        text = ''
                        if isinstance(opt, dict):
                            text = str(opt.get('option_text', '')).strip()
                        if not text:
                            raise serializers.ValidationError({
                                'questions': f'Option {idx_opt + 1} cannot be empty.'
                            })

                if question_type == 'rating_radio_comment':
                    allow_rating = True
                    # Own Type requires rating + options; question-wise comment is optional.
                    allow_comment = False if common_comment_enabled else bool(question_data.get('allow_comment', allow_comment))
                    answer_type = 'BOTH'

                created_question = FeedbackQuestion.objects.create(
                    feedback_form=feedback_form,
                    order=question_data.get('order', idx + 1),
                    question=question_data['question'],
                    question_type=question_type,
                    answer_type=answer_type,
                    allow_rating=allow_rating,
                    allow_comment=allow_comment,
                    comment_enabled=allow_comment,
                    is_mandatory=bool(question_data.get('is_mandatory', False)),
                )

                if question_type in {'radio', 'rating_radio_comment'}:
                    for opt in options:
                        text = ''
                        if isinstance(opt, dict):
                            text = str(opt.get('option_text', '')).strip()
                        if text:
                            FeedbackQuestionOption.objects.create(
                                question=created_question,
                                option_text=text,
                            )
                else:
                    # Ensure no stray options if provided.
                    created_question.options.all().delete()
        
        return feedback_form


class FeedbackResponseSerializer(serializers.Serializer):
    """Serializer for individual feedback responses (for submission)."""
    
    question = serializers.IntegerField(required=True)
    answer_star = serializers.IntegerField(required=False, min_value=1, max_value=5)
    answer_text = serializers.CharField(required=False, allow_blank=True)
    selected_option = serializers.IntegerField(required=False, allow_null=True)


class FeedbackSubmissionSerializer(serializers.Serializer):
    """Serializer for submitting feedback responses."""
    
    feedback_form_id = serializers.IntegerField()
    responses = FeedbackResponseSerializer(many=True)
    teaching_assignment_id = serializers.IntegerField(required=False, allow_null=True)  # For subject feedback
    common_comment = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
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

        feedback_form = None
        try:
            feedback_form = FeedbackForm.objects.get(id=feedback_form_id)
        except FeedbackForm.DoesNotExist:
            raise serializers.ValidationError({'feedback_form_id': 'Feedback form not found.'})

        common_comment_enabled = bool(getattr(feedback_form, 'common_comment_enabled', False))
        common_comment_value = (data.get('common_comment') or '')
        common_comment_value = str(common_comment_value).strip()
        if common_comment_enabled:
            if feedback_form.type == 'SUBJECT_FEEDBACK':
                if not common_comment_value:
                    raise serializers.ValidationError({'common_comment': 'Overall comment is mandatory.'})
        
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
        question_ids = list(questions.values_list('id', flat=True))
        options_by_question = {}
        if question_ids:
            for row in FeedbackQuestionOption.objects.filter(question_id__in=question_ids).values('id', 'question_id'):
                options_by_question.setdefault(row['question_id'], set()).add(row['id'])

        question_dict = {
            q.id: {
                'allow_rating': q.allow_rating,
                'allow_comment': q.allow_comment,
                'answer_type': q.answer_type,  # For backward compatibility
                'question_type': getattr(q, 'question_type', 'rating') or 'rating',
                'option_ids': options_by_question.get(q.id, set()),
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
            selected_option = response.get('selected_option')

            requires_comment = bool(allow_comment) and not common_comment_enabled
            if requires_comment and (not answer_text or not str(answer_text).strip()):
                errors.append(f'Question {question_id} requires a comment')
                continue

            if question_info.get('question_type') == 'rating_radio_comment':
                # Rating + radio are mandatory. Comment is required only when question-wise comments are enabled.
                if answer_star is None:
                    errors.append(f'Question {question_id} requires a star rating (1-5)')
                    continue
                if not isinstance(answer_star, int) or answer_star < 1 or answer_star > 5:
                    errors.append(f'Question {question_id}: Star rating must be between 1 and 5')
                    continue
                if selected_option is None:
                    errors.append(f'Question {question_id} requires selecting one option')
                    continue
                try:
                    selected_option_int = int(selected_option)
                except Exception:
                    errors.append(f'Question {question_id}: Invalid selected option')
                    continue
                if selected_option_int not in (question_info.get('option_ids') or set()):
                    errors.append(f'Question {question_id}: Selected option is invalid')
                continue

            if question_info.get('question_type') == 'radio':
                # Radio is mandatory; comment is required only when question-wise comments are enabled.
                if selected_option is None:
                    errors.append(f'Question {question_id} requires selecting one option')
                    continue
                try:
                    selected_option_int = int(selected_option)
                except Exception:
                    errors.append(f'Question {question_id}: Invalid selected option')
                    continue
                if selected_option_int not in (question_info.get('option_ids') or set()):
                    errors.append(f'Question {question_id}: Selected option is invalid')
                continue
            
            # Validate based on what's allowed
            if allow_rating and not allow_comment:
                # Only rating allowed
                if answer_star is None:
                    errors.append(f'Question {question_id} requires a star rating (1-5)')
                elif not isinstance(answer_star, int) or answer_star < 1 or answer_star > 5:
                    errors.append(f'Question {question_id}: Star rating must be between 1 and 5')
            elif allow_comment and not allow_rating:
                # Only comment allowed
                pass
            elif allow_rating and allow_comment:
                # Both allowed - rating is required; comment is required only when question-wise comments are enabled.
                if answer_star is None:
                    errors.append(f'Question {question_id} requires a star rating (1-5)')
                elif not isinstance(answer_star, int) or answer_star < 1 or answer_star > 5:
                    errors.append(f'Question {question_id}: Star rating must be between 1 and 5')
        
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
        common_comment_value = (self.validated_data.get('common_comment') or '')
        common_comment_value = str(common_comment_value).strip() or None

        feedback_form = FeedbackForm.objects.get(id=feedback_form_id)
        common_comment_enabled = bool(getattr(feedback_form, 'common_comment_enabled', False))
        
        # Get teaching assignment object if provided (for subject feedback)
        teaching_assignment = None
        
        if teaching_assignment_id:
            try:
                from academics.models import TeachingAssignment
                teaching_assignment = TeachingAssignment.objects.get(id=teaching_assignment_id)
            except TeachingAssignment.DoesNotExist:
                pass
        
        # Resolve option-id -> option-text in one query (keeps export stable even if IDs change).
        selected_option_ids = []
        for response_data in responses:
            opt = response_data.get('selected_option')
            if opt is None:
                continue
            try:
                selected_option_ids.append(int(opt))
            except Exception:
                continue

        option_text_by_id = {}
        if selected_option_ids:
            option_text_by_id = dict(
                FeedbackQuestionOption.objects.filter(id__in=selected_option_ids)
                .values_list('id', 'option_text')
            )

        with transaction.atomic():
            # Create new responses
            for response_data in responses:
                selected_option_id = response_data.get('selected_option')
                selected_option_text = None
                if selected_option_id is not None:
                    try:
                        selected_option_text = option_text_by_id.get(int(selected_option_id))
                    except Exception:
                        selected_option_text = None

                FeedbackResponse.objects.create(
                    feedback_form_id=feedback_form_id,
                    user=user,
                    question_id=response_data['question'],
                    answer_star=response_data.get('answer_star'),
                    answer_text='' if common_comment_enabled else str(response_data.get('answer_text', '')).strip(),
                    common_comment=common_comment_value if common_comment_enabled else None,
                    teaching_assignment=teaching_assignment,
                    selected_option_text=selected_option_text,
                )
        
        return FeedbackForm.objects.get(id=feedback_form_id)
