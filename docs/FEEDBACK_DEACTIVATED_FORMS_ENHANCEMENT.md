# Feedback Module: Deactivated Forms Enhancement

## Overview
Enhanced the Feedback module to improve the visual presentation and organization of deactivated feedback forms. Deactivated forms now appear at the bottom of the list with clear visual indicators.

## Changes Implemented

### 1. Backend Sorting Enhancement
**File:** `backend/feedback/views.py`

#### Changes:
- Added imports for Django query annotations: `Case`, `When`, `Value`, `IntegerField`
- Modified `GetFeedbackFormsView` to sort forms by priority for HOD users:
  - **Priority 0**: Active forms (status='ACTIVE', active=True)
  - **Priority 1**: Draft forms (status='DRAFT')
  - **Priority 2**: Deactivated forms (status='ACTIVE', active=False)
  - **Priority 3**: Closed forms (status='CLOSED')
  - Within each priority, forms are sorted by creation date (newest first)

#### Code:
```python
forms = FeedbackForm.objects.filter(
    created_by=user
).annotate(
    status_priority=Case(
        When(status='ACTIVE', active=True, then=Value(0)),
        When(status='DRAFT', then=Value(1)),
        When(status='ACTIVE', active=False, then=Value(2)),
        When(status='CLOSED', then=Value(3)),
        default=Value(4),
        output_field=IntegerField()
    )
).order_by('status_priority', '-created_at')
```

### 2. Frontend Visual Enhancement
**File:** `frontend/src/pages/feedback/FeedbackPage.tsx`

#### Changes:
- Added `isDeactivated` constant to identify deactivated forms
- Enhanced card styling for deactivated forms:
  - **Background**: Grey (`bg-slate-100`)
  - **Opacity**: Reduced to 60% (`opacity-60`)
  - **Border**: Slate grey (`border-slate-300`)
  - **Text**: Muted slate color for titles and text
  - **No hover effects**: Removed interactive hover styles

- Updated status badges:
  - **Active**: Green badge (`bg-green-500`)
  - **Draft**: Grey badge (`bg-slate-400`)
  - **Deactivated**: Red badge (`bg-red-500`)

- Modified action buttons:
  - **View Responses**: 
    - Active forms: Blue button (`bg-indigo-600`)
    - Deactivated forms: Grey button (`bg-slate-400`)
  - **Edit**: Hidden for deactivated forms (already disabled in original code)
  - **Activate/Deactivate**: Always visible for published forms

#### Visual Differences:

**Active Form Card:**
```css
- White background
- Clear borders
- Full opacity
- Hover effects enabled
- Blue action buttons
- Green "Active" badge
```

**Deactivated Form Card:**
```css
- Grey background (bg-slate-100)
- 60% opacity
- Muted text colors
- No hover effects
- Grey action buttons
- Red "Deactivated" badge
```

### 3. User Experience Improvements

#### For HOD Users:
1. **Clear Visual Hierarchy**: Active forms appear prominently at the top
2. **Easy Identification**: Deactivated forms are visually distinct and grouped at the bottom
3. **Preserved Functionality**: Can still view responses and reactivate forms
4. **Status Badges**: Clear color-coded indicators for form status

#### For Staff/Students:
- No changes needed - backend already filters out deactivated forms
- Users only see active forms (active=True, status='ACTIVE')

## Testing Recommendations

1. **Create Multiple Forms**: Create forms with different statuses (Active, Draft, Deactivated)
2. **Verify Sorting**: Check that forms appear in the correct order:
   - Active forms first
   - Draft forms second
   - Deactivated forms last
3. **Test Deactivation**: Deactivate an active form and verify it moves to the bottom
4. **Test Reactivation**: Reactivate a deactivated form and verify it moves back to the top
5. **Visual Verification**: Confirm deactivated forms have:
   - Grey background
   - Reduced opacity
   - Red "Deactivated" badge
   - Muted action buttons
6. **Student/Staff View**: Verify that non-HOD users don't see deactivated forms at all

## Implementation Benefits

✅ **Improved Organization**: Clear separation between active and inactive content
✅ **Better UX**: Users can quickly identify which forms are currently active
✅ **Maintained Data**: Deactivated forms preserve response data and can be reactivated
✅ **Cleaner Interface**: Reduced visual clutter with faded inactive forms
✅ **Explicit Status**: Color-coded badges provide instant status recognition

## Technical Notes

- The sorting uses Django's `annotate()` and `Case/When` for efficient database-level sorting
- No migration required - uses existing model fields
- Backward compatible - doesn't affect existing data or functionality
- Frontend changes use Tailwind CSS utility classes for styling
- Conditional rendering ensures different button states for active vs deactivated forms

## Files Modified

1. `backend/feedback/views.py`
   - Added sorting logic to `GetFeedbackFormsView`

2. `frontend/src/pages/feedback/FeedbackPage.tsx`
   - Enhanced form card rendering with conditional styling
   - Updated action button logic for deactivated forms

## Related Features

- Deactivate/Activate API: `POST /api/feedback/<id>/toggle-active`
- Publish Draft API: `POST /api/feedback/<id>/publish`
- View Responses API: Works for both active and deactivated forms (HOD only)

## Date
March 10, 2026
