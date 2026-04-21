# Academic Calendar Admin - Quick Start Guide

## What's Been Created

I've created a comprehensive Academic Calendar Admin interface for uploading and managing academic year calendars from Excel files.

### Files Created/Modified:

1. **New Component**: `/frontend/src/pages/academicCalendar/AcademicCalendarAdmin.tsx`
   - Full-featured admin page for calendar management

2. **Routing**: `/frontend/src/App.tsx`
   - Added route: `/iqac/calendar/admin` (IQAC role required)

3. **Navigation**: `/frontend/src/components/layout/DashboardSidebar.tsx`
   - Added "Calendar Admin" link in IQAC sidebar

4. **Documentation**: `/docs/ACADEMIC_CALENDAR_ADMIN.md`
   - Complete feature documentation

## How to Access

1. **URL**: Navigate to `/iqac/calendar/admin`
2. **Required Role**: IQAC
3. **Navigation**: Look for "Calendar Admin" in the IQAC sidebar menu

## Excel Format Requirements

Your Excel file must follow this structure:

### Sheet Structure:
- **Use the 3rd sheet** (index 2) of the workbook
- **Cell B2**: Must contain "ODD SEMESTER" or "EVEN SEMESTER"

### Column Layout (Row 3 = Headers):
```
Column B: Date
Column C: Day
Column D: Working Days
Column G: 2nd Year
Column I: 3rd Year
Column K: 4th Year
Column M: 1st Year
```

### Data:
- Data rows start from Row 4
- Each row = one date entry

### Example Excel Structure:
```
Row 1: [Empty or title]
Row 2: [Empty] | ODD SEMESTER | [Empty] ...
Row 3: [Empty] | Date | Day | Working Days | [E] | [F] | 2nd Year | [H] | 3rd Year | [J] | 4th Year | [L] | 1st Year
Row 4: [Empty] | 21/7/2025 | Mon | 1 | ... | ... | Class starts | ... | Orientation | ... | Exam | ... | Registration
Row 5: [Empty] | 22/7/2025 | Tue | 2 | ... | ... | Normal | ... | Training D1 | ... | Lab | ... | Normal
...
```

## Features

### 1. Dashboard View
- See all uploaded calendars
- View metadata: name, year, semester type, entry count
- Upload date
- Click to view full calendar
- Delete with password confirmation

### 2. Create New Calendar
Click "Create Calendar" button:
1. Enter calendar name (e.g., "Academic Year 2025-26 Odd Sem")
2. Upload Excel file
3. System automatically:
   - Detects ODD/EVEN semester from B2
   - Parses all dates and year-specific data
   - Shows loader during processing
   - Displays success/error messages
4. Calendar appears in dashboard

### 3. View Calendar
- Click any calendar card
- See full table with all columns:
  - Date, Day, Working Days
  - 2nd Year, 3rd Year, 4th Year, 1st Year
- All text from Excel preserved

### 4. Delete Calendar
- Click trash icon
- Enter password (default: "admin")
- Confirm to delete permanently

## Current Storage

⚠️ **Note**: Currently using browser localStorage
- Data persists in the browser
- Not shared across devices
- Not backed up to server

**Future Enhancement**: Will integrate with backend database

## Default Password

Delete confirmation password: **admin**

(This will be integrated with user authentication in future updates)

## Testing Your Upload

1. Prepare an Excel file matching the format above
2. Navigate to `/iqac/calendar/admin`
3. Click "Create Calendar"
4. Enter a test name
5. Upload your file
6. Wait for processing
7. Check dashboard for new calendar
8. Click to view and verify data

## Troubleshooting

### "Excel file must have at least 3 sheets"
- Add more sheets to your Excel file
- Ensure you're uploading the correct file

### No data appears
- Check that your data starts from Row 4
- Verify dates are in Column B
- Ensure columns match the specification

### Wrong semester detected
- Check Cell B2 contains "ODD SEMESTER" or "EVEN SEMESTER"
- Check for typos

## Future Enhancements (As Requested)

The following will be implemented based on your requirements:

1. **Backend Integration**: Move from localStorage to database
2. **Semester Filtering**: Auto-filter Even/Odd data based on detected type
3. **Academic Year Detection**: Extract year from Excel filename or content
4. **Enhanced Calendar View**: Visual calendar grid instead of just table
5. **Event Integration**: Link calendar entries to academic events
6. **Password Integration**: Use actual user password for delete confirmation
7. **Additional Features**: As you mentioned "in future i will tell"

## Technical Notes

- Uses `xlsx` library for Excel parsing (already installed)
- Icons from `lucide-react` (already installed)
- Protected route with IQAC role requirement
- Handles up to 1000 rows per upload (safety limit)
- All Excel text data preserved and displayed

## Next Steps

You can now:
1. Test the upload functionality with a sample Excel file
2. Review the calendar display
3. Let me know what additional features you need
4. I'll implement semester filtering, year detection, and other enhancements

The basic structure is complete and ready for testing!
