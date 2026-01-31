# Formative1List Integration Guide

## Files Created/Modified

### New Files Created
1. **[Formative1List.tsx](frontend/src/components/Formative1List.tsx)** (848 lines)
   - Complete optimized component for managing Formative-1 assessments
   - Integrates with OBE system via API
   - Features: Mark entry, BTL mapping, CSV export, reset functionality

2. **[Loader.tsx](frontend/src/components/Loader.tsx)** (8 lines)
   - Simple loading spinner component
   - Used during data fetch operations

### Files Modified
1. **[MarkEntryTabs.tsx](frontend/src/components/MarkEntryTabs.tsx)**
   - Added import: `import Formative1List from './Formative1List';`
   - Updated tab rendering to use `Formative1List` when `active === 'formative1'`
   - Added contextual description for Formative-1 tab

## How to Use

### Access the Component
1. Navigate to: **Courses OBE Page** → **Mark Entry Tab** → **Formative 1**
2. Or directly access via: `/obe/courses/{courseId}` → select "Mark Entry" tab

### Mark Entry Workflow
1. **Load Course**: Component automatically fetches enrolled students
2. **Enter Marks**:
   - **Skill 1 & 2**: Enter values 0-5
   - **Attitude 1 & 2**: Enter values 0-5
3. **View Calculations**:
   - **Total**: Auto-calculated (skill1 + skill2 + att1 + att2)
   - **CO-1**: Auto-calculated (skill1 + att1)
   - **CO-2**: Auto-calculated (skill2 + att2)
   - **BTL**: Auto-populated from CO values
4. **Select BTLs**: Click "BTL: 3,4" to toggle which BTL levels are visible
5. **Reset Data**: Click "Reset" to bulk clear columns
6. **Export**: Click "Export CSV" to download all marks and calculations

### Key Features

#### Search & Filter
- Search box filters students by:
  - Registration number (reg_no)
  - Roll number (roll_no)
  - Student name

#### Zoom Control
- Range: 50% to 150%
- Useful for viewing large datasets or high-res screens
- Zoom preference persists in localStorage

#### BTL Selection
- Default BTL levels: 3 and 4
- Selection persists in localStorage
- Affects which columns are displayed in the table

#### Reset Functionality
- Two-step confirmation:
  1. Select columns to reset
  2. Confirm action
- Resets selected columns to 0 for all students

#### CSV Export
- Includes all calculated fields
- Filename: `formative1_{subjectId}.csv`
- Suitable for further analysis or record keeping

## Data Flow

```
User Interface (Formative1List Component)
    ↓
React State Management (useState, useCallback, useMemo)
    ↓
API Calls (Django REST Backend)
    ↓
Student Records & Subject Data
    ↓
Calculation Engine (Skill + Attitude → CO → BTL)
    ↓
Display & Export
```

## API Endpoints Required

Ensure your Django backend has these endpoints:

```
GET  /api/subjects/{id}/              - Fetch subject details
GET  /api/students/                   - List students (with filters)
GET  /api/departments/                - Search departments
GET  /api/departments/{id}/           - Fetch department details
GET  /api/profiles/                   - Fetch user profiles
```

## Environment Configuration

In your `.env` file (or `vite.config.ts`):
```env
VITE_API_BASE=http://localhost:8000
```

For production:
```env
VITE_API_BASE=https://your-backend-domain.com
```

## Styling & Dependencies

### Tailwind CSS Classes Used
- `flex`, `gap-*`, `p-*` - Layout
- `text-*`, `font-*`, `text-slate-*` - Typography
- `border`, `rounded`, `bg-*` - Components
- `sticky`, `z-*` - Positioning
- `even:bg-slate-50`, `odd:bg-white` - Table rows

### Icon Library (lucide-react)
```tsx
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
```

## Performance Optimizations

1. **Memoization**:
   - `useCallback` for event handlers
   - `useMemo` for expensive calculations
   - Prevents unnecessary re-renders

2. **Lazy Loading**:
   - Students data loaded on mount
   - Department data fetched as needed

3. **Efficient Sorting**:
   - BigInt-aware registration number comparison
   - Avoids string comparison issues with large numbers

4. **LocalStorage Caching**:
   - BTL selections cached per session
   - Improves UX across navigation

## Error Handling

The component handles:
- Failed API requests (shows error message)
- Missing student data (shows "No students found")
- Invalid input values (auto-clamped to valid range)
- Missing profiles (fallback to nameMap)

## Troubleshooting

### Issue: Students not loading
**Solution**: 
- Check API_BASE environment variable
- Verify subject ID is correct
- Check browser console for API errors

### Issue: BTL columns showing as "disabled"
**Solution**: 
- Unselect all BTL levels using BTL picker
- Then select the BTLs you want to view

### Issue: Zoom not persisting
**Solution**: 
- Browser privacy settings may prevent localStorage
- Zoom preference resets on page refresh

### Issue: CSV export empty
**Solution**: 
- Ensure at least one mark entry exists
- Click Export button after entering marks

## Integration with OBE Workflow

```
1. Faculty Access → OBE Page
   ↓
2. Select Course
   ↓
3. Open "Mark Entry" Tab
   ↓
4. Click "Formative 1"
   ↓
5. Enter Marks (Skill, Attitude)
   ↓
6. CO & BTL Auto-calculated
   ↓
7. Export or Reset as needed
   ↓
8. Data ready for articulation matrix
```

## Future Integration Points

- [ ] Connect to backend persistence
- [ ] Bulk import via CSV
- [ ] Auto-calculate from rubrics
- [ ] Sync with articulation matrix
- [ ] Generate performance analytics
- [ ] Support for multiple assessments

## Support & Maintenance

For issues or enhancements:
1. Check component documentation in code comments
2. Review error messages in browser console
3. Verify API responses in Network tab
4. Check localStorage for cached data

---

**Last Updated**: 2025-01-31
**Version**: 1.0 (Optimized)
**Status**: Ready for Production
