from typing import List

from django.db.models import QuerySet

from .models import DepartmentRole, StaffProfile, SectionAdvisor


def get_user_hod_department_ids(user) -> List[int]:
    """Return list of department IDs the user is HOD/AHOD for.

    Includes departments from active DepartmentRole entries for the user's
    `staff_profile`. Returns an empty list if no staff_profile or no roles.
    """
    staff_profile = getattr(user, 'staff_profile', None)
    if not staff_profile:
        return []

    qs = DepartmentRole.objects.filter(staff=staff_profile, role__in=['HOD', 'AHOD'], is_active=True).values_list('department_id', flat=True)
    return list(qs)


def get_user_effective_departments(user) -> List[int]:
    """Return department ids the user should see data for.

    This combines the staff's `current_department` (if any) with HOD/AHOD
    assignments from DepartmentRole so multi-department HODs see all mapped
    departments.
    """
    depts = []
    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile:
        try:
            cur = getattr(staff_profile, 'current_department', None) or staff_profile.get_current_department()
            if cur:
                depts.append(getattr(cur, 'id', None))
        except Exception:
            try:
                if getattr(staff_profile, 'department', None):
                    depts.append(getattr(staff_profile.department, 'id', None))
            except Exception:
                pass

        # Advisors should be able to act for the departments of the sections
        # they advise, even when their StaffProfile.department/current_department
        # is not populated.
        try:
            advisor_dept_ids = (
                SectionAdvisor.objects
                .filter(advisor=staff_profile, is_active=True, academic_year__is_active=True)
                .values_list('section__batch__course__department_id', flat=True)
                .distinct()
            )
            depts += [d for d in advisor_dept_ids if d]
        except Exception:
            pass

    # include HOD/AHOD mapped departments
    depts += get_user_hod_department_ids(user)
    # dedupe and filter falsy
    return [d for d in sorted(set([int(x) for x in depts if x]))]


def can_staff_mark_period_attendance(user, date):
    """Check if staff can mark period attendance for a given date.
    
    Staff can mark attendance if:
    1. They are marked present/partial in staff attendance, OR
    2. They have an approved access request for the date (for absent staff)
    
    The request flow is: staff comes half-day → requests HOD/AHOD approval → 
    marks period attendance → PS uploads CSV next day → actual attendance recorded.
    
    Returns:
        tuple: (can_mark: bool, reason: str, attendance_record: AttendanceRecord|None)
    """
    try:
        from staff_attendance.models import AttendanceRecord, HalfDayRequest
        
        # Check if staff attendance record exists
        try:
            attendance_record = AttendanceRecord.objects.get(user=user, date=date)
            
            # If staff is present or partial, they can mark attendance
            if attendance_record.status in ['present', 'partial']:
                return True, f"Staff is {attendance_record.status}", attendance_record
            
            # If staff is absent, check for approved access request
            if attendance_record.status == 'absent':
                approved_request = HalfDayRequest.objects.filter(
                    staff_user=user,
                    attendance_date=date,
                    status='approved'
                ).first()
                
                if approved_request:
                    return True, "Period attendance access approved by HOD/AHOD", attendance_record
                else:
                    return False, "Staff is absent. Please request period attendance access from your HOD/AHOD", attendance_record
            
            # Other status (shouldn't normally happen)
            return False, f"Staff attendance status: {attendance_record.status}", attendance_record
            
        except AttendanceRecord.DoesNotExist:
            # No attendance record yet - allow access (attendance not uploaded by PS yet)
            return True, "No staff attendance record found", None
        
    except Exception as e:
        # If anything goes wrong, don't block attendance marking
        return True, f"Error checking staff attendance: {str(e)}", None
