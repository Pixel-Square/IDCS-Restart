import csv
import io
import calendar
import re
import traceback as tb_module
from datetime import datetime, date as date_type, timedelta
from django.core.management import call_command
from django.db import transaction
from django.utils import timezone
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from accounts.models import User
from .models import AttendanceRecord, UploadLog, HalfDayRequest, Holiday, AttendanceSettings, DepartmentAttendanceSettings, SpecialDepartmentDateAttendanceLimit
from .serializers import AttendanceRecordSerializer, UploadLogSerializer, CSVUploadSerializer, HalfDayRequestSerializer, HalfDayRequestCreateSerializer, HalfDayRequestReviewSerializer, HolidaySerializer, HolidayCreateSerializer, AttendanceSettingsSerializer, DepartmentAttendanceSettingsSerializer, SpecialDepartmentDateAttendanceLimitSerializer
from .permissions import StaffAttendanceViewPermission, StaffAttendanceUploadPermission, StaffAttendanceConfigPermission


class AttendanceRecordViewSet(viewsets.ModelViewSet):
    """ViewSet for viewing and editing attendance records"""
    serializer_class = AttendanceRecordSerializer
    permission_classes = [StaffAttendanceViewPermission]
    filterset_fields = ['user', 'date', 'status']
    search_fields = ['user__username', 'user__first_name', 'user__last_name']
    ordering_fields = ['date', 'user', 'status']

    def get_queryset(self):
        """Filter queryset based on user permissions"""
        user = self.request.user
        
        # Superuser and users with view permission can see all records
        if (user.is_superuser or 
            user.has_perm('staff_attendance.view_attendance_records') or
            (hasattr(user, 'user_roles') and 
             user.user_roles.filter(role__name__in=['PS', 'HOD', 'ADMIN']).exists())):
            return AttendanceRecord.objects.all()
        else:
            # Regular users can only see their own records
            return AttendanceRecord.objects.filter(user=user)

    @action(detail=False, methods=['get'])
    def today_status(self, request):
        """Get today's attendance status for the current user"""
        # Use localtime to get date in server timezone (Asia/Kolkata)
        today = timezone.localtime(timezone.now()).date()
        record = AttendanceRecord.objects.filter(
            user=request.user, 
            date=today
        ).first()
        
        if record:
            return Response({
                'date': today.isoformat(),
                'status': record.status,
                'fn_status': record.fn_status,
                'an_status': record.an_status,
                'morning_in': record.morning_in.strftime('%H:%M') if record.morning_in else None,
                'evening_out': record.evening_out.strftime('%H:%M') if record.evening_out else None,
                'has_record': True
            })
        else:
            return Response({
                'date': today.isoformat(),
                'status': 'no_record',  # Changed from 'absent' to 'no_record'
                'fn_status': 'no_record',
                'an_status': 'no_record',
                'morning_in': None,
                'evening_out': None,
                'has_record': False
            })

    @action(detail=False, methods=['get'])
    def monthly_records(self, request):
        """
        Get attendance records for the current user or all users (based on permissions)
        
        Query Parameters:
        - year: year (default: current year)
        - month: month (default: current month)
        - from_date: start date in YYYY-MM-DD format (overrides year/month)
        - to_date: end date in YYYY-MM-DD format (overrides year/month)
        - user_id: specific user ID (optional)
        - department_id: filter by department (HOD can only see their department, IQAC can see any)
        """
        # Get query parameters for date range
        from_date_str = request.query_params.get('from_date')
        to_date_str = request.query_params.get('to_date')
        user_id = request.query_params.get('user_id')
        department_id = request.query_params.get('department_id')
        self_only = request.query_params.get('self_only', 'false').lower() == 'true'
        
        # If date range provided, use it; otherwise use year/month
        if from_date_str and to_date_str:
            try:
                from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            queryset = AttendanceRecord.objects.filter(date__gte=from_date, date__lte=to_date)
        else:
            # Use year/month approach
            year = int(request.query_params.get('year', timezone.now().year))
            month = int(request.query_params.get('month', timezone.now().month))
            queryset = AttendanceRecord.objects.filter(date__year=year, date__month=month)
        
        # Check user permissions and determine what data they can see
        user = request.user
        is_superuser = user.is_superuser
        has_view_perm = user.has_perm('staff_attendance.view_attendance_records')
        is_ps = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='PS').exists()
        is_hod = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='HOD').exists()
        is_iqac = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='IQAC').exists()
        is_admin = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='ADMIN').exists()
        
        # Get user's staff profile and department
        user_staff_profile = getattr(user, 'staff_profile', None)
        user_department = user_staff_profile.department if user_staff_profile else None
        
        # Force self-only view if requested (for personal calendar views)
        if self_only:
            queryset = queryset.filter(user=user)
        # Filter by specific user_id if provided
        elif user_id:
            # Check if user has permission to view other users' records
            if not (is_superuser or has_view_perm or is_ps or is_hod or is_iqac or is_admin):
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            queryset = queryset.filter(user_id=user_id)
        elif department_id:
            # Department-based filtering
            department_id = int(department_id)
            
            if is_superuser or has_view_perm or is_ps or is_iqac or is_admin:
                # These roles can see any department
                queryset = queryset.filter(user__staff_profile__department_id=department_id)
            elif is_hod:
                # HOD can see departments where they are HOD or AHOD
                from academics.models import DepartmentRole, AcademicYear
                if user_staff_profile:
                    current_year = AcademicYear.objects.filter(is_active=True).first()
                    if current_year:
                        hod_dept_ids = DepartmentRole.objects.filter(
                            staff=user_staff_profile,
                            role__in=['HOD', 'AHOD'],
                            academic_year=current_year,
                            is_active=True
                        ).values_list('department_id', flat=True)
                        if department_id in hod_dept_ids:
                            queryset = queryset.filter(user__staff_profile__department_id=department_id)
                        else:
                            return Response({'error': 'Permission denied: You are not HOD/AHOD for this department'}, 
                                          status=status.HTTP_403_FORBIDDEN)
                    else:
                        return Response({'error': 'No active academic year'}, status=status.HTTP_400_BAD_REQUEST)
                else:
                    return Response({'error': 'Staff profile required'}, status=status.HTTP_403_FORBIDDEN)
            else:
                # Regular staff cannot filter by department
                queryset = queryset.filter(user=user)
        else:
            # No specific filters - determine what user can see
            if is_superuser or has_view_perm or is_ps or is_iqac or is_admin:
                # These roles can see all records
                pass
            elif is_hod:
                # HOD sees all their departments where they are HOD/AHOD
                from academics.models import DepartmentRole, AcademicYear
                if user_staff_profile:
                    current_year = AcademicYear.objects.filter(is_active=True).first()
                    if current_year:
                        hod_dept_ids = DepartmentRole.objects.filter(
                            staff=user_staff_profile,
                            role__in=['HOD', 'AHOD'],
                            academic_year=current_year,
                            is_active=True
                        ).values_list('department_id', flat=True)
                        if hod_dept_ids:
                            queryset = queryset.filter(user__staff_profile__department_id__in=hod_dept_ids)
                        else:
                            queryset = queryset.filter(user=user)
                    else:
                        queryset = queryset.filter(user=user)
                else:
                    queryset = queryset.filter(user=user)
            else:
                # Regular staff can only see their own records
                queryset = queryset.filter(user=user)
        
        # Order by date
        records = queryset.order_by('date', 'user__username').select_related('user', 'user__staff_profile__department')
        
        # Get COL template for checking approved forms
        from staff_requests.models import RequestTemplate, StaffRequest
        col_template = RequestTemplate.objects.filter(name__iexact='col').first()
        
        # Serialize the records
        data = []
        for record in records:
            # Check if there's an approved COL form for this date
            has_approved_col_form = False
            if col_template:
                has_approved_col_form = StaffRequest.objects.filter(
                    applicant=record.user,
                    template=col_template,
                    status='approved'
                ).filter(
                    Q(form_data__date=record.date.isoformat()) |
                    Q(form_data__from_date=record.date.isoformat())
                ).exists()
            
            data.append({
                'id': record.id,
                'user_id': record.user.id,
                'staff_id': getattr(getattr(record.user, 'staff_profile', None), 'staff_id', None),
                'username': record.user.username,
                'full_name': f"{record.user.first_name} {record.user.last_name}".strip() or record.user.username,
                'date': record.date,
                'status': record.status,
                'fn_status': record.fn_status,
                'an_status': record.an_status,
                'morning_in': record.morning_in.strftime('%H:%M') if record.morning_in else None,
                'evening_out': record.evening_out.strftime('%H:%M') if record.evening_out else None,
                'notes': record.notes,
                'has_approved_col_form': has_approved_col_form,
            })
        
        # Calculate summary stats
        total_records = len(data)
        present_count = len([r for r in data if r['status'] == 'present'])
        absent_count = len([r for r in data if r['status'] == 'absent'])
        partial_count = len([r for r in data if r['status'] in ['partial', 'half_day']])
        
        summary_info = {}
        if from_date_str and to_date_str:
            summary_info = {
                'from_date': from_date_str,
                'to_date': to_date_str,
            }
        else:
            summary_info = {
                'year': year,
                'month': month,
            }
        
        return Response({
            'records': data,
            'summary': {
                **summary_info,
                'total_records': total_records,
                'present_count': present_count,
                'absent_count': absent_count,
                'partial_count': partial_count,
            }
        })

    @action(detail=False, methods=['get'])
    def organization_analytics(self, request):
        """
        Get organization-wide staff attendance analytics with date range filter
        
        Query Parameters:
        - from_date: start date in YYYY-MM-DD format (required)
        - to_date: end date in YYYY-MM-DD format (required)
        - department_id: optional filter by department
        - format: 'json' (default) or 'csv' for download
        """
        user = request.user
        
        # Only HR, PS, IQAC, and ADMIN can access organization analytics
        is_hr = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='HR').exists()
        is_ps = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='PS').exists()
        is_iqac = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='IQAC').exists()
        is_admin = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='ADMIN').exists()
        
        if not (user.is_superuser or is_hr or is_ps or is_iqac or is_admin):
            return Response(
                {'error': 'Only HR, PS, IQAC, or ADMIN can access organization analytics'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get date range parameters / template type
        report_type = str(request.query_params.get('report_type') or '1').strip()
        month_str = str(request.query_params.get('month') or '').strip()
        from_date_str = request.query_params.get('from_date')
        to_date_str = request.query_params.get('to_date')
        department_id = request.query_params.get('department_id')
        export_format = request.query_params.get('format', 'json')

        if report_type in ['2', '3', '4', '5']:
            if not month_str:
                if from_date_str:
                    try:
                        parsed = datetime.strptime(from_date_str, '%Y-%m-%d').date()
                        month_str = f"{parsed.year}-{parsed.month:02d}"
                    except ValueError:
                        return Response(
                            {'error': 'month is required for report_type 2/3/4 (format: YYYY-MM)'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                else:
                    return Response(
                        {'error': 'month is required for report_type 2/3/4 (format: YYYY-MM)'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            try:
                year, month = [int(x) for x in month_str.split('-', 1)]
                last_day = calendar.monthrange(year, month)[1]
                month_start = date_type(year, month, 1)
                month_end = date_type(year, month, last_day)
            except Exception:
                return Response(
                    {'error': 'Invalid month format. Use YYYY-MM'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            payload = self._build_staff_monthly_matrix_report(
                month_start=month_start,
                month_end=month_end,
                department_id=department_id,
                report_type=report_type,
            )
            if export_format == 'csv':
                return self._export_staff_monthly_matrix_csv(payload)
            return Response(payload)

        # `from_date` is required; `to_date` is optional. If only `from_date` provided,
        # analytics will show data for that single date.
        if not from_date_str:
            return Response(
                {'error': 'from_date is required (format: YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # If to_date is missing, default it to from_date (single-day analytics)
        if not to_date_str:
            to_date_str = from_date_str

        try:
            from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
            to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Base queryset
        queryset = AttendanceRecord.objects.filter(
            date__gte=from_date,
            date__lte=to_date
        ).select_related('user', 'user__staff_profile', 'user__staff_profile__department')
        
        # Filter by department if specified
        if department_id:
            queryset = queryset.filter(user__staff_profile__department_id=department_id)
        
        # Get all unique staff in the range
        from accounts.models import User
        from academics.models import StaffProfile, Department
        
        staff_users = User.objects.filter(
            staff_profile__isnull=False
        ).select_related('staff_profile', 'staff_profile__department')
        
        if department_id:
            staff_users = staff_users.filter(staff_profile__department_id=department_id)
        
        # Build analytics data
        analytics_by_staff = {}
        for user_obj in staff_users:
            staff_profile = getattr(user_obj, 'staff_profile', None)
            staff_identifier = getattr(staff_profile, 'staff_id', None) or user_obj.id
            analytics_by_staff[user_obj.id] = {
                'staff_id': staff_identifier,
                'name': f"{user_obj.first_name} {user_obj.last_name}".strip() or user_obj.username,
                'email': user_obj.email,
                'department': getattr(user_obj.staff_profile, 'department', None).__str__() if getattr(user_obj.staff_profile, 'department', None) else 'N/A',
                'present': 0.0,
                'absent': 0.0,
                'no_record': 0,
                'cl_count': 0,
                'od_count': 0,
                'late_entry_count': 0,
                'col_count': 0,
                'others_count': 0,
            }
        
        # Count records by FN/AN status (0.5 per session)
        for record in queryset:
            if record.user.id in analytics_by_staff:
                # FN (Forenoon) session - 0.5 day
                if record.fn_status:
                    if record.fn_status == 'present':
                        analytics_by_staff[record.user.id]['present'] += 0.5
                    elif record.fn_status == 'absent':
                        analytics_by_staff[record.user.id]['absent'] += 0.5
                
                # AN (Afternoon) session - 0.5 day
                if record.an_status:
                    if record.an_status == 'present':
                        analytics_by_staff[record.user.id]['present'] += 0.5
                    elif record.an_status == 'absent':
                        analytics_by_staff[record.user.id]['absent'] += 0.5
        
        # Get staff request counts for each individual staff (combining normal and SPL forms)
        from staff_requests.models import StaffRequest
        
        # Query all approved requests in the date range
        all_requests = StaffRequest.objects.filter(
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
            status='approved'
        ).select_related('template', 'applicant')
        
        # Count forms per staff
        for request in all_requests:
            applicant_id = request.applicant_id
            if applicant_id in analytics_by_staff:
                template_name = request.template.name if request.template else ''
                
                # CL: "Casual Leave" or "Casual Leave - SPL"
                if template_name in ['Casual Leave', 'Casual Leave - SPL']:
                    analytics_by_staff[applicant_id]['cl_count'] += 1
                # OD: "ON duty" or "ON duty - SPL"
                elif template_name in ['ON duty', 'ON duty - SPL']:
                    analytics_by_staff[applicant_id]['od_count'] += 1
                # Late Entry: "Late Entry Permission" or "Late Entry Permission - SPL"
                elif template_name in ['Late Entry Permission', 'Late Entry Permission - SPL']:
                    analytics_by_staff[applicant_id]['late_entry_count'] += 1
                # COL: "Compensatory leave" or "Compensatory leave - SPL"
                elif template_name in ['Compensatory leave', 'Compensatory leave - SPL']:
                    analytics_by_staff[applicant_id]['col_count'] += 1
                # Others: "Others" or "Others - SPL"
                elif template_name in ['Others', 'Others - SPL']:
                    analytics_by_staff[applicant_id]['others_count'] += 1
        
        # Convert to list
        analytics_list = list(analytics_by_staff.values())
        
        # Calculate summary statistics
        total_staff = len(analytics_list)
        total_present = sum(item['present'] for item in analytics_list)
        total_absent = sum(item['absent'] for item in analytics_list)
        total_records = total_present + total_absent

        # Calculate working days excluding marked holidays and Sundays
        from staff_attendance.models import Holiday
        try:
            holidays_in_range = set(
                Holiday.objects.filter(date__gte=from_date, date__lte=to_date).values_list('date', flat=True)
            )
            working_days = 0
            current_date = from_date
            while current_date <= to_date:
                is_sunday = current_date.weekday() == 6
                is_holiday = current_date in holidays_in_range
                if not is_holiday and not is_sunday:
                    working_days += 1
                current_date += timedelta(days=1)
        except Exception:
            # Fallback to simple day count if holidays cannot be determined
            working_days = (to_date - from_date).days + 1
        
        # Calculate unique staff counts by status
        staff_present_count = len([item for item in analytics_list if item['present'] > 0])
        staff_absent_count = len([item for item in analytics_list if item['absent'] > 0])
        
        # Get staff request counts (combining normal and SPL forms)
        from staff_requests.models import StaffRequest
        
        # CL: "Casual Leave" or "Casual Leave - SPL"
        cl_requests = StaffRequest.objects.filter(
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
            template__name__in=['Casual Leave', 'Casual Leave - SPL'],
            status='approved'
        ).values_list('applicant_id', flat=True).distinct()
        staff_cl_count = len(set(cl_requests))
        
        # OD: "ON duty" or "ON duty - SPL"
        od_requests = StaffRequest.objects.filter(
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
            template__name__in=['ON duty', 'ON duty - SPL'],
            status='approved'
        ).values_list('applicant_id', flat=True).distinct()
        staff_od_count = len(set(od_requests))
        
        # Late Entry: "Late Entry Permission" or "Late Entry Permission - SPL"
        late_entry_requests = StaffRequest.objects.filter(
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
            template__name__in=['Late Entry Permission', 'Late Entry Permission - SPL'],
            status='approved'
        ).values_list('applicant_id', flat=True).distinct()
        staff_late_entry_count = len(set(late_entry_requests))
        
        # COL: "Compensatory leave" or "Compensatory leave - SPL"
        col_requests = StaffRequest.objects.filter(
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
            template__name__in=['Compensatory leave', 'Compensatory leave - SPL'],
            status='approved'
        ).values_list('applicant_id', flat=True).distinct()
        staff_col_count = len(set(col_requests))
        
        # Others: "Others" or "Others - SPL"
        others_requests = StaffRequest.objects.filter(
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
            template__name__in=['Others', 'Others - SPL'],
            status='approved'
        ).values_list('applicant_id', flat=True).distinct()
        staff_others_count = len(set(others_requests))
        
        if export_format == 'csv':
            # Generate CSV export
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write header
            writer.writerow([
                'Date Range', f'{from_date_str} to {to_date_str}',
                'Generated', datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            ])
            writer.writerow([])
            
            # Write summary
            writer.writerow(['ORGANIZATION ATTENDANCE SUMMARY'])
            writer.writerow(['Total Staff', total_staff])
            writer.writerow(['Total Records', total_records])
            writer.writerow(['No. of Staff with CL', staff_cl_count])
            writer.writerow(['No. of Staff with OD', staff_od_count])
            writer.writerow(['No. of Staff with Late Entry', staff_late_entry_count])
            writer.writerow(['No. of Staff with COL', staff_col_count])
            writer.writerow(['No. of Staff with Others', staff_others_count])
            writer.writerow(['Total Present Days', total_present])
            writer.writerow(['Total Absent Days', total_absent])
            writer.writerow(['Total Working Days (excluding holidays)', working_days])
            writer.writerow([])
            
            # Write staff-wise details
            writer.writerow(['STAFF-WISE ATTENDANCE'])
            writer.writerow(['Staff Name', 'Email', 'Department', 'Present', 'Absent', 'CL', 'OD', 'Late Entry', 'COL', 'Others', 'Attendance %'])
            
            for item in sorted(analytics_list, key=lambda x: x['name']):
                # Attendance percentage = present days / total working days (excluding holidays)
                attendance_pct = (item['present'] / working_days * 100) if working_days and working_days > 0 else 0
                writer.writerow([
                    item['name'],
                    item['email'],
                    item['department'],
                    f"{item['present']:.1f}",
                    f"{item['absent']:.1f}",
                    item['cl_count'],
                    item['od_count'],
                    item['late_entry_count'],
                    item['col_count'],
                    item['others_count'],
                    f"{attendance_pct:.2f}%"
                ])
            
            # Return CSV file
            response = Response(output.getvalue(), content_type='text/csv')
            filename = f"organization_attendance_{from_date_str}_to_{to_date_str}.csv"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        
        else:
            # Return JSON
            return Response({
                'date_range': {
                    'from_date': from_date_str,
                    'to_date': to_date_str,
                    'working_days': working_days,
                },
                'summary': {
                    'total_staff': total_staff,
                    'total_records': total_records,
                    'total_present': total_present,
                    'total_absent': total_absent,
                    # New staff counts
                    'staff_present_count': staff_present_count,
                    'staff_absent_count': staff_absent_count,
                    'staff_cl_count': staff_cl_count,
                    'staff_od_count': staff_od_count,
                    'staff_late_entry_count': staff_late_entry_count,
                    'staff_col_count': staff_col_count,
                    'staff_others_count': staff_others_count,
                },
                'staff_analytics': analytics_list,
            })

    def _build_staff_monthly_matrix_report(self, month_start, month_end, department_id=None, report_type='2'):
        from staff_requests.models import StaffLeaveBalance

        staff_users = User.objects.filter(
            staff_profile__isnull=False
        ).select_related('staff_profile', 'staff_profile__department')

        if department_id:
            staff_users = staff_users.filter(staff_profile__department_id=department_id)

        staff_users = list(staff_users.order_by('staff_profile__department__name', 'first_name', 'username'))
        staff_ids = [u.id for u in staff_users]

        lop_balance_map = {
            row['staff_id']: float(row['balance'] or 0.0)
            for row in StaffLeaveBalance.objects.filter(
                staff_id__in=staff_ids,
                leave_type__iexact='LOP'
            ).values('staff_id', 'balance')
        }

        records = AttendanceRecord.objects.filter(
            user_id__in=staff_ids,
            date__gte=month_start,
            date__lte=month_end,
        ).select_related('user', 'user__staff_profile', 'user__staff_profile__department')

        record_map = {(r.user_id, r.date): r for r in records}

        holidays = Holiday.objects.filter(date__gte=month_start, date__lte=month_end).prefetch_related('departments')
        global_holidays = set()
        dept_holidays = {}
        for h in holidays:
            dept_ids = list(h.departments.values_list('id', flat=True))
            if not dept_ids:
                global_holidays.add(h.date)
            else:
                for did in dept_ids:
                    dept_holidays.setdefault(did, set()).add(h.date)

        day_count = (month_end - month_start).days + 1
        day_dates = [month_start + timedelta(days=i) for i in range(day_count)]
        day_columns = [f"D{d.day}" for d in day_dates]

        def _to_code(status_value):
            s = str(status_value or '').strip()
            if not s:
                return ''
            low = s.lower()
            if low in ['present', 'p']:
                return 'P'
            if low in ['absent', 'a']:
                return 'A'
            return s.upper()

        def _is_biometric_code(code):
            return code in {'', 'P', 'A'}

        def _is_holiday_for_staff(the_date, dept_id):
            if the_date in global_holidays:
                return True
            if dept_id and the_date in dept_holidays.get(dept_id, set()):
                return True
            return False

        def _duration_hrs(record):
            if not record or not record.morning_in or not record.evening_out:
                return ''
            in_dt = datetime.combine(record.date, record.morning_in)
            out_dt = datetime.combine(record.date, record.evening_out)
            if out_dt < in_dt:
                return ''
            diff = out_dt - in_dt
            total_minutes = int(diff.total_seconds() // 60)
            return f"{total_minutes // 60}:{total_minutes % 60:02d}"

        def _in_out_text(record):
            if not record or not record.morning_in or not record.evening_out:
                return ''
            return f"{record.morning_in.strftime('%I:%M %p')} - {record.evening_out.strftime('%I:%M %p')}"

        def _form_code_display(fn_code, an_code, overall_code=''):
            fn_form = not _is_biometric_code(fn_code)
            an_form = not _is_biometric_code(an_code)
            if fn_form and an_form:
                if fn_code == an_code:
                    return fn_code
                return f"FN:{fn_code} AN:{an_code}"
            if fn_form:
                return f"FN:{fn_code}"
            if an_form:
                return f"AN:{an_code}"
            if overall_code and not _is_biometric_code(overall_code):
                return overall_code
            return ''

        def _session_status_text(fn_code, an_code, overall_code=''):
            """Always return explicit FN/AN status text when attendance status exists."""
            if fn_code or an_code:
                return f"FN:{fn_code or '-'} AN:{an_code or '-'}"
            if overall_code:
                return f"FN:{overall_code} AN:{overall_code}"
            return ''

        rows = []
        for user_obj in staff_users:
            profile = getattr(user_obj, 'staff_profile', None)
            dept = getattr(profile, 'department', None)
            dept_id = getattr(dept, 'id', None)
            staff_code = getattr(profile, 'staff_id', None) or str(user_obj.id)
            staff_name = f"{user_obj.first_name} {user_obj.last_name}".strip() or user_obj.username

            row = {
                'staff_user_id': user_obj.id,
                'staff_id': staff_code,
                'staff_name': staff_name,
                'department': getattr(dept, 'name', 'N/A') if dept else 'N/A',
                'days': max(0.0, float(day_count) - float(lop_balance_map.get(user_obj.id, 0.0))),
                'values': {}
            }

            for day_dt in day_dates:
                key = f"D{day_dt.day}"
                is_holiday = _is_holiday_for_staff(day_dt, dept_id)
                is_sunday = day_dt.weekday() == 6

                rec = record_map.get((user_obj.id, day_dt))
                if not rec:
                    row['values'][key] = {'value': 'H' if is_holiday else '-', 'is_holiday': is_holiday}
                    continue

                fn_code = _to_code(rec.fn_status)
                an_code = _to_code(rec.an_status)
                overall_code = _to_code(rec.status)
                form_display = _form_code_display(fn_code, an_code, overall_code)
                if form_display and report_type not in ['2', '3', '4', '5']:
                    row['values'][key] = {'value': form_display, 'is_holiday': is_holiday}
                    continue

                if report_type == '3':
                    in_out = _in_out_text(rec)
                    status_text = _session_status_text(fn_code, an_code, overall_code)
                    if in_out and status_text:
                        value = f"{status_text}\n({in_out})"
                    elif status_text:
                        value = status_text
                    else:
                        value = f"({in_out})" if in_out else ('H' if is_holiday else '-')
                    row['values'][key] = {'value': value, 'is_holiday': is_holiday}
                    continue

                if report_type == '4':
                    dur = _duration_hrs(rec)
                    in_out = _in_out_text(rec)
                    status_text = _session_status_text(fn_code, an_code, overall_code)
                    if dur and in_out and status_text:
                        value = f"{status_text}\n{dur}\n({in_out})"
                    elif dur and status_text:
                        value = f"{status_text}\n{dur}"
                    elif in_out and status_text:
                        value = f"{status_text}\n({in_out})"
                    elif status_text:
                        value = status_text
                    elif dur and in_out:
                        value = f"{dur}\n({in_out})"
                    elif dur:
                        value = dur
                    elif in_out:
                        value = f"({in_out})"
                    else:
                        value = 'H' if is_holiday else '-'
                    row['values'][key] = {'value': value, 'is_holiday': is_holiday}
                    continue

                if report_type == '5':
                    # Weighted attendance: 0=present, 0.5=half-day, 1=absent
                    is_fn_absence = fn_code and fn_code.upper() in ['A', 'OD', 'CL', 'COL', 'LATE', 'OTHERS', 'LE']
                    is_an_absence = an_code and an_code.upper() in ['A', 'OD', 'CL', 'COL', 'LATE', 'OTHERS', 'LE']
                    
                    if is_fn_absence and is_an_absence:
                        value = '1'  # Full day absent
                    elif is_fn_absence or is_an_absence:
                        value = '0.5'  # Half day absent
                    else:
                        value = '0'  # Present
                    row['values'][key] = {'value': value, 'is_holiday': is_holiday}
                    continue

                dur = _duration_hrs(rec)
                status_text = _session_status_text(fn_code, an_code, overall_code)
                if dur and status_text:
                    value = f"{status_text}\n{dur}"
                elif status_text:
                    value = status_text
                elif dur:
                    value = dur
                else:
                    value = 'H' if is_holiday else '-'
                row['values'][key] = {'value': value, 'is_holiday': is_holiday}

            rows.append(row)

        columns = ['staff_id', 'staff_name']
        if report_type in ['2', '4', '5']:
            columns.append('days')
        columns.extend(day_columns)

        return {
            'report_type': report_type,
            'month': month_start.strftime('%Y-%m'),
            'date_range': {
                'from_date': month_start.isoformat(),
                'to_date': month_end.isoformat(),
                'working_days': day_count,
            },
            'columns': columns,
            'day_columns': day_columns,
            'staff_rows': rows,
            'total_staff': len(rows),
        }

    def _export_staff_monthly_matrix_csv(self, payload):
        output = io.StringIO()
        writer = csv.writer(output)

        month = payload.get('month')
        report_type = payload.get('report_type')
        writer.writerow(['Organization Staff Attendance Analytics'])
        writer.writerow(['Report Type', f"Type {report_type}"])
        writer.writerow(['Month', month])
        writer.writerow([])

        header = ['Staff ID', 'Staff Name']
        if report_type in ['2', '4', '5']:
            header.append('Days')
        header.extend(payload.get('day_columns') or [])
        writer.writerow(header)

        for row in payload.get('staff_rows') or []:
            csv_row = [row.get('staff_id', ''), row.get('staff_name', '')]
            if report_type in ['2', '4', '5']:
                csv_row.append(row.get('days', 0))
            values = row.get('values') or {}
            for dcol in payload.get('day_columns') or []:
                cell = values.get(dcol) or {}
                csv_row.append(cell.get('value', '-'))
            writer.writerow(csv_row)

        response = Response(output.getvalue(), content_type='text/csv')
        filename = f"organization_staff_attendance_type_{report_type}_{month}.csv"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['get'])
    def available_departments(self, request):
        """Get list of departments the user can view attendance for"""
        user = request.user
        
        # Check user permissions
        is_superuser = user.is_superuser
        is_ps = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='PS').exists()
        is_hod = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='HOD').exists()
        is_iqac = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='IQAC').exists()
        is_admin = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='ADMIN').exists()
        is_hr = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='HR').exists()
        
        from academics.models import Department
        
        departments = []
        
        if is_superuser or is_ps or is_iqac or is_admin or is_hr:
            # These roles can see all departments
            dept_queryset = Department.objects.all()
        elif is_hod:
            # HOD can see all departments where they are HOD or AHOD
            from academics.models import DepartmentRole, AcademicYear
            user_staff_profile = getattr(user, 'staff_profile', None)
            if user_staff_profile:
                current_year = AcademicYear.objects.filter(is_active=True).first()
                if current_year:
                    roles = DepartmentRole.objects.filter(
                        staff=user_staff_profile,
                        role__in=['HOD', 'AHOD'],
                        academic_year=current_year,
                        is_active=True
                    ).select_related('department')
                    dept_ids = [role.department.id for role in roles]
                    dept_queryset = Department.objects.filter(id__in=dept_ids)
                else:
                    dept_queryset = Department.objects.none()
            else:
                dept_queryset = Department.objects.none()
        else:
            # Regular users don't get department list
            dept_queryset = Department.objects.none()
        
        for dept in dept_queryset.order_by('name'):
            departments.append({
                'id': dept.id,
                'name': dept.name,
                'code': getattr(dept, 'code', '') or '',
                'short_name': getattr(dept, 'short_name', '') or dept.name,
            })
        
        return Response({'departments': departments})


class UploadLogViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing upload logs"""
    queryset = UploadLog.objects.all()
    serializer_class = UploadLogSerializer
    permission_classes = [StaffAttendanceViewPermission]
    ordering = ['-uploaded_at']


class CSVUploadViewSet(viewsets.ViewSet):
    """ViewSet for CSV upload by PS role."""

    permission_classes = [StaffAttendanceUploadPermission]

    # ------------------------------------------------------------------ helpers

    def _parse_time_range(self, raw):
        """
        Parse a biometric cell value into (morning_in, evening_out).

        Rules:
          '-' or empty            → (None, None)
          Single time             → (time, None)
          Two identical times     → (time, None)   ← biometric anomaly: only 1 swipe
          Two distinct times      → (first, second)
        """
        if not raw or raw.strip() in ('-', ''):
            return None, None

        raw = raw.strip()
        matches = re.findall(r'(\d{1,2}:\d{2}(?::\d{2})?)', raw)
        if not matches:
            return None, None

        def _t(s):
            fmt = '%H:%M:%S' if s.count(':') == 2 else '%H:%M'
            try:
                return datetime.strptime(s, fmt).time()
            except ValueError:
                return None

        morning_in = _t(matches[0])
        evening_out = _t(matches[1]) if len(matches) >= 2 and matches[1] != matches[0] else None
        return morning_in, evening_out

    def _col(self, day):
        return f'D{day}'

    def _is_holiday(self, target_date, user=None):
        """
        Check if a specific date is a holiday.
        If `user` is provided, respects department-scoped holidays:
          - College-wide holidays (no departments attached) always return True.
          - Dept-scoped holidays only return True when the user's current
            department is in the holiday's departments list.
        Without a user, any holiday on the date returns True (backward-compat).
        """
        holidays = Holiday.objects.filter(date=target_date)
        if not holidays.exists():
            return False
        if user is None:
            return True  # backward-compatible: any holiday counts
        # Resolve user's current department once
        user_dept_id = None
        try:
            if hasattr(user, 'staff_profile'):
                dept = user.staff_profile.get_current_department()
                if dept:
                    user_dept_id = dept.id
        except Exception:
            pass
        for holiday in holidays:
            dept_ids = list(holiday.departments.values_list('id', flat=True))
            if not dept_ids:
                return True  # college-wide
            if user_dept_id is not None and user_dept_id in dept_ids:
                return True
        return False  # no matching holiday for this user's dept

    def _check_time_based_absence(self, morning_in, evening_out):
        """Check if attendance should be marked absent based on time limits"""
        try:
            settings = AttendanceSettings.objects.first()
            if not settings or not settings.apply_time_based_absence:
                return False  # Don't apply time-based absence
            
            # Late arrival = absent
            if morning_in and morning_in > settings.attendance_in_time_limit:
                return True
            
            # Early departure = absent
            if evening_out and evening_out < settings.attendance_out_time_limit:
                return True
            
            return False
        except Exception:
            return False

    def _parse_form_date(self, value):
        """Parse request form date values into date objects."""
        if not value:
            return None
        if isinstance(value, date_type):
            return value
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None
            try:
                return datetime.strptime(raw[:10], '%Y-%m-%d').date()
            except ValueError:
                return None
        return None

    def _request_dates_for_month(self, form_data, month_start, month_end):
        """Return the dates covered by request form data within a target month."""
        if not isinstance(form_data, dict):
            return set()

        from_date = self._parse_form_date(form_data.get('from_date') or form_data.get('start_date'))
        to_date = self._parse_form_date(form_data.get('to_date') or form_data.get('end_date'))

        if not from_date:
            single_date = self._parse_form_date(form_data.get('date'))
            from_date = single_date
            to_date = single_date
        elif not to_date:
            to_date = from_date

        if not from_date or not to_date:
            return set()

        if to_date < from_date:
            from_date, to_date = to_date, from_date

        start = max(from_date, month_start)
        end = min(to_date, month_end)
        if end < start:
            return set()

        covered = set()
        current = start
        while current <= end:
            covered.add(current)
            current += timedelta(days=1)

        return covered

    def _get_approved_col_request_for_date(self, user, target_date):
        """Return approved COL earn request covering target_date for this user."""
        from staff_requests.models import StaffRequest

        approved_col_requests = StaffRequest.objects.filter(
            applicant=user,
            status='approved',
            template__is_active=True
        ).filter(
            Q(template__name__icontains='Compensatory') | Q(template__name__icontains='COL')
        ).select_related('template').order_by('-id')

        for req in approved_col_requests:
            covered_dates = self._request_dates_for_month(req.form_data, target_date, target_date)
            if target_date in covered_dates:
                return req

        return None

    def _auto_create_col_for_holiday(self, user, holiday_date, morning_in=None, evening_out=None):
        """
        Auto-create COL (Compensatory Leave) for staff who worked on holiday.
        Now validates hours worked:
        - Full day: >= 8 hours → 1.0 COL
        - Half day: >= 4 hours → 0.5 COL
        - Less than 4 hours → No COL
        
        Args:
            user: User object
            holiday_date: Date object
            morning_in: Time object (IN time)
            evening_out: Time object (OUT time)
        """
        from staff_requests.models import StaffLeaveBalance
        from datetime import datetime, time
        import logging
        
        logger = logging.getLogger(__name__)
        
        try:
            approved_col_request = self._get_approved_col_request_for_date(user, holiday_date)
            if not approved_col_request:
                logger.info(f"[COL_SKIP] No approved COL request for {user.username} on {holiday_date}; skipping COL increment")
                return False

            col_template = approved_col_request.template
            if not col_template:
                logger.warning("[COL_SKIP] Approved COL request has no template attached")
                return False

            award_marker = f"COL_AWARDED:{approved_col_request.id}:{holiday_date.isoformat()}"
            
            # Calculate hours worked if both IN and OUT times provided
            hours_worked = 0
            if morning_in and evening_out:
                # Convert to datetime for calculation
                in_dt = datetime.combine(holiday_date, morning_in)
                out_dt = datetime.combine(holiday_date, evening_out)
                
                # Calculate hours
                diff = out_dt - in_dt
                hours_worked = diff.total_seconds() / 3600
                
                logger.info(f"[COL_HOURS] {user.username} on {holiday_date}: IN={morning_in}, OUT={evening_out}, Hours={hours_worked:.2f}")
            else:
                logger.warning(f"[COL_HOURS] Cannot calculate hours for {user.username} on {holiday_date}: IN={morning_in}, OUT={evening_out}")
                # Don't award COL without proper time data
                return False
            
            # Determine if it's a half-day claim (FN or AN)
            is_half_day_claim = False
            shift_claimed = None
            if approved_col_request and approved_col_request.form_data:
                from_noon = approved_col_request.form_data.get('from_noon') or approved_col_request.form_data.get('from_shift')
                to_noon = approved_col_request.form_data.get('to_noon') or approved_col_request.form_data.get('to_shift')
                
                # Check if it's a half-day claim (FN or AN, not FULL)
                if from_noon and str(from_noon).upper() in ['FN', 'AN']:
                    is_half_day_claim = True
                    shift_claimed = str(from_noon).upper()
                elif to_noon and str(to_noon).upper() in ['FN', 'AN']:
                    is_half_day_claim = True
                    shift_claimed = str(to_noon).upper()
                
                logger.info(f"[COL_CLAIM] Found approved COL request: Half day={is_half_day_claim}, Shift={shift_claimed}")
            
            # Determine COL amount based on hours worked
            col_amount = 0
            if is_half_day_claim:
                # Half day claim: need 4+ hours
                if hours_worked >= 4:
                    col_amount = 0.5
                    logger.info(f"[COL_AWARD] Half day ({shift_claimed}): {hours_worked:.2f} hrs >= 4 hrs → 0.5 COL")
                else:
                    logger.warning(f"[COL_REJECT] Half day ({shift_claimed}): {hours_worked:.2f} hrs < 4 hrs → No COL")
                    return False
            else:
                # Full day claim: need 8+ hours
                if hours_worked >= 8:
                    col_amount = 1.0
                    logger.info(f"[COL_AWARD] Full day: {hours_worked:.2f} hrs >= 8 hrs → 1.0 COL")
                else:
                    logger.warning(f"[COL_REJECT] Full day: {hours_worked:.2f} hrs < 8 hrs → No COL")
                    return False

            # Ensure worked holiday attendance is not left as absent after CSV processing.
            record = AttendanceRecord.objects.filter(user=user, date=holiday_date).first()
            if record:
                # Prevent duplicate COL credits for repeated uploads/reprocessing.
                if record.notes and award_marker in record.notes:
                    logger.info(f"[COL_SKIP] COL already awarded for request {approved_col_request.id} on {holiday_date}")
                    return True

                if is_half_day_claim and shift_claimed in ['FN', 'AN']:
                    if shift_claimed == 'FN':
                        record.fn_status = 'present'
                        # For half-day COL claims, keep the non-claimed session as no-record
                        # when there is no real attendance evidence for that session.
                        if record.an_status in [None, 'absent']:
                            record.an_status = None
                    else:
                        record.an_status = 'present'
                        if record.fn_status in [None, 'absent']:
                            record.fn_status = None
                else:
                    record.fn_status = 'present'
                    record.an_status = 'present'

                if record.fn_status is None and record.an_status is None:
                    record.status = 'absent'
                elif record.fn_status is None:
                    record.status = record.an_status
                elif record.an_status is None:
                    record.status = record.fn_status
                elif record.fn_status == record.an_status:
                    record.status = record.fn_status
                elif record.fn_status != 'absent' or record.an_status != 'absent':
                    record.status = 'half_day'
                else:
                    record.status = 'absent'

                if record.notes:
                    record.notes = f"{record.notes}; {award_marker}"
                else:
                    record.notes = award_marker

                record.save(update_fields=['fn_status', 'an_status', 'status', 'notes'])
            
            # Update COL balance
            balance, created = StaffLeaveBalance.objects.get_or_create(
                staff=user,
                leave_type=col_template.name,
                defaults={'balance': 0}
            )
            balance.balance += col_amount
            balance.save()
            
            logger.info(f"[COL_SUCCESS] Awarded {col_amount} COL to {user.username} for {holiday_date}. New balance: {balance.balance}")
            return True
            
        except Exception as e:
            # Log error but don't fail the upload
            logger.error(f"Failed to create COL for {user.username} on {holiday_date}: {e}")
            return False

    def _check_and_revoke_col_for_absence(self, user, holiday_date):
        """
        Check if staff has approved COL earn form for this holiday but is actually absent.
        If so, revoke the COL that was awarded when form was approved.
        """
        import logging
        from staff_requests.models import StaffRequest, StaffLeaveBalance
        
        logger = logging.getLogger(__name__)
        
        try:
            # Check approved COL earn requests for this date across all COL templates
            approved_col_requests = StaffRequest.objects.filter(
                applicant=user,
                status='approved',
                template__is_active=True
            ).filter(
                Q(template__name__icontains='Compensatory') | Q(template__name__icontains='COL')
            ).select_related('template')
            
            for request in approved_col_requests:
                form_data = request.form_data
                # Check if this request covers the holiday_date
                covers_date = False
                
                # Check single date field
                if 'date' in form_data:
                    from datetime import datetime
                    try:
                        date_val = form_data['date']
                        if isinstance(date_val, str):
                            request_date = datetime.strptime(date_val, '%Y-%m-%d').date()
                        else:
                            request_date = date_val
                        if request_date == holiday_date:
                            covers_date = True
                    except (ValueError, AttributeError):
                        pass
                
                # Check date range
                if not covers_date and 'from_date' in form_data:
                    from datetime import datetime, timedelta
                    try:
                        from_date_val = form_data['from_date']
                        to_date_val = form_data.get('to_date', from_date_val)
                        
                        if isinstance(from_date_val, str):
                            from_date = datetime.strptime(from_date_val, '%Y-%m-%d').date()
                        else:
                            from_date = from_date_val
                        
                        if isinstance(to_date_val, str):
                            to_date = datetime.strptime(to_date_val, '%Y-%m-%d').date()
                        else:
                            to_date = to_date_val
                        
                        # Check if holiday_date is in range
                        current = from_date
                        while current <= to_date:
                            if current == holiday_date:
                                covers_date = True
                                break
                            current += timedelta(days=1)
                    except (ValueError, AttributeError):
                        pass
                
                if covers_date:
                    # This COL request covers the holiday date but staff was absent
                    # Revoke the COL (decrement balance by 1)
                    template_name = request.template.name if request.template else None
                    if not template_name:
                        continue

                    balance = StaffLeaveBalance.objects.filter(
                        staff=user,
                        leave_type=template_name
                    ).first()
                    
                    if balance and balance.balance > 0:
                        old_balance = balance.balance
                        balance.balance -= 1
                        balance.save()
                        logger.warning(
                            f"[COL_REVOKE] Staff {user.username} was absent on {holiday_date} "
                            f"despite approved COL form. Revoked COL: {old_balance} -> {balance.balance}"
                        )
                        return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to check/revoke COL for {user.username} on {holiday_date}: {e}")
            return False

    def _resolve_user(self, user_id, errors):
        """Look up User by StaffProfile.staff_id then by username."""
        try:
            from academics.models import StaffProfile
            return StaffProfile.objects.select_related('user').get(staff_id=user_id).user
        except Exception:
            pass
        try:
            return User.objects.get(username=user_id)
        except User.DoesNotExist:
            errors.append({'user_id': user_id, 'error': f'User not found: {user_id}'})
            return None

    def _upsert_record(self, user, target_date, morning_in, evening_out,
                       mode, overwrite, source_file, holiday_mode=False):
        """
        Create or update an AttendanceRecord.

        mode='today'     → set morning_in (+ evening_out if present); absent if no scan
        mode='yesterday' → fill deferred evening_out; backfill morning_in if missing
        mode='backfill'  → only create if no record exists yet (or overwrite=True);
                           caller must guard with `if p_in or p_out` so that days with
                           no biometric data are NOT written as absent.
        """
        record = AttendanceRecord.objects.filter(user=user, date=target_date).first()

        # backfill: skip if record already exists and no overwrite.
        # Exception: holiday_mode must still process existing records so COL logic can run.
        if mode == 'backfill' and record is not None and not overwrite and not holiday_mode:
            return None

        if record is None:
            # Seed fn_status and an_status as 'absent' so that update_status()
            # below can evaluate them against the Attendance Time Limits and set
            # the correct biometric values (present / absent).
            # If we leave them as None, update_status() skips the time-limit logic
            # entirely and short-circuits to status='absent' unconditionally.
            record = AttendanceRecord(
                user=user, date=target_date,
                morning_in=morning_in, evening_out=evening_out,
                fn_status='absent',  # will be recalculated by update_status()
                an_status='absent',  # will be recalculated by update_status()
                status='absent',     # will be recalculated by update_status()
                source_file=source_file,
            )
        else:
            # Update existing record
            if mode in ('today', 'yesterday', 'backfill'):
                # For 'today' mode, always allow updates to ensure re-uploads work
                allow_update = overwrite or (mode == 'today')
                
                if morning_in is not None and (allow_update or not record.morning_in):
                    record.morning_in = morning_in
                if evening_out is not None and (allow_update or not record.evening_out):
                    record.evening_out = evening_out

                # If fn/an are None on an existing record but we now have biometric data,
                # seed them as 'absent' so update_status() will recalculate them from
                # the time limits instead of short-circuiting to overall absent.
                if record.fn_status is None and (record.morning_in or record.evening_out):
                    record.fn_status = 'absent'
                if record.an_status is None and (record.morning_in or record.evening_out):
                    record.an_status = 'absent'

        # Always recompute status for both NEW and UPDATED records
        # The update_status() method intelligently preserves leave statuses (CL, OD, ML, COL, etc.)
        # for individual FN/AN sessions while recalculating biometric statuses (present, absent, etc.)
        # This ensures:
        # 1. Default 'absent' statuses CAN be overridden by CSV uploads (e.g., tomorrow's upload adds evening_out)
        # 2. Leave form statuses (CL, OD, etc.) CANNOT be overridden by CSV uploads (preserved by update_status)
        record.update_status()

        # Holidays should not use normal in/out cutoffs for marking absent.
        # If there is biometric data on a holiday, default to present.
        if holiday_mode and (record.morning_in or record.evening_out):
            record.fn_status = 'present'
            record.an_status = 'present'
            record.status = 'present'

        # Upload-day behavior: when PS uploads in the morning, today's evening_out
        # is not available yet. Keep AN pending (None) instead of defaulting absent.
        # This applies only to biometric statuses and does not touch leave statuses.
        if mode == 'today' and record.evening_out is None and not holiday_mode:
            biometric_statuses = {'present', 'absent', 'partial', 'half_day'}
            if record.an_status in biometric_statuses:
                record.an_status = None

                if record.fn_status is None and record.an_status is None:
                    record.status = 'absent'
                elif record.fn_status is None:
                    record.status = record.an_status
                elif record.an_status is None:
                    record.status = record.fn_status
                elif record.fn_status == record.an_status:
                    record.status = record.fn_status
                elif record.fn_status != 'absent' or record.an_status != 'absent':
                    record.status = 'half_day'
                else:
                    record.status = 'absent'

        record.source_file = source_file
        record.save()
        return record

    # ------------------------------------------------------------------ action

    @action(detail=False, methods=['post'])
    def upload(self, request):
        """
        Process a monthly biometric CSV.

        On upload date D (e.g. March 5):
          • D5 column  → today's morning_in (+ evening_out if two distinct times)
          • D4 column  → yesterday's deferred evening_out (half-day / late exit)
          • D1..D3     → backfill any day not yet saved in the DB
        """
        serializer = CSVUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        csv_file = serializer.validated_data['file']
        dry_run = serializer.validated_data.get('dry_run', False)
        overwrite_existing = serializer.validated_data.get('overwrite_existing', False)

        # Get upload date from request or use server date
        # PRIORITY: upload_date (specific day) > month+year only > server date
        upload_date = serializer.validated_data.get('upload_date')
        month = serializer.validated_data.get('month')
        year = serializer.validated_data.get('year')

        if upload_date:
            # Specific date provided — always use it exactly (e.g. March 9 → process D1..D9 only)
            today = upload_date
        elif month and year:
            # Only month+year provided (no specific day) → full-month upload: use last day of month
            from calendar import monthrange
            max_day = monthrange(year, month)[1]
            today = date_type(year, month, max_day)
        else:
            # Use server timestamp as the authoritative "today"
            today = timezone.now().date()
        today_day = today.day          # integer, e.g. 5
        yest_day = today_day - 1       # 4  (0 means no yesterday in this month)
        backfill_days = list(range(1, max(1, yest_day)))  # [1, 2, 3] for day 5

        errors = []
        success_count = 0
        processed_rows = 0

        try:
            decoded = csv_file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))

            if not reader.fieldnames or 'USER_ID' not in reader.fieldnames:
                return Response({'error': 'CSV must contain USER_ID column'},
                                status=status.HTTP_400_BAD_REQUEST)

            rows = list(reader)

            # ---- DRY RUN ------------------------------------------------
            if dry_run:
                preview = []
                for row in rows:
                    user_id = row.get('USER_ID', '').strip()
                    if not user_id:
                        continue

                    today_val = row.get(self._col(today_day), '')
                    t_in, t_out = self._parse_time_range(today_val)

                    yest_val = row.get(self._col(yest_day), '') if yest_day >= 1 else ''
                    # For yesterday: parse BOTH morning_in and evening_out
                    # morning_in: for staff who came after 9 AM (after upload time)
                    # evening_out: deferred exit time
                    y_in, y_out = self._parse_time_range(yest_val)

                    backfill_count = 0
                    for d in backfill_days:
                        bi, bo = self._parse_time_range(row.get(self._col(d), ''))
                        if bi or bo:
                            backfill_count += 1

                    preview.append({
                        'user_id': user_id,
                        'full_name': row.get('FULL_NAME', ''),
                        # Today
                        'today_date': today.isoformat(),
                        'today_morning_in': t_in.isoformat() if t_in else None,
                        'today_evening_out': t_out.isoformat() if t_out else None,
                        'today_raw': today_val,
                        # Yesterday deferred (both IN for late arrivals and OUT for deferred exit)
                        'yesterday_date': (today - timedelta(days=1)).isoformat() if yest_day >= 1 else None,
                        'yesterday_morning_in': y_in.isoformat() if y_in else None,
                        'yesterday_evening_out': y_out.isoformat() if y_out else None,
                        'yesterday_raw': yest_val,
                        # Historical
                        'backfill_days_with_data': backfill_count,
                    })

                return Response({
                    'dry_run': True,
                    'upload_date': today.isoformat(),
                    'today_column': self._col(today_day),
                    'yesterday_column': self._col(yest_day) if yest_day >= 1 else None,
                    'backfill_columns': [self._col(d) for d in backfill_days],
                    'preview': preview[:20],
                    'total_rows': len(preview),
                })

            # ---- ACTUAL SAVE --------------------------------------------
            source_file = csv_file.name
            users_to_sync_lop = set()

            with transaction.atomic():
                try:
                    csv_file.seek(0)
                except Exception:
                    pass

                upload_log = UploadLog.objects.create(
                    uploader=request.user,
                    filename=source_file,
                    target_date=today,
                    file=csv_file,
                )

                # SPECIAL HANDLING: When uploading on a holiday, mark absent for previous working day
                # if staff have no attendance record for that day.
                # Uses dept-aware holiday check so only staff whose dept has the holiday
                # are skipped; staff in non-holiday depts are processed as working day.
                if self._is_holiday(today) and yest_day >= 1:
                    import logging
                    logger = logging.getLogger(__name__)
                    yest_date = today - timedelta(days=1)

                    # Collect all user IDs from the CSV
                    csv_user_ids = set()
                    for row in rows:
                        uid = row.get('USER_ID', '').strip()
                        if uid:
                            csv_user_ids.add(uid)

                    for user_id in csv_user_ids:
                        user = self._resolve_user(user_id, errors)
                        if user is None:
                            continue

                        # Skip if today is NOT a holiday for this user's dept
                        if not self._is_holiday(today, user):
                            continue

                        # Check if yesterday was a working day for this user
                        is_yest_working_day = (
                            not self._is_holiday(yest_date, user)
                            and yest_date.weekday() != 6
                        )
                        if not is_yest_working_day:
                            continue

                        logger.info(f"[HOLIDAY_UPLOAD] Uploading on holiday {today}, checking absence for {user.username} on {yest_date}")

                        existing_record = AttendanceRecord.objects.filter(
                            user=user, date=yest_date
                        ).first()

                        if not existing_record:
                            AttendanceRecord.objects.create(
                                user=user,
                                date=yest_date,
                                morning_in=None,
                                evening_out=None,
                                fn_status='absent',
                                an_status='absent',
                                status='absent',
                                notes=f'Marked absent (no record found when uploading on holiday {today})'
                            )
                            logger.info(f"[HOLIDAY_ABSENCE] Marked {user.username} absent for {yest_date}")

                for row in rows:
                    user_id = row.get('USER_ID', '').strip()
                    if not user_id:
                        continue

                    processed_rows += 1
                    user = self._resolve_user(user_id, errors)
                    if user is None:
                        continue

                    users_to_sync_lop.add(user.username)

                    row_saved = False

                    # 1. TODAY: morning entry (+ evening if two distinct times)
                    # Special handling for holidays: if staff came to college, award COL
                    if self._is_holiday(today, user):
                        t_in, t_out = self._parse_time_range(row.get(self._col(today_day), ''))
                        # If there's attendance data on a holiday, it's COL
                        if t_in or t_out:
                            # Save attendance record for holiday work (respects overwrite_existing)
                            saved_record = self._upsert_record(user, today, t_in, t_out,
                                                               'today', overwrite_existing, source_file,
                                                               holiday_mode=True)
                            if saved_record:
                                row_saved = True
                            # Award COL for working on holiday (with hour validation)
                            self._auto_create_col_for_holiday(user, today, t_in, t_out)
                        else:
                            # No biometric data on holiday
                            # Check if there's an existing attendance record (from COL form approval)
                            existing_record = AttendanceRecord.objects.filter(user=user, date=today).first()
                            if existing_record:
                                # COL form was approved but staff didn't actually come - mark absent and revoke COL
                                existing_record.morning_in = None
                                existing_record.evening_out = None
                                existing_record.fn_status = 'absent'
                                existing_record.an_status = 'absent'
                                existing_record.status = 'absent'
                                existing_record.save()
                                self._check_and_revoke_col_for_absence(user, today)
                                row_saved = True
                            elif overwrite_existing:
                                # If overwrite_existing and no data, delete any existing record for this holiday
                                AttendanceRecord.objects.filter(user=user, date=today).delete()
                            # else: no attendance on holiday = skip (don't save absent record)
                    else:
                        # Normal working day processing
                        t_in, t_out = self._parse_time_range(row.get(self._col(today_day), ''))
                        if self._upsert_record(user, today, t_in, t_out,
                                               'today', overwrite_existing, source_file):
                            row_saved = True

                    # 2. YESTERDAY: both morning_in (late arrivals) and evening_out (deferred exit)
                    # PS uploads at 9 AM, so staff arriving after 9 AM won't have morning_in yet
                    # Also capture evening_out (deferred exit) for those who exited late
                    if yest_day >= 1:
                        yest_date = today - timedelta(days=1)
                        # Check if yesterday was a holiday (dept-aware)
                        if self._is_holiday(yest_date, user):
                            y_in, y_out = self._parse_time_range(row.get(self._col(yest_day), ''))
                            if y_in or y_out:
                                # Save attendance for holiday work (use 'yesterday' mode to allow updates)
                                saved_record = self._upsert_record(user, yest_date, y_in, y_out,
                                                                   'yesterday', overwrite_existing, source_file,
                                                                   holiday_mode=True)
                                if saved_record:
                                    row_saved = True
                                # Award COL for working on holiday (with hour validation)
                                self._auto_create_col_for_holiday(user, yest_date, y_in, y_out)
                            else:
                                # No biometric data on holiday
                                # Check if there's an existing attendance record (from COL form approval)
                                existing_record = AttendanceRecord.objects.filter(user=user, date=yest_date).first()
                                if existing_record:
                                    # COL form was approved but staff didn't actually come - mark absent and revoke COL
                                    existing_record.morning_in = None
                                    existing_record.evening_out = None
                                    existing_record.fn_status = 'absent'
                                    existing_record.an_status = 'absent'
                                    existing_record.status = 'absent'
                                    existing_record.save()
                                    self._check_and_revoke_col_for_absence(user, yest_date)
                                    row_saved = True
                                elif overwrite_existing:
                                    # If overwrite_existing and no data, delete any existing record for this holiday
                                    AttendanceRecord.objects.filter(user=user, date=yest_date).delete()
                        else:
                            # Normal yesterday processing: use BOTH morning_in and evening_out
                            # morning_in: for late arrivals (after 9 AM upload time)
                            # evening_out: deferred exit time
                            y_in, y_out = self._parse_time_range(row.get(self._col(yest_day), ''))
                            if y_in or y_out:  # Process if there's any time data
                                if self._upsert_record(user, yest_date, y_in, y_out,
                                                       'yesterday', overwrite_existing, source_file):
                                    row_saved = True
                            elif yest_date.weekday() != 6:  # Not a Sunday
                                # No yesterday scan on a working day -> mark absent if no record exists.
                                # This fixes cases where D(yesterday) is blank and the date is skipped entirely.
                                existing = AttendanceRecord.objects.filter(user=user, date=yest_date).first()
                                if not existing:
                                    AttendanceRecord.objects.create(
                                        user=user,
                                        date=yest_date,
                                        morning_in=None,
                                        evening_out=None,
                                        fn_status='absent',
                                        an_status='absent',
                                        status='absent',
                                        notes='Marked absent - no scan record found (yesterday column)'
                                    )
                                    row_saved = True

                    # 3. BACKFILL: D1 … D(today-2)  — only save if not yet in DB
                    for d in backfill_days:
                        past_date = date_type(today.year, today.month, d)
                        # Check if past date was a holiday (dept-aware)
                        if self._is_holiday(past_date, user):
                            p_in, p_out = self._parse_time_range(row.get(self._col(d), ''))
                            if p_in or p_out:
                                # Save attendance for holiday work (respects overwrite_existing)
                                saved_record = self._upsert_record(user, past_date, p_in, p_out,
                                                                   'backfill', overwrite_existing, source_file,
                                                                   holiday_mode=True)
                                if saved_record:
                                    row_saved = True
                                # Award COL for working on holiday (with hour validation)
                                self._auto_create_col_for_holiday(user, past_date, p_in, p_out)
                            else:
                                # No biometric data on holiday
                                # Check if there's an existing attendance record (from COL form approval)
                                existing_record = AttendanceRecord.objects.filter(user=user, date=past_date).first()
                                if existing_record:
                                    # COL form was approved but staff didn't actually come - mark absent and revoke COL
                                    existing_record.morning_in = None
                                    existing_record.evening_out = None
                                    existing_record.fn_status = 'absent'
                                    existing_record.an_status = 'absent'
                                    existing_record.status = 'absent'
                                    existing_record.save()
                                    self._check_and_revoke_col_for_absence(user, past_date)
                                    row_saved = True
                                elif overwrite_existing:
                                    # If overwrite_existing and no data, delete any existing record for this holiday
                                    AttendanceRecord.objects.filter(user=user, date=past_date).delete()
                        else:
                            # Normal backfill processing (working day for this user)
                            p_in, p_out = self._parse_time_range(row.get(self._col(d), ''))
                            if p_in or p_out:
                                if self._upsert_record(user, past_date, p_in, p_out,
                                                       'backfill', overwrite_existing, source_file):
                                    row_saved = True
                            elif past_date.weekday() != 6:  # Not a Sunday
                                # No scan data on a working day → mark absent if no existing record.
                                # This correctly handles dept-scoped holidays: staff whose dept has
                                # no holiday on this date should be absent when they have no scan.
                                existing = AttendanceRecord.objects.filter(
                                    user=user, date=past_date
                                ).first()
                                if not existing:
                                    AttendanceRecord.objects.create(
                                        user=user,
                                        date=past_date,
                                        morning_in=None,
                                        evening_out=None,
                                        fn_status='absent',
                                        an_status='absent',
                                        status='absent',
                                        notes='Marked absent - no scan record found'
                                    )
                                    row_saved = True

                    if row_saved:
                        success_count += 1

                upload_log.processed_rows = processed_rows
                upload_log.success_count = success_count
                upload_log.error_count = len(errors)
                upload_log.errors = errors
                upload_log.save()

            # Recalculate LOP right after upload so absent entries are reflected immediately.
            for username in users_to_sync_lop:
                try:
                    call_command('sync_absent_to_lop', user=username)
                except Exception:
                    # Do not fail upload if LOP sync fails for a user.
                    pass

            return Response({
                'success': True,
                'upload_date': today.isoformat(),
                'processed_rows': processed_rows,
                'success_count': success_count,
                'error_count': len(errors),
                'errors': errors[:50],
                'upload_log_id': upload_log.id,
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {'error': f'Failed to process CSV: {str(e)}',
                 'detail': tb_module.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def bulk_delete_month(self, request):
        """
        Bulk delete all attendance records for a specific month/year.
        
        Body parameters:
        - month: integer (1-12)
        - year: integer
        - confirm: boolean (must be true to actually delete)
        """
        month = request.data.get('month')
        year = request.data.get('year')
        confirm = request.data.get('confirm', False)
        
        if not month or not year:
            return Response({'error': 'month and year are required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        try:
            month = int(month)
            year = int(year)
            
            if month < 1 or month > 12:
                return Response({'error': 'month must be between 1 and 12'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            if year < 2020 or year > 2100:
                return Response({'error': 'year must be between 2020 and 2100'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid month or year'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Query records for the month
        records = AttendanceRecord.objects.filter(date__year=year, date__month=month)
        count = records.count()

        month_start = date_type(year, month, 1)
        if month == 12:
            month_end = date_type(year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date_type(year, month + 1, 1) - timedelta(days=1)

        # Preserve records that are created/overridden by approved request forms
        # (late entry permissions, leave attendance status overrides, OD, etc.).
        protected_pairs = set()
        try:
            from staff_requests.models import StaffRequest

            approved_requests = StaffRequest.objects.filter(status='approved').select_related('template', 'applicant')
            for req in approved_requests:
                template = req.template
                if not template:
                    continue

                leave_policy = template.leave_policy or {}
                attendance_action = template.attendance_action or {}

                affects_attendance = bool(leave_policy.get('attendance_status')) or (
                    attendance_action.get('change_status') is True
                )
                if not affects_attendance:
                    continue

                covered_dates = self._request_dates_for_month(req.form_data, month_start, month_end)
                for d in covered_dates:
                    protected_pairs.add((req.applicant_id, d))
        except Exception:
            protected_pairs = set()

        protected_ids = []
        if protected_pairs:
            for rec in records.only('id', 'user_id', 'date'):
                if (rec.user_id, rec.date) in protected_pairs:
                    protected_ids.append(rec.id)

        deletable_records = records.exclude(id__in=protected_ids)
        protected_count = len(protected_ids)
        deletable_count = deletable_records.count()
        
        if not confirm:
            # Preview mode - show what would be deleted
            return Response({
                'preview': True,
                'month': month,
                'year': year,
                'records_count': count,
                'protected_count': protected_count,
                'deletable_count': deletable_count,
                'message': (
                    f'Found {count} records for {year}-{month:02d}. '
                    f'{protected_count} form-overridden record(s) are protected. '
                    f'Set confirm=true to delete {deletable_count} remaining record(s).'
                )
            })
        
        # Actually delete
        with transaction.atomic():
            deleted_count, _ = deletable_records.delete()
        
        return Response({
            'success': True,
            'month': month,
            'year': year,
            'deleted_count': deleted_count,
            'protected_count': protected_count,
            'message': (
                f'Successfully deleted {deleted_count} attendance records for {year}-{month:02d}. '
                f'Protected {protected_count} form-overridden record(s).'
            )
        }, status=status.HTTP_200_OK)


class HalfDayRequestViewSet(viewsets.ModelViewSet):
    """ViewSet for managing period attendance access requests"""
    queryset = HalfDayRequest.objects.all()
    serializer_class = HalfDayRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def _get_staff_departments_as_hod_or_ahod(self, user):
        """Get departments where user is HOD or AHOD"""
        try:
            from academics.models import DepartmentRole, AcademicYear
            staff_profile = getattr(user, 'staff_profile', None)
            if not staff_profile:
                return []
            
            # Get current academic year
            current_year = AcademicYear.objects.filter(is_active=True).first()
            if not current_year:
                return []
            
            # Get departments where user is active HOD or AHOD
            roles = DepartmentRole.objects.filter(
                staff=staff_profile,
                role__in=['HOD', 'AHOD'],
                academic_year=current_year,
                is_active=True
            ).select_related('department')
            
            return [role.department for role in roles]
        except Exception as e:
            print(f"Error getting HOD/AHOD departments: {e}")
            return []
    
    def _is_hod_or_ahod(self, user):
        """Check if user is HOD or AHOD for any department"""
        return len(self._get_staff_departments_as_hod_or_ahod(user)) > 0
    
    def get_queryset(self):
        """Filter queryset based on user role"""
        user = self.request.user
        
        # HOD/AHOD can see all requests from their department(s)
        departments = self._get_staff_departments_as_hod_or_ahod(user)
        if departments:
            return HalfDayRequest.objects.filter(
                staff_user__staff_profile__department__in=departments
            ).select_related('staff_user', 'staff_user__staff_profile', 'staff_user__staff_profile__department', 
                           'reviewed_by').order_by('-requested_at')
        
        # Staff can only see their own requests
        return HalfDayRequest.objects.filter(staff_user=user).select_related(
            'staff_user', 'staff_user__staff_profile', 'reviewed_by'
        ).order_by('-requested_at')
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return HalfDayRequestCreateSerializer
        elif self.action in ['review_request'] and self._is_hod_or_ahod(self.request.user):
            return HalfDayRequestReviewSerializer
        return HalfDayRequestSerializer
    
    def perform_create(self, serializer):
        """Create period attendance access request for current user"""
        serializer.save()
    
    @action(detail=False, methods=['get'])
    def my_requests(self, request):
        """Get current user's period attendance access requests"""
        requests = HalfDayRequest.objects.filter(
            staff_user=request.user
        ).select_related('reviewed_by').order_by('-requested_at')
        
        serializer = self.get_serializer(requests, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def pending_for_review(self, request):
        """Get pending period attendance access requests for HOD/AHOD review"""
        if not self._is_hod_or_ahod(request.user):
            return Response({'error': 'Only HOD or AHOD can access pending reviews'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        departments = self._get_staff_departments_as_hod_or_ahod(request.user)
        if not departments:
            return Response([])
        
        # Query using explicit join to handle cases where staff_profile or department might be null
        # Get all users in these departments first
        from academics.models import StaffProfile
        staff_profiles_in_dept = StaffProfile.objects.filter(
            department__in=departments
        ).values_list('user_id', flat=True)
        
        pending = HalfDayRequest.objects.filter(
            staff_user_id__in=staff_profiles_in_dept,
            status='pending'
        ).select_related(
            'staff_user', 'staff_user__staff_profile', 'staff_user__staff_profile__department',
            'reviewed_by'
        ).order_by('requested_at')
        
        serializer = self.get_serializer(pending, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def review_request(self, request, pk=None):
        """HOD/AHOD review of period attendance access request"""
        access_request = self.get_object()
        
        # Check if user is HOD/AHOD for the requesting staff's department
        user = request.user
        staff_profile = getattr(user, 'staff_profile', None)
        if not staff_profile:
            return Response({'error': 'Staff profile required'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Get the requesting staff's department
        requesting_staff_dept = getattr(
            getattr(access_request.staff_user, 'staff_profile', None), 
            'department', 
            None
        )
        if not requesting_staff_dept:
            return Response({'error': 'Requesting staff has no department'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Check if reviewer is HOD/AHOD for the same department
        from academics.models import DepartmentRole, AcademicYear
        current_year = AcademicYear.objects.filter(is_active=True).first()
        if not current_year:
            return Response({'error': 'No active academic year'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        reviewer_role = DepartmentRole.objects.filter(
            staff=staff_profile,
            department=requesting_staff_dept,
            role__in=['HOD', 'AHOD'],
            academic_year=current_year,
            is_active=True
        ).first()
        
        if not reviewer_role:
            return Response({'error': 'You are not HOD/AHOD for this staff member\'s department'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Both HOD and AHOD can approve/reject requests
        # Get action and review notes
        action_type = request.data.get('action')  # 'approve' or 'reject'
        review_notes = request.data.get('review_notes', '')
        
        if action_type not in ['approve', 'reject']:
            return Response({'error': 'Action must be "approve" or "reject"'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Update request
        if action_type == 'approve':
            access_request.status = 'approved'
        else:
            access_request.status = 'rejected'
        
        access_request.reviewed_by = user
        access_request.reviewed_at = timezone.now()
        access_request.review_notes = review_notes
        access_request.save()
        
        serializer = self.get_serializer(access_request)
        return Response({
            'success': True,
            'message': f'Period attendance access request {action_type}d successfully',
            'request': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def check_period_attendance_access(self, request):
        """Check if current user can mark period attendance for a specific date"""
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from datetime import datetime
            target_date = datetime.fromisoformat(date_str).date()
        except:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check staff attendance record
        try:
            attendance_record = AttendanceRecord.objects.get(user=request.user, date=target_date)
            
            # If staff is present or partial, allow access
            if attendance_record.status in ['present', 'partial']:
                return Response({
                    'can_mark_attendance': True,
                    'reason': f'Staff is {attendance_record.status}',
                    'attendance_record': {
                        'id': attendance_record.id,
                        'date': attendance_record.date.isoformat(),
                        'status': attendance_record.status,
                        'morning_in': attendance_record.morning_in.strftime('%H:%M') if attendance_record.morning_in else None,
                        'evening_out': attendance_record.evening_out.strftime('%H:%M') if attendance_record.evening_out else None,
                    },
                    'pending_request': None
                })
            
            # If staff is absent, check for approved or pending request
            if attendance_record.status == 'absent':
                # Check for approved request
                approved_request = HalfDayRequest.objects.filter(
                    staff_user=request.user,
                    attendance_date=target_date,
                    status='approved'
                ).first()
                
                if approved_request:
                    return Response({
                        'can_mark_attendance': True,
                        'reason': 'Period attendance access approved by HOD/AHOD',
                        'attendance_record': {
                            'id': attendance_record.id,
                            'date': attendance_record.date.isoformat(),
                            'status': attendance_record.status,
                            'morning_in': None,
                            'evening_out': None,
                        },
                        'pending_request': None
                    })
                
                # Check for pending request
                pending_request = HalfDayRequest.objects.filter(
                    staff_user=request.user,
                    attendance_date=target_date,
                    status='pending'
                ).first()
                
                if pending_request:
                    return Response({
                        'can_mark_attendance': False,
                        'reason': 'Staff is absent. Access request pending HOD/AHOD approval',
                        'attendance_record': {
                            'id': attendance_record.id,
                            'date': attendance_record.date.isoformat(),
                            'status': attendance_record.status,
                            'morning_in': None,
                            'evening_out': None,
                        },
                        'pending_request': {
                            'id': pending_request.id,
                            'requested_at': pending_request.requested_at.isoformat(),
                            'status': pending_request.status,
                            'reason': pending_request.reason
                        }
                    })
                
                # Staff is absent with no request
                return Response({
                    'can_mark_attendance': False,
                    'reason': 'Staff is absent. Please request period attendance access from your HOD/AHOD',
                    'attendance_record': {
                        'id': attendance_record.id,
                        'date': attendance_record.date.isoformat(),
                        'status': attendance_record.status,
                        'morning_in': None,
                        'evening_out': None,
                    },
                    'pending_request': None
                })
        
        except AttendanceRecord.DoesNotExist:
            # No attendance record yet - allow access (PS hasn't uploaded yet)
            return Response({
                'can_mark_attendance': True,
                'reason': 'No staff attendance record found',
                'attendance_record': None,
                'pending_request': None
            })


class HolidayViewSet(viewsets.ModelViewSet):
    """ViewSet for managing holidays"""
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer
    # default permission applied for unsafe methods; allow authenticated users to view holidays
    permission_classes = [StaffAttendanceUploadPermission]

    def get_permissions(self):
        """Allow any authenticated user to list/retrieve holidays; restrict create/delete to PS role."""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        return [permission() for permission in self.permission_classes]

    def get_queryset(self):
        """
        PS/IQAC/admin users see all holidays (for management).
        Regular staff see only holidays applicable to their department:
          - College-wide holidays (no departments set), OR
          - Dept-specific holidays that include the staff's department.
        """
        qs = Holiday.objects.all().prefetch_related('departments')
        user = self.request.user
        is_admin = (
            user.is_staff or user.is_superuser or (
                hasattr(user, 'user_roles') and
                user.user_roles.filter(role__name__in=['PS', 'IQAC']).exists()
            )
        )
        if is_admin:
            return qs

        user_dept_id = None
        try:
            if hasattr(user, 'staff_profile'):
                dept = user.staff_profile.get_current_department()
                if dept:
                    user_dept_id = dept.id
        except Exception:
            pass

        if user_dept_id:
            from django.db.models import Count
            # College-wide: annotate count of departments; 0 means no restriction
            college_wide_ids = list(
                qs.annotate(dc=Count('departments')).filter(dc=0).values_list('id', flat=True)
            )
            dept_specific_ids = list(
                qs.filter(departments__id=user_dept_id).values_list('id', flat=True)
            )
            applicable_ids = set(college_wide_ids) | set(dept_specific_ids)
            return qs.filter(id__in=applicable_ids)

        return qs

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return HolidayCreateSerializer
        return HolidaySerializer
    
    def perform_create(self, serializer):
        """Save holiday with the current user"""
        serializer.save(created_by=self.request.user)
    
    def destroy(self, request, *args, **kwargs):
        """Check if holiday is removable before deletion"""
        holiday = self.get_object()
        if not holiday.is_removable:
            return Response(
                {'error': 'This holiday cannot be removed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def departments(self, request):
        """Return all departments for holiday department-scoping (PS/admin only)."""
        from academics.models import Department
        depts = Department.objects.order_by('code')
        return Response([
            {'id': d.id, 'code': d.code, 'name': d.name, 'short_name': getattr(d, 'short_name', '')}
            for d in depts
        ])

    @action(detail=False, methods=['get'])
    def check_date(self, request):
        """Check if a specific date is a holiday"""
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from datetime import datetime
            check_date = datetime.fromisoformat(date_str).date()
        except:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if date is a Sunday
        is_sunday = check_date.weekday() == 6
        
        # Check if date is marked as holiday
        holiday = Holiday.objects.filter(date=check_date).first()
        
        return Response({
            'is_holiday': holiday is not None,
            'holiday': HolidaySerializer(holiday).data if holiday else None,
            'is_sunday': is_sunday
        })
    
    @action(detail=False, methods=['post'])
    def generate_sundays(self, request):
        """Generate Sunday holidays for a specific month/year or date range"""
        year = request.data.get('year')
        month = request.data.get('month')
        from_date_str = request.data.get('from_date')
        to_date_str = request.data.get('to_date')
        
        try:
            if from_date_str and to_date_str:
                from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            elif year and month:
                from_date = date_type(int(year), int(month), 1)
                # Last day of month
                if int(month) == 12:
                    to_date = date_type(int(year), 12, 31)
                else:
                    to_date = date_type(int(year), int(month) + 1, 1) - timedelta(days=1)
            else:
                return Response(
                    {'error': 'Provide either (year, month) or (from_date, to_date)'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Find all Sundays in the date range
            sundays = []
            current_date = from_date
            while current_date <= to_date:
                if current_date.weekday() == 6:  # Sunday
                    sundays.append(current_date)
                current_date += timedelta(days=1)
            
            # Create holiday records for Sundays that don't already exist
            created_count = 0
            for sunday in sundays:
                holiday, created = Holiday.objects.get_or_create(
                    date=sunday,
                    defaults={
                        'name': 'Sunday',
                        'notes': 'Auto-generated Sunday holiday',
                        'is_sunday': True,
                        'is_removable': True,
                        'created_by': request.user
                    }
                )
                if created:
                    created_count += 1
            
            return Response({
                'success': True,
                'total_sundays': len(sundays),
                'created': created_count,
                'already_exists': len(sundays) - created_count
            })
        
        except Exception as e:
            return Response(
                {'error': f'Failed to generate Sundays: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def remove_sundays(self, request):
        """Remove Sunday holidays for a specific month/year or date range"""
        year = request.data.get('year')
        month = request.data.get('month')
        from_date_str = request.data.get('from_date')
        to_date_str = request.data.get('to_date')
        
        try:
            if from_date_str and to_date_str:
                from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
                to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            elif year and month:
                from_date = date_type(int(year), int(month), 1)
                if int(month) == 12:
                    to_date = date_type(int(year), 12, 31)
                else:
                    to_date = date_type(int(year), int(month) + 1, 1) - timedelta(days=1)
            else:
                return Response(
                    {'error': 'Provide either (year, month) or (from_date, to_date)'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Delete Sunday holidays in the date range
            deleted_count, _ = Holiday.objects.filter(
                date__gte=from_date,
                date__lte=to_date,
                is_sunday=True,
                is_removable=True
            ).delete()
            
            return Response({
                'success': True,
                'deleted_count': deleted_count
            })
        
        except Exception as e:
            return Response(
                {'error': f'Failed to remove Sundays: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )


class AttendanceSettingsViewSet(viewsets.ModelViewSet):
    """ViewSet for managing attendance time settings"""
    queryset = AttendanceSettings.objects.all()
    serializer_class = AttendanceSettingsSerializer
    permission_classes = [StaffAttendanceConfigPermission]  # HR/PS/Admin can manage settings
    
    def perform_create(self, serializer):
        """Save settings with the current user"""
        serializer.save(updated_by=self.request.user)
    
    def perform_update(self, serializer):
        """Update settings with the current user"""
        serializer.save(updated_by=self.request.user)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def current(self, request):
        """Get current attendance settings for the user's department or global.
        Returns department-specific settings if available, otherwise global settings.
        Available to all staff."""
        result = {}
        
        # Try to get department-specific settings
        dept_settings = None
        if hasattr(request.user, 'staff_profile') and request.user.staff_profile.department:
            from .models import DepartmentAttendanceSettings
            dept_settings = DepartmentAttendanceSettings.objects.filter(
                departments=request.user.staff_profile.department,
                enabled=True
            ).first()
        
        if dept_settings:
            # Return department-specific settings with a flag
            from .serializers import DepartmentAttendanceSettingsSerializer
            result = DepartmentAttendanceSettingsSerializer(dept_settings).data
            result['is_department_specific'] = True
        else:
            # Fall back to global settings
            settings, created = AttendanceSettings.objects.get_or_create(
                id=1,
                defaults={
                    'attendance_in_time_limit': '08:45:00',
                    'attendance_out_time_limit': '17:45:00',
                    'apply_time_based_absence': True,
                    'updated_by': request.user
                }
            )
            from .serializers import AttendanceSettingsSerializer
            result = AttendanceSettingsSerializer(settings).data
            result['is_department_specific'] = False
        
        return Response(result)


class DepartmentAttendanceSettingsViewSet(viewsets.ModelViewSet):
    """ViewSet for managing department-specific attendance time settings (PS only)"""
    queryset = DepartmentAttendanceSettings.objects.all()
    serializer_class = DepartmentAttendanceSettingsSerializer
    permission_classes = [StaffAttendanceConfigPermission]  # HR/PS/Admin can manage
    filterset_fields = ['enabled', 'departments']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at', 'updated_at']
    
    def perform_create(self, serializer):
        """Save with the current user as creator"""
        serializer.save(created_by=self.request.user, updated_by=self.request.user)
    
    def perform_update(self, serializer):
        """Update with the current user"""
        serializer.save(updated_by=self.request.user)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def for_my_department(self, request):
        """Get settings for the current user's department"""
        if not hasattr(request.user, 'staff_profile') or not request.user.staff_profile.department:
            return Response(
                {'error': 'User does not have a department assigned'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        settings = DepartmentAttendanceSettings.objects.filter(
            departments=request.user.staff_profile.department,
            enabled=True
        ).first()
        
        if settings:
            return Response(DepartmentAttendanceSettingsSerializer(settings).data)
        else:
            return Response(
                {'message': 'No department-specific settings found. Using global defaults.'},
                status=status.HTTP_404_NOT_FOUND
            )


class SpecialDepartmentDateAttendanceLimitViewSet(viewsets.ModelViewSet):
    """HR/PS special date-range attendance limits by department."""
    queryset = SpecialDepartmentDateAttendanceLimit.objects.all().prefetch_related('departments')
    serializer_class = SpecialDepartmentDateAttendanceLimitSerializer
    permission_classes = [StaffAttendanceConfigPermission]
    filterset_fields = ['enabled', 'departments', 'from_date', 'to_date']
    search_fields = ['name', 'description']
    ordering_fields = ['from_date', 'to_date', 'created_at', 'updated_at']

    def _reprocess_records_for_limit(self, instance):
        """Recalculate attendance for already-saved rows covered by this limit."""
        start_date = instance.from_date
        end_date = instance.to_date or instance.from_date
        dept_ids = list(instance.departments.values_list('id', flat=True))
        if not dept_ids:
            return 0

        records = AttendanceRecord.objects.filter(
            date__gte=start_date,
            date__lte=end_date,
        ).select_related('user', 'user__staff_profile', 'user__staff_profile__department')

        processed = 0
        for record in records:
            dept_id = None
            profile = getattr(record.user, 'staff_profile', None)
            if profile:
                try:
                    if hasattr(profile, 'get_current_department'):
                        current_dept = profile.get_current_department()
                        if current_dept:
                            dept_id = getattr(current_dept, 'id', None)
                except Exception:
                    dept_id = None

                if dept_id is None:
                    fallback_dept = getattr(profile, 'department', None)
                    dept_id = getattr(fallback_dept, 'id', None) if fallback_dept else None

            if dept_id not in dept_ids:
                continue

            record.update_status()
            record.save(update_fields=['fn_status', 'an_status', 'status'])
            processed += 1
        return processed

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        self._reprocess_records_for_limit(instance)

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        self._reprocess_records_for_limit(instance)

    @action(detail=True, methods=['post'])
    def reapply(self, request, pk=None):
        instance = self.get_object()
        processed = self._reprocess_records_for_limit(instance)
        return Response({'success': True, 'reprocessed_records': processed})

