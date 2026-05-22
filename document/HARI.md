# HR Documentation

## Request Templates

### Purpose
Use Request Templates to define standardized request forms (leave, on-duty, permission, etc.) so staff submissions follow consistent fields, approvals, and notifications.

### Access
- Roles: HR (and Admin, if enabled)
- Navigation: HR > Requests > Templates

### Step-by-step workflow
1. Open the Request Templates page from the HR menu.
2. Review existing templates (name, status, last updated).
3. Click **Create Template**.
4. Fill the template details:
	- Template name
	- Request type/category
	- Form fields (required/optional)
	- Approval flow (HOD/HR/Admin)
	- Notifications (email/in-app)
5. Click **Save**.
6. Confirm the template appears in the list with **Active** status.
7. (Optional) Use **Edit** to update or **Disable** to stop new requests.

### Features
- Create and edit request templates.
- Configure approval steps per template.
- Set required/optional fields for the request form.
- Enable/disable templates without deleting history.
- Track template updates in the list view.

### Screenshot placeholders
- Figure 1: Request Templates list page (filters + list).
- Figure 2: Create Template form.
- Figure 3: Approval flow configuration panel.
- Figure 4: Save confirmation or success toast.

---

## Vacation Settings

### Purpose
Use Vacation Settings to define leave policies that drive eligibility, accrual, carry-forward, and validations used by staff requests.

### Access
- Roles: HR (and Admin, if enabled)
- Navigation: HR > Settings > Vacation

### Step-by-step workflow
1. Open the Vacation Settings page from the HR menu.
2. Review current policies and rules.
3. Click **Edit** (or **Add Policy** if none exists).
4. Configure the policy:
	- Vacation type (annual, casual, sick, etc.)
	- Accrual rules (monthly/annual)
	- Carry-forward limits
	- Encashment rules (if applicable)
	- Blackout dates or exclusions
5. Click **Save**.
6. Verify the updated policy summary reflects the changes.

### Features
- Define multiple vacation/leave types.
- Control accrual and carry-forward rules.
- Configure policy constraints and exclusions.
- Centralized policy management for all staff requests.

### Screenshot placeholders
- Figure 5: Vacation Settings overview page.
- Figure 6: Edit Policy form.
- Figure 7: Save confirmation or success toast.

---

## My Calendar

### Purpose
My Calendar provides a single place for staff to view leave balances, apply for vacations, track requests, and see approved or pending entries on the calendar.

### Access
- Roles: Staff (and HR/Admin if enabled)
- Navigation: My Calendar (or Staff > Calendar, based on your menu)

### Step-by-step workflow
1. Open **My Calendar** from the navigation menu.
2. Review **Leave Balances** to understand remaining entitlements.
3. Use **Apply Vacation** to submit a new request.
4. Check the **Calendar** view for approved/pending leaves and holidays.
5. Use **My Requests** to monitor status or take action on your requests.

### Sections and features

#### Leave Balances
- Displays available balance per leave type.
- Shows used and remaining counts.
- Highlights low or exhausted balances.

#### Apply Vacation
- Select leave type and date range.
- Add reason/notes (if required).
- Submit the request for approval.
- Validates balance and policy constraints.

#### Calendar
- Monthly/weekly view of leave entries.
- Shows approved, pending, and rejected states.
- Highlights holidays and non-working days (if configured).
- Click a date or entry to view details.
- Filter by leave type or status (if available).

#### My Requests
- Lists all submitted requests with status.
- Shows submitted date, leave type, and duration.
- Allows cancel/withdraw (if allowed by policy).
- Displays approver remarks when available.

### Screenshot placeholders
- Figure 8: My Calendar landing page (all sections visible).
- Figure 9: Leave Balances panel.
- Figure 10: Apply Vacation form.
- Figure 11: Calendar view with leave entries.
- Figure 12: My Requests list with status chips.

---

## Staff Attendance Upload

### Purpose
The Staff Attendance Upload page lets HR upload biometric or attendance files, configure time limits, manage eSSL integration settings, reset monthly data, and maintain holiday rules that affect attendance calculations.

### Access
- Roles: PS or HR (and Admin if enabled)
- Navigation: PS/HR > Staff Attendance > Upload

### Step-by-step workflow
1. Open **Staff Attendance Upload** from the PS/HR menu.
2. Upload the attendance file for the selected date range.
3. Configure time limits (department, staff, or global fallback).
4. Verify or update eSSL settings if devices are used.
5. Use reset options carefully when reprocessing a month.
6. Maintain holidays so attendance calculations remain accurate.

### Sections and features

#### Staff Attendance Upload
- Upload daily or monthly attendance files.
- Validates file format before import.
- Shows upload status and summary (processed, skipped, errors).
- Prevents duplicate imports for the same date range (if enabled).

**Use cases**
- Import biometric logs from eSSL devices.
- Re-upload corrected files after fixing errors.

#### Department-Specific Time Limits
- Configure in-time/out-time rules per department.
- Supports department-level overrides for shifts.
- Used when departments follow different timing policies.

**Use cases**
- Lab or maintenance teams with different shifts.
- Departments with extended or flexible hours.

