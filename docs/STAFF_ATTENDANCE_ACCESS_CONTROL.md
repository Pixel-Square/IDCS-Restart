# Staff Attendance Verification & Period Attendance Access Control

## Overview
This implementation adds a comprehensive system to prevent absent staff from marking period attendance without proper authorization. The system requires HOD/AHOD approval for absent staff to gain access to period attendance marking.

## Features Implemented

### 1. **Backend Enhancements**

#### Staff Attendance Verification API
- **Endpoint**: `/api/staff-attendance/halfday-requests/check_period_attendance_access/?date=YYYY-MM-DD`
- Checks if staff can mark period attendance for a given date
- Returns attendance status, reason, and any pending half-day requests

#### HalfDayRequest System
- **Model**: `HalfDayRequest` in `staff_attendance/models.py`
- Allows absent staff to request temporary access to mark period attendance
- Supports three statuses: `pending`, `approved`, `rejected`

#### HOD/AHOD Approval System
- **Endpoints**:
  - `POST /api/staff-attendance/halfday-requests/` - Submit a half-day request
  - `GET /api/staff-attendance/halfday-requests/pending_for_review/` - Get pending requests for HOD/AHOD
  - `POST /api/staff-attendance/halfday-requests/{id}/review_request/` - Approve/reject requests

#### AHOD Approval Logic
- AHOD can approve requests **only when HOD is absent**
- System checks HOD's attendance record for the request date
- If HOD is absent or no HOD is assigned, AHOD can approve
- This ensures proper delegation when HOD is unavailable

### 2. **Frontend Components**

#### PeriodAttendance Page Enhancements
**File**: `frontend/src/pages/staff/PeriodAttendance.tsx`

- **Attendance Lock Banner**: Shows when staff is marked absent
  - Displays reason for lock
  - Shows pending request status if one exists
  - Provides "Request Half-Day Access" button when no pending request
  
- **Request Modal**: Clean UI for submitting half-day requests
  - Requires reason for request
  - Shows status after submission

- **Disabled UI**: All attendance marking controls are disabled when staff is absent and doesn't have approved access

#### HalfDayRequestsApproval Component
**File**: `frontend/src/pages/staff/HalfDayRequestsApproval.tsx`

New component for HOD/AHOD to review half-day requests:
- Lists all pending requests from their department
- Shows staff details, department, absent date, and request reason
- Allows adding review notes
- Approve/Reject buttons with confirmation
- Shows request status (pending/approved/rejected)

#### AttendanceAnalytics Integration
**File**: `frontend/src/pages/staff/AttendanceAnalytics.tsx`

- Updated approval modal title to "HOD/AHOD Approval Dashboard"
- Integrated `HalfDayRequestsApproval` component
- Shows both half-day requests and session unlock requests in one place

## User Workflows

### For Staff (Marked Absent)

1. **Check Status**
   - Staff opens Period Attendance page
   - If marked absent, sees red banner: "Period Attendance Locked"
   - Cannot mark any period attendance

2. **Request Access**
   - Click "Request Half-Day Access" button
   - Enter reason for request
   - Submit to HOD/AHOD for approval

3. **Track Status**
   - Pending request shown in yellow banner with timestamp
   - Once approved, can mark period attendance
   - If rejected, must contact HOD directly

### For HOD/AHOD

1. **Access Approval Dashboard**
   - Navigate to Attendance Analytics page
   - Click "HOD Approval Requests" button
   - See modal with two sections:
     - Half-Day Attendance Requests (top)
     - Session Unlock Requests (bottom)

2. **Review Half-Day Requests**
   - View staff details, department, absent date
   - Read request reason
   - Click "Review Request"
   - Add optional review notes
   - Approve or Reject

3. **AHOD Special Access**
   - AHOD can only approve when HOD is absent
   - System automatically checks HOD attendance
   - Shows error if HOD is present

## Technical Details

