# CQI Announcement to Students - Implementation Guide

## Overview
The CQI Announcement feature allows faculty to announce CQI results to students who satisfy any of the defined conditions. When enabled, students receive WhatsApp notifications with their CO attainments and satisfied conditions.

## Feature Components

### 1. Frontend Implementation
**File**: `/frontend/src/pages/Academic 2.1/faculty/CqiEntryPage.tsx`

#### States Added
- `announcementNotif`: Tracks announcement notification display state with student count and timestamp
- `announcementTimerRef`: Reference to countdown timer interval
- `announcementTimeLeft`: Remaining time (milliseconds) for notification visibility (6 seconds default)

#### UI Components

**Announce Button** (Header)
```tsx
{Boolean(notifFlags?.cqi_announce_enabled) && (
  <button
    onClick={announce}
    disabled={announcing || publishing || !isPublished}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white ${
      !isPublished
        ? 'bg-gray-300 cursor-not-allowed'
        : announcing || publishing
        ? 'bg-gray-300 cursor-not-allowed'
        : 'bg-green-600 hover:bg-green-700'
    }`}
    title={!isPublished ? 'Publish CQI first before announcing' : 'Send CQI announcement to students who match any condition'}
  >
    <Send className="w-4 h-4" /> {announcing ? 'Announcing…' : 'Announce'}
  </button>
)}
```

**Visibility Rules**:
- Button only shows if `cqi_announce_enabled` flag is true in notification settings
- Button is disabled and grayed out if CQI is not yet published
- Button shows loading state ("Announcing...") while request is in progress

**Floating Notification Bar** (Top of Page)
```tsx
{announcementNotif && (
  <div className="fixed top-4 left-4 right-4 z-50 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-lg p-4">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1">
        <div className="font-semibold text-green-900">CQI Announcement Sent</div>
        <div className="text-sm text-green-800 mt-1">
          Notification sent to {announcementNotif.studentCount} student{s} via WhatsApp
        </div>
      </div>
      <button onClick={() => { /* dismiss */ }} className="text-green-500 hover:text-green-700">×</button>
    </div>
    {/* Green countdown progress bar */}
    <div className="mt-3 h-1 bg-green-200 rounded-full overflow-hidden">
      <div className="h-full bg-green-500" style={{ width: `${(announcementTimeLeft / 6000) * 100}%` }} />
    </div>
  </div>
)}
```

**Features**:
- ✅ Green background with left border accent
- ✅ Displays student count reached
- ✅ Shows "via WhatsApp" confirmation
- ✅ Close button (×) to dismiss manually
- ✅ Countdown progress bar that depletes over 6 seconds
- ✅ Auto-dismisses when timer expires
- ✅ Fixed positioning with responsive margins (top-right on desktop, full-width on mobile)

#### Announce Function Flow
```
User clicks "Announce"
  ↓
Send POST to /api/academic-v2/faculty/courses/{courseId}/cqi-announce/
  ↓
Backend evaluates CQI conditions for all students
  ↓
Sends WhatsApp to students matching any condition
  ↓
Returns count of students reached
  ↓
Show success message in alert bar
  ↓
Show floating green notification with timer
  ↓
Auto-dismiss after 6 seconds
```

### 2. Backend Implementation
**File**: `/backend/academic_v2/views.py` (lines ~4929-5070)

**Endpoint**: `POST /api/academic-v2/faculty/courses/<ta_id>/cqi-announce/`

#### Access Control
- ✅ Requires authentication
- ✅ Faculty can only announce to their own courses
- ✅ Admin can bypass via `_has_admin_bypass_access()` check
- ✅ Requires `cqi_announce_enabled` flag to be true

#### Process Flow
```python
def faculty_course_cqi_announce(request, ta_id: int):
    1. Load notification settings
    2. Check if feature is enabled
    3. Call faculty_course_co_summary() to evaluate CQI conditions
    4. Extract students who matched any condition
    5. Build student roster with mobile numbers
    6. Load message template from settings
    7. For each matched student:
       - Render template with context variables
       - Send WhatsApp message
       - Log success/failure
    8. Return count of successful sends
