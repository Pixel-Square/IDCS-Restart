import csv
import io
import re
import traceback as tb_module
from datetime import datetime, date as date_type, timedelta
from django.db import transaction
from django.utils import timezone
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from accounts.models import User
from .models import AttendanceRecord, UploadLog, HalfDayRequest, Holiday
from .serializers import AttendanceRecordSerializer, UploadLogSerializer, CSVUploadSerializer, HalfDayRequestSerializer, HalfDayRequestCreateSerializer, HalfDayRequestReviewSerializer, HolidaySerializer, HolidayCreateSerializer
from .permissions import StaffAttendanceViewPermission, StaffAttendanceUploadPermission


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
                'morning_in': record.morning_in.strftime('%H:%M') if record.morning_in else None,
                'evening_out': record.evening_out.strftime('%H:%M') if record.evening_out else None,
                'has_record': True
            })
        else:
            return Response({
                'date': today.isoformat(),
                'status': 'no_record',  # Changed from 'absent' to 'no_record'
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
                # HOD can only see their own department
                if user_department and user_department.id == department_id:
                    queryset = queryset.filter(user__staff_profile__department_id=department_id)
                else:
                    return Response({'error': 'Permission denied: HOD can only view their own department'}, 
                                  status=status.HTTP_403_FORBIDDEN)
            else:
                # Regular staff cannot filter by department
                queryset = queryset.filter(user=user)
        else:
            # No specific filters - determine what user can see
            if is_superuser or has_view_perm or is_ps or is_iqac or is_admin:
                # These roles can see all records
                pass
            elif is_hod and user_department:
                # HOD sees their department
                queryset = queryset.filter(user__staff_profile__department_id=user_department.id)
            else:
                # Regular staff can only see their own records
                queryset = queryset.filter(user=user)
        
        # Order by date
        records = queryset.order_by('date', 'user__username').select_related('user', 'user__staff_profile__department')
        
        # Serialize the records
        data = []
        for record in records:
            data.append({
                'id': record.id,
                'user_id': record.user.id,
                'staff_id': getattr(getattr(record.user, 'staff_profile', None), 'staff_id', None),
                'username': record.user.username,
                'full_name': f"{record.user.first_name} {record.user.last_name}".strip() or record.user.username,
                'date': record.date,
                'status': record.status,
                'morning_in': record.morning_in.strftime('%H:%M') if record.morning_in else None,
                'evening_out': record.evening_out.strftime('%H:%M') if record.evening_out else None,
                'notes': record.notes,
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
    def available_departments(self, request):
        """Get list of departments the user can view attendance for"""
        user = request.user
        
        # Check user permissions
        is_superuser = user.is_superuser
        is_ps = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='PS').exists()
        is_hod = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='HOD').exists()
        is_iqac = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='IQAC').exists()
        is_admin = hasattr(user, 'user_roles') and user.user_roles.filter(role__name='ADMIN').exists()
        
        from academics.models import Department
        
        departments = []
        
        if is_superuser or is_ps or is_iqac or is_admin:
            # These roles can see all departments
            dept_queryset = Department.objects.all()
        elif is_hod:
            # HOD can only see their own department
            user_staff_profile = getattr(user, 'staff_profile', None)
            if user_staff_profile and user_staff_profile.department:
                dept_queryset = Department.objects.filter(id=user_staff_profile.department.id)
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

    def _is_holiday(self, target_date):
        """Check if a specific date is marked as a holiday."""
        return Holiday.objects.filter(date=target_date).exists()

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
                       mode, overwrite, source_file):
        """
        Create or update an AttendanceRecord.

        mode='today'     → set morning_in (+ evening_out if present)
        mode='yesterday' → fill deferred evening_out; backfill morning_in if missing
        mode='backfill'  → only create if no record exists yet (or overwrite=True)
        """
        # Always process records, even when both times are None (to mark absent)
        record = AttendanceRecord.objects.filter(user=user, date=target_date).first()

        # backfill: skip if record already exists and no overwrite
        if mode == 'backfill' and record is not None and not overwrite:
            return None

        if record is None:
            # Determine status based on morning_in presence first
            if morning_in is None:
                st = 'absent'  # No morning entry = absent
            elif morning_in and evening_out:
                st = 'present'  # Has morning + evening = present 
            elif morning_in:
                st = 'partial'  # Has morning only = partial
            else:
                st = 'absent'   # Fallback
            record = AttendanceRecord(
                user=user, date=target_date,
                morning_in=morning_in, evening_out=evening_out,
                status=st, source_file=source_file,
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
                
                # Special handling for yesterday mode: if morning was already present but status was absent,
                # and we're now adding evening_out, update status to present/partial
                if mode == 'yesterday' and record.morning_in is not None and evening_out is not None:
                    if record.status == 'absent':
                        # Had morning entry but was marked absent, now adding evening - should be present
                        pass  # Status will be recalculated below

            # Recompute status ONLY if current status is a biometric status (not leave/OD)
            # Preserve approved leave statuses (OD, CL, ML, COL, LEAVE, LOP, etc.)
            BIOMETRIC_STATUSES = ['present', 'absent', 'partial', 'half_day']
            if record.status in BIOMETRIC_STATUSES:
                # Only recalculate for biometric statuses
                if record.morning_in is None:
                    record.status = 'absent'  # No morning entry = absent
                elif record.morning_in and record.evening_out:
                    record.status = 'present'  # Has morning + evening = present
                elif record.morning_in:
                    record.status = 'partial'  # Has morning only = partial
                else:
                    record.status = 'absent'   # Fallback
            # else: preserve existing leave status (OD, CL, ML, etc.)

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
                        # Yesterday deferred
                        'yesterday_date': (today - timedelta(days=1)).isoformat(),
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

                for row in rows:
                    user_id = row.get('USER_ID', '').strip()
                    if not user_id:
                        continue

                    processed_rows += 1
                    user = self._resolve_user(user_id, errors)
                    if user is None:
                        continue

                    row_saved = False

                    # 1. TODAY: morning entry (+ evening if two distinct times)
                    if not self._is_holiday(today):
                        t_in, t_out = self._parse_time_range(row.get(self._col(today_day), ''))
                        if self._upsert_record(user, today, t_in, t_out,
                                               'today', overwrite_existing, source_file):
                            row_saved = True

                    # 2. YESTERDAY: deferred evening_out (half-day / late swipe)
                    if yest_day >= 1:
                        yest_date = today - timedelta(days=1)
                        if not self._is_holiday(yest_date):
                            y_in, y_out = self._parse_time_range(row.get(self._col(yest_day), ''))
                            if self._upsert_record(user, yest_date, y_in, y_out,
                                                   'yesterday', overwrite_existing, source_file):
                                row_saved = True

                    # 3. BACKFILL: D1 … D(today-2)  — only save if not yet in DB
                    for d in backfill_days:
                        past_date = date_type(today.year, today.month, d)
                        if not self._is_holiday(past_date):
                            p_in, p_out = self._parse_time_range(row.get(self._col(d), ''))
                            if self._upsert_record(user, past_date, p_in, p_out,
                                                   'backfill', overwrite_existing, source_file):
                                row_saved = True

                    if row_saved:
                        success_count += 1

                upload_log.processed_rows = processed_rows
                upload_log.success_count = success_count
                upload_log.error_count = len(errors)
                upload_log.errors = errors
                upload_log.save()

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
    permission_classes = [StaffAttendanceUploadPermission]  # Only PS can manage holidays
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return HolidayCreateSerializer
        return HolidaySerializer
    
    def perform_create(self, serializer):
        """Save holiday with the current user"""
        serializer.save(created_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def check_date(self, request):
        """Check if a specific date is a holiday"""
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'error': 'date parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from datetime import datetime
            date = datetime.fromisoformat(date_str).date()
        except:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        holiday = Holiday.objects.filter(date=date).first()
        if holiday:
            return Response({
                'is_holiday': True,
                'holiday': HolidaySerializer(holiday).data
            })
        else:
            return Response({
                'is_holiday': False,
                'holiday': None
            })
