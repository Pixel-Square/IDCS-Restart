from django.db import models
from django.conf import settings
from django.utils import timezone
from django.db.models import Q


class AttendanceRecord(models.Model):
    """Records daily attendance for staff members"""
    # No choices constraint - accepts any status code from leave templates
    # Common values: 'present', 'absent', 'half_day', 'partial', 'OD', 'LEAVE', 'CL', 'ML', 'COL', etc.
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attendance_records'
    )
    date = models.DateField(db_index=True)
    morning_in = models.TimeField(null=True, blank=True)
    evening_out = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default='absent', help_text='Attendance status code - can be any value from leave templates')
    
    # Split attendance for FN (Forenoon) and AN (Afternoon)
    # null=True allows recording only one session (e.g., FN COL on holiday without AN status)
    fn_status = models.CharField(max_length=20, null=True, blank=True, help_text='Forenoon attendance status')
    an_status = models.CharField(max_length=20, null=True, blank=True, help_text='Afternoon attendance status')
    
    notes = models.TextField(blank=True)
    
    # Audit fields
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_attendance_records'
    )
    uploaded_at = models.DateTimeField(default=timezone.now)
    source_file = models.CharField(max_length=255, blank=True)
    
    class Meta:
        db_table = 'staff_attendance_record'
        unique_together = [['user', 'date']]
        ordering = ['-date', 'user']
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['date', 'status']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.date} - {self.status}"
    
    def update_status(self, defer_an_until_out: bool = False):
        """Auto-determine status based on morning_in, evening_out, and time limits.
        Preserves leave statuses (CL, OD, ML, COL, etc.) - only updates biometric statuses.
        
        FN/AN Split Logic:
        - FN (Forenoon): Based on morning_in time vs in_time_limit (default 08:45)
        - AN (Afternoon): Based on morning_in vs mid_split (1 PM) and evening_out vs out_time_limit
        
        Priority for time limits:
        1. Department-specific settings (if user belongs to a department with configured settings)
        2. Global AttendanceSettings
        3. Defaults (08:45, 17:00, 13:00)
        """
        # Define statuses that can be auto-updated from biometric data
        BIOMETRIC_STATUSES = ['present', 'absent', 'partial', 'half_day']

        has_biometric = self.morning_in is not None or self.evening_out is not None

        # A session status should be recalculated if:
        #  (a) it's already a biometric status (present/absent/partial/half_day), OR
        #  (b) it's None but we have biometric scan data — meaning it was never set
        #      and needs to be derived from the time data now.
        # In both cases we must NOT touch a leave status (CL, OD, COL, etc.).
        def _needs_biometric_calc(session_status):
            return session_status in BIOMETRIC_STATUSES or (session_status is None and has_biometric)
        
        try:
            # Get time limits with fallback order: staff override -> special date -> department -> global
            in_limit = '08:45:00'
            out_limit = '17:00:00'
            mid_split = '13:00:00'
            apply_absence = True

            # Priority 0: Staff-specific override (highest priority)
            staff_override = StaffAttendanceTimeLimitOverride.objects.filter(
                user=self.user,
                enabled=True,
            ).first()

            if staff_override:
                in_limit = staff_override.attendance_in_time_limit
                out_limit = staff_override.attendance_out_time_limit
                mid_split = staff_override.mid_time_split
                apply_absence = staff_override.apply_time_based_absence
            
            
            # Try to get special date-range settings first, then department-specific settings
            department_settings = None
            special_settings = None
            user_department = None
            if hasattr(self.user, 'staff_profile') and self.user.staff_profile:
                # Prefer current department resolver when available.
                try:
                    if hasattr(self.user.staff_profile, 'get_current_department'):
                        user_department = self.user.staff_profile.get_current_department()
                except Exception:
                    user_department = None

                if not user_department:
                    user_department = getattr(self.user.staff_profile, 'department', None)

            if user_department and not staff_override:

                # Priority 1: HR special date-range limits for this department/date
                special_settings = SpecialDepartmentDateAttendanceLimit.objects.filter(
                    enabled=True,
                    departments=user_department,
                    from_date__lte=self.date,
                ).filter(
                    Q(to_date__isnull=True, from_date=self.date) |
                    Q(to_date__isnull=False, to_date__gte=self.date)
                ).order_by('-from_date', '-id').first()

                if special_settings:
                    in_limit = special_settings.attendance_in_time_limit
                    out_limit = special_settings.attendance_out_time_limit
                    mid_split = special_settings.mid_time_split
                    apply_absence = special_settings.apply_time_based_absence
                    department_settings = None

                # Find an enabled DepartmentAttendanceSettings for user's department
                if not special_settings:
                    department_settings = DepartmentAttendanceSettings.objects.filter(
                        departments=user_department,
                        enabled=True
                    ).first()
            
            if department_settings and not staff_override:
                # Use department-specific settings
                in_limit = department_settings.attendance_in_time_limit
                out_limit = department_settings.attendance_out_time_limit
                mid_split = department_settings.mid_time_split
                apply_absence = department_settings.apply_time_based_absence
            elif not special_settings and not staff_override:
                # Fall back to global settings
                global_settings = AttendanceSettings.objects.first()
                if global_settings:
                    in_limit = global_settings.attendance_in_time_limit
                    out_limit = global_settings.attendance_out_time_limit
                    mid_split = global_settings.mid_time_split
                    apply_absence = global_settings.apply_time_based_absence
            
            if apply_absence:

                fn_no_record_mode = in_limit == mid_split
                an_no_record_mode = out_limit == mid_split

                if _needs_biometric_calc(self.fn_status):
                    if fn_no_record_mode:
                        # When IN limit equals noon split, FN should be treated as no-record.
                        self.fn_status = None
                    else:
                        if self.morning_in:
                            # FN: Present if came before/at the in_time_limit
                            if self.morning_in <= in_limit:
                                self.fn_status = 'present'
                            else:
                                # Came late (after in_time_limit) - FN absent
                                self.fn_status = 'absent'
                        else:
                            # No morning_in time - FN absent
                            self.fn_status = 'absent'
                # else: Preserve leave status (CL, OD, ML, COL, etc.)
                
                # === Calculate AN status ===
                if _needs_biometric_calc(self.an_status):
                    if an_no_record_mode:
                        # When OUT limit equals noon split, AN should be treated as no-record.
                        self.an_status = None
                    elif self.morning_in and self.evening_out:
                        # Has both in and out times
                        # AN is absent if:
                        # 1. Came after mid_split (came after 1 PM - missed forenoon and morning)
                        # 2. OR left before out_limit (left early from afternoon session)
                        if self.morning_in > mid_split:
                            # Came after 1 PM - didn't attend morning/FN, so likely didn't attend full AN either
                            self.an_status = 'absent'
                        elif self.evening_out < out_limit:
                            # Left before required out time - didn't complete AN session
                            self.an_status = 'absent'
                        else:
                            # Came before/at 1 PM and left after required time - AN present
                            self.an_status = 'present'
                    elif self.morning_in:
                        # Has morning_in but no evening_out - probably partial day
                        if self.morning_in <= mid_split:
                            # Realtime biometric flow can defer AN decision until
                            # a valid OUT punch is captured.
                            if defer_an_until_out:
                                self.an_status = None
                            else:
                                self.an_status = 'absent'  # Has FN but no AN
                        else:
                            # Came after mid_split - no proper attendance
                            self.an_status = 'absent'
                    else:
                        # No times at all
                        self.an_status = 'absent'
                # else: Preserve leave status (CL, OD, ML, COL, etc.)
                
            else:
                # No settings OR time-based absence is disabled — simple present/absent logic
                fn_no_record_mode = in_limit == mid_split
                an_no_record_mode = out_limit == mid_split

                if _needs_biometric_calc(self.fn_status):
                    if fn_no_record_mode:
                        self.fn_status = None
                    else:
                        self.fn_status = 'present' if self.morning_in else 'absent'
                
                if _needs_biometric_calc(self.an_status):
                    if an_no_record_mode:
                        self.an_status = None
                    else:
                        self.an_status = 'present' if self.evening_out else 'absent'
            
            # === Calculate overall status based on FN and AN ===
            # Overall status logic:
            # - If both FN and AN are null → absent (no data)
            # - If one is null and other has value → use the non-null value
            # - If both FN and AN have same status → use that status
            # - If one is non-absent → half_day
            # - If both absent → absent
            
            if self.fn_status is None and self.an_status is None:
                # Both sessions null (no data)
                self.status = 'absent'
            elif self.fn_status is None:
                # Only AN has data, use AN status
                self.status = self.an_status
            elif self.an_status is None:
                # Only FN has data, use FN status
                self.status = self.fn_status
            elif self.fn_status == self.an_status:
                # Both sessions have same status
                self.status = self.fn_status
            elif self.fn_status != 'absent' or self.an_status != 'absent':
                # At least one session has non-absent status
                self.status = 'half_day'
            else:
                # Both absent
                self.status = 'absent'
                
        except Exception as e:
            # Fallback on any error - preserve leave statuses
            import logging
            logger = logging.getLogger(__name__)
            logger.exception(f'Error in update_status for {self.user} on {self.date}: {e}')
            
            # Simple fallback - only update if statuses are biometric
            if self.fn_status in BIOMETRIC_STATUSES:
                self.fn_status = 'present' if self.morning_in else 'absent'
            if self.an_status in BIOMETRIC_STATUSES:
                self.an_status = 'present' if self.evening_out else 'absent'
            
            # Recalculate overall (with null handling)
            if self.fn_status is None and self.an_status is None:
                self.status = 'absent'
            elif self.fn_status is None:
                self.status = self.an_status
            elif self.an_status is None:
                self.status = self.fn_status
            elif self.fn_status == self.an_status:
                self.status = self.fn_status
            elif self.fn_status != 'absent' or self.an_status != 'absent':
                self.status = 'half_day'
            else:
                self.status = 'absent'