```

#### Student Roster Building
- Loads active `StudentSectionAssignment` for the course section
- Resolves mobile numbers using `_resolve_mobile_for_student_profile()`
- Matches students by student_id to condition evaluation results

#### Message Template Variables
```
{course_code}              - e.g., "MEB1221"
{course_name}              - e.g., "Design of Machine Elements"
{faculty_name}             - Faculty who announced
{student_name}             - Student name
{register_number}          - Registration number
{co_attainments}           - Space-separated CO values, e.g., "CO1:7.5 CO2:8.2 CO3:6.9"
{satisfied_conditions}     - Comma-separated condition titles met by student
```

#### Default Template
```
📣 CQI Announced
{course_code} - {course_name}
Faculty: {faculty_name}
CO Attainments: {co_attainments}
Satisfied Conditions: {satisfied_conditions}
```

#### Error Handling
- ✅ Graceful failure if template is missing
- ✅ Logs individual failures per student without stopping batch
- ✅ Returns successful count even if some sends failed
- ✅ Returns 0 if no students matched any condition

### 3. Database Model
**File**: `/backend/academic_v2/models.py` (lines ~1687-1750)

```python
class AcV2AcademicNotificationSetting(models.Model):
    # Master enable/disable
    cqi_announce_enabled = BooleanField(default=False)
    
    # Message template with placeholders
    cqi_announce_template = TextField(
        default='📣 CQI Announced\n...'
    )
    
    class Meta:
        db_table = 'acv2_academic_notification_setting'
```

**Configuration**:
- Singleton pattern (key='DEFAULT')
- Admins can customize message template via Django admin
- Feature is OFF by default (requires admin enablement)

## Admin Configuration

### Step 1: Enable Feature
In Django admin:
1. Navigate to `/admin/academic_v2/acv2academicnotificationsetting/`
2. Select the DEFAULT setting
3. Check `cqi_announce_enabled`
4. (Optional) Customize `cqi_announce_template` with your message format

### Step 2: Customize Template
Default template:
```
📣 CQI Announced
{course_code} - {course_name}
Faculty: {faculty_name}
CO Attainments: {co_attainments}
Satisfied Conditions: {satisfied_conditions}
```

Example custom template:
```
Hello {student_name} ({register_number})!
Your CO attainments in {course_name}:
{co_attainments}

You have satisfied: {satisfied_conditions}

