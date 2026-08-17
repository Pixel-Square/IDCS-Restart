# Google Sheets Live Integration Implementation Plan

## Overview
Transform Google Sheets integration from "create new sheets" to "link existing sheets and pull live data".

## Architecture Changes

### Phase 1: Backend API Endpoints

#### 1.1 New Endpoint: `/api/academic-v2/google-sheets/fetch-live-data/`
**Purpose**: Fetch live data from an existing Google Sheet based on configuration

**Request**:
```json
{
  "sheet_url": "https://docs.google.com/spreadsheets/d/SHEET_ID/edit",
  "sheet_tab": "SSA 1",
  "column_mapping": {
    "reg_no_column": "A",
    "name_column": "B",
    "question_columns": {
      "Q1": "C",
      "Q2": "D",
      "Q3": "E"
    }
  },
  "course_section_id": "uuid-here"
}
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "register_number": "21CS001",
      "name": "Student Name",
      "marks": {
        "Q1": 10,
        "Q2": 8,
        "Q3": 9
      }
    }
  ],
  "metadata": {
    "total_rows": 50,
    "synced_at": "2026-07-28T10:30:00Z"
  }
}
```

#### 1.2 New Endpoint: `/api/academic-v2/google-sheets/validate-sheet/`
**Purpose**: Validate that a pasted sheet URL is accessible and has the correct format

**Request**:
```json
{
  "sheet_url": "https://docs.google.com/spreadsheets/d/SHEET_ID/edit"
}
```

**Response**:
```json
{
  "valid": true,
  "spreadsheet_id": "SHEET_ID",
  "sheet_tabs": ["SSA 1", "CIA 1", "Model"],
  "title": "CSE-A Marks 2025"
}
```

#### 1.3 Update Model: `AcV2Section` or create `AcV2GoogleSheetLink`
Store sheet configuration per course section:
```python
class AcV2GoogleSheetLink(models.Model):
    section = ForeignKey(AcV2Section)
    sheet_url = URLField()
    spreadsheet_id = CharField()  # Extracted from URL
    is_active = BooleanField(default=True)
    
    # Per exam assignment configuration
    exam_configs = JSONField(default=dict)
    # Structure:
    # {
    #   "exam_assignment_id": {
    #     "sheet_tab": "SSA 1",
    #     "column_mapping": {
    #       "reg_no_column": "A",
    #       "name_column": "B",
    #       "question_columns": {"Q1": "C", "Q2": "D"}
    #     }
    #   }
    # }
```

### Phase 2: Frontend Changes

#### 2.1 Update GoogleSheetsPage.tsx - Links Tab
- **Remove**: "Create Sheets" button for inactive sections
- **Add**: "Link Existing Sheet" functionality
  - Input field to paste Google Sheet URL
  - Button to validate and connect
  - Display connected sheet information

#### 2.2 Update GoogleSheetsPage.tsx - Configure Tab
- **Keep**: Class type, QP type, Exam assignment selectors
- **Update**: For each exam assignment:
  - Sheet tab selector (dropdown from available tabs)
  - Column mapping fields (A, B, C, etc.)
  - Preview button to test configuration

#### 2.3 Mark Entry Page Integration
- Fetch live data from configured Google Sheet
- Display in existing mark entry table
- Show sync status and last synced time
- Add "Refresh from Sheet" button

### Phase 3: Apps Script Automation (Optional)

#### 3.1 Apps Script Template
Create a template Apps Script that can be deployed to Google Sheets:

```javascript
// Apps Script for IDCS Mark Entry Sheet
// This script provides real-time data validation and formatting

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  
  // Validate numeric marks
  if (range.getColumn() >= 3) { // Question columns
    var value = range.getValue();
    if (value && isNaN(value)) {
      range.setValue("");
      SpreadsheetApp.getUi().alert("Please enter numeric values only");
    }
  }
}

function formatSheet() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  
  // Format header row
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setBackground("#4285F4")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");
}
```

#### 3.2 Automated Deployment Endpoint
**Endpoint**: `/api/academic-v2/google-sheets/deploy-script/`

**Request**:
```json
{
  "spreadsheet_id": "SHEET_ID"
}
```

Uses Google Apps Script API to:
1. Create a new script project
2. Upload the template code
3. Deploy it to the spreadsheet

**Requirements**:
- Additional OAuth scope: `https://www.googleapis.com/auth/script.projects`
- User must authorize once

## Implementation Steps

### Step 1: Backend - Data Fetching (Priority 1)
1. Create helper function to extract spreadsheet ID from URL
2. Implement `fetch_live_data` function in `google_sheets_service.py`
3. Create new API endpoint
4. Add error handling for invalid sheets/tabs

### Step 2: Backend - Sheet Validation (Priority 1)
1. Implement `validate_sheet_url` function
2. Fetch available tabs from spreadsheet
3. Create validation endpoint

### Step 3: Backend - Data Model (Priority 1)
1. Create `AcV2GoogleSheetLink` model
2. Run migrations
3. Add CRUD endpoints for sheet links

