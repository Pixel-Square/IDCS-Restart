from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Count, Q, Avg, F
from datetime import date, timedelta
from .models import (
    PeriodAttendanceRecord, 
    PeriodAttendanceSession,
    StudentProfile, 
    Section, 
    StaffProfile,
    DepartmentRole
)
from accounts.utils import get_user_permissions


class AttendanceAnalyticsView(APIView):
    """
    Attendance analytics with three permission levels:
    1. 'analytics.view_all_analytics' - View all departments, classes, students
    2. 'analytics.view_department_analytics' - View own department only
    3. 'analytics.view_class_analytics' - View own class only (advisors)
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        staff_profile = getattr(user, 'staff_profile', None)
        
        # Determine permission level
        can_view_all = 'analytics.view_all_analytics' in perms or user.is_superuser
        can_view_department = 'analytics.view_department_analytics' in perms or can_view_all
        can_view_class = 'analytics.view_class_analytics' in perms or can_view_department
        
        if not (can_view_all or can_view_department or can_view_class):
            raise PermissionDenied('You do not have permission to view analytics')
        
        # Get query parameters
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        department_id = request.query_params.get('department_id')
        section_id = request.query_params.get('section_id')
        view_type = request.query_params.get('view_type', 'overview')  # overview, department, class, student
        
        # Set default date range (last 30 days)
        if not end_date:
            end_date = date.today()
        else:
            try:
                end_date = date.fromisoformat(end_date)
            except:
                end_date = date.today()
        
        if not start_date:
            start_date = end_date - timedelta(days=30)
        else:
            try:
                start_date = date.fromisoformat(start_date)
            except:
                start_date = end_date - timedelta(days=30)
        
        # Build base queryset
        sessions_qs = PeriodAttendanceSession.objects.filter(
            date__gte=start_date,
            date__lte=end_date
        ).select_related('section', 'section__batch', 'section__batch__course', 'section__batch__course__department')
        
        records_qs = PeriodAttendanceRecord.objects.filter(
            session__date__gte=start_date,
            session__date__lte=end_date
        ).select_related('student', 'session__section', 'session__section__batch', 'session__section__batch__course', 'session__section__batch__course__department')
        
        # Apply permission-based filtering
        if not can_view_all:
            if can_view_department and staff_profile:
                # Filter by staff's department
                dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
                dept_ids = [dr.department_id for dr in dept_roles if dr.department_id]
                
                # Also check if staff has teaching assignments in other departments
                from .models import TeachingAssignment
                teaching_depts = TeachingAssignment.objects.filter(
                    staff=staff_profile, 
                    is_active=True
                ).values_list('section__batch__course__department_id', flat=True).distinct()
                dept_ids.extend(list(teaching_depts))
                dept_ids = list(set(filter(None, dept_ids)))
                
                if dept_ids:
                    sessions_qs = sessions_qs.filter(section__batch__course__department_id__in=dept_ids)
                    records_qs = records_qs.filter(session__section__batch__course__department_id__in=dept_ids)
                else:
                    # No department access
                    sessions_qs = sessions_qs.none()
                    records_qs = records_qs.none()
            
            elif can_view_class and staff_profile:
                # Filter by advisor's sections only
                from .models import SectionAdvisor
                advisor_sections = SectionAdvisor.objects.filter(
                    advisor=staff_profile,
                    is_active=True
                ).values_list('section_id', flat=True)
                
                if advisor_sections:
                    sessions_qs = sessions_qs.filter(section_id__in=advisor_sections)
                    records_qs = records_qs.filter(session__section_id__in=advisor_sections)
                else:
                    sessions_qs = sessions_qs.none()
                    records_qs = records_qs.none()
        
        # Apply user-selected filters (if permitted)
        if department_id and can_view_all:
            sessions_qs = sessions_qs.filter(section__batch__course__department_id=department_id)
            records_qs = records_qs.filter(session__section__batch__course__department_id=department_id)
        
        if section_id and (can_view_all or can_view_department):
            sessions_qs = sessions_qs.filter(section_id=section_id)
            records_qs = records_qs.filter(session__section_id=section_id)
        
        # Calculate statistics based on view_type
        if view_type == 'overview':
            data = self._get_overview_stats(records_qs, sessions_qs, start_date, end_date)
        elif view_type == 'department':
            data = self._get_department_stats(records_qs, can_view_all)
        elif view_type == 'class':
            data = self._get_class_stats(records_qs, can_view_all or can_view_department)
        elif view_type == 'student':
            data = self._get_student_stats(records_qs, section_id)
        else:
            data = self._get_overview_stats(records_qs, sessions_qs, start_date, end_date)
        
        return Response({
            'permission_level': 'all' if can_view_all else ('department' if can_view_department else 'class'),
            'date_range': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
            'data': data
        })
    
    def _get_overview_stats(self, records_qs, sessions_qs, start_date, end_date):
        """Overall statistics summary"""
        total_sessions = sessions_qs.count()
        total_records = records_qs.count()
        
        status_breakdown = records_qs.values('status').annotate(
            count=Count('id')
        ).order_by('-count')
        
        present_count = records_qs.filter(status='P').count()
        absent_count = records_qs.filter(status='A').count()
        
        attendance_rate = (present_count / total_records * 100) if total_records > 0 else 0
        
        # Trend over time (daily) - use simple date grouping
        daily_stats = records_qs.values('session__date').annotate(
            total=Count('id'),
            present=Count('id', filter=Q(status='P')),
            absent=Count('id', filter=Q(status='A'))
        ).order_by('session__date')
        
        # Format dates as strings for JSON serialization
        daily_trend = []
        for stat in daily_stats:
            daily_trend.append({
                'day': stat['session__date'].isoformat() if stat['session__date'] else None,
                'total': stat['total'],
                'present': stat['present'],
                'absent': stat['absent']
            })
        
        return {
            'summary': {
                'total_sessions': total_sessions,
                'total_records': total_records,
                'present_count': present_count,
                'absent_count': absent_count,
                'attendance_rate': round(attendance_rate, 2)
            },
            'status_breakdown': list(status_breakdown),
            'daily_trend': daily_trend
        }
    
    def _get_department_stats(self, records_qs, can_filter=True):
        """Department-wise statistics"""
        dept_stats = records_qs.values(
            'session__section__batch__course__department__id',
            'session__section__batch__course__department__name',
            'session__section__batch__course__department__short_name'
        ).annotate(
            total_records=Count('id'),
            present_count=Count('id', filter=Q(status='P')),
            absent_count=Count('id', filter=Q(status='A')),
            leave_count=Count('id', filter=Q(status='LEAVE')),
            od_count=Count('id', filter=Q(status='OD'))
        ).order_by('-total_records')
        
        # Calculate attendance rate for each department
        result = []
        for dept in dept_stats:
            rate = (dept['present_count'] / dept['total_records'] * 100) if dept['total_records'] > 0 else 0
            result.append({
                'department_id': dept['session__section__batch__course__department__id'],
                'department_name': dept['session__section__batch__course__department__name'],
                'department_short': dept['session__section__batch__course__department__short_name'],
                'total_records': dept['total_records'],
                'present': dept['present_count'],
                'absent': dept['absent_count'],
                'leave': dept['leave_count'],
                'on_duty': dept['od_count'],
                'attendance_rate': round(rate, 2)
            })
        
        return {'departments': result}
    
    def _get_class_stats(self, records_qs, can_filter=True):
        """Class/Section-wise statistics"""
        class_stats = records_qs.values(
            'session__section__id',
            'session__section__name',
            'session__section__batch__course__name',
            'session__section__batch__course__department__short_name'
        ).annotate(
            total_records=Count('id'),
            present_count=Count('id', filter=Q(status='P')),
            absent_count=Count('id', filter=Q(status='A')),
            leave_count=Count('id', filter=Q(status='LEAVE')),
            od_count=Count('id', filter=Q(status='OD'))
        ).order_by('-total_records')
        
        result = []
        for cls in class_stats:
            rate = (cls['present_count'] / cls['total_records'] * 100) if cls['total_records'] > 0 else 0
            result.append({
                'section_id': cls['session__section__id'],
                'section_name': cls['session__section__name'],
                'course_name': cls['session__section__batch__course__name'],
                'department': cls['session__section__batch__course__department__short_name'],
                'total_records': cls['total_records'],
                'present': cls['present_count'],
                'absent': cls['absent_count'],
                'leave': cls['leave_count'],
                'on_duty': cls['od_count'],
                'attendance_rate': round(rate, 2)
            })
        
        return {'classes': result}
    
    def _get_student_stats(self, records_qs, section_id=None):
        """Student-wise statistics"""
        student_stats = records_qs.values(
            'student__id',
            'student__reg_no',
            'student__user__username',
            'student__section__name'
        ).annotate(
            total_records=Count('id'),
            present_count=Count('id', filter=Q(status='P')),
            absent_count=Count('id', filter=Q(status='A')),
            leave_count=Count('id', filter=Q(status='LEAVE')),
            od_count=Count('id', filter=Q(status='OD')),
            late_count=Count('id', filter=Q(status='LATE'))
        ).order_by('-total_records')
        
        result = []
        for student in student_stats:
            rate = (student['present_count'] / student['total_records'] * 100) if student['total_records'] > 0 else 0
            result.append({
                'student_id': student['student__id'],
                'reg_no': student['student__reg_no'],
                'name': student['student__user__username'],
                'section': student['student__section__name'],
                'total_records': student['total_records'],
                'present': student['present_count'],
                'absent': student['absent_count'],
                'leave': student['leave_count'],
                'on_duty': student['od_count'],
                'late': student['late_count'],
                'attendance_rate': round(rate, 2)
            })
        
        return {'students': result}


class AnalyticsFiltersView(APIView):
    """
    Get available filters based on user's permission level
    """
    permission_classes = (IsAuthenticated,)
    
    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        staff_profile = getattr(user, 'staff_profile', None)
        
        # Determine permission level
        can_view_all = 'analytics.view_all_analytics' in perms or user.is_superuser
        can_view_department = 'analytics.view_department_analytics' in perms or can_view_all
        can_view_class = 'analytics.view_class_analytics' in perms or can_view_department
        
        if not (can_view_all or can_view_department or can_view_class):
            raise PermissionDenied('You do not have permission to view analytics')
        
        from curriculum.models import Department
        departments = []
        sections = []
        
        if can_view_all:
            # Get all departments
            departments = list(Department.objects.all().values('id', 'name', 'short_name').order_by('name'))
            # Get all sections
            sections = list(Section.objects.select_related('batch', 'batch__course', 'batch__course__department').values(
                'id', 'name', 
                'batch__course__name',
                'batch__course__department__id',
                'batch__course__department__short_name'
            ).order_by('batch__course__department__short_name', 'name'))
            
        elif can_view_department and staff_profile:
            # Get only staff's departments
            dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
            dept_ids = [dr.department_id for dr in dept_roles if dr.department_id]
            
            # Also check teaching assignments
            from .models import TeachingAssignment
            teaching_depts = TeachingAssignment.objects.filter(
                staff=staff_profile, 
                is_active=True
            ).values_list('section__batch__course__department_id', flat=True).distinct()
            dept_ids.extend(list(teaching_depts))
            dept_ids = list(set(filter(None, dept_ids)))
            
            if dept_ids:
                departments = list(Department.objects.filter(id__in=dept_ids).values('id', 'name', 'short_name').order_by('name'))
                sections = list(Section.objects.filter(
                    batch__course__department_id__in=dept_ids
                ).select_related('batch', 'batch__course', 'batch__course__department').values(
                    'id', 'name',
                    'batch__course__name',
                    'batch__course__department__id',
                    'batch__course__department__short_name'
                ).order_by('batch__course__department__short_name', 'name'))
        
        elif can_view_class and staff_profile:
            # Get only advisor's sections
            from .models import SectionAdvisor
            advisor_sections_qs = SectionAdvisor.objects.filter(
                advisor=staff_profile,
                is_active=True
            ).select_related('section', 'section__batch', 'section__batch__course', 'section__batch__course__department')
            
            section_ids = [sa.section_id for sa in advisor_sections_qs]
            
            if section_ids:
                sections = list(Section.objects.filter(
                    id__in=section_ids
                ).select_related('batch', 'batch__course', 'batch__course__department').values(
                    'id', 'name',
                    'batch__course__name',
                    'batch__course__department__id',
                    'batch__course__department__short_name'
                ).order_by('batch__course__department__short_name', 'name'))
                
                # Get departments of these sections
                dept_ids = list(set([s['batch__course__department__id'] for s in sections]))
                departments = list(Department.objects.filter(id__in=dept_ids).values('id', 'name', 'short_name').order_by('name'))
        
        return Response({
            'permission_level': 'all' if can_view_all else ('department' if can_view_department else 'class'),
            'departments': departments,
            'sections': sections
        })
