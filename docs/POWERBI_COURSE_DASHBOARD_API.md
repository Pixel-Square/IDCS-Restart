# Power BI Course Dashboard API

This document describes the Academic 2.1 reporting endpoint created for course-wise Power BI dashboards.

## Endpoint

- URL: `/api/reporting/v2/dashboard/course/`
- Method: `GET`
- Auth header: `X-Reporting-Api-Key: <your-api-key>`

## Purpose

This endpoint returns one row per `student x exam assignment`, with joined:

- course details
- section details
- faculty details
- exam-level raw marks
- exam-level weighted marks
- exam-level CO marks
- final internal totals from `acv2_internal_mark`
- pass/fail result based on configurable `pass_percent`

This is the correct grain for Power BI because it lets you build:

- pass rate
- fail rate
    BaseUrl   = "http://127.0.0.1:8001",
- exam-wise performance
- student-wise performance
- section-wise comparisons
- CO-wise performance

## Query Parameters

All filters are optional.


    RootUrl = Text.TrimEnd(BaseUrl, "/"),

    AddOptionalTextFilter = (recordValue as record, fieldName as text, fieldValue as any) as record =>
        let
            normalized = if fieldValue = null then null else Text.Trim(Text.From(fieldValue)),
            nextRecord = if normalized = null or normalized = "" then recordValue else Record.AddField(recordValue, fieldName, normalized)
        in
            nextRecord,
- `page`: page number, default `1`
- `page_size`: row count per page, default `500`
- `course_code`: example `MEB1221`
- `section`: example `A`
- `sem`: example `4`
- `dept`: department code or name
- `qp_type`: example `WD`, `SSA`, `CIA`
- `faculty_user_id`: faculty user id
            withCourse = AddOptionalTextFilter(base, "course_code", CourseCode),
            withSection = AddOptionalTextFilter(withCourse, "section", Section),
            withSem = AddOptionalTextFilter(withSection, "sem", Sem),
            withQpType = AddOptionalTextFilter(withSem, "qp_type", QpType),
            withFaculty = AddOptionalTextFilter(withQpType, "faculty_user_id", FacultyUserId)
## Returned Columns

- `year`
- `sem`
- `dept_code`
            url = RootUrl & "/api/reporting/v2/dashboard/course/",
- `section_id`
- `section`
- `course_id`
- `course_code`
- `course_name`
- `course_type`
- `qp_type`
- `faculty_user_id`
- `faculty_name`
- `exam_assignment_id`
- `exam_code`
- `exam_name`
- `exam_status`
- `published_at`
- `student_id`
- `reg_no`
- `student_name`
- `is_absent`
- `is_exempted`
- `remarks`
- `exam_max_marks`
- `exam_weight`
- `exam_total_mark` — Calculated as the sum of all CO marks (`exam_co1_mark` + `exam_co2_mark` + `exam_co3_mark` + `exam_co4_mark` + `exam_co5_mark`).
- `exam_weighted_mark`
 - `student_profile_path` — Relative media path to the student's profile image (e.g. `profile_images/abc123.jpg`). Combine with your `BaseUrl`/`RootUrl` to form a full image URL for Power BI.
 - `faculty_profile_path` — Relative media path to the faculty's profile image (e.g. `profile_images/xyz789.jpg`). Combine with your `BaseUrl`/`RootUrl` to form a full image URL for Power BI.
 - `student_photo_url` — Full HTTPS URL to the student's profile image (e.g. `https://idcs.zynix.us/media/profile_images/5de21a4010fa4065b281e929be89b977.jpg`). Returned by the API when possible.
 - `faculty_photo_url` — Full HTTPS URL to the faculty's profile image (e.g. `https://idcs.zynix.us/media/profile_images/xyz789.jpg`). Returned by the API when possible.
- `exam_co1_mark`
- `exam_co2_mark`
- `exam_co3_mark`
- `exam_co4_mark`
- `exam_co5_mark`
- `internal_co1_total`
- `internal_co2_total`
- `internal_co3_total`
- `internal_co4_total`
- `internal_co5_total`
- `internal_final_mark`
- `internal_max_mark`
- `pass_mark` — Effective pass mark for this exam. Uses the **whole-number pass mark** set on the QP type's exam assignment in the QP Pattern Editor when available; otherwise falls back to `internal_max_mark × pass_percent / 100` (default 50%). Set per exam in *Admin → QP Pattern Editor → select Class Type & QP Type → Pass Mark field on each exam row*.
- `is_pass` — Determined by comparing the sum of CO marks (`exam_co1_mark` + `exam_co2_mark` + `exam_co3_mark` + `exam_co4_mark` + `exam_co5_mark`) against `pass_mark`. Returns `true` if sum >= `pass_mark`, `false` otherwise. Returns `null` if `pass_mark` is not set.

## Power Query Template

Replace `BaseUrl` and `ApiKey` with your actual values.

Leave filter values as `null` to fetch all courses and all sections. Set them only if you want a filtered import.

