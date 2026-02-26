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
        # Note: do not force only Period 1 here — allow analytics across periods
        # If a caller needs period-specific data they can pass a `period_index` query param
        period_index = request.query_params.get('period_index')
        try:
            if period_index:
                sessions_qs = sessions_qs.filter(period__index=int(period_index))
                records_qs = records_qs.filter(session__period__index=int(period_index))
        except Exception:
            # ignore any parse/filter errors and continue without period filtering
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

        # Build records for the given section/date. Allow optional `period_index` param.
        period_index = request.query_params.get('period_index')
        recs_q = PeriodAttendanceRecord.objects.filter(
            session__section_id=int(section_id),
            session__date=target_date
        ).select_related('student').order_by('-id')
        if period_index:
            try:
                recs_q = recs_q.filter(session__period__index=int(period_index))
            except Exception:
                pass
        recs = recs_q

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
        # Group sessions by a canonical group key so multi-section assignments
        # for the same subject/parent curriculum_row/subject_batch appear as a
        # single aggregated card.
        groups = {}
        import re
        from .models import TeachingAssignment as _TA

        for session in sessions:
            ta = session.timetable_assignment
            # ensure the staff is responsible for this session
            if ta and ta.staff_id and ta.staff_id != staff_profile.id:
                is_teaching = teaching_assignments.filter(section_id=session.section_id).exists()
                if not is_teaching:
                    continue

            period_idx = getattr(session.period, 'index', 0) if session.period else 0

            # determine canonical group id
            group_id = None
            group_type = None

            if ta and getattr(ta, 'curriculum_row', None):
                group_type = 'curr'
                group_id = ta.curriculum_row_id
            elif ta and getattr(ta, 'subject_batch', None):
                group_type = 'batch'
                group_id = ta.subject_batch_id
            elif ta and getattr(ta, 'subject_text', None):
                raw = (ta.subject_text or '').strip()
                subj_code = re.sub(r'[^A-Za-z0-9]', '', raw).lower()
                if subj_code:
                    group_type = 'subj'
                    group_id = subj_code
            else:
                # fallback: try to resolve via TeachingAssignment mappings
                ta_match = _TA.objects.filter(staff=staff_profile, is_active=True).filter(
                    Q(section_id=session.section_id) | Q(section__isnull=True)
                ).filter(
                    Q(curriculum_row__isnull=False) | Q(elective_subject__isnull=False) | Q(subject__isnull=False)
                ).first()
                if ta_match:
                    if getattr(ta_match, 'curriculum_row', None):
                        group_type = 'curr'
                        group_id = ta_match.curriculum_row_id
                    elif getattr(ta_match, 'elective_subject', None):
                        # prefer parent curriculum_row for elective
                        parent_id = getattr(ta_match.elective_subject, 'parent_id', None)
                        if parent_id:
                            group_type = 'elective_parent'
                            group_id = parent_id
                        else:
                            group_type = 'elective'
                            group_id = ta_match.elective_subject_id
                    elif getattr(ta_match, 'subject', None) and getattr(ta_match.subject, 'code', None):
                        group_type = 'subj'
                        group_id = re.sub(r'[^A-Za-z0-9]', '', getattr(ta_match.subject, 'code', '')).lower()

            if group_type is None:
                group_type = 'section'
                group_id = session.section_id

            key = (period_idx, group_type, group_id)
            groups.setdefault(key, []).append(session)

            # Build period_stats from grouped sessions
            for key, sess_list in groups.items():
                period_idx, gtype, gid = key
                sess_ids = [s.id for s in sess_list]
                records = PeriodAttendanceRecord.objects.filter(session_id__in=sess_ids)

                # determine involved sections
                section_ids = list({s.section_id for s in sess_list})

                if gtype in ('curr', 'elective_parent', 'batch', 'subj', 'elective'):
                    total_strength = StudentProfile.objects.filter(section_id__in=section_ids).count()
                else:
                    total_strength = StudentProfile.objects.filter(section_id=section_ids[0]).count() if section_ids else 0

                total_records = records.count()
                present_count = records.filter(status__in=['P', 'OD', 'LATE']).count()
                absent_count = records.filter(status='A').count()
                leave_count = records.filter(status='LEAVE').count()
                od_count = records.filter(status='OD').count()
                late_count = records.filter(status='LATE').count()
                attendance_pct = (present_count / total_records * 100) if total_records > 0 else 0

                # subject display name: try curriculum_row -> subject_batch -> subject_text
                subject_name = ''
                try:
                    if gtype in ('curr', 'elective_parent'):
                        from curriculum.models import CurriculumDepartment
                        parent = CurriculumDepartment.objects.filter(pk=gid).first()
                        if parent:
                            code = getattr(parent, 'course_code', '') or ''
                            name = getattr(parent, 'course_name', '') or ''
                            subject_name = f"{code} - {name}".strip(' -')
                    elif gtype == 'batch':
                        # use first session's timetable_assignment subject_batch name
                        ta0 = sess_list[0].timetable_assignment
                        subject_name = getattr(getattr(ta0, 'subject_batch', None), 'name', '') if ta0 else ''
                    elif gtype in ('subj', 'elective'):
                        # show normalized subject code
                        subject_name = str(gid).upper()
                    else:
                        ta0 = sess_list[0].timetable_assignment
                        if ta0 and getattr(ta0, 'curriculum_row', None):
                            code = getattr(ta0.curriculum_row, 'course_code', '') or ''
                            name = getattr(ta0.curriculum_row, 'course_name', '') or ''
                            subject_name = f"{code} - {name}".strip(' -')
                        elif ta0 and getattr(ta0, 'subject_text', None):
                            subject_name = ta0.subject_text
                except Exception:
                    subject_name = ''

                # Build card
                period_stats.append({
                    'session_id': None if len(sess_list) > 1 else sess_list[0].id,
                    'period_index': period_idx,
                    'period_label': getattr(sess_list[0].period, 'label', '') if sess_list and getattr(sess_list[0], 'period', None) else '',
                    'period_start': str(getattr(sess_list[0].period, 'start_time', '')) if sess_list and getattr(sess_list[0], 'period', None) else '',
                    'period_end': str(getattr(sess_list[0].period, 'end_time', '')) if sess_list and getattr(sess_list[0], 'period', None) else '',
                    'section_id': None if len(section_ids) > 1 else (section_ids[0] if section_ids else None),
                    'section_name': '' if len(section_ids) > 1 else (getattr(sess_list[0].section, 'name', '') if sess_list and getattr(sess_list[0], 'section', None) else ''),
                    'sections': section_ids if len(section_ids) > 1 else None,
                    'section_names': [getattr(s.section, 'name', '') for s in sess_list] if len(section_ids) > 1 else None,
                    'session_ids': sess_ids,
                    'group_key': f"{gtype}:{gid}",
                    'subject': subject_name,
                    'total_strength': total_strength,
                    'total_marked': total_records,
                    'present': present_count,
                    'absent': absent_count,
                    'leave': leave_count,
                    'late': late_count,
                    'on_duty': od_count,
                    'attendance_percentage': round(attendance_pct, 2),
                    'is_locked': any(getattr(s, 'is_locked', False) for s in sess_list),
                    'marked_at': min((getattr(s, 'created_at') for s in sess_list if getattr(s, 'created_at', None)), default=None).isoformat() if any(getattr(s, 'created_at', None) for s in sess_list) else None,
                    'marked_by': getattr(getattr(sess_list[0], 'created_by', None), 'user', None).username if getattr(sess_list[0], 'created_by', None) and getattr(getattr(sess_list[0], 'created_by', None), 'user', None) else ''
                })

                total_records = records.count()
                present_count = records.filter(status__in=['P', 'OD', 'LATE']).count()
                absent_count = records.filter(status='A').count()
                leave_count = records.filter(status='LEAVE').count()
                od_count = records.filter(status='OD').count()
                late_count = records.filter(status='LATE').count()
                
                attendance_pct = (present_count / total_records * 100) if total_records > 0 else 0

                # `total_strength` was computed above for aggregated keys
                # (curr, batch, elective_parent). For single-session keys the
                # default was already set above; do not overwrite it here.

                # Get subject info - defensive attribute access
                subject_name = ''
                try:
                    if ta and getattr(ta, 'curriculum_row', None):
                        code = getattr(ta.curriculum_row, 'course_code', '') or ''
                        name = getattr(ta.curriculum_row, 'course_name', '') or ''
                        subject_name = f"{code} - {name}".strip(' -') if code or name else ''
                    elif ta and getattr(ta, 'subject_batch', None):
                        subject_name = getattr(ta.subject_batch, 'name', '') or 'Subject'
                    # If we deduped by elective_parent, prefer showing the parent curriculum row
                    # course code/name if available.
                    if key[0] == 'elective_parent':
                        try:
                            from curriculum.models import CurriculumDepartment
                            parent = CurriculumDepartment.objects.filter(pk=key[2]).first()
                            if parent:
                                code = getattr(parent, 'course_code', '') or ''
                                name = getattr(parent, 'course_name', '') or ''
                                subject_name = f"{code} - {name}".strip(' -') if code or name else subject_name
                        except Exception:
                            pass
                except Exception:
                    subject_name = ''
                
                try:
                    # determine aggregated sections for this card (if any)
                    aggregated_sections = None
                    if key[0] in ('curr', 'elective_parent'):
                        aggregated_sections = list(section_ids_for_curr) if 'section_ids_for_curr' in locals() else None
                    elif key[0] == 'batch':
                        aggregated_sections = list(section_ids_for_batch) if 'section_ids_for_batch' in locals() else None

                    period_stats.append({
                        'session_id': session.id,
                        'period_index': getattr(session.period, 'index', 0) if session.period else 0,
                        'period_label': getattr(session.period, 'label', '') if session.period else '',
                        'period_start': str(getattr(session.period, 'start_time', '')) if session.period and getattr(session.period, 'start_time', None) else '',
                        'period_end': str(getattr(session.period, 'end_time', '')) if session.period and getattr(session.period, 'end_time', None) else '',
                        'section_id': None if aggregated_sections else session.section_id,
                        'section_name': '' if aggregated_sections else (getattr(session.section, 'name', '') if session.section else ''),
                        'sections': aggregated_sections,
                        'subject': subject_name,
                        'total_strength': total_strength,
                        'total_marked': total_records,
                        'present': present_count,
                        'absent': absent_count,
                        'leave': leave_count,
                        'late': late_count,
                        'on_duty': od_count,
                        'attendance_percentage': round(attendance_pct, 2),
                        'is_locked': getattr(session, 'is_locked', False),
                        'marked_at': session.created_at.isoformat() if getattr(session, 'created_at', None) else None,
                        # `PeriodAttendanceSession` uses `created_by` (StaffProfile). Use that for marked_by display.
                        'marked_by': getattr(getattr(session, 'created_by', None), 'user', None).username if getattr(session, 'created_by', None) and getattr(getattr(session, 'created_by', None), 'user', None) else ''
                    })
                except Exception as e:
                    # Log but don't crash if one session fails
                    import logging
                    logging.error(f"Failed to add period stat for session {session.id}: {e}")
                    continue
            
            # Sort by period index
            period_stats.sort(key=lambda x: x['period_index'])
            
            return Response({
                'date': target_date.isoformat(),
                'periods': period_stats,
                'total_periods': len(period_stats),
                'staff_name': user.username if user else ''
            })


