# Academic Calendar Admin Feature

## Overview
The Academic Calendar Admin page allows IQAC administrators to upload and manage academic year calendars from Excel files. The system parses Excel files with a specific format and displays the calendar data in an organized manner.

## Features

### 1. Calendar Dashboard
- View all uploaded academic calendars
- See calendar metadata (name, academic year, semester type, number of entries)
- Click on any calendar to view its full details
- Delete calendars with password confirmation

### 2. Excel Upload & Parsing
The system accepts Excel files with the following format:

#### Excel Structure Requirements:
- **Sheet to Use**: 3rd sheet (index 2) of the Excel workbook
- **Semester Type**: Cell B2 should contain "ODD SEMESTER" or "EVEN SEMESTER"

#### Column Layout (Row 3 - Headers):
- **Column B**: Date
- **Column C**: Day
- **Column D**: Working Days
- **Column G**: 2nd Year data
- **Column I**: 3rd Year data
- **Column K**: 4th Year data
- **Column M**: 1st Year data

#### Data Rows:
- Data starts from Row 4 onwards
- Each row represents one date entry with corresponding information for each year

### 3. Create New Calendar
1. Click "Create Calendar" button
2. Enter a calendar name (e.g., "Academic Year 2025-26 Odd Sem")
3. Upload Excel file (.xlsx or .xls)
4. System automatically:
   - Detects semester type (ODD/EVEN) from cell B2
   - Parses all date entries with year-specific data
   - Generates the calendar view
5. Calendar is saved and listed in the dashboard

### 4. View Calendar
- Click on any calendar card to view full details
- Displays all dates in a table format with columns:
  - Date
  - Day
  - Working Days
  - 2nd Year
  - 3rd Year
  - 4th Year
  - 1st Year

### 5. Delete Calendar
- Click the trash icon on any calendar card
- Enter password for confirmation (default: "admin")
- Calendar is permanently removed

## Access

**URL**: `/iqac/calendar/admin`

**Required Role**: IQAC

## Storage

Currently, calendars are stored in browser localStorage under the key `academicCalendars`. Each calendar object contains:

```typescript
{
  id: string
  name: string
  semesterType: 'ODD' | 'EVEN'
  academicYear: string
  uploadedAt: string (ISO date)
  calendarData: {
    dates: Array<{
      date: string
      day: string
      workingDays: string
      secondYear: string
      thirdYear: string
      fourthYear: string
      firstYear: string
    }>
    years: {
      secondYear: { [date: string]: string }
      thirdYear: { [date: string]: string }
      fourthYear: { [date: string]: string }
      firstYear: { [date: string]: string }
    }
  }
}
```

## Future Enhancements

### Planned Features:
1. **Backend Integration**: Store calendars in database instead of localStorage
2. **Semester Filtering**: Automatically filter Even/Odd semester data based on detected type
3. **Academic Year Detection**: Extract academic year from Excel file
4. **Export Functionality**: Export calendar to PDF or Excel
5. **Advanced Password**: Integrate with user authentication system
6. **Calendar Comparison**: Compare different academic years
7. **Visual Calendar View**: Month-by-month calendar grid view
8. **Event Integration**: Link calendar dates to academic events
9. **Notifications**: Send reminders for important dates
10. **Multi-sheet Support**: Parse multiple sheets for different departments

## Technical Details

### Dependencies:
- `xlsx`: Excel file parsing
- `lucide-react`: Icons
- `react-router-dom`: Routing

### Components:
- **AcademicCalendarAdmin.tsx**: Main admin component
- Location: `/frontend/src/pages/academicCalendar/`

### Routing:
- Path: `/iqac/calendar/admin`
- Protected: Requires IQAC role

## Usage Instructions

### For Administrators:

1. **Prepare Excel File**:
   - Ensure your Excel file has at least 3 sheets
   - Use the 3rd sheet for calendar data
   - Put "ODD SEMESTER" or "EVEN SEMESTER" in cell B2
   - Follow the column structure as documented above

2. **Upload Calendar**:
   - Navigate to `/iqac/calendar/admin`
   - Click "Create Calendar"
   - Enter a descriptive name
   - Select and upload your Excel file
   - Wait for processing (loader will show)
   - Calendar will appear in the dashboard

3. **View Calendar Data**:
   - Click on any calendar card
   - Review all dates and year-specific information
   - Close modal when done

4. **Delete Calendar**:
   - Click trash icon on calendar card
   - Enter password: `admin`
   - Confirm deletion

## Troubleshooting

### Common Issues:

1. **"Excel file must have at least 3 sheets"**
   - Solution: Ensure your Excel file contains 3 or more sheets

2. **No data parsed**
   - Check that data starts from row 4
   - Ensure cell B4 onwards contains dates
   - Verify column positions match the specification

3. **Incorrect semester type**
   - Check cell B2 contains either "ODD SEMESTER" or "EVEN SEMESTER"
   - Text matching is case-insensitive

4. **Delete password not working**
   - Default password is: `admin`
   - This will be integrated with user authentication in future updates

## Screenshots

### Dashboard View
Shows all uploaded calendars with metadata and delete buttons.

### Create Calendar Popup
Form to enter calendar name and upload Excel file.

### Calendar View Modal
Full table view of calendar data with all year columns.

## Notes

- Currently uses localStorage for data persistence
- Password for deletion is hardcoded as "admin" (will be improved)
- Excel parsing handles up to 1000 rows for safety
- System auto-detects semester type from cell B2
- All text data from Excel is preserved and displayed
