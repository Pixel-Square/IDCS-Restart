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
import ReviewCourseMarkEntery from './ReviewCourseMarkEntery';
import Review1Entry from './Review1Entry';
import Review2Entry from './Review2Entry';
import Ssa1Entry from './Ssa1Entry';
import Ssa2Entry from './Ssa2Entry';
import Ssa1SheetEntry from './Ssa1SheetEntry';
import Ssa2SheetEntry from './Ssa2SheetEntry';
import CQIEntry from '../pages/staff/CQIEntry';
import DashboardWidgets from './DashboardWidgets';
import { DraftAssessmentKey, DueAssessmentKey, fetchMyTeachingAssignments, fetchPublishWindow, iqacResetAssessment, TeachingAssignmentItem } from '../services/obe';
import * as OBE from '../services/obe';
import FacultyAssessmentPanel from './FacultyAssessmentPanel';
import fetchWithAuth from '../services/fetchAuth';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import IqacResetNotificationAlert from './IqacResetNotificationAlert';
import { clearLocalDraftCache } from '../utils/obeDraftCache';

type BaseTabKey = 'dashboard' | 'ssa1' | 'review1' | 'ssa2' | 'review2' | 'formative1' | 'formative2' | 'cia1' | 'cia2' | 'model';
type CqiTabKey = `cqi_${number}`;
type TabKey = BaseTabKey | CqiTabKey;

type CqiPlacement = {
  showAfter: 'cia1' | 'cia2' | 'model';
  assessmentType: 'cia1' | 'cia2' | 'model';
  cos: string[];
};

type TabDef = {
  key: TabKey;
  label: string;
  cqi?: CqiPlacement;
};

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

function tabToAssessmentKey(tab: TabKey): DueAssessmentKey | null {
  if (String(tab).startsWith('cqi_')) return null;
  if (tab === 'ssa1') return 'ssa1';
  if (tab === 'review1') return 'review1';
  if (tab === 'ssa2') return 'ssa2';
  if (tab === 'review2') return 'review2';
  if (tab === 'formative1') return 'formative1';
  if (tab === 'formative2') return 'formative2';
  if (tab === 'cia1') return 'cia1';
  if (tab === 'cia2') return 'cia2';
  if (tab === 'model') return 'model';
  return null;
}

const BASE_TABS: Array<{ key: BaseTabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'ssa1', label: 'SSA1' },
  { key: 'formative1', label: 'Formative 1' },
  { key: 'cia1', label: 'CIA 1' },
  { key: 'ssa2', label: 'SSA2' },
  { key: 'formative2', label: 'Formative 2' },
  { key: 'cia2', label: 'CIA 2' },
  { key: 'model', label: 'MODEL' },
];