class TodayPeriodAttendanceView(APIView):
    """Return period-wise attendance cards for the given date (defaults to today)."""
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

        date_str = request.query_params.get('date')
        try:
            target_date = date.fromisoformat(date_str) if date_str else date.today()
        except Exception:
            target_date = date.today()

        # base sessions for the date
        sessions_q = PeriodAttendanceSession.objects.filter(date=target_date).select_related(
            'period', 'section', 'section__batch', 'section__batch__course', 'section__batch__course__department',
            'timetable_assignment', 'timetable_assignment__curriculum_row', 'timetable_assignment__subject_batch',
            'teaching_assignment', 'teaching_assignment__curriculum_row', 'teaching_assignment__elective_subject', 'teaching_assignment__elective_subject__parent',
            'teaching_assignment__subject'
        ).order_by('period__index')

        # apply permission scoping
        if not can_view_all:
            if can_view_department and staff_profile:
                from .models import TeachingAssignment
                dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
                dept_ids = [dr.department_id for dr in dept_roles if dr.department_id]
                teaching_depts = TeachingAssignment.objects.filter(staff=staff_profile, is_active=True).values_list('section__batch__course__department_id', flat=True).distinct()
                dept_ids.extend(list(teaching_depts))
                dept_ids = list(set(filter(None, dept_ids)))
                if dept_ids:
                    sessions_q = sessions_q.filter(section__batch__course__department_id__in=dept_ids)
                else:
                    sessions_q = sessions_q.none()
            elif can_view_class and staff_profile:
                from .models import SectionAdvisor
                advisor_sections = SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True).values_list('section_id', flat=True)
                if advisor_sections:
                    sessions_q = sessions_q.filter(section_id__in=advisor_sections)
                else:
                    sessions_q = sessions_q.none()

        period_stats = []
        for session in sessions_q:
            try:
                recs = PeriodAttendanceRecord.objects.filter(session=session)
                total_strength = StudentProfile.objects.filter(section_id=session.section_id).count() if session.section_id else 0
                total_records = recs.count()
                present_count = recs.filter(status__in=['P', 'OD', 'LATE']).count()
                absent_count = recs.filter(status='A').count()
                leave_count = recs.filter(status='LEAVE').count()
                od_count = recs.filter(status='OD').count()
                late_count = recs.filter(status='LATE').count()
                attendance_pct = (present_count / total_strength * 100) if total_strength > 0 else 0

                # subject display
                subject_name = ''
                ta = getattr(session, 'timetable_assignment', None)
                teach = getattr(session, 'teaching_assignment', None)
                try:
                    if teach and getattr(teach, 'elective_subject', None):
                        es = teach.elective_subject
                        code = getattr(es, 'course_code', '') or ''
                        name = getattr(es, 'course_name', '') or ''
                        subject_name = f"{code} - {name}".strip(' -') if code or name else str(es)
                    elif teach and getattr(teach, 'curriculum_row', None):
                        cr = teach.curriculum_row
                        code = getattr(cr, 'course_code', '') or ''
                        name = getattr(cr, 'course_name', '') or ''
                        subject_name = f"{code} - {name}".strip(' -') if code or name else ''
                    elif ta and getattr(ta, 'curriculum_row', None):
                        code = getattr(ta.curriculum_row, 'course_code', '') or ''
                        name = getattr(ta.curriculum_row, 'course_name', '') or ''
                        subject_name = f"{code} - {name}".strip(' -') if code or name else ''
                    elif ta and getattr(ta, 'subject_batch', None):
                        subject_name = getattr(ta.subject_batch, 'name', '') or 'Subject'
                    elif ta and getattr(ta, 'subject_text', None):
                        subject_name = ta.subject_text
                except Exception:
                    subject_name = ''

                period_stats.append({
                    'session_id': session.id,
                    'period_index': getattr(session.period, 'index', 0) if session.period else 0,
                    'period_label': getattr(session.period, 'label', '') if session.period else '',
                    'period_start': str(getattr(session.period, 'start_time', '')) if session.period and getattr(session.period, 'start_time', None) else '',
                    'period_end': str(getattr(session.period, 'end_time', '')) if session.period and getattr(session.period, 'end_time', None) else '',
                    'section_id': session.section_id,
                    'section_name': getattr(session.section, 'name', '') if session.section else '',
                    'subject': subject_name,
                    'total_strength': total_strength,
                    'total_marked': total_records,
                    'present': present_count,
                    'absent': absent_count,
                    'leave': leave_count,
                    'late': late_count,
                    'on_duty': od_count,
                    'attendance_percentage': round(attendance_pct, 2),
                    'is_locked': getattr(session, 'is_locked', False),
                    'marked_at': session.created_at.isoformat() if getattr(session, 'created_at', None) else None,
                    'marked_by': getattr(getattr(session, 'created_by', None), 'user', None).username if getattr(session, 'created_by', None) and getattr(getattr(session, 'created_by', None), 'user', None) else ''
                })
            except Exception:
                # don't let one session break the whole response
                continue

        period_stats.sort(key=lambda x: x['period_index'])
        return Response({'date': target_date.isoformat(), 'periods': period_stats, 'total_periods': len(period_stats), 'staff_name': user.username if user else ''})


