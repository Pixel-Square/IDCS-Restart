# Announcement System Documentation

## Overview

The Announcement System allows HOD (Head of Department) and IQAC (Internal Quality Assurance Cell) users to create and send announcements to specific courses/classes. The system includes:

- **Backend API** for creating, managing, and tracking announcements
- **Frontend Components** for displaying announcements and creating new ones
- **Pop-up Notifications** for new announcements
- **Course Targeting** with checkboxes to select which classes receive announcements
- **Read/Unread Tracking** for announcements

## Architecture

### Backend Structure

Located in `/backend/announcements/`:

- **models.py**: Three main models:
  - `Announcement`: Main announcement model with title, content, source (HOD/IQAC), creation time
  - `AnnouncementCourse`: Through model for many-to-many relationship between announcements and courses
  - `AnnouncementRead`: Tracks which users have read which announcements

- **serializers.py**: REST API serializers for announcements
  - `AnnouncementListSerializer`: For listing announcements
  - `AnnouncementDetailSerializer`: For detailed view and creation
  - `AnnouncementReadSerializer`: For marking announcements as read

- **api_views.py**: ViewSet with the following endpoints:
  - `GET /api/announcements/announcements/` - List all announcements
  - `POST /api/announcements/announcements/` - Create new announcement (HOD/IQAC only)
  - `GET /api/announcements/announcements/{id}/` - Get announcement details
  - `POST /api/announcements/announcements/{id}/mark_as_read/` - Mark as read
  - `GET /api/announcements/announcements/available_courses/` - Get courses for selection (HOD/IQAC only)

### Frontend Components

Located in `/frontend/src/components/` and `/frontend/src/pages/announcements/`:

#### 1. **AnnouncementCreate.tsx**
Modal component for creating new announcements (HOD/IQAC only)
- Course selection with searchable checkboxes
- Title and content input
- Bulk selection/deselection of courses
- Success/error notifications

#### 2. **AnnouncementItem.tsx**
Display component for individual announcements
- Shows announcement title, content preview
- Source badge (HOD or IQAC)
- Creator name and timestamp
- Read/unread status with visual indicator
- Expandable content for full announcement view

#### 3. **AnnouncementsPage.tsx**
Main announcements page (`/announcements` route)
- List of all announcements
- Filter for unread announcements only
- Create button for HOD/IQAC users
- Empty states and loading states

#### 4. **DashboardEntryPoints.tsx** (Updated)
Added announcements widget to dashboard
- Shows 3 most recent announcements
- Unread count badge
- Link to full announcements page
- Visual indicators for unread items

## Setup Instructions

### Backend Setup

1. **Database Migration**
   ```bash
   cd backend
   python manage.py makemigrations announcements
   python manage.py migrate announcements
   ```

2. **Register in Django Admin** (already done)
   - The app is registered with admin customization in `admin.py`
   - You can manage announcements from Django admin

### Frontend Setup

1. **Routes** (already configured in App.tsx)
   - `/announcements` - Main announcements page
   - Accessible from dashboard widget

2. **Components are already imported and set up**

## Usage

### For HOD/IQAC Users

1. **Create Announcement**
   - Click "Create Announcement" button on announcements page
   - Fill in title and content
   - Select target courses using checkboxes
   - Search functionality to filter courses
   - Click "Send Announcement"

2. **View Announcements**
   - All created announcements are visible in the announcements list
   - Status shows as published

### For All Users

1. **View Announcements**
   - Dashboard shows recent announcements widget
   - Click "View All" to see full announcements page
   - Unread announcements show with blue background and notification dot

2. **Mark as Read**
   - Click on announcement to mark as read
   - Or automatic marking on view
   - Unread count badge shows on dashboard

## API Endpoints

### Public Endpoints (Authenticated Users)

**List Announcements**
```
GET /api/announcements/announcements/
```
Returns announcements for user's enrolled courses

**Retrieve Announcement**
```
GET /api/announcements/announcements/{id}/
```
Get full details of specific announcement

**Mark as Read**
```
POST /api/announcements/announcements/{id}/mark_as_read/
```
Mark announcement as read by current user

**Mark as Unread**
```
POST /api/announcements/announcements/{id}/mark_as_unread/
```
Mark announcement as unread by current user

**Get User's Courses**
```
GET /api/announcements/announcements/my_courses/
```
Get courses user is enrolled in

### Protected Endpoints (HOD/IQAC Only)

