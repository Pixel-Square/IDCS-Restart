import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)
from django.db import transaction
from django.db.models import Q, Case, When, Value, IntegerField, F, ExpressionWrapper
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone
from io import BytesIO
from openpyxl import Workbook

from .models import FeedbackForm, FeedbackQuestion, FeedbackQuestionOption, FeedbackResponse
from .serializers import (
    FeedbackFormCreateSerializer,
    FeedbackFormSerializer,
    FeedbackSubmissionSerializer,
    get_subject_feedback_completion,
)
from accounts.utils import get_user_permissions
from academics.models import StaffProfile
from .models import FeedbackFormSubmission
from academics.models import Department


def _user_is_iqac(user) -> bool:
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


def _user_has_feedback_analytics_view(user) -> bool:
    try:
        perms = get_user_permissions(user) or []
        return 'feedback.analytics_view' in {str(p).lower() for p in perms}
    except Exception:
        return False


def _user_is_hod(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False

    role_names = set(
        user.roles.values_list('name', flat=True)
    ) if hasattr(user, 'roles') else set()
    role_names_upper = {str(name).upper() for name in role_names}
    if 'HOD' in role_names_upper:
        return True

    try:
        from academics.models import DepartmentRole

        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile is None:
            staff_profile = StaffProfile.objects.filter(user=user).first()
        if staff_profile is None:
            return False

        return DepartmentRole.objects.filter(
            staff=staff_profile,
            role='HOD',
            is_active=True,
            academic_year__is_active=True,
        ).exists()
    except Exception:
        return False


def _department_has_is_active_field() -> bool:
    try:
        return any(getattr(f, 'name', None) == 'is_active' for f in Department._meta.fields)
    except Exception:
        return False


def _get_accessible_departments_for_user(user):
    """Departments visible for export filters.

    Institution-wide access:
    - IQAC role OR feedback.analytics_view permission.

    Otherwise:
    - Departments where user is active HOD (DepartmentRole).
    """
    institution_access = _user_is_iqac(user) or _user_has_feedback_analytics_view(user)

    dept_qs = Department.objects.all()
    if _department_has_is_active_field():
        dept_qs = dept_qs.filter(is_active=True)

    if institution_access:
        return dept_qs.order_by('name')

    # HOD-only access.
    try:
        from academics.models import DepartmentRole
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile is None:
            staff_profile = StaffProfile.objects.filter(user=user).first()
        if staff_profile is None:
            return dept_qs.none()

        dept_ids = DepartmentRole.objects.filter(
            staff=staff_profile,
            role='HOD',
            is_active=True,
            academic_year__is_active=True,
        ).values_list('department_id', flat=True)
        return dept_qs.filter(id__in=list(dept_ids)).order_by('name')
    except Exception:
        return dept_qs.none()


def _get_target_sections_for_department(department_id, selected_section_ids=None, years=None, active_ay=None):
    """Resolve sections for a target department from explicit sections or selected years."""
    from academics.models import Section

    base_qs = Section.objects.select_related(
        'semester',
        'managing_department',
        'batch__regulation',
        'batch__course__department',
        'batch__department'
    ).distinct()

    selected_section_ids = selected_section_ids or []
    if selected_section_ids:
        return base_qs.filter(id__in=selected_section_ids)

    if not department_id:
        return base_qs.none()

    section_filters = (
        Q(managing_department_id=department_id)
        | Q(batch__course__department_id=department_id)
        | Q(batch__department_id=department_id)
    )

    years = years or []
    if years and active_ay:
        try:
            acad_start = int(str(active_ay.name).split('-')[0])
            batch_start_years = [acad_start - int(year) + 1 for year in years]
            section_filters &= Q(batch__start_year__in=batch_start_years)
        except Exception:
            pass

    return base_qs.filter(section_filters)


def _derive_regulation_semester_context(sections):
    """Derive regulation and active-semester context from section->batch->regulation.

    Primary semester source: regulation.current_active_semester_id (if available).
    Backward-compatible fallback: section.semester_id.
    """
    from academics.models import Semester

    regulation_ids = set()
    regulation_codes = set()
    semester_ids = set()

    for sec in sections:
        reg = getattr(getattr(sec, 'batch', None), 'regulation', None)
        reg_active_semester_id = getattr(reg, 'current_active_semester_id', None) if reg else None

        if reg:
            if reg.id:
                regulation_ids.add(reg.id)
            if reg.code:
                regulation_codes.add(reg.code)

        if reg_active_semester_id:
            semester_ids.add(reg_active_semester_id)
        elif sec.semester_id:
            semester_ids.add(sec.semester_id)

    semester_number_map = {}
    if semester_ids:
        semester_number_map = {
            sem.id: sem.number for sem in Semester.objects.filter(id__in=semester_ids)
        }

    semester_numbers = sorted(set(semester_number_map.values())) if semester_number_map else []

    return {
        'regulation_ids': sorted(regulation_ids),
        'regulation_codes': sorted(regulation_codes),
        'semester_ids': sorted(semester_ids),
        'semester_numbers': semester_numbers,
    }


class CreateFeedbackFormView(APIView):
    """
    API 1: Create Feedback Form (HOD)
    POST /api/feedback/create
    
    HODs can create feedback forms with questions for their department.
    Uses active department from session for HODs with multiple departments.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            # Check if user has permission to create feedback forms
            user_permissions = get_user_permissions(request.user)
            if 'feedback.create' not in user_permissions:
                return Response({
                    'detail': 'You do not have permission to create feedback forms.'
                }, status=status.HTTP_403_FORBIDDEN)

            role_names = set(
                request.user.roles.values_list('name', flat=True)
            ) if hasattr(request.user, 'roles') else set()
            role_names_upper = {str(name).upper() for name in role_names}
            is_iqac_user = 'IQAC' in role_names_upper
            
            # Get user's staff profile to determine department
            staff_profile = None
            try:
                staff_profile = StaffProfile.objects.get(user=request.user)
            except StaffProfile.DoesNotExist:
                if not is_iqac_user:
                    return Response({
                        'detail': 'Staff profile not found.'
                    }, status=status.HTTP_400_BAD_REQUEST)
            
            # Determine active department for HOD
            from academics.models import AcademicYear, DepartmentRole, Department, Section
            
            active_ay = AcademicYear.objects.filter(is_active=True).first()
            # Student-year targeting depends on an active academic year (to resolve batch start years).
            target_type = request.data.get('target_type')
            if not active_ay and str(target_type).upper() == 'STUDENT':
                return Response({
                    'detail': 'No active academic year found.'
                }, status=status.HTTP_400_BAD_REQUEST)
            selected_department_ids = []
            
            # Check if departments array provided (multi-department selection)
            departments_payload = request.data.get('departments', [])

            if isinstance(departments_payload, str):
                departments_payload = [d.strip() for d in departments_payload.split(',') if d.strip()]
            if not isinstance(departments_payload, list):
                departments_payload = []

            all_departments_selected = bool(request.data.get('all_departments', False))
            if not all_departments_selected:
                all_departments_selected = any(str(d).strip().upper() in {'ALL', 'ALL_DEPARTMENTS'} for d in departments_payload)

            if is_iqac_user:
                if all_departments_selected or len(departments_payload) == 0:
                    selected_department_ids = list(Department.objects.values_list('id', flat=True))
                else:
                    requested_ids = []
                    for dept_id in departments_payload:
                        if str(dept_id).strip().isdigit():
                            requested_ids.append(int(dept_id))
                    requested_ids = list(dict.fromkeys(requested_ids))

                    existing_ids = set(Department.objects.filter(id__in=requested_ids).values_list('id', flat=True))
                    missing_ids = [d for d in requested_ids if d not in existing_ids]
                    if missing_ids:
                        return Response({
                            'detail': f'Invalid department id(s): {missing_ids}.'
                        }, status=status.HTTP_400_BAD_REQUEST)
                    selected_department_ids = requested_ids

                if not selected_department_ids:
                    return Response({
                        'detail': 'No departments available for IQAC targeting.'
                    }, status=status.HTTP_400_BAD_REQUEST)
            else:
                # Get HOD department roles
                department_roles = DepartmentRole.objects.select_related('department').filter(
                    staff=staff_profile,
                    role='HOD',
                    is_active=True,
                    academic_year=active_ay
                )

                departments_count = department_roles.count()

                if departments_count > 1:
                    # Multiple departments available to HOD
                    if departments_payload and len(departments_payload) > 0:
                        # HOD selected multiple departments
                        dept_ids = [dr.department.id for dr in department_roles]

                        # Verify all selected departments belong to this HOD
                        for dept_id in departments_payload:
                            if int(dept_id) not in dept_ids:
                                return Response({
                                    'detail': f'You do not have HOD access to department ID {dept_id}.'
                                }, status=status.HTTP_403_FORBIDDEN)

                        selected_department_ids = [int(d) for d in departments_payload]
                    else:
                        # No departments selected, require at least one
                        return Response({
                            'detail': 'Please select at least one department.'
                        }, status=status.HTTP_400_BAD_REQUEST)
                elif departments_count == 1:
                    # Single department - use it automatically
                    selected_department_ids = [department_roles.first().department.id]
                else:
                    # No department roles - fall back to staff profile department
                    if staff_profile and staff_profile.department:
                        selected_department_ids = [staff_profile.department.id]
                    else:
                        return Response({
                            'detail': 'No department assigned to your profile.'
                        }, status=status.HTTP_400_BAD_REQUEST)

            # Parse selected sections once and split by effective department.
            provided_section_ids = request.data.get('sections', []) or []
            if isinstance(provided_section_ids, str):
                provided_section_ids = [s.strip() for s in provided_section_ids.split(',') if s.strip()]
            provided_section_ids = [int(sid) for sid in provided_section_ids if str(sid).strip().isdigit()]
            provided_section_ids = list(dict.fromkeys(provided_section_ids))

            sections_by_department = {dept_id: [] for dept_id in selected_department_ids}
            if provided_section_ids:
                sections_qs = Section.objects.filter(id__in=provided_section_ids).select_related(
                    'managing_department',
                    'batch__course__department',
                    'batch__department'
                )
                found_ids = {sec.id for sec in sections_qs}
                missing_ids = [sid for sid in provided_section_ids if sid not in found_ids]
                if missing_ids:
                    return Response({
                        'detail': f'Invalid section id(s): {missing_ids}'
                    }, status=status.HTTP_400_BAD_REQUEST)

                invalid_sections = []
                for sec in sections_qs:
                    effective_department_id = (
                        sec.managing_department_id
                        or (sec.batch.course.department_id if sec.batch and sec.batch.course_id else None)
                        or (sec.batch.department_id if sec.batch else None)
                    )
                    if effective_department_id in sections_by_department:
                        sections_by_department[effective_department_id].append(sec.id)
                    else:
                        invalid_sections.append(sec.id)

                if invalid_sections:
                    return Response({
                        'detail': (
                            'Selected sections must belong to selected target department(s). '
                            f'Invalid section id(s): {invalid_sections}'
                        )
                    }, status=status.HTTP_400_BAD_REQUEST)
            
            # Create feedback forms for each selected department
            created_forms = []
            errors = []
            
            for dept_id in selected_department_ids:
                # Update request data with resolved class targeting and current department
                mutable_data = request.data.copy()
                mutable_data['department'] = dept_id

                selected_section_ids = sections_by_department.get(dept_id, []) if provided_section_ids else []
                mutable_data['sections'] = selected_section_ids

                # Validate that selected sections belong to this target department.
                if selected_section_ids:
                    # Map each section to its effective department.
                    sections_qs = Section.objects.filter(id__in=selected_section_ids).select_related(
                        'managing_department',
                        'batch__course__department',
                        'batch__department'
                    )

                    found_ids = {sec.id for sec in sections_qs}
                    missing_ids = [sid for sid in selected_section_ids if sid not in found_ids]
                    if missing_ids:
                        errors.append({
                            'department_id': dept_id,
                            'errors': {
                                'sections': [f'Invalid section id(s): {missing_ids}']
                            }
                        })
                        continue

                    invalid_sections = []
                    for sec in sections_qs:
                        effective_department_id = (
                            sec.managing_department_id
                            or (sec.batch.course.department_id if sec.batch and sec.batch.course_id else None)
                            or (sec.batch.department_id if sec.batch else None)
                        )
                        if effective_department_id != dept_id:
                            invalid_sections.append(sec.id)

                    if invalid_sections:
                        errors.append({
                            'department_id': dept_id,
                            'errors': {
                                'sections': [
                                    'Selected sections must belong to the same department as the feedback form. '
                                    f'Invalid section id(s) for this department: {invalid_sections}'
                                ]
                            }
                        })
                        continue

                target_sections = _get_target_sections_for_department(
                    dept_id,
                    selected_section_ids=selected_section_ids,
                    years=mutable_data.get('years', []) or [],
                    active_ay=active_ay,
                )
                context = _derive_regulation_semester_context(target_sections)
                mutable_data['semesters'] = context['semester_ids']

                # For subject feedback, keep form-level regulation only when there is exactly one.
                # Multi-regulation targeting is allowed; subject fetching uses per-section context.
                if mutable_data.get('type') == 'SUBJECT_FEEDBACK':
                    mutable_data['regulation'] = context['regulation_ids'][0] if len(context['regulation_ids']) == 1 else None
                else:
                    mutable_data['regulation'] = None
                
                serializer = FeedbackFormCreateSerializer(
                    data=mutable_data,
                    context={'request': request},
                )
                if serializer.is_valid():
                    try:
                        with transaction.atomic():
                            # Set the created_by field to current user
                            feedback_form = serializer.save(created_by=request.user)
                            created_forms.append(feedback_form)
                    except Exception as e:
                        errors.append({
                            'department_id': dept_id,
                            'errors': {
                                'non_field_errors': [str(e)]
                            }
                        })
                else:
                    errors.append({
                        'department_id': dept_id,
                        'errors': serializer.errors
                    })
            
            # Check results
            if len(created_forms) == 0:
                # All failed
                first_error = None
                if errors and isinstance(errors[0], dict):
                    error_block = errors[0].get('errors', {})
                    if isinstance(error_block, dict):
                        for _, value in error_block.items():
                            if isinstance(value, list) and value:
                                first_error = str(value[0])
                                break
                            if value:
                                first_error = str(value)
                                break

                return Response({
                    'detail': first_error or 'Validation failed while creating feedback forms.',
                    'error': first_error or 'Validation failed while creating feedback forms.',
                    'errors': errors
                }, status=status.HTTP_400_BAD_REQUEST)
            elif len(errors) > 0:
                # Partial success
                return Response({
                    'detail': f'Created {len(created_forms)} feedback form(s), but {len(errors)} failed.',
                    'created_count': len(created_forms),
                    'created_forms': [FeedbackFormSerializer(form).data for form in created_forms],
                    'errors': errors
                }, status=status.HTTP_207_MULTI_STATUS)
            else:
                # Full success
                return Response({
                    'detail': f'Successfully created {len(created_forms)} feedback form(s).',
                    'created_count': len(created_forms),
                    'created_forms': [FeedbackFormSerializer(form).data for form in created_forms]
                }, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            # Catch any unexpected errors and return JSON
            return Response({
                'detail': f'An error occurred while creating the feedback form: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GetFeedbackFormsView(APIView):
    """
    API 2: Get Forms
    GET /api/feedback/forms
    
    Returns feedback forms based on user's role:
    - HOD: Forms they created in their department
    - STAFF/STUDENT: Active forms targeted to them in their department
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Check if user has permission to view feedback page
        user_permissions = get_user_permissions(request.user)
        if 'feedback.feedback_page' not in user_permissions:
            return Response({
                'detail': 'You do not have permission to view feedback forms.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        user = request.user
        
        # Check if user is HOD (has CREATE permission)
        is_hod = 'feedback.create' in user_permissions
        
        if is_hod:
            # HOD: Return forms they created, sorted by status priority
            # Priority: Active & active=True (0) -> Draft (1) -> Deactivated (2) -> Closed (3)
            forms = FeedbackForm.objects.filter(
                created_by=user
            ).annotate(
                status_priority=Case(
                    # Active forms that are actually active (not deactivated)
                    When(status='ACTIVE', active=True, then=Value(0)),
                    # Draft forms
                    When(status='DRAFT', then=Value(1)),
                    # Deactivated forms (active=False)
                    When(status='ACTIVE', active=False, then=Value(2)),
                    # Closed forms
                    When(status='CLOSED', then=Value(3)),
                    default=Value(4),
                    output_field=IntegerField()
                )
            ).order_by('status_priority', '-created_at')
        else:
            # STAFF/STUDENT: Return active forms for their role and department
            try:
                # Try to get staff profile first
                staff_profile = StaffProfile.objects.get(user=user)
                department_id = staff_profile.department_id
                target_type = 'STAFF'
                
                # For staff: filter by target_type and department (only active forms)
                forms = FeedbackForm.objects.filter(
                    department_id=department_id,
                    target_type=target_type,
                    status='ACTIVE',
                    active=True  # Only show active forms to staff
                ).order_by('-created_at')
                
            except StaffProfile.DoesNotExist:
                # Try student profile
                try:
                    from academics.models import StudentProfile
                    student_profile = StudentProfile.objects.get(user=user)
                    section = student_profile.section
                    
                    # Get student's year, semester, section
                    batch = section.batch
                    student_year = None
                    student_semester = section.semester
                    student_section = section
                    
                    # Calculate year from batch
                    if batch.start_year:
                        from academics.models import AcademicYear
                        current_ay = AcademicYear.objects.filter(is_active=True).first()
                        if current_ay:
                            try:
                                acad_start = int(str(current_ay.name).split('-')[0])
                                delta = acad_start - int(batch.start_year)
                                student_year = delta + 1
                            except:
                                pass
                    
                    # Get department from section -> batch -> course -> department
                    department_id = batch.course.department_id if batch.course else batch.department_id
                    
                    # For students: filter by target_type, department, and class info
                    # Include forms where year matches AND section matches
                    from django.db.models import Q
                    
                    # Build query filters
                    base_filter = Q(
                        department_id=department_id,
                        target_type='STUDENT',
                        status='ACTIVE',
                        active=True  # Only show active forms to students
                    )
                    
                    # Specific class filter - check both multi-class and legacy fields
                    class_filter = Q()
                    
                    # Year matching: check if student's year is in the years list OR matches legacy year field
                    if student_year:
                        year_filter = (
                            Q(years__contains=[student_year]) |  # Multi-class: year in list
                            Q(year=student_year) |  # Legacy: single year
                            Q(years=[]) & Q(year__isnull=True)  # Empty/null = all years
                        )
                        class_filter &= year_filter
                    
                    # Semester matching: check if student's semester is in semesters list OR matches legacy semester
                    if student_semester:
                        semester_filter = (
                            Q(semesters__contains=[student_semester.id]) |  # Multi-class
                            Q(semester=student_semester) |  # Legacy
                            Q(semesters=[]) & Q(semester__isnull=True)  # Empty/null = all semesters
                        )
                        class_filter &= semester_filter
                    
                    # Section matching: check if student's section is in sections list OR matches legacy section
                    if student_section:
                        section_filter = (
                            Q(sections__contains=[student_section.id]) |  # Multi-class
                            Q(section=student_section) |  # Legacy
                            Q(sections=[]) & Q(section__isnull=True)  # Empty/null = all sections
                        )
                        class_filter &= section_filter
                    
                    # Combine filters - only use class_filter, no more all_classes option
                    filters = base_filter & class_filter
                    
                    forms = FeedbackForm.objects.filter(filters).order_by('-created_at')
                    
                except Exception as e:
                    return Response({
                        'detail': 'Profile not found or invalid.'
                    }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = FeedbackFormSerializer(forms, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class SubmitFeedbackView(APIView):
    """
    API 3: Submit Feedback
    POST /api/feedback/submit
    
    Staff and students submit answers to feedback forms.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        # Check if user has permission to reply to feedback
        user_permissions = get_user_permissions(request.user)
        if 'feedback.reply' not in user_permissions:
            return Response({
                'detail': 'You do not have permission to submit feedback.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        serializer = FeedbackSubmissionSerializer(data=request.data)
        if serializer.is_valid():
            feedback_form_id = serializer.validated_data['feedback_form_id']
            teaching_assignment_id = serializer.validated_data.get('teaching_assignment_id')
            
            # Get the feedback form to check type
            feedback_form = get_object_or_404(FeedbackForm, id=feedback_form_id)
            
            # Check for duplicate submission
            if feedback_form.type == 'SUBJECT_FEEDBACK':
                # For subject feedback: check if user has already submitted for this subject
                if not teaching_assignment_id:
                    return Response({
                        'detail': 'Teaching assignment ID is required for subject feedback.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                # Subject-level completion tracking requires real mapped teaching assignments only.
                if teaching_assignment_id < 0:
                    return Response({
                        'detail': 'Subject mapping not found. Please contact your HOD to map this subject before submitting feedback.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                existing_response = FeedbackResponse.objects.filter(
                    feedback_form_id=feedback_form_id,
                    user=request.user,
                    teaching_assignment_id=teaching_assignment_id
                ).exists()

                if existing_response:
                    return Response({
                        'detail': 'Feedback already submitted'
                    }, status=status.HTTP_400_BAD_REQUEST)
            else:
                # For open feedback: check if user has submitted for this form
                existing_response = FeedbackResponse.objects.filter(
                    feedback_form_id=feedback_form_id,
                    user=request.user,
                    teaching_assignment__isnull=True
                ).exists()
                
                if existing_response:
                    return Response({
                        'detail': 'Feedback already submitted'
                    }, status=status.HTTP_400_BAD_REQUEST)
            
            # Save responses
            try:
                feedback_form = serializer.save(user=request.user)

                if feedback_form.type == 'SUBJECT_FEEDBACK':
                    completion = get_subject_feedback_completion(feedback_form, request.user)
                    total_subjects = completion['total_subjects']
                    responded_subjects = completion['responded_subjects']
                    all_completed = completion['all_completed']

                    status_value = 'SUBMITTED' if all_completed else 'PENDING'
                    submitted_at = timezone.now() if all_completed else None

                    FeedbackFormSubmission.objects.update_or_create(
                        feedback_form=feedback_form,
                        user=request.user,
                        defaults={
                            'submission_status': status_value,
                            'total_subjects': total_subjects,
                            'responded_subjects': responded_subjects,
                            'submitted_at': submitted_at,
                        }
                    )

                    if all_completed:
                        return Response({
                            'message': 'Feedback Submitted Successfully',
                            'submission_status': 'SUBMITTED',
                            'total_subjects': total_subjects,
                            'responded_subjects': responded_subjects,
                        }, status=status.HTTP_200_OK)

                    return Response({
                        'message': 'Pending – Complete all subjects',
                        'submission_status': 'PENDING',
                        'total_subjects': total_subjects,
                        'responded_subjects': responded_subjects,
                    }, status=status.HTTP_200_OK)
                
                return Response({
                    'message': 'Feedback submitted successfully'
                }, status=status.HTTP_200_OK)
            except Exception as e:
                logger.exception('[FEEDBACK SUBMIT] Error saving responses')
                return Response({
                    'detail': 'Error saving feedback. Please try again.'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        
        # Format validation errors for better frontend display
        error_messages = []
        for field, errors in serializer.errors.items():
            if isinstance(errors, list):
                for error in errors:
                    if isinstance(error, str):
                        error_messages.append(error)
                    elif isinstance(error, dict):
                        error_messages.extend(error.values())
            else:
                error_messages.append(str(errors))
        
        return Response({
            'detail': error_messages[0] if error_messages else 'Invalid feedback data',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class GetUserDepartmentView(APIView):
    """
    API 4: Get User's Department(s) for HOD
    GET /api/feedback/department/
    
    Returns the department(s) for HOD users based on DepartmentRole.
    - If HOD has one department: returns single department (no switch needed)
    - If HOD has multiple departments: returns all departments (enable switch)
    - Supports active_department_id parameter to set active department in session
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        role_names = set(
            user.roles.values_list('name', flat=True)
        ) if hasattr(user, 'roles') else set()
        role_names_upper = {str(name).upper() for name in role_names}
        is_iqac_user = 'IQAC' in role_names_upper
        
        # Check if user has HOD create permission
        user_permissions = get_user_permissions(user)
        can_create_feedback = 'feedback.create' in user_permissions

        if can_create_feedback and is_iqac_user:
            try:
                from academics.models import Department

                departments_qs = Department.objects.all().order_by('name', 'code')
                departments = [{
                    'id': dept.id,
                    'name': dept.name,
                    'code': dept.code,
                } for dept in departments_qs]

                if not departments:
                    return Response({
                        'success': False,
                        'department': None,
                    }, status=status.HTTP_200_OK)

                active_department_id = request.GET.get('active_department_id')
                active_department = departments[0]
                if active_department_id and str(active_department_id).isdigit():
                    active_department = next(
                        (d for d in departments if d['id'] == int(active_department_id)),
                        departments[0],
                    )

                return Response({
                    'success': True,
                    'has_multiple_departments': len(departments) > 1,
                    'departments': departments,
                    'active_department': active_department,
                }, status=status.HTTP_200_OK)
            except Exception as e:
                return Response({
                    'detail': f'Error retrieving departments: {str(e)}'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        if not can_create_feedback:
            # For non-HOD users, return single department from staff profile
            try:
                staff_profile = StaffProfile.objects.get(user=user)
                if staff_profile.department:
                    return Response({
                        'success': True,
                        'has_multiple_departments': False,
                        'departments': [{
                            'id': staff_profile.department.id,
                            'name': staff_profile.department.name,
                            'code': staff_profile.department.code
                        }],
                        'active_department': {
                            'id': staff_profile.department.id,
                            'name': staff_profile.department.name,
                            'code': staff_profile.department.code
                        }
                    }, status=status.HTTP_200_OK)
            except StaffProfile.DoesNotExist:
                pass
            
            return Response({
                'success': False,
                'department': None
            }, status=status.HTTP_200_OK)
        
        # For HOD: Get departments from DepartmentRole
        try:
            from academics.models import DepartmentRole, AcademicYear, StaffProfile
            
            # Get staff profile
            staff_profile = StaffProfile.objects.get(user=user)
            
            # Get active academic year
            active_ay = AcademicYear.objects.filter(is_active=True).first()
            if not active_ay:
                return Response({
                    'detail': 'No active academic year found.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get HOD department roles for current academic year
            department_roles = DepartmentRole.objects.select_related('department').filter(
                staff=staff_profile,
                role='HOD',
                is_active=True,
                academic_year=active_ay
            ).order_by('department__name')
            
            departments_count = department_roles.count()
            
            if departments_count == 0:
                # Fall back to staff profile department
                if staff_profile.department:
                    return Response({
                        'success': True,
                        'has_multiple_departments': False,
                        'departments': [{
                            'id': staff_profile.department.id,
                            'name': staff_profile.department.name,
                            'code': staff_profile.department.code
                        }],
                        'active_department': {
                            'id': staff_profile.department.id,
                            'name': staff_profile.department.name,
                            'code': staff_profile.department.code
                        }
                    }, status=status.HTTP_200_OK)
                else:
                    return Response({
                        'success': False,
                        'department': None
                    }, status=status.HTTP_200_OK)
            
            # Build departments list
            departments = [{
                'id': dr.department.id,
                'name': dr.department.name,
                'code': dr.department.code
            } for dr in department_roles]
            
            # Handle active department selection
            active_department_id = request.GET.get('active_department_id')
            if active_department_id:
                try:
                    active_department_id = int(active_department_id)
                    # Verify this department belongs to the HOD
                    active_dept = next((d for d in departments if d['id'] == active_department_id), None)
                    if active_dept:
                        # Store in session
                        request.session['active_hod_department_id'] = active_department_id
                        active_department = active_dept
                    else:
                        # Invalid department ID, use first one
                        active_department = departments[0]
                        request.session['active_hod_department_id'] = departments[0]['id']
                except ValueError:
                    active_department = departments[0]
                    request.session['active_hod_department_id'] = departments[0]['id']
            else:
                # Check session for previously selected department
                session_dept_id = request.session.get('active_hod_department_id')
                if session_dept_id:
                    active_dept = next((d for d in departments if d['id'] == session_dept_id), None)
                    if active_dept:
                        active_department = active_dept
                    else:
                        # Session dept not found, use first
                        active_department = departments[0]
                        request.session['active_hod_department_id'] = departments[0]['id']
                else:
                    # No session, use first department
                    active_department = departments[0]
                    request.session['active_hod_department_id'] = departments[0]['id']
            
            return Response({
                'success': True,
                'has_multiple_departments': departments_count > 1,
                'departments': departments,
                'active_department': active_department
            }, status=status.HTTP_200_OK)
            
        except StaffProfile.DoesNotExist:
            return Response({
                'success': False,
                'department': None
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'detail': f'Error retrieving departments: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GetClassOptionsView(APIView):
    """
    API 5: Get Class Options
    GET /api/feedback/class-options/
    
    Returns available years, semesters, and sections with year-section mappings.
    Used to populate dropdowns when creating feedback forms.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            from academics.models import Semester, Section, AcademicYear, Department

            role_names = set(
                request.user.roles.values_list('name', flat=True)
            ) if hasattr(request.user, 'roles') else set()
            role_names_upper = {str(name).upper() for name in role_names}
            is_iqac_user = 'IQAC' in role_names_upper

            # Optional years filter from UI (supports years[]=2&years[]=3 or years=2,3)
            selected_years = request.GET.getlist('years[]')
            if not selected_years:
                years_param = request.GET.get('years')
                if years_param:
                    selected_years = [y.strip() for y in years_param.split(',') if y.strip()]
            selected_years = {int(y) for y in selected_years if str(y).isdigit()}
            
            # Get distinct years (2-4 only, excluding 1st year from subject feedback)
            years = [
                {"value": 2, "label": "2nd Year"},
                {"value": 3, "label": "3rd Year"},
                {"value": 4, "label": "4th Year"}
            ]
            
            # Get all semesters from database
            semesters_qs = Semester.objects.all().order_by('number')
            semesters = [
                {"value": sem.id, "label": f"Semester {sem.number}", "number": sem.number}
                for sem in semesters_qs
            ]
            
            # Get sections that belong to HOD's active department(s)
            sections_filter = {}
            user_departments = []
            
            # Check if departments parameter is provided (for multi-select case)
            departments_param = request.GET.getlist('departments[]')
            if not departments_param:
                departments_param = request.GET.get('departments', '').split(',') if request.GET.get('departments') else []
            
            try:
                if is_iqac_user:
                    dept_ids_param = []
                    all_departments = False
                    for dept_id_str in departments_param:
                        value = str(dept_id_str).strip()
                        if not value:
                            continue
                        if value.upper() in {'ALL', 'ALL_DEPARTMENTS'}:
                            all_departments = True
                            break
                        if value.isdigit():
                            dept_ids_param.append(int(value))

                    if all_departments or not dept_ids_param:
                        user_departments = list(Department.objects.all())
                    else:
                        user_departments = list(Department.objects.filter(id__in=dept_ids_param))
                else:
                    staff_profile = StaffProfile.objects.get(user=request.user)

                    # For HODs with multiple departments, use provided departments or session
                    from academics.models import DepartmentRole

                    active_ay = AcademicYear.objects.filter(is_active=True).first()
                    if active_ay:
                        department_roles = DepartmentRole.objects.select_related('department').filter(
                            staff=staff_profile,
                            role='HOD',
                            is_active=True,
                            academic_year=active_ay
                        )

                        departments_count = department_roles.count()

                        if departments_count > 1 and departments_param:
                            # Multiple departments and departments specified - validate and use them
                            available_dept_ids = [dr.department.id for dr in department_roles]
                            for dept_id_str in departments_param:
                                if dept_id_str:  # Skip empty strings
                                    dept_id = int(dept_id_str)
                                    if dept_id in available_dept_ids:
                                        try:
                                            dept = Department.objects.get(id=dept_id)
                                            user_departments.append(dept)
                                        except Department.DoesNotExist:
                                            pass
                        elif departments_count > 1:
                            # Multiple departments but no param - use all departments
                            user_departments = [dr.department for dr in department_roles]
                        elif departments_count == 1:
                            # Single department
                            user_departments = [department_roles.first().department]
                        else:
                            # No department roles, fall back to staff profile
                            if staff_profile.department:
                                user_departments = [staff_profile.department]
                    else:
                        # No active AY, fall back to staff profile
                        if staff_profile.department:
                            user_departments = [staff_profile.department]
                
                if user_departments:
                    # Filter sections by selected departments (supports course-based,
                    # direct department batches, and managing department overrides).
                    department_ids = [dept.id for dept in user_departments]
                    sections_filter['department_ids'] = department_ids
            except StaffProfile.DoesNotExist:
                pass
            
            # Get current academic year to calculate student years
            current_ay = AcademicYear.objects.filter(is_active=True).first()
            current_acad_year = None
            if current_ay:
                try:
                    current_acad_year = int(str(current_ay.name).split('-')[0])
                except:
                    pass
            
            # Build year-section mappings (2-4 only)
            year_sections = {2: [], 3: [], 4: []}
            sections_all = []
            seen_section_ids = set()
            
            sections_qs = Section.objects.select_related(
                'managing_department',
                'batch__course__department',
                'batch__department'
            ).order_by('name')

            department_ids = sections_filter.get('department_ids')
            if department_ids:
                sections_qs = sections_qs.filter(
                    Q(managing_department_id__in=department_ids)
                    | Q(batch__course__department_id__in=department_ids)
                    | Q(batch__department_id__in=department_ids)
                )
            
            for sec in sections_qs:
                if sec.id in seen_section_ids:
                    continue
                    
                seen_section_ids.add(sec.id)
                
                # Calculate year from batch
                student_year = None
                batch = sec.batch
                if batch and batch.start_year and current_acad_year:
                    delta = current_acad_year - int(batch.start_year)
                    student_year = delta + 1
                    # Targeting supports years 2-4 only.
                    if student_year < 2 or student_year > 4:
                        continue  # Skip 1st year and invalid years

                # If UI requested specific years, only include matching ones.
                if selected_years and student_year not in selected_years:
                    continue
                
                department_obj = (
                    sec.managing_department
                    or (sec.batch.course.department if sec.batch and sec.batch.course_id else None)
                    or (sec.batch.department if sec.batch else None)
                )
                department_label = None
                if department_obj:
                    department_label = department_obj.short_name or department_obj.code or department_obj.name

                section_data = {
                    "value": sec.id,
                    "label": f"Section {sec.name}",
                    "display_name": (
                        f"{department_label or 'Department'} - Y{student_year} - Section {sec.name}"
                        if student_year else f"{department_label or 'Department'} - Section {sec.name}"
                    ),
                    "name": sec.name,
                    "department_id": department_obj.id if department_obj else None,
                    "department_label": department_label,
                    "year": student_year
                }
                
                sections_all.append(section_data)
                
                # Add to year mapping
                if student_year and student_year in year_sections:
                    year_sections[student_year].append(section_data)

            # Enforce deterministic ordering: Year -> Department -> Section.
            def section_sort_key(item):
                year_key = item.get('year') if item.get('year') is not None else 99
                dept_key = item.get('department_label') or ''
                section_key = item.get('name') or ''
                return (year_key, dept_key, section_key)

            sections_all.sort(key=section_sort_key)
            for year_key in year_sections.keys():
                year_sections[year_key].sort(key=section_sort_key)
            
            return Response({
                'years': years,
                'semesters': semesters,
                'sections': sections_all,
                'year_sections': year_sections,  # NEW: Year to sections mapping
                'success': True
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Failed to fetch class options: {str(e)}',
                'success': False
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DeactivateFeedbackFormView(APIView):
    """
    API 6: Deactivate/Activate Feedback Form
    POST /api/feedback/<id>/toggle-active
    
    HOD can toggle the active status of a feedback form.
    When deactivated, form is hidden from students/staff but data is preserved.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request, form_id):
        # Check if user has permission to create feedback (HOD only)
        user_permissions = get_user_permissions(request.user)
        if 'feedback.create' not in user_permissions:
            return Response({
                'detail': 'You do not have permission to deactivate feedback forms.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get the feedback form
        feedback_form = get_object_or_404(FeedbackForm, id=form_id)
        
        # Ensure the form was created by the current user
        if feedback_form.created_by != request.user:
            return Response({
                'detail': 'You can only deactivate forms you created.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Toggle active status
        feedback_form.active = not feedback_form.active
        feedback_form.save()
        
        return Response({
            'message': f'Feedback form {"activated" if feedback_form.active else "deactivated"} successfully',
            'active': feedback_form.active
        }, status=status.HTTP_200_OK)


class PublishFeedbackFormView(APIView):
    """
    API: Publish Feedback Form
    POST /api/feedback/<id>/publish
    
    HOD can publish a draft feedback form, changing status from DRAFT to ACTIVE.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request, form_id):
        # Check if user has permission to create feedback (HOD only)
        user_permissions = get_user_permissions(request.user)
        if 'feedback.create' not in user_permissions:
            return Response({
                'detail': 'You do not have permission to publish feedback forms.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get the feedback form
        feedback_form = get_object_or_404(FeedbackForm, id=form_id)
        
        # Ensure the form was created by the current user
        if feedback_form.created_by != request.user:
            return Response({
                'detail': 'You can only publish forms you created.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Check if already published
        if feedback_form.status == 'ACTIVE':
            return Response({
                'detail': 'This form is already published.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Publish the form (change status to ACTIVE)
        feedback_form.status = 'ACTIVE'
        feedback_form.save()
        
        return Response({
            'message': 'Feedback form published successfully',
            'status': feedback_form.status
        }, status=status.HTTP_200_OK)


class UpdateFeedbackFormView(APIView):
    """
    API: Update Draft Feedback Form
    PUT /api/feedback/<id>/update/

    Allows HOD to edit only draft forms. Published forms cannot be edited.
    """
    permission_classes = [IsAuthenticated]

    def put(self, request, form_id):
        user_permissions = get_user_permissions(request.user)
        if 'feedback.create' not in user_permissions:
            return Response({
                'detail': 'You do not have permission to edit feedback forms.'
            }, status=status.HTTP_403_FORBIDDEN)

        feedback_form = get_object_or_404(FeedbackForm, id=form_id)

        if feedback_form.created_by != request.user:
            return Response({
                'detail': 'You can only edit forms you created.'
            }, status=status.HTTP_403_FORBIDDEN)

        if feedback_form.status != 'DRAFT':
            return Response({
                'error': 'Published forms cannot be edited'
            }, status=status.HTTP_400_BAD_REQUEST)

        incoming_questions = request.data.get('questions', [])
        if not isinstance(incoming_questions, list) or len(incoming_questions) == 0:
            return Response({
                'error': 'At least one question is required.'
            }, status=status.HTTP_400_BAD_REQUEST)

        def _user_is_iqac(user) -> bool:
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

        is_iqac_user = _user_is_iqac(request.user)

        allowed_question_types = {'rating', 'text', 'radio', 'rating_radio_comment'}

        # Keep update behavior aligned with creation behavior using section->regulation semester context.
        from academics.models import AcademicYear, Section

        mutable_data = request.data.copy()
        years_payload = mutable_data.get('years', []) or []
        active_ay = AcademicYear.objects.filter(is_active=True).first()

        selected_section_ids = mutable_data.get('sections', []) or []
        if selected_section_ids:
            sections_qs = Section.objects.filter(id__in=selected_section_ids).select_related(
                'managing_department',
                'batch__course__department',
                'batch__department',
                'batch__regulation'
            )

            found_ids = {sec.id for sec in sections_qs}
            missing_ids = [sid for sid in selected_section_ids if sid not in found_ids]
            if missing_ids:
                return Response({
                    'error': f'Invalid section id(s): {missing_ids}'
                }, status=status.HTTP_400_BAD_REQUEST)

            invalid_sections = []
            for sec in sections_qs:
                effective_department_id = (
                    sec.managing_department_id
                    or (sec.batch.course.department_id if sec.batch and sec.batch.course_id else None)
                    or (sec.batch.department_id if sec.batch else None)
                )
                if effective_department_id != feedback_form.department_id:
                    invalid_sections.append(sec.id)

            if invalid_sections:
                return Response({
                    'error': (
                        'Selected sections must belong to the same department as the feedback form. '
                        f'Invalid section id(s): {invalid_sections}'
                    )
                }, status=status.HTTP_400_BAD_REQUEST)

        target_sections = _get_target_sections_for_department(
            feedback_form.department_id,
            selected_section_ids=selected_section_ids,
            years=years_payload,
            active_ay=active_ay,
        )
        context = _derive_regulation_semester_context(target_sections)
        mutable_data['semesters'] = context['semester_ids']

        if mutable_data.get('type') == 'SUBJECT_FEEDBACK':
            mutable_data['regulation'] = context['regulation_ids'][0] if len(context['regulation_ids']) == 1 else None
        else:
            mutable_data['regulation'] = None

        with transaction.atomic():
            # Update draft form metadata / targeting details
            feedback_form.target_type = mutable_data.get('target_type', feedback_form.target_type)
            feedback_form.type = mutable_data.get('type', feedback_form.type)
            feedback_form.is_subject_based = feedback_form.type == 'SUBJECT_FEEDBACK'
            feedback_form.year = mutable_data.get('year')
            feedback_form.semester_id = mutable_data.get('semester')
            feedback_form.section_id = mutable_data.get('section')
            feedback_form.regulation_id = mutable_data.get('regulation')
            feedback_form.years = mutable_data.get('years', []) or []
            feedback_form.semesters = mutable_data.get('semesters', []) or []
            feedback_form.sections = list(dict.fromkeys(mutable_data.get('sections', []) or []))

            requested_status = mutable_data.get('status', 'DRAFT')
            feedback_form.status = requested_status if requested_status in ['DRAFT', 'ACTIVE'] else 'DRAFT'
            feedback_form.save()

            existing_questions = {
                q.id: q for q in FeedbackQuestion.objects.filter(feedback_form=feedback_form)
            }
            kept_question_ids = set()

            for idx, q in enumerate(incoming_questions):
                question_text = (q.get('question') or '').strip()
                if not question_text:
                    return Response({
                        'error': f'Question {idx + 1} cannot be empty.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                question_type = str(q.get('question_type') or 'rating').strip() or 'rating'
                if question_type not in allowed_question_types:
                    return Response({
                        'error': f'Question {idx + 1}: Invalid question_type: {question_type}'
                    }, status=status.HTTP_400_BAD_REQUEST)
                incoming_options = q.get('options', None)

                if question_type in {'rating_radio_comment', 'radio'} and not is_iqac_user:
                    return Response({
                        'error': f'Question {idx + 1}: Own Type questions are allowed only for IQAC.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                if question_type == 'rating_radio_comment':
                    # Force both enabled for this type.
                    allow_rating = True
                    allow_comment = True
                elif question_type == 'radio':
                    # Force comment-only + radio.
                    allow_rating = False
                    allow_comment = True
                elif question_type == 'text':
                    allow_rating = False
                    allow_comment = True
                else:
                    allow_rating = q.get('allow_rating', True)
                    allow_comment = q.get('allow_comment', True)
                if not allow_rating and not allow_comment:
                    return Response({
                        'error': f'Question {idx + 1} must allow rating or comment.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                if question_type in {'rating_radio_comment', 'radio'}:
                    if incoming_options is None:
                        return Response({
                            'error': f'Question {idx + 1}: At least two options are required for Own Type questions.'
                        }, status=status.HTTP_400_BAD_REQUEST)
                    if not isinstance(incoming_options, list) or len(incoming_options) < 2:
                        return Response({
                            'error': f'Question {idx + 1}: At least two options are required for Own Type questions.'
                        }, status=status.HTTP_400_BAD_REQUEST)
                    for opt_idx, opt in enumerate(incoming_options):
                        text = (opt.get('option_text') if isinstance(opt, dict) else '')
                        if not text or not str(text).strip():
                            return Response({
                                'error': f'Question {idx + 1}: Option {opt_idx + 1} cannot be empty.'
                            }, status=status.HTTP_400_BAD_REQUEST)

                if allow_rating and allow_comment:
                    answer_type = 'BOTH'
                elif allow_rating:
                    answer_type = 'STAR'
                else:
                    answer_type = 'TEXT'

                incoming_id = q.get('id')
                if incoming_id:
                    try:
                        incoming_id = int(incoming_id)
                    except Exception:
                        return Response({
                            'error': f'Invalid question id: {incoming_id}'
                        }, status=status.HTTP_400_BAD_REQUEST)

                    if incoming_id not in existing_questions:
                        return Response({
                            'error': f'Question id {incoming_id} does not belong to this form.'
                        }, status=status.HTTP_400_BAD_REQUEST)

                    FeedbackQuestion.objects.filter(id=incoming_id, feedback_form=feedback_form).update(
                        question=question_text,
                        allow_rating=allow_rating,
                        allow_comment=allow_comment,
                        comment_enabled=allow_comment,
                        answer_type=answer_type,
                        question_type=question_type,
                        order=q.get('order', idx + 1)
                    )

                    # Replace options for own-type questions.
                    existing_q = existing_questions[incoming_id]
                    if question_type in {'rating_radio_comment', 'radio'}:
                        existing_q.options.all().delete()
                        for opt in (incoming_options or []):
                            FeedbackQuestionOption.objects.create(
                                question_id=incoming_id,
                                option_text=str(opt.get('option_text', '')).strip(),
                            )
                    else:
                        existing_q.options.all().delete()
                    kept_question_ids.add(incoming_id)
                else:
                    created = FeedbackQuestion.objects.create(
                        feedback_form=feedback_form,
                        question=question_text,
                        allow_rating=allow_rating,
                        allow_comment=allow_comment,
                        comment_enabled=allow_comment,
                        answer_type=answer_type,
                        question_type=question_type,
                        order=q.get('order', idx + 1)
                    )
                    if question_type in {'rating_radio_comment', 'radio'}:
                        for opt in (incoming_options or []):
                            FeedbackQuestionOption.objects.create(
                                question=created,
                                option_text=str(opt.get('option_text', '')).strip(),
                            )
                    kept_question_ids.add(created.id)

            to_delete_ids = [qid for qid in existing_questions.keys() if qid not in kept_question_ids]
            if to_delete_ids:
                answered_ids = list(
                    FeedbackQuestion.objects.filter(id__in=to_delete_ids, responses__isnull=False)
                    .values_list('id', flat=True)
                    .distinct()
                )
                if answered_ids:
                    return Response({
                        'error': (
                            'Cannot delete questions that already have responses. '
                            f'Protected question ids: {answered_ids}'
                        )
                    }, status=status.HTTP_400_BAD_REQUEST)

                FeedbackQuestion.objects.filter(id__in=to_delete_ids, feedback_form=feedback_form).delete()

            if FeedbackQuestion.objects.filter(feedback_form=feedback_form).count() == 0:
                return Response({
                    'error': 'At least one question is required.'
                }, status=status.HTTP_400_BAD_REQUEST)

        serialized = FeedbackFormSerializer(feedback_form, context={'request': request}).data
        return Response({
            'detail': 'Feedback form updated successfully.',
            'form': serialized
        }, status=status.HTTP_200_OK)


class GetResponseStatisticsView(APIView):
    """
    API 7: Get Response Statistics
    GET /api/feedback/<id>/statistics
    
    HOD can view response count for a feedback form.
    Returns: total responses / expected responses (based on target audience)
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, form_id):
        # Check if user has permission to create feedback (HOD only)
        user_permissions = get_user_permissions(request.user)
        if 'feedback.create' not in user_permissions:
            return Response({
                'detail': 'You do not have permission to view response statistics.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get the feedback form
        feedback_form = get_object_or_404(FeedbackForm, id=form_id)
        
        # Ensure the form was created by the current user
        if feedback_form.created_by != request.user:
            return Response({
                'detail': 'You can only view statistics for forms you created.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get unique users who responded
        responded_users = FeedbackResponse.objects.filter(
            feedback_form=feedback_form
        ).values_list('user', flat=True).distinct()
        
        response_count = len(set(responded_users))
        
        # Calculate expected responses based on target type and class info
        expected_count = 0
        
        if feedback_form.target_type == 'STAFF':
            # Count staff in department
            expected_count = StaffProfile.objects.filter(
                department=feedback_form.department
            ).count()
        elif feedback_form.target_type == 'STUDENT':
            from academics.models import StudentProfile, Section, AcademicYear
            student_department_filter = (
                Q(section__managing_department=feedback_form.department)
                | Q(section__batch__course__department=feedback_form.department)
                | Q(section__batch__department=feedback_form.department)
            )
            
            # Students matching year/semester/section criteria
            sections_to_query = []
            
            # Get current academic year for year calculation
            current_ay = AcademicYear.objects.filter(is_active=True).first()
            current_acad_year = None
            if current_ay:
                try:
                    current_acad_year = int(str(current_ay.name).split('-')[0])
                except:
                    pass
            
            # Build list of matching sections
            if feedback_form.sections:  # Multi-class: use sections list
                sections_to_query = list(feedback_form.sections)
            elif feedback_form.section_id:  # Legacy: single section
                sections_to_query = [feedback_form.section_id]
            else:
                # No specific sections: query by year and semester
                sections_filter = Q(batch__course__department=feedback_form.department)
                
                # Filter by years
                if feedback_form.years:
                    year_filters = Q()
                    for year in feedback_form.years:
                        if current_acad_year:
                            batch_start_year = current_acad_year - year + 1
                            year_filters |= Q(batch__start_year=str(batch_start_year))
                    sections_filter &= year_filters
                elif feedback_form.year:
                    if current_acad_year:
                        batch_start_year = current_acad_year - feedback_form.year + 1
                        sections_filter &= Q(batch__start_year=str(batch_start_year))
                
                # Filter by semesters
                if feedback_form.semesters:
                    sections_filter &= Q(semester_id__in=feedback_form.semesters)
                elif feedback_form.semester_id:
                    sections_filter &= Q(semester=feedback_form.semester)
                
                matching_sections = Section.objects.filter(sections_filter)
                sections_to_query = [s.id for s in matching_sections]
            
            # Count students in matching sections
            if sections_to_query:
                expected_count = StudentProfile.objects.filter(
                    student_department_filter,
                    section_id__in=sections_to_query
                ).count()
        
        return Response({
            'feedback_form_id': form_id,
            'response_count': response_count,
            'expected_count': expected_count,
            'percentage': round((response_count / expected_count * 100) if expected_count > 0 else 0, 1)
        }, status=status.HTTP_200_OK)


class GetResponseListView(APIView):
    """
    API 8: Get Response List
    GET /api/feedback/<id>/responses
    
    HOD can view detailed response list for a feedback form.
    Shows: responded users with answers, and non-responded users.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, form_id):
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[GetResponseListView] User {request.user.id} ({request.user.username}) requesting responses for form {form_id}")
        
        # Check if user has permission to create feedback (HOD only)
        user_permissions = get_user_permissions(request.user)
        logger.info(f"[GetResponseListView] User permissions: {user_permissions}")
        
        if 'feedback.create' not in user_permissions:
            logger.warning(f"[GetResponseListView] User {request.user.username} lacks feedback.create permission")
            return Response({
                'detail': 'You do not have permission to view responses. Only HODs and advisors can view feedback responses.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get the feedback form
        try:
            feedback_form = get_object_or_404(FeedbackForm, id=form_id)
            logger.info(f"[GetResponseListView] Found feedback form {form_id}, created by user {feedback_form.created_by.id}")
        except Exception as e:
            logger.error(f"[GetResponseListView] Error finding form: {e}")
            return Response({
                'detail': f'Feedback form not found.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Ensure the form was created by the current user
        if feedback_form.created_by != request.user:
            logger.warning(f"[GetResponseListView] User {request.user.id} tried to access form created by user {feedback_form.created_by.id}")
            return Response({
                'detail': f'You can only view responses for forms you created. This form was created by {feedback_form.created_by.get_full_name() or feedback_form.created_by.username}.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get all responses for this form, grouped by user
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            logger.info(f"[GetResponseListView] Processing responses for form {form_id}")
            
            responses_by_user = {}
            all_responses = FeedbackResponse.objects.filter(
                feedback_form=feedback_form
            ).select_related(
                'user', 
                'question',
                'teaching_assignment',
                'teaching_assignment__staff',
                'teaching_assignment__staff__user',
                'teaching_assignment__curriculum_row',
                'teaching_assignment__subject',
                'teaching_assignment__elective_subject'
            )

            # Ensure analytics grouping respects section regulation + active-semester context.
            if feedback_form.type == 'SUBJECT_FEEDBACK':
                from academics.models import AcademicYear

                active_ay = AcademicYear.objects.filter(is_active=True).first()
                selected_section_ids = list(feedback_form.sections or [])
                if not selected_section_ids and feedback_form.section_id:
                    selected_section_ids = [feedback_form.section_id]

                years_filter = list(feedback_form.years or [])
                if not years_filter and feedback_form.year:
                    years_filter = [feedback_form.year]

                target_sections = _get_target_sections_for_department(
                    feedback_form.department_id,
                    selected_section_ids=selected_section_ids,
                    years=years_filter,
                    active_ay=active_ay,
                )
                target_context = _derive_regulation_semester_context(target_sections)
                regulation_codes = target_context['regulation_codes']
                semester_ids = target_context['semester_ids']

                ta_filter = Q()
                has_constraint = False

                if regulation_codes:
                    ta_filter &= (
                        Q(teaching_assignment__curriculum_row__regulation__in=regulation_codes)
                        | Q(teaching_assignment__elective_subject__regulation__in=regulation_codes)
                        | Q(teaching_assignment__curriculum_row__isnull=True, teaching_assignment__elective_subject__isnull=True)
                    )
                    has_constraint = True

                if semester_ids:
                    ta_filter &= (
                        Q(teaching_assignment__curriculum_row__semester_id__in=semester_ids)
                        | Q(teaching_assignment__elective_subject__semester_id__in=semester_ids)
                        | Q(teaching_assignment__section__semester_id__in=semester_ids)
                    )
                    has_constraint = True

                if has_constraint:
                    all_responses = all_responses.filter(
                        Q(teaching_assignment__isnull=True) | ta_filter
                    )
            
            logger.info(f"[GetResponseListView] Found {all_responses.count()} total responses")
            
            for response in all_responses:
                user_id = response.user.id
                if user_id not in responses_by_user:
                    # Get user details
                    user = response.user
                    user_name = user.get_full_name() or user.username
                    register_number = None
                    
                    # Get register number from profile
                    if feedback_form.target_type == 'STUDENT':
                        try:
                            from academics.models import StudentProfile
                            student_profile = StudentProfile.objects.get(user=user)
                            register_number = getattr(student_profile, 'reg_no', None) or user.username
                        except StudentProfile.DoesNotExist:
                            register_number = user.username
                    elif feedback_form.target_type == 'STAFF':
                        try:
                            staff_profile = StaffProfile.objects.get(user=user)
                            register_number = getattr(staff_profile, 'staff_id', None) or user.username
                        except StaffProfile.DoesNotExist:
                            register_number = user.username
                    
                    responses_by_user[user_id] = {
                        'user_id': user_id,
                        'user_name': user_name,
                        'register_number': register_number,
                        'submitted_at': response.created_at.isoformat(),
                        'answers': []
                    }
                
                # Get teaching assignment details if present (for subject feedback)
                teaching_assignment_data = None
                if response.teaching_assignment:
                    ta = response.teaching_assignment
                    
                    # Get subject name
                    subject_name = None
                    subject_code = None
                    if ta.curriculum_row:
                        subject_name = ta.curriculum_row.course_name
                        subject_code = ta.curriculum_row.course_code
                    elif ta.subject:
                        subject_name = ta.subject.name
                        subject_code = ta.subject.code
                    elif ta.elective_subject:
                        subject_name = ta.elective_subject.course_name
                        subject_code = ta.elective_subject.course_code
                    elif ta.custom_subject:
                        subject_name = ta.get_custom_subject_display()
                        subject_code = ta.custom_subject
                    
                    # Get staff name
                    staff_name = ta.staff.user.get_full_name() or ta.staff.user.username if ta.staff else None
                    
                    teaching_assignment_data = {
                        'teaching_assignment_id': ta.id,
                        'subject_name': subject_name,
                        'subject_code': subject_code,
                        'staff_name': staff_name
                    }
                
                # Add answer (runs for every response)
                responses_by_user[user_id]['answers'].append({
                    'question_id': response.question.id,
                    'question_text': response.question.question,
                    'answer_type': response.question.answer_type,
                    'question_type': getattr(response.question, 'question_type', 'rating') or 'rating',
                    'answer_star': response.answer_star,
                    'answer_text': response.answer_text,
                    'selected_option_text': (getattr(response, 'selected_option_text', None) or '').strip(),
                    'teaching_assignment': teaching_assignment_data
                })
            
            # Get list of users who should have responded but didn't
            non_responders = []
            expected_users = []
            
            if feedback_form.target_type == 'STAFF':
                expected_users = User.objects.filter(
                    staff_profile__department=feedback_form.department
                ).exclude(id=feedback_form.created_by.id).values_list('id', flat=True)
            elif feedback_form.target_type == 'STUDENT':
                from academics.models import StudentProfile, Section, AcademicYear
                student_department_filter = (
                    Q(student_profile__section__managing_department=feedback_form.department)
                    | Q(student_profile__section__batch__course__department=feedback_form.department)
                    | Q(student_profile__section__batch__department=feedback_form.department)
                )
                
                # Build query for matching students
                sections_to_query = []
                
                current_ay = AcademicYear.objects.filter(is_active=True).first()
                current_acad_year = None
                if current_ay:
                    try:
                        current_acad_year = int(str(current_ay.name).split('-')[0])
                    except:
                        pass
                
                if feedback_form.sections:
                    sections_to_query = list(feedback_form.sections)
                elif feedback_form.section_id:
                    sections_to_query = [feedback_form.section_id]
                else:
                    sections_filter = Q(batch__course__department=feedback_form.department)
                    
                    if feedback_form.years:
                        year_filters = Q()
                        for year in feedback_form.years:
                            if current_acad_year:
                                batch_start_year = current_acad_year - year + 1
                                year_filters |= Q(batch__start_year=str(batch_start_year))
                        sections_filter &= year_filters
                    elif feedback_form.year:
                        if current_acad_year:
                            batch_start_year = current_acad_year - feedback_form.year + 1
                            sections_filter &= Q(batch__start_year=str(batch_start_year))
                    
                    if feedback_form.semesters:
                        sections_filter &= Q(semester_id__in=feedback_form.semesters)
                    elif feedback_form.semester_id:
                        sections_filter &= Q(semester=feedback_form.semester)
                    
                    matching_sections = Section.objects.filter(sections_filter)
                    sections_to_query = [s.id for s in matching_sections]
                
                if sections_to_query:
                    expected_users = User.objects.filter(
                        student_department_filter,
                        student_profile__section_id__in=sections_to_query
                    ).exclude(id=feedback_form.created_by.id).values_list('id', flat=True)
            
            # Find non-responders
            responded_user_ids = set(responses_by_user.keys())
            for user_id in expected_users:
                if user_id not in responded_user_ids:
                    user = User.objects.get(id=user_id)
                    user_name = user.get_full_name() or user.username
                    register_number = None
                    
                    if feedback_form.target_type == 'STUDENT':
                        try:
                            from academics.models import StudentProfile
                            student_profile = StudentProfile.objects.get(user=user)
                            register_number = getattr(student_profile, 'reg_no', None) or user.username
                        except StudentProfile.DoesNotExist:
                            register_number = user.username
                    elif feedback_form.target_type == 'STAFF':
                        try:
                            staff_profile = StaffProfile.objects.get(user=user)
                            register_number = getattr(staff_profile, 'staff_id', None) or user.username
                        except StaffProfile.DoesNotExist:
                            register_number = user.username
                    
                    non_responders.append({
                        'user_id': user_id,
                        'user_name': user_name,
                        'register_number': register_number
                    })
            
            logger.info(f"[GetResponseListView] Successfully processed: {len(responses_by_user)} responded, {len(non_responders)} non-responders")
            form_serialized = FeedbackFormSerializer(feedback_form, context={'request': request}).data
            
            return Response({
                'feedback_form_id': form_id,
                'target_type': feedback_form.target_type,
                'target_display': form_serialized.get('target_display', ''),
                'context_display': form_serialized.get('context_display', ''),
                'class_context_display': form_serialized.get('class_context_display', []),
                'responded': list(responses_by_user.values()),
                'non_responders': non_responders,
                'total_responded': len(responses_by_user),
                'total_non_responded': len(non_responders)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"[GetResponseListView] Unexpected error: {str(e)}", exc_info=True)
            return Response({
                'detail': f'Error processing responses: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ExportFeedbackResponsesExcelView(APIView):
    """
    Export detailed feedback responses to Excel for HOD analytics.

    GET /api/feedback/<form_id>/export-excel/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, form_id):
        user_permissions = get_user_permissions(request.user)
        if 'feedback.create' not in user_permissions:
            return Response(
                {'detail': 'You do not have permission to export feedback responses.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        role_names = set(
            request.user.roles.values_list('name', flat=True)
        ) if hasattr(request.user, 'roles') else set()
        if not ({'HOD', 'IQAC'} & role_names):
            return Response(
                {'detail': 'Only HOD or IQAC users can export feedback responses.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        feedback_form = get_object_or_404(FeedbackForm, id=form_id)

        # Keep access semantics aligned with existing HOD analytics visibility.
        if feedback_form.created_by != request.user:
            return Response(
                {'detail': 'You can only export responses for forms you created.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Export only published forms (i.e., not drafts).
        if feedback_form.status == 'DRAFT':
            return Response(
                {'detail': 'Draft forms cannot be exported. Publish the form first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        responses_qs = FeedbackResponse.objects.filter(
            feedback_form=feedback_form
        ).select_related(
            'user',
            'question',
            'teaching_assignment',
            'teaching_assignment__section',
            'teaching_assignment__staff',
            'teaching_assignment__staff__user',
            'teaching_assignment__curriculum_row',
            'teaching_assignment__subject',
            'teaching_assignment__elective_subject',
            'user__student_profile__section',
            'user__student_profile__section__managing_department',
            'user__student_profile__section__batch__course__department',
            'user__student_profile__section__batch__department',
            'user__staff_profile__department',
        )

        # Export only responses mapped to the HOD department context.
        if feedback_form.type == 'SUBJECT_FEEDBACK':
            from academics.models import AcademicYear

            active_ay = AcademicYear.objects.filter(is_active=True).first()
            selected_section_ids = list(feedback_form.sections or [])
            if not selected_section_ids and feedback_form.section_id:
                selected_section_ids = [feedback_form.section_id]

            years_filter = list(feedback_form.years or [])
            if not years_filter and feedback_form.year:
                years_filter = [feedback_form.year]

            target_sections = _get_target_sections_for_department(
                feedback_form.department_id,
                selected_section_ids=selected_section_ids,
                years=years_filter,
                active_ay=active_ay,
            )
            target_context = _derive_regulation_semester_context(target_sections)
            regulation_codes = target_context['regulation_codes']
            semester_ids = target_context['semester_ids']

            ta_filter = Q()
            has_constraint = False

            if regulation_codes:
                ta_filter &= (
                    Q(teaching_assignment__curriculum_row__regulation__in=regulation_codes)
                    | Q(teaching_assignment__elective_subject__regulation__in=regulation_codes)
                    | Q(teaching_assignment__curriculum_row__isnull=True, teaching_assignment__elective_subject__isnull=True)
                )
                has_constraint = True

            if semester_ids:
                ta_filter &= (
                    Q(teaching_assignment__curriculum_row__semester_id__in=semester_ids)
                    | Q(teaching_assignment__elective_subject__semester_id__in=semester_ids)
                    | Q(teaching_assignment__section__semester_id__in=semester_ids)
                )
                has_constraint = True

            if has_constraint:
                responses_qs = responses_qs.filter(Q(teaching_assignment__isnull=True) | ta_filter)

            responses_qs = responses_qs.filter(
                Q(teaching_assignment__isnull=True)
                | Q(teaching_assignment__section__managing_department_id=feedback_form.department_id)
                | Q(teaching_assignment__section__batch__course__department_id=feedback_form.department_id)
                | Q(teaching_assignment__section__batch__department_id=feedback_form.department_id)
            )

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = 'Feedback Responses'

        headers = [
            'Student Name',
            'Register Number',
            'Department',
            'Year / Section',
            'Subject Code',
            'Subject Name',
            'Staff Name',
            'Question Text',
            'Rating Value',
            'Comment',
            'Selected Option',
        ]
        worksheet.append(headers)

        active_ay_start = None
        try:
            from academics.models import AcademicYear
            active_ay = AcademicYear.objects.filter(is_active=True).first()
            if active_ay:
                active_ay_start = int(str(active_ay.name).split('-')[0])
        except Exception:
            active_ay_start = None

        response_rows = list(responses_qs)
        user_ta_hints = {}
        for response in response_rows:
            if response.teaching_assignment_id and response.user_id not in user_ta_hints:
                user_ta_hints[response.user_id] = response.teaching_assignment

        def _resolve_subject_fields(ta):
            if ta is None:
                return '', ''

            if ta.curriculum_row:
                return ta.curriculum_row.course_code or '', ta.curriculum_row.course_name or ''
            if ta.subject:
                return ta.subject.code or '', ta.subject.name or ''
            if ta.elective_subject:
                return ta.elective_subject.course_code or '', ta.elective_subject.course_name or ''
            if ta.custom_subject:
                return ta.custom_subject or '', ta.get_custom_subject_display() or ta.custom_subject or ''
            return '', ''

        staff_name_cache = {}

        def _resolve_staff_names(ta):
            if ta is None:
                return ''

            cache_key = (
                ta.academic_year_id,
                ta.section_id,
                ta.curriculum_row_id,
                ta.subject_id,
                ta.elective_subject_id,
                ta.custom_subject,
            )
            if cache_key in staff_name_cache:
                return staff_name_cache[cache_key]

            from academics.models import TeachingAssignment

            assignment_qs = TeachingAssignment.objects.filter(is_active=True).select_related('staff__user')

            if ta.academic_year_id:
                assignment_qs = assignment_qs.filter(academic_year_id=ta.academic_year_id)

            if ta.curriculum_row_id:
                assignment_qs = assignment_qs.filter(curriculum_row_id=ta.curriculum_row_id)
            elif ta.subject_id:
                assignment_qs = assignment_qs.filter(subject_id=ta.subject_id)
            elif ta.elective_subject_id:
                assignment_qs = assignment_qs.filter(elective_subject_id=ta.elective_subject_id)
            elif ta.custom_subject:
                assignment_qs = assignment_qs.filter(custom_subject=ta.custom_subject)
            else:
                assignment_qs = assignment_qs.filter(id=ta.id)

            if ta.section_id:
                assignment_qs = assignment_qs.filter(Q(section_id=ta.section_id) | Q(section__isnull=True))

            merged_staff_names = []
            seen_names = set()
            for assignment in assignment_qs:
                staff_user = getattr(getattr(assignment, 'staff', None), 'user', None)
                if not staff_user:
                    continue
                staff_display = staff_user.get_full_name() or staff_user.username
                if staff_display and staff_display not in seen_names:
                    seen_names.add(staff_display)
                    merged_staff_names.append(staff_display)

            if not merged_staff_names and ta.staff and ta.staff.user:
                fallback_name = ta.staff.user.get_full_name() or ta.staff.user.username
                if fallback_name:
                    merged_staff_names.append(fallback_name)

            resolved_staff = ', '.join(merged_staff_names) if merged_staff_names else 'Staff Not Assigned'
            staff_name_cache[cache_key] = resolved_staff
            return resolved_staff

        for response in response_rows:
            user = response.user

            student_name = user.get_full_name() or user.username
            register_number = user.username
            department_name = ''
            year_section = ''

            student_profile = getattr(user, 'student_profile', None)
            if student_profile is not None:
                register_number = getattr(student_profile, 'reg_no', None) or register_number
                section = getattr(student_profile, 'section', None)
                if section is not None:
                    dept = (
                        getattr(section, 'managing_department', None)
                        or getattr(getattr(getattr(section, 'batch', None), 'course', None), 'department', None)
                        or getattr(getattr(section, 'batch', None), 'department', None)
                    )
                    if dept is not None:
                        department_name = getattr(dept, 'short_name', None) or getattr(dept, 'code', None) or getattr(dept, 'name', '')

                    year_label = ''
                    try:
                        batch_start_year = int(getattr(getattr(section, 'batch', None), 'start_year', 0) or 0)
                        if active_ay_start and batch_start_year:
                            derived_year = active_ay_start - batch_start_year + 1
                            if 1 <= derived_year <= 8:
                                year_label = f'Y{derived_year}'
                    except Exception:
                        year_label = ''

                    section_label = getattr(section, 'name', '') or ''
                    year_section = ' / '.join([x for x in [year_label, section_label] if x])

            staff_profile = getattr(user, 'staff_profile', None)
            if staff_profile is not None:
                register_number = getattr(staff_profile, 'staff_id', None) or register_number
                staff_dept = getattr(staff_profile, 'department', None)
                if staff_dept is not None and not department_name:
                    department_name = getattr(staff_dept, 'short_name', None) or getattr(staff_dept, 'code', None) or getattr(staff_dept, 'name', '')

            ta = response.teaching_assignment
            if ta is None and feedback_form.type == 'SUBJECT_FEEDBACK':
                ta = user_ta_hints.get(user.id)

            subject_code, subject_name = _resolve_subject_fields(ta)
            if ta is not None:
                staff_name = _resolve_staff_names(ta)
            elif feedback_form.type == 'SUBJECT_FEEDBACK':
                staff_name = 'Staff Not Assigned'
            else:
                staff_name = ''

            rating_value = response.answer_star if response.answer_star is not None else ''
            comment_value = (response.answer_text or '').strip()
            selected_option_value = (getattr(response, 'selected_option_text', None) or '').strip()
            if not selected_option_value:
                # Backward compatibility for older DBs/rows that used legacy `selected_option`.
                selected_option_value = (getattr(response, 'selected_option', None) or '').strip()

            worksheet.append([
                student_name,
                register_number,
                department_name,
                year_section,
                subject_code,
                subject_name,
                staff_name,
                response.question.question,
                rating_value,
                comment_value,
                selected_option_value,
            ])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        file_name = f"Feedback_{form_id}_{timezone.now().date().isoformat()}.xlsx"
        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{file_name}"'
        return response


def _extract_target_years_from_form(form: FeedbackForm):
    years = set()
    if getattr(form, 'all_classes', False):
        years.update([1, 2, 3, 4])
    if getattr(form, 'year', None):
        try:
            years.add(int(form.year))
        except Exception:
            pass
    form_years = getattr(form, 'years', None)
    if isinstance(form_years, list):
        for y in form_years:
            try:
                years.add(int(y))
            except Exception:
                continue
    return sorted([y for y in years if 1 <= int(y) <= 8])


class CommonFeedbackExportOptionsView(APIView):
    """Return departments and available years for IQAC Common Export modal."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Permission rule: allow institution-wide access when IQAC role OR analytics_view.
        if not (_user_is_iqac(request.user) or _user_has_feedback_analytics_view(request.user)):
            return Response(
                {'detail': 'You do not have permission to use common export.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        departments_qs = _get_accessible_departments_for_user(request.user)
        departments = [
            {
                'id': dept.id,
                'code': getattr(dept, 'code', '') or '',
                'short_name': getattr(dept, 'short_name', '') or '',
                'name': getattr(dept, 'name', '') or '',
            }
            for dept in departments_qs
        ]

        return Response(
            {
                'departments': departments,
            },
            status=status.HTTP_200_OK,
        )


class ExportYearsView(APIView):
    """Return distinct years available institution-wide or for a department.

    GET /api/feedback/export-years/?department_id=<id>
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Permission rule: allow institution-wide access when IQAC role OR analytics_view.
        if not (_user_is_iqac(request.user) or _user_has_feedback_analytics_view(request.user)):
            return Response(
                {'detail': 'You do not have permission to load export years.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        department_param = (request.query_params.get('department_id') or '').strip()
        department_id = None
        if department_param:
            try:
                department_id = int(department_param)
            except Exception:
                return Response({'detail': 'Invalid department_id.'}, status=status.HTTP_400_BAD_REQUEST)

        # Use active AY start year to derive student year from batch.start_year.
        active_ay_start = None
        try:
            from academics.models import AcademicYear

            active_ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
            if active_ay:
                active_ay_start = int(str(active_ay.name).split('-')[0])
        except Exception:
            active_ay_start = None

        from academics.models import Section

        section_qs = Section.objects.select_related(
            'batch',
            'batch__course__department',
            'batch__department',
            'managing_department',
        ).distinct()

        if department_id:
            section_qs = section_qs.filter(
                Q(managing_department_id=department_id)
                | Q(batch__course__department_id=department_id)
                | Q(batch__department_id=department_id)
            )

        years = set()
        if active_ay_start:
            for sec in section_qs:
                batch = getattr(sec, 'batch', None)
                start_year = getattr(batch, 'start_year', None) if batch else None
                if start_year is None and batch is not None:
                    try:
                        start_year = int(str(getattr(batch, 'name', '')).split('-')[0])
                    except Exception:
                        start_year = None
                if not start_year:
                    continue
                try:
                    derived_year = int(active_ay_start) - int(start_year) + 1
                except Exception:
                    continue
                if 1 <= derived_year <= 8:
                    years.add(derived_year)

        return Response({'years': sorted(list(years))}, status=status.HTTP_200_OK)


class ExportCommonFeedbackResponsesExcelView(APIView):
    """Export feedback responses to a single Excel sheet with department/year filters (IQAC only)."""

    permission_classes = [IsAuthenticated]

    def _get_active_ay_start_year(self):
        try:
            from academics.models import AcademicYear

            active_ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
            if not active_ay:
                return None
            return int(str(active_ay.name).split('-')[0])
        except Exception:
            return None

    def _export(self, request, payload=None):
        # Permission rule: allow institution-wide access when IQAC role OR analytics_view.
        if not (_user_is_iqac(request.user) or _user_has_feedback_analytics_view(request.user)):
            return Response(
                {'detail': 'You do not have permission to use common export.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_iqac = _user_is_iqac(request.user)
        is_hod = (not is_iqac) and _user_is_hod(request.user)

        payload = payload or {}

        # Backward compatible GET support.
        if not payload:
            dept_param = (request.query_params.get('department_id') or '').strip()
            year_param = (request.query_params.get('year') or '').strip()
            payload = {
                'all_departments': dept_param.lower() == 'all' or dept_param == '',
                'department_ids': [int(dept_param)] if (dept_param.isdigit()) else [],
                'years': [] if (not year_param or year_param.lower() == 'all') else ([int(year_param)] if str(year_param).isdigit() else year_param),
            }

        all_departments = bool(payload.get('all_departments', False))
        department_ids = payload.get('department_ids', [])
        if isinstance(department_ids, str):
            department_ids = [x.strip() for x in department_ids.split(',') if x.strip()]
        if not isinstance(department_ids, list):
            department_ids = []

        normalized_dept_ids: list[int] = []
        for raw in department_ids:
            try:
                normalized_dept_ids.append(int(raw))
            except Exception:
                continue
        # De-dupe while preserving order.
        normalized_dept_ids = list(dict.fromkeys(normalized_dept_ids))

        years_value = payload.get('years', None)
        # Backward-compat: accept single 'year' too.
        if years_value is None and 'year' in payload:
            years_value = payload.get('year')

        if years_value in ('', 'all', 'ALL', None):
            years_value = []

        if isinstance(years_value, str):
            years_value = [x.strip() for x in years_value.split(',') if x.strip()]

        if isinstance(years_value, int):
            years_value = [years_value]

        if not isinstance(years_value, list):
            return Response({'detail': 'Invalid years.'}, status=status.HTTP_400_BAD_REQUEST)

        normalized_years: list[int] = []
        for raw in years_value:
            if raw in ('', None):
                continue
            try:
                y = int(raw)
            except Exception:
                return Response({'detail': 'Invalid years.'}, status=status.HTTP_400_BAD_REQUEST)
            if 1 <= y <= 8:
                normalized_years.append(y)

        normalized_years = sorted(list(dict.fromkeys(normalized_years)))

        # HOD override: force department filter regardless of payload.
        if is_hod:
            try:
                from academics.models import DepartmentRole

                staff_profile = getattr(request.user, 'staff_profile', None)
                if staff_profile is None:
                    staff_profile = StaffProfile.objects.filter(user=request.user).first()
                if staff_profile is None:
                    return Response({'detail': 'Staff profile not found.'}, status=status.HTTP_403_FORBIDDEN)

                hod_dept_ids = list(DepartmentRole.objects.filter(
                    staff=staff_profile,
                    role='HOD',
                    is_active=True,
                    academic_year__is_active=True,
                ).values_list('department_id', flat=True))
                hod_dept_ids = list(dict.fromkeys([int(x) for x in hod_dept_ids if x]))
                if not hod_dept_ids:
                    return Response({'detail': 'No HOD department assigned.'}, status=status.HTTP_403_FORBIDDEN)

                all_departments = False
                normalized_dept_ids = hod_dept_ids
            except Exception:
                return Response({'detail': 'Failed to resolve HOD department.'}, status=status.HTTP_403_FORBIDDEN)

        # Validate department selection when not exporting all departments.
        if not all_departments and len(normalized_dept_ids) == 0:
            return Response(
                {'detail': 'Select at least one department or choose All Departments.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Limit to accessible departments for safety.
        accessible_ids = set(_get_accessible_departments_for_user(request.user).values_list('id', flat=True))
        if not all_departments:
            normalized_dept_ids = [d for d in normalized_dept_ids if d in accessible_ids]
            if not normalized_dept_ids:
                return Response({'detail': 'No accessible departments selected.'}, status=status.HTTP_403_FORBIDDEN)

        # Determine filter type for naming.
        if all_departments and normalized_years:
            filter_type = 'ALL_DEPARTMENTS_YEARS'
        elif all_departments:
            filter_type = 'ALL_DEPARTMENTS'
        elif normalized_years:
            filter_type = 'DEPARTMENTS_YEARS'
        else:
            filter_type = 'DEPARTMENTS'

        # Base forms are student feedback only.
        forms_qs = FeedbackForm.objects.filter(
            target_type='STUDENT',
            department__isnull=False,
        ).select_related('department')

        if not all_departments:
            forms_qs = forms_qs.filter(department_id__in=normalized_dept_ids)

        responses_qs = FeedbackResponse.objects.filter(
            feedback_form__in=forms_qs
        ).select_related(
            'feedback_form',
            'feedback_form__department',
            'user',
            'question',
            'teaching_assignment',
            'teaching_assignment__section',
            'teaching_assignment__staff',
            'teaching_assignment__staff__user',
            'teaching_assignment__curriculum_row',
            'teaching_assignment__subject',
            'teaching_assignment__elective_subject',
            'user__student_profile__section',
            'user__student_profile__section__managing_department',
            'user__student_profile__section__batch__course__department',
            'user__student_profile__section__batch__department',
        )

        # Year filtering and ordering use the same derived-year annotation.
        active_ay_start = self._get_active_ay_start_year()
        if normalized_years and not active_ay_start:
            return Response(
                {'detail': 'Unable to compute year filter (no academic year found).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if active_ay_start:
            responses_qs = responses_qs.annotate(
                derived_year=Case(
                    When(
                        user__student_profile__section__batch__start_year__isnull=False,
                        then=ExpressionWrapper(
                            Value(int(active_ay_start)) - F('user__student_profile__section__batch__start_year') + Value(1),
                            output_field=IntegerField(),
                        ),
                    ),
                    default=Value(None),
                    output_field=IntegerField(),
                ),
                order_year=Case(
                    When(
                        user__student_profile__section__batch__start_year__isnull=False,
                        then=ExpressionWrapper(
                            Value(int(active_ay_start)) - F('user__student_profile__section__batch__start_year') + Value(1),
                            output_field=IntegerField(),
                        ),
                    ),
                    default=Value(999),
                    output_field=IntegerField(),
                ),
            )

        # Apply multi-year filter (works even when all_departments=true).
        if normalized_years:
            responses_qs = responses_qs.filter(derived_year__in=normalized_years)

        # Ordering: Department -> Year -> Section (then stable tie-breakers).
        if active_ay_start:
            responses_qs = responses_qs.order_by(
                'feedback_form__department__name',
                'order_year',
                'user__student_profile__section__name',
                'user__student_profile__reg_no',
                'feedback_form_id',
                'user_id',
                'question_id',
            )
        else:
            responses_qs = responses_qs.order_by(
                'feedback_form__department__name',
                'user__student_profile__section__name',
                'user__student_profile__reg_no',
                'feedback_form_id',
                'user_id',
                'question_id',
            )

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = 'Feedback Export'

        headers = [
            'Student Name',
            'Register Number',
            'Department',
            'Year / Section',
            'Subject',
            'Staff Name',
            'Question',
            'Rating',
            'Comment',
            'Selected Option (Radio Answer)',
            'Submitted Date',
        ]
        worksheet.append(headers)

        active_ay_start = active_ay_start or self._get_active_ay_start_year()

        # Map (form_id, user_id) -> submitted_at
        submitted_at_map = {}
        form_ids = list(forms_qs.values_list('id', flat=True))
        if form_ids:
            for row in FeedbackFormSubmission.objects.filter(
                feedback_form_id__in=form_ids,
                submission_status='SUBMITTED',
            ).values('feedback_form_id', 'user_id', 'submitted_at'):
                submitted_at_map[(row['feedback_form_id'], row['user_id'])] = row.get('submitted_at')

        # Hint teaching assignment for subject forms.
        user_ta_hints = {}

        def _resolve_subject_display(ta):
            if ta is None:
                return ''

            if ta.curriculum_row:
                code = ta.curriculum_row.course_code or ''
                name = ta.curriculum_row.course_name or ''
            elif ta.subject:
                code = ta.subject.code or ''
                name = ta.subject.name or ''
            elif ta.elective_subject:
                code = ta.elective_subject.course_code or ''
                name = ta.elective_subject.course_name or ''
            elif ta.custom_subject:
                code = ta.custom_subject or ''
                name = ta.get_custom_subject_display() or ta.custom_subject or ''
            else:
                code, name = '', ''

            if code and name:
                return f'{code} - {name}'
            return name or code

        staff_name_cache = {}

        def _resolve_staff_names(ta):
            if ta is None:
                return ''

            cache_key = (
                ta.academic_year_id,
                ta.section_id,
                ta.curriculum_row_id,
                ta.subject_id,
                ta.elective_subject_id,
                ta.custom_subject,
            )
            if cache_key in staff_name_cache:
                return staff_name_cache[cache_key]

            from academics.models import TeachingAssignment

            assignment_qs = TeachingAssignment.objects.filter(is_active=True).select_related('staff__user')

            if ta.academic_year_id:
                assignment_qs = assignment_qs.filter(academic_year_id=ta.academic_year_id)

            if ta.curriculum_row_id:
                assignment_qs = assignment_qs.filter(curriculum_row_id=ta.curriculum_row_id)
            elif ta.subject_id:
                assignment_qs = assignment_qs.filter(subject_id=ta.subject_id)
            elif ta.elective_subject_id:
                assignment_qs = assignment_qs.filter(elective_subject_id=ta.elective_subject_id)
            elif ta.custom_subject:
                assignment_qs = assignment_qs.filter(custom_subject=ta.custom_subject)
            else:
                assignment_qs = assignment_qs.filter(id=ta.id)

            if ta.section_id:
                assignment_qs = assignment_qs.filter(Q(section_id=ta.section_id) | Q(section__isnull=True))

            merged_staff_names = []
            seen_names = set()
            for assignment in assignment_qs:
                staff_user = getattr(getattr(assignment, 'staff', None), 'user', None)
                if not staff_user:
                    continue
                staff_display = staff_user.get_full_name() or staff_user.username
                if staff_display and staff_display not in seen_names:
                    seen_names.add(staff_display)
                    merged_staff_names.append(staff_display)

            if not merged_staff_names and ta.staff and ta.staff.user:
                fallback_name = ta.staff.user.get_full_name() or ta.staff.user.username
                if fallback_name:
                    merged_staff_names.append(fallback_name)

            resolved_staff = ', '.join(merged_staff_names) if merged_staff_names else 'Staff Not Assigned'
            staff_name_cache[cache_key] = resolved_staff
            return resolved_staff

        seen_row_keys = set()

        def _subject_dedup_key(ta):
            if ta is None:
                return ('NONE', None)
            if getattr(ta, 'curriculum_row_id', None):
                return ('CR', ta.curriculum_row_id)
            if getattr(ta, 'subject_id', None):
                return ('SUB', ta.subject_id)
            if getattr(ta, 'elective_subject_id', None):
                return ('ELEC', ta.elective_subject_id)
            custom = getattr(ta, 'custom_subject', None)
            if custom:
                return ('CUS', str(custom))
            return ('TA', getattr(ta, 'id', None))

        for response in responses_qs.iterator(chunk_size=2000):
            user = response.user

            if response.teaching_assignment_id and response.user_id not in user_ta_hints:
                user_ta_hints[response.user_id] = response.teaching_assignment

            student_name = user.get_full_name() or user.username
            register_number = user.username
            department_name = ''
            year_section = ''

            # Department from the form itself (matches filter semantics).
            form_dept = getattr(getattr(response, 'feedback_form', None), 'department', None)
            if form_dept is not None:
                department_name = getattr(form_dept, 'short_name', None) or getattr(form_dept, 'code', None) or getattr(form_dept, 'name', '')

            student_profile = getattr(user, 'student_profile', None)
            if student_profile is not None:
                register_number = getattr(student_profile, 'reg_no', None) or register_number
                section = getattr(student_profile, 'section', None)
                if section is not None:
                    year_label = ''
                    try:
                        batch_start_year = int(getattr(getattr(section, 'batch', None), 'start_year', 0) or 0)
                        if active_ay_start and batch_start_year:
                            derived_year = active_ay_start - batch_start_year + 1
                            if 1 <= derived_year <= 8:
                                year_label = f'Y{derived_year}'
                    except Exception:
                        year_label = ''

                    section_label = getattr(section, 'name', '') or ''
                    year_section = ' / '.join([x for x in [year_label, section_label] if x])

            ta = response.teaching_assignment
            if ta is None and response.feedback_form.type == 'SUBJECT_FEEDBACK':
                ta = user_ta_hints.get(user.id)

            subject_display = _resolve_subject_display(ta)
            staff_name = _resolve_staff_names(ta) if ta is not None else ('' if response.feedback_form.type != 'SUBJECT_FEEDBACK' else 'Staff Not Assigned')

            rating_value = response.answer_star if response.answer_star is not None else ''
            comment_value = (response.answer_text or '').strip()
            selected_option_value = (getattr(response, 'selected_option_text', None) or '').strip()
            if not selected_option_value:
                selected_option_value = (getattr(response, 'selected_option', None) or '').strip()

            row_key = (
                response.feedback_form_id,
                response.user_id,
                response.question_id,
                _subject_dedup_key(ta),
            )
            if row_key in seen_row_keys:
                continue
            seen_row_keys.add(row_key)

            submitted_at = submitted_at_map.get((response.feedback_form_id, response.user_id))
            if not submitted_at:
                submitted_at = getattr(response, 'created_at', None)
            submitted_value = submitted_at.isoformat(sep=' ', timespec='seconds') if submitted_at else ''

            worksheet.append([
                student_name,
                register_number,
                department_name,
                year_section,
                subject_display,
                staff_name,
                response.question.question,
                rating_value,
                comment_value,
                selected_option_value,
                submitted_value,
            ])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        file_name = f"Feedback_Export_{filter_type}_{timestamp}.xlsx"
        resp = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = f'attachment; filename="{file_name}"'
        return resp

    def get(self, request):
        return self._export(request, payload=None)

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        return self._export(request, payload=payload)


class GetStudentSubjectsView(APIView):
    """
    API 9: Get Student's Subjects for Subject Feedback
    GET /api/feedback/<form_id>/subjects/
    
    Returns list of subjects (teaching assignments) for the student to rate.
    Excludes 1st year students from subject feedback.
    
    Student View: Shows ONLY core subjects + electives the student has chosen via ElectiveChoice.
    This ensures students don't see electives they haven't selected.
    Staff names are taken from TeachingAssignment where available.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, form_id):
        print(f"[GetStudentSubjectsView] User: {request.user.username}, Form ID: {form_id}")
        try:
            # Get the feedback form
            feedback_form = get_object_or_404(FeedbackForm, id=form_id)
            
            print(f"[GetStudentSubjectsView] Feedback form found: {feedback_form.type}, Status: {feedback_form.status}, Active: {feedback_form.active}")
            
            # Check if this is subject feedback
            if feedback_form.type != 'SUBJECT_FEEDBACK':
                return Response({
                    'detail': 'This endpoint is only for subject feedback forms.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if form is active and published
            if feedback_form.status != 'ACTIVE':
                return Response({
                    'detail': f'This feedback form has not been published yet. Current status: {feedback_form.get_status_display()}',
                    'subjects': [],
                    'total_subjects': 0,
                    'completed_subjects': 0,
                    'all_completed': False,
                    'form_status': feedback_form.status
                }, status=status.HTTP_200_OK)
            
            if not feedback_form.active:
                return Response({
                    'detail': 'This feedback form has been deactivated.',
                    'subjects': [],
                    'total_subjects': 0,
                    'completed_subjects': 0,
                    'all_completed': False
                }, status=status.HTTP_200_OK)
            
            # Get student profile
            try:
                from academics.models import StudentProfile, TeachingAssignment, AcademicYear
                student_profile = StudentProfile.objects.get(user=request.user)
                print(f"[GetStudentSubjectsView] ===== STUDENT INFO =====")
                print(f"[GetStudentSubjectsView] Student: {request.user.username} (ID: {request.user.id})")
                print(f"[GetStudentSubjectsView] StudentProfile ID: {student_profile.id}")
                print(f"[GetStudentSubjectsView] Section: {student_profile.section}")
                
                # Quick check for ElectiveChoice records
                from curriculum.models import ElectiveChoice
                total_choices = ElectiveChoice.objects.filter(student=student_profile).count()
                active_choices = ElectiveChoice.objects.filter(student=student_profile, is_active=True).count()
                print(f"[GetStudentSubjectsView] ElectiveChoice records: {total_choices} total, {active_choices} active")
                
                if total_choices == 0:
                    print(f"[GetStudentSubjectsView] ⚠⚠⚠ NO ElectiveChoice records found for this student!")
                    print(f"[GetStudentSubjectsView] ⚠⚠⚠ Student has not chosen any electives yet!")
                
            except StudentProfile.DoesNotExist:
                return Response({
                    'detail': 'Student profile not found.'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Calculate student's current year
            section = student_profile.section
            if not section:
                return Response({
                    'detail': 'Section information not found.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            batch = section.batch
            batch_regulation = batch.regulation if batch else None
            batch_regulation_code = batch_regulation.code if batch_regulation else None
            target_regulation_code = feedback_form.regulation.code if feedback_form.regulation else None
            effective_regulation_code = batch_regulation_code or target_regulation_code
            student_year = None
            
            # Calculate year from batch
            if batch and batch.start_year:
                current_ay = AcademicYear.objects.filter(is_active=True).first()
                if current_ay:
                    try:
                        acad_start = int(str(current_ay.name).split('-')[0])
                        delta = acad_start - int(batch.start_year)
                        student_year = delta + 1
                        print(f"[GetStudentSubjectsView] Student year calculated: {student_year} (batch start: {batch.start_year}, current AY: {current_ay.name})")
                    except Exception as calc_err:
                        print(f"[GetStudentSubjectsView] Error calculating year: {calc_err}")
                        pass
            
            if not student_year:
                print(f"[GetStudentSubjectsView] WARNING: Could not determine student year")

            print(
                f"[GetStudentSubjectsView] Regulation context - "
                f"student_batch={batch_regulation_code}, target_form={target_regulation_code}, effective={effective_regulation_code}"
            )
            
            # Exclude 1st year students
            if student_year == 1:
                return Response({
                    'detail': 'Subject feedback is not applicable for 1st year students.',
                    'is_first_year': True,
                    'subjects': [],
                    'total_subjects': 0,
                    'completed_subjects': 0,
                    'all_completed': False
                }, status=status.HTTP_200_OK)
            
            # Get student's department
            student_department = None
            if section.batch and section.batch.course:
                student_department = section.batch.course.department
            
            print(f"[GetStudentSubjectsView] Student info - Year: {student_year}, Section: {section.name} (ID: {section.id}), Department: {student_department.code if student_department else 'None'}")
            print(f"[GetStudentSubjectsView] Feedback targets - Years: {feedback_form.years}, Sections: {feedback_form.sections}, Department: {feedback_form.department.code}")
            
            # Validate if student's year and section match feedback form's targets
            # Check if feedback targets specific years
            if feedback_form.years and len(feedback_form.years) > 0:
                if student_year not in feedback_form.years:
                    return Response({
                        'detail': f'This feedback is not for your year (Year {student_year}).',
                        'subjects': [],
                        'total_subjects': 0,
                        'completed_subjects': 0,
                        'all_completed': False
                    }, status=status.HTTP_200_OK)
            
            # Check if feedback targets specific sections
            if feedback_form.sections and len(feedback_form.sections) > 0:
                if section.id not in feedback_form.sections:
                    return Response({
                        'detail': f'This feedback is not for your section ({section.name}).',
                        'subjects': [],
                        'total_subjects': 0,
                        'completed_subjects': 0,
                        'all_completed': False
                    }, status=status.HTTP_200_OK)
            
            # Check if feedback targets specific department
            if student_department and feedback_form.department.id != student_department.id:
                return Response({
                    'detail': 'This feedback is not for your department.',
                    'subjects': [],
                    'total_subjects': 0,
                    'completed_subjects': 0,
                    'all_completed': False
                }, status=status.HTTP_200_OK)
            
            # ========== STEP 1: Load CORE subjects from curriculum ==========
            # Fetch core subjects directly from CurriculumDepartment to avoid missing subjects
            # due to strict section filtering or missing TeachingAssignment records
            print(f"[GetStudentSubjectsView] STEP 1: Loading CORE subjects from curriculum")
            
            current_ay = AcademicYear.objects.filter(is_active=True).first()
            
            from curriculum.models import CurriculumDepartment
            
            # Resolve semesters from form and regulation context.
            target_semester_ids = []
            if hasattr(feedback_form, 'semesters') and feedback_form.semesters:
                target_semester_ids = list(feedback_form.semesters)
                print(f"[GetStudentSubjectsView] Feedback form targets semester IDs: {target_semester_ids}")

            if not target_semester_ids:
                reg_active_semester_id = getattr(batch_regulation, 'current_active_semester_id', None) if batch_regulation else None
                if reg_active_semester_id:
                    target_semester_ids = [reg_active_semester_id]
                elif section.semester_id:
                    target_semester_ids = [section.semester_id]

            print(f"[GetStudentSubjectsView] Effective semester IDs: {target_semester_ids}")
            
            # Fetch core curriculum subjects
            curriculum_filter = {
                'department': student_department,
                'is_elective': False,  # Core subjects only
            }

            if effective_regulation_code:
                curriculum_filter['regulation'] = effective_regulation_code

            if target_semester_ids:
                curriculum_filter['semester_id__in'] = target_semester_ids
            
            curriculum_subjects = CurriculumDepartment.objects.filter(
                **curriculum_filter
            ).select_related(
                'semester',
                'department'
            ).order_by('course_code')
            
            print(f"[GetStudentSubjectsView] Found {curriculum_subjects.count()} core curriculum subjects")
            
            # Now try to match each curriculum subject with a TeachingAssignment
            core_teaching_assignments = []
            subjects_without_ta = []
            
            for curr_subj in curriculum_subjects:
                # Try to find TeachingAssignment for this subject
                # First try: Match by section (preferred)
                ta_query = TeachingAssignment.objects.filter(
                    curriculum_row=curr_subj,
                    section=section,
                    academic_year=current_ay,
                    is_active=True
                ).select_related('staff', 'staff__user', 'curriculum_row')
                
                ta = ta_query.first()
                
                # Second try: Match by department (if section-specific TA not found)
                if not ta:
                    ta_query = TeachingAssignment.objects.filter(
                        curriculum_row=curr_subj,
                        academic_year=current_ay,
                        is_active=True
                    ).select_related('staff', 'staff__user', 'curriculum_row')
                    ta = ta_query.first()
                
                if ta:
                    core_teaching_assignments.append(ta)
                    staff_name = ta.staff.user.get_full_name() if ta.staff and ta.staff.user else "No staff"
                    print(f"[GetStudentSubjectsView]   ✓ {curr_subj.course_code}: {curr_subj.course_name} (Staff: {staff_name})")
                else:
                    # No TA found - will create pseudo-assignment
                    subjects_without_ta.append(curr_subj)
                    print(f"[GetStudentSubjectsView]   ⚠ {curr_subj.course_code}: {curr_subj.course_name} (No TA - will create pseudo)")
            
            print(f"[GetStudentSubjectsView] Matched {len(core_teaching_assignments)} subjects with TAs, {len(subjects_without_ta)} without TAs")
            
            # ========== STEP 2: Load Student's Elective Choices ==========
            print(f"[GetStudentSubjectsView] STEP 2: Loading student's elective choices")
            
            from curriculum.models import ElectiveChoice, ElectiveSubject
            
            # Get student's chosen electives
            # CRITICAL: Get ALL active choices without academic year restriction
            # Elective subjects may span multiple semesters within the same academic year
            # Students should only have active ElectiveChoice records for their current selections
            elective_choices = ElectiveChoice.objects.filter(
                student=student_profile,
                is_active=True
            ).select_related(
                'elective_subject', 
                'elective_subject__parent', 
                'elective_subject__department'
            )

            if effective_regulation_code:
                elective_choices = elective_choices.filter(elective_subject__regulation=effective_regulation_code)
            if target_semester_ids:
                elective_choices = elective_choices.filter(elective_subject__semester_id__in=target_semester_ids)
            
            print(f"[GetStudentSubjectsView] Total elective choices (all AYs, is_active=True): {elective_choices.count()}")
            
            if elective_choices.count() == 0:
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ NO active ElectiveChoice records found for this student!")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ Student will see NO electives in feedback form!")
            
            for i, choice in enumerate(elective_choices, 1):
                subj_code = choice.elective_subject.course_code if choice.elective_subject else 'N/A'
                subj_name = choice.elective_subject.course_name if choice.elective_subject else 'N/A'
                ay_name = choice.academic_year.name if choice.academic_year else 'No AY'
                sem_num = choice.elective_subject.semester.number if (choice.elective_subject and choice.elective_subject.semester) else 'N/A'
                print(f"[GetStudentSubjectsView]   Choice {i}: {subj_code} - {subj_name} (AY: {ay_name}, Sem: {sem_num}, Active: {choice.is_active})")
            
            # Check if filtering by current AY would reduce the count
            ay_filtered_choices = elective_choices.filter(academic_year=current_ay)
            ay_filtered_count = ay_filtered_choices.count()
            total_count = elective_choices.count()
            
            print(f"[GetStudentSubjectsView] AY filtering analysis: Total={total_count}, Current AY={ay_filtered_count}")
            
            # DECISION: Use ALL active choices without AY filtering
            # This ensures electives from different semesters within the year are all included
            # Students should only have is_active=True for their current selections
            if ay_filtered_count > 0 and ay_filtered_count < total_count:
                print(f"[GetStudentSubjectsView] ⚠️ WARNING: AY filter would exclude {total_count - ay_filtered_count} choices")
                print(f"[GetStudentSubjectsView] DECISION: Using ALL {total_count} active choices (no AY filter)")
            elif ay_filtered_count == total_count:
                print(f"[GetStudentSubjectsView] INFO: All choices belong to current AY")
            else:
                print(f"[GetStudentSubjectsView] INFO: Using all {total_count} active choices")
            
            # Do NOT filter by academic_year - use all active choices
            # This ensures 2nd year electives from both Sem 3 and Sem 4 are included
            
            # Build list of chosen course codes AND department mapping
            # CRITICAL: Map course_code -> department_id to filter staff by chosen department
            chosen_elective_codes = []
            elective_dept_map = {}  # Map course_code -> department_id from student's choice
            seen_codes_for_building = set()  # Track to avoid duplicates in chosen_elective_codes
            
            for choice in elective_choices:
                if choice.elective_subject and choice.elective_subject.course_code:
                    code = choice.elective_subject.course_code
                    dept = choice.elective_subject.department
                    
                    # Only add if not already added (avoid duplicate codes)
                    if code not in seen_codes_for_building:
                        chosen_elective_codes.append(code)
                        elective_dept_map[code] = dept.id if dept else None
                        seen_codes_for_building.add(code)
                        
                        dept_name = dept.code if dept else "No Dept"
                        print(f"[GetStudentSubjectsView]   - Student chose: {code} - {choice.elective_subject.course_name} (from {dept_name} dept)")
                    else:
                        print(f"[GetStudentSubjectsView]   - Skipping duplicate code: {code}")
            
            print(f"[GetStudentSubjectsView] Student's chosen elective codes ({len(chosen_elective_codes)} total): {chosen_elective_codes}")
            print(f"[GetStudentSubjectsView] Elective department mapping: {elective_dept_map}")
            
            if not chosen_elective_codes:
                print(f"[GetStudentSubjectsView] ⚠️ WARNING: No elective codes extracted from {elective_choices.count()} choices!")
            
            # ========== STEP 3: Load Elective Teaching Assignments WITH department preference ==========
            # CRITICAL: Show ALL student-chosen electives, prefer staff from chosen department
            # Student should see staff from the department they chose the elective from when available
            # But if not available, still show the elective with any available staff or "Staff Not Assigned"
            print(f"[GetStudentSubjectsView] STEP 3: Loading elective teaching assignments (prefer chosen department)")
            
            elective_teaching_assignments = []
            staff_map = {}  # Map course_code -> list of staff names
            
            if chosen_elective_codes:
                # Query each elective individually to apply correct department preference
                
                for code in chosen_elective_codes:
                    dept_id = elective_dept_map.get(code)
                    print(f"[GetStudentSubjectsView]   Processing {code} (preferred department: {dept_id})")
                    
                    found_staff = False
                    
                    # ATTEMPT 1: Try with department filter (preferred)
                    if dept_id:
                        ta_query = TeachingAssignment.objects.filter(
                            elective_subject__course_code=code,
                            elective_subject__department_id=dept_id,
                            academic_year=current_ay,
                            is_active=True
                        ).select_related('staff', 'staff__user', 'elective_subject', 'elective_subject__department')

                        if effective_regulation_code:
                            ta_query = ta_query.filter(elective_subject__regulation=effective_regulation_code)
                        if target_semester_ids:
                            ta_query = ta_query.filter(elective_subject__semester_id__in=target_semester_ids)
                        
                        for ta in ta_query:
                            if ta.staff and ta.staff.user:
                                staff_name = ta.staff.user.get_full_name() or ta.staff.user.username or "Unknown"
                            else:
                                staff_name = "Unknown"
                            
                            if code not in staff_map:
                                staff_map[code] = []
                            if staff_name and staff_name.strip() and staff_name not in staff_map[code]:
                                staff_map[code].append(staff_name)
                                dept_code = ta.elective_subject.department.code if ta.elective_subject.department else "N/A"
                                print(f"[GetStudentSubjectsView]     ✓ Found TA (preferred dept): {code} - {staff_name} (dept: {dept_code})")
                                found_staff = True
                    
                    # ATTEMPT 2: Try WITHOUT department filter (fallback)
                    if not found_staff:
                        ta_query = TeachingAssignment.objects.filter(
                            elective_subject__course_code=code,
                            academic_year=current_ay,
                            is_active=True
                        ).select_related('staff', 'staff__user', 'elective_subject', 'elective_subject__department')

                        if effective_regulation_code:
                            ta_query = ta_query.filter(elective_subject__regulation=effective_regulation_code)
                        if target_semester_ids:
                            ta_query = ta_query.filter(elective_subject__semester_id__in=target_semester_ids)
                        
                        for ta in ta_query:
                            if ta.staff and ta.staff.user:
                                staff_name = ta.staff.user.get_full_name() or ta.staff.user.username or "Unknown"
                            else:
                                staff_name = "Unknown"
                            
                            if code not in staff_map:
                                staff_map[code] = []
                            if staff_name and staff_name.strip() and staff_name not in staff_map[code]:
                                staff_map[code].append(staff_name)
                                dept_code = ta.elective_subject.department.code if ta.elective_subject.department else "N/A"
                                print(f"[GetStudentSubjectsView]     ✓ Found TA (any dept): {code} - {staff_name} (dept: {dept_code})")
                                found_staff = True
                    
                    # ATTEMPT 3: Try curriculum_row method (for elective placeholders)
                    if not found_staff:
                        ta_query_base = TeachingAssignment.objects.filter(
                            curriculum_row__course_code=code,
                            curriculum_row__is_elective=True,
                            academic_year=current_ay,
                            is_active=True
                        )
                        
                        # First try with dept filter if available
                        if dept_id:
                            ta_query = ta_query_base.filter(curriculum_row__department_id=dept_id)
                            tas = ta_query.select_related('staff', 'staff__user', 'curriculum_row', 'curriculum_row__department')
                        else:
                            tas = ta_query_base.select_related('staff', 'staff__user', 'curriculum_row', 'curriculum_row__department')
                        
                        # If nothing found with dept filter, try without
                        if not tas.exists() and dept_id:
                            tas = ta_query_base.select_related('staff', 'staff__user', 'curriculum_row', 'curriculum_row__department')
                        
                        for ta in tas:
                            if ta.staff and ta.staff.user:
                                staff_name = ta.staff.user.get_full_name() or ta.staff.user.username or "Unknown"
                            else:
                                staff_name = "Unknown"
                            if code not in staff_map:
                                staff_map[code] = []
                            if staff_name and staff_name.strip() and staff_name not in staff_map[code]:
                                staff_map[code].append(staff_name)
                                dept_code = ta.curriculum_row.department.code if ta.curriculum_row.department else "N/A"
                                print(f"[GetStudentSubjectsView]     ✓ Found TA (curriculum_row): {code} - {staff_name} (dept: {dept_code})")
                                found_staff = True
                    
                    # ATTEMPT 4: Try legacy subject table (last resort)
                    if not found_staff:
                        from academics.models import Subject
                        tas_by_subject = TeachingAssignment.objects.filter(
                            subject__code=code,
                            academic_year=current_ay,
                            is_active=True
                        ).select_related('staff', 'staff__user', 'subject')
                        
                        for ta in tas_by_subject:
                            if ta.staff and ta.staff.user:
                                staff_name = ta.staff.user.get_full_name() or ta.staff.user.username or "Unknown"
                            else:
                                staff_name = "Unknown"
                            if code not in staff_map:
                                staff_map[code] = []
                            if staff_name and staff_name.strip() and staff_name not in staff_map[code]:
                                staff_map[code].append(staff_name)
                                print(f"[GetStudentSubjectsView]     ✓ Found TA (subject): {code} - {staff_name}")
                                found_staff = True
                    
                    # If still no staff found, mark for later pseudo-assignment creation
                    if not found_staff:
                        print(f"[GetStudentSubjectsView]     ⚠ No TA found for {code}, will create pseudo-assignment")
                
                # Collect unique TAs for electives (store first TA for each course_code for feedback submission)
                # Query again to get actual TA objects for each code
                seen_codes = set()
                for code in chosen_elective_codes:
                    if code in seen_codes:
                        continue
                    
                    dept_id = elective_dept_map.get(code)
                    ta = None
                    
                    # Try to find a TA for this code (prefer department filter, fallback to any)
                    if dept_id:
                        ta = TeachingAssignment.objects.filter(
                            elective_subject__course_code=code,
                            elective_subject__department_id=dept_id,
                            academic_year=current_ay,
                            is_active=True
                        ).select_related('staff', 'staff__user', 'elective_subject', 'elective_subject__department').first()
                    
                    # Fallback: try without department filter
                    if not ta:
                        ta = TeachingAssignment.objects.filter(
                            elective_subject__course_code=code,
                            academic_year=current_ay,
                            is_active=True
                        ).select_related('staff', 'staff__user', 'elective_subject', 'elective_subject__department').first()
                    
                    if ta:
                        elective_teaching_assignments.append(ta)
                        seen_codes.add(code)
                    else:
                        # Try curriculum_row method (prefer dept, fallback to any)
                        ta = None
                        if dept_id:
                            ta = TeachingAssignment.objects.filter(
                                curriculum_row__course_code=code,
                                curriculum_row__is_elective=True,
                                curriculum_row__department_id=dept_id,
                                academic_year=current_ay,
                                is_active=True
                            ).select_related('staff', 'staff__user', 'curriculum_row').first()

                            if ta and effective_regulation_code and ta.curriculum_row and ta.curriculum_row.regulation != effective_regulation_code:
                                ta = None
                        
                        # Fallback: try without department filter
                        if not ta:
                            ta = TeachingAssignment.objects.filter(
                                curriculum_row__course_code=code,
                                curriculum_row__is_elective=True,
                                academic_year=current_ay,
                                is_active=True
                            ).select_related('staff', 'staff__user', 'curriculum_row').first()

                            if ta and effective_regulation_code and ta.curriculum_row and ta.curriculum_row.regulation != effective_regulation_code:
                                ta = None
                        
                        if ta:
                            elective_teaching_assignments.append(ta)
                            seen_codes.add(code)
                        else:
                            # Try subject method as last resort
                            from academics.models import Subject
                            ta = TeachingAssignment.objects.filter(
                                subject__code=code,
                                academic_year=current_ay,
                                is_active=True
                            ).select_related('staff', 'staff__user', 'subject').first()
                            
                            if ta:
                                elective_teaching_assignments.append(ta)
                                seen_codes.add(code)
            
            print(f"[GetStudentSubjectsView] Found {len(elective_teaching_assignments)} elective teaching assignments")
            print(f"[GetStudentSubjectsView] Expected {len(chosen_elective_codes)} electives, got {len(elective_teaching_assignments)} TAs")
            print(f"[GetStudentSubjectsView] Staff mapping for {len(staff_map)} elective codes:")
            for code, staff_list in staff_map.items():
                print(f"[GetStudentSubjectsView]   {code}: {staff_list}")
            
            # Check for missing electives
            ta_codes = set()
            for ta in elective_teaching_assignments:
                if ta.elective_subject:
                    ta_codes.add(ta.elective_subject.course_code)
                elif ta.curriculum_row:
                    ta_codes.add(ta.curriculum_row.course_code)
                elif ta.subject:
                    ta_codes.add(ta.subject.code)
                elif hasattr(ta, 'id') and isinstance(ta.id, str) and ta.id.startswith('pseudo_'):
                    if ta.elective_subject:
                        ta_codes.add(ta.elective_subject.course_code)
            
            missing_codes = set(chosen_elective_codes) - ta_codes
            if missing_codes:
                print(f"[GetStudentSubjectsView] ⚠️ WARNING: Missing TAs for codes: {missing_codes}")
            
            # ========== STEP 4: Load Elective Subject Details ==========
            print(f"[GetStudentSubjectsView] STEP 4: Loading elective subject details")
            
            elective_subjects_map = {}  # Map course_code -> ElectiveSubject
            
            if chosen_elective_codes:
                # Load each elective subject (prefer department filter, fallback to any)  
                for code in chosen_elective_codes:
                    dept_id = elective_dept_map.get(code)
                    elec_subj = None
                    
                    # Try with department filter first (preferred)
                    if dept_id:
                        elec_subj = ElectiveSubject.objects.filter(
                            course_code=code,
                            department_id=dept_id
                        ).select_related('parent', 'department').first()

                        if elec_subj and effective_regulation_code and elec_subj.regulation != effective_regulation_code:
                            elec_subj = None
                    
                    # Fallback: try without department filter to ensure ALL chosen electives appear
                    if not elec_subj:
                        elec_subj = ElectiveSubject.objects.filter(
                            course_code=code
                        ).select_related('parent', 'department').first()

                        if elec_subj and effective_regulation_code and elec_subj.regulation != effective_regulation_code:
                            elec_subj = None

                    if elec_subj and target_semester_ids and elec_subj.semester_id not in target_semester_ids:
                        elec_subj = None
                    
                    if elec_subj:
                        elective_subjects_map[code] = elec_subj
                        dept_name = elec_subj.department.code if elec_subj.department else "No Dept"
                        print(f"[GetStudentSubjectsView]   - Elective subject: {elec_subj.course_code} - {elec_subj.course_name} (dept: {dept_name})")
                    else:
                        print(f"[GetStudentSubjectsView]   ⚠ WARNING: Elective subject not found in database for code: {code}")
                        print(f"[GetStudentSubjectsView]   ⚠ Student chose this elective but ElectiveSubject record doesn't exist!")
            
            print(f"[GetStudentSubjectsView] Loaded {len(elective_subjects_map)} elective subjects from {len(chosen_elective_codes)} chosen codes")
            if len(elective_subjects_map) < len(chosen_elective_codes):
                missing_codes = set(chosen_elective_codes) - set(elective_subjects_map.keys())
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ MISSING {len(missing_codes)} elective records: {missing_codes}")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ These electives will NOT appear unless corrected!")
            
            # ========== STEP 5: Build pseudo-assignments for subjects without TAs ==========
            # CRITICAL: Show ALL subjects (core + elective) even if no TeachingAssignment exists
            print(f"[GetStudentSubjectsView] STEP 5: Creating pseudo-assignments for subjects without TAs")
            
            class PseudoAssignment:
                def __init__(self, subject_obj, subject_type='elective'):
                    """
                    Create a pseudo teaching assignment for subjects without real TAs.
                    
                    Args:
                        subject_obj: Either ElectiveSubject or CurriculumDepartment instance
                        subject_type: 'elective' or 'core'
                    """
                    # Use negative ID to avoid collision with real TeachingAssignment IDs
                    # This ensures teaching_assignment_id is an integer for frontend compatibility
                    self.id = -subject_obj.id
                    
                    if subject_type == 'elective':
                        self.elective_subject = subject_obj
                        self.curriculum_row = None
                    else:  # core
                        self.elective_subject = None
                        self.curriculum_row = subject_obj
                    
                    self.subject = None
                    self.custom_subject = None
                    self.staff = None
                    self.is_pseudo = True  # Flag to identify pseudo-assignments
            
            # Create pseudo-assignments for CORE subjects without TAs
            for curr_subj in subjects_without_ta:
                pseudo = PseudoAssignment(curr_subj, subject_type='core')
                core_teaching_assignments.append(pseudo)
                print(f"[GetStudentSubjectsView]   ⚠ Created pseudo for core subject: {curr_subj.course_code} - {curr_subj.course_name}")
            
            print(f"[GetStudentSubjectsView] Total core assignments (including pseudo): {len(core_teaching_assignments)}")
            
            # Iterate over ALL chosen elective codes (not just those in elective_subjects_map)
            for code in chosen_elective_codes:
                # Get the ElectiveSubject if it exists
                elec_subj = elective_subjects_map.get(code)
                
                if not elec_subj:
                    # ElectiveSubject record missing - can't create pseudo-assignment
                    print(f"[GetStudentSubjectsView]   ⚠⚠⚠ CRITICAL: Cannot create assignment for {code} - ElectiveSubject record missing!")
                    print(f"[GetStudentSubjectsView]   ⚠⚠⚠ This elective will NOT appear in feedback form!")
                    print(f"[GetStudentSubjectsView]   ⚠⚠⚠ Action needed: Verify ElectiveSubject exists for course_code='{code}'")
                    continue
                
                # Check if we have a teaching assignment for this code
                has_ta = any(
                    ta for ta in elective_teaching_assignments 
                    if (ta.elective_subject and ta.elective_subject.course_code == code) or
                       (ta.curriculum_row and ta.curriculum_row.course_code == code) or
                       (ta.subject and ta.subject.code == code)
                )
                
                if not has_ta:
                    # No teaching assignment found - create pseudo for elective
                    pseudo = PseudoAssignment(elec_subj, subject_type='elective')
                    elective_teaching_assignments.append(pseudo)
                    staff_map[code] = ["Staff Not Assigned"]
                    print(f"[GetStudentSubjectsView]   ⚠ No TA for elective {code}, created pseudo-assignment")
                elif code in staff_map and not staff_map[code]:
                    # TA exists but no valid staff names found - set fallback
                    staff_map[code] = ["Staff Not Assigned"]
                    print(f"[GetStudentSubjectsView]   ⚠ TA found for {code} but no valid staff names, using fallback")
                elif code not in staff_map:
                    # TA exists but not in staff_map (shouldn't happen, but handle it)
                    staff_map[code] = ["Staff Not Assigned"]
                    print(f"[GetStudentSubjectsView]   ⚠ TA found for {code} but not in staff_map, using fallback")
            
            # ========== STEP 6: Combine Core + Elective Lists ==========
            print(f"[GetStudentSubjectsView] STEP 6: Combining core and elective subjects")
            
            all_teaching_assignments = list(core_teaching_assignments) + elective_teaching_assignments
            
            print(f"[GetStudentSubjectsView] Total: {len(all_teaching_assignments)} subjects ({len(core_teaching_assignments)} core + {len(elective_teaching_assignments)} electives)")
            print(f"[GetStudentSubjectsView] Elective breakdown:")
            for i, ta in enumerate(elective_teaching_assignments, 1):
                if hasattr(ta, 'is_pseudo') and ta.is_pseudo:
                    code = ta.elective_subject.course_code if ta.elective_subject else 'N/A'
                    name = ta.elective_subject.course_name if ta.elective_subject else 'N/A'
                    print(f"[GetStudentSubjectsView]   {i}. {code} - {name} [PSEUDO]")
                elif ta.elective_subject:
                    print(f"[GetStudentSubjectsView]   {i}. {ta.elective_subject.course_code} - {ta.elective_subject.course_name} [TA]")
                elif ta.curriculum_row:
                    print(f"[GetStudentSubjectsView]   {i}. {ta.curriculum_row.course_code} - {ta.curriculum_row.course_name} [CURRICULUM]")
                elif ta.subject:
                    print(f"[GetStudentSubjectsView]   {i}. {ta.subject.code} - {ta.subject.name} [SUBJECT]")
            
            # ========== STEP 7: Build subject response list ==========
            print(f"[GetStudentSubjectsView] STEP 7: Building subject response list")
            
            subjects = []
            for assignment in all_teaching_assignments:
                # Get subject name and code from different possible sources
                subject_name = None
                subject_code = None
                is_elective = False
                
                # Priority 1: curriculum_row (most common for regular subjects)
                if assignment.curriculum_row:
                    subject_name = assignment.curriculum_row.course_name
                    subject_code = assignment.curriculum_row.course_code
                    is_elective = assignment.curriculum_row.is_elective
                # Priority 2: elective_subject (elective courses)
                elif assignment.elective_subject:
                    subject_name = assignment.elective_subject.course_name
                    subject_code = assignment.elective_subject.course_code
                    is_elective = True
                # Priority 3: subject (legacy subjects)
                elif assignment.subject:
                    subject_name = assignment.subject.name
                    subject_code = assignment.subject.code
                # Priority 4: custom_subject (special subjects like Sports, Yoga)
                elif assignment.custom_subject:
                    subject_name = assignment.get_custom_subject_display()
                    subject_code = assignment.custom_subject
                
                if not subject_name:
                    print(f"[GetStudentSubjectsView] Skipping assignment {assignment.id} - no subject name found")
                    continue
                
                # Get staff name
                staff_id = None
                
                if is_elective and subject_code and subject_code in staff_map and staff_map[subject_code]:
                    # For ELECTIVES: Use staff_map which may have multiple staff members
                    staff_list = [s for s in staff_map[subject_code] if s and s.strip()]  # Filter empty names
                    if staff_list:
                        staff_name = ", ".join(staff_list)
                        print(f"[GetStudentSubjectsView] Elective {subject_code}: {len(staff_list)} staff - {staff_name}")
                    else:
                        staff_name = "Staff Not Assigned"
                        print(f"[GetStudentSubjectsView] Elective {subject_code}: Empty staff list, showing 'Staff Not Assigned'")
                elif assignment.staff:
                    # For CORE subjects: Use the staff from teaching assignment
                    staff_name = assignment.staff.user.get_full_name() or assignment.staff.user.username
                    staff_id = assignment.staff.id
                    print(f"[GetStudentSubjectsView] Core subject {subject_code}: {staff_name}")
                else:
                    # No staff assigned
                    staff_name = "Staff Not Assigned"
                    print(f"[GetStudentSubjectsView] No staff for {subject_code}")
                
                # Check if student has already submitted feedback for this subject
                # For pseudo-assignments (electives without TAs), check using negative ID
                if hasattr(assignment, 'is_pseudo') and assignment.is_pseudo:
                    # Pseudo-assignments use negative IDs - feedback submissions for these
                    # will have NULL teaching_assignment, so we can't check completion reliably.
                    # For now, always show as not completed for pseudo-assignments
                    existing_responses = False
                else:
                    existing_responses = FeedbackResponse.objects.filter(
                        feedback_form=feedback_form,
                        user=request.user,
                        teaching_assignment=assignment
                    ).exists()
                
                subjects.append({
                    'teaching_assignment_id': assignment.id,
                    'subject_name': subject_name,
                    'subject_code': subject_code,
                    'staff_name': staff_name,
                    'staff_id': staff_id,
                    'is_completed': existing_responses,
                    'type': 'ELECTIVE' if is_elective else 'CORE'
                })
            
            # Calculate completion status from mapped subjects only (real teaching assignments).
            mapped_subjects = [s for s in subjects if s['teaching_assignment_id'] and s['teaching_assignment_id'] > 0]
            total_subjects = len(mapped_subjects)
            completed_subjects = sum(1 for s in mapped_subjects if s['is_completed'])
            
            # Count by type for debugging
            core_count = sum(1 for s in subjects if s['type'] == 'CORE')
            elective_count = sum(1 for s in subjects if s['type'] == 'ELECTIVE')
            
            print(f"[GetStudentSubjectsView] ========== FINAL SUMMARY ==========")
            print(f"[GetStudentSubjectsView] Returning {total_subjects} total subjects:")
            print(f"[GetStudentSubjectsView]   - CORE: {core_count}")
            print(f"[GetStudentSubjectsView]   - ELECTIVE: {elective_count}")
            print(f"[GetStudentSubjectsView]   - Completed: {completed_subjects}")
            print(f"[GetStudentSubjectsView] Elective subjects returned:")
            for s in subjects:
                if s['type'] == 'ELECTIVE':
                    print(f"[GetStudentSubjectsView]   → {s['subject_code']}: {s['subject_name']} - {s['staff_name']}")
            
            if elective_count == 0:
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ NO ELECTIVES IN RESPONSE!")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ Possible reasons:")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ 1. Student has no ElectiveChoice records (check earlier log)")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ 2. ElectiveChoice records exist but elective_subject is NULL")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ 3. ElectiveSubject records missing for chosen course codes")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ 4. All chosen electives were skipped in final loop")
                print(f"[GetStudentSubjectsView] ⚠⚠⚠ Run: python manage.py shell < check_elective_data.py")
            
            print(f"[GetStudentSubjectsView] ===================================")
            
            if total_subjects == 0:
                print(f"[GetStudentSubjectsView] WARNING: No subjects found!")
                print(f"  - Student section: {section.name} (ID: {section.id})")
                print(f"  - Student year: {student_year}")
                print(f"  - Student department: {student_department.code if student_department else 'None'}")
                print(f"  - Feedback form years: {feedback_form.years}")
                print(f"  - Feedback form sections: {feedback_form.sections}")
                print(f"  - Feedback form department: {feedback_form.department.code}")
            
            return Response({
                'feedback_form_id': form_id,
                'subjects': subjects,
                'total_subjects': total_subjects,
                'completed_subjects': completed_subjects,
                'all_completed': completed_subjects == total_subjects and total_subjects > 0
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.exception('[GetStudentSubjectsView] ERROR')
            return Response({
                'detail': 'Error fetching subjects. Please try again.',
                'subjects': [],
                'total_subjects': 0,
                'completed_subjects': 0,
                'all_completed': False
            }, status=status.HTTP_200_OK)


class DiagnosticElectiveChoicesView(APIView):
    """
    Diagnostic API: Check ElectiveChoice records for current user
    GET /api/feedback/diagnostic/elective-choices/
    
    Returns all ElectiveChoice records for the logged-in student to debug why electives aren't showing
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            from curriculum.models import ElectiveChoice
            from academics.models import StudentProfile, AcademicYear
            
            # Get student profile
            try:
                student_profile = StudentProfile.objects.select_related(
                    'current_section', 
                    'current_section__department'
                ).get(user=request.user)
            except StudentProfile.DoesNotExist:
                return Response({
                    'detail': 'Student profile not found',
                    'is_student': False
                }, status=status.HTTP_200_OK)
            
            # Get current academic year
            current_ay = AcademicYear.objects.filter(is_active=True).first()
            
            # Fetch all elective choices (with and without AY filter)
            all_choices = ElectiveChoice.objects.filter(
                student=student_profile
            ).select_related(
                'elective_subject', 
                'elective_subject__parent',
                'academic_year'
            ).order_by('-created_at')
            
            # Separate active and inactive
            active_choices = all_choices.filter(is_active=True)
            
            # Categorize by parent category
            categorized = {}
            for choice in active_choices:
                category = choice.elective_subject.parent.category if choice.elective_subject.parent else 'Unknown'
                if category not in categorized:
                    categorized[category] = []
                
                categorized[category].append({
                    'id': choice.id,
                    'course_code': choice.elective_subject.course_code,
                    'course_name': choice.elective_subject.course_name,
                    'semester': choice.elective_subject.semester,
                    'academic_year': choice.academic_year.name if choice.academic_year else None,
                    'is_active': choice.is_active,
                    'created_at': choice.created_at.isoformat(),
                    'matches_current_ay': choice.academic_year == current_ay if choice.academic_year else False
                })
            
            return Response({
                'student': {
                    'name': student_profile.user.get_full_name(),
                    'roll_number': student_profile.roll_number,
                    'section': student_profile.current_section.name if student_profile.current_section else None,
                    'year': student_profile.current_year
                },
                'current_academic_year': current_ay.name if current_ay else None,
                'total_choices': all_choices.count(),
                'active_choices': active_choices.count(),
                'categorized_choices': categorized,
                'debug_info': {
                    'note': 'If OE subjects not showing, check if ElectiveChoice records exist with is_active=True',
                    'expected_category': 'Open Elective (should contain "Open Elective" in parent.category)',
                }
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.exception('[DiagnosticElectiveChoicesView] ERROR')
            return Response({
                'detail': 'An error occurred. Please try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DeleteFeedbackFormView(APIView):
    """
    API 11: Delete Feedback Form (HOD)
    DELETE /api/feedback/<form_id>/delete/
    
    Allows HOD to permanently delete a deactivated feedback form.
    Only deactivated forms (active=False) can be deleted.
    """
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, form_id):
        try:
            # Check if user has permission to delete feedback forms
            user_permissions = get_user_permissions(request.user)
            if 'feedback.create' not in user_permissions:
                return Response({
                    'detail': 'You do not have permission to delete feedback forms.'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # Get the feedback form
            try:
                feedback_form = FeedbackForm.objects.get(id=form_id)
            except FeedbackForm.DoesNotExist:
                return Response({
                    'detail': 'Feedback form not found.'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Verify the user is the creator or has HOD access to the department
            from academics.models import StaffProfile, DepartmentRole, AcademicYear
            try:
                staff_profile = StaffProfile.objects.get(user=request.user)
            except StaffProfile.DoesNotExist:
                return Response({
                    'detail': 'Staff profile not found.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if user created this form OR is HOD of the department
            is_creator = feedback_form.created_by == request.user
            is_hod = False
            
            active_ay = AcademicYear.objects.filter(is_active=True).first()
            if active_ay:
                is_hod = DepartmentRole.objects.filter(
                    staff=staff_profile,
                    department=feedback_form.department,
                    role='HOD',
                    is_active=True,
                    academic_year=active_ay
                ).exists()
            
            if not (is_creator or is_hod):
                return Response({
                    'detail': 'You do not have permission to delete this feedback form.'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # Only allow deletion of deactivated forms
            if feedback_form.active:
                return Response({
                    'detail': 'Cannot delete active feedback forms. Please deactivate the form first.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Store form info for response
            form_type = feedback_form.get_type_display()
            
            # Delete the form (cascade will delete questions and responses)
            feedback_form.delete()
            
            return Response({
                'detail': f'{form_type} feedback form deleted successfully.',
                'deleted_form_id': form_id
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'detail': f'Error deleting feedback form: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GetSubjectsByYearView(APIView):
    """
    API 10: Get Subjects by Year (Supports Multiple Years and Section Filtering)
    GET /api/feedback/subjects-by-year/?years=2,3&sections=1,2&department_id=1
    
    Returns list of subjects (teaching assignments) for given years, sections, and department.
    Used by HOD when creating subject feedback to preview what subjects will be included.
    Supports multiple years via comma-separated values or multiple year parameters.
    Optionally filters by specific section IDs.
    
    HOD View: Shows ALL subjects (core + ALL electives) with staff names from TeachingAssignment.
    This is different from student view which only shows electives the student has chosen.
    
    Parameters:
    - years: Comma-separated year numbers (e.g., "2,3,4")
    - sections: Comma-separated section IDs (optional, e.g., "1,2,3")
    - department_id: Department ID (optional)
    - semester: Semester ID (optional)
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            # Support both 'years' (comma-separated) and multiple 'year' parameters
            years_param = request.GET.get('years')
            semester_id = request.GET.get('semester')
            department_id = request.GET.get('department_id')
            sections_param = request.GET.get('sections')  # NEW: section IDs filter
            preview_only = str(request.GET.get('preview_only', '')).lower() in ['1', 'true', 'yes']
            include_electives = str(request.GET.get('include_electives', '1')).lower() not in ['0', 'false', 'no']
            
            # Parse years
            years = []
            if years_param:
                # Comma-separated years: "2,3,4"
                try:
                    years = [int(y.strip()) for y in years_param.split(',') if y.strip()]
                except ValueError:
                    return Response({
                        'detail': 'Years must be comma-separated integers.'
                    }, status=status.HTTP_400_BAD_REQUEST)
            else:
                # Fall back to single 'year' parameter for backward compatibility
                year_param = request.GET.get('year')
                if year_param:
                    try:
                        years = [int(year_param)]
                    except ValueError:
                        return Response({
                            'detail': 'Year must be a valid integer.'
                        }, status=status.HTTP_400_BAD_REQUEST)
            
            if not years:
                return Response({
                    'detail': 'Years parameter is required.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Parse section IDs if provided
            section_ids_filter = None
            if sections_param:
                try:
                    section_ids_filter = [int(s.strip()) for s in sections_param.split(',') if s.strip()]
                except ValueError:
                    return Response({
                        'detail': 'Sections must be comma-separated integers (section IDs).'
                    }, status=status.HTTP_400_BAD_REQUEST)
            
            # Import required models
            from academics.models import (
                TeachingAssignment, 
                AcademicYear, 
                Section,
                Department,
                DepartmentRole
            )
            from curriculum.models import ElectiveSubject, CurriculumDepartment
            
            # Determine active department for HOD
            if not department_id:
                try:
                    staff_profile = StaffProfile.objects.get(user=request.user)
                    active_ay = AcademicYear.objects.filter(is_active=True).first()
                    
                    if active_ay:
                        department_roles = DepartmentRole.objects.select_related('department').filter(
                            staff=staff_profile,
                            role='HOD',
                            is_active=True,
                            academic_year=active_ay
                        )
                        
                        departments_count = department_roles.count()
                        
                        if departments_count > 1:
                            # Multiple departments - use session
                            active_dept_id = request.session.get('active_hod_department_id')
                            if active_dept_id:
                                department_id = active_dept_id
                            else:
                                # Use first department
                                department_id = department_roles.first().department.id
                        elif departments_count == 1:
                            # Single department
                            department_id = department_roles.first().department.id
                        else:
                            # No department roles, fall back to staff profile
                            if staff_profile.department:
                                department_id = staff_profile.department.id
                    else:
                        # No active AY, fall back to staff profile
                        if staff_profile.department:
                            department_id = staff_profile.department.id
                except StaffProfile.DoesNotExist:
                    pass
            
            # Get active academic year
            current_ay = AcademicYear.objects.filter(is_active=True).first()
            if not current_ay:
                return Response({
                    'detail': 'No active academic year found.'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Calculate batch start years for all given years
            try:
                acad_start = int(str(current_ay.name).split('-')[0])
                batch_start_years = [acad_start - year + 1 for year in years]
                print(f"[GetSubjectsByYearView] Academic year: {current_ay.name}, acad_start: {acad_start}")
                print(f"[GetSubjectsByYearView] Requested years: {years}, calculated batch_start_years: {batch_start_years}")
            except Exception as e:
                print(f"[GetSubjectsByYearView] Error calculating batch years: {str(e)}")
                return Response({
                    'detail': 'Error calculating batch years.'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Build filters for sections (multiple batch start years)
            section_filters = Q(
                batch__start_year__in=batch_start_years
            )
            
            # Filter by department if provided
            if department_id:
                try:
                    department_id = int(department_id)
                    section_filters &= (
                        Q(managing_department_id=department_id)
                        | Q(batch__course__department_id=department_id)
                        | Q(batch__department_id=department_id)
                    )
                    print(f"[GetSubjectsByYearView] Filtering by department_id: {department_id}")
                except ValueError:
                    pass
            
            # Filter by semester if provided
            if semester_id:
                try:
                    semester_id = int(semester_id)
                    section_filters &= Q(semester_id=semester_id)
                    print(f"[GetSubjectsByYearView] Filtering by semester_id: {semester_id}")
                except ValueError:
                    pass
            
            # Filter by specific section IDs if provided
            if section_ids_filter:
                section_filters &= Q(id__in=section_ids_filter)
                print(f"[GetSubjectsByYearView] Filtering by section IDs: {section_ids_filter}")
            
            # Get matching sections
            sections = Section.objects.filter(section_filters).select_related(
                'managing_department',
                'batch__regulation',
                'batch__course__department',
                'batch__department'
            ).distinct()
            print(f"[GetSubjectsByYearView] Found {sections.count()} sections")

            context = _derive_regulation_semester_context(sections)
            regulation_ids = context['regulation_ids']
            regulation_codes = context['regulation_codes']
            semesters_for_years = context['semester_ids']
            semester_numbers = context['semester_numbers']
            print(
                f"[GetSubjectsByYearView] Regulation context from sections: "
                f"regulation_ids={regulation_ids}, semester_ids={semesters_for_years}, semester_numbers={semester_numbers}"
            )

            if not semesters_for_years:
                return Response({
                    'detail': 'No active semester context could be resolved from selected sections.',
                    'subjects': [],
                    'regular_subjects': [],
                    'elective_subjects': [],
                    'elective_categories': [],
                    'elective_groups': [],
                    'total_subjects': 0,
                    'has_electives': False,
                    'years': years,
                    'semester_id': semester_id,
                    'department_id': department_id,
                    'section_ids': section_ids_filter,
                    'regulation_ids': regulation_ids,
                    'regulation_codes': regulation_codes,
                }, status=status.HTTP_200_OK)
            
            # Create a mapping of section_id to year for display
            section_to_year = {}
            section_ids = []
            
            if sections.exists():
                for section in sections:
                    if section.batch and section.batch.start_year:
                        try:
                            section_start_year = int(section.batch.start_year)
                        except Exception:
                            section_start_year = None

                        # Calculate which year this section belongs to
                        for year in years:
                            expected_start = acad_start - year + 1
                            if section_start_year == expected_start:
                                section_to_year[section.id] = year
                                break
                
                section_ids = [s.id for s in sections]
            else:
                # Debug: Check what sections exist for these batch years without department filter
                all_sections = Section.objects.filter(batch__start_year__in=batch_start_years).distinct()
                print(f"[GetSubjectsByYearView] DEBUG: Total sections with these batch years (no dept filter): {all_sections.count()}")
                if all_sections.exists():
                    for sec in all_sections[:5]:
                        print(f"  - Section: {sec.name}, Batch: {sec.batch.name if sec.batch else 'None'}, Dept: {sec.batch.course.department.code if sec.batch and sec.batch.course else 'None'}")
                
                print(f"[GetSubjectsByYearView] No sections found, but will still fetch elective subjects from curriculum")
            
            print(f"[GetSubjectsByYearView] Semester numbers from section context: {semester_numbers}")
            
            print(f"[GetSubjectsByYearView] Fetching teaching assignments for {len(section_ids)} sections")
            
            # Build subject list with unique subjects
            subjects_dict = {}
            elective_groups = {}  # Group electives by parent category
            
            # Fetch teaching assignments for these sections (if sections exist)
            if section_ids:
                teaching_assignments = TeachingAssignment.objects.filter(
                    section_id__in=section_ids,
                    academic_year=current_ay,
                    is_active=True
                ).select_related(
                    'staff', 
                    'staff__user', 
                    'subject', 
                    'curriculum_row',
                    'elective_subject',
                    'elective_subject__parent',  # Load parent for elective grouping
                    'elective_subject__department',  # Load department for OE subjects
                    'section'
                ).distinct()
                
                if regulation_codes:
                    teaching_assignments = teaching_assignments.filter(
                        Q(curriculum_row__regulation__in=regulation_codes)
                        | Q(elective_subject__regulation__in=regulation_codes)
                        | Q(curriculum_row__isnull=True, elective_subject__isnull=True)
                    )

                print(f"[GetSubjectsByYearView] Found {teaching_assignments.count()} teaching assignments")
            else:
                teaching_assignments = []
                print(f"[GetSubjectsByYearView] No sections found, skipping teaching assignments")
            
            for assignment in teaching_assignments:
                # Get subject name and code
                subject_name = None
                subject_code = None
                subject_key = None
                is_elective = False
                elective_category = None
                department_name = None
                department_code = None
                
                if assignment.elective_subject:
                    # This is an elective subject
                    is_elective = True
                    subject_name = assignment.elective_subject.course_name
                    subject_code = assignment.elective_subject.course_code
                    normalized_code = (subject_code or '').strip().upper()
                    subject_key = f"elec_code_{normalized_code}" if normalized_code else f"elec_{assignment.elective_subject.id}"
                    
                    # Get department info for elective subjects (important for OE)
                    if assignment.elective_subject.department:
                        department_name = assignment.elective_subject.department.name
                        department_code = assignment.elective_subject.department.code
                    
                    # Get parent category for grouping
                    if assignment.elective_subject.parent:
                        elective_category = assignment.elective_subject.parent.category or 'Other Electives'
                    else:
                        elective_category = 'Other Electives'
                        
                elif assignment.curriculum_row:
                    subject_name = assignment.curriculum_row.course_name
                    subject_code = assignment.curriculum_row.course_code
                    is_elective = assignment.curriculum_row.is_elective

                    # Skip placeholder rows like "Professional Elective IV" from core list.
                    row_name = (subject_name or '').strip().lower()
                    if (not is_elective) and ('elective' in row_name):
                        continue

                    normalized_code = (subject_code or '').strip().upper()
                    if is_elective:
                        subject_key = f"elec_code_{normalized_code}" if normalized_code else f"elec_name_{row_name}"
                    else:
                        subject_key = f"core_code_{normalized_code}" if normalized_code else f"core_name_{row_name}"

                    if is_elective:
                        elective_category = assignment.curriculum_row.category or 'Other Electives'
                        
                elif assignment.subject:
                    subject_name = assignment.subject.name
                    subject_code = assignment.subject.code
                    normalized_code = (subject_code or '').strip().upper()
                    subject_key = f"core_code_{normalized_code}" if normalized_code else f"subj_{assignment.subject.id}"
                    
                elif assignment.custom_subject:
                    subject_name = assignment.get_custom_subject_display()
                    subject_code = assignment.custom_subject
                    normalized_code = (subject_code or '').strip().upper()
                    subject_key = f"core_code_{normalized_code}" if normalized_code else f"cust_{assignment.custom_subject}"
                
                if not subject_name or not subject_key:
                    continue
                
                # Get staff name
                staff_name = assignment.staff.user.get_full_name() or assignment.staff.user.username
                section_name = assignment.section.name if assignment.section else 'N/A'
                
                # Get year for this assignment
                year_for_display = section_to_year.get(assignment.section.id) if assignment.section else None
                
                # Build subject data
                subject_data = {
                    'subject_name': subject_name,
                    'subject_code': subject_code,
                    'staff': set(),
                    'sections': set(),
                    'years': set(),
                    'teaching_assignment_ids': [],
                    'is_elective': is_elective,
                    'elective_category': elective_category,
                    'department_name': department_name,
                    'department_code': department_code
                }
                
                # Track unique subjects and their staff
                if subject_key not in subjects_dict:
                    subjects_dict[subject_key] = subject_data
                
                subjects_dict[subject_key]['staff'].add(staff_name)
                subjects_dict[subject_key]['sections'].add(section_name)
                if year_for_display:
                    subjects_dict[subject_key]['years'].add(year_for_display)
                subjects_dict[subject_key]['teaching_assignment_ids'].append(assignment.id)
                
                # Group electives by category
                if is_elective and elective_category:
                    if elective_category not in elective_groups:
                        elective_groups[elective_category] = []
                    if subject_key not in [s['key'] for s in elective_groups[elective_category]]:
                        elective_groups[elective_category].append({
                            'key': subject_key,
                            'subject_name': subject_name,
                            'subject_code': subject_code
                        })
            
            # FETCH ELECTIVE SUBJECTS WITH STAFF NAMES FROM TEACHING ASSIGNMENTS
            # HOD view should show actual staff names for all electives (not "Multiple Staff")
            # 
            # IMPORTANT: Open Electives (OE) are cross-department subjects stored in ElectiveSubject table
            # They may have placeholder codes (like XXC13XX) in DepartmentCurricula but actual data is here
            # Staff mapping must check THREE methods since TeachingAssignments may reference them via:
            #   1. elective_subject (ForeignKey to ElectiveSubject)
            #   2. curriculum_row.course_code (ForeignKey to CurriculumDepartment)
            #   3. subject.code (ForeignKey to legacy Subject table)
            # 
            # HOD must see ALL OE subjects for current semester across ALL departments (no dept filtering)
            # Students see only their chosen OE via ElectiveChoice (handled separately)
            print(f"[GetSubjectsByYearView] Fetching elective subjects from curriculum and matching with teaching assignments...")
            
            if include_electives and department_id and semesters_for_years:
                # Fetch PE/EE elective subjects for the department only
                dept_electives = ElectiveSubject.objects.filter(
                    department_id=department_id,
                    semester_id__in=semesters_for_years,
                    approval_status='APPROVED'
                ).select_related('parent', 'semester', 'department').distinct()

                if regulation_codes:
                    dept_electives = dept_electives.filter(regulation__in=regulation_codes)
                
                print(f"[GetSubjectsByYearView] Found {dept_electives.count()} department elective subjects")
                
                # Fetch ALL Open Elective subjects across departments for the semesters
                # OE subjects are cross-department - HOD should see ALL options regardless of department
                # DO NOT filter by department_id for Open Electives
                # Match various category patterns: "Open Elective", "OE", "Open Elective I", etc.
                # 
                # Use section-context semester IDs for OE subject discovery.
                oe_query = Q(parent__category__icontains='Open Elective') | Q(parent__category__istartswith='OE')
                oe_query = oe_query & Q(approval_status='APPROVED')

                oe_electives = ElectiveSubject.objects.filter(
                    oe_query,
                    semester_id__in=semesters_for_years
                ).select_related('parent', 'semester', 'department').distinct()

                if regulation_codes:
                    oe_electives = oe_electives.filter(regulation__in=regulation_codes)
                
                print(f"[GetSubjectsByYearView] Found {oe_electives.count()} Open Elective subjects across all departments")
                if oe_electives.exists():
                    for oe in oe_electives[:5]:  # Show first 5 for debugging
                        print(f"  - OE: {oe.course_code} - {oe.course_name} ({oe.department.code if oe.department else 'No Dept'}) - Category: {oe.parent.category if oe.parent else 'No Parent'}")
                
                # Combine both querysets
                curriculum_electives = list(dept_electives) + [oe for oe in oe_electives if oe not in dept_electives]
                
                print(f"[GetSubjectsByYearView] Total elective subjects to process: {len(curriculum_electives)}")
                print(f"[GetSubjectsByYearView] Breakdown: {dept_electives.count()} dept electives + {len([oe for oe in oe_electives if oe not in dept_electives])} unique OE subjects")
                
                # Build a mapping of elective_subject_id to teaching assignments with staff
                # This ensures ALL electives (OE, PE, EE) show correct staff names
                # 
                # THREE MAPPING METHODS (try all to maximize staff resolution):
                # 1. By elective_subject_id: Direct link in TeachingAssignment.elective_subject
                # 2. By course_code via curriculum_row: TeachingAssignment.curriculum_row.course_code
                #    (needed for OE subjects with placeholder slots like XXC13XX)
                # 3. By subject code: TeachingAssignment.subject.code
                #    (legacy subjects table)
                all_elective_ids = [e.id for e in curriculum_electives]
                all_elective_codes = [e.course_code for e in curriculum_electives if e.course_code]
                
                elective_teaching_assignments = {}
                elective_teaching_by_code = {}  # Fallback mapping by course code
                
                if all_elective_ids:
                    # Fetch by elective_subject_id
                    elective_tas = TeachingAssignment.objects.filter(
                        elective_subject_id__in=all_elective_ids,
                        academic_year=current_ay,
                        is_active=True
                    ).select_related('staff', 'staff__user', 'elective_subject')
                    
                    for ta in elective_tas:
                        if ta.elective_subject_id not in elective_teaching_assignments:
                            elective_teaching_assignments[ta.elective_subject_id] = []
                        elective_teaching_assignments[ta.elective_subject_id].append(ta)
                    
                    print(f"[GetSubjectsByYearView] Found teaching assignments for {len(elective_teaching_assignments)} elective subjects (by ID)")
                
                # Also fetch by course_code (for OE subjects that might be mapped via curriculum_row)
                if all_elective_codes:
                    code_tas = TeachingAssignment.objects.filter(
                        curriculum_row__course_code__in=all_elective_codes,
                        curriculum_row__is_elective=True,
                        academic_year=current_ay,
                        is_active=True
                    ).select_related('staff', 'staff__user', 'curriculum_row')
                    
                    for ta in code_tas:
                        if ta.curriculum_row and ta.curriculum_row.course_code:
                            code = ta.curriculum_row.course_code
                            if code not in elective_teaching_by_code:
                                elective_teaching_by_code[code] = []
                            elective_teaching_by_code[code].append(ta)
                    
                    print(f"[GetSubjectsByYearView] Found teaching assignments for {len(elective_teaching_by_code)} elective subjects (by course code via curriculum_row)")
                    
                    # Also try mapping via legacy Subject table (subject.code)
                    subject_tas = TeachingAssignment.objects.filter(
                        subject__code__in=all_elective_codes,
                        academic_year=current_ay,
                        is_active=True
                    ).select_related('staff', 'staff__user', 'subject')
                    
                    for ta in subject_tas:
                        if ta.subject and ta.subject.code:
                            code = ta.subject.code
                            if code not in elective_teaching_by_code:
                                elective_teaching_by_code[code] = []
                            elective_teaching_by_code[code].append(ta)
                    
                    print(f"[GetSubjectsByYearView] Total teaching assignments by code (after adding subject.code): {len(elective_teaching_by_code)}")
                
                # Process each curriculum elective
                processed_count = 0
                merged_count = 0
                for elective in curriculum_electives:
                    normalized_code = (elective.course_code or '').strip().upper()
                    subject_key = f"elec_code_{normalized_code}" if normalized_code else f"elec_{elective.id}"
                    
                    # Check if already added from teaching assignment section
                    already_exists = subject_key in subjects_dict
                    if already_exists:
                        merged_count += 1
                        print(f"[GetSubjectsByYearView] Merging data for existing elective: {elective.course_name}")
                    else:
                        processed_count += 1
                    
                    # Get parent category
                    elective_category = 'Other Electives'
                    if elective.parent:
                        elective_category = elective.parent.category or 'Other Electives'
                    
                    # Calculate which year this elective belongs to
                    elective_year = None
                    if elective.semester:
                        elective_year = ((elective.semester.number + 1) // 2)
                        if elective_year in years:
                            print(f"[GetSubjectsByYearView] Processing elective: {elective.course_name} (Category: {elective_category}, Year {elective_year})")
                    
                    # Check if this is an Open Elective
                    # Match various OE category patterns: "Open Elective", "OE", "OE I", "OE II", etc.
                    is_open_elective = (
                        'Open Elective' in elective_category or 
                        'OE' in elective_category or 
                        elective_category.startswith('OE')
                    )
                    
                    # Get actual staff names from teaching assignments (for ALL electives)
                    # Try three methods: by ID, by course code (curriculum_row), by subject code
                    staff_names = set()
                    
                    # Method 1: Fetch by elective_subject_id
                    if elective.id in elective_teaching_assignments:
                        for ta in elective_teaching_assignments[elective.id]:
                            if ta.staff:
                                staff_name = ta.staff.user.get_full_name() or ta.staff.user.username
                                staff_names.add(staff_name)
                        print(f"[GetSubjectsByYearView] Elective {elective.course_name} has staff (by ID): {staff_names}")
                    
                    # Methods 2 & 3: Fetch by course_code (curriculum_row or subject)
                    if not staff_names and elective.course_code and elective.course_code in elective_teaching_by_code:
                        for ta in elective_teaching_by_code[elective.course_code]:
                            if ta.staff:
                                staff_name = ta.staff.user.get_full_name() or ta.staff.user.username
                                staff_names.add(staff_name)
                        print(f"[GetSubjectsByYearView] Elective {elective.course_name} has staff (by code): {staff_names}")
                    
                    # If no staff found, use placeholder
                    if not staff_names:
                        staff_names = set(['To be assigned'])
                        print(f"[GetSubjectsByYearView] No staff assigned for elective: {elective.course_name} - using placeholder")
                    
                    # Get department information (important for OE subjects offered by different departments)
                    department_name = None
                    department_code = None
                    if elective.department:
                        department_name = elective.department.name
                        department_code = elective.department.code
                    
                    # Collect all teaching assignment IDs (from both mappings)
                    ta_ids = []
                    ta_ids.extend([ta.id for ta in elective_teaching_assignments.get(elective.id, [])])
                    if elective.course_code and elective.course_code in elective_teaching_by_code:
                        ta_ids.extend([ta.id for ta in elective_teaching_by_code[elective.course_code]])
                    # Remove duplicates
                    ta_ids = list(set(ta_ids))
                    
                    # Add or merge data in subjects_dict
                    if already_exists:
                        # MERGE: Update existing entry with additional data
                        print(f"[GetSubjectsByYearView] Merging additional data for: {elective.course_name}")
                        subjects_dict[subject_key]['staff'].update(staff_names)
                        subjects_dict[subject_key]['sections'].update(set(['All Sections']))
                        if elective_year:
                            subjects_dict[subject_key]['years'].add(elective_year)
                        # Merge teaching assignment IDs (avoid duplicates)
                        existing_ids = set(subjects_dict[subject_key]['teaching_assignment_ids'])
                        new_ids = set(ta_ids)
                        subjects_dict[subject_key]['teaching_assignment_ids'] = list(existing_ids | new_ids)
                        print(f"[GetSubjectsByYearView]   Merged staff: {subjects_dict[subject_key]['staff']}")
                        print(f"[GetSubjectsByYearView]   Total TAs: {len(subjects_dict[subject_key]['teaching_assignment_ids'])}")
                    else:
                        # ADD: Create new entry
                        subject_data = {
                            'subject_name': elective.course_name or 'Unknown Elective',
                            'subject_code': elective.course_code or '',
                            'staff': staff_names,
                            'sections': set(['All Sections']),
                            'years': set([elective_year]) if elective_year else set(),
                            'teaching_assignment_ids': ta_ids,
                            'is_elective': True,
                            'elective_category': elective_category,
                            'department_name': department_name,
                            'department_code': department_code
                        }
                        
                        subjects_dict[subject_key] = subject_data
                    
                    # Group electives by category
                    if elective_category not in elective_groups:
                        elective_groups[elective_category] = []
                    if subject_key not in [s['key'] for s in elective_groups[elective_category]]:
                        elective_groups[elective_category].append({
                            'key': subject_key,
                            'subject_name': elective.course_name or 'Unknown Elective',
                            'subject_code': elective.course_code or ''
                        })
                
                print(f"[GetSubjectsByYearView] Elective processing summary: {processed_count} new added, {merged_count} merged with existing data")
                print(f"[GetSubjectsByYearView] Elective groups created: {list(elective_groups.keys())}")
                for cat, items in elective_groups.items():
                    print(f"  - {cat}: {len(items)} subjects")
                
            elif preview_only:
                print("[GetSubjectsByYearView] Preview-only mode: skipping elective processing.")

            # Always merge core curriculum subjects so unassigned core papers are still visible.
            # This keeps HOD preview aligned with student subject mapping behavior.
            if department_id and semesters_for_years:
                print(f"[GetSubjectsByYearView] Merging core subjects from curriculum department rows...")
                curriculum_rows = CurriculumDepartment.objects.filter(
                    department_id=department_id,
                    semester_id__in=semesters_for_years,
                    is_elective=False
                ).select_related('semester').distinct()

                if regulation_codes:
                    curriculum_rows = curriculum_rows.filter(regulation__in=regulation_codes)
                
                print(f"[GetSubjectsByYearView] Found {curriculum_rows.count()} core subjects in curriculum")
                
                for row in curriculum_rows:
                    row_name = (row.course_name or '').strip().lower()
                    # Skip placeholder elective titles from core list; electives are handled separately.
                    if 'elective' in row_name:
                        continue

                    normalized_code = (row.course_code or '').strip().upper()
                    subject_key = f"core_code_{normalized_code}" if normalized_code else f"core_name_{row_name}"
                    
                    # Skip if already added from teaching assignment
                    if subject_key in subjects_dict:
                        continue
                    
                    # Calculate which year this subject belongs to
                    subject_year = None
                    if row.semester:
                        subject_year = ((row.semester.number + 1) // 2)
                        if subject_year in years:
                            print(f"[GetSubjectsByYearView] Adding core subject: {row.course_name} (Sem {row.semester.number}, Year {subject_year})")
                    
                    # Add to subjects_dict
                    subject_data = {
                        'subject_name': row.course_name or 'Unknown Subject',
                        'subject_code': row.course_code or '',
                        'staff': set(['To be assigned']),
                        'sections': set(['All Sections']),
                        'years': set([subject_year]) if subject_year else set(),
                        'teaching_assignment_ids': [],
                        'is_elective': False,
                        'elective_category': None,
                        'department_name': None,
                        'department_code': None
                    }
                    
                    subjects_dict[subject_key] = subject_data
            
            print(f"[GetSubjectsByYearView] Total subjects after adding curriculum subjects: {len(subjects_dict)}")
            
            # Format response - separate regular subjects and electives
            regular_subjects = []
            elective_subjects = []
            
            # For HOD creation view: Show only elective category headings (not individual subjects)
            # Individual subjects will be shown to students and in response view
            elective_categories_only = []
            
            for subject_key, data in subjects_dict.items():
                subject_info = {
                    'subject_name': data['subject_name'],
                    'subject_code': data['subject_code'],
                    'staff_names': ', '.join(sorted(data['staff'])),
                    'sections': ', '.join(sorted(data['sections'])),
                    'years': sorted(list(data['years'])),  # List of years this subject appears in
                    'teaching_assignment_ids': data['teaching_assignment_ids'],
                    'assignment_count': len(data['teaching_assignment_ids']),
                    'is_elective': data.get('is_elective', False),
                    'elective_category': data.get('elective_category'),
                    'department_name': data.get('department_name'),
                    'department_code': data.get('department_code')
                }
                
                if data.get('is_elective'):
                    elective_subjects.append(subject_info)
                else:
                    regular_subjects.append(subject_info)
            
            # Sort by subject name
            regular_subjects.sort(key=lambda x: x['subject_name'])
            elective_subjects.sort(key=lambda x: (x.get('elective_category', ''), x['subject_name']))

            if preview_only and not include_electives:
                elective_subjects = []
                elective_groups = {}
            
            # Format elective CATEGORIES for HOD view (not individual subjects)
            # HOD sees: "Professional Elective IV", "Emerging Elective I", etc.
            formatted_elective_categories = []
            for category in sorted(elective_groups.keys()):
                # Calculate total subjects in this category
                category_count = len(elective_groups[category])
                
                # Get all years for this category
                category_years = set()
                for subj_key_info in elective_groups[category]:
                    subject_key = subj_key_info['key']
                    if subject_key in subjects_dict:
                        category_years.update(subjects_dict[subject_key]['years'])
                
                formatted_elective_categories.append({
                    'category': category,
                    'count': category_count,
                    'years': sorted(list(category_years)),
                    'display_name': category  # e.g., "Professional Elective IV"
                })
            
            # Format elective groups WITH individual subjects (for student/response views)
            formatted_elective_groups = []
            for category, subjects in sorted(elective_groups.items()):
                category_subjects = []
                for subj_key_info in subjects:
                    subject_key = subj_key_info['key']
                    if subject_key in subjects_dict:
                        data = subjects_dict[subject_key]
                        category_subjects.append({
                            'subject_name': data['subject_name'],
                            'subject_code': data['subject_code'],
                            'staff_names': ', '.join(sorted(data['staff'])),
                            'sections': ', '.join(sorted(data['sections'])),
                            'years': sorted(list(data['years'])),
                            'teaching_assignment_ids': data['teaching_assignment_ids'],
                            'assignment_count': len(data['teaching_assignment_ids'])
                        })
                
                # Sort subjects within category
                category_subjects.sort(key=lambda x: x['subject_name'])
                
                formatted_elective_groups.append({
                    'category': category,
                    'subjects': category_subjects,
                    'count': len(category_subjects)
                })
            
            # Combined list for backward compatibility
            all_subjects = regular_subjects + elective_subjects
            
            print(f"[GetSubjectsByYearView] Returning {len(regular_subjects)} regular subjects, {len(formatted_elective_categories)} elective categories")
            print(f"[GetSubjectsByYearView] Elective categories: {[cat['category'] for cat in formatted_elective_categories]}")
            
            return Response({
                'subjects': all_subjects,  # All subjects (for backward compatibility)
                'regular_subjects': regular_subjects,  # Core/regular subjects
                'elective_subjects': elective_subjects,  # All electives (flat) - for student/response views
                'elective_categories': formatted_elective_categories,  # Category headings ONLY (for HOD creation)
                'elective_groups': formatted_elective_groups,  # Electives with individual subjects (for response view)
                'total_subjects': len(all_subjects),
                'has_electives': len(elective_subjects) > 0,
                'years': years,  # All requested years
                'semester_id': semester_id,
                'department_id': department_id,
                'section_ids': section_ids_filter,  # Selected section IDs
                'regulation_ids': regulation_ids,
                'regulation_codes': regulation_codes
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'detail': f'Error fetching subjects: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


