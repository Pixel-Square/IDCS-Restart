import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  bulkResetGlobalPublishControls,
  bulkDeleteDueSchedule,
  bulkSetGlobalPublishControls,
  bulkUpsertDueSchedule,
  bulkSetAssessmentControls,
  DueAssessmentKey,
  DueScheduleRow,
  DueScheduleSubject,
  fetchAssessmentControls,
  fetchDueScheduleSubjects,
  fetchDueSchedules,
  fetchGlobalPublishControls,
  fetchObeSemesters,
} from '../services/obe';

type SemesterRow = { id: number; number: number | null };

const SEMESTER_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type ClassTypeKey = 'THEORY' | 'LAB' | 'TCPL' | 'TCPR' | 'PRACTICAL' | 'PROJECT' | 'AUDIT' | 'SPECIAL';

// Mirrored from backend: curriculum.models.CLASS_TYPE_CHOICES
const CLASS_TYPE_ORDER: ClassTypeKey[] = ['THEORY', 'LAB', 'TCPL', 'TCPR', 'PRACTICAL', 'PROJECT', 'AUDIT', 'SPECIAL'];

const CLASS_TYPE_LABEL: Record<ClassTypeKey, string> = {
  THEORY: 'Theory',
  LAB: 'Lab',
  TCPL: 'TCPL',
  TCPR: 'TCPR',
  PRACTICAL: 'Practical',
  PROJECT: 'Project',
  AUDIT: 'Audit',
  SPECIAL: 'Special',
};

// Assessment mapping MUST match what faculty sees in Mark Entry tabs (see MarkEntryTabs.getVisibleTabs).
const THEORY_DEFAULT_ASSESSMENTS: DueAssessmentKey[] = ['ssa1', 'formative1', 'cia1', 'ssa2', 'formative2', 'cia2', 'model'];
const TCPR_ASSESSMENTS: DueAssessmentKey[] = ['ssa1', 'review1', 'cia1', 'ssa2', 'review2', 'cia2', 'model'];
const LAB_ASSESSMENTS: DueAssessmentKey[] = ['cia1', 'cia2', 'model'];
const PRACTICAL_ASSESSMENTS: DueAssessmentKey[] = ['cia1', 'cia2', 'model'];
const PROJECT_ASSESSMENTS: DueAssessmentKey[] = ['review1', 'review2', 'model'];
const SPECIAL_ALLOWED_ASSESSMENTS: DueAssessmentKey[] = ['ssa1', 'formative1', 'cia1', 'ssa2', 'formative2', 'cia2'];

const ALL_ASSESSMENTS: DueAssessmentKey[] = ['ssa1', 'review1', 'formative1', 'cia1', 'ssa2', 'review2', 'formative2', 'cia2', 'model'];

type PublishMode = 'OFF' | 'ON' | 'UNLIMITED' | 'MIXED';

function computePublishMode(params: {
  controls: Array<{ semester?: { id: number } | null; assessment: string; is_open: boolean }> | null | undefined;
  semesterIds: number[];
  assessments: DueAssessmentKey[];
}): PublishMode {
  const { controls, semesterIds, assessments } = params;
  if (!semesterIds.length || !assessments.length) return 'MIXED';

  const semSet = new Set(semesterIds.map((x) => Number(x)));
  const byKey = new Map<string, boolean>();
  for (const r of controls || []) {
    const semId = Number((r as any)?.semester?.id);
    if (!Number.isFinite(semId) || !semSet.has(semId)) continue;
    const a = String((r as any)?.assessment || '').trim().toLowerCase();
    if (!a) continue;
    byKey.set(`${semId}::${a}`, Boolean((r as any)?.is_open));
  }

  const modes = new Set<Exclude<PublishMode, 'MIXED'>>();
  for (const semId of semesterIds) {
    for (const a of assessments) {
      const key = `${Number(semId)}::${String(a).toLowerCase()}`;
      if (!byKey.has(key)) {
        modes.add('ON');
      } else {
        const isOpen = Boolean(byKey.get(key));
        modes.add(isOpen ? 'UNLIMITED' : 'OFF');
      }
    }
  }

  if (modes.size === 1) return Array.from(modes)[0];
  return 'MIXED';
}

function expectedAssessmentsForClassType(classType: ClassTypeKey, subjectsForLeaf: DueScheduleSubject[]): DueAssessmentKey[] {
  if (classType === 'LAB') return LAB_ASSESSMENTS;
  if (classType === 'TCPR') return TCPR_ASSESSMENTS;
  if (classType === 'PRACTICAL') return PRACTICAL_ASSESSMENTS;
  if (classType === 'PROJECT') return PROJECT_ASSESSMENTS;

  // SPECIAL: only explicitly enabled assessments are shown (no model/review).
  if (classType === 'SPECIAL') {
    const enabledKeys: string[] = [];
    for (const s of subjectsForLeaf) {
      const enabled = Array.isArray((s as any)?.enabled_assessments) ? (s as any).enabled_assessments : [];
      for (const k of enabled) enabledKeys.push(String(k || '').trim().toLowerCase());
    }
    const normalized = uniqueKeepOrder(enabledKeys).filter(Boolean);
    if (!normalized.length) return [];
    const allowed = new Set<DueAssessmentKey>(SPECIAL_ALLOWED_ASSESSMENTS);
    const ordered: DueAssessmentKey[] = [];
    for (const k of SPECIAL_ALLOWED_ASSESSMENTS) {
      if (normalized.includes(String(k))) ordered.push(k);
    }
    // tolerate any allowed key not in base order
    for (const k of normalized) {
      if (allowed.has(k as DueAssessmentKey) && !ordered.includes(k as DueAssessmentKey)) ordered.push(k as DueAssessmentKey);
    }
    return ordered;
  }

  // TCPL uses formative keys as LAB 1/LAB 2; assessments remain the same keys.
  // THEORY/AUDIT/default follow the full theory flow.
  return THEORY_DEFAULT_ASSESSMENTS;
}

function assessmentDisplayLabel(classType: ClassTypeKey, assessment: DueAssessmentKey): string {
  if (classType === 'TCPL') {
    if (assessment === 'formative1') return 'LAB 1';
    if (assessment === 'formative2') return 'LAB 2';
  }
  if (classType === 'LAB') {
    if (assessment === 'cia1') return 'CIA 1 LAB';
    if (assessment === 'cia2') return 'CIA 2 LAB';
    if (assessment === 'model') return 'MODEL LAB';
  }
  if (classType === 'PRACTICAL') {
    if (assessment === 'cia1') return 'CIA 1 Review';
    if (assessment === 'cia2') return 'CIA 2 Review';
    if (assessment === 'model') return 'MODEL Review';
  }
  if (classType === 'PROJECT') {
    if (assessment === 'model') return 'MODEL Review';
  }

  // default labels
  if (assessment === 'ssa1') return 'SSA1';
  if (assessment === 'ssa2') return 'SSA2';
  if (assessment === 'review1') return 'Review 1';
  if (assessment === 'review2') return 'Review 2';
  if (assessment === 'formative1') return 'Formative 1';
  if (assessment === 'formative2') return 'Formative 2';
  if (assessment === 'cia1') return 'CIA 1';
  if (assessment === 'cia2') return 'CIA 2';
  if (assessment === 'model') return 'MODEL';
  return String(assessment).toUpperCase();
}

function normalizeClassType(v: any): ClassTypeKey {
  const k = String(v || '')
    .trim()
    .toUpperCase();
  if (k === 'THEORY') return 'THEORY';
  if (k === 'LAB') return 'LAB';
  if (k === 'TCPL') return 'TCPL';
  if (k === 'TCPR') return 'TCPR';
  if (k === 'PRACTICAL') return 'PRACTICAL';
  if (k === 'PROJECT') return 'PROJECT';
  if (k === 'AUDIT') return 'AUDIT';
  if (k === 'SPECIAL') return 'SPECIAL';
  return 'THEORY';
}

function combineDateTime(date: string, time: string): string | null {
  const dd = String(date || '').trim();
  const tt = String(time || '').trim();
  if (!dd || !tt) return null;
  return `${dd}T${tt}:00`;
}

function uniqueKeepOrder<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
}

function computeLeafOpenStatus(params: {
  controls: Array<{ subject_code: string; assessment: string; is_open: boolean; is_enabled: boolean }> | null | undefined;
  subjectCodes: string[];
  assessments: DueAssessmentKey[];
}): 'EDITABLE' | 'READONLY' | 'MIXED' {
  const { controls, subjectCodes, assessments } = params;
  if (!subjectCodes.length || !assessments.length) return 'MIXED';

  const byKey = new Map<string, { is_open: boolean; is_enabled: boolean }>();
  for (const c of controls || []) {
    const code = String((c as any).subject_code || '').trim();
    const a = String((c as any).assessment || '').trim().toLowerCase();
    if (!code || !a) continue;
    byKey.set(`${code}::${a}`, { is_open: Boolean((c as any).is_open), is_enabled: Boolean((c as any).is_enabled) });
  }

  let openCount = 0;
  let closedCount = 0;
  for (const code of subjectCodes) {
    for (const a of assessments) {
      const k = `${code}::${String(a).toLowerCase()}`;
      const row = byKey.get(k);
      // Default: enabled+open if not configured yet.
      const isOpen = row ? Boolean(row.is_open) : true;
      if (isOpen) openCount += 1;
      else closedCount += 1;
    }
  }
  if (openCount > 0 && closedCount > 0) return 'MIXED';
  return closedCount > 0 ? 'READONLY' : 'EDITABLE';
}

export default function OBEDueDatesPage(): JSX.Element {
  const [semesters, setSemesters] = useState<SemesterRow[]>([]);
  const [selectedSemNumber, setSelectedSemNumber] = useState<number>(1);

  const [subjectsBySemester, setSubjectsBySemester] = useState<Record<string, DueScheduleSubject[]>>({});
  const [dueSchedulesForSelected, setDueSchedulesForSelected] = useState<DueScheduleRow[]>([]);
  const [assessmentControlsForSelected, setAssessmentControlsForSelected] = useState<
    Array<{
      id: number;
      semester: { id: number; number: number | null } | null;
      subject_code: string;
      subject_name: string;
      assessment: string;
      is_enabled: boolean;
      is_open: boolean;
      updated_at: string | null;
      updated_by: number | null;
    }>
  >([]);

  const [globalPublishControlsForSelected, setGlobalPublishControlsForSelected] = useState<
    Array<{ id: number; semester: { id: number; number: number | null } | null; assessment: string; is_open: boolean; updated_at: string | null; updated_by: number | null }>
  >([]);
  const [globalPublishControlsAll, setGlobalPublishControlsAll] = useState<
    Array<{ id: number; semester: { id: number; number: number | null } | null; assessment: string; is_open: boolean; updated_at: string | null; updated_by: number | null }>
  >([]);

  const [selectedClassType, setSelectedClassType] = useState<ClassTypeKey>('THEORY');
  const [selectedAssessments, setSelectedAssessments] = useState<DueAssessmentKey[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pageTabStyle = useCallback(
    (active: boolean): React.CSSProperties => ({
      padding: '8px 12px',
      borderRadius: 8,
      border: active ? '1px solid #10b981' : '1px solid #e5e7eb',
      background: active ? '#ecfdf5' : '#fff',
      fontWeight: 700,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }),
    []
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetchObeSemesters();
        const list = Array.isArray(resp?.results) ? resp.results : [];
        if (!mounted) return;
        const cleaned: SemesterRow[] = list
          .map((x: any) => ({
            id: Number(x.id),
            number: x?.number === null || typeof x?.number === 'undefined' ? null : Number(x.number),
          }))
          .filter((x) => Number.isFinite(x.id));
        cleaned.sort((a, b) => Number(a.number ?? 9999) - Number(b.number ?? 9999) || a.id - b.id);
        setSemesters(cleaned);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load semesters');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const semesterIdByNumber = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of semesters) {
      const num = s.number;
      if (typeof num === 'number' && Number.isFinite(num)) map.set(num, s.id);
    }
    return map;
  }, [semesters]);

  const selectedSemesterId = semesterIdByNumber.get(selectedSemNumber) ?? null;

  const allSemesterIds = useMemo(() => {
    // Only include known SEM 1..8 ids.
    const out: number[] = [];
    for (const n of SEMESTER_NUMBERS) {
      const id = semesterIdByNumber.get(n);
      if (id) out.push(id);
    }
    return out;
  }, [semesterIdByNumber]);

  // Load global publish controls across all semesters once (for the “common for all semesters” control).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!allSemesterIds.length) return;
        const resp = await fetchGlobalPublishControls(allSemesterIds, ALL_ASSESSMENTS);
        if (!mounted) return;
        setGlobalPublishControlsAll(Array.isArray((resp as any)?.results) ? (resp as any).results : []);
      } catch {
        // ignore (page still works with per-semester control)
      }
    })();
    return () => {
      mounted = false;
    };
  }, [allSemesterIds.join(',')]);

  const reloadSelectedSemester = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      if (!selectedSemesterId) {
        setSubjectsBySemester({});
        setDueSchedulesForSelected([]);
        setAssessmentControlsForSelected([]);
        setGlobalPublishControlsForSelected([]);
        setMessage(`Semester ${selectedSemNumber} is not available in the database.`);
        return;
      }

      const [subjectsResp, schedulesResp, controlsResp, globalPublishResp] = await Promise.all([
        fetchDueScheduleSubjects([selectedSemesterId]),
        fetchDueSchedules([selectedSemesterId]),
        fetchAssessmentControls([selectedSemesterId]),
        fetchGlobalPublishControls([selectedSemesterId], ALL_ASSESSMENTS),
      ]);

      const subjects = subjectsResp?.subjects_by_semester || {};
      const schedules = Array.isArray(schedulesResp?.results) ? schedulesResp.results : [];

      setSubjectsBySemester(subjects);
      setDueSchedulesForSelected(schedules);
      setAssessmentControlsForSelected(Array.isArray((controlsResp as any)?.results) ? (controlsResp as any).results : []);
      setGlobalPublishControlsForSelected(Array.isArray((globalPublishResp as any)?.results) ? (globalPublishResp as any).results : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load semester data');
    } finally {
      setLoading(false);
    }
  }, [selectedSemesterId, selectedSemNumber, selectedClassType]);

  useEffect(() => {
    void reloadSelectedSemester();
  }, [reloadSelectedSemester]);

  const selectedSemesterSubjects = useMemo(() => {
    if (!selectedSemesterId) return [];
    const list = subjectsBySemester?.[String(selectedSemesterId)] || [];
    return (Array.isArray(list) ? list : []).filter((x) => x && x.subject_code);
  }, [subjectsBySemester, selectedSemesterId]);

  const classTypeKeysForSemester = useMemo(() => {
    // IMPORTANT UX: show ALL class types (as defined in backend curriculum CLASS_TYPE_CHOICES),
    // even if the selected semester has 0 courses for that type.
    // This matches the requested “pages” experience.
    return CLASS_TYPE_ORDER.slice();
  }, []);

  // Ensure selected class type is valid for this semester.
  useEffect(() => {
    if (classTypeKeysForSemester.includes(selectedClassType)) return;
    setSelectedClassType(classTypeKeysForSemester[0] || 'THEORY');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classTypeKeysForSemester.join('|')]);

  const subjectsForLeaf = useMemo(() => {
    return selectedSemesterSubjects.filter((s) => normalizeClassType((s as any)?.class_type) === selectedClassType);
  }, [selectedSemesterSubjects, selectedClassType]);

  const subjectCodesForLeaf = useMemo(() => {
    return uniqueKeepOrder(
      subjectsForLeaf
        .map((s) => String(s.subject_code || '').trim())
        .filter(Boolean)
    );
  }, [subjectsForLeaf]);

  // All subjects for the selected semester across ALL class types (used by the semester-level timer).
  const allSubjectCodesForSemester = useMemo(() => {
    return uniqueKeepOrder(
      selectedSemesterSubjects
        .map((s) => String(s.subject_code || '').trim())
        .filter(Boolean)
    );
  }, [selectedSemesterSubjects]);

  const availableAssessmentsForLeaf = useMemo<DueAssessmentKey[]>(() => {
    return expectedAssessmentsForClassType(selectedClassType, subjectsForLeaf);
  }, [selectedClassType, subjectsForLeaf]);

  // Default checkbox selection:
  // 1) Prefer explicit assessment controls (is_enabled)
  // 2) Fall back to existing due schedules
  // 3) Else default to NONE enabled (so UI matches staff gating)
  useEffect(() => {
    const available = availableAssessmentsForLeaf;
    if (!available.length) {
      setSelectedAssessments([]);
      return;
    }
    if (!selectedSemesterId) {
      setSelectedAssessments(available);
      return;
    }

    const codes = new Set(subjectCodesForLeaf);
    const enabledByControl = new Map<string, boolean>();
    for (const r of assessmentControlsForSelected || []) {
      const code = String((r as any).subject_code || '').trim();
      if (!codes.has(code)) continue;
      const a = String((r as any).assessment || '').trim().toLowerCase();
      if (!a) continue;
      enabledByControl.set(a, Boolean((r as any).is_enabled));
    }

    const enabledBySchedule = new Set<string>();
    for (const r of dueSchedulesForSelected || []) {
      if (!r?.is_active) continue;
      if (!r?.semester?.id || Number(r.semester.id) !== Number(selectedSemesterId)) continue;
      if (!codes.has(String(r.subject_code || '').trim())) continue;
      enabledBySchedule.add(String(r.assessment || '').trim().toLowerCase());
    }

    const defaults = available.filter((a) => {
      const k = String(a).toLowerCase();
      if (enabledByControl.has(k)) return Boolean(enabledByControl.get(k));
      return enabledBySchedule.has(k);
    });

    setSelectedAssessments(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSemesterId, selectedClassType, assessmentControlsForSelected, dueSchedulesForSelected, availableAssessmentsForLeaf, subjectCodesForLeaf]);

  const openStatus = useMemo(() => {
    return computeLeafOpenStatus({
      controls: assessmentControlsForSelected,
      subjectCodes: subjectCodesForLeaf,
      assessments: selectedAssessments,
    });
  }, [assessmentControlsForSelected, subjectCodesForLeaf, selectedAssessments]);

  const publishModeThisSemester = useMemo<PublishMode>(() => {
    if (!selectedSemesterId) return 'MIXED';
    return computePublishMode({
      controls: globalPublishControlsForSelected,
      semesterIds: [selectedSemesterId],
      assessments: ALL_ASSESSMENTS,
    });
  }, [globalPublishControlsForSelected, selectedSemesterId]);

  const publishModeAllSemesters = useMemo<PublishMode>(() => {
    if (!allSemesterIds.length) return 'MIXED';
    return computePublishMode({
      controls: globalPublishControlsAll,
      semesterIds: allSemesterIds,
      assessments: ALL_ASSESSMENTS,
    });
  }, [globalPublishControlsAll, allSemesterIds.join(',')]);  

  const setPublishMode = useCallback(
    async (mode: Exclude<PublishMode, 'MIXED'>, scope: 'THIS' | 'ALL') => {
      setLoading(true);
      setMessage(null);
      setError(null);
      try {
        const targetSemesterIds = scope === 'ALL' ? allSemesterIds : (selectedSemesterId ? [selectedSemesterId] : []);
        if (!targetSemesterIds.length) throw new Error('No semester ids available for this action.');

        if (mode === 'ON') {
          await bulkResetGlobalPublishControls({
            semester_ids: targetSemesterIds,
            assessments: ALL_ASSESSMENTS,
          });
        } else if (mode === 'OFF') {
          await bulkSetGlobalPublishControls({
            semester_ids: targetSemesterIds,
            assessments: ALL_ASSESSMENTS,
            is_open: false,
          });
        } else {
          await bulkSetGlobalPublishControls({
            semester_ids: targetSemesterIds,
            assessments: ALL_ASSESSMENTS,
            is_open: true,
          });
        }

        // Refresh global control state.
        if (selectedSemesterId) {
          const resp = await fetchGlobalPublishControls([selectedSemesterId], ALL_ASSESSMENTS);
          setGlobalPublishControlsForSelected(Array.isArray((resp as any)?.results) ? (resp as any).results : []);
        }
        if (allSemesterIds.length) {
          const respAll = await fetchGlobalPublishControls(allSemesterIds, ALL_ASSESSMENTS);
          setGlobalPublishControlsAll(Array.isArray((respAll as any)?.results) ? (respAll as any).results : []);
        }

        setMessage(
          `${scope === 'ALL' ? 'All Semesters' : `SEM ${selectedSemNumber}`}: Publish set to ${mode === 'ON' ? 'On (Timed)' : mode === 'OFF' ? 'Off (Locked)' : 'Unlimited (No Time Limit)'}.`
        );
      } catch (e: any) {
        setError(e?.message || 'Publish toggle failed');
      } finally {
        setLoading(false);
      }
    },
    [allSemesterIds, selectedSemesterId, selectedSemNumber]
  );

  const toggleAssessment = useCallback(
    async (key: DueAssessmentKey) => {
      const willEnable = !selectedAssessments.includes(key);
      const prevSelected = selectedAssessments;

      // optimistic UI
      setSelectedAssessments((prev) => (willEnable ? [...prev, key] : prev.filter((x) => x !== key)));
      setLoading(true);
      setMessage(null);
      setError(null);

      try {
        if (!selectedSemesterId) throw new Error(`Semester ${selectedSemNumber} is not available in the database.`);
        if (!subjectCodesForLeaf.length) throw new Error(`No courses found for SEM ${selectedSemNumber} (${CLASS_TYPE_LABEL[selectedClassType]}).`);

        // 1) Persist enable/disable in DB (real-time)
        await bulkSetAssessmentControls({
          semester_id: selectedSemesterId,
          subject_codes: subjectCodesForLeaf,
          assessments: [key],
          is_enabled: willEnable,
        });

        // 2) If disabling, also clear timers immediately
        if (!willEnable) {
          await bulkDeleteDueSchedule({
            semester_id: selectedSemesterId,
            subject_codes: subjectCodesForLeaf,
            assessments: [key],
          });
        }

        // Refresh server state so the UI matches what will survive a full page reload.
        const [controlsResp, schedulesResp] = await Promise.all([
          fetchAssessmentControls([selectedSemesterId]),
          fetchDueSchedules([selectedSemesterId]),
        ]);
        setAssessmentControlsForSelected(Array.isArray((controlsResp as any)?.results) ? (controlsResp as any).results : []);
        setDueSchedulesForSelected(Array.isArray((schedulesResp as any)?.results) ? (schedulesResp as any).results : []);

        setMessage(
          `SEM ${selectedSemNumber} • ${CLASS_TYPE_LABEL[selectedClassType]}: ${assessmentDisplayLabel(selectedClassType, key)} ${willEnable ? 'enabled' : 'disabled'}.`
        );
      } catch (e: any) {
        // Revert optimistic UI change so it doesn't look enabled when the save failed.
        setSelectedAssessments(prevSelected);
        setError(e?.message || 'Update failed');
      } finally {
        setLoading(false);
      }
    },
    [
      selectedAssessments,
      selectedSemesterId,
      selectedSemNumber,
      selectedClassType,
      subjectCodesForLeaf,
    ]
  );

  const applyTimerAndSelection = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      if (!selectedSemesterId) throw new Error(`Semester ${selectedSemNumber} is not available in the database.`);
      if (!allSubjectCodesForSemester.length) throw new Error(`No courses found for SEM ${selectedSemNumber}.`);

      // Timer is meaningful only in Publish=ON mode.
      if (publishModeThisSemester !== 'ON') {
        throw new Error(
          publishModeThisSemester === 'OFF'
            ? 'Publish is OFF (Locked). Set Publish to ON to use a timer.'
            : publishModeThisSemester === 'UNLIMITED'
            ? 'Publish is UNLIMITED (No Time Limit). Set Publish to ON to use a due-date timer.'
            : 'Publish mode is MIXED. Set a single Publish mode first.'
        );
      }

      const dueAt = combineDateTime(dueDate, dueTime);
      if (!dueAt) throw new Error('Select Due Date and Due Time');

      // Apply timer to ALL subjects in the semester (all class types).
      await bulkUpsertDueSchedule({
        semester_id: selectedSemesterId,
        subject_codes: allSubjectCodesForSemester,
        assessments: ALL_ASSESSMENTS,
        due_at: dueAt,
      });

      setMessage(`SEM ${selectedSemNumber}: Timer applied to all class types.`);
      await reloadSelectedSemester();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  }, [
    selectedSemesterId,
    selectedSemNumber,
    allSubjectCodesForSemester,
    dueDate,
    dueTime,
    reloadSelectedSemester,
    publishModeThisSemester,
  ]);

  const setLeafEditable = useCallback(
    async (editable: boolean) => {
      setLoading(true);
      setMessage(null);
      setError(null);
      try {
        if (!selectedSemesterId) throw new Error(`Semester ${selectedSemNumber} is not available in the database.`);
        if (!selectedAssessments.length) throw new Error('Select at least one exam/assessment');

        if (!subjectCodesForLeaf.length) throw new Error(`No courses found for SEM ${selectedSemNumber} (${CLASS_TYPE_LABEL[selectedClassType]}).`);

        await bulkSetAssessmentControls({
          semester_id: selectedSemesterId,
          subject_codes: subjectCodesForLeaf,
          assessments: selectedAssessments,
          is_open: editable,
        });

        const resp = await fetchAssessmentControls([selectedSemesterId]);
        setAssessmentControlsForSelected(Array.isArray((resp as any)?.results) ? (resp as any).results : []);

        setMessage(`SEM ${selectedSemNumber} • ${CLASS_TYPE_LABEL[selectedClassType]}: ${editable ? 'Editable' : 'Read-only'}`);
      } catch (e: any) {
        setError(e?.message || 'Lock toggle failed');
      } finally {
        setLoading(false);
      }
    },
    [selectedSemesterId, selectedSemNumber, selectedAssessments, selectedClassType, subjectCodesForLeaf]
  );

  // ── Neon 3-state publish toggle ──────────────────────────────────────────────
  // Rules:
  //   ALL scope: always interactable (master switch)
  //   THIS scope: disabled entirely when common=OFF (master overrides to locked)
  //               when common=UNLIMITED → semester toggle is free (no timer row)
  //               when common=ON       → semester toggle is free + date/time shown when ON
  const renderPublishToggle = (scope: 'THIS' | 'ALL') => {
    const mode = scope === 'THIS' ? publishModeThisSemester : publishModeAllSemesters;
    const lockedByCommon = scope === 'THIS' && publishModeAllSemesters === 'OFF';
    const disabled = loading || (scope === 'ALL' && !allSemesterIds.length) || lockedByCommon;
    return (
      <div className={`pub3${disabled ? ' pub3--disabled' : ''}`} title={lockedByCommon ? 'Locked by Common Publish (Off)' : undefined}>
        <button className={`pub3__btn pub3__btn--off${mode === 'OFF' ? ' pub3__btn--active' : ''}`}
          onClick={() => void setPublishMode('OFF', scope)} disabled={disabled}>Off</button>
        <button className={`pub3__btn pub3__btn--on${mode === 'ON' ? ' pub3__btn--active' : ''}`}
          onClick={() => void setPublishMode('ON', scope)} disabled={disabled}>On</button>
        <button className={`pub3__btn pub3__btn--unlimited${mode === 'UNLIMITED' ? ' pub3__btn--active' : ''}`}
          onClick={() => void setPublishMode('UNLIMITED', scope)} disabled={disabled}>Unlimited</button>
      </div>
    );
  };

  return (
    <main style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#f3f4f6' }}>
      <style>{`
        /* ── Neon 3-state publish switch ── */
        .pub3 {
          display: inline-flex;
          border-radius: 999px;
          background: #0f172a;
          padding: 4px;
          gap: 3px;
          box-shadow: 0 0 0 1px #1e293b, 0 4px 12px rgba(0,0,0,0.55);
        }
        .pub3--disabled { opacity: 0.4; pointer-events: none; }
        .pub3__btn {
          padding: 8px 18px;
          border-radius: 999px;
          border: none;
          font-weight: 900;
          font-size: 13px;
          cursor: pointer;
          background: transparent;
          color: #64748b;
          transition: background 0.35s cubic-bezier(0.65,0,0.35,1),
                      color 0.35s cubic-bezier(0.65,0,0.35,1),
                      box-shadow 0.35s cubic-bezier(0.65,0,0.35,1);
          letter-spacing: 0.02em;
          min-width: 64px;
        }
        .pub3__btn:disabled { cursor: not-allowed; }
        .pub3__btn--off.pub3__btn--active {
          background: #450a0a;
          color: #fca5a5;
          box-shadow: 0 0 6px #ef4444, 0 0 18px #ef444455, inset 0 0 8px #ef444418;
        }
        .pub3__btn--on.pub3__btn--active {
          background: #052e16;
          color: #86efac;
          box-shadow: 0 0 6px #22c55e, 0 0 18px #22c55e55, inset 0 0 8px #22c55e18;
        }
        .pub3__btn--unlimited.pub3__btn--active {
          background: #1e3a8a;
          color: #93c5fd;
          box-shadow: 0 0 6px #3b82f6, 0 0 18px #3b82f655, inset 0 0 8px #3b82f618;
        }
      `}</style>
      <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
        <div className="welcome" style={{ marginBottom: 18 }}>
          <div className="welcome-left">
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>OBE Master — Lock &amp; Timer Controls</h2>
            <div className="welcome-sub">Common Publish → Semester → Publish &amp; Timer → Class Type → Exams</div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{error}</div>
        )}
        {message && (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b98133', color: '#065f46', padding: 10, borderRadius: 10, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{message}</div>
        )}

        {/* ── 1. Common Publish — All Semesters ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4, color: '#111827' }}>Common Publish — All Semesters</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Applies the same publish mode to every semester at once.</div>
          </div>
          <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {renderPublishToggle('ALL')}
            <span style={{ fontSize: 13, fontWeight: 700,
              color: publishModeAllSemesters === 'OFF' ? '#991b1b' : publishModeAllSemesters === 'ON' ? '#065f46' : publishModeAllSemesters === 'UNLIMITED' ? '#1e40af' : '#6b7280' }}>
              {publishModeAllSemesters === 'OFF' ? 'All Locked' : publishModeAllSemesters === 'ON' ? 'All Timer-based' : publishModeAllSemesters === 'UNLIMITED' ? 'All Unlimited' : 'Mixed'}
            </span>
          </div>
        </div>

        {/* ── 2. Semester Tabs ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 18px', marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: '2px solid #10b981' }}>
          <div style={{ fontWeight: 900, fontSize: 12, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Select Semester</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SEMESTER_NUMBERS.map((n) => (
              <button key={n} disabled={loading} onClick={() => setSelectedSemNumber(n)} style={pageTabStyle(n === selectedSemNumber)}>
                SEM {n}
              </button>
            ))}
          </div>
        </div>

        {/* ── 3. Selected Semester Card ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 0, borderRadius: 14, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: '18px 20px', marginBottom: 16 }}>

          {/* 3a. Publish for this semester + inline timer */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6, color: '#111827' }}>Publish — SEM {selectedSemNumber}</div>
              {renderPublishToggle('THIS')}
            </div>

            {/* State feedback / timer */}
            {publishModeAllSemesters === 'OFF' ? (
              /* ── Common is OFF → semester is locked, no controls ── */
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontWeight: 800, fontSize: 13 }}>
                <span style={{ fontSize: 16 }}>🔒</span> Locked — Common Publish is Off
              </div>
            ) : publishModeThisSemester === 'ON' ? (
              /* ── Semester ON → show date+time picker inline ── */
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto' }}>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={loading}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={loading}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                <button onClick={() => void applyTimerAndSelection()} disabled={loading}
                  className="obe-btn obe-btn-primary"
                  style={{ padding: '9px 16px', borderRadius: 8, fontWeight: 900, fontSize: 13 }}>
                  {loading ? 'Saving…' : `Apply Timer — SEM ${selectedSemNumber}`}
                </button>
                <div style={{ fontSize: 12, color: '#6b7280' }}>All {allSubjectCodesForSemester.length} subjects · all class types</div>
              </div>
            ) : publishModeThisSemester === 'UNLIMITED' ? (
              /* ── Semester UNLIMITED → no timer needed ── */
              <div style={{ padding: '10px 16px', borderRadius: 10, background: '#eff6ff',
                color: '#1e40af', fontWeight: 800, border: '1px solid #bfdbfe', fontSize: 13 }}>
                ∞ No Time Limit — always open
              </div>
            ) : publishModeThisSemester === 'OFF' ? (
              /* ── Semester OFF (common not off) ── */
              <div style={{ padding: '10px 16px', borderRadius: 10, background: '#fef2f2',
                color: '#991b1b', fontWeight: 800, border: '1px solid #fecaca', fontSize: 13 }}>
                🔒 This semester locked
              </div>
            ) : null}
          </div>

          {/* 3b. Class Type Tabs */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Class Type</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {classTypeKeysForSemester.map((k) => (
                <button key={k} disabled={loading} onClick={() => setSelectedClassType(k)} style={pageTabStyle(k === selectedClassType)}>
                  {CLASS_TYPE_LABEL[k]}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>{subjectsForLeaf.length} course{subjectsForLeaf.length !== 1 ? 's' : ''} in SEM {selectedSemNumber} • {CLASS_TYPE_LABEL[selectedClassType]}</div>
          </div>

          {/* 3c. Exam Assignments */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: '#111827' }}>SEM {selectedSemNumber} — {CLASS_TYPE_LABEL[selectedClassType]} Exams</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Mark Entry Mode:</div>
                <div style={{ display: 'inline-flex', border: '1px solid #e5e7eb', borderRadius: 999, overflow: 'hidden', background: '#fff' }}>
                  <button onClick={() => void setLeafEditable(false)} disabled={loading || !selectedAssessments.length}
                    style={{ padding: '7px 14px', fontWeight: 900, border: 0, cursor: 'pointer', fontSize: 13,
                      background: openStatus === 'READONLY' ? '#fee2e2' : '#fff',
                      color: openStatus === 'READONLY' ? '#991b1b' : '#374151', minWidth: 100 }}>
                    Read-only
                  </button>
                  <button onClick={() => void setLeafEditable(true)} disabled={loading || !selectedAssessments.length}
                    style={{ padding: '7px 14px', fontWeight: 900, border: 0, cursor: 'pointer', fontSize: 13,
                      background: openStatus === 'EDITABLE' ? '#dcfce7' : '#fff',
                      color: openStatus === 'EDITABLE' ? '#065f46' : '#374151', minWidth: 90 }}>
                    Editable
                  </button>
                </div>
              </div>
            </div>

            {availableAssessmentsForLeaf.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {availableAssessmentsForLeaf.map((k) => (
                  <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
                    padding: '8px 14px', borderRadius: 10,
                    border: `2px solid ${selectedAssessments.includes(k) ? '#10b981' : '#e5e7eb'}`,
                    background: selectedAssessments.includes(k) ? '#ecfdf5' : '#fff',
                    color: selectedAssessments.includes(k) ? '#065f46' : '#374151',
                    cursor: 'pointer', userSelect: 'none', fontWeight: 700 }}>
                    <input type="checkbox" checked={selectedAssessments.includes(k)}
                      onChange={() => void toggleAssessment(k)} disabled={loading}
                      style={{ accentColor: '#10b981', width: 15, height: 15 }} />
                    {assessmentDisplayLabel(selectedClassType, k)}
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 13, padding: '8px 0' }}>No exams configured for {CLASS_TYPE_LABEL[selectedClassType]}.</div>
            )}
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Uncheck an exam to hide it from staff (message-only). Selected exams also control the Mark Entry Mode lever above.</div>
          </div>
        </div>
      </div>
    </main>
  );
}

