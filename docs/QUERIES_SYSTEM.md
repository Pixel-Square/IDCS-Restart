# User Queries System - Setup Guide

## Overview
The User Queries system allows all users to submit queries, doubts, errors, and bug reports. Users with the `queries.manage` permission can view and manage all queries from all users.

## Features

### For All Users (Query Submission)
- Submit queries/doubts/errors/bug reports via text input
- View their own submitted queries
- Track status of their queries (SENT, VIEWED, REVIEWED, PENDING, IN_PROGRESS, FIXED, LATER, CLOSED)
- See relative timestamps (e.g., "2 hours ago")

### For Administrators (Query Management)
Users with `queries.manage` permission can:
- View ALL queries from ALL users
- Filter queries by status
- Update query status (8 different states)
- Add internal admin notes to queries
- See query statistics and counts
- Quick edit functionality with inline forms

## Permission Setup

### 1. Permission Already Created
The permission `queries.manage` was automatically created with the description:
"Can manage all user queries and support tickets"

### 2. Assign Permission to Roles

#### Via Django Admin Panel:
1. Go to Django Admin → Accounts → Role permissions
2. Click "Add Role Permission"
3. Select the role (e.g., ADMIN, IQAC)
4. Select permission: `queries.manage`
5. Click Save

#### Via Django Shell:
```python
from accounts.models import Role, Permission, RolePermission

# Get the permission
perm = Permission.objects.get(code='queries.manage')

# Assign to ADMIN role
admin_role = Role.objects.get(name='ADMIN')
RolePermission.objects.get_or_create(role=admin_role, permission=perm)

# Assign to IQAC role (optional)
iqac_role = Role.objects.get(name='IQAC')
RolePermission.objects.get_or_create(role=iqac_role, permission=perm)
```

## API Endpoints

### User Endpoints (All authenticated users)
- `GET /api/accounts/queries/` - List current user's queries
- `POST /api/accounts/queries/` - Submit new query
- `GET /api/accounts/queries/<id>/` - Get specific query detail

### Admin Endpoints (Requires `queries.manage` permission)
- `GET /api/accounts/queries/all/` - List all queries (with optional status filter)
- `PATCH /api/accounts/queries/<id>/update/` - Update query status and admin notes

## Frontend Components

### User Component
- Location: `frontend/src/components/UserQueriesComponent.tsx`
- Shows user's own queries
- Submit new queries
- Available to all authenticated users

### Receiver/Admin Component
- Location: `frontend/src/components/QueriesReceiverComponent.tsx`
- Shows all user queries
- Status management and filtering
- Only visible to users with `queries.manage` permission

### Pages
- `/queries` - Main queries page with tabs (if user has permission)
- `/dashboard` - Dashboard includes user queries section at bottom

### Sidebar Navigation
- "Support Queries" menu item visible to all users

## Status Flow
Queries can have the following statuses:

1. **SENT** (Initial) - Query just submitted
2. **VIEWED** - Query has been seen by admin
3. **REVIEWED** - Query has been reviewed
4. **PENDING** - Query is pending action
5. **IN_PROGRESS** - Currently being worked on
6. **FIXED** - Issue has been resolved
7. **LATER** - Will be addressed later
8. **CLOSED** - Query is closed

## Usage Examples

### For Regular Users
1. Navigate to Dashboard or `/queries`
2. Click "New Query" button
3. Type your query, doubt, error, or bug report
4. Click "Submit Query"
5. View your submitted queries with current status

### For Administrators
1. Navigate to `/queries`
2. Click "All Queries (Admin)" tab
3. Filter by status if needed
4. Click edit icon on any query
5. Update status and add admin notes
6. Click "Save"

## Database Model

```python
class UserQuery(models.Model):
    user = ForeignKey(User)
    query_text = TextField()
    status = CharField(choices=STATUS_CHOICES)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
    admin_notes = TextField(blank=True)
```

## Color Coding

Each status has a distinct color scheme:
- SENT: Blue
- VIEWED: Indigo
- REVIEWED: Purple
- PENDING: Yellow
- IN_PROGRESS: Orange
- FIXED: Green
- LATER: Gray
- CLOSED: Slate

## Notes

- All users can submit queries without any special permissions
- Only users with `queries.manage` permission can view and manage all queries
- Admin notes are internal and not visible to the query submitter
- The system uses optimistic UI updates for better user experience
- Queries are ordered by creation date (newest first)