#### Staff-Specific Time Limits
- Set individual in-time/out-time exceptions.
- Overrides department settings for specific staff.
- Useful for special schedules or accommodations.

**Use cases**
- Staff with approved flexible timing.
- Temporary schedule changes for a single person.

#### Global Fallback Time Limits
- Default timing rules applied when no department or staff rule exists.
- Ensures attendance logic always has a baseline.

**Use cases**
- New departments without configured policies.
- Quick setup when migrating to the system.

#### eSSL Settings
- Configure device IP, port, and sync options.
- Enable/disable automated pulling of attendance logs.
- Monitor device connectivity status.

**Use cases**
- Sync attendance from on-premise biometric devices.
- Reconnect devices after network changes.

#### Reset Monthly Attendance
- Clears attendance calculations for a selected month.
- Used before re-importing corrected data.
- Requires confirmation to avoid accidental loss.

**Use cases**
- Fixing incorrect imports.
- Reprocessing after policy changes.

#### Holiday Management
- Define holidays and non-working days.
- Exclude dates from attendance calculations.
- Supports department or organization-wide holidays (if enabled).

**Use cases**
- Avoid marking staff absent on holidays.
- Add special closures or emergency holidays.

### Screenshot placeholders
- Figure 13: Staff Attendance Upload form and file picker.
- Figure 14: Department-Specific Time Limits table.
- Figure 15: Staff-Specific Time Limits editor.
- Figure 16: Global Fallback Time Limits panel.
- Figure 17: eSSL Settings configuration.
- Figure 18: Reset Monthly Attendance dialog.
- Figure 19: Holiday Management list and add dialog.

---

## Event Attending

### Purpose
The Event Attending page lets staff view available events, confirm participation, and track attendance status for upcoming or past events.

### Access
- Roles: Staff (and event coordinators if enabled)
- Navigation: Events > Attending

### Step-by-step workflow
1. Open **Event Attending** from the Events menu.
2. Browse the event list and select an event.
3. Review event details (date, time, venue, coordinator).
4. Click **Attend** (or **Confirm Attendance**) to register.
5. Track status updates in **My Events** or **My Requests**.

### Features
- Event list with filters (date, department, type).
- Detailed event view with schedule and venue.
- One-click attendance confirmation.
- Attendance status tracking (registered, attended, cancelled).
- Notifications or reminders (if enabled).

### Use cases
- Staff confirming participation for institute events.
- Coordinators monitoring attendance confirmations.
- Participants checking their event schedule.

### Screenshot placeholders
- Figure 20: Event Attending list page.
- Figure 21: Event details panel.
- Figure 22: Attendance confirmation dialog.
- Figure 23: My Events/attendance status view.

---

## HR: Staff Attendance Analytics

### Purpose
The Staff Attendance Analytics page provides HR with department-level and organization-level views of staff attendance trends, summaries, and exceptions.

### Access
- Roles: HR (and Admin if enabled)
- Navigation: HR > Staff Attendance Analytics

### Step-by-step workflow
1. Open **Staff Attendance Analytics** from the HR menu.
2. Select the date or date range to analyze.
3. Filter by department, designation, or staff (if available).
4. Review summary cards for totals and percentages.
5. Drill down into detailed attendance records as needed.

### Features
- Organization-wide and department-specific summaries.
- Attendance percentage charts and trends.
- Present/absent/partial counts.
- Date range filtering and quick presets.
- Export or download reports (if enabled).

### Use cases
- Monitor attendance compliance across departments.
- Identify trends in absenteeism.
- Validate monthly attendance before payroll.

### Screenshot placeholders
- Figure 24: Staff Attendance Analytics dashboard.
- Figure 25: Filters and date range selector.
- Figure 26: Department-wise attendance table.
- Figure 27: Export/report action panel.

---

## HR: Staff Validation

### Purpose
The Staff Validation page allows HR to review and validate staff attendance records, correct anomalies, and confirm final monthly data.

### Access
- Roles: HR (and Admin if enabled)
- Navigation: HR > Staff Validation

### Step-by-step workflow
1. Open **Staff Validation** from the HR menu.
2. Select the month and department to validate.
3. Review staff attendance summaries and flags.
4. Open a staff record to view daily details.
5. Apply corrections or mark as validated.
6. Save validation status for the month.

### Features
- Month-wise validation workflow.
- Department and staff filters.
- Anomaly indicators (missing logs, partial days).
- View and verify daily attendance details.
- Mark records as validated/locked for payroll.

### Use cases
- Final attendance review before salary processing.
- Resolve missing biometric logs.
- Ensure policy compliance for monthly closure.

### Screenshot placeholders
- Figure 28: Staff Validation summary page.
- Figure 29: Monthly validation filters.
- Figure 30: Staff detail validation view.
- Figure 31: Validation confirmation dialog.

---

## HR: Staff Salary

### Purpose
The Staff Salary page allows HR to configure salary components, manage statutory settings, apply deductions, generate monthly sheets, and produce salary reports.

### Access
- Roles: HR (and Admin if enabled)
- Navigation: HR > Salary > Staff Salary

