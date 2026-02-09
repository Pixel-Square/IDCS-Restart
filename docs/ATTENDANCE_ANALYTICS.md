# Attendance Analytics Documentation

## Overview
The Attendance Analytics feature provides comprehensive attendance reporting with three permission levels:
1. **All Departments** - View analytics for all departments, classes, and students
2. **Own Department** - View analytics for own department's classes and students
3. **Own Class** - View analytics for own class students only

## Permissions

### Analytics Permissions
- `analytics.view_all_analytics` - Can view all departments, classes, and students
- `analytics.view_department_analytics` - Can view own department only
- `analytics.view_class_analytics` - Can view own class only

These permissions are created automatically during migration `0033_add_analytics_permissions`.

## API Endpoints

### Get Analytics Data
**Endpoint:** `GET /api/academics/analytics/attendance/`

**Query Parameters:**
- `view_type` - Type of analytics view (overview/department/class/student)
- `start_date` - Start date in ISO format (YYYY-MM-DD)
- `end_date` - End date in ISO format (YYYY-MM-DD)
- `department_id` - Filter by department (only for 'all' permission)
- `section_id` - Filter by section (for 'all' and 'department' permissions)

**Response:**
```json
{
  "permission_level": "all|department|class",
  "date_range": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  },
  "data": {
    // View-specific data
  }
}
```

#### View Type: overview
Returns summary statistics and daily trend:
```json
{
  "summary": {
    "total_sessions": 150,
    "total_records": 3000,
    "present_count": 2700,
    "absent_count": 300,
    "attendance_rate": 90.0
  },
  "status_breakdown": [
    {"status": "P", "count": 2700},
    {"status": "A", "count": 300}
  ],
  "daily_trend": [
    {
      "day": "2026-01-15",
      "total": 100,
      "present": 90,
      "absent": 10
    }
  ]
}
```

#### View Type: department
Returns department-wise statistics:
```json
{
  "departments": [
    {
      "department_id": 1,
      "department_name": "Computer Science",
      "department_short": "CSE",
      "total_records": 1000,
      "present": 900,
      "absent": 100,
      "leave": 0,
      "on_duty": 0,
      "attendance_rate": 90.0
    }
  ]
}
```

#### View Type: class
Returns class/section-wise statistics:
```json
{
  "classes": [
    {
      "section_id": 1,
      "section_name": "A",
      "course_name": "B.Tech Computer Science",
      "department": "CSE",
      "total_records": 300,
      "present": 270,
      "absent": 30,
      "leave": 0,
      "on_duty": 0,
      "attendance_rate": 90.0
    }
  ]
}
```

#### View Type: student
Returns student-wise statistics:
```json
{
  "students": [
    {
      "student_id": 1,
      "reg_no": "CS2021001",
      "name": "John Doe",
      "section": "A",
      "total_records": 50,
      "present": 45,
      "absent": 5,
      "leave": 0,
      "on_duty": 0,
      "late": 0,
      "attendance_rate": 90.0
    }
  ]
}
```

### Get Available Filters
**Endpoint:** `GET /api/academics/analytics/filters/`

**Response:**
```json
{
  "permission_level": "all|department|class",
  "departments": [
    {
      "id": 1,
      "name": "Computer Science and Engineering",
      "short_name": "CSE"
    }
  ],
  "sections": [
    {
      "id": 1,
      "name": "A",
      "course__name": "B.Tech Computer Science",
      "course__department__id": 1,
      "course__department__short_name": "CSE"
    }
  ]
}
```

## Permission-Based Access Control

### All Departments Permission
Users with `analytics.view_all_analytics` permission can:
- View all departments in the system
- View all classes/sections
- View all students
- Filter by any department or section
- Compare data across departments

### Own Department Permission
Users with `analytics.view_department_analytics` permission can:
- View only their assigned departments
- View all classes within their departments
- View all students in their department classes
- Filter by sections within their departments
- Assignment is determined by:
  - DepartmentRole (HOD, etc.)
  - TeachingAssignment sections