function parseCqiOption(optionId: string): CqiPlacement | null {
  const id = String(optionId || '').trim().toLowerCase();
  if (id === 'cia1_co1_co2') return { showAfter: 'cia1', assessmentType: 'cia1', cos: ['CO1', 'CO2'] };
  if (id === 'cia2_co3_co4') return { showAfter: 'cia2', assessmentType: 'cia2', cos: ['CO3', 'CO4'] };
  if (id === 'model_co1_co2_co3_co4_co5') return { showAfter: 'model', assessmentType: 'model', cos: ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'] };
  if (id === 'model_co3_co4_co5') return { showAfter: 'model', assessmentType: 'model', cos: ['CO3', 'CO4', 'CO5'] };
  if (id === 'model_co5') return { showAfter: 'model', assessmentType: 'model', cos: ['CO5'] };
  return null;
}

function normalizeEnabledAssessments(enabledAssessments: string[] | null | undefined): Set<string> {
  const arr = Array.isArray(enabledAssessments) ? enabledAssessments : [];
  return new Set(arr.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
}

function getVisibleTabs(classType: string | null | undefined, enabledAssessments?: string[] | null): TabDef[] {
  const ct = normalizeClassType(classType);
  const enabled = normalizeEnabledAssessments(enabledAssessments);

  // SPECIAL: show only explicitly enabled assessments (+ dashboard)
  if (ct === 'SPECIAL') {
    const allowedKeys = new Set<BaseTabKey>(['dashboard']);
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

  // PROJECT: show only Review 1, Review 2 and MODEL Review (plus dashboard)
  if (ct === 'PROJECT') {
    return [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'review1', label: 'Review 1' },
      { key: 'review2', label: 'Review 2' },
      { key: 'model', label: 'MODEL Review' },
    ];
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

function storageKey(subjectId: string, tab: BaseTabKey) {
  return `marks_${subjectId}_${tab}`;
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

// Extended tab button to support CQI floating variant
function TabButtonExtended({
  active,
  label,
  onClick,
  isCqi,
  uniqueId,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  isCqi?: boolean;
  uniqueId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`obe-sidebar-btn ${active ? 'active' : ''} ${isCqi ? 'cqi-floating-btn' : ''}`}
      {...(uniqueId ? { 'data-cqi-id': uniqueId } as any : {})}
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
  tab: Exclude<BaseTabKey, 'dashboard'>;
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

  // Dispatch a custom event before switching tabs so child components can auto-save
  const switchTab = React.useCallback((nextTab: TabKey) => {
    if (nextTab === active) return;
    // Fire a synchronous event so each entry component can save draft before unmount
    try {
      window.dispatchEvent(new CustomEvent('obe:before-tab-switch', { detail: { from: active, to: nextTab } }));
    } catch {
      // ignore
    }
    setActive(nextTab);
    if (subjectId) {
      lsSet(`markEntry_activeTab_${subjectId}`, nextTab);
    }
  }, [active, subjectId]);

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [taError, setTaError] = useState<string | null>(null);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);
  const [facultyEnabledAssessments, setFacultyEnabledAssessments] = useState<string[] | null | undefined>(undefined);
  const [showFacultyPanel, setShowFacultyPanel] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cqiConfig, setCqiConfig] = useState<{ options: string[]; divider: number; multiplier: number } | null>(null);

  const activeAssessmentKey = useMemo(() => tabToAssessmentKey(active), [active]);
  const [activeGate, setActiveGate] = useState<{ loading: boolean; enabled: boolean; open: boolean; error: string | null }>({
    loading: false,
    enabled: true,
    open: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!activeAssessmentKey) {
        if (!mounted) return;
        setActiveGate({ loading: false, enabled: true, open: true, error: null });
        return;
      }

      if (!mounted) return;
      setActiveGate({ loading: true, enabled: true, open: true, error: null });
      try {
        const resp = await fetchPublishWindow(activeAssessmentKey, String(subjectId || ''), selectedTaId ?? undefined);
        if (!mounted) return;
        const enabled = resp?.assessment_enabled ?? true;
        const open = resp?.assessment_open ?? true;
        setActiveGate({ loading: false, enabled: Boolean(enabled), open: Boolean(open), error: null });
      } catch (e: any) {
        if (!mounted) return;
        // Fail-open for network hiccups.
        setActiveGate({ loading: false, enabled: true, open: true, error: e?.message || 'Failed to check exam availability' });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeAssessmentKey, subjectId, selectedTaId]);

  const activeEnabled = activeAssessmentKey ? Boolean(activeGate.enabled) : true;
  const activeForcedViewerMode = Boolean(viewerMode) || (activeAssessmentKey ? !activeGate.open : false);

  const selectedTa = useMemo(() => {
    if (selectedTaId == null) return null;
    return (tas || []).find((t) => t.id === selectedTaId) || null;
  }, [tas, selectedTaId]);

  const [taDerivedClassType, setTaDerivedClassType] = useState<string | null>(null);
  const [taDerivedMeta, setTaDerivedMeta] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setTaDerivedClassType(null);
      setTaDerivedMeta(null);
      if (selectedTaId == null) return;

      const taObj = (selectedTa as any) || null;
      const directCt = String(taObj?.class_type || '').trim();
      const hasYear = Boolean(String(taObj?.academic_year || '').trim());
      const hasSem = typeof taObj?.semester !== 'undefined' && taObj?.semester != null;
      const hasDept = Boolean(taObj?.department || taObj?.department_name);
      const hasSection = Boolean(String(taObj?.section_name || '').trim());

      // If TA list already contains everything we need, avoid extra calls.
      if (directCt && hasYear && hasSem && hasDept && hasSection) {
        setTaDerivedClassType(directCt);
        return;
      }

      // If parent already provided classType, don't force extra calls.
      const propCt = String(classType || '').trim();
      // Note: still fetch roster meta if TA lacks year/sem/dept info.

      try {
        const roster = await fetchTeachingAssignmentRoster(Number(selectedTaId));
        if (!mounted) return;
        const taInfo = (roster as any)?.teaching_assignment || {};
        const ct = String(taInfo?.class_type || '').trim();
        setTaDerivedClassType(ct || directCt || propCt || null);
        setTaDerivedMeta({
          academic_year: taInfo?.academic_year || taInfo?.academic_year_name || taInfo?.year || null,
          semester: typeof taInfo?.semester !== 'undefined' ? taInfo?.semester : null,
          department: taInfo?.department || taInfo?.department_name || null,
          section_name: taInfo?.section_name || taInfo?.section || null,
        });
      } catch {
        if (!mounted) return;
        setTaDerivedClassType(directCt || propCt || null);
        setTaDerivedMeta(null);
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

  // Tab visibility: only treat QP2 as TCPR subtype when class type is missing.
  // If class type is explicitly THEORY, keep formative tabs (SSA/Formative/CIA).
  const effectiveClassTypeForTabs = useMemo(() => {
    const ct = normalizeClassType(effectiveClassType);
    // Some data sources may contain variants like "TC PR", "TC-PR" or "TCPR - ...".
    const ctKey = ct.replace(/[^A-Z0-9]/g, '');
    if (ctKey.includes('TCPR')) return 'TCPR';
    if (ctKey.includes('TCPL')) return 'TCPL';
    const qp = String(questionPaperType || '').trim().toUpperCase();
    if (qp === 'QP2' && !ct) return 'TCPR';
    return effectiveClassType;
  }, [effectiveClassType, questionPaperType]);

  const normalizedEffectiveClassType = useMemo(() => normalizeClassType(effectiveClassTypeForTabs), [effectiveClassTypeForTabs]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await OBE.fetchIqacCqiConfig();
        if (!mounted) return;
        const rawOpts = Array.isArray(cfg?.options) ? cfg.options : [];
        const optIds = rawOpts
          .map((o: any) => {
            if (typeof o === 'string') return String(o || '');
            if (o && typeof o === 'object' && (o as any).id) return String((o as any).id || '');
            return '';
          })
          .map((s: string) => s.trim())
          .filter(Boolean);
        setCqiConfig({
          options: optIds,
          divider: Number.isFinite(Number(cfg?.divider)) ? Number(cfg.divider) : 2,
          multiplier: Number.isFinite(Number(cfg?.multiplier)) ? Number(cfg.multiplier) : 0.15,
        });
      } catch {
        if (!mounted) return;
        setCqiConfig(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isSpecial = useMemo(() => normalizedEffectiveClassType === 'SPECIAL', [normalizedEffectiveClassType]);

  // If faculty has set enabled assessments for the selected TA, prefer that.
  const effectiveEnabled = facultyEnabledAssessments === undefined ? enabledAssessments : facultyEnabledAssessments;
  const baseVisibleTabs = useMemo(() => getVisibleTabs(effectiveClassTypeForTabs, effectiveEnabled), [effectiveClassTypeForTabs, enabledAssessments, facultyEnabledAssessments]);

  const cqiPlacements = useMemo(() => {
    const options = Array.isArray(cqiConfig?.options) ? cqiConfig.options : [];
    return options
      .map((raw) => parseCqiOption(raw))
      .filter((x): x is CqiPlacement => Boolean(x));
  }, [cqiConfig]);

  const visibleTabs = useMemo(() => {
    const out: TabDef[] = [...baseVisibleTabs];
    if (!cqiPlacements.length) return out;

    cqiPlacements.forEach((placement, idxPlacement) => {
      const cqiLabel = `CQI (${placement.assessmentType.toUpperCase()} ${placement.cos.join(', ')})`;
      const cqiTab: TabDef = {
        key: `cqi_${idxPlacement}`,
        label: cqiLabel,
        cqi: placement,
      };
      const idx = out.findIndex((t) => t.key === placement.showAfter);
      if (idx >= 0) {
        let insertAt = idx + 1;
        while (insertAt < out.length && String(out[insertAt]?.key || '').startsWith('cqi_') && out[insertAt]?.cqi?.showAfter === placement.showAfter) {
          insertAt += 1;
        }
        out.splice(insertAt, 0, cqiTab);
      }
      else out.push(cqiTab);
    });
    return out;
  }, [baseVisibleTabs, cqiPlacements]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<string>(`markEntry_activeTab_${subjectId}`);
    if (stored && visibleTabs.some((t) => t.key === (stored as TabKey))) setActive(stored as TabKey);
  }, [subjectId]);

  useEffect(() => {
    // If class type changes or user navigates to a course with different visible tabs,
    // ensure the active tab is still valid.
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
  

  const counts = useMemo(() => {
    if (!subjectId) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    for (const t of visibleTabs) {
      if (t.key === 'dashboard' || String(t.key).startsWith('cqi_')) continue;
      if (t.key === 'ssa1') {
        const ssa1 = lsGet<{ rows?: unknown }>(`ssa1_sheet_${subjectId}`);
        const ssa1Rows = (ssa1 as any)?.rows;
        map[t.key] = Array.isArray(ssa1Rows) ? ssa1Rows.length : 0;
        continue;
      }
      if (t.key === 'review1') {
        const review1 = lsGet<{ rows?: unknown }>(`review1_sheet_${subjectId}`);
        const review1Rows = (review1 as any)?.rows;
        map[t.key] = Array.isArray(review1Rows) ? review1Rows.length : 0;
        continue;
      }
      if (t.key === 'ssa2') {
        const ssa2 = lsGet<{ rows?: unknown }>(`ssa2_sheet_${subjectId}`);
        const ssa2Rows = (ssa2 as any)?.rows;
        map[t.key] = Array.isArray(ssa2Rows) ? ssa2Rows.length : 0;
        continue;
      }
      if (t.key === 'review2') {
        const review2 = lsGet<{ rows?: unknown }>(`review2_sheet_${subjectId}`);
        const review2Rows = (review2 as any)?.rows;
        map[t.key] = Array.isArray(review2Rows) ? review2Rows.length : 0;
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
      const rows = lsGet<MarkRow[]>(storageKey(subjectId, t.key as BaseTabKey)) || [];
      map[t.key] = Array.isArray(rows) ? rows.length : 0;
    }
    return map;
  }, [subjectId, active, visibleTabs, refreshKey]);

  return (
    <div>
      {/* Show reset notification if faculty opens a course that was reset by IQAC */}
      {selectedTaId != null && (
        <IqacResetNotificationAlert
          teachingAssignmentId={selectedTaId}
          subjectId={String(subjectId)}
          onApplied={() => setRefreshKey((k) => k + 1)}
        />
      )}
      
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Teaching Assignment (Section)</div>
          {tas.length === 0 ? (
            <div className="obe-input">No teaching assignments</div>
          ) : (
            <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fff', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{(selectedTa || tas[0])?.section_name || taDerivedMeta?.section_name || '—'}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {(() => {
                    const currentTa = (selectedTa || tas[0] || {}) as any;
                    const academicYear = currentTa.academic_year || taDerivedMeta?.academic_year || currentTa.academic_year_name || currentTa.year || '';
                    const sem = typeof currentTa.semester !== 'undefined' && currentTa.semester != null ? currentTa.semester : (typeof taDerivedMeta?.semester !== 'undefined' ? taDerivedMeta?.semester : (tas[0] as any)?.semester);
                    const deptObj =
                      currentTa.department ||
                      currentTa.section_details?.department ||
                      currentTa.section_details?.batch?.course?.department ||
                      taDerivedMeta?.department ||
                      (currentTa.department_name ? { name: currentTa.department_name } : null) ||
                      (tas[0] as any)?.department ||
                      (tas[0] as any)?.section_details?.department;
                    const deptLabel = deptObj?.short_name || deptObj?.code || deptObj?.name || currentTa.department_name || '';
                    const parts: string[] = [];
                    parts.push(academicYear || '');
                    if (typeof sem !== 'undefined' && sem != null) parts.push(`Sem ${sem}`);
                    if (deptLabel) parts.push(deptLabel);
                    return parts.filter(Boolean).join(' · ');
                  })()}
                </div>
            </div>
          )}
          {taError && <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{taError}</div>}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
          Student rows load from the selected section roster.
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {isSpecial && selectedTaId ? (
            <button className="obe-btn" onClick={() => setShowFacultyPanel((s) => !s)}>
              Show exams
            </button>
          ) : null}
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
      {Boolean(iqacResetEnabled) && Boolean(activeAssessmentKey) && selectedTaId != null ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button
            className="obe-btn obe-btn-danger"
            disabled={resetting}
            onClick={async () => {
              const assessment = activeAssessmentKey as DraftAssessmentKey;
              const ok = window.confirm(`Reset ${assessment.toUpperCase()} for this section? This clears draft + published data for that exam.`);
              if (!ok) return;
              try {
                setResetting(true);
                await iqacResetAssessment(assessment, String(subjectId), Number(selectedTaId));

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
          {visibleTabs.map((t, idx) => (
            <React.Fragment key={t.key}>
              {t.cqi ? (
                <TabButtonExtended
                  active={active === t.key}
                  label={t.label}
                  onClick={() => switchTab(t.key)}
                  isCqi
                  uniqueId={String(t.key)}
                />
              ) : (
                <TabButton active={active === t.key} label={t.label} onClick={() => switchTab(t.key)} />
              )}
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
                  Rows saved: {String(t.key).startsWith('cqi_') ? '—' : (counts[t.key] ?? 0)}
                </div>
                {/* Open button removed per dashboard design update */}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <DashboardWidgets subjectId={subjectId} />
          </div>
        </div>
      )}

      {active !== 'dashboard' && (
        <div key={`${active}_${refreshKey}`}>
          <h3 style={{ margin: '0 0 6px 0' }}>{visibleTabs.find((t) => t.key === active)?.label}</h3>
          {(() => {
            const activeTabDef = visibleTabs.find((t) => t.key === active) || null;
            const activeCqi = activeTabDef?.cqi || null;
            return (
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
                      : normalizedEffectiveClassType === 'TCPR'
                        ? 'CIA 1 Review (TCPR) - enter review marks for TCPR content.'
                      : 'CIA 1 sheet-style entry (Q-wise + CO + BTL) matching the Excel layout.')
              : active === 'cia2'
                ? (
                    normalizedEffectiveClassType === 'LAB'
                      ? 'CIA 2 LAB entry (CO-3/CO-4/CO-5 experiments + CIA exam).'
                      : normalizedEffectiveClassType === 'PRACTICAL'
                        ? 'CIA 2 Review (Practical) - enter review marks for practical content.'
                        : normalizedEffectiveClassType === 'TCPR'
                          ? 'CIA 2 Review (TCPR) - enter review marks for TCPR content.'
                          : 'CIA 2 sheet-style entry (Q-wise + CO + BTL) matching the Excel layout.'
                  )
              : active === 'model'
                ? (
                    normalizedEffectiveClassType === 'LAB'
                      ? 'MODEL LAB entry (CO-5 experiments + CIA exam).'
                      : normalizedEffectiveClassType === 'PRACTICAL'
                        ? 'MODEL Review (Practical) - enter review marks for practical content.'
                        : normalizedEffectiveClassType === 'TCPR'
                          ? 'MODEL Review (TCPR) - enter review marks for TCPR content.'
                          : 'MODEL blank table template (same layout style as CIA sheets).'
                  )
                : String(active).startsWith('cqi_')
                  ? `CQI view for ${(activeCqi?.assessmentType || 'assessment').toUpperCase()} (${(activeCqi?.cos || []).join(', ')})`
                : 'Enter and save marks locally for this assessment.'}
          </div>
            );
          })()}
          {activeGate.loading && activeAssessmentKey ? (
            <div style={{ padding: '10px 0', color: '#6b7280', fontSize: 13 }}>Checking availability…</div>
          ) : !activeEnabled && activeAssessmentKey ? (
            <div
              style={{
                background: '#fff7ed',
                border: '1px solid #fdba7433',
                color: '#9a3412',
                padding: 12,
                borderRadius: 12,
                fontWeight: 800,
              }}
            >
              This exam is disabled by IQAC. Please contact IQAC to enable it.
            </div>
          ) : (
            <fieldset disabled={Boolean(activeForcedViewerMode)} style={{ border: 0, padding: 0, margin: 0 }}>
              {(() => {
                const activeTabDef = visibleTabs.find((t) => t.key === active) || null;
                const activeCqi = activeTabDef?.cqi || null;

                // Use an explicit switch/if-chain to avoid deeply nested ternaries.
                if (active === 'formative1') {
                  return normalizedEffectiveClassType === 'TCPL' ? (
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
                  );
                }

                if (active === 'formative2') {
                  return normalizedEffectiveClassType === 'TCPL' ? (
                    <LabEntry
                      subjectId={subjectId}
                      teachingAssignmentId={selectedTaId ?? undefined}
                      assessmentKey="formative2"
                      label="LAB 2"
                      coA={2}
                      coB={3}
                    />
                  ) : (
                    <Formative2List subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />
                  );
                }

                if (active === 'ssa1') return <Ssa1Entry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />;
                if (active === 'review1') {
                  return normalizedEffectiveClassType === 'TCPR' ? (
                    <Ssa1SheetEntry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} assessmentKey="review1" label="Review 1" />
                  ) : (
                    <Review1Entry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />
                  );
                }
                if (active === 'ssa2') return <Ssa2Entry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />;
                if (active === 'review2') {
                  return normalizedEffectiveClassType === 'TCPR' ? (
                    <Ssa2SheetEntry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} assessmentKey="review2" label="Review 2" />
                  ) : (
                    <Review2Entry subjectId={subjectId} teachingAssignmentId={selectedTaId ?? undefined} />
                  );
                }

                if (active === 'cia1') {
                  if (normalizedEffectiveClassType === 'LAB') {
                    return (
                      <LabCourseMarksEntry
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="cia1"
                        label="CIA 1 LAB"
                        coA={1}
                        coB={2}
                        initialEnabledCos={[1, 2]}
                        viewerMode={Boolean(activeForcedViewerMode)}
                      />
                    );
                  }
                  if (normalizedEffectiveClassType === 'PROJECT') {
                    return (
                      <ReviewCourseMarkEntery
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="cia1"
                        viewerMode={Boolean(activeForcedViewerMode)}
                        classType={effectiveClassType ?? null}
                      />
                    );
                  }
                  if (normalizedEffectiveClassType === 'PRACTICAL') {
                    return (
                      <ReviewEntry
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="cia1"
                        viewerMode={Boolean(activeForcedViewerMode)}
                      />
                    );
                  }
                  return (
                    <Cia1Entry
                      subjectId={subjectId}
                      teachingAssignmentId={selectedTaId ?? undefined}
                      classType={effectiveClassType ?? null}
                      questionPaperType={questionPaperType ?? null}
                    />
                  );
                }

                if (active === 'cia2') {
                  if (normalizedEffectiveClassType === 'LAB') {
                    return (
                      <LabCourseMarksEntry
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="cia2"
                        label="CIA 2 LAB"
                        coA={3}
                        coB={4}
                        initialEnabledCos={[3, 4, 5]}
                        viewerMode={Boolean(activeForcedViewerMode)}
                      />
                    );
                  }
                  if (normalizedEffectiveClassType === 'PROJECT') {
                    return (
                      <ReviewCourseMarkEntery
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="cia2"
                        viewerMode={Boolean(activeForcedViewerMode)}
                        classType={effectiveClassType ?? null}
                      />
                    );
                  }
                  if (normalizedEffectiveClassType === 'PRACTICAL') {
                    return (
                      <ReviewEntry
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="cia2"
                        viewerMode={Boolean(activeForcedViewerMode)}
                      />
                    );
                  }
                  return (
                    <Cia2Entry
                      subjectId={subjectId}
                      teachingAssignmentId={selectedTaId ?? undefined}
                      classType={effectiveClassType ?? null}
                      questionPaperType={questionPaperType ?? null}
                    />
                  );
                }

                if (active === 'model') {
                  if (normalizedEffectiveClassType === 'LAB') {
                    return (
                      <LabCourseMarksEntry
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="model"
                        label="MODEL LAB"
                        coA={5}
                        coB={null}
                        initialEnabledCos={[5]}
                        viewerMode={Boolean(activeForcedViewerMode)}
                      />
                    );
                  }
                  if (normalizedEffectiveClassType === 'PROJECT') {
                    return (
                      <ReviewCourseMarkEntery
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="model"
                        viewerMode={Boolean(activeForcedViewerMode)}
                        classType={effectiveClassType ?? null}
                      />
                    );
                  }
                  if (normalizedEffectiveClassType === 'PRACTICAL') {
                    return (
                      <ReviewEntry
                        subjectId={subjectId}
                        teachingAssignmentId={selectedTaId ?? undefined}
                        assessmentKey="model"
                        viewerMode={Boolean(activeForcedViewerMode)}
                      />
                    );
                  }
                  return (
                    <ModelEntry
                      subjectId={subjectId}
                      teachingAssignmentId={selectedTaId ?? undefined}
                      classType={effectiveClassType ?? null}
                      questionPaperType={questionPaperType ?? null}
                    />
                  );
                }

                if (String(active).startsWith('cqi_')) {
                  return (
                    <CQIEntry
                      subjectId={subjectId}
                      teachingAssignmentId={selectedTaId ?? undefined}
                      classType={effectiveClassType ?? null}
                      enabledAssessments={effectiveEnabled ?? null}
                      assessmentType={activeCqi?.assessmentType || 'model'}
                      cos={activeCqi?.cos || ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']}
                      cqiDivider={Number(cqiConfig?.divider) || 2}
                      cqiMultiplier={Number(cqiConfig?.multiplier) || 0.15}
                    />
                  );
                }

                // Default: generic mark entry table
                return <MarkEntryTable subjectId={subjectId} tab={active as Exclude<BaseTabKey, 'dashboard'>} />;
              })()}
            </fieldset>
          )}
        </div>
      )}

      {/* CQI entry available as a tab */}
    </div>
  );
}
