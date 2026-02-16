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
        # Only consider Period 1 across the day for all analytics (show period 1 counts only)
        try:
            sessions_qs = sessions_qs.filter(period__index=1)
            records_qs = records_qs.filter(session__period__index=1)
        except Exception:
            pass
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
        
        # Treat 'P', 'OD' and 'LATE' as present for attendance percentage
        present_count = records_qs.filter(status__in=['P', 'OD', 'LATE']).count()
        absent_count = records_qs.filter(status='A').count()
        
        attendance_rate = (present_count / total_records * 100) if total_records > 0 else 0
        
        # Trend over time (daily) - use simple date grouping
        daily_stats = records_qs.values('session__date').annotate(
            total=Count('id'),
            present=Count('id', filter=Q(status__in=['P', 'OD', 'LATE'])),
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
            present_count=Count('id', filter=Q(status__in=['P', 'OD', 'LATE'])),
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
            present_count=Count('id', filter=Q(status__in=['P', 'OD', 'LATE'])),
            absent_count=Count('id', filter=Q(status='A')),
            leave_count=Count('id', filter=Q(status='LEAVE')),
            od_count=Count('id', filter=Q(status='OD')),
            late_count=Count('id', filter=Q(status='LATE'))
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
            present_count=Count('id', filter=Q(status__in=['P', 'OD', 'LATE'])),
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


class ClassAttendanceReportView(APIView):
    """Return a compact report for a given section and date (defaults to today)."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        staff_profile = getattr(user, 'staff_profile', None)

        # permission: allow if user can view class or department or all
        can_view_all = 'analytics.view_all_analytics' in perms or user.is_superuser
        can_view_department = 'analytics.view_department_analytics' in perms or can_view_all
        can_view_class = 'analytics.view_class_analytics' in perms or can_view_department
        if not (can_view_all or can_view_department or can_view_class):
            raise PermissionDenied('You do not have permission to view analytics')

        section_id = request.query_params.get('section_id')
        date_str = request.query_params.get('date')
        try:
            if date_str:
                target_date = date.fromisoformat(date_str)
            else:
                target_date = date.today()
        except Exception:
            target_date = date.today()

        if not section_id:
            return Response({'detail': 'section_id required'}, status=400)

        # permission-based section scoping
        allowed_section_ids = None
        if not can_view_all:
            if can_view_department and staff_profile:
                from .models import TeachingAssignment
                dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
                dept_ids = [dr.department_id for dr in dept_roles if dr.department_id]
                teaching_depts = TeachingAssignment.objects.filter(staff=staff_profile, is_active=True).values_list('section__batch__course__department_id', flat=True).distinct()
                dept_ids.extend(list(teaching_depts))
                dept_ids = list(set(filter(None, dept_ids)))
                if dept_ids:
                    allowed_section_ids = list(Section.objects.filter(batch__course__department_id__in=dept_ids).values_list('id', flat=True))
                else:
                    allowed_section_ids = []
            elif can_view_class and staff_profile:
                from .models import SectionAdvisor
                allowed_section_ids = list(SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True).values_list('section_id', flat=True))

        if allowed_section_ids is not None and int(section_id) not in allowed_section_ids:
            return Response({'detail': 'Permission denied for this section'}, status=403)

        # Build records for the given section/date (Period 1 only)
        recs = PeriodAttendanceRecord.objects.filter(
            session__section_id=int(section_id),
            session__date=target_date,
            session__period__index=1
        ).select_related('student').order_by('-id')

        # total strength: count students in the section
        total_strength = StudentProfile.objects.filter(section_id=int(section_id)).count()

        # counts
        present_count = recs.filter(status__in=['P', 'OD', 'LATE']).count()
        absent_count = recs.filter(status='A').count()
        leave_count = recs.filter(status='LEAVE').count()
        od_count = recs.filter(status='OD').count()
        late_count = recs.filter(status='LATE').count()

        # build lists of all students' reg_no last-3-digits per status (unique, preserve order)
        def last3_list_for(status_code):
            seen = set()
            out = []
            for r in recs.filter(status=status_code).select_related('student'):
                reg = getattr(getattr(r, 'student', None), 'reg_no', None)
                if not reg:
                    continue
                suffix = reg[-3:]
                if suffix not in seen:
                    out.append(suffix)
                    seen.add(suffix)
            return out

        absent_list = last3_list_for('A')
        leave_list = last3_list_for('LEAVE')
        od_list = last3_list_for('OD')
        late_list = last3_list_for('LATE')

        attendance_pct = (present_count / total_strength * 100) if total_strength > 0 else 0

        # section display + batch/department
        section_obj = Section.objects.filter(pk=int(section_id)).select_related('batch', 'batch__course', 'batch__course__department').first()
        section_name = section_obj.name if section_obj else ''
        batch_name = getattr(getattr(section_obj, 'batch', None), 'name', '') if section_obj else ''
        dept = getattr(getattr(getattr(section_obj, 'batch', None), 'course', None), 'department', None) if section_obj else None
        department_name = getattr(dept, 'name', '') if dept else ''
        department_short = getattr(dept, 'short_name', '') if dept else ''

        return Response({
            'date': target_date.isoformat(),
            'section_id': int(section_id),
            'section_name': section_name,
            'batch_name': batch_name,
            'department_name': department_name,
            'department_short': department_short,
            'total_strength': total_strength,
            'present': present_count,
            'absent': absent_count,
            'leave': leave_count,
            'late': late_count,
            'on_duty': od_count,
            'absent_list': absent_list,
            'leave_list': leave_list,
            'od_list': od_list,
            'late_list': late_list,
            'attendance_percentage': round(attendance_pct, 2)
        })


class TodayPeriodAttendanceView(APIView):
    """Return period-wise attendance stats for today for the current user (staff)."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'detail': 'Staff profile not found'}, status=403)

        # Get today's date or date from query param
        date_str = request.query_params.get('date')
        try:
            if date_str:
                target_date = date.fromisoformat(date_str)
            else:
                target_date = date.today()
        except Exception:
            target_date = date.today()

        # Get all attendance sessions for this staff member today
        from .models import TeachingAssignment
        from timetable.models import TimetableAssignment
        
        # Find all timetable assignments for today where this staff teaches
        day = target_date.isoweekday()
        
        # Get timetable assignments for this staff on this day
        timetable_assignments = TimetableAssignment.objects.filter(
            day=day,
            staff=staff_profile
        ).select_related('period', 'section', 'curriculum_row', 'subject_batch')
        
        # Also check teaching assignments (fallback when TimetableAssignment.staff is null)
        teaching_assignments = TeachingAssignment.objects.filter(
            staff=staff_profile,
            is_active=True
        ).select_related('section', 'subject')
        
        # Build list of sections where staff teaches
        section_ids = set()
        for ta in timetable_assignments:
            if ta.section_id:
                section_ids.add(ta.section_id)
        for teach in teaching_assignments:
            if teach.section_id:
                section_ids.add(teach.section_id)
        
        # Get all attendance sessions for today for these sections
        sessions = PeriodAttendanceSession.objects.filter(
            date=target_date,
            section_id__in=list(section_ids)
        ).select_related('period', 'section', 'timetable_assignment', 'marked_by')
        
        # Filter to only sessions where this staff is the teacher
        period_stats = []
        
        for session in sessions:
            # Check if this session belongs to this staff
            ta = session.timetable_assignment
            if ta and ta.staff_id != staff_profile.id:
                # Check if staff teaches this section through teaching assignment
                is_teaching = teaching_assignments.filter(
                    section_id=session.section_id
                ).exists()
                if not is_teaching:
                    continue
            
            # Get attendance records for this session
            records = PeriodAttendanceRecord.objects.filter(session=session)
            
            total_records = records.count()
            present_count = records.filter(status__in=['P', 'OD', 'LATE']).count()
            absent_count = records.filter(status='A').count()
            leave_count = records.filter(status='LEAVE').count()
            od_count = records.filter(status='OD').count()
            late_count = records.filter(status='LATE').count()
            
            attendance_pct = (present_count / total_records * 100) if total_records > 0 else 0
            
            # Get section total strength
            total_strength = StudentProfile.objects.filter(section_id=session.section_id).count()
            
            # Get subject info
            subject_name = ''
            if ta and ta.curriculum_row:
                subject_name = f"{ta.curriculum_row.course_code} - {ta.curriculum_row.course_title}"
            elif ta and ta.subject_batch:
                subject_name = ta.subject_batch.name or 'Subject'
            
            period_stats.append({
                'session_id': session.id,
                'period_index': session.period.index if session.period else 0,
                'period_label': session.period.label if session.period else '',
                'period_start': str(session.period.start_time) if session.period and session.period.start_time else '',
                'period_end': str(session.period.end_time) if session.period and session.period.end_time else '',
                'section_id': session.section_id,
                'section_name': session.section.name if session.section else '',
                'subject': subject_name,
                'total_strength': total_strength,
                'total_marked': total_records,
                'present': present_count,
                'absent': absent_count,
                'leave': leave_count,
                'late': late_count,
                'on_duty': od_count,
                'attendance_percentage': round(attendance_pct, 2),
                'is_locked': session.is_locked,
                'marked_at': session.created_at.isoformat() if session.created_at else None
            })
        
        # Sort by period index
        period_stats.sort(key=lambda x: x['period_index'])
        
        return Response({
            'date': target_date.isoformat(),
            'periods': period_stats,
            'total_periods': len(period_stats),
            'staff_name': user.username if user else ''
        })
