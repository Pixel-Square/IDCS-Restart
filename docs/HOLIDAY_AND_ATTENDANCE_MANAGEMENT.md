# Holiday and Attendance Management System

## Implementation Status: PARTIAL (Backend Infrastructure Complete)

### ✅ Completed (Backend):

1. **Database Models**:
   - `AttendanceSettings` model created with:
     - `attendance_in_time_limit` (default: 08:45 AM)
     - `attendance_out_time_limit` (default: 17:45 PM)
     - `apply_time_based_absence` flag
   - `Holiday` model enhanced with:
     - `is_sunday` flag for auto-generated Sundays
     - `is_removable` flag to prevent deletion of critical holidays

2. **API Endpoints Created**:
   - `GET /api/staff-attendance/holidays/` - List all holidays
   - `POST /api/staff-attendance/holidays/` - Create holiday
   - `DELETE /api/staff-attendance/holidays/{id}/` - Delete holiday (if removable)
   - `GET /api/staff-attendance/holidays/check_date/?date=YYYY-MM-DD` - Check if date is holiday
   - `POST /api/staff-attendance/holidays/generate_sundays/` - Auto-generate Sunday holidays
   - `POST /api/staff-attendance/holidays/remove_sundays/` - Remove Sunday holidays
   - `GET /api/staff-attendance/settings/current/` - Get current attendance settings
   - `PATCH /api/staff-attendance/settings/1/` - Update attendance settings

3. **Serializers**: All created for Holiday and AttendanceSettings

4. **Admin Interface**: Registered models for backend management

---

## 🚧 PENDING IMPLEMENTATION:

### HIGH PRIORITY:

#### 1. CSV Upload Logic Enhancement (CRITICAL)
**File**: `backend/staff_attendance/views.py` - `CSVUploadViewSet._upsert_record()` and `upload()` methods

**Requirements**:
- ✅ Currently skips holidays (working)
- ❌ Need to ADD: If staff came on holiday → auto-create COL (Compensatory Leave - earn type)
  - Check if attendance data exists on a holiday
  - Auto-create a StaffRequest with COL template
  - Or directly increment their COL balance in StaffLeaveBalance
- ❌ Need to ADD: Time-based absence logic
  - Get AttendanceSettings
  - If `apply_time_based_absence` is True:
    - Check if `morning_in > attendance_in_time_limit` OR `evening_out < attendance_out_time_limit`
    - If yes, mark as 'absent' instead of 'present'

**Suggested Code Addition**:
```python
def _check_time_based_absence(self, morning_in, evening_out):
    """Check if attendance should be marked absent based on time limits"""
    try:
        settings = AttendanceSettings.objects.first()
        if not settings or not settings.apply_time_based_absence:
            return False  # Don't apply time-based absence
        
        if morning_in and morning_in > settings.attendance_in_time_limit:
            return True  # Late arrival = absent
        
        if evening_out and evening_out < settings.attendance_out_time_limit:
            return True  # Early departure = absent
        
        return False
    except Exception:
        return False

def _auto_create_col_for_holiday(self, user, holiday_date):
    """Auto-create COL (Compensatory Leave) for staff who worked on holiday"""
    from staff_requests.models import RequestTemplate, StaffLeaveBalance
    
    try:
        # Find COL template
        col_template = RequestTemplate.objects.filter(
            name__icontains='Compensatory',
            is_active=True,
            leave_policy__action='earn'
        ).first()
        
        if not col_template:
            return False
        
        # Update COL balance directly
        balance, created = StaffLeaveBalance.objects.get_or_create(
            staff=user,
            leave_type=col_template.name,
            defaults={'balance': 0}
        )
        balance.balance += 1  # Add 1 COL day
        balance.save()
        
        return True
    except Exception as e:
        print(f"Failed to create COL: {e}")
        return False
```

#### 2. Form Visibility Logic
**File**: Create new endpoint in `backend/staff_requests/views.py` - `RequestTemplateViewSet`

**Requirements**:
- Staff can only apply **EARN** forms on holidays
- Staff can only apply **DEDUCT** forms on working days (not holidays)
- Cannot apply ANY form if date is marked 'absent' in AttendanceRecord

**Suggested Endpoint**:
```python
@action(detail=False, methods=['post'])
def filter_templates_for_date(self, request):
    """Filter available templates based on date and attendance status"""
    date_str = request.data.get('date')
    
    try:
        check_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except:
        return Response({'error': 'Invalid date format'}, status=400)
    
    # Check if date is holiday
    from staff_attendance.models import Holiday, AttendanceRecord
    is_holiday = Holiday.objects.filter(date=check_date).exists()
    
    # Check attendance status
    attendance = AttendanceRecord.objects.filter(
        user=request.user, 
        date=check_date
    ).first()
    
    # If date is absent, block all forms
    if attendance and attendance.status == 'absent':
        return Response({
            'templates': [],
            'message': 'Cannot apply forms for absent dates',
            'is_holiday': is_holiday,
            'is_absent': True
        })
    
    # Get all active templates
    templates = RequestTemplate.objects.filter(is_active=True)
    
    # Filter based on holiday status
    filtered = []
    for template in templates:
        action = template.leave_policy.get('action')
        
        if is_holiday and action == 'earn':
            filtered.append(template)  # Earn forms allowed on holidays
        elif not is_holiday and action in ['deduct', 'neutral']:
            filtered.append(template)  # Deduct/neutral forms allowed on working days
    
    return Response({
        'templates': RequestTemplateSerializer(filtered, many=True).data,
        'is_holiday': is_holiday,
        'is_absent': False
    })
```