### Step-by-step workflow
1. Open **Staff Salary** from the HR menu.
2. Configure declarations and statutory settings (PF, bank).
3. Set deductions and EMI rules as required.
4. Review and update formulas for salary calculations.
5. Generate the **Monthly Sheet** for the selected month.
6. Review and export the **Salary Report**.

### Sections and features

#### Declaration
- Capture staff salary declarations and proof references.
- Lock or reopen declarations based on the period.
- Track submission status.

**Use cases**
- Collect annual declarations before payroll run.
- Audit submitted declarations during compliance checks.

#### Bank Declaration
- Maintain staff bank account details for salary transfer.
- Validate mandatory fields before payroll export.

**Use cases**
- Update account changes before monthly payout.
- Ensure clean bank transfer files.

#### PF Config
- Configure PF eligibility and contribution settings.
- Apply caps, employer/employee percentages, or exemptions.

**Use cases**
- Apply statutory changes to PF rules.
- Exclude staff who are not PF-eligible.

#### Deductions & EMI
- Define recurring deductions (loans, advances, penalties).
- Set EMI schedules and auto-apply monthly.
- Track outstanding balances.

**Use cases**
- Recover staff loans via monthly EMI.
- Apply one-time or recurring deductions.

#### Formulas
- Maintain calculation formulas for salary components.
- Support gross/net calculation logic.
- Validate formula changes before applying.

**Use cases**
- Update HRA or allowance calculations.
- Adjust formula due to policy changes.

#### Monthly Sheet
- Generate the monthly payroll sheet.
- View component-wise breakdown for each staff.
- Export to Excel or PDF (if enabled).

**Use cases**
- Finalize payroll data for a specific month.
- Review outliers before approval.

#### Salary Report
- Generate consolidated salary reports.
- Filter by department or month.
- Export for audit or finance review.

**Use cases**
- Share monthly salary summary with finance.
- Archive reports for compliance.

### Screenshot placeholders
- Figure 32: Staff Salary landing page.
- Figure 33: Declaration section.
- Figure 34: Bank Declaration section.
- Figure 35: PF Config settings.
- Figure 36: Deductions & EMI table.
- Figure 37: Formula editor.
- Figure 38: Monthly Sheet view.
- Figure 39: Salary Report export screen.

---

## HR: Pending Approvals

### Purpose
The Pending Approvals page lists salary-related items awaiting HR review, confirmation, or final approval.

### Access
- Roles: HR (and Admin if enabled)
- Navigation: HR > Salary > Pending Approvals

### Step-by-step workflow
1. Open **Pending Approvals** from the HR menu.
2. Filter by month, department, or approval type.
3. Review each pending item and its details.
4. Approve or reject with remarks.
5. Confirm the item moves to the approved list.

### Features
- Consolidated list of pending salary actions.
- Filters for quick review.
- Approve/reject with audit trail.
- Status tracking and timestamps.

### Use cases
- Finalize payroll approvals for the month.
- Track pending updates from departments.

### Screenshot placeholders
- Figure 40: Pending Approvals list.
- Figure 41: Approval detail drawer/modal.
- Figure 42: Approval confirmation dialog.

---

## HR: Salary

### Purpose
The Salary page provides a summary view of processed payroll, staff payouts, and downloadable outputs for the selected month.

### Access
- Roles: HR (and Admin if enabled)
- Navigation: HR > Salary

### Step-by-step workflow
1. Open **Salary** from the HR menu.
2. Select the month and department (if available).
3. Review summary totals and staff-wise payouts.
4. Download reports or export files as needed.

### Features
- Monthly salary summary cards.
- Staff-wise payout list with status.
- Export options (Excel/PDF, if enabled).
- Search and filters for quick lookup.

### Use cases
- Quick monthly payroll review.
- Retrieve payout lists for finance processing.

### Screenshot placeholders
- Figure 43: Salary summary page.
- Figure 44: Staff payout list.
- Figure 45: Export options panel.

---

## Calendar Admin

### Purpose
The Calendar Admin page lets authorized users upload, manage, and publish academic calendars so events, working days, and academic year schedules are consistent across the system.

### Access
- Roles: IQAC/Calendar Admin (and Admin if enabled)
- Navigation: Calendar Admin

### Step-by-step workflow
1. Open **Calendar Admin** from the menu.
2. Click **Upload Calendar** and select the Excel template file.
3. Review the parsed calendar preview (dates, working days, events).
4. Save and publish the calendar for the academic year.
5. Use **Edit** or **Delete** to manage uploaded calendars.

### Features
- Upload academic calendar via Excel template.
- Automatic parsing of dates, working days, and events.
- Preview before publishing.
- Multiple calendar versions with timestamps.
- Publish/unpublish calendars for visibility control.

### Use cases
- Configure a new academic year calendar.
- Update events or working days after corrections.
- Replace an old calendar with a revised version.

### Screenshot placeholders
- Figure 46: Calendar Admin list page.
- Figure 47: Upload Calendar dialog.
- Figure 48: Parsed calendar preview.
- Figure 49: Publish confirmation dialog.

