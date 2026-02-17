import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsRemove, lsSet } from '../utils/localStorage';
import { normalizeClassType } from '../constants/classTypes';
import Cia1Entry from './Cia1Entry';
import Cia2Entry from './Cia2Entry';
import Formative1List from './Formative1List';
import Formative2List from './Formative2List';
import LabEntry from './LabEntry';
import LabCourseMarksEntry from './LabCourseMarksEntry';
import ModelEntry from './ModelEntry';
import ReviewEntry from './ReviewEntry';
import Ssa1Entry from './Ssa1Entry';
import Ssa2Entry from './Ssa2Entry';
import { DraftAssessmentKey, fetchMyTeachingAssignments, iqacResetAssessment, TeachingAssignmentItem } from '../services/obe';
import * as OBE from '../services/obe';
import FacultyAssessmentPanel from './FacultyAssessmentPanel';
import fetchWithAuth from '../services/fetchAuth';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import IqacResetNotificationAlert from './IqacResetNotificationAlert';
import CQIEditor from '../pages/staff/CQIEditor';
import CQIEntry from '../pages/staff/CQIEntry';

type TabKey = 'dashboard' | 'ssa1' | 'review1' | 'ssa2' | 'review2' | 'formative1' | 'formative2' | 'cia1' | 'cia2' | 'model' | 'cqi';
type CQIOption = 'cia1_co1_co2' | 'cia2_co3_co4' | 'model_co3_co4_co5' | 'model_co5';

type MarkRow = { studentId: string; mark: number };

type Props = {
  subjectId: string;
  classType?: string | null;
  questionPaperType?: string | null;
  enabledAssessments?: string[] | null;
  teachingAssignmentsOverride?: TeachingAssignmentItem[];
  fixedTeachingAssignmentId?: number;
  iqacResetEnabled?: boolean;
  viewerMode?: boolean;
};

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'ssa1', label: 'SSA1' },
  { key: 'formative1', label: 'Formative 1' },
  { key: 'cia1', label: 'CIA 1' },
  { key: 'ssa2', label: 'SSA2' },
  { key: 'formative2', label: 'Formative 2' },
  { key: 'cia2', label: 'CIA 2' },
  { key: 'model', label: 'MODEL' },
];

function normalizeEnabledAssessments(enabledAssessments: string[] | null | undefined): Set<string> {
  const arr = Array.isArray(enabledAssessments) ? enabledAssessments : [];
  return new Set(arr.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
}

function getVisibleTabs(classType: string | null | undefined, enabledAssessments?: string[] | null): Array<{ key: TabKey; label: string }> {
  const ct = normalizeClassType(classType);
  const enabled = normalizeEnabledAssessments(enabledAssessments);

  // SPECIAL: show only explicitly enabled assessments (+ dashboard)
  if (ct === 'SPECIAL') {
    const allowedKeys = new Set<TabKey>(['dashboard']);
    // Only these six are supported for SPECIAL, per requirement
    (['ssa1', 'ssa2', 'formative1', 'formative2', 'cia1', 'cia2'] as const).forEach((k) => {
      if (enabled.has(k)) allowedKeys.add(k);
    });
    return BASE_TABS.filter((t) => allowedKeys.has(t.key));
  }

  // PRACTICAL: show only dashboard + Review variants for CIAs and MODEL
  if (ct === 'PRACTICAL') {
    return BASE_TABS.filter((t) => ['dashboard', 'cia1', 'cia2', 'model'].includes(t.key)).map((t) => {
      if (t.key === 'cia1') return { ...t, label: 'CIA 1 Review' };
      if (t.key === 'cia2') return { ...t, label: 'CIA 2 Review' };
      if (t.key === 'model') return { ...t, label: 'MODEL Review' };
      return t;
    });
  }

  // TCPR: show SSA1/SSA2 AND separate Review 1/Review 2 pages; hide Formatives.
  if (ct === 'TCPR') {
    return [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'ssa1', label: 'SSA1' },
      { key: 'review1', label: 'Review 1' },
      { key: 'cia1', label: 'CIA 1' },
      { key: 'ssa2', label: 'SSA2' },
      { key: 'review2', label: 'Review 2' },
      { key: 'cia2', label: 'CIA 2' },
      { key: 'model', label: 'MODEL' },
    ];
  }
  // Requirement:
  // - THEORY / TCPR: show SSA1, SSA2, Formatives, CIA1, CIA2, MODEL
  // - TCPL: hide Formatives and show LAB1/LAB2 instead (reusing formative keys)
  if (ct === 'TCPL') {
    return BASE_TABS.map((t) => {
      if (t.key === 'formative1') return { ...t, label: 'LAB 1' };
      if (t.key === 'formative2') return { ...t, label: 'LAB 2' };
      return t;
    });
  }

  // LAB: only show lab assessments (no SSA/Formative)
  if (ct === 'LAB') {
    return BASE_TABS.filter((t) => ['dashboard', 'cia1', 'cia2', 'model'].includes(t.key)).map((t) => {
      if (t.key === 'cia1') return { ...t, label: 'CIA 1 LAB' };
      if (t.key === 'cia2') return { ...t, label: 'CIA 2 LAB' };
      if (t.key === 'model') return { ...t, label: 'MODEL LAB' };
      return t;
    });
  }

  // Default (including THEORY/TCPR): show everything
  return BASE_TABS;
}