#### 3. COL Claim Feature
**Requirements**:
- Staff can "claim" their earned COL on working days AFTER the COL was earned
- When claiming, they apply a special "deduct" form
- After approval, attendance is saved as 'Claim' status

**Implementation Approach**:
- Create new endpoint: `GET /api/staff-requests/claimable-col-dates/`
  - Returns list of dates where user has COL balance available
  - Only show dates AFTER the COL earn date
- Modify deduct form UI to show "Claim COL" option if COL balance > 0
- On approval, call `_sync_attendance()` with status='Claim'

#### 4. Frontend Holiday Management UI
**File**: `frontend/src/pages/PS/StaffAttendanceUpload.tsx`

**Add Sections**:
1. **Sunday Management** (above current holiday list):
   ```tsx
   // Section 1: Generate/Remove Sundays for Month
   <div>
     <select value={selectedMonth} onChange={...}>
       {months.map...}
     </select>
    <button onClick={generateSundays}>Generate Sundays</button>
     <button onClick={removeSundays}>Remove Sundays</button>
   </div>
   ```

2. **Time Settings** (new section):
   ```tsx
   // Section 2: Attendance Time Limits
   <div>
     <label>In Time Limit:</label>
     <input type="time" value={inTimeLimit} onChange={...} />
     
     <label>Out Time Limit:</label>
     <input type="time" value={outTimeLimit} onChange={...} />
     
     <label>
       <input type="checkbox" checked={applyTimeLimits} onChange={...} />
       Apply Time-Based Absence
     </label>
     
     <button onClick={saveSettings}>Save Settings</button>
   </div>
   ```

#### 5. Calendar Holiday Display
**File**: `frontend/src/pages/staff/MyCalendar.tsx`

**Requirements**:
- Fetch holidays from API: `GET /api/staff-attendance/holidays/`
- Display holiday names on calendar dates
- Show Sundays with special styling
- Check holiday status when opening NewRequestModal

**Code Addition**:
```tsx
// Add state
const [holidays, setHolidays] = useState<Holiday[]>([]);

// Fetch holidays
useEffect(() => {
  async function fetchHolidays() {
    const response = await apiClient.get(`${getApiBase()}/api/staff-attendance/holidays/`);
    setHolidays(response.data);
  }
  fetchHolidays();
}, [selectedYear, selectedMonth]);

// In calendar day rendering:
const dayHoliday = holidays.find(h => h.date === dateStr);
if (dayHoliday) {
  // Render holiday badge
}
```

---

## ⚠️ TECHNICAL CONSIDERATIONS:

1. **COL Auto-Creation**: Decide whether to:
   - Option A: Auto-create StaffRequest (requires approval workflow)
   - Option B: Directly credit COL balance (immediate, no approval)
   - **Recommendation**: Option B is simpler and matches your requirement

2. **Time-Based Absence**: Applies during CSV upload, NOT retroactively
   - Only affects future uploads
   - Does not change existing attendance records

3. **Sunday Generation**: Should be done monthly by PS
   - Not automatic - PS controls which Sundays are holidays
   - PS can remove Sundays if college operates on specific Sundays

---

## 📋 TESTING CHECKLIST:

- [ ] Generate Sundays for a month → verify holidays created
- [ ] Remove Sundays → verify holidays deleted
- [ ] Upload CSV with staff attendance on holiday → verify COL balance increases
- [ ] Upload CSV with late arrival (> 8:45 AM) → verify marked absent
- [ ] Try applying earn form on working day → should be blocked
- [ ] Try applying deduct form on holiday → should be blocked
- [ ] Try applying any form on absent date → should be blocked
- [ ] Claim COL on working day after earning it → verify attendance saved as 'Claim'

---

## 🔧 NEXT STEPS:

1. **Implement CSV Upload Enhancement** (Highest Priority)
   - Add `_check_time_based_absence()` method
   - Add `_auto_create_col_for_holiday()` method
   - Modify `upload()` to call these methods

2. **Create Form Filtering Endpoint**
   - Add `filter_templates_for_date` action to RequestTemplateViewSet

3. **Build Frontend UI Components**
   - Sunday generation/removal buttons
   - Time settings form
   - Holiday display on calendar

4. **Implement COL Claim Feature**
   - Claimable dates endpoint
   - Modified deduct form UI
   - 'Claim' status handling

---

## 💡 DESIGN DECISIONS MADE:

1. **Sundays not auto-generated on server startup** - PS has manual control
2. **Time limits configurable** - PS can change 8:45 AM / 5:45 PM defaults
3. **Holidays prevent ALL attendance processing** - except for COL creation when staff came
4. **COL is "earned" instantly** - no approval needed for holiday work (justified)
5. **Form blocking is client-side + server-side** - dual validation for security

---

For questions or clarification, refer to:
- `backend/staff_attendance/models.py` - Data models
- `backend/staff_attendance/views.py` - Hol​iday & Settings ViewSets
- `backend/staff_attendance/serializers.py` - API serializers