### Database Schema
```python
class HalfDayRequest(models.Model):
    staff_user = ForeignKey(User)
    attendance_record = ForeignKey(AttendanceRecord)
    requested_at = DateTimeField(auto_now_add=True)
    reason = TextField()
    status = CharField(choices=['pending', 'approved', 'rejected'])
    reviewed_by = ForeignKey(User, null=True)
    reviewed_at = DateTimeField(null=True)
    review_notes = TextField(blank=True)
```

### Authorization Logic
```python
# Check permissions
1. Get staff's department
2. Get DepartmentRole for HOD/AHOD
3. If AHOD:
   - Check if HOD exists
   - Check if HOD is absent on request date
   - Only allow if HOD is absent
4. If HOD:
   - Always allow
```

### API Responses

**Check Access Response**:
```json
{
  "can_mark_attendance": false,
  "reason": "Staff is absent without approved half-day request",
  "attendance_record": {
    "id": 123,
    "date": "2026-03-05",
    "status": "absent",
    "morning_in": null,
    "evening_out": null
  },
  "pending_request": {
    "id": 45,
    "requested_at": "2026-03-05T10:30:00Z",
    "status": "pending",
    "reason": "Had to leave early for medical appointment"
  }
}
```

**Pending Requests Response**:
```json
[
  {
    "id": 45,
    "staff_name": "john.doe",
    "staff_full_name": "John Doe",
    "staff_id": "EMP001",
    "department": {
      "id": 1,
      "name": "Computer Science",
      "code": "CSE"
    },
    "attendance_date": "2026-03-05",
    "requested_at": "2026-03-05T10:30:00Z",
    "reason": "Had medical appointment",
    "status": "pending",
    "reviewed_by_name": null,
    "reviewed_at": null,
    "review_notes": ""
  }
]
```

## Security Considerations

1. **Authorization Checks**: All endpoints verify user has proper role (HOD/AHOD)
2. **Department Validation**: Users can only see/approve requests from their department
3. **AHOD Restrictions**: AHOD approval only when HOD is absent
4. **Attendance Record Validation**: Ensures request is for staff's own attendance and status is "absent"
5. **UI Enforcement**: Frontend disables controls, but backend enforces all rules

## Testing Checklist

- [ ] Staff marked absent cannot mark period attendance
- [ ] Staff can submit half-day request with reason
- [ ] HOD can see pending requests from their department
- [ ] AHOD can approve when HOD is absent
- [ ] AHOD cannot approve when HOD is present
- [ ] Approved staff can mark period attendance
- [ ] Rejected staff still cannot mark attendance
- [ ] Request status shows correctly in UI
- [ ] Multiple departments handled correctly
- [ ] Notifications/alerts work properly

## Future Enhancements

1. **Email Notifications**: Send emails on request submission/approval/rejection
2. **Request History**: Show all past requests with filters
3. **Bulk Approval**: Allow HOD to approve multiple requests at once
4. **Auto-Expiry**: Auto-reject old pending requests after N days
5. **Reporting**: Generate reports on half-day request patterns
6. **Mobile Optimization**: Better mobile UI for approval workflow

## Files Modified

### Backend
- `backend/staff_attendance/views.py` - Added HOD/AHOD approval logic
- `backend/staff_attendance/serializers.py` - Enhanced serializers with department info
- `backend/staff_attendance/models.py` - HalfDayRequest model (already existed)

### Frontend
- `frontend/src/pages/staff/PeriodAttendance.tsx` - Added lock UI and request modal
- `frontend/src/pages/staff/AttendanceAnalytics.tsx` - Integrated approval component
- `frontend/src/pages/staff/AttendanceRequests.tsx` - Minor styling updates
- `frontend/src/pages/staff/HalfDayRequestsApproval.tsx` - **New component**

## Configuration

No additional configuration required. The system uses existing:
- DepartmentRole model for HOD/AHOD identification
- AttendanceRecord for staff attendance status
- Academic year detection for current year roles

---

**Implementation Date**: March 5, 2026
**Status**: ✅ Complete and Ready for Testing
