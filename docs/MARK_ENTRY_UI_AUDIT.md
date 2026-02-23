# Mark Entry Components — Exhaustive UI Pattern Audit

> Generated from a line-by-line reading of every mark-entry component under  
> `frontend/src/components/`.

---

## Table of Contents

1. [Component Inventory](#1-component-inventory)
2. [Button Patterns](#2-button-patterns)
3. [Notification Patterns](#3-notification-patterns)
4. [Request / Edit-Request UI](#4-request--edit-request-ui)
5. [Publish / Save Behavior](#5-publish--save-behavior)
6. [Overall Layout Structure](#6-overall-layout-structure)
7. [Cross-Component Inconsistencies](#7-cross-component-inconsistencies)

---

## 1. Component Inventory

### Core Components (contain full logic + JSX)

| Component | File | Lines | Wraps in `AssessmentContainer`? |
|---|---|---|---|
| **Cia1Entry** | `Cia1Entry.tsx` | 2 572 | Yes |
| **ModelEntry** | `ModelEntry.tsx` | 2 776 | **No** (plain `<div>`) |
| **LabEntry** | `LabEntry.tsx` | 2 401 | Yes |
| **LabCourseMarksEntry** | `LabCourseMarksEntry.tsx` | 4 160 | Yes |
| **Formative1List** | `Formative1List.tsx` | 2 480 | Yes |
| **Ssa1SheetEntry** | `Ssa1SheetEntry.tsx` | 1 910 | Yes |
| **Ssa2SheetEntry** | `Ssa2SheetEntry.tsx` | 1 963 | Yes |
| **MarkEntryTabs** | `MarkEntryTabs.tsx` | 1 150 | N/A (tab shell) |

### Thin Wrapper Components (delegate to a core component)

| Wrapper | Delegates to | Extra props |
|---|---|---|
| `Ssa1Entry` | `<Ssa1SheetEntry assessmentKey="ssa1" />` | — |
| `Ssa2Entry` | `<Ssa2SheetEntry assessmentKey="ssa2" />` | — |
| `Review1Entry` | `<LabEntry assessmentKey="review1" coA={1} coB={2} />` | — |
| `Review2Entry` | `<LabEntry assessmentKey="review2" coA={2} coB={3} />` | — |
| `ReviewEntry` | `<LabCourseMarksEntry>` | `skipMarkManager`, `floatPanelOnTable`, `itemLabel="Content"`, `absentEnabled`, `autoSaveDraft` |
| `ReviewCourseMarkEntery` | `<LabCourseMarksEntry>` | Same as ReviewEntry; renders only for PROJECT class type |
| `Formative2List` | `<Formative1List assessmentKey="formative2" />` | — |

### Shared UI Primitives

| Component | Purpose |
|---|---|
| `AssessmentContainer` | Page-level gradient background + centered card wrapper |
| `PublishLockOverlay` | Conditional sticky lock banner + disabled children |
| `FacultyAssessmentPanel` | Exam selection sidebar for SPECIAL courses |

---

## 2. Button Patterns

### 2.1 CSS Class Vocabulary

All buttons use the `obe-btn` base class with optional variants:

| className | Visual Role | Typical Use |
|---|---|---|
| `obe-btn` | Neutral/default | Cancel, View, Close, secondary actions |
| `obe-btn obe-btn-primary` | Primary accent | Publish, Request Edit (main CTA) |
| `obe-btn obe-btn-success` | Green/success | Save Draft, Send Request, Confirm, Close (view modal) |
| `obe-btn obe-btn-secondary` | Muted secondary | Export CSV, Export Excel, Import Excel, Download, Show Absentees |
| `obe-btn obe-btn-danger` | Destructive | Reset, Reset All, Reset & Continue, IQAC Reset |
| `obe-sidebar-btn` | Sidebar tab | MarkEntryTabs sidebar buttons |
| `cqi-floating-btn` | Extended sidebar tab | Extended variant of sidebar button |

### 2.2 Button-by-Button Inventory per Component

#### Cia1Entry

| Button Text | className | Position | When Shown |
|---|---|---|---|
| Show absentees list | `obe-btn obe-btn-secondary` + active override (`background: '#fef3c7'`, `borderColor: '#fbbf24'`) | Left group | Always |
| Export CSV | `obe-btn obe-btn-secondary` | Left group | Always |
| Export Excel | `obe-btn obe-btn-secondary` | Left group | Always |
| Import Excel | `obe-btn obe-btn-secondary` | Left group (hidden file input) | Always |
| Download | `obe-btn obe-btn-secondary` | Left group | Always |
| Save Draft | `obe-btn obe-btn-success` | Right group | Always |
| Publish / Request Edit | `obe-btn obe-btn-primary` | Right group | Toggle based on `publishButtonIsRequestEdit` |
| Mark Manager Save/Edit | `obe-btn obe-btn-success` | Mark Manager panel | Always |
| Request Approval | `obe-btn obe-btn-primary` | Mark Manager panel | When locked |
| View (published panel) | `obe-btn` | Floating panel | When published-locked |
| Request Edit (published panel) | `obe-btn obe-btn-success` | Floating panel | When published-locked |
| Send Request (edit modal) | `obe-btn obe-btn-success` | Edit request modal | In modal |
| Cancel (edit modal) | `obe-btn` | Edit request modal | In modal |
| Confirm (MM modal) | `obe-btn obe-btn-success` | Mark Manager modal | In modal |
| Cancel (MM modal) | `obe-btn` | Mark Manager modal | In modal |

**Button bar layout:**
```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {/* Left: absentees, export, import, download */}
  </div>
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    {/* Right: Save Draft, Publish + timestamps */}
  </div>
</div>
```

#### ModelEntry

| Button Text | className | Position | Notes |
|---|---|---|---|
| Save Draft | `obe-btn obe-btn-success` | Single flex row | — |
| Export CSV | `obe-btn obe-btn-secondary` | Single flex row | — |
| Export Excel | `obe-btn obe-btn-secondary` | Single flex row | — |
| Import Excel | `obe-btn obe-btn-secondary` | Single flex row | — |
| Publish / Request Edit | `obe-btn obe-btn-primary` | Single flex row | — |
| View Published | `obe-btn` | Single flex row | — |
| Refresh Lock | `obe-btn` | Single flex row | — |
| Show absentees list | `obe-btn` | Single flex row | ⚠️ Missing `obe-btn-secondary` |
| Request Approval | `obe-btn obe-btn-success` | Mark Manager panel | — |
| View (published panel) | `obe-btn` | Floating pill panel | — |
| Edit (published panel) | `obe-btn obe-btn-success` | Floating pill panel | — |
| Send Request (edit modal) | `obe-btn obe-btn-success` | Edit request modal | — |

**Button bar layout:**
```jsx
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
  {/* All buttons in single row */}
</div>
```

#### LabEntry

| Button Text | className | Position |
|---|---|---|
| Save Draft | `obe-btn obe-btn-success` | Button bar |
| Reset All | `obe-btn obe-btn-danger` | Button bar |
| Publish / Request Edit | `obe-btn obe-btn-primary` | Button bar |
| Save & Lock / Request Edit (MM) | `obe-btn obe-btn-success` | Mark Manager panel |
| View Marks | `obe-btn` | Floating panel |
| Edit (published panel) | `obe-btn obe-btn-success` | Floating panel |
| Request Edit (edit modal) | `obe-btn obe-btn-primary` | Edit request modal |
| Cancel (edit modal) | `obe-btn` | Edit request modal |
| 🔒 Confirm & Lock (MM modal) | `obe-btn obe-btn-success` | MM confirmation modal |
| Request Edit (MM request modal) | `obe-btn obe-btn-success` | MM request modal |

**Button bar layout:**
```jsx
<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
```

#### LabCourseMarksEntry

| Button Text | className | Position |
|---|---|---|
| Save / Edit (MM panel) | `obe-btn obe-btn-success` | Mark Manager panel |
| Save Draft | `obe-btn obe-btn-success` | Button bar |
| Download | `obe-btn obe-btn-secondary` | Button bar |
| Reset | `obe-btn obe-btn-danger` | Button bar |
| Publish / Request Edit | `obe-btn obe-btn-primary` | Button bar |
| View (published panel) | `obe-btn` | Floating panel |
| Request Edit (published panel) | `obe-btn obe-btn-success` | Floating panel |
| Cancel (MM modal) | `obe-btn` | MM modal |
| Confirm / Send Request (MM modal) | `obe-btn obe-btn-success` | MM modal |
| Cancel (edit modal) | `obe-btn` | Edit request modal |
| Send Request (edit modal) | `obe-btn obe-btn-success` | Edit request modal |
| Close (view modal) | `obe-btn obe-btn-success` | View marks modal |
| Reset & Continue | `obe-btn obe-btn-danger` | CO diff modal |
| Reset CO column(s) | `obe-btn obe-btn-primary` | MM reset modal |
| Reset full data | `obe-btn obe-btn-danger` | MM reset modal |

**Button bar layout:**
```jsx
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
```

#### Formative1List

| Button Text | className | Position |
|---|---|---|
| Export CSV | `obe-btn obe-btn-secondary` | Left group |
| Export Excel | `obe-btn obe-btn-secondary` | Left group |
| Import Excel | `obe-btn obe-btn-secondary` | Left group |
| Download | `obe-btn obe-btn-secondary` | Left group |
| Save Draft | `obe-btn obe-btn-success` | Right group |
| Publish / Request Edit | `obe-btn obe-btn-primary` | Right group |
| Save Mark Manager | `obe-btn obe-btn-success` | Locked overlay panel |
| Request Access | `obe-btn` | Locked overlay panel |
| View | `obe-btn` | Published panel |
| Request Edit | `obe-btn obe-btn-success` | Published panel |
| Cancel (MM modal) | `obe-btn` | MM modal |
| Confirm / Send Request | `obe-btn obe-btn-success` | MM modal |
| Close (view modal) | `obe-btn obe-btn-success` | View marks modal |
| Cancel (edit modal) | `obe-btn` | Edit request modal |
| Send Request | `obe-btn obe-btn-success` | Edit request modal |

**Button bar layout:** Same two-part flex as Cia1Entry (`justifyContent: 'space-between'`).

#### Ssa1SheetEntry

| Button Text | className | Position |
|---|---|---|
| Load/Refresh Roster | `obe-btn obe-btn-secondary` | Left group |
| Reset Marks | `obe-btn obe-btn-danger` | Left group |
| Show absentees list | `obe-btn obe-btn-secondary` + active override | Left group |
| Export CSV | `obe-btn obe-btn-secondary` | Left group |
| Export Excel | `obe-btn obe-btn-secondary` | Left group |
| Import Excel | `obe-btn obe-btn-secondary` | Left group |
| Download | `obe-btn obe-btn-secondary` | Left group |
| Save Draft | `obe-btn obe-btn-success` | Right group |
| Publish / Request Edit | `obe-btn obe-btn-primary` | Right group |
| Save / Edit (MM panel) | `obe-btn obe-btn-success` | Mark Manager panel |
| View (published panel) | `obe-btn` | Published panel |
| Request Edit / Save Mark Manager | `obe-btn obe-btn-success` / `obe-btn obe-btn-success` | Published panel |
| Cancel (edit modal) | `obe-btn` | Edit request modal |
| Send Request (edit modal) | `obe-btn obe-btn-success` | Edit request modal |
| Confirm / Send Request (MM modal) | `obe-btn obe-btn-success` | MM modal |

**Button bar layout:** Same two-part flex as Cia1Entry (`justifyContent: 'space-between'`).

#### Ssa2SheetEntry

Identical button patterns and layout to Ssa1SheetEntry. Uses CO-3/CO-4 instead of CO-1/CO-2.

One notable difference:
- **Edit Request modal** "Request Edit" button uses `obe-btn obe-btn-primary` (not `obe-btn-success`)
- **View Marks modal** "Close" button uses `obe-btn` (not `obe-btn-success`)

### 2.3 Disabled State Pattern

All components follow the same pattern for disabled buttons when `tableBlocked`:
```jsx
disabled={!subjectId || tableBlocked}
style={tableBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
```

---

## 3. Notification Patterns

### 3.1 Error Notifications

All components use the same inline error banner:
```jsx
<div style={{
  background: '#fef2f2',
  border: '1px solid #ef444433',
  color: '#991b1b',
  padding: 10,
  borderRadius: 10,
  marginBottom: 10,
  maxWidth: '100%',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
}}>
  {errorMessage}
</div>
```

**Used in:** Cia1Entry, LabCourseMarksEntry, LabEntry (via `alert()`), ModelEntry (via `alert()`).

### 3.2 Global Locked Notification

```jsx
<div style={{
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 10,
  padding: 10,
  marginBottom: 10,
  color: '#92400e',
}}>
  🔒 Publishing is currently locked by IQAC.
</div>
```

**Used in:** Cia1Entry, Formative1List, Ssa1SheetEntry, Ssa2SheetEntry.

**Not used in:** ModelEntry, LabEntry, LabCourseMarksEntry (these check `globalLocked` but don't show a banner — they disable buttons instead).

### 3.3 Publish Window Closed Notification

```jsx
<div style={{
  background: '#fff7ed',
  border: '1px solid #fecaca',
  borderRadius: 10,
  padding: 10,
  marginBottom: 10,
}}>
```

**Used in:** Cia1Entry, Formative1List, Ssa1SheetEntry, Ssa2SheetEntry.

### 3.4 Publish Window Due-Time Display

Conditional color based on time remaining:
- Green (`#065f46`) when ample time
- Amber (`#92400e` / `#b45309`) when approaching
- Red (`#991b1b`) when expired

**Used in:** Cia1Entry, Formative1List, Ssa1SheetEntry, Ssa2SheetEntry.

### 3.5 Master Config / Mark Manager Warning

```jsx
<div style={{
  background: '#fffbeb',
  border: '1px solid #fcd34d',
  borderRadius: 10,
  padding: 10,
  marginBottom: 10,
  color: '#92400e',
}}>
```

**Used in:** Cia1Entry (warning about master config not set).

### 3.6 "Name list locked" Success Banner (SSA only)

```jsx
<div style={{
  background: '#ecfdf5',
  border: '1px solid #bbf7d0',
  borderRadius: 10,
  padding: 10,
  marginBottom: 10,
  color: '#065f46',
}}>
```

**Used in:** Ssa2SheetEntry (after save when `showNameListLockedNotice` is true).

### 3.7 Confirmation Method

| Component | Method | Notes |
|---|---|---|
| Cia1Entry | Inline state messages | `statusMsg` state |
| ModelEntry | `alert()` | Some actions |
| LabEntry | `alert()` | Mark Manager save/fail, edit request |
| LabCourseMarksEntry | `alert()` | Mark Manager fails, reset fails |
| Formative1List | `alert()` | Mark Manager, edit requests |
| Ssa1SheetEntry | `alert()` | Mark Manager, edit requests |
| Ssa2SheetEntry | `alert()` | Mark Manager, edit requests |
| FacultyAssessmentPanel | `alert()` | Save and request |

### 3.8 Info Cards

Used in Ssa1SheetEntry, Ssa2SheetEntry, and LabCourseMarksEntry to show Term/Batch/Saved/Published metadata:

```jsx
<div style={{
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
  background: '#fff',
}}>
  <div style={{ fontSize: 12, color: '#6b7280' }}>Label</div>
  <div style={{ fontWeight: 700 }}>Value</div>
</div>
```

### 3.9 Status Bar (LabEntry only)

Emoji-based status indicators in the button area:
- 💾 `Saved at {time}`
- ✅ `Published at {time}`
- ⏰ `{remaining} left`

---

## 4. Request / Edit-Request UI

### 4.1 Edit Request Modal — Structure

All components follow the same modal pattern:

```jsx
<div role="dialog" aria-modal="true"
  style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'grid', placeItems: 'center',
    padding: 16, zIndex: 60,
  }}>
  <div style={{
    width: 'min(560px, 96vw)',
    background: '#fff', borderRadius: 14,
    border: '1px solid #e5e7eb', padding: 14,
  }}>
    {/* Header: title + assessment label */}
    {/* Context info: Subject, Code, Published, Saved */}
    {/* Textarea: reason (required) */}
    {/* Footer: Cancel + Send Request buttons */}
  </div>
</div>
```

### 4.2 Edit Request Modal — Per-Component Differences

| Component | Modal Title | "Send" Button Class | "Send" Button Text | Context Fields |
|---|---|---|---|---|
| Cia1Entry | "Request Edit" | `obe-btn obe-btn-success` | "Send Request" | Subject, Code |
| ModelEntry | "Request Edit" | `obe-btn obe-btn-success` | "Send Request" | Subject, Code |
| LabEntry | "Edit Request" | `obe-btn obe-btn-primary` | "Request Edit" | Subject, Code, Published, Saved |
| LabCourseMarksEntry | "Edit Request" | `obe-btn obe-btn-success` | "Send Request" | Subject, Code, Published, Saved |
| Formative1List | "Edit Request" | `obe-btn obe-btn-success` | "Send Request" | Subject ID |
| Ssa1SheetEntry | "Edit Request" | `obe-btn obe-btn-success` | "Send Request" | — |
| Ssa2SheetEntry | "Edit Request" | `obe-btn obe-btn-primary` | "Request Edit" | Subject, Published, Saved |

**⚠️ Inconsistency:** LabEntry and Ssa2SheetEntry use `obe-btn-primary` for the send button, while all others use `obe-btn-success`.

**⚠️ Inconsistency:** LabEntry says "Request Edit" while most others say "Send Request".

### 4.3 Edit Request — Backend Interaction

All components use `requestMarkEntryEdit()` from `useEditWindow` hook or a local `requestMarkEntryEdit` function. The flow:

1. User clicks "Request Edit" on published-locked panel → opens modal
2. User enters reason in `<textarea>`
3. Clicks send → POST to backend
4. On success: some components call `alert()`, some update inline state
5. **Polling:** LabEntry, LabCourseMarksEntry poll via `useEditWindow` to check if IQAC approved

### 4.4 Mark Manager Request Edit

Separate from the published edit request. When the Mark Manager is locked and faculty needs changes:

| Component | Trigger Button Text | className | Method |
|---|---|---|---|
| Cia1Entry | "Request Approval" | `obe-btn obe-btn-primary` | Opens MM modal in `request` mode |
| LabEntry | "Request Edit" (MM panel) | `obe-btn obe-btn-success` | Opens MM modal in `request` mode |
| LabCourseMarksEntry | "Edit" (MM panel) | `obe-btn obe-btn-success` | Opens MM modal in `request` mode |
| Formative1List | "Request Access" | `obe-btn` | Calls `requestMarkManagerEdit()` |
| Ssa1SheetEntry | "Edit" (MM panel) | `obe-btn obe-btn-success` | Opens MM modal in `request` mode |
| Ssa2SheetEntry | "Edit" (MM panel) | `obe-btn obe-btn-success` | Opens MM modal in `request` mode |

### 4.5 Mark Manager Confirmation Modal

| Component | Confirm Button | Table Columns | Special Features |
|---|---|---|---|
| Cia1Entry | "Confirm" (`obe-btn-success`) | Question / Max / BTL | BTL dropdown per question |
| LabEntry | "🔒 Confirm & Lock" (`obe-btn-success`) | CO / Experiments / CAA | ⚠️ warning icon, Lock emoji |
| LabCourseMarksEntry | "Confirm" (`obe-btn-success`) | CO / Experiments / Max marks | CIA Exam row if available |
| Formative1List | "Confirm" (`obe-btn-success`) | Item / Value | Part-based BTL selectors (Skill1/2, Att1/2) |
| Ssa1SheetEntry | "Confirm" (`obe-btn-success`) | Item / Value | Interactive BTL checkboxes in modal |
| Ssa2SheetEntry | "Confirm" (`obe-btn-success`) | Item / Value | Interactive BTL checkboxes in modal |

---

## 5. Publish / Save Behavior

### 5.1 Save Draft

| Component | Button Text | className | Saving Text | AutoSave |
|---|---|---|---|---|
| Cia1Entry | "Save Draft" | `obe-btn-success` | "Saving…" | No |
| ModelEntry | "Save Draft" | `obe-btn-success` | "Saving…" | No |
| LabEntry | "Save Draft" | `obe-btn-success` | "Saving…" | No |
| LabCourseMarksEntry | "Save Draft" | `obe-btn-success` | "Saving…" | Via `autoSaveDraft` prop (debounced) |
| Formative1List | "Save Draft" | `obe-btn-success` | "Saving…" | No |
| Ssa1SheetEntry | "Save Draft" | `obe-btn-success` | "Saving…" | No |
| Ssa2SheetEntry | "Save Draft" | `obe-btn-success` | "Saving…" | No |

### 5.2 Publish

All components share the same Publish button pattern:
```jsx
<button
  className="obe-btn obe-btn-primary"
  disabled={publishButtonIsRequestEdit ? false : !subjectId || publishing || tableBlocked || globalLocked || !publishAllowed}
>
  {publishButtonIsRequestEdit ? 'Request Edit' : publishing ? 'Publishing…' : 'Publish'}
</button>
```

Post-publish flow:
1. `publish()` → API call
2. On success: `setPublishedAt(...)`, `setPublishedEditLocked(true)` (where applicable)
3. Table becomes locked with green overlay
4. Published-locked floating panel appears

### 5.3 Publish Window Guard

Determined by `usePublishWindow` hook. Components check:
- `publishAllowed` — whether current time is within window
- `globalLocked` — whether IQAC has globally locked publishing
- Window open/close times displayed with conditional coloring

### 5.4 Post-Publish Lock States

| Component | Lock Mechanism | Overlay Color |
|---|---|---|
| Cia1Entry | `<PublishLockOverlay>` + floating panel (width: 320) | Default (from PublishLockOverlay) |
| ModelEntry | `<PublishLockOverlay>` + pill-shaped floating panel (borderRadius: 999) | Default |
| LabEntry | Green gradient `rgba(34,197,94,0.28)` → `rgba(16,185,129,0.36)` + floating panel with `lockong.png` | Green |
| LabCourseMarksEntry | Same green gradient + floating panel with `lockong.png` | Green |
| Formative1List | Green gradient `rgba(34,197,94,0.18)` → `rgba(16,185,129,0.26)` + floating panel (width: 320) | Green (lighter) |
| Ssa1SheetEntry | Centered lock panel with 🔒 emoji; no gradient overlay on table | Text-only |
| Ssa2SheetEntry | Same as Ssa1SheetEntry | Text-only |

---

## 6. Overall Layout Structure

### 6.1 AssessmentContainer

**File:** `AssessmentContainer.tsx`

```jsx
// Outer wrapper
<div style={{
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 65%)',
  padding: '18px 14px',
}}>
  // Inner card
  <div style={{
    borderRadius: 16,
    background: 'rgba(255,255,255,0.88)',
    boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
    backdropFilter: 'blur(10px)',
    maxWidth: 1400,
    margin: '0 auto',
    padding: '18px 16px',
  }}>
    {children}
  </div>
</div>
```

**⚠️ ModelEntry does NOT use AssessmentContainer** — it renders a plain `<div>` without the gradient background or card wrapper.

### 6.2 PublishLockOverlay

```jsx
// When locked=true:
<div style={{ position: 'relative' }}>
  // Sticky banner at top
  <div style={{
    position: 'sticky', top: 0, zIndex: 40,
    background: '#fff',
    border: '2px solid #fde68a',
    borderRadius: 12,
    padding: '10px 14px',
  }}>
    // Lock icon in #fef3c7 circle
    // Title + subtitle
  </div>
  // Children with disabled interaction
  <div style={{
    filter: 'brightness(0.97)',
    pointerEvents: 'none',
    userSelect: 'none',
  }}>
    {children}
  </div>
</div>
```

SSA1/SSA2 pass custom `title`/`subtitle` props to `PublishLockOverlay`.

### 6.3 Two Table Style Systems

#### System A: Green Flat Headers (CIA, Lab, LabCourse, Formative, Model)

```jsx
const cellTh: React.CSSProperties = {
  border: '1px solid #111',
  padding: '6px 4px',
  background: '#ecfdf5',
  color: '#065f46',
  fontWeight: 700,
  fontSize: 11,  // or 12 in some components
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const cellTd: React.CSSProperties = {
  border: '1px solid #d1d5db',
  padding: '4px 6px',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
```

Table wrapped in:
```jsx
<div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
  <table className="obe-table">
```

#### System B: Modern Blue Gradient Headers (SSA1, SSA2)

```jsx
const cellTh: React.CSSProperties = {
  padding: '7px 6px',
  background: 'linear-gradient(180deg, rgba(11,74,111,0.06) 0%, rgba(191,219,254,0.13) 100%)',
  color: '#0b4a6f',
  fontWeight: 800,
  fontSize: 11,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(148,163,184,0.5)',
  borderRight: '1px solid rgba(148,163,184,0.22)',
  letterSpacing: '0.01em',
};
```

Uses `ssa-modern-table` class with embedded `<style>`:
```css
.ssa-modern-table th:last-child,
.ssa-modern-table td:last-child { border-right: none; }
.ssa-modern-table tbody tr:nth-child(even) td { background: #fbfdff; }
.ssa-modern-table tbody tr:hover td { background: rgba(2, 132, 199, 0.03); }
```

### 6.4 Mark Input Cells

```jsx
const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '4px 2px',
  textAlign: 'center',
  fontSize: 12,
  outline: 'none',
  background: '#fff',
};
```

Mark input cells use `background: '#fff7ed'` on `<td>`.

**ModelEntry exception:** Uses `excelInputStyle` with different padding/dimensions.

### 6.5 Mark Manager Panel

All components with a Mark Manager use a similar card layout:

```jsx
<div style={{
  border: '1px solid #fcd34d',   // or #e5e7eb
  borderRadius: 12,
  padding: '10px 12px',
  marginBottom: 12,
  background: markManagerLocked ? '#f3f4f6' : '#fff7ed',
}}>
```

LabEntry and LabCourseMarksEntry add:
- `ClipboardList` icon from `lucide-react` (size: 18)
- LOCKED/EDITABLE badge: `color: '#dc2626'` / `color: '#16a34a'`
- Glitch animation CSS (`@keyframes markManagerGlitch`, `@keyframes markManagerDust`)

SSA1/SSA2 use BTL pill-style checkboxes:
```jsx
const btlBoxStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  border: '1.5px solid ...',
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
```

### 6.6 Floating Lock Panels

Three distinct visual treatments:

**A. Cia1Entry floating panel:**
```jsx
style={{
  position: 'absolute', top: 10, right: 10,
  width: 320,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 14,
  boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
}}
```
Title: "Published — Locked" (fontWeight: 950, color: '#065f46')

**B. ModelEntry pill panel:**
```jsx
style={{
  position: 'relative',
  background: '#fff',
  border: '1px solid rgba(2,6,23,0.10)',
  borderRadius: 999,  // pill shape
  padding: '8px 14px',
  display: 'inline-flex',
  gap: 10,
}}
```
Lock icon in `#fef3c7` circle.

**C. LabEntry/LabCourseMarksEntry floating panel:**
```jsx
// floatingPanelStyle (LabCourseMarksEntry)
style={{
  position: 'absolute',
  left: '50%', top: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 40,
  width: 160,  // or 170 in LabEntry
  borderRadius: 12,
  background: '#fff',
  border: '1px solid rgba(2,6,23,0.08)',
  padding: 14,
  boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
}}
```
Includes lock GIF image from `https://media.lordicon.com/icons/wired/flat/94-lock-unlock.gif`.

**D. Formative1List floating panel:**
```jsx
style={{
  position: 'absolute',
  left: '50%', top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 320,
  // ... same card styles
}}
```

**E. SSA1/SSA2 centered lock panel:**
```jsx
// When showNameList = false, uses centered grid layout
<div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
  <div style={{ fontWeight: 800, fontSize: 16 }}>Published — Locked</div>
  <div style={{ color: '#6b7280' }}>...</div>
  <div style={{ display: 'flex', gap: 8 }}>
    {/* View + Request Edit buttons */}
  </div>
</div>
```

When `showNameList = true`, uses floating panel (width: 360):
```jsx
style={{
  position: 'absolute',
  left: '50%', top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 360,
  // ...
}}
```

### 6.7 Modal Dialogs

All modals share the same backdrop:
```jsx
<div role="dialog" aria-modal="true"
  style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'grid', placeItems: 'center',
    padding: 16,
    zIndex: varies,  // 50-9999
  }}>
```

Modal container:
```jsx
<div style={{
  width: 'min(Xpx, 96vw)',
  background: '#fff',
  borderRadius: 14,   // or 12 in some
  border: '1px solid #e5e7eb',
  padding: 14,
}}>
```

**zIndex values by modal type:**

| Modal | Component(s) | zIndex |
|---|---|---|
| Mark Manager | Cia1Entry | 50 |
| Mark Manager | Formative1List, Ssa1, Ssa2 | 9999 |
| Mark Manager | LabCourseMarksEntry | 50 |
| Edit Request | All | 60 |
| View Marks | LabCourseMarksEntry, Ssa2SheetEntry | 70 |
| View Marks | Formative1List | 60 |
| CO Diff | LabCourseMarksEntry | 90 |
| MM Reset | LabCourseMarksEntry | 95 |

**⚠️ Inconsistency:** Mark Manager modal zIndex varies from 50 to 9999 across components.

### 6.8 Absent Handling UI

Used in: Cia1Entry, ModelEntry, LabCourseMarksEntry (when `absentEnabled` prop), Ssa1SheetEntry, Ssa2SheetEntry.

```jsx
<td>
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
    <input type="checkbox" checked={absent} onChange={...} />
    {absent ? (
      <div className="obe-ios-select" title="Absent type">
        <span className="obe-ios-select-value">{kind}</span>
        <select>
          <option value="AL">AL</option>
          <option value="ML">ML</option>
          <option value="SKL">SKL</option>
        </select>
      </div>
    ) : null}
  </div>
</td>
```

---

## 7. Cross-Component Inconsistencies

### 7.1 Critical Inconsistencies

| # | Issue | Details |
|---|---|---|
| 1 | **AssessmentContainer not used by ModelEntry** | ModelEntry renders a plain `<div>` while all other core components use `<AssessmentContainer>`. This means ModelEntry lacks the gradient background, card wrapper, maxWidth constraint, and backdrop blur. |
| 2 | **Edit Request send-button class varies** | LabEntry and Ssa2SheetEntry use `obe-btn obe-btn-primary`; all others use `obe-btn obe-btn-success`. The same action has different visual weight. |
| 3 | **Edit Request send-button text varies** | LabEntry says "Request Edit"; all others say "Send Request". |
| 4 | **Mark Manager modal zIndex varies wildly** | Cia1Entry/LabCourseMarksEntry use `zIndex: 50`; Formative1List/Ssa1/Ssa2 use `zIndex: 9999`. This can cause stacking issues. |
| 5 | **Global locked banner inconsistent** | Cia1Entry, Formative1List, SSA1, SSA2 show an inline banner. ModelEntry, LabEntry, LabCourseMarksEntry do not — they only disable buttons. |
| 6 | **Confirmation method (`alert()` vs inline)** | Cia1Entry uses inline status messages. All others use `alert()` for success/failure feedback. |

### 7.2 Visual Inconsistencies

| # | Issue | Details |
|---|---|---|
| 7 | **Two table style systems** | SSA1/SSA2 use modern blue gradient headers (`ssa-modern-table`); all others use green flat headers. No shared constant or utility. |
| 8 | **Button bar layout differs** | Cia1Entry, Formative1List, SSA1, SSA2 use two-part `justifyContent: 'space-between'`. ModelEntry uses single `gap: 8`. LabEntry uses single `gap: 10`. LabCourseMarksEntry uses single `gap: 8`. |
| 9 | **Published-locked panel shape differs** | Cia1Entry: rectangular (320px wide, borderRadius: 12). ModelEntry: pill (borderRadius: 999). Lab/LabCourse: centered (160/170px). SSA: centered grid or 360px floating. Formative: centered 320px. |
| 10 | **ModelEntry "Show absentees list" missing secondary class** | Uses plain `obe-btn` instead of `obe-btn obe-btn-secondary` like Cia1Entry and SSA. |
| 11 | **View marks modal Close button class varies** | Formative1List and LabCourseMarksEntry use `obe-btn obe-btn-success`; Ssa2SheetEntry uses `obe-btn`. |
| 12 | **`cellTh` fontSize varies** | Cia1Entry/Formative: `fontSize: 12`. Lab/LabCourse: `fontSize: 11`. SSA: `fontSize: 11`. ModelEntry: mixed. |

### 7.3 Behavioral Inconsistencies

| # | Issue | Details |
|---|---|---|
| 13 | **Auto-save** | Only LabCourseMarksEntry supports `autoSaveDraft` (via prop). No other component auto-saves. |
| 14 | **Arrow-key navigation** | Only ModelEntry implements arrow-key cell navigation with `registerRef`/`focusRef`. |
| 15 | **Mark limit detection** | Only ModelEntry detects ML (60 cap) and SKL (75 cap) mark limits with a dialog. |
| 16 | **CO diff detection** | Only LabCourseMarksEntry detects changes between published and current Mark Manager configs and prompts for reset. |
| 17 | **Glitch animation** | LabEntry, LabCourseMarksEntry, Ssa1SheetEntry use `@keyframes markManagerGlitch` and `@keyframes markManagerDust`. Others do not. |
| 18 | **Lock image** | LabEntry/LabCourseMarksEntry use `lockong.png` from assets. Others use emoji (🔒) or animated GIF from lordicon.com. |

### 7.4 Summary Recommendation Matrix

| Area | Recommendation |
|---|---|
| AssessmentContainer | Wrap ModelEntry in `<AssessmentContainer>` |
| Button classes | Standardize edit request send button to `obe-btn obe-btn-success` everywhere |
| Button text | Standardize to "Send Request" everywhere |
| zIndex | Normalize modal zIndex to a shared constant (e.g., 50 for modals, higher for conflict dialogs) |
| Global locked banner | Add banner to ModelEntry, LabEntry, LabCourseMarksEntry |
| Confirmation | Replace `alert()` with inline toast/banner across all components |
| Table styles | Extract `cellTh`/`cellTd` to shared utility; delineate "green" vs "modern" as named variants |
| Button bar layout | Standardize to two-part `justifyContent: 'space-between'` across all components |
| Published-locked panel | Agree on one shape (floating card or centered grid) and use consistently |

---

*End of audit.*