class UploadLog(models.Model):
    """Logs each CSV upload by PS"""
    uploader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    filename = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    target_date = models.DateField(help_text="Upload date used to determine columns")
    
    # Processing results
    processed_rows = models.IntegerField(default=0)
    success_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    
    # Store original file
    file = models.FileField(upload_to='attendance_uploads/%Y/%m/', null=True, blank=True)
    
    class Meta:
        db_table = 'staff_attendance_upload_log'
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"{self.filename} - {self.uploaded_at.strftime('%Y-%m-%d %H:%M')}"


class HalfDayRequest(models.Model):
    """Staff requests for period attendance access from HOD/AHOD"""
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    # Staff requesting access
    staff_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attendance_access_requests'
    )
    
    # Date for which access is requested
    attendance_date = models.DateField(help_text="Date for which period attendance access is requested")
    
    # Request details
    requested_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(help_text="Staff reason for requesting period attendance access")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # HOD/AHOD approval
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_attendance_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, help_text="HOD/AHOD review comments")
    
    class Meta:
        db_table = 'staff_attendance_halfday_request'
        unique_together = [['staff_user', 'attendance_date']]
        ordering = ['-requested_at']
    
    def __str__(self):
        return f"{self.staff_user.username} - {self.attendance_date} - {self.status}"
    
    @property
    def can_mark_attendance(self):
        """Check if staff can mark period attendance for this date"""
        return self.status == 'approved'


class Holiday(models.Model):
    """Records holidays when attendance should not be marked"""
    date = models.DateField(unique=True, db_index=True)
    name = models.CharField(max_length=200, help_text="Holiday name/description")
    notes = models.TextField(blank=True, help_text="Additional notes")
    is_sunday = models.BooleanField(default=False, help_text="True if this is an auto-generated Sunday holiday")
    is_removable = models.BooleanField(default=True, help_text="If False, this holiday cannot be deleted")

    # Optional department scoping: if empty the holiday applies to ALL departments;
    # if specific departments are selected only those departments observe the holiday.
    departments = models.ManyToManyField(
        'academics.Department',
        blank=True,
        related_name='holidays',
        help_text='If empty, holiday applies to all departments. Otherwise only selected departments observe it.',
    )

    # Audit fields
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_holidays'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'staff_attendance_holiday'
        ordering = ['-date']
        indexes = [
            models.Index(fields=['date']),
        ]
    
    def __str__(self):
        return f"{self.date} - {self.name}"


class AttendanceSettings(models.Model):
    """Global settings for attendance time limits and absence rules"""
    attendance_in_time_limit = models.TimeField(
        default='08:45:00',
        help_text="If morning_in is after this time, mark FN as absent"
    )
    attendance_out_time_limit = models.TimeField(
        default='17:00:00',
        help_text="If evening_out is before this time, mark AN as absent"
    )
    mid_time_split = models.TimeField(
        default='13:00:00',
        help_text="Time that splits FN (Forenoon) and AN (Afternoon) sessions"
    )
    lunch_from = models.TimeField(
        null=True,
        blank=True,
        help_text="Optional lunch break start time"
    )
    lunch_to = models.TimeField(
        null=True,
        blank=True,
        help_text="Optional lunch break end time"
    )
    essl_skip_minutes = models.PositiveIntegerField(
        default=30,
        help_text="Minimum minutes after first biometric punch before mapping a second punch as OUT"
    )
    apply_time_based_absence = models.BooleanField(
        default=True,
        help_text="Enable time-based absence marking"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_attendance_settings'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'staff_attendance_settings'
        verbose_name = 'Attendance Settings'
        verbose_name_plural = 'Attendance Settings'
    
    def __str__(self):
        return f"Attendance Settings (Updated: {self.updated_at.strftime('%Y-%m-%d %H:%M')})"


class DepartmentAttendanceSettings(models.Model):
    """Department-specific attendance time limits (e.g., Type 1 for CSE/Mech, Type 2 for EEE/ECE)"""
    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="Configuration name (e.g., 'Type 1', 'Engineering Depts', 'CSE/Mech')"
    )
    description = models.TextField(
        blank=True,
        help_text="Description of which departments use these settings"
    )
    attendance_in_time_limit = models.TimeField(
        default='08:45:00',
        help_text="If morning_in is after this time, mark FN as absent"
    )
    attendance_out_time_limit = models.TimeField(
        default='17:00:00',
        help_text="If evening_out is before this time, mark AN as absent"
    )
    mid_time_split = models.TimeField(
        default='13:00:00',
        help_text="Time that splits FN (Forenoon) and AN (Afternoon) sessions"
    )
    lunch_from = models.TimeField(
        null=True,
        blank=True,
        help_text="Optional lunch break start time"
    )
    lunch_to = models.TimeField(
        null=True,
        blank=True,
        help_text="Optional lunch break end time"
    )
    apply_time_based_absence = models.BooleanField(
        default=True,
        help_text="Enable time-based absence marking for these departments"
    )
    # Departments assigned to this configuration
    departments = models.ManyToManyField(
        'academics.Department',
        related_name='attendance_settings',
        help_text="Departments using this time limit configuration"
    )
    enabled = models.BooleanField(
        default=True,
        help_text="Enable/disable this configuration"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_dept_attendance_settings'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_dept_attendance_settings'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'staff_attendance_dept_settings'
        verbose_name = 'Department Attendance Settings'
        verbose_name_plural = 'Department Attendance Settings'
        ordering = ['name']
    
    def __str__(self):
        dept_count = self.departments.count()
        return f"{self.name} ({dept_count} dept{'s' if dept_count != 1 else ''})"


class StaffAttendanceTimeLimitOverride(models.Model):
    """Staff-specific attendance time limits (one override per staff).

    Priority order during status calculation:
    1) StaffAttendanceTimeLimitOverride (if enabled)
    2) SpecialDepartmentDateAttendanceLimit (department/date-range)
    3) DepartmentAttendanceSettings
    4) AttendanceSettings (global)
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_attendance_time_limit_override'
    )
    attendance_in_time_limit = models.TimeField(default='08:45:00')
    attendance_out_time_limit = models.TimeField(default='17:00:00')
    mid_time_split = models.TimeField(default='13:00:00')
    lunch_from = models.TimeField(null=True, blank=True)
    lunch_to = models.TimeField(null=True, blank=True)
    apply_time_based_absence = models.BooleanField(default=True)
    enabled = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_staff_attendance_time_limit_overrides'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_staff_attendance_time_limit_overrides'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'staff_attendance_staff_time_limits'
        verbose_name = 'Staff Attendance Time Limit Override'
        verbose_name_plural = 'Staff Attendance Time Limit Overrides'
        ordering = ['-updated_at', '-id']

    def __str__(self):
        return f"{self.user.username} staff time limits"


class SpecialDepartmentDateAttendanceLimit(models.Model):
    """HR special attendance limits for a department/date or date-range."""
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    from_date = models.DateField()
    to_date = models.DateField(null=True, blank=True, help_text='Optional. If empty, applies only to from_date.')
    attendance_in_time_limit = models.TimeField(default='08:45:00')
    attendance_out_time_limit = models.TimeField(default='17:00:00')
    mid_time_split = models.TimeField(default='13:00:00')
    lunch_from = models.TimeField(null=True, blank=True)
    lunch_to = models.TimeField(null=True, blank=True)
    apply_time_based_absence = models.BooleanField(default=True)
    departments = models.ManyToManyField(
        'academics.Department',
        related_name='special_date_attendance_limits',
        help_text='Departments using this special date-range attendance limit'
    )
    enabled = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_special_attendance_limits'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_special_attendance_limits'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'staff_attendance_special_date_limits'
        verbose_name = 'Special Department Date Attendance Limit'
        verbose_name_plural = 'Special Department Date Attendance Limits'
        ordering = ['-from_date', '-id']

    def __str__(self):
        to_text = self.to_date.isoformat() if self.to_date else self.from_date.isoformat()
        return f"{self.name} ({self.from_date.isoformat()} to {to_text})"


class StaffBiometricPunchLog(models.Model):
    """Stores raw biometric punches used to update staff attendance in real time."""

    class Direction(models.TextChoices):
        IN = 'IN', 'IN'
        OUT = 'OUT', 'OUT'
        UNKNOWN = 'UNKNOWN', 'UNKNOWN'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='biometric_punch_logs'
    )
    raw_uid = models.CharField(max_length=64, blank=True, default='', db_index=True)
    raw_staff_id = models.CharField(max_length=64, blank=True, default='', db_index=True)
    punch_time = models.DateTimeField(db_index=True)
    direction = models.CharField(max_length=10, choices=Direction.choices, default=Direction.UNKNOWN)
    source = models.CharField(max_length=40, default='essl_realtime', db_index=True)
    device_ip = models.GenericIPAddressField(null=True, blank=True)
    device_port = models.PositiveIntegerField(null=True, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'staff_biometric_punch_log'
        ordering = ['-punch_time', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['raw_uid', 'raw_staff_id', 'punch_time', 'direction', 'source'],
                name='unique_staff_biometric_punch'
            )
        ]
        indexes = [
            models.Index(fields=['user', 'punch_time']),
            models.Index(fields=['source', 'punch_time']),
        ]

    def __str__(self):
        who = self.raw_staff_id or self.raw_uid or 'unknown'
        return f"{who} {self.direction} @ {self.punch_time}"