class PeriodAttendanceReportView(APIView):
    """Return a detailed attendance report for a specific period session."""
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

        session_id = request.query_params.get('session_id')
        if not session_id:
            return Response({'detail': 'session_id required'}, status=400)

        try:
            session = PeriodAttendanceSession.objects.select_related(
                'period', 'section', 'section__batch', 'section__batch__course',
                'section__batch__course__department', 'timetable_assignment',
                'timetable_assignment__curriculum_row', 'timetable_assignment__subject_batch',
                'created_by'
            ).get(pk=int(session_id))
        except PeriodAttendanceSession.DoesNotExist:
            return Response({'detail': 'Session not found'}, status=404)

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

        if allowed_section_ids is not None and session.section_id not in allowed_section_ids:
            return Response({'detail': 'Permission denied for this session'}, status=403)

        # Get attendance records for this session
        recs = PeriodAttendanceRecord.objects.filter(
            session=session
        ).select_related('student').order_by('-id')

        # total strength: count students in the section
        total_strength = StudentProfile.objects.filter(section_id=session.section_id).count()

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

        # Get period info
        period_label = getattr(session.period, 'label', '') if session.period else ''
        period_start = str(getattr(session.period, 'start_time', '')) if session.period and getattr(session.period, 'start_time', None) else ''
        period_end = str(getattr(session.period, 'end_time', '')) if session.period and getattr(session.period, 'end_time', None) else ''

        # section display + batch/department
        section_name = getattr(session.section, 'name', '') if session.section else ''
        batch_name = getattr(getattr(session.section, 'batch', None), 'name', '') if session.section and getattr(session.section, 'batch', None) else ''
        dept = getattr(getattr(getattr(session.section, 'batch', None), 'course', None), 'department', None) if session.section else None
        department_name = getattr(dept, 'name', '') if dept else ''
        department_short = getattr(dept, 'short_name', '') if dept else ''

        # Get subject info - defensive attribute access
        subject_name = ''
        ta = session.timetable_assignment
        try:
            if ta and getattr(ta, 'curriculum_row', None):
                code = getattr(ta.curriculum_row, 'course_code', '') or ''
                name = getattr(ta.curriculum_row, 'course_name', '') or ''
                subject_name = f"{code} - {name}".strip(' -') if code or name else ''
            elif ta and getattr(ta, 'subject_batch', None):
                subject_name = getattr(ta.subject_batch, 'name', '') or 'Subject'
        except Exception:
            subject_name = ''

        return Response({
            'session_id': session.id,
            'date': session.date.isoformat(),
            'period_label': period_label,
            'period_start': period_start,
            'period_end': period_end,
            'subject': subject_name,
            'section_id': session.section_id,
            'section_name': section_name,
            'batch_name': batch_name,
            'department_name': department_name,
            'department_short': department_short,
            'total_strength': total_strength,
            'total_marked': recs.count(),
            'present': present_count,
            'absent': absent_count,
            'leave': leave_count,
            'late': late_count,
            'on_duty': od_count,
            'absent_list': absent_list,
            'leave_list': leave_list,
            'od_list': od_list,
            'late_list': late_list,
            'attendance_percentage': round(attendance_pct, 2),
            'is_locked': getattr(session, 'is_locked', False),
            'marked_by': getattr(getattr(session, 'created_by', None), 'user', None).username if getattr(session, 'created_by', None) and getattr(getattr(session, 'created_by', None), 'user', None) else '',
            'marked_at': session.created_at.isoformat() if getattr(session, 'created_at', None) else None
        })