function storageKey(subjectId: string, tab: TabKey) {
  return `marks_${subjectId}_${tab}`;
}

function clearLocalDraftCache(subjectId: string, assessment: string) {
  const a = String(assessment || '').trim().toLowerCase();

  // Generic fallback (used by simpler entry tables)
  lsRemove(`marks_${subjectId}_${a}`);

  // Sheet-style caches
  if (a === 'ssa1') lsRemove(`ssa1_sheet_${subjectId}`);
  if (a === 'ssa2') lsRemove(`ssa2_sheet_${subjectId}`);
  if (a === 'formative1') lsRemove(`formative1_sheet_${subjectId}`);
  if (a === 'formative2') lsRemove(`formative2_sheet_${subjectId}`);
  if (a === 'cia1') lsRemove(`cia1_sheet_${subjectId}`);
  if (a === 'cia2') lsRemove(`cia2_sheet_${subjectId}`);
  if (a === 'model') lsRemove(`model_sheet_${subjectId}`);
}

function downloadCsv(filename: string, rows: MarkRow[]) {
  const header = 'studentId,mark\n';
  const body = rows
    .map((r) => `${String(r.studentId || '').replace(/\n/g, ' ')},${Number(r.mark || 0)}`)
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`obe-sidebar-btn ${active ? 'active' : ''}`}
    >
      {label}
    </button>
  );
}

