# Formative1List - Visual Architecture & Workflow

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          IDCS OBE System                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                   CourseOBEPage                            │   │
│  │  (Displays: CDAP | Articulation | Mark Entry)             │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                      │
│                    Mark Entry Tab Selected                        │
│                            │                                      │
│  ┌────────────────────────┴────────────────────────────────┐   │
│  │                  MarkEntryPage                          │   │
│  │  (Receives: courseId)                                   │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                      │
│  ┌────────────────────────┴────────────────────────────────┐   │
│  │               MarkEntryTabs Component                    │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ Tabs: [Dashboard] [SSA1] [F1] [CIA1] [SSA2]... │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                    Formative1 Selected                  │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                      │
│         ┌──────────────────┴──────────────────┐                 │
│         │                                     │                 │
│  ┌──────▼─────────────────────┐   ┌──────────▼──────────────┐  │
│  │  Formative1List Component  │   │  MarkEntryTable (Other) │  │
│  │  (NEW - This Component)    │   │  (SSA1, CIA1, etc.)     │  │
│  └────────────────────────────┘   └─────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Internal Architecture

```
Formative1List Component
│
├── State Management
│   ├── Data States
│   │   ├── loading: boolean
│   │   ├── students: StudentRecord[]
│   │   ├── error: string | null
│   │   └── marksByStudent: Record<string, F1Row>
│   │
│   └── UI States
│       ├── query: string
│       ├── zoom: number
│       ├── selectedBtls: number[]
│       ├── showBtlPicker: boolean
│       ├── showResetModal: boolean
│       ├── resetColumns: string[]
│       └── showConfirmModal: boolean
│
├── Effects
│   ├── useEffect (1): Fetch students on component mount
│   │   └─ Calls: fetchForSubject() → Resolves department → Fetches students
│   │
│   ├── useEffect (2): Load BTL preferences from localStorage
│   │
│   └── useEffect (3): Save BTL preferences to localStorage
│
├── Memoized Calculations
│   ├── useMemo: filtered (student search results)
│   └── useMemo: btlDisplayValue (BTL selection display)
│
├── Memoized Callbacks
│   ├── useCallback: getMarks()
│   ├── useCallback: setRow()
│   ├── useCallback: derived()
│   ├── useCallback: toggleBtl()
│   ├── useCallback: exportCsv()
│   └── useCallback: handleReset()
│
├── Utility Functions (Module-level)
│   ├── clampNumber()
│   ├── pct()
│   ├── compareRegNo()
│   ├── isLikelyUUID()
│   └── uniqueItems()
│
└── Render Output
    ├── Toolbar (Search, Zoom, Reset, Export)
    ├── Loading / Error / Empty States
    └── Table
        ├── Header (Class strength, Column labels, Max marks)
        └── Rows (Student data + Mark inputs)
```

---

## Data Processing Pipeline

```
Input: Student Mark Entry
  │
  ├─ Skill 1: [0-5] input
  ├─ Skill 2: [0-5] input
  ├─ Attitude 1: [0-5] input
  └─ Attitude 2: [0-5] input
         │
         ├─ Validation: clampNumber(value, 0, MAX_PART)
         │   └─ Invalid inputs clamped to valid range
         │
         └─ State Update: setRow(studentId, newMarks)
                │
                ├─ Total = skill1 + skill2 + att1 + att2
                ├─ CO1 = skill1 + att1
                └─ CO2 = skill2 + att2
                   │
                   ├─ Percentage CO1 = (CO1 / 10) × 100
                   ├─ Percentage CO2 = (CO2 / 10) × 100
                   │
                   └─ BTL Values
                      ├─ BTL 1,3,5 = CO1 value (if enabled)
                      └─ BTL 2,4,6 = CO2 value (if enabled)
                            │
                            ├─ BTL % = (BTL / 10) × 100
                            │
                            └─ Display in Table
```

---

## API Call Sequence