class OverallSectionView(APIView):
    """Return overall section-level attendance summary for the given date (defaults to today).

    Permissioning mirrors other analytics endpoints: users with
    'analytics.view_all_analytics' can view all, 'analytics.view_department_analytics'
    can view their departments, and 'analytics.view_class_analytics' can view advisor sections.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        staff_profile = getattr(user, 'staff_profile', None)

        can_view_all = 'analytics.view_all_analytics' in perms or user.is_superuser
        can_view_department = 'analytics.view_department_analytics' in perms or can_view_all
        can_view_class = 'analytics.view_class_analytics' in perms or can_view_department
        if not (can_view_all or can_view_department or can_view_class):
            raise PermissionDenied('You do not have permission to view analytics')

        date_str = request.query_params.get('date')
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')
        complete = request.query_params.get('complete', '').lower() in ('true', '1')
        try:
            if date_from_str and date_to_str:
                date_from = date.fromisoformat(date_from_str)
                date_to = date.fromisoformat(date_to_str)
            elif date_str:
                date_from = date_to = date.fromisoformat(date_str)
            else:
                date_from = date_to = date.today()
        except Exception:
            date_from = date_to = date.today()
        is_range = complete or (date_from != date_to)

        # Use DailyAttendanceSession instead of Period 1 attendance
        from .models import DailyAttendanceSession, DailyAttendanceRecord

        base_qs = DailyAttendanceSession.objects.all() if complete else DailyAttendanceSession.objects.filter(date__range=(date_from, date_to))
        sessions_q = base_qs.select_related(
            'section', 'section__batch', 'section__batch__course', 'section__batch__course__department'
        )

        # apply permission scoping and build section map
        section_map = {}
        
        if not can_view_all:
            if can_view_department and staff_profile:
                # For department view, show ALL sections in the department (not just assigned ones)
                from .models import TeachingAssignment
                dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True)
                dept_ids = [dr.department_id for dr in dept_roles if dr.department_id]
                # Only use DepartmentRole, not teaching assignments, to avoid showing only assigned sections
                dept_ids = list(set(filter(None, dept_ids)))
                
                if dept_ids:
                    # Get all sections in these departments
                    all_dept_sections = Section.objects.filter(
                        batch__course__department_id__in=dept_ids
                    ).select_related('batch', 'batch__course', 'batch__course__department')
                    
                    # Pre-populate section_map with all department sections
                    for section in all_dept_sections:
                        section_map[section.id] = {
                            'section_id': section.id,
                            'section_name': section.name,
                            'department_name': section.batch.course.department.name if section.batch and section.batch.course and section.batch.course.department else '',
                            'department_short': section.batch.course.department.short_name if section.batch and section.batch.course and section.batch.course.department else '',
                            'batch': section.batch.name if section.batch else '',
                            'batch_id': section.batch.id if section.batch else None,
                            'total_strength': StudentProfile.objects.filter(section_id=section.id).count(),
                            'total_marked': 0,
                            'present': 0,
                            'absent': 0,
                            'on_duty': 0,
                            'leave': 0,
                            'is_locked': False,
                            'marked_at': None,
                            'attendance_session_id': None,
                            'session_id': None,
                        }
                    
                    # Filter sessions to these departments
                    sessions_q = sessions_q.filter(section__batch__course__department_id__in=dept_ids)
                else:
                    sessions_q = sessions_q.none()
            elif can_view_class and staff_profile:
                from .models import SectionAdvisor
                advisor_sections = SectionAdvisor.objects.filter(advisor=staff_profile, is_active=True).values_list('section_id', flat=True)
                if advisor_sections:
                    sessions_q = sessions_q.filter(section_id__in=advisor_sections)
                else:
                    sessions_q = sessions_q.none()

        # aggregate per-section stats from sessions
        for session in sessions_q:
            sec_id = session.section_id
            sec_name = getattr(session.section, 'name', '') if session.section else ''
            
            # Only create new entry if not already in map (for non-department views)
            if sec_id not in section_map:
                section_map[sec_id] = {
                        'section_id': sec_id,
                            'section_name': sec_name,
                            'department_name': getattr(getattr(getattr(session.section, 'batch', None), 'course', None), 'department', None) and getattr(getattr(getattr(session.section, 'batch', None), 'course', None), 'department', None).name or '',
                            'department_short': getattr(getattr(getattr(session.section, 'batch', None), 'course', None), 'department', None) and getattr(getattr(getattr(session.section, 'batch', None), 'course', None), 'department', None).short_name or '',
                            'batch': getattr(getattr(session.section, 'batch', None), 'name', '') if getattr(session, 'section', None) and getattr(session.section, 'batch', None) else '',
                            'batch_id': getattr(getattr(session.section, 'batch', None), 'id', None) if getattr(session, 'section', None) and getattr(session.section, 'batch', None) else None,
                    'total_strength': 0,
                    'total_marked': 0,
                    'present': 0,
                    'absent': 0,
                    'on_duty': 0,
                    'leave': 0,
                    'is_locked': False,
                    'marked_at': None,
                    'attendance_session_id': None,
                    'session_id': None,
                }
            
            try:
                recs = DailyAttendanceRecord.objects.filter(session=session)
                total_strength = StudentProfile.objects.filter(section_id=session.section_id).count() if session.section_id else 0
                total_records = recs.count()
                present_count = recs.filter(status__in=['P', 'OD', 'LATE']).count()
                absent_count = recs.filter(status='A').count()
                od_count = recs.filter(status='OD').count()
                leave_count = recs.filter(status='LEAVE').count()

                entry = section_map[sec_id]
                # Update with attendance data
                entry['total_strength'] = max(entry['total_strength'], total_strength)
                entry['total_marked'] += total_records
                entry['present'] += present_count
                entry['absent'] += absent_count
                entry['on_duty'] += od_count
                entry['leave'] += leave_count
                entry['is_locked'] = entry['is_locked'] or getattr(session, 'is_locked', False)
                # Store the session ID for fetching detailed records later
                entry['attendance_session_id'] = session.id
                entry['session_id'] = session.id
                if getattr(session, 'created_at', None):
                    if not entry['marked_at']:
                        entry['marked_at'] = session.created_at.isoformat()
                    else:
                        # keep earliest
                        try:
                            if session.created_at.isoformat() < entry['marked_at']:
                                entry['marked_at'] = session.created_at.isoformat()
                        except Exception:
                            pass
            except Exception:
                continue

        # finalize attendance_percentage
        result = []
        for sec in section_map.values():
            total_marked = sec.get('total_marked', 0)
            present = sec.get('present', 0)
            attendance_pct = (present / sec['total_strength'] * 100) if sec['total_strength'] > 0 else 0
            sec['attendance_percentage'] = round(attendance_pct, 2)
            result.append(sec)

        # sort by section name
        result.sort(key=lambda x: (x['section_name'] or ''))

        return Response({'date': date_from.isoformat(), 'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(), 'is_range': is_range, 'sections': result, 'total_sections': len(result)})


class MyClassStudentsView(APIView):
    """
    Get students from advisor's assigned sections for daily attendance marking.
    Requires 'analytics.view_class_analytics' permission or advisor role.
    """
    permission_classes = (IsAuthenticated,)
    
    def get(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        from .models import SectionAdvisor, StudentProfile
        
        # Get advisor's assigned sections
        advisor_sections = SectionAdvisor.objects.filter(
            advisor=staff_profile,
            is_active=True
        ).select_related('section', 'section__batch', 'section__batch__course').values_list('section_id', flat=True)
        
        if not advisor_sections:
            return Response({'sections': [], 'message': 'No assigned sections found'})
        
        # Get all students from these sections
        students = StudentProfile.objects.filter(
            section_id__in=advisor_sections
        ).select_related('user', 'section', 'section__batch').order_by('section__name', 'reg_no')
        
        # Group by section
        sections_data = {}
        for student in students:
            section_id = student.section_id
            if section_id not in sections_data:
                sections_data[section_id] = {
                    'section_id': section_id,
                    'section_name': student.section.name if student.section else '',
                    'batch_name': student.section.batch.name if student.section and student.section.batch else '',
                    'students': []
                }
            
            sections_data[section_id]['students'].append({
                'id': student.id,
                'reg_no': student.reg_no,
                'name': student.user.get_full_name() if student.user else '',
                'username': student.user.username if student.user else '',
                'section_id': section_id,
            })
        
        return Response({
            'sections': list(sections_data.values()),
            'total_sections': len(sections_data),
            'total_students': students.count()
        })


class MyClassAttendanceAnalyticsView(APIView):
    """
    Get period attendance analytics for advisor's assigned sections.
    Requires 'analytics.view_class_analytics' permission or advisor role.
    """
    permission_classes = (IsAuthenticated,)
    
    def get(self, request):
        try:
            user = request.user
            staff_profile = getattr(user, 'staff_profile', None)
            if not staff_profile:
                return Response({'error': 'Staff profile required', 'sections': []}, status=400)
            
            from .models import SectionAdvisor
            from datetime import date as date_class
            
            # Get query parameters
            date_str = request.query_params.get('date')
            date_from_str = request.query_params.get('date_from')
            date_to_str = request.query_params.get('date_to')
            complete = request.query_params.get('complete', '').lower() in ('true', '1')
            view_mode = request.query_params.get('view_mode', 'class')
            
            if view_mode != 'class':
                return Response({'error': 'This endpoint only supports view_mode=class'}, status=400)
            
            # Parse date range
            try:
                if date_from_str and date_to_str:
                    date_from = date_class.fromisoformat(date_from_str)
                    date_to = date_class.fromisoformat(date_to_str)
                elif date_str:
                    date_from = date_to = date_class.fromisoformat(date_str)
                else:
                    date_from = date_to = date_class.today()
            except:
                date_from = date_to = date_class.today()
            target_date = date_from  # for backward compat in response
            is_range = complete or (date_from != date_to)
            
            # Get advisor's assigned sections
            advisor_sections = SectionAdvisor.objects.filter(
                advisor=staff_profile,
                is_active=True
            ).values_list('section_id', flat=True)
            
            if not advisor_sections:
                return Response({
                    'sections': [], 
                    'message': 'No assigned sections found',
                    'debug': {
                        'staff_profile_id': staff_profile.id if staff_profile else None,
                        'total_advisors': SectionAdvisor.objects.count(),
                        'active_advisors': SectionAdvisor.objects.filter(is_active=True).count()
                    }
                })
            
            # Get period attendance sessions for these sections on date range (or all if complete)
            _period_base = PeriodAttendanceSession.objects.filter(section_id__in=list(advisor_sections))
            sessions = (_period_base if complete else _period_base.filter(date__range=(date_from, date_to))).select_related(
                'section', 'section__batch', 'period', 'period__template',
                'teaching_assignment', 'teaching_assignment__subject',
                'teaching_assignment__curriculum_row', 'teaching_assignment__elective_subject'
            )
            
            # Also get daily attendance sessions for these sections on date range (or all if complete)
            from .models import DailyAttendanceSession, DailyAttendanceRecord
            _daily_base = DailyAttendanceSession.objects.filter(section_id__in=list(advisor_sections))
            daily_sessions = (_daily_base if complete else _daily_base.filter(date__range=(date_from, date_to))).select_related('section', 'section__batch')
            
            # Build a map of daily attendance data by section_id (aggregated across date range)
            daily_attendance_map = {}
            for daily_session in daily_sessions:
                section_id = daily_session.section_id
                records = DailyAttendanceRecord.objects.filter(session=daily_session)
                present_count = records.filter(status__in=['P', 'LATE', 'OD']).count()
                absent_count = records.filter(status='A').count()
                leave_count_daily = records.filter(status='LEAVE').count()
                od_count_daily = records.filter(status='OD').count()
                
                # Get section details
                section = daily_session.section
                section_name = section.name if section else 'Unknown'
                department_name = 'Unknown'
                batch_name = 'Unknown'
                
                if section and section.batch:
                    batch_name = section.batch.name or 'Unknown'
                    if section.batch.course and section.batch.course.department:
                        department_name = section.batch.course.department.name or 'Unknown'

                if section_id not in daily_attendance_map:
                    daily_attendance_map[section_id] = {
                        'session_id': daily_session.id,
                        'section_id': section_id,
                        'section_name': section_name,
                        'department': department_name,
                        'department_name': department_name,
                        'batch': batch_name,
                        'batch_name': batch_name,
                        'present_count': 0,
                        'absent_count': 0,
                        'leave_count': 0,
                        'od_count': 0,
                        'total_count': 0,
                        'is_locked': False,
                        'attendance_marked': False,
                        'days_count': 0,
                    }
                # Aggregate
                entry = daily_attendance_map[section_id]
                entry['present_count'] += present_count
                entry['absent_count'] += absent_count
                entry['leave_count'] += leave_count_daily
                entry['od_count'] += od_count_daily
                entry['total_count'] += present_count + absent_count + leave_count_daily
                entry['is_locked'] = entry['is_locked'] or getattr(daily_session, 'is_locked', False)
                entry['attendance_marked'] = entry['attendance_marked'] or ((present_count + absent_count) > 0)
                entry['days_count'] += 1
            
            sections_data = []
            session_errors = []

            # Pre-build a cache: template_id -> {slot_index -> actual_period_number}
            # Actual period number = rank among non-break, non-lunch slots ordered by index
            from timetable.models import TimetableSlot
            _period_num_cache: dict = {}  # (template_id, slot_index) -> actual period number
            _template_ids = set()
            for s in sessions:
                if s.period and s.period.template_id:
                    _template_ids.add(s.period.template_id)
            for tmpl_id in _template_ids:
                slots = TimetableSlot.objects.filter(
                    template_id=tmpl_id,
                    is_break=False,
                    is_lunch=False
                ).order_by('index')
                for rank, slot in enumerate(slots, start=1):
                    _period_num_cache[(tmpl_id, slot.index)] = rank

            def get_actual_period_number(period_obj):
                """Return the actual teaching period number (breaks excluded)."""
                if not period_obj:
                    return 1
                template_id = period_obj.template_id
                idx = period_obj.index
                return _period_num_cache.get((template_id, idx), idx)

            # When date range spans multiple days, aggregate by (section_id, subject_code, period_number)
            period_agg_map = {}
            for session in sessions:
                try:
                    # Calculate attendance counts safely
                    records = session.records.all()
                    present_count = sum(1 for r in records if r.status in ['P', 'LATE', 'OD'])
                    absent_count = sum(1 for r in records if r.status == 'A')
                    leave_count = sum(1 for r in records if r.status == 'LEAVE')
                    od_count = sum(1 for r in records if r.status == 'OD')
                    
                    section = session.section
                    department_name = 'Unknown'
                    batch_name = 'Unknown'
                    if section and section.batch:
                        batch_name = section.batch.name or 'Unknown'
                        if section.batch.course and section.batch.course.department:
                            department_name = section.batch.course.department.name or 'Unknown'
                    
                    subject_name = 'N/A'
                    subject_code = 'N/A'
                    if session.teaching_assignment:
                        ta = session.teaching_assignment
                        if ta.subject:
                            subject_name = ta.subject.name
                            subject_code = ta.subject.code
                        elif ta.curriculum_row:
                            subject_name = ta.curriculum_row.course_name or 'N/A'
                            subject_code = ta.curriculum_row.course_code or 'N/A'
                        elif ta.elective_subject:
                            subject_name = ta.elective_subject.course_name or 'N/A'
                            subject_code = ta.elective_subject.course_code or 'N/A'
                        elif ta.custom_subject:
                            subject_name = ta.custom_subject
                            subject_code = ta.custom_subject
                    
                    period_num = get_actual_period_number(session.period)
                    agg_key = (session.section_id, subject_code, period_num)

                    if agg_key not in period_agg_map:
                        period_agg_map[agg_key] = {
                            'id': session.id,
                            'session_id': session.id,
                            'section_id': session.section_id,
                            'section_name': section.name if section else 'Unknown',
                            'department': department_name,
                            'department_name': department_name,
                            'batch': batch_name,
                            'batch_name': batch_name,
                            'period_number': period_num,
                            'subject_name': subject_name,
                            'subject_code': subject_code,
                            'start_time': session.period.start_time.strftime('%H:%M') if (session.period and session.period.start_time) else 'N/A',
                            'end_time': session.period.end_time.strftime('%H:%M') if (session.period and session.period.end_time) else 'N/A',
                            'present_count': 0,
                            'absent_count': 0,
                            'leave_count': 0,
                            'od_count': 0,
                            'total_count': 0,
                            'is_locked': False,
                            'attendance_marked': False,
                            'sessions_count': 0,
                        }
                    agg = period_agg_map[agg_key]
                    agg['present_count'] += present_count
                    agg['absent_count'] += absent_count
                    agg['leave_count'] += leave_count
                    agg['od_count'] += od_count
                    agg['total_count'] += present_count + absent_count + leave_count
                    agg['is_locked'] = agg['is_locked'] or getattr(session, 'is_locked', False)
                    agg['attendance_marked'] = agg['attendance_marked'] or ((present_count + absent_count) > 0)
                    agg['sessions_count'] += 1
                except Exception as e:
                    session_errors.append({
                        'session_id': getattr(session, 'id', 'unknown'),
                        'error': str(e),
                        'error_type': type(e).__name__
                    })
                    continue

            for agg in period_agg_map.values():
                tc = agg['total_count']
                agg['attendance_percentage'] = round((agg['present_count'] / tc) * 100, 1) if tc > 0 else 0
                agg['date'] = date_from.isoformat()
                sections_data.append(agg)
            
            return Response({
                'sections': sections_data,
                'daily_attendance': daily_attendance_map,
                'date': date_from.isoformat(),
                'date_from': date_from.isoformat(),
                'date_to': date_to.isoformat(),
                'is_range': is_range,
                'total_sections': len(set(s['section_id'] for s in sections_data)) if sections_data else 0,
                'total_periods': len(sections_data),
                'debug': {
                    'advisor_sections_count': len(list(advisor_sections)),
                    'sessions_found': sessions.count(),
                    'daily_sessions_found': daily_sessions.count(),
                    'staff_profile_id': staff_profile.id,
                    'session_errors': session_errors if session_errors else []
                }
            })
        
        except Exception as e:
            # Return error details for debugging
            import traceback
            return Response({
                'error': f'Server error: {str(e)}',
                'sections': [],
                'debug': {
                    'error_type': type(e).__name__,
                    'traceback': traceback.format_exc(),
                    'user_id': getattr(request, 'user', None) and getattr(request.user, 'id', None)
                }
            }, status=500)


class DailyAttendanceView(APIView):
    """
    GET: Fetch daily attendance for a section on a date
    POST: Save/update daily attendance for students
    """
    permission_classes = (IsAuthenticated,)
    
    def get(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        from .models import SectionAdvisor, DailyAttendanceSession, DailyAttendanceRecord, StudentProfile
        from datetime import date as date_class
        
        section_id = request.query_params.get('section_id')
        date_str = request.query_params.get('date')
        
        if not section_id:
            return Response({'error': 'section_id required'}, status=400)
        
        # Allow access if any of:
        #   1. Section advisor for this section
        #   2. Has a teaching assignment for this section (period teacher)
        #   3. Has department-level or all-level analytics permission
        #   4. Superuser
        perms = get_user_permissions(user)
        can_view_all = 'analytics.view_all_analytics' in perms or user.is_superuser
        can_view_department = 'analytics.view_department_analytics' in perms or can_view_all

        is_advisor = SectionAdvisor.objects.filter(
            advisor=staff_profile,
            section_id=section_id,
            is_active=True
        ).exists()

        has_teaching = False
        has_elective_for_section = False
        if not is_advisor and not can_view_department:
            from .models import TeachingAssignment
            # Direct section assignment (regular subjects)
            has_teaching = TeachingAssignment.objects.filter(
                staff=staff_profile,
                section_id=section_id,
                is_active=True
            ).exists()
            # Elective assignment: staff teaches an elective that has students enrolled
            # from the requested section (students from cross-dept/cross-section groups)
            if not has_teaching:
                has_elective_for_section = TeachingAssignment.objects.filter(
                    staff=staff_profile,
                    elective_subject__isnull=False,
                    is_active=True,
                    elective_subject__choices__student__section_id=section_id,
                    elective_subject__choices__is_active=True,
                ).exists()

        if not (is_advisor or has_teaching or has_elective_for_section or can_view_department):
            raise PermissionDenied('You are not assigned to this section')
        
        try:
            target_date = date_class.fromisoformat(date_str) if date_str else date_class.today()
        except Exception:
            target_date = date_class.today()
        
        # Only advisors (or admins) may auto-create the session.
        # Period-only teachers just read whatever session already exists.
        if is_advisor or can_view_department:
            session, created = DailyAttendanceSession.objects.get_or_create(
                section_id=section_id,
                date=target_date,
                defaults={'created_by': staff_profile}
            )
        else:
            session = DailyAttendanceSession.objects.filter(
                section_id=section_id,
                date=target_date,
            ).first()
            # No daily session yet means no overrides – return empty gracefully
            if session is None:
                students = StudentProfile.objects.filter(section_id=section_id).select_related('user').order_by('reg_no')
                return Response({
                    'session_id': None,
                    'section_id': section_id,
                    'date': target_date.isoformat(),
                    'is_locked': False,
                    'unlock_request_status': None,
                    'unlock_request_id': None,
                    'students': [
                        {
                            'student_id': s.id,
                            'reg_no': s.reg_no,
                            'name': s.user.get_full_name() if s.user else '',
                            'username': s.user.username if s.user else '',
                            'status': 'P',
                            'remarks': '',
                            'marked_at': None,
                        }
                        for s in students
                    ],
                    'total_students': students.count(),
                })
        
        # Get existing records
        records = DailyAttendanceRecord.objects.filter(session=session).select_related('student', 'student__user')
        records_map = {rec.student_id: rec for rec in records}
        
        # Get all students in section
        students = StudentProfile.objects.filter(section_id=section_id).select_related('user').order_by('reg_no')
        
        students_data = []
        for student in students:
            record = records_map.get(student.id)
            students_data.append({
                'student_id': student.id,
                'reg_no': student.reg_no,
                'name': student.user.get_full_name() if student.user else '',
                'username': student.user.username if student.user else '',
                'status': record.status if record else 'P',
                'remarks': record.remarks if record else '',
                'marked_at': record.marked_at.isoformat() if record and record.marked_at else None,
            })
        
        # Check for pending unlock request
        unlock_request = None
        try:
            from .models import DailyAttendanceUnlockRequest
            unlock_request = DailyAttendanceUnlockRequest.objects.filter(
                session=session,
                status='PENDING'
            ).first()
        except Exception:
            pass
        
        return Response({
            'session_id': session.id,
            'section_id': section_id,
            'date': target_date.isoformat(),
            'is_locked': session.is_locked,
            'unlock_request_status': unlock_request.status if unlock_request else None,
            'unlock_request_id': unlock_request.id if unlock_request else None,
            'students': students_data,
            'total_students': len(students_data),
        })
    
    def post(self, request):
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        from .models import SectionAdvisor, DailyAttendanceSession, DailyAttendanceRecord
        from datetime import date as date_class
        from django.db import transaction
        
        section_id = request.data.get('section_id')
        date_str = request.data.get('date')
        attendance_data = request.data.get('attendance', [])  # List of {student_id, status, remarks}
        
        if not section_id:
            return Response({'error': 'section_id required'}, status=400)
        
        # Verify user is advisor of this section
        is_advisor = SectionAdvisor.objects.filter(
            advisor=staff_profile,
            section_id=section_id,
            is_active=True
        ).exists()
        
        if not is_advisor:
            raise PermissionDenied('You are not an advisor of this section')
        
        try:
            target_date = date_class.fromisoformat(date_str) if date_str else date_class.today()
        except Exception:
            target_date = date_class.today()
        
        try:
            with transaction.atomic():
               # Get or create session
                session, created = DailyAttendanceSession.objects.get_or_create(
                    section_id=section_id,
                    date=target_date,
                    defaults={'created_by': staff_profile}
                )
                
                if session.is_locked:
                    return Response({'error': 'Attendance is locked for this date'}, status=403)
                
                # Update or create records
                updated_students = []
                for item in attendance_data:
                    student_id = item.get('student_id')
                    status = item.get('status', 'P')
                    remarks = item.get('remarks', '')
                    
                    if student_id:
                        DailyAttendanceRecord.objects.update_or_create(
                            session=session,
                            student_id=student_id,
                            defaults={
                                'status': status,
                                'remarks': remarks,
                                'marked_by': staff_profile
                            }
                        )
                        updated_students.append({'student_id': student_id, 'status': status})
                
                # ── Update existing period attendance records ──────────────────────────
                # After saving daily attendance, update all existing period attendance records
                # for the same students on the same date to reflect daily attendance overrides:
                #   OD/LEAVE → force same status in all period records
                #   LATE     → force Present ('P') in all period records  
                #   P/A      → no override needed for period records
                from .models import PeriodAttendanceSession, PeriodAttendanceRecord
                
                period_sessions = PeriodAttendanceSession.objects.filter(
                    section_id=section_id,
                    date=target_date
                )
                
                period_records_updated = 0
                for student_info in updated_students:
                    student_id = student_info['student_id']
                    daily_status = student_info['status']
                    
                    # Determine what the period status should be
                    period_status = None
                    if daily_status in ('OD', 'LEAVE'):
                        # Force OD/LEAVE in all period records
                        period_status = daily_status
                    elif daily_status == 'LATE':
                        # Force Present in all period records
                        period_status = 'P'
                    # For 'P' or 'A' daily status, don't override period records
                    
                    if period_status:
                        # Update all period records for this student on this date
                        updated = PeriodAttendanceRecord.objects.filter(
                            session__in=period_sessions,
                            student_id=student_id
                        ).update(status=period_status)
                        period_records_updated += updated
                # ───────────────────────────────────────────────────────────────────────
                
                return Response({
                    'success': True,
                    'message': 'Attendance saved successfully',
                    'session_id': session.id,
                    'records_updated': len(attendance_data),
                    'period_records_updated': period_records_updated
                })
        
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class DailyAttendanceLockView(APIView):
    """
    POST /api/academics/analytics/daily-attendance-lock/{session_id}/
    Lock a daily attendance session
    """
    permission_classes = (IsAuthenticated,)
    
    def post(self, request, session_id):
        from .models import DailyAttendanceSession, SectionAdvisor
        
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        try:
            session = DailyAttendanceSession.objects.select_related('section').get(id=session_id)
        except DailyAttendanceSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=404)
        
        # Check if user is advisor for this section
        is_advisor = SectionAdvisor.objects.filter(
            advisor=staff_profile,
            section=session.section,
            is_active=True
        ).exists()
        
        if not (is_advisor or session.created_by == staff_profile or user.is_superuser):
            raise PermissionDenied('You do not have permission to lock this session')
        
        session.is_locked = True
        session.save(update_fields=['is_locked'])
        
        return Response({
            'success': True,
            'message': 'Daily attendance session locked successfully',
            'session_id': session.id,
            'is_locked': session.is_locked
        })


class DailyAttendanceUnlockView(APIView):
    """
    POST /api/academics/analytics/daily-attendance-unlock/{session_id}/
    Unlock a daily attendance session (admin only)
    """
    permission_classes = (IsAuthenticated,)
    
    def post(self, request, session_id):
        from .models import DailyAttendanceSession
        
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        # Only admins can directly unlock
        if not user.is_superuser:
            raise PermissionDenied('Only administrators can unlock daily attendance sessions')
        
        try:
            session = DailyAttendanceSession.objects.get(id=session_id)
        except DailyAttendanceSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=404)
        
        session.is_locked = False
        session.save(update_fields=['is_locked'])
        
        return Response({
            'success': True,
            'message': 'Daily attendance session unlocked successfully',
            'session_id': session.id,
            'is_locked': session.is_locked
        })


class DailyAttendanceUnlockRequestView(APIView):
    """
    POST /api/academics/analytics/daily-attendance-unlock-request/
    Create an unlock request for daily attendance
    """
    permission_classes = (IsAuthenticated,)
    
    def post(self, request):
        from .models import DailyAttendanceSession, DailyAttendanceUnlockRequest, SectionAdvisor
        
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            raise PermissionDenied('Staff profile required')
        
        session_id = request.data.get('session')
        note = request.data.get('note', '')
        
        if not session_id:
            return Response({'error': 'session_id required'}, status=400)
        
        try:
            session = DailyAttendanceSession.objects.select_related('section').get(id=session_id)
        except DailyAttendanceSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=404)
        
        # Check if user is advisor for this section
        is_advisor = SectionAdvisor.objects.filter(
            advisor=staff_profile,
            section=session.section,
            is_active=True
        ).exists()
        
        if not (is_advisor or session.created_by == staff_profile):
            raise PermissionDenied('You do not have permission to request unlock for this session')
        
        # Check if there's already a pending request
        existing = DailyAttendanceUnlockRequest.objects.filter(
            session=session,
            status='PENDING'
        ).first()
        
        if existing:
            return Response({
                'error': 'An unlock request for this session is already pending approval'
            }, status=400)
        
        # Create the unlock request
        unlock_request = DailyAttendanceUnlockRequest.objects.create(
            session=session,
            requested_by=staff_profile,
            note=note
        )
        
        return Response({
            'success': True,
            'message': 'Unlock request submitted successfully',
            'id': unlock_request.id,
            'status': unlock_request.status,
            'session_id': session.id
        })


class DailyAttendanceSessionDetailView(APIView):
    """
    GET: Fetch detailed records for a specific daily attendance session
    Similar to period-attendance detail endpoint
    """
    permission_classes = (IsAuthenticated,)
    
    def get(self, request, session_id):
        try:
            from .models import DailyAttendanceSession, DailyAttendanceRecord
            
            session = DailyAttendanceSession.objects.select_related(
                'section', 'section__batch', 'created_by'
            ).get(id=session_id)
            
            # Get all records for this session
            records = DailyAttendanceRecord.objects.filter(
                session=session
            ).select_related('student', 'student__user').order_by('student__reg_no')
            
            records_data = []
            for record in records:
                student = record.student
                reg_no = student.reg_no if student else ''
                records_data.append({
                    'id': record.id,
                    'student_id': student.id if student else None,
                    'student_pk': student.id if student else None,
                    'reg_no': reg_no,
                    'regno': reg_no,
                    'student': {
                        'id': student.id if student else None,
                        'pk': student.id if student else None,
                        'reg_no': reg_no,
                        'regno': reg_no,
                        'registration_number': reg_no,
                        'name': student.user.get_full_name() if student and student.user else '',
                        'username': student.user.username if student and student.user else '',
                    },
                    'status': record.status,
                    'attendance': record.status,
                    'type': record.status,
                    'remarks': record.remarks or '',
                    'marked_at': record.marked_at.isoformat() if record.marked_at else None,
                })
            
            return Response({
                'session_id': session.id,
                'id': session.id,
                'section_id': session.section_id,
                'section_name': session.section.name if session.section else '',
                'date': session.date.isoformat(),
                'session_date': session.date.isoformat(),
                'is_locked': session.is_locked,
                'created_at': session.created_at.isoformat() if session.created_at else None,
                'records': records_data,
                'total_records': len(records_data),
            })
        except DailyAttendanceSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class SectionStudentAttendanceDayView(APIView):
    """
    Returns per-student attendance details for a section on a specific date.

    Query params:
      section_id  (required)  – section to inspect
      date        (required)  – ISO date string YYYY-MM-DD
      session_id  (optional)  – if supplied, filters to ONE specific period session
                                (used by My Class subject row expansions)

    For each student the response includes:
      reg_no, name, daily_status,
      total_periods  – how many PeriodAttendanceSessions exist for this section/date
      present_periods – periods where the student was P / OD / LATE
      absent_periods  – periods where the student was A
      leave_periods   – periods where the student was LEAVE
      percentage      – present_periods / total_periods * 100  (0 if no sessions)
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        section_id = request.query_params.get('section_id')
        date_str = request.query_params.get('date')
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')
        complete = request.query_params.get('complete', '').lower() in ('true', '1')
        session_id = request.query_params.get('session_id')  # optional – filter to one period

        if not section_id:
            return Response({'error': 'section_id is required'}, status=400)

        from datetime import date as date_class
        # Resolve date range: prefer complete (no filter), then date_from/date_to, then single date
        try:
            if complete:
                target_from = target_to = None  # no date constraint
            elif date_from_str and date_to_str:
                target_from = date_class.fromisoformat(date_from_str)
                target_to = date_class.fromisoformat(date_to_str)
            elif date_str:
                target_from = target_to = date_class.fromisoformat(date_str)
            else:
                return Response({'error': 'date or date_from+date_to are required'}, status=400)
        except ValueError:
            return Response({'error': 'Invalid date format, expected YYYY-MM-DD'}, status=400)

        try:
            section_id = int(section_id)
        except (TypeError, ValueError):
            return Response({'error': 'section_id must be an integer'}, status=400)

        # --- Determine period sessions in range ---
        sessions_qs = PeriodAttendanceSession.objects.filter(section_id=section_id)
        if not complete and target_from and target_to:
            sessions_qs = sessions_qs.filter(date__range=(target_from, target_to))
        if session_id:
            try:
                sessions_qs = sessions_qs.filter(pk=int(session_id))
            except (TypeError, ValueError):
                pass

        # Fetch session_id → (date, period_id) mapping so we can deduplicate correctly.
        #
        # Two kinds of duplication to handle:
        #   1. Same-day elective splits: multiple sessions share the same period_id on the
        #      same date (3 staff groups marking period 4 → should count as 1 period-slot that day).
        #   2. Multi-day range: period 4 on Mon + period 4 on Tue = 2 period-slots total (correct).
        #
        # Deduplication key = (date, period_id)  — collapses same-day elective splits,
        # but keeps each day's occurrence as a distinct slot.
        session_slot_map: dict = {}  # session_id -> (date, period_id)
        for row in sessions_qs.values('id', 'period_id', 'date'):
            session_slot_map[row['id']] = (row['date'], row['period_id'])

        session_ids = list(session_slot_map.keys())

        # Unique (date, period_id) slots across the range
        unique_slots = set(session_slot_map.values())
        total_periods = len(unique_slots)

        # --- Get all students in the section ---
        students = StudentProfile.objects.filter(
            section_id=section_id
        ).select_related('user').order_by('reg_no')

        # --- Get all period records for these sessions in one query ---
        records_qs = PeriodAttendanceRecord.objects.filter(
            session_id__in=session_ids
        ).values('student_id', 'status', 'session_id')

        from collections import defaultdict
        # Status priority for deduplication within one slot (higher = better)
        _STATUS_PRIORITY = {'P': 5, 'OD': 4, 'LATE': 3, 'LEAVE': 2, 'A': 1}

        # student_id -> {(date, period_id) -> best_status}
        # Elective splits on the same day: keep the best status across all split sessions.
        student_period_status: dict = defaultdict(dict)  # {student_id: {slot_key: status}}
        for rec in records_qs:
            slot_key = session_slot_map.get(rec['session_id'])
            sid = rec['student_id']
            new_status = rec['status']
            existing = student_period_status[sid].get(slot_key)
            if existing is None or _STATUS_PRIORITY.get(new_status, 0) > _STATUS_PRIORITY.get(existing, 0):
                student_period_status[sid][slot_key] = new_status

        # Flatten: student_id -> list[status] (one entry per unique (date, period_id) slot)
        student_records: dict = {
            sid: list(slot_map.values())
            for sid, slot_map in student_period_status.items()
        }

        # --- Get daily attendance aggregated across the date range ---
        from .models import DailyAttendanceSession, DailyAttendanceRecord
        # student_id -> {present_days, absent_days, leave_days, last_status}
        daily_agg: dict = defaultdict(lambda: {'present_days': 0, 'absent_days': 0, 'leave_days': 0, 'last_status': None, 'last_date': None})
        try:
            daily_sessions = DailyAttendanceSession.objects.filter(
                section_id=section_id,
            )
            if not complete and target_from and target_to:
                daily_sessions = daily_sessions.filter(date__range=(target_from, target_to))
            daily_sessions = daily_sessions.order_by('date')
            daily_session_ids = list(daily_sessions.values_list('id', flat=True))
            # Map session id -> date
            session_date_map = {ds.id: ds.date for ds in daily_sessions}
            for dr in DailyAttendanceRecord.objects.filter(session_id__in=daily_session_ids).values('student_id', 'status', 'session_id'):
                entry = daily_agg[dr['student_id']]
                ds_date = session_date_map.get(dr['session_id'])
                if dr['status'] in ('P', 'OD', 'LATE'):
                    entry['present_days'] += 1
                elif dr['status'] == 'A':
                    entry['absent_days'] += 1
                elif dr['status'] == 'LEAVE':
                    entry['leave_days'] += 1
                # track latest-date status for display
                if ds_date and (entry['last_date'] is None or ds_date >= entry['last_date']):
                    entry['last_date'] = ds_date
                    entry['last_status'] = dr['status']
        except Exception:
            pass

        is_range = complete or (target_from != target_to if (target_from and target_to) else False)

        # --- Build response ---
        result = []
        for stu in students:
            statuses = student_records.get(stu.id, [])
            present_p = sum(1 for s in statuses if s in ('P', 'OD', 'LATE'))
            absent_p = sum(1 for s in statuses if s == 'A')
            leave_p = sum(1 for s in statuses if s == 'LEAVE')
            pct = round(present_p / total_periods * 100, 1) if total_periods > 0 else None
            name = stu.user.get_full_name() if stu.user else ''
            if not name and stu.user:
                name = stu.user.username or ''
            da = daily_agg.get(stu.id, {})
            result.append({
                'student_id': stu.id,
                'reg_no': stu.reg_no or '',
                'name': name,
                'daily_status': da.get('last_status', None) if not is_range else None,
                'daily_present_days': da.get('present_days', 0),
                'daily_absent_days': da.get('absent_days', 0),
                'daily_leave_days': da.get('leave_days', 0),
                'total_periods': total_periods,
                'present_periods': present_p,
                'absent_periods': absent_p,
                'leave_periods': leave_p,
                'percentage': pct,
            })

        return Response({
            'section_id': section_id,
            'date': target_from.isoformat() if target_from else None,
            'date_from': target_from.isoformat() if target_from else None,
            'date_to': target_to.isoformat() if target_to else None,
            'is_range': is_range,
            'total_periods': total_periods,
            'students': result,
        })