```powerquery
let
    BaseUrl   = "https://idcs.zynix.us",
    ApiKey    = "RPT_2026_61HAja_DpYo-9eGxaEEEDguVQYDiMdg7eFp9uL4eLl34We9-GGFKjg",
    PageSize  = 500,

    CourseCode = null,
    Section    = null,
    Sem        = null,
    QpType     = null,
    FacultyUserId = null,
    PassPercent = "50",

    RootUrl = Text.TrimEnd(BaseUrl, "/"),

    BuildQuery = (page as number) as record =>
        let
            base = [
                page = Text.From(page),
                page_size = Text.From(PageSize),
                pass_percent = PassPercent
            ],
            withCourse = if CourseCode <> null and Text.Trim(CourseCode) <> "" then Record.AddField(base, "course_code", CourseCode) else base,
            withSection = if Section <> null and Text.Trim(Section) <> "" then Record.AddField(withCourse, "section", Section) else withCourse,
            withSem = if Sem <> null and Text.Trim(Sem) <> "" then Record.AddField(withSection, "sem", Sem) else withSection,
            withQpType = if QpType <> null and Text.Trim(QpType) <> "" then Record.AddField(withSem, "qp_type", QpType) else withSem,
            withFaculty = if FacultyUserId <> null and Text.Trim(FacultyUserId) <> "" then Record.AddField(withQpType, "faculty_user_id", FacultyUserId) else withQpType
        in
            withFaculty,

    GetPage = (page as number) as record =>
        let
            url = RootUrl & "/api/reporting/v2/dashboard/course/",
            resp =
                Json.Document(
                    Web.Contents(
                        url,
                        [
                            Query = BuildQuery(page),
                            Headers = [
                                #"X-Reporting-Api-Key" = ApiKey,
                                Accept = "application/json"
                            ]
                        ]
                    )
                )
        in
            resp,

    First = GetPage(1),
    Total = try Number.From(First[total]) otherwise 0,
    Pages = if Total = 0 then 1 else Number.RoundUp(Total / PageSize),
    PageList = {1..Pages},

    AllRows =
        List.Combine(
            List.Transform(
                PageList,
                (p) => try GetPage(p)[rows] otherwise {}
            )
        ),

    TableOut = Table.FromRecords(AllRows)
in
    TableOut
```

    ## Student Profile Photos

    - `student_profile_path` is a relative media path (for example `profile_images/abc123.jpg`). The API does not assume a host so you must combine it with your `BaseUrl`/`RootUrl` to form a full HTTP URL.

    Power Query (add full image URL columns):

    ```powerquery
    TableWithPhotos = Table.AddColumn(TableOut, "student_photo_url", each if Text.Trim([student_profile_path] & "") = "" then null else RootUrl & "/media/" & Text.TrimStart([student_profile_path], "/")),
    TableWithPhotos2 = Table.AddColumn(TableWithPhotos, "faculty_photo_url", each if Text.Trim([faculty_profile_path] & "") = "" then null else RootUrl & "/media/" & Text.TrimStart([faculty_profile_path], "/"))
    ```

    Use `TableWithPhotos2` as the downstream table when loading into Power BI.

    Power BI (show images):

    - After loading the table, select the `photo_url` column in the Data view, then on the ribbon choose **Modeling → Data Category → Image URL**.
    - Use `photo_url` in a Table visual or any visual that supports image URLs to display student photos. Ensure the Power BI machine can access your `RootUrl/media/...` URLs (public or reachable from Power BI Desktop).


## How To Use The Same Query For All Courses

You do **not** need one Power Query per course.

- To fetch all courses and all sections: keep `CourseCode = null`, `Section = null`, and `Sem = null`.
- To fetch one faculty only: set `FacultyUserId`.
- To fetch one course only: set `CourseCode` and optionally `Section` and `Sem`.

If you want all courses and all sections, keep these exactly as `null`:

- `CourseCode = null`
- `Section = null`
- `Sem = null`
- `QpType = null`
- `FacultyUserId = null`

Also make sure `BaseUrl` can be either:

- `https://idcs.zynix.us`
- `https://idcs.zynix.us/`

The template now trims the trailing slash automatically.

Recommended approach:

- Import all rows into one Power BI dataset.
- Build one reusable report template.
- Filter the report inside Power BI or in the frontend embed.

This is the scalable setup. One report can serve all courses.

## Suggested Power BI Measures

After importing the table, create measures like:

- `Students = DISTINCTCOUNT(course_dashboard[reg_no])`
- `Passed Students = CALCULATE(DISTINCTCOUNT(course_dashboard[reg_no]), course_dashboard[is_pass] = true)`
- `Failed Students = CALCULATE(DISTINCTCOUNT(course_dashboard[reg_no]), course_dashboard[is_pass] = false)`
- `Pass Rate % = DIVIDE([Passed Students], [Students]) * 100`
- `Fail Rate % = DIVIDE([Failed Students], [Students]) * 100`
- `Average Internal = AVERAGE(course_dashboard[internal_final_mark])`
- `Average Exam Score = AVERAGE(course_dashboard[exam_total_mark])`

## Recommended Visuals

- Card: `Students`
- Card: `Pass Rate %`
- Card: `Fail Rate %`
- Card: `Average Internal`
- Clustered column: `exam_name` vs average `exam_total_mark`
- Bar chart: `student_name` vs `internal_final_mark`
- Matrix: `student_name` with `exam_name`, `exam_total_mark`, `exam_weighted_mark`
- CO analysis using `internal_co1_total` to `internal_co5_total`

## Integration Note For Frontend

The current faculty dashboard page can pass filters such as:

- `course_code`
- `section`
- `sem`
- `qp_type`

This lets a single Power BI template dashboard show the correct course automatically.

### Frontend Embed URL Template

The faculty dashboard page now supports placeholder replacement inside `VITE_POWERBI_EMBED_URL`.

Supported placeholders:

- `{course_id}`
- `{course_code}`
- `{course_name}`
- `{section}`
- `{semester}`
- `{sem}`
- `{qp_type}`
- `{class_type}`
- `{department}`

Example:

```env
VITE_POWERBI_EMBED_URL="https://app.powerbi.com/reportEmbed?reportId=YOUR_REPORT_ID&groupId=YOUR_GROUP_ID&autoAuth=true&filter=course_dashboard/course_code eq '{course_code}' and course_dashboard/section eq '{section}' and course_dashboard/sem eq '{sem}'"
```

With this setup, when faculty opens a course, the page automatically builds a course-specific Power BI URL and loads the matching dashboard.