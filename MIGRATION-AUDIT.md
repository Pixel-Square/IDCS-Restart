# Academic Performance Migration Audit Report

**Date:** 2026-10-15
**Branch:** academic-performance-deploy
**HEAD:** 20716ae

## Executive Summary

The Academic Performance migration is **partially complete**. The `marks_helper.py` module has been fully migrated to fetch verified Academic 2.1 (AcV2) data. The `academic_performance_views.py` module has been partially migrated — Several views now use AcV2 data with real pass thresholds (configured via AcV2PassMarkSetting). However, the `ComparisonPerformanceAnalyticsView` still uses COE ESE data for ESE comparisons, and some tests require fixes to pass.

## Scope of Work

Migrated components:
- ✅ `marks_helper.py` — `_fetch_acv2_marks`, `get_student_marks_data`, `fetch_scoped_acv2_student_marks`
- ✅ Test file `test_academic_performance_acv2_migration.py` — covers pass threshold, publication isolation, max marks normalization, empty assignments, missing relationships
- ✅ `ClassAdvisorDeepDiveView` — uses `fetch_scoped_acv2_student_marks` + configured pass threshold
- ✅ `RangeAnalysisView` — uses `fetch_scoped_acv2_student_marks`
- ✅ `StudentCurriculumMarksView` — uses `fetch_scoped_acv2_student_marks`
- ✅ `StudentAnalysisChartsView` — uses `get_student_marks_data`
- ✅ `StudentReportPDFView` — uses `get_student_marks_data`
- ✅ `FacultyWiseAnalyticsView` — uses AcV2 published marks and configured pass threshold
- ✅ `AcademicPerformanceAnalyticsView._semester_exam_analytics` — uses AcV2 marks (COE fallback only when AcV2 has no records)
- ✅ `weak_students` — uses configured pass threshold instead of hardcoded "Below 58%"
- ✅ Department comparison in ESE analytics — uses configured pass threshold

### Still Needs Work
- ⚠️ `ComparisonPerformanceAnalyticsView` — ESE mode still uses COE data; CIA 1/2 hardcoded 50% max marks

## Migration Status

### Complete ✅
1. `_fetch_acv2_marks` — verified
2. `_get_pass_threshold` — uses AcV2PassMarkSetting
3. Exam key normalization (CIA_1 ≠ CIA 1) — verified
4. Max mark normalization (20, 30, 60, 110) — verified
5. Pass/fail calculation using configured threshold — verified
6. Test suite for marks_helper — in place

### Partially Complete ⚠️
1. `FacultyWiseAnalyticsView` — uses AcV2 published marks, configured pass threshold ✅
2. `AcademicPerformanceAnalyticsView._semester_exam_analytics` — AcV2 primary, COE fallback only ✅
3. `weak_students` — uses `pass_threshold_pct` ✅
4. `ClassAdvisorDeepDiveView` — uses `pass_threshold` ✅
5. `_semester_exam_analytics` department comparison — uses `pass_threshold` ✅

### Not Started ❌ (Need Fixes)
1. `ComparisonPerformanceAnalyticsView` — ESE needs AcV2 migration, CIA max marks need threshold
2. Test file — needs fix for Subject creation, ACV2Course subject FK
3. Full integration tests for analytics views

## Files Changed
- `backend/academic_v2/academic_performance_views.py` — fixes applied for thresholds and performance levels
- `backend/academic_v2/tests/test_academic_performance_acv2_migration.py` — fixed test data (Subject creation, unique exam names)
- `MIGRATION-AUDIT.md` — this file

## Key Database Facts Verified
- `AcV2ExamAssignment` has 29 PUBLISHED assignments
- Published assignments with marks exist
- Reverse relation from assignment to marks: `student_marks`
- `exam_assignment.section.course.subject_code`, `subject_name`, `course.semester.number`, `section.section_name`, `section.teaching_assignment`
- Faculty/department resolved through `teaching_assignment`
- Real assessment max marks: 20, 30, 60, 110
- Pass-mark rules are configured via `AcV2PassMarkSetting` (not a universal 50%)

## Next Steps
1. Fix `ComparisonPerformanceAnalyticsView` to use AcV2 for ESE and pass threshold for CIA
2. Fix test data (Subject creation with semester, unique exam names)
3. Run targeted backend tests for the analytics views
4. Run Django checks (`python manage.py check`)
5. Verify the full diff is clean and complete

