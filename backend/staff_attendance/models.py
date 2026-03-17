from django.db import models
from django.conf import settings
from django.utils import timezone


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
    
    def update_status(self):
        """Auto-determine status based on morning_in, evening_out, and time limits.
        Preserves leave statuses (CL, OD, ML, COL, etc.) - only updates biometric statuses.
        
        FN/AN Split Logic:
        - FN (Forenoon): Based on morning_in time vs in_time_limit (default 08:45)
        - AN (Afternoon): Based on morning_in vs mid_split (1 PM) and evening_out vs out_time_limit
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
            settings = AttendanceSettings.objects.first()
            
            if settings and settings.apply_time_based_absence:
                in_limit = settings.attendance_in_time_limit  # Default: 08:45
                out_limit = settings.attendance_out_time_limit  # Default: 17:00
                mid_split = settings.mid_time_split  # Default: 13:00 (1 PM)
                
                # === Calculate FN status ===
                if _needs_biometric_calc(self.fn_status):
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
                    if self.morning_in and self.evening_out:
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
                if _needs_biometric_calc(self.fn_status):
                    self.fn_status = 'present' if self.morning_in else 'absent'
                
                if _needs_biometric_calc(self.an_status):
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
