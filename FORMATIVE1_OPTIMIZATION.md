# Formative1List Component - Optimization Summary

## Overview
The **Formative1List** component has been optimized and integrated into the OBE (Outcome-Based Education) system for managing Formative-1 assessment marks with BTL (Bloom's Taxonomy Level) mapping.

## Key Optimizations Made

### 1. **Code Organization & Performance**
- **Extracted utility functions** at module level (not inside useEffect):
  - `clampNumber()` - Input validation
  - `pct()` - Percentage calculation
  - `compareRegNo()` - BigInt-aware registration number sorting
  - `isLikelyUUID()` - UUID validation
  - `uniqueItems()` - Deduplication helper

- **Used `useCallback` hooks** for memoization:
  - `getMarks()` - Prevents unnecessary recalculations
  - `setRow()` - Stable callback reference
  - `derived()` - Stable calculation function
  - `toggleBtl()` - BTL selection toggle
  - `exportCsv()` - CSV export function
  - `handleReset()` - Reset confirmation handler

- **Used `useMemo` hooks** for expensive calculations:
  - `filtered` - Student filtering based on search query
  - `btlDisplayValue` - BTL display string

### 2. **API Integration**
- Replaced **Supabase direct calls** with **Django REST API** calls:
  - Uses `API_BASE` environment variable (`VITE_API_BASE`)
  - Implements JWT authentication via `authHeaders()`
  - Graceful fallback to localhost for development
  - Proper error handling and logging

### 3. **Component Architecture**
- Added proper **TypeScript interfaces**:
  - `F1Row` - Assessment marks structure
  - `StudentRecord` - Student data type
  - `Formative1ListProps` - Component props

- **Clear state separation**:
  - Data states: `loading`, `students`, `error`, `marksByStudent`
  - UI states: `query`, `zoom`, `selectedBtls`, `showBtlPicker`, etc.

- **Centralized CSS classes** for consistency:
  - `PCT_COL_CLASS` - Percentage column styling
  - `BTL_ENABLED_COL_CLASS` - Active BTL styling
  - `BTL_PCT_COL_CLASS` - BTL percentage styling
  - `DISABLED_CLASS` - Disabled input styling
  - `INPUT_CLASS` - Standard input styling

### 4. **Features**
✅ Student filtering by reg. no, roll no, or name
✅ Real-time zoom control (50-150%)
✅ BTL level selection with persistent localStorage
✅ Automatic CO (Course Outcome) calculation
✅ Automatic BTL percentage calculation
✅ Bulk reset with confirmation dialog
✅ CSV export with all calculated fields
✅ Department and year-based student filtering
✅ BigInt-aware registration number sorting

### 5. **Integration with OBE System**
- **Location**: `frontend/src/components/Formative1List.tsx`
- **Parent Component**: `MarkEntryTabs.tsx`
- **Route**: Accessible via Course OBE Page → Mark Entry → Formative 1 tab
- **Assessment Type**: Part of Continuous Internal Assessment (CIA 1)

## Component Props
```typescript
interface Formative1ListProps {
  subjectId?: string | null;    // Subject/Course ID
  subject?: any | null;         // Full subject object (optional)
}
```

## Data Structure

### F1Row (Marks)
```typescript
{
  skill1: number;      // Skill component 1 (0-5)
  skill2: number;      // Skill component 2 (0-5)
  att1: number;        // Attitude component 1 (0-5)
  att2: number;        // Attitude component 2 (0-5)
  btl1-btl6: number;   // BTL levels 1-6 (derived from CO1/CO2)
}
```

### Calculations
- **Total CIA1** = skill1 + skill2 + att1 + att2 (max 20)
- **CO1** = skill1 + att1 (max 10)
- **CO2** = skill2 + att2 (max 10)
- **BTL Odd (1,3,5)** = CO1 value (clamped to 0-10)
- **BTL Even (2,4,6)** = CO2 value (clamped to 0-10)

## Persistence
- **BTL selections** stored in `localStorage` under key: `formative1_selectedBtls`
- **Mark entries** stored in component state (temporary)
- Export to CSV for permanent storage

## Environment Variables
```env
VITE_API_BASE=http://localhost:8000  # Default for development
```

## API Endpoints Used
- `GET /api/subjects/{id}/` - Fetch subject details
- `GET /api/students/` - List students with filters
- `GET /api/departments/` - Search/fetch departments
- `GET /api/departments/{id}/` - Fetch single department
- `GET /api/profiles/` - Fetch user profiles

## Dependencies
- React 18+ (hooks)
- TypeScript
- Tailwind CSS (styling)
- lucide-react (icons: ZoomIn, ZoomOut, RotateCcw)

## Loader Component
A simple loading spinner component created as dependency:
- **Location**: `frontend/src/components/Loader.tsx`
- Shows spinning animation during data fetch
- Uses Tailwind CSS for styling

## Integration Points

### In MarkEntryTabs.tsx
```tsx
import Formative1List from './Formative1List';

// Within render:
{active === 'formative1' ? (
  <Formative1List subjectId={subjectId} />
) : (
  <MarkEntryTable subjectId={subjectId} tab={...} />
)}
```

## Testing Recommendations
1. Test with various registration number formats
2. Verify BTL calculations with edge cases
3. Test CSV export with special characters
4. Verify localStorage persistence across sessions
5. Test API error handling and retry logic
6. Test zoom functionality on different screen sizes
7. Verify search filtering performance with large datasets

## Future Enhancements
- [ ] Add save to backend functionality
- [ ] Add multi-student bulk actions
- [ ] Add formula-based autofill options
- [ ] Add undo/redo functionality
- [ ] Add data validation rules per BTL
- [ ] Add analytics dashboard for assessment metrics
- [ ] Add template/preset management