### Step 4: Frontend - Link Management (Priority 2)
1. Update Links tab UI
2. Add sheet URL input and validation
3. Display connected sheets
4. Allow editing/removal of links

### Step 5: Frontend - Configuration UI (Priority 2)
1. Update Configure tab
2. Add sheet tab selector
3. Improve column mapping interface
4. Add preview/test functionality

### Step 6: Frontend - Mark Entry Integration (Priority 2)
1. Update mark entry page to fetch from Google Sheets
2. Add sync controls
3. Handle errors and edge cases

### Step 7: Apps Script (Priority 3 - Optional)
1. Create template script
2. Implement deployment endpoint
3. Add UI to trigger deployment

## Manual Configuration Guide (For Users)

### What Users Need to Do:
1. **Create Google Sheet**: Create a single Google Sheet per course section
2. **Create Tabs**: Create one tab per exam assignment (e.g., "SSA 1", "CIA 1", "Model")
3. **Format Columns**:
   - Column A: Register Number
   - Column B: Name (optional)
   - Column C onwards: Question marks (Q1, Q2, etc.)
4. **Share Sheet**: Share with appropriate permissions
5. **Paste Link**: In IDCS Google Sheets Admin → Links tab, paste the sheet URL
6. **Configure**: In Configure tab, map sheet tabs to exam assignments and specify columns

### Apps Script (Optional Manual Step):
1. Open Google Sheet
2. Go to Extensions → Apps Script
3. Paste the provided script code
4. Save and authorize
5. Script will now validate data on edit

## API Documentation

### Extract Spreadsheet ID from URL
```python
def extract_spreadsheet_id(url: str) -> str | None:
    """
    Extract spreadsheet ID from various Google Sheets URL formats:
    - https://docs.google.com/spreadsheets/d/SHEET_ID/edit
    - https://docs.google.com/spreadsheets/d/SHEET_ID
    """
    import re
    pattern = r'/spreadsheets/d/([a-zA-Z0-9-_]+)'
    match = re.search(pattern, url)
    return match.group(1) if match else None
```

### Fetch Sheet Tabs
```python
def get_sheet_tabs(spreadsheet_id: str, headers: dict) -> list[str]:
    """Get list of tab names from spreadsheet"""
    response = requests.get(
        f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}',
        headers=headers
    )
    if response.ok:
        data = response.json()
        return [sheet['properties']['title'] 
                for sheet in data.get('sheets', [])]
    return []
```

### Fetch and Parse Live Data
```python
def fetch_live_marks(
    spreadsheet_id: str,
    sheet_tab: str,
    column_mapping: dict,
    headers: dict
) -> list[dict]:
    """
    Fetch marks from Google Sheet and parse according to mapping
    
    Returns list of student records:
    [
        {
            "register_number": "21CS001",
            "name": "Student Name",
            "marks": {"Q1": 10, "Q2": 8}
        }
    ]
    """
    # Implementation here
```

## Security Considerations

1. **OAuth Scopes**: Only request necessary scopes
2. **Sheet Access**: Validate user has permission to access sheet
3. **Data Validation**: Sanitize all data from Google Sheets
4. **Rate Limiting**: Implement rate limits for API calls
5. **Error Handling**: Don't expose internal errors to users

## Testing Checklist

- [ ] Can paste valid Google Sheet URL
- [ ] Can detect invalid/inaccessible sheets
- [ ] Can list available sheet tabs
- [ ] Can configure column mappings
- [ ] Can fetch live data correctly
- [ ] Can match students by register number
- [ ] Can handle missing/invalid data gracefully
- [ ] Can update configuration without breaking existing links
- [ ] Can remove sheet links
- [ ] OAuth flow works for new users
- [ ] Refresh tokens work correctly
- [ ] Multiple exam assignments per sheet work
- [ ] Apps Script deployment works (if implemented)

## Error Messages

### User-Friendly Errors:
- "Unable to access sheet. Please check the URL and sharing permissions."
- "Sheet tab 'SSA 1' not found. Available tabs: SSA1, CIA1, Model"
- "Register number column 'A' is empty or invalid"
- "Invalid marks value in cell C5: must be numeric"
- "Student with register number '21CS001' not found in course section"

## Future Enhancements

1. **Bulk Operations**: Update multiple students at once
2. **Conflict Resolution**: Handle cases where marks differ between sheet and database
3. **Change History**: Track when marks were synced from sheets
4. **Notifications**: Alert faculty when sheet data changes
5. **Offline Mode**: Cache sheet data for offline access
6. **Export**: Export database marks to sheet (reverse sync)

## Timeline Estimate

- **Phase 1** (Backend): 2-3 days
- **Phase 2** (Frontend): 3-4 days  
- **Phase 3** (Apps Script): 1-2 days (optional)
- **Testing & Bug Fixes**: 2-3 days

**Total**: ~8-12 days for full implementation