function MarkEntryTable({
  subjectId,
  tab,
}: {
  subjectId: string;
  tab: Exclude<TabKey, 'dashboard'>;
}) {
  const key = useMemo(() => storageKey(subjectId, tab), [subjectId, tab]);
  const [marks, setMarks] = useState<MarkRow[]>([]);

  useEffect(() => {
    const stored = lsGet<MarkRow[]>(key) || [];
    setMarks(Array.isArray(stored) ? stored : []);
  }, [key]);

  const addRow = () => setMarks((prev) => [...prev, { studentId: '', mark: 0 }]);

  const update = (i: number, field: keyof MarkRow, value: string | number) => {
    setMarks((prev) => {
      const copy = [...prev];
      const existing = copy[i] || { studentId: '', mark: 0 };
      copy[i] = { ...existing, [field]: value } as MarkRow;
      return copy;
    });
  };

  const removeRow = (i: number) => {
    setMarks((prev) => prev.filter((_, idx) => idx !== i));
  };

  const saveLocal = () => {
    lsSet(key, marks);
    alert('Marks saved locally.');
  };

  const exportCsv = () => {
    downloadCsv(`${subjectId}_${tab}_marks.csv`, marks);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={addRow} className="obe-btn obe-btn-primary">
          Add Row
        </button>
        <button onClick={saveLocal} className="obe-btn obe-btn-success">
          Save Local
        </button>
        <button
          onClick={exportCsv}
          className="obe-btn obe-btn-secondary"
          disabled={!marks.length}
          title={!marks.length ? 'Add at least one row to export' : 'Export as CSV'}
        >
          Export CSV
        </button>
      </div>

      {marks.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>
          No rows yet. Click “Add Row” to start.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {marks.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 90px',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <input
                value={m.studentId}
                onChange={(e) => update(i, 'studentId', e.target.value)}
                placeholder="Student ID"
                className="obe-input"
              />
              <input
                type="number"
                value={m.mark}
                onChange={(e) => update(i, 'mark', Number(e.target.value))}
                className="obe-input"
              />
              <button
                onClick={() => removeRow(i)}
                className="obe-btn obe-btn-danger"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
        Saved key: <span style={{ fontFamily: 'monospace' }}>{key}</span>
      </div>
    </div>
  );
}

export default function MarkEntryTabs({
  subjectId,
  classType,
  questionPaperType,
  enabledAssessments,
  teachingAssignmentsOverride,
  fixedTeachingAssignmentId,
  iqacResetEnabled,
  viewerMode,
}: Props) {
  const [active, setActive] = useState<TabKey>('dashboard');
  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [taError, setTaError] = useState<string | null>(null);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);
  const [facultyEnabledAssessments, setFacultyEnabledAssessments] = useState<string[] | null | undefined>(undefined);
  const [showFacultyPanel, setShowFacultyPanel] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCQIEditor, setShowCQIEditor] = useState(false);
  const [cqiConfigs, setCqiConfigs] = useState<CQIOption[]>([]);
  const [selectedCqiInfo, setSelectedCqiInfo] = useState<{ assessment: string; cos: string[]; label: string } | null>(null);

  const selectedTa = useMemo(() => {
    if (selectedTaId == null) return null;
    return (tas || []).find((t) => t.id === selectedTaId) || null;
  }, [tas, selectedTaId]);

  const [taDerivedClassType, setTaDerivedClassType] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setTaDerivedClassType(null);
      if (selectedTaId == null) return;

      // If TA list already has class_type, no need to fetch.
      const direct = String((selectedTa as any)?.class_type || '').trim();
      if (direct) return;

      // If parent already provided classType, don't force extra calls.
      const propCt = String(classType || '').trim();
      if (propCt) return;

      try {
        const roster = await fetchTeachingAssignmentRoster(Number(selectedTaId));
        if (!mounted) return;
        const ct = String((roster as any)?.teaching_assignment?.class_type || '').trim();
        setTaDerivedClassType(ct || null);
      } catch {
        if (!mounted) return;
        setTaDerivedClassType(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedTaId, selectedTa, classType]);

  const effectiveClassType = useMemo(() => {
    const taCt = String((selectedTa as any)?.class_type || '').trim();
    if (taCt) return taCt;
    const derived = String(taDerivedClassType || '').trim();
    if (derived) return derived;
    const propCt = String(classType || '').trim();
    return propCt || null;
  }, [selectedTa, taDerivedClassType, classType]);

  const normalizedEffectiveClassType = useMemo(() => normalizeClassType(effectiveClassType), [effectiveClassType]);

  const isSpecial = useMemo(() => normalizedEffectiveClassType === 'SPECIAL', [normalizedEffectiveClassType]);

  // If faculty has set enabled assessments for the selected TA, prefer that.
  const effectiveEnabled = facultyEnabledAssessments === undefined ? enabledAssessments : facultyEnabledAssessments;
  const visibleTabs = useMemo(() => getVisibleTabs(effectiveClassType, effectiveEnabled), [effectiveClassType, enabledAssessments, facultyEnabledAssessments]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<TabKey>(`markEntry_activeTab_${subjectId}`);
    if (stored && visibleTabs.some((t) => t.key === stored)) setActive(stored);
  }, [subjectId]);

  useEffect(() => {
    // If class type changes or user navigates to a course with different visible tabs,
    // ensure the active tab is still valid.
    // Allow 'cqi' as a special valid tab even though it's not in visibleTabs
    if (active === 'cqi') return;
    if (!visibleTabs.some((t) => t.key === active)) setActive('dashboard');
  }, [visibleTabs, active]);

  useEffect(() => {
    if (!subjectId) return;
    if (!teachingAssignmentsOverride) return;
    const filtered = (teachingAssignmentsOverride || []).filter((a) => String(a.subject_code) === String(subjectId));
    setTas(filtered);
    setTaError(null);
    const initial =
      (typeof fixedTeachingAssignmentId === 'number' && filtered.some((f) => f.id === fixedTeachingAssignmentId) && fixedTeachingAssignmentId) ||
      (filtered[0]?.id ?? null);
    setSelectedTaId(initial);
  }, [subjectId, teachingAssignmentsOverride, fixedTeachingAssignmentId]);

  useEffect(() => {
    let mounted = true;
    if (teachingAssignmentsOverride && Array.isArray(teachingAssignmentsOverride)) return;

    (async () => {
      try {
        const all = await fetchMyTeachingAssignments();
        if (!mounted) return;
        let filtered = (all || []).filter((a) => a.subject_code === subjectId);
        
        // If user doesn't have a TA for this subject, try to fetch from server
        if (filtered.length === 0) {
          try {
            const taListRes = await fetchWithAuth(`/api/academics/teaching-assignments/?subject_code=${encodeURIComponent(String(subjectId || ''))}`);
            if (taListRes.ok) {
              const taListJson = await taListRes.json();
              const items = Array.isArray(taListJson.results) ? taListJson.results : Array.isArray(taListJson) ? taListJson : (taListJson.items || []);
              filtered = items || [];
            }
          } catch (err) {
            console.warn('Server TA list fetch failed:', err);
          }
        }
        
        setTas(filtered);
        setTaError(null);

        const stored = lsGet<number>(`markEntry_selectedTa_${subjectId}`);
        const initial =
          (typeof fixedTeachingAssignmentId === 'number' && filtered.some((f) => f.id === fixedTeachingAssignmentId) && fixedTeachingAssignmentId) ||
          (typeof stored === 'number' && filtered.some((f) => f.id === stored) && stored) ||
          (filtered[0]?.id ?? null);
        setSelectedTaId(initial);
      } catch (e: any) {
        if (!mounted) return;
        setTas([]);
        setSelectedTaId(null);
        setTaError(e?.message || 'Failed to load teaching assignments');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, teachingAssignmentsOverride, fixedTeachingAssignmentId]);

  useEffect(() => {
    if (!subjectId) return;
    if (selectedTaId == null) return;
    // Avoid persisting pinned TA selections (IQAC viewer flows)
    if (typeof fixedTeachingAssignmentId === 'number') return;
    lsSet(`markEntry_selectedTa_${subjectId}`, selectedTaId);
  }, [subjectId, selectedTaId, fixedTeachingAssignmentId]);

  useEffect(() => {
    let mounted = true;
    if (!subjectId) return;
    if (selectedTaId == null) {
      setFacultyEnabledAssessments(undefined);
      return;
    }
    if (!isSpecial) {
      // Exam selection applies only to SPECIAL courses
      setFacultyEnabledAssessments(undefined);
      return;
    }
    // Load faculty-specific enabled assessments for the selected TA
    (async () => {
      try {
        const info = await OBE.fetchTeachingAssignmentEnabledAssessmentsInfo(Number(selectedTaId));
        const arr = info?.enabled_assessments;
        if (!mounted) return;
        setFacultyEnabledAssessments(Array.isArray(arr) && arr.length ? arr : null);
      } catch (e: any) {
        if (!mounted) return;
        setFacultyEnabledAssessments(undefined);
        setTaError(e?.message || 'Failed to load faculty enabled assessments');
      }
    })();
    return () => { mounted = false; };
  }, [subjectId, selectedTaId, isSpecial]);

  useEffect(() => {
    if (!subjectId) return;
    lsSet(`markEntry_activeTab_${subjectId}`, active);
  }, [subjectId, active]);

  // Load CQI configuration from localStorage
  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<CQIOption[]>(`cqi_config_${subjectId}`);
    if (stored && Array.isArray(stored)) setCqiConfigs(stored);
  }, [subjectId]);

  // Save CQI configuration to localStorage
  const handleCQISave = (selectedOptions: CQIOption[]) => {
    setCqiConfigs(selectedOptions);
    if (subjectId) {
      if (selectedOptions.length > 0) {
        lsSet(`cqi_config_${subjectId}`, selectedOptions);
      } else {
        lsRemove(`cqi_config_${subjectId}`);
      }
    }
  };

  // Get CQI info (assessment and COs) from configurations
  const cqiInfos = useMemo(() => {
    if (!cqiConfigs || cqiConfigs.length === 0) return [];
    
    const configMap = {
      'cia1_co1_co2': { assessment: 'cia1', cos: ['CO1', 'CO2'], label: 'CIA 1' },
      'cia2_co3_co4': { assessment: 'cia2', cos: ['CO3', 'CO4'], label: 'CIA 2' },
      'model_co3_co4_co5': { assessment: 'model', cos: ['CO3', 'CO4', 'CO5'], label: 'MODEL' },
      'model_co5': { assessment: 'model', cos: ['CO5'], label: 'MODEL' },
    };
    
    return cqiConfigs.map(config => configMap[config]).filter(Boolean);
  }, [cqiConfigs]);

  // Auto-select first CQI info if none selected
  useEffect(() => {
    if (cqiInfos.length > 0 && !selectedCqiInfo) {
      setSelectedCqiInfo(cqiInfos[0]);
    } else if (cqiInfos.length === 0 && selectedCqiInfo) {
      setSelectedCqiInfo(null);
      if (active === 'cqi') setActive('dashboard');
    }
  }, [cqiInfos, selectedCqiInfo, active]);

  const counts = useMemo(() => {
    if (!subjectId) return {} as Record<TabKey, number>;
    const map: Record<string, number> = {};
    for (const t of visibleTabs) {
      if (t.key === 'dashboard') continue;
      if (t.key === 'ssa1') {
        const ssa1 = lsGet<{ rows?: unknown }>(`ssa1_sheet_${subjectId}`);
        const ssa1Rows = (ssa1 as any)?.rows;
        map[t.key] = Array.isArray(ssa1Rows) ? ssa1Rows.length : 0;
        continue;
      }
      if (t.key === 'ssa2') {
        const ssa2 = lsGet<{ rows?: unknown }>(`ssa2_sheet_${subjectId}`);
        const ssa2Rows = (ssa2 as any)?.rows;
        map[t.key] = Array.isArray(ssa2Rows) ? ssa2Rows.length : 0;
        continue;
      }
      if (t.key === 'formative1') {
        const f1 = lsGet<{ rowsByStudentId?: unknown }>(`formative1_sheet_${subjectId}`);
        const rowsByStudentId = (f1 as any)?.rowsByStudentId;
        map[t.key] = rowsByStudentId && typeof rowsByStudentId === 'object' ? Object.keys(rowsByStudentId).length : 0;
        continue;
      }
      if (t.key === 'formative2') {
        const f2 = lsGet<{ rowsByStudentId?: unknown }>(`formative2_sheet_${subjectId}`);
        const rowsByStudentId = (f2 as any)?.rowsByStudentId;
        map[t.key] = rowsByStudentId && typeof rowsByStudentId === 'object' ? Object.keys(rowsByStudentId).length : 0;
        continue;
      }
      if (t.key === 'cia1') {
        const c1 = lsGet<{ rowsByStudentId?: unknown }>(`cia1_sheet_${subjectId}`);
        const rowsByStudentId = (c1 as any)?.rowsByStudentId;
        map[t.key] = rowsByStudentId && typeof rowsByStudentId === 'object' ? Object.keys(rowsByStudentId).length : 0;
        continue;
      }
      if (t.key === 'cia2') {
        const c2 = lsGet<{ rowsByStudentId?: unknown }>(`cia2_sheet_${subjectId}`);
        const rowsByStudentId = (c2 as any)?.rowsByStudentId;
        map[t.key] = rowsByStudentId && typeof rowsByStudentId === 'object' ? Object.keys(rowsByStudentId).length : 0;
        continue;
      }
      if (t.key === 'model') {
        const m = lsGet<{ rowsByStudentId?: unknown }>(`model_sheet_${subjectId}`);
        const rowsByStudentId = (m as any)?.rowsByStudentId;
        map[t.key] = rowsByStudentId && typeof rowsByStudentId === 'object' ? Object.keys(rowsByStudentId).length : 0;
        continue;
      }
      const rows = lsGet<MarkRow[]>(storageKey(subjectId, t.key)) || [];
      map[t.key] = Array.isArray(rows) ? rows.length : 0;
    }
    return map as Record<TabKey, number>;
  }, [subjectId, active, visibleTabs, refreshKey]);

  return (
    <div>
      {/* Show reset notification if faculty opens a course that was reset by IQAC */}
      {selectedTaId != null && <IqacResetNotificationAlert teachingAssignmentId={selectedTaId} />}
      
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Teaching Assignment (Section)</div>
          <select
            value={selectedTaId ?? ''}
            onChange={(e) => setSelectedTaId(e.target.value ? Number(e.target.value) : null)}
            className="obe-input"
            disabled={tas.length === 0 || typeof fixedTeachingAssignmentId === 'number'}
          >
            {tas.length === 0 ? (
              <option value="">No teaching assignments</option>
            ) : (
              tas.map((ta) => (
                <option key={ta.id} value={ta.id}>
                  {ta.section_name} — {ta.academic_year}
                </option>
              ))
            )}
          </select>
          {taError && <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{taError}</div>}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
          Student rows load from the selected section roster.
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {Boolean(isSpecial && selectedTaId) ? (
            <button className="obe-btn" onClick={() => setShowFacultyPanel((s) => !s)}>
              Show exams
            </button>
          ) : null}
          <button 
            className="obe-btn obe-btn-primary" 
            onClick={() => setShowCQIEditor(true)}
            title="Configure when to show CQI button"
          >
            CQI Editor
          </button>
        </div>
      </div>

      {isSpecial && showFacultyPanel && selectedTaId ? (
        <div style={{ marginBottom: 12 }}>
          <FacultyAssessmentPanel
            teachingAssignmentId={selectedTaId ?? undefined}
            onSaved={(arr) => {
              setFacultyEnabledAssessments(Array.isArray(arr) && arr.length ? arr : null);
              setShowFacultyPanel(false);
            }}
            onClose={() => setShowFacultyPanel(false)}
          />
        </div>
      ) : null}

      {/* IQAC reset (per assessment) */}
      {Boolean(iqacResetEnabled) && active !== 'dashboard' && selectedTaId != null ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button
            className="obe-btn obe-btn-danger"
            disabled={resetting}
            onClick={async () => {
              const assessment = active as Exclude<TabKey, 'dashboard'>;
              const ok = window.confirm(`Reset ${assessment.toUpperCase()} for this section? This clears draft + published data for that exam.`);
              if (!ok) return;
              try {
                setResetting(true);
                await iqacResetAssessment(assessment as DraftAssessmentKey, String(subjectId), Number(selectedTaId));

                // Clear local cached drafts so UI doesn't keep showing old marks
                clearLocalDraftCache(String(subjectId), String(assessment));

                setRefreshKey((k) => k + 1);
                alert('Reset completed.');
              } catch (e: any) {
                alert(e?.message || 'Reset failed');
              } finally {
                setResetting(false);
              }
            }}
          >
            {resetting ? 'Resetting…' : 'Reset This Exam'}
          </button>
        </div>
      ) : null}

      <div style={{ 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)',
        borderRadius: 12,
        padding: '16px',
        marginBottom: 20,
        border: '1px solid #cbd5e1',
        boxShadow: '0 2px 8px rgba(2,6,23,0.04), inset 0 1px 0 rgba(255,255,255,0.5)'
      }}>
        <div style={{ 
          fontSize: 12, 
          fontWeight: 700, 
          color: '#64748b', 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em',
          marginBottom: 12
        }}>
          Assessment Exams
        </div>
        <div className="obe-sidebar-nav" aria-label="Mark Entry sub-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {visibleTabs.map((t) => (
            <React.Fragment key={t.key}>
              <TabButton active={active === t.key} label={t.label} onClick={() => setActive(t.key)} />
              {cqiInfos
                .filter(info => info && info.assessment === t.key)
                .map((info, idx) => {
                  const isThisCqiActive = active === 'cqi' && 
                    selectedCqiInfo?.assessment === info.assessment && 
                    JSON.stringify(selectedCqiInfo?.cos) === JSON.stringify(info.cos);
                  
                  return (
                    <button
                      key={`cqi-${t.key}-${idx}`}
                      onClick={() => {
                        setSelectedCqiInfo(info);
                        setActive('cqi');
                      }}
                      className={`obe-sidebar-btn ${isThisCqiActive ? 'active' : ''}`}
                      style={{
                        backgroundColor: isThisCqiActive ? '#10b981' : '#d1fae5',
                        color: isThisCqiActive ? 'white' : '#065f46',
                        borderColor: '#10b981',
                      }}
                      title={`CQI for ${info.cos.join(', ')}`}
                    >
                      CQI {info.cos.length > 1 ? `(${info.cos.join(', ')})` : `(${info.cos[0]})`}
                    </button>
                  );
                })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {active === 'dashboard' && (
        <div>
          <h3 style={{ margin: '0 0 6px 0' }}>Dashboard</h3>
          <div style={{ color: '#6b7280', marginBottom: 12, fontSize: 14 }}>
            Quick overview for <b>{subjectId}</b>. Use the tabs to enter marks.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            {visibleTabs.filter((t) => t.key !== 'dashboard').map((t) => (
              <div
                key={t.key}
                className="obe-card"
              >
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{t.label}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
                  Rows saved: {counts[t.key] ?? 0}
                </div>
                <button
                  onClick={() => setActive(t.key)}
                  className="obe-btn obe-btn-primary"
                  style={{ marginTop: 10 }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {active !== 'dashboard' && (
        <div key={`${active}_${refreshKey}`}>
          <h3 style={{ margin: '0 0 6px 0' }}>{visibleTabs.find((t) => t.key === active)?.label}</h3>
          <div style={{ color: '#6b7280', marginBottom: 12, fontSize: 14 }}>
            {active === 'formative1' 
              ? (normalizedEffectiveClassType === 'TCPL' ? 'Enter and manage LAB-1 marks (experiments + totals).' : 'Enter and manage Formative-1 assessment marks with BTL mapping.')
              : active === 'formative2'
                ? (normalizedEffectiveClassType === 'TCPL' ? 'Enter and manage LAB-2 marks (experiments + totals).' : 'Enter and manage Formative-2 assessment marks with BTL mapping.')
              : active === 'ssa1'
                ? 'SSA1 sheet-style entry (CO + BTL attainment) matching the Excel layout.'
              : active === 'review1'
                ? 'Review 1 sheet-style entry (CO + BTL attainment) matching the Excel layout.'
              : active === 'ssa2'
                ? 'SSA2 sheet-style entry (CO + BTL attainment) matching the Excel layout.'
              : active === 'review2'
                ? 'Review 2 sheet-style entry (CO + BTL attainment) matching the Excel layout.'
              : active === 'cia1'
                ? (normalizedEffectiveClassType === 'LAB'
                    ? 'CIA 1 LAB entry (CO-1/CO-2 experiments + CIA exam)'
                    : normalizedEffectiveClassType === 'PRACTICAL'
                      ? 'CIA 1 Review (Practical) - enter review marks for practical content.'
                      : 'CIA 1 sheet-style entry (Q-wise + CO + BTL) matching the Excel layout.')
              : active === 'cia2'
                ? (normalizedEffectiveClassType === 'LAB' ? 'CIA 2 LAB entry (CO-3/CO-4 experiments + CIA exam).' : 'CIA 2 sheet-style entry (Q-wise + CO + BTL) matching the Excel layout.')
              : active === 'model'
                ? (normalizedEffectiveClassType === 'LAB' ? 'MODEL LAB entry (CO-5 experiments + CIA exam).' : 'MODEL blank table template (same layout style as CIA sheets).')
                : 'Enter and save marks locally for this assessment.'}
          </div>
          <fieldset disabled={Boolean(viewerMode)} style={{ border: 0, padding: 0, margin: 0 }}>
            {active === 'formative1' ? (
              normalizedEffectiveClassType === 'TCPL' ? (
                <LabEntry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  assessmentKey="formative1"
                  label="LAB 1"
                  coA={1}
                  coB={2}
                />
              ) : (
                <Formative1List subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />
              )
            ) : active === 'formative2' ? (
              normalizedEffectiveClassType === 'TCPL' ? (
                <LabEntry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  assessmentKey="formative2"
                  label="LAB 2"
                  coA={3}
                  coB={4}
                />
              ) : (
                <Formative2List subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />
              )
            ) : active === 'ssa1' ? (
              <Ssa1Entry
                subjectId={subjectId}
                teachingAssignmentId={selectedTaId ?? undefined}
              />
            ) : active === 'review1' ? (
              <Ssa1Entry
                subjectId={subjectId}
                teachingAssignmentId={selectedTaId ?? undefined}
                assessmentKey="review1"
                label="Review 1"
              />
            ) : active === 'ssa2' ? (
              <Ssa2Entry
                subjectId={subjectId}
                teachingAssignmentId={selectedTaId ?? undefined}
              />
            ) : active === 'review2' ? (
              <Ssa2Entry
                subjectId={subjectId}
                teachingAssignmentId={selectedTaId ?? undefined}
                assessmentKey="review2"
                label="Review 2"
              />
            ) : active === 'cia1' ? (
              normalizedEffectiveClassType === 'LAB' ? (
                <LabCourseMarksEntry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  assessmentKey="cia1"
                  label="CIA 1 LAB"
                  coA={1}
                  coB={2}
                  viewerMode={Boolean(viewerMode)}
                />
              ) : normalizedEffectiveClassType === 'PRACTICAL' ? (
                <ReviewEntry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} assessmentKey="cia1" viewerMode={Boolean(viewerMode)} />
              ) : (
                <Cia1Entry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  classType={effectiveClassType ?? null}
                  questionPaperType={questionPaperType ?? null}
                />
              )
            ) : active === 'cia2' ? (
              normalizedEffectiveClassType === 'LAB' ? (
                <LabCourseMarksEntry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  assessmentKey="cia2"
                  label="CIA 2 LAB"
                  coA={3}
                  coB={4}
                  viewerMode={Boolean(viewerMode)}
                />
              ) : normalizedEffectiveClassType === 'PRACTICAL' ? (
                <ReviewEntry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} assessmentKey="cia2" viewerMode={Boolean(viewerMode)} />
              ) : (
                <Cia2Entry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  classType={effectiveClassType ?? null}
                  questionPaperType={questionPaperType ?? null}
                />
              )
            ) : active === 'model' ? (
              normalizedEffectiveClassType === 'LAB' ? (
                <LabCourseMarksEntry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  assessmentKey="model"
                  label="MODEL LAB"
                  coA={5}
                  coB={null}
                  viewerMode={Boolean(viewerMode)}
                />
              ) : normalizedEffectiveClassType === 'PRACTICAL' ? (
                <ReviewEntry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} assessmentKey="model" viewerMode={Boolean(viewerMode)} />
              ) : (
                <ModelEntry
                  subjectId={subjectId}
                  teachingAssignmentId={selectedTaId ?? undefined}
                  classType={effectiveClassType ?? null}
                  questionPaperType={questionPaperType ?? null}
                />
              )
            ) : active === 'cqi' ? (
              <CQIEntry
                subjectId={subjectId}
                teachingAssignmentId={selectedTaId ?? undefined}
                assessmentType={selectedCqiInfo?.assessment as 'cia1' | 'cia2' | 'model' | undefined}
                cos={selectedCqiInfo?.cos}
              />
            ) : (
              <MarkEntryTable subjectId={subjectId} tab={active as Exclude<TabKey, 'dashboard'>} />
            )}
          </fieldset>
        </div>
      )}

      <CQIEditor
        isOpen={showCQIEditor}
        onClose={() => setShowCQIEditor(false)}
        onSave={handleCQISave}
        currentSelection={cqiConfigs}
      />
    </div>
  );
}