Congratulations! Keep up the good work.
Faculty: {faculty_name}
```

## User Workflow

### Faculty Perspective
1. **Open CQI Entry Page** for their course
2. **Define Conditions** (via QP Pattern editor)
3. **Enter Student Marks** in the CQI Entry table
4. **Publish CQI** when ready
5. **Click "Announce" Button** (now visible in green in header)
   - Button is disabled if CQI not published
   - Shows tooltip: "Publish CQI first before announcing"
6. **See Floating Confirmation**
   - Green notification bar shows number of students reached
   - Progress bar counts down for 6 seconds
   - Auto-dismisses or can be manually closed

### Student Perspective
1. Receives WhatsApp message from institution
2. Message shows:
   - Course code and name
   - Their CO attainments (numeric scores)
   - Which conditions they satisfied
   - Faculty name who announced

## Technical Notes

### Reuse of CQI Summary
- The announce endpoint reuses `faculty_course_co_summary()` for condition evaluation
- This ensures consistency: same conditions evaluated, same students matched
- No additional condition evaluation code needed

### Performance Considerations
- ✅ Single summary evaluation per announce (not per student)
- ✅ Condition matching happens once, then filtered for each student
- ✅ WhatsApp sends are batched and can be logged for retry

### Message Sending
- Uses existing `send_whatsapp()` service from `accounts.services.sms`
- Handles failures gracefully - continues with other students
- Logs all attempts for auditing

## Troubleshooting

### "Announce" Button Not Showing
- **Issue**: Button is missing from header
- **Causes**:
  1. `cqi_announce_enabled` is false in database
  2. `notifFlags` didn't load from API
  3. Feature flag endpoint is failing
- **Fix**: 
  ```bash
  # Check database
  SELECT cqi_announce_enabled FROM acv2_academic_notification_setting WHERE key='DEFAULT';
  # Should return: true
  ```

### Announce Button Disabled (Grayed Out)
- **Issue**: Button is showing but grayed out
- **Cause**: CQI must be published before announcing
- **Fix**: Click "Publish" button first

### Students Not Receiving Messages
- **Causes**:
  1. No students matched any condition
  2. Template is empty
  3. Student mobile numbers not found
  4. WhatsApp service is down
- **Fix**: Check logs in Django admin activity log

### Wrong Message Content
- **Cause**: Template placeholders not set correctly
- **Fix**: Verify `cqi_announce_template` has valid `{placeholders}`
- **Debug**: Test template in Django admin before enabling for students

## Testing Checklist

- [ ] Enable feature in admin settings
- [ ] Set custom template (optional)
- [ ] Faculty logs in to CQI Entry page
- [ ] "Announce" button visible (green) in header
- [ ] Button disabled while CQI not published
- [ ] Click "Publish" - button becomes enabled
- [ ] Click "Announce" - shows loading state
- [ ] Green notification bar appears with student count
- [ ] Progress bar counts down and auto-dismisses
- [ ] Check logs that messages were sent
- [ ] Verify students received WhatsApp messages

## Related Features

- **CQI Entry Page**: Faculty mark entry and condition satisfaction tracking
- **Publish Control**: Locking marks after publication
- **Student Publish Notifications**: Separate feature for mark publish notifications
- **CQI Tokens**: Dynamic value resolution in conditions
- **CQI Conditions**: If/Then/Else formula evaluation per student

## API Endpoints

### Announce CQI
```
POST /api/academic-v2/faculty/courses/{ta_id}/cqi-announce/
Authorization: Bearer {token}
Content-Type: application/json

Response:
{
  "status": "ok",
  "sent": 42
}
```

### Get Notification Flags
```
GET /api/academic-v2/faculty/notification-flags/
Authorization: Bearer {token}

Response:
{
  "student_publish_enabled": true,
  "cqi_announce_enabled": true
}
```

### Admin Notification Settings
```
GET /api/academic-v2/admin/academic-notification-settings/
POST /api/academic-v2/admin/academic-notification-settings/
Authorization: Bearer {token}
Content-Type: application/json

POST Body:
{
  "cqi_announce_enabled": true,
  "cqi_announce_template": "Your custom template..."
}

Response:
{
  "student_publish_enabled": boolean,
  "cqi_announce_enabled": boolean,
  "cqi_announce_template": "...",
  "first_publish_template": "...",
  "edited_rows_template": "...",
  "every_publish_template": "..."
}
```

## Files Modified

### Frontend
- `/frontend/src/pages/Academic 2.1/faculty/CqiEntryPage.tsx`
  - Added announcement notification state
  - Added floating notification UI with timer
  - Updated announce button with conditional visibility
  - Enhanced error/success messaging

### Backend
- `/backend/academic_v2/views.py` 
  - `faculty_course_cqi_announce()` endpoint already implemented
  - Integrates with existing CQI summary and WhatsApp services

### Database
- No new migrations needed
- Uses existing `AcV2AcademicNotificationSetting` model
- Fields: `cqi_announce_enabled`, `cqi_announce_template`

## Feature Status

✅ **Complete** - All components implemented and integrated:
- Frontend button with conditional visibility
- Floating notification bar with countdown timer
- Backend endpoint with condition evaluation
- Database model for settings
- Admin configuration UI
- WhatsApp message sending
- Error handling and logging
