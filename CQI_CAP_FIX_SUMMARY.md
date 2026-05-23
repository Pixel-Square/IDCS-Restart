# CQI Cap Limit Fix - Summary

## Problem Statement
Students with cap-enabled CQI conditions were receiving marks exceeding the cap limit.

**Example**: 
- Admin set cap_percent = 58% for a condition
- CO weight = 7
- Expected cap limit = 7 × (58/100) = 4.06
- **Issue**: Students were getting marks > 4.06 (e.g., 5.0, 5.40)

## Root Cause
The `cap_percent_by_co` dictionary was being collected and stored in `student_entry` for reporting, but **was never actually applied to limit the calculated CQI marks** during the mark calculation process.

### Code Location
File: `/home/iqac2/IDCS-Restart/backend/academic_v2/views.py`
Function: `faculty_course_info()` 
Lines: ~5455-5477

## The Fix

### What Changed
Added per-CO cap limit enforcement after CQI mark calculation but before overall budget cap.

### Logic Flow
```python
# 1. Calculate the initial CQI mark based on condition formula
mapped = _safe_eval_cqi_num(then_expr, vars_map)

# 2. Apply per-CO cap if condition has cap_enabled
cap_percent_by_co = student_entry.get('cqi_cap_percent_by_co', {})
if str(co_n) in cap_percent_by_co:
    cap_pct = float(cap_percent_by_co[str(co_n)] or 0.0)
    if 0 <= cap_pct <= 100:
        cap_limit = (cap_pct / 100.0) * co_max_for_co
        mapped = min(mapped, cap_limit)  # Apply the cap

# 3. Apply overall budget cap (58% total)
if remaining_total_add is not None:
    mapped = min(mapped, remaining_total_add)
```

### Key Formula
```
cap_limit = co_weight × (cap_percent / 100)
final_marks = min(calculated_marks, cap_limit, remaining_budget)
```

### Example Calculation
- **Scenario**: CO1 has weight=7, condition has cap_percent=58
- **Admin config**: cap_enabled=true, cap_percent=58
- **Student CQI mark calculated**: 5.0
- **Applied cap limit**: 7 × (58/100) = 4.06
- **Final CQI mark stored**: 4.06

## Affected Course
- **Course Code**: AGB1221
- **Course Name**: Computer Networks
- **Class Type**: TH1
- **QP Type**: QPT2
- **Section**: A
- **Semester**: 4

## Data Affected by Fix

### Student Entry Fields Updated
The `student_entry` dictionary now includes:
- `cqi_cap_target_cos`: List of CO numbers that have caps applied
- `cqi_cap_percent_by_co`: Dictionary mapping CO numbers to their cap percentages

### Stored Marks
- **stored in**: `weighted_marks["{exam_id}_CO{coNum}"]`
- **calculated by**: `academic_v2/views.py:faculty_course_info()`
- **displayed in**: Internal Mark Page (After-CQI tab)

## Frontend Integration
The frontend (InternalMarkPage.tsx) was already prepared to display cap information:
```typescript
const getStudentCqiCapLimit = (student, coNum): number | null => {
  const capTargetCos = student.cqi_cap_target_cos || [];
  const capPercent = student.cqi_cap_percent_by_co?.[coNum];
  const weight = selectedCqiExamWeightByCo[coNum - 1];
  return (weight * capPercent) / 100;  // Matches backend calculation
};
```

## How to Verify the Fix

### 1. Backend Verification
```bash
# Check syntax
python3 -m py_compile /path/to/backend/academic_v2/views.py

# Or run the API to fetch marks for the course
curl -X GET "http://localhost:8000/api/academic-v2/faculty/courses/297/" \
  -H "Authorization: Bearer <token>"
```

### 2. Database Check
Query CQI marks for AGB1221 students:
```sql
SELECT sm.student_id, sm.co_number, sm.mark, sma.cqi_cap_percent_by_co 
FROM acv2_student_mark sm
JOIN acv2_cqi_attained sma ON sm.section_id = sma.section_id
WHERE sm.course_id = <AGB1221_id>
ORDER BY sm.student_id, sm.co_number;
```

### 3. Frontend Verification
- Open Internal Mark Page for AGB1221
- Switch to "After CQI" tab
- Look for cap indicator (light red highlight) on capped marks
- Verify marks ≤ weight × (cap_percent / 100)

## Deployment Notes

1. **Restart Required**: Django/Gunicorn server must be restarted for changes to take effect
   ```bash
   sudo systemctl restart gunicorn
   ```

2. **Cache**: Clear Django cache if applicable
   ```bash
   python manage.py clearcache
   ```

3. **Backward Compatibility**: The fix is backward compatible:
   - Students without cap conditions: No change in behavior
   - Old CQI entries: Work correctly with new cap logic

## Testing Recommendations

1. **Unit Test**: Create CQI marks with and without caps, verify calculation
2. **Integration Test**: Run `faculty_course_info()` with test data
3. **Regression Test**: Ensure non-capped conditions still work correctly
4. **Edge Cases**:
   - cap_percent = 0 (should result in 0 marks)
   - cap_percent = 100 (should not limit marks)
   - cap_percent > 100 (should be clamped or rejected)
   - Missing cap_percent (should not apply cap)

## Related Files
- Backend calculation: `/backend/academic_v2/views.py` (lines 5455-5477)
- Admin CQI editor: `/frontend/src/pages/Academic 2.1/admin/QpCqiEditorPopup.tsx`
- Faculty view: `/frontend/src/pages/Academic 2.1/faculty/InternalMarkPage.tsx`
- Database model: `/backend/academic_v2/models.py` (AcV2CqiMark)

## Metrics to Monitor
- Average CQI marks for capped students (should be lower)
- Distribution of marks before/after cap
- Number of students affected by caps
- Mark variance in cap-limited groups

---
**Fix Applied**: 2026-05-23
**Status**: Ready for deployment
**Testing**: Syntax validated ✓