**Create Announcement**
```
POST /api/announcements/announcements/
Content-Type: application/json

{
  "title": "Important Update",
  "content": "This is about...",
  "course_ids": [1, 2, 3],
  "is_published": true
}
```

**Available Courses**
```
GET /api/announcements/announcements/available_courses/
```
Get all courses available for targeting (HOD/IQAC only)

**Update Announcement**
```
PATCH /api/announcements/announcements/{id}/
```
Update existing announcement (creator only)

**Delete Announcement**
```
DELETE /api/announcements/announcements/{id}/
```
Delete announcement (creator only)

## Data Models

### Announcement Model
```python
{
  "id": "uuid",
  "title": "string",
  "content": "string",
  "source": "hod" | "iqac",
  "created_by": user_id,
  "created_at": datetime,
  "updated_at": datetime,
  "is_published": boolean,
  "published_at": datetime,
  "scheduled_for": datetime (optional),
  "courses": []
}
```

### Response Format (List)
```json
{
  "id": "uuid",
  "title": "Announcement Title",
  "source": "hod",
  "created_by_name": "Dr. Smith",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "is_published": true,
  "course_count": 3,
  "is_read": false
}
```

### Response Format (Detail)
```json
{
  "id": "uuid",
  "title": "Announcement Title",
  "content": "Full announcement content...",
  "source": "hod",
  "created_by": 123,
  "created_by_name": "Dr. Smith",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "is_published": true,
  "published_at": "2024-01-15T10:30:00Z",
  "courses": [
    {
      "id": 1,
      "code": "CS101",
      "title": "Introduction to Programming"
    }
  ],
  "is_read": false,
  "read_count": 15
}
```

## Features

### ✅ Implemented

- [x] Create announcements (HOD/IQAC only)
- [x] Target specific courses with checkboxes
- [x] Searchable course list
- [x] Read/unread tracking
- [x] Dashboard widget with recent announcements
- [x] Announcement detail view with expansion
- [x] Source badge (HOD/IQAC)
- [x] Time ago formatting
- [x] Empty states and loading states
- [x] Error handling and user feedback

### 🔄 Future Enhancements

- [ ] Scheduled announcements (publish later)
- [ ] Announcement templates
- [ ] Email notifications for new announcements
- [ ] SMS/WhatsApp notifications via n8n
- [ ] Announcement attachments
- [ ] Announcement categories/tags
- [ ] View read receipts/analytics
- [ ] Announcement search/filter
- [ ] Announcement expiration/archiving

## Permissions

### Role-Based Access

| Action | Student | Staff | HOD | IQAC | Admin |
|--------|---------|-------|-----|------|-------|
| View Announcements | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mark as Read | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Announcement | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit Own Announcement | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete Own Announcement | ❌ | ❌ | ✅ | ✅ | ✅ |
| View All Announcements | ❌ | ❌ | Own | Own | ✅ |

**Note**: Users only see announcements sent to their enrolled courses and global announcements.

## File Structure

```
backend/announcements/
├── __init__.py
├── admin.py
├── apps.py
├── migrations/
│   └── __init__.py
├── models.py
├── serializers.py
├── api_urls.py
└── api_views.py

frontend/src/
├── components/
│   ├── AnnouncementCreate.tsx
│   └── AnnouncementItem.tsx
├── pages/
│   └── announcements/
│       └── AnnouncementsPage.tsx
└── App.tsx (updated with route)
```

## Testing

### Test Create Announcement
```bash
# As HOD/IQAC user
POST /api/announcements/announcements/
{
  "title": "Test Announcement",
  "content": "This is a test",
  "course_ids": [1, 2],
  "is_published": true
}
```

### Test View Announcements
```bash
# As any authenticated user
GET /api/announcements/announcements/
```

### Test Mark as Read
```bash
# As any authenticated user
POST /api/announcements/announcements/{announcement_id}/mark_as_read/
```

## Troubleshooting

### Announcements not appearing
1. Check if course is selected during creation
2. Verify user is enrolled in the selected courses
3. Check if announcement is published (`is_published: true`)

### Create button not showing
1. Verify user has HOD or IQAC role
2. Check `user.roles` contains correct role name
3. Check user has proper designated in staff profile

### Permissions error when creating
1. User must have HOD or IQAC role
2. User must be authenticated
3. Check role permissions in database

## Support & Questions

For issues or questions about the announcement system:
1. Check this documentation
2. Review backend API response errors
3. Check Django logs for backend errors
4. Check browser console for frontend errors