```
Component Mount
    │
    ├─ 1. Fetch Subject Details
    │   └─ GET /api/subjects/{subjectId}/
    │       └─ Response: { id, department, year, section, ... }
    │
    ├─ 2. Resolve Department Candidates
    │   └─ If UUID:
    │       └─ GET /api/departments/{uuid}/
    │   └─ If String:
    │       └─ GET /api/departments/?search={name}
    │
    ├─ 3. Fetch Students for Subject
    │   └─ GET /api/students/?department=X&year=Y&section=Z
    │       └─ Response: [StudentRecord, ...]
    │
    ├─ 4. Fetch Missing Profile Names (if needed)
    │   └─ GET /api/profiles/?ids={id1,id2,...}
    │       └─ Response: [{ id, name }, ...]
    │
    └─ 5. Render Component
        └─ Display students with empty mark form
```

---

## Mark Entry Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Formative-1 Assessment                   │
└─────────────────────────────────────────────────────────────┘

User Steps:
1. Select Course → OBE → Mark Entry → Formative 1
   └─ Component fetches students and subject

2. Enter Marks for Each Student
   ├─ Click on Skill 1 field → Enter value (0-5)
   ├─ Click on Skill 2 field → Enter value (0-5)
   ├─ Click on Attitude 1 field → Enter value (0-5)
   └─ Click on Attitude 2 field → Enter value (0-5)

3. View Auto-Calculated Values
   ├─ Total CIA-1 = sum of all components (visible in real-time)
   ├─ CO-1 = Skill1 + Attitude1 (visible with %)
   ├─ CO-2 = Skill2 + Attitude2 (visible with %)
   └─ BTL Values = CO values (visible with %)

4. Configure BTL Display (Optional)
   ├─ Click "BTL: 3,4" button
   ├─ Select which BTL levels to display
   └─ Click "Done"

5. Manage Data
   ├─ Search: Type in search box to filter students
   ├─ Zoom: Adjust slider to zoom table (50-150%)
   ├─ Reset: Click Reset → Select columns → Confirm
   └─ Export: Click "Export CSV"

6. Export Results
   └─ CSV File Downloaded: formative1_{subjectId}.csv
       ├─ Contains all student info
       ├─ Contains all mark entries
       └─ Contains all calculations
```

---

## State Transitions Diagram

```
Initial State
    │
    ├─ loading: true
    ├─ students: []
    ├─ error: null
    ├─ selectedBtls: [3, 4]  (from localStorage if exists)
    └─ marksByStudent: {}

    ▼

Fetching Students
    │
    ├─ Resolving department
    ├─ Making API calls
    └─ Loading: true

    ▼

Students Loaded Successfully
    │
    ├─ loading: false
    ├─ students: [StudentRecord, ...]
    ├─ error: null
    └─ marksByStudent: {}  (empty, waiting for user input)

    ▼

Ready for Mark Entry
    │
    User enters marks...
    │
    marksByStudent updates with each input
    │
    Calculations trigger automatically (useMemo)
    │
    Table re-renders with new calculations

    ▼

Optional: Reset / Export
    │
    ├─ Reset: Modal → Confirm → Clear selected columns
    └─ Export: Compile CSV → Download

    ▼

Session Complete
    │
    ├─ selectedBtls saved to localStorage
    └─ marksByStudent lost (unless exported)
```

---

## Error Handling Flow

```
API Call Made
    │
    ├─ Success (200)
    │   └─ Process data and update state
    │
    └─ Error (4xx, 5xx)
        │
        ├─ Network Error
        │   └─ setError("Failed to load students")
        │
        ├─ Data Parsing Error
        │   └─ setError("Invalid data format")
        │
        ├─ Missing Fields
        │   └─ Use fallback values (e.g., nameMap for missing names)
        │
        └─ Permission Error
            └─ setError("Authentication required")