### Own Class Permission
Users with `analytics.view_class_analytics` permission can:
- View only their assigned classes (as advisor)
- View only students in their classes
- Cannot filter by department or section (auto-filtered)
- Assignment is determined by SectionAdvisor relationship

## Frontend Usage

### Route
`/staff/analytics` - Protected route requiring one of the three analytics permissions

### Components
- **AttendanceAnalytics.tsx** - Main analytics page

### Features
1. **Permission-based filters** - Shows only allowed filters based on user permission
2. **Date range selection** - Default last 30 days
3. **View type tabs** - Overview, Department, Class, Student
4. **Export to CSV** - Download analytics data
5. **Visual indicators**:
   - Green: ≥85% attendance
   - Yellow: 75-85% attendance
   - Red: <75% attendance

### Navigation
Analytics link appears in the sidebar for users with any of the three analytics permissions.

## Backend Implementation

### Files
- `backend/academics/analytics_views.py` - Main analytics views
- `backend/academics/urls.py` - URL routing
- `backend/academics/migrations/0033_add_analytics_permissions.py` - Permission creation

### Key Functions
- `AttendanceAnalyticsView.get()` - Main analytics endpoint
- `_get_overview_stats()` - Summary and trend data
- `_get_department_stats()` - Department-wise breakdown
- `_get_class_stats()` - Class-wise breakdown
- `_get_student_stats()` - Student-wise breakdown
- `AnalyticsFiltersView.get()` - Available filters based on permissions

### Database Queries
All queries use Django ORM with:
- Efficient joins (select_related, prefetch_related)
- Aggregation (Count, Avg)
- Conditional aggregation with Q objects
- Date range filtering
- Permission-based queryset filtering

## Granting Permissions

### Via Django Admin
1. Go to Admin Panel → Accounts → Permissions
2. Find the analytics permissions
3. Go to Accounts → Roles
4. Add the permission to appropriate roles (HOD, ADVISOR, PRINCIPAL, etc.)

### Via Code
```python
from accounts.models import Permission, Role, RolePermission

# Get the permission
perm = Permission.objects.get(code='analytics.view_all_analytics')

# Get the role (e.g., HOD)
role = Role.objects.get(name='HOD')

# Assign permission to role
RolePermission.objects.get_or_create(role=role, permission=perm)
```

## Usage Examples

### HOD (Own Department Access)
- Grant permission: `analytics.view_department_analytics`
- Can view all classes in their department
- Can compare sections within department
- Cannot see other departments

### Advisor (Own Class Access)
- Grant permission: `analytics.view_class_analytics`
- Can view only their assigned section(s)
- Can see all students in their section
- Cannot compare with other sections

### Principal/Admin (All Access)
- Grant permission: `analytics.view_all_analytics`
- Can view entire institution data
- Can filter and compare any department/class
- Full access to all analytics

## Best Practices

1. **Assign minimum required permission** - Give class-level access to advisors, department to HODs, all to administrators
2. **Regular reviews** - Monitor attendance trends weekly
3. **Set benchmarks** - Define minimum attendance thresholds (e.g., 85%)
4. **Early intervention** - Use student-level analytics to identify at-risk students
5. **Export regularly** - Download CSV reports for recordkeeping

## Troubleshooting

### Users can't see analytics
- Check if user has one of the three permissions assigned via their role
- Verify the user's profile type is STAFF
- Check DepartmentRole or SectionAdvisor assignments

### No data showing
- Verify date range has attendance records
- Check if PeriodAttendanceSession records exist for the period
- Ensure PeriodAttendanceRecord entries are created when marking attendance

### Wrong departments/sections showing
- Verify DepartmentRole assignments for department-level access
- Check SectionAdvisor assignments for class-level access
- Ensure TeachingAssignment records are active and correct