Display to User:
├─ Loading state: Show spinner
├─ Error state: Show error message
└─ Empty state: Show "No students found"
```

---

## Calculation Engine

```
Mark Input
    │
    ├─ Raw Values
    │   ├─ skill1: 3
    │   ├─ skill2: 4
    │   ├─ att1: 5
    │   └─ att2: 2
    │
    ├─ Validation Layer
    │   ├─ clampNumber(3, 0, 5) = 3 ✓
    │   ├─ clampNumber(4, 0, 5) = 4 ✓
    │   ├─ clampNumber(5, 0, 5) = 5 ✓
    │   └─ clampNumber(2, 0, 5) = 2 ✓
    │
    ├─ Calculation Layer (derived function)
    │   ├─ total = 3 + 4 + 5 + 2 = 14
    │   ├─ co1 = 3 + 5 = 8
    │   └─ co2 = 4 + 2 = 6
    │
    ├─ Percentage Layer (pct function)
    │   ├─ co1_pct = (8 / 10) × 100 = 80%
    │   └─ co2_pct = (6 / 10) × 100 = 60%
    │
    └─ BTL Mapping
        ├─ BTL-1 = 8 (enabled in default [3,4]? No)
        ├─ BTL-2 = 6 (enabled? No)
        ├─ BTL-3 = 8 (enabled? Yes) ✓
        ├─ BTL-4 = 6 (enabled? Yes) ✓
        ├─ BTL-5 = 8 (enabled? No)
        └─ BTL-6 = 6 (enabled? No)

Display:
├─ Skill 1: 3        Attitude 1: 5
├─ Skill 2: 4        Attitude 2: 2
├─ Total: 14
├─ CO-1: 8  (80%)
├─ CO-2: 6  (60%)
├─ BTL-3: 8 (80%)
└─ BTL-4: 6 (60%)
```

---

## Performance Optimization Points

```
Before Optimization              After Optimization
─────────────────              ─────────────────

All calculations               useMemo: derived()
  └─ Re-run on every          └─ Memoized result
    render                        └─ Only recalculates
                                   on mark change

All callbacks inline           useCallback hooks
  └─ New function              └─ Stable reference
    on every render               └─ Child memo
                                   optimization

Utilities inside               Module-level
  useEffect                      functions
  └─ Re-defined                  └─ Defined once
    on mount                       per component
                                   lifecycle

Search filtering               useMemo: filtered
  └─ Re-compute                └─ Cached results
    every render                  └─ Only
                                   recalculates on
                                   student/query
                                   change

Import calculations:   60+ FPS    60+ FPS (same performance with
Render performance:             cleaner code organization)
```

---

## Integration Points with OBE System

```
OBE Workflow
    ↓
Define Learning Outcomes (POs, PEOs)
    ↓
Design Course Outcomes (COs)
    ↓
Map Course Content to COs
    ↓
Design Assessments (CIA1, CIA2, etc.)
    ├─ Formative Assessment → Formative1List ◄─ You are here
    ├─ Continuous Assessment → MarkEntryTabs
    └─ Final Exam → MarkEntryTabs
    ↓
Enter Student Marks (Formative1List)
    ├─ Skill component 1 & 2
    ├─ Attitude component 1 & 2
    └─ Auto-calculate CO attainment
    ↓
Analyze Assessment Data
    ├─ Individual student performance
    ├─ Class-level CO attainment
    └─ BTL distribution
    ↓
Improve Course Design
    └─ Feedback loop to instruction
```

---

## File Organization

```
frontend/
├── src/
│   ├── components/
│   │   ├── Formative1List.tsx (848 lines) ◄─ NEW
│   │   ├── Loader.tsx (8 lines) ◄─ NEW
│   │   ├── MarkEntryTabs.tsx (MODIFIED) ◄─ Imports Formative1List
│   │   ├── DashboardSidebar.tsx
│   │   ├── Navbar.tsx
│   │   ├── CDAPEditor.tsx
│   │   ├── CDAPAnalysis.tsx
│   │   └── ... (other components)
│   │
│   ├── pages/
│   │   ├── CourseOBEPage.tsx
│   │   ├── MarkEntryPage.tsx
│   │   ├── OBEPage.tsx
│   │   └── ... (other pages)
│   │
│   ├── services/
│   │   ├── cdapDb.ts
│   │   ├── dashboard.ts
│   │   ├── obe.ts
│   │   └── auth.ts
│   │
│   ├── App.tsx
│   └── main.tsx
│
└── public/
    └── index.html

Documentation/ (in root)
├── FORMATIVE1_OPTIMIZATION.md (NEW)
├── FORMATIVE1_INTEGRATION_GUIDE.md (NEW)
├── FORMATIVE1_QUICK_REFERENCE.md (NEW)
└── FORMATIVE1_IMPLEMENTATION_SUMMARY.md (NEW)
```

---

**Diagram Version**: 1.0  
**Last Updated**: 2025-01-31  
**Status**: Complete ✅
