import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { confirmMarkManagerLock, createEditRequest, createPublishRequest, fetchDraft, fetchPublishedLabSheet, publishLabSheet, saveDraft } from '../services/obe';
import { useEditWindow } from '../hooks/useEditWindow';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { usePublishWindow } from '../hooks/usePublishWindow';
import PublishLockOverlay from './PublishLockOverlay';
// Vite-friendly asset URL for lock GIF used in the floating panel
const lockPanelGif = new URL('https://static.vecteezy.com/system/resources/thumbnails/014/585/778/small/gold-locked-padlock-png.png', import.meta.url).href;
import { fetchDeptRows, fetchMasters } from '../services/curriculum';
import { isLabClassType, normalizeClassType } from '../constants/classTypes';

const LAB_CO_MAX_OVERRIDE = { co1: 42, co2: 42, co3: 58, co4: 42, co5: 42 };

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type LabRowState = {
  studentId: number;
  absent?: boolean;
  absentKind?: 'AL' | 'ML' | 'SKL';
  marksA: Array<number | ''>;
  marksB: Array<number | ''>;
  // New per-CO marks storage (CO number -> experiment marks)
  // Backward compatible with existing marksA/marksB.
  marksByCo?: Record<string, Array<number | ''>>;
  ciaExam?: number | '';
};

type BtlLevel = '' | 1 | 2 | 3 | 4 | 5 | 6;

type LabSheet = {
  termLabel: string;
  batchLabel: string;
  coANum: number;
  coBNum?: number | null;
  coAEnabled: boolean;
  coBEnabled: boolean;
  ciaExamEnabled?: boolean;
  expCountA: number;
  expCountB: number;
  btlA: BtlLevel[];
  btlB: BtlLevel[];
  expMaxA: number;
  expMaxB: number;
  rowsByStudentId: Record<string, LabRowState>;
  // New optional per-CO configuration to allow enabling more than two COs
  coConfigs?: Record<string, { enabled: boolean; expCount: number; expMax: number; btl: BtlLevel[] }>

  // Mark Manager lock state
  markManagerLocked?: boolean;
  markManagerSnapshot?: string | null;
  markManagerApprovalUntil?: string | null;
};

type LabDraftPayload = {
  sheet: LabSheet;
};

type LabAssessmentKey = 'cia1' | 'cia2' | 'model';

type Props = {
  subjectId?: string | null;
  teachingAssignmentId?: number;
  assessmentKey: LabAssessmentKey;
  label: string;
  coA: number;
  coB?: number | null;

  // Customization options for other practical-style entries.
  itemLabel?: string; // singular
  itemLabelPlural?: string;
  itemAbbrev?: string; // column short label e.g. E1
  ciaExamAvailable?: boolean; // hide CIA Exam column + Mark Manager toggle
  absentEnabled?: boolean; // show AB checkbox column
  autoSaveDraft?: boolean;
  autoSaveDelayMs?: number;

  // IQAC viewer: view-only, ignore lock overlays / hidden rows.
  viewerMode?: boolean;
};

const DEFAULT_EXPERIMENTS = 5;
const DEFAULT_EXPERIMENT_MAX = 25;
const DEFAULT_CIA_EXAM_MAX = 30;

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));

}

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const an = String(a?.name || '').trim().toLowerCase();
  const bn = String(b?.name || '').trim().toLowerCase();
  if (an && bn) {
    const byName = an.localeCompare(bn);
    if (byName) return byName;
  } else if (an || bn) {
    return an ? -1 : 1;
  }

  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  return ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeMarksArray(raw: unknown, length: number): Array<number | ''> {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Array<number | ''> = [];
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    if (v === '' || v == null) {
      out.push('');
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    out.push(Number.isFinite(n) ? n : '');
  }
  return out;
}

function normalizeBtlArray(raw: unknown, length: number, defaultValue: BtlLevel = 1): BtlLevel[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: BtlLevel[] = [];
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    if (v === '' || v == null) {
      out.push(defaultValue);
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    out.push(Number.isFinite(n) && n >= 1 && n <= 6 ? (Math.trunc(n) as 1 | 2 | 3 | 4 | 5 | 6) : defaultValue);
  }
  return out;
}

function avgMarks(arr: Array<number | ''>): number | null {
  const nums = arr.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(mark: number | null, max: number): string {
  if (mark == null) return '';
  if (!Number.isFinite(max) || max <= 0) return '0';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

function shortenRollNo(raw: unknown, keepLast: number = 7): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.length <= keepLast) return s;
  return s.slice(-keepLast);
}

function storageKey(assessmentKey: LabAssessmentKey, subjectId: string) {
  return `${assessmentKey}_sheet_${subjectId}`;
}

export default function LabCourseMarksEntry({
  subjectId,
  teachingAssignmentId,
  assessmentKey,
  label,
  coA,
  coB,

  itemLabel,
  itemLabelPlural,
  itemAbbrev,
  ciaExamAvailable,
  absentEnabled,
  autoSaveDraft,
  autoSaveDelayMs,
  viewerMode,
}: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishedEditModalOpen, setPublishedEditModalOpen] = useState(false);
  const [viewMarksModalOpen, setViewMarksModalOpen] = useState(false);
  const [publishedViewSnapshot, setPublishedViewSnapshot] = useState<LabDraftPayload | null>(null);
  const [publishedViewLoading, setPublishedViewLoading] = useState(false);
  const [publishedViewError, setPublishedViewError] = useState<string | null>(null);

  const [showAbsenteesOnly, setShowAbsenteesOnly] = useState(false);

  const [markManagerModal, setMarkManagerModal] = useState<null | { mode: 'confirm' | 'request' }>(null);
  const [markManagerBusy, setMarkManagerBusy] = useState(false);
  const [markManagerError, setMarkManagerError] = useState<string | null>(null);
  const [markManagerAnimating, setMarkManagerAnimating] = useState(false);
  const [pendingCoDiff, setPendingCoDiff] = useState<null | { visible: boolean; diff: { added: number[]; removed: number[]; changed: number[] }; affected: number; mode: 'confirm' | 'request' }>(null);
  const [pendingMarkManagerReset, setPendingMarkManagerReset] = useState<null | { visible: boolean; removed: number[]; affected: number }>(null);

  const itemLabel1 = String(itemLabel || 'Experiment');
  const itemLabelN = String(itemLabelPlural || 'Experiments');
  const itemColAbbrev = String(itemAbbrev || 'E');
  const ciaAvailable = ciaExamAvailable !== false;
  const absentUiEnabled = Boolean(absentEnabled ?? assessmentKey === 'model');
  const autoSaveEnabled = Boolean(autoSaveDraft);
  const autoSaveMs = clampInt(Number(autoSaveDelayMs ?? 900), 250, 5000);

  const lastAutoSavedSigRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  const key = useMemo(() => (subjectId ? storageKey(assessmentKey, String(subjectId)) : ''), [assessmentKey, subjectId]);

  const { data: publishWindow, publishAllowed, remainingSeconds, refresh: refreshPublishWindow } = usePublishWindow({
    assessment: assessmentKey,
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
    options: { poll: false },
  });

  const { data: markLock, refresh: refreshMarkLock } = useMarkTableLock({
    assessment: assessmentKey as any,
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
    options: { poll: false },
  });

  const { data: markManagerEditWindow } = useEditWindow({
    assessment: assessmentKey as any,
    subjectCode: String(subjectId || ''),
    scope: 'MARK_MANAGER',
    teachingAssignmentId,
    options: { poll: false },
  });

  // "Published" should be driven by the lock row, not by whether a snapshot object exists.
  // Otherwise a fresh page can be treated as published if the API returns a non-null payload.
  const isPublished = Boolean(publishedAt) || Boolean(markLock?.exists && markLock?.is_published);
  // Deterministic rule: the marks table is OPEN only when the backend says so.
  // This keeps pre-publish behavior consistent too: table stays locked while Mark Manager is editable.
  const entryOpen = Boolean(markLock?.entry_open);
  const publishedEditLocked = Boolean(isPublished && !entryOpen);

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const [draft, setDraft] = useState<LabDraftPayload>(() => ({
    sheet: {
      termLabel: 'KRCT AY25-26',
      batchLabel: String(subjectId || ''),
      coANum: clampInt(Number(coA ?? 1), 1, 5),
      coBNum: coB == null ? null : clampInt(Number(coB), 1, 5),
      coAEnabled: true,
      coBEnabled: Boolean(coB),
      ciaExamEnabled: ciaAvailable ? true : false,
      expCountA: DEFAULT_EXPERIMENTS,
      expCountB: Boolean(coB) ? DEFAULT_EXPERIMENTS : 0,
      expMaxA: DEFAULT_EXPERIMENT_MAX,
      expMaxB: Boolean(coB) ? DEFAULT_EXPERIMENT_MAX : 0,
      btlA: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const),
      btlB: Boolean(coB) ? Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const) : [],
      coConfigs: {
        [String(clampInt(Number(coA ?? 1), 1, 5))]: {
          enabled: true,
          expCount: DEFAULT_EXPERIMENTS,
          expMax: DEFAULT_EXPERIMENT_MAX,
          btl: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const),
        },
        ...(coB == null
          ? {}
          : {
              [String(clampInt(Number(coB), 1, 5))]: {
                enabled: true,
                expCount: DEFAULT_EXPERIMENTS,
                expMax: DEFAULT_EXPERIMENT_MAX,
                btl: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const),
              },
            }),
      },
      rowsByStudentId: {},
      markManagerLocked: false,
      markManagerSnapshot: null,
    },
  }));

  const [classType, setClassType] = useState<string | null>(null);
  const normalizedClassType = useMemo(() => normalizeClassType(classType), [classType]);
  const isLabCourse = useMemo(() => isLabClassType(classType), [classType]);

  // Load master config for term label
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setDraft((p) => ({
          ...p,
          sheet: {
            ...p.sheet,
            termLabel: String((cfg as any)?.termLabel || p.sheet.termLabel || 'KRCT AY25-26'),
            batchLabel: String(subjectId || p.sheet.batchLabel || ''),
          },
        }));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
    // determine class_type for this subject to apply lab CO max override
  }, [subjectId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const code = String(subjectId).trim().toUpperCase();
        const rows = await fetchDeptRows();
        if (!mounted) return;
        const matchDept = (rows || []).find((r: any) => String(r.course_code || '').trim().toUpperCase() === code);
        if (matchDept && (matchDept as any)?.class_type) {
          setClassType((matchDept as any)?.class_type ?? null);
          return;
        }
        const masters = await fetchMasters();
        if (!mounted) return;
        const matchMaster = (masters || []).find((m: any) => String(m.course_code || '').trim().toUpperCase() === code);
        setClassType((matchMaster as any)?.class_type ?? null);
      } catch {
        if (mounted) setClassType(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);



  // Load draft from backend
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<LabDraftPayload>(assessmentKey, String(subjectId));
        if (!mounted) return;
        const d = (res as any)?.draft as LabDraftPayload | null;
        if (d && typeof d === 'object' && d.sheet && typeof d.sheet === 'object') {
          // IMPORTANT: for LAB assessments, the CO pair is fixed by the page (props coA/coB)
          // (CIA1: 1&2, CIA2: 3&4, MODEL: 5). Do not trust a previously-saved coANum/coBNum
          // as it can cause CO3/CO4 selections to persist as CO1/CO2.
          const fixedCoA = clampInt(Number(coA ?? 1), 1, 5);
          const fixedCoB = coB == null ? null : clampInt(Number(coB), 1, 5);
          const coANum = fixedCoA;
          const coBNum = fixedCoB;

          const coAEnabledRaw = Boolean((d.sheet as any).coAEnabled ?? true);
          const coBEnabledRaw = Boolean((d.sheet as any).coBEnabled ?? Boolean(coBNum));
          const ciaExamEnabled = ciaAvailable ? Boolean((d.sheet as any).ciaExamEnabled ?? true) : false;
          const expCountA = clampInt(Number((d.sheet as any).expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
          const expCountB = clampInt(Number((d.sheet as any).expCountB ?? (coBEnabledRaw ? DEFAULT_EXPERIMENTS : 0)), 0, 12);
          const expMaxA = Number.isFinite(Number((d.sheet as any).expMaxA)) ? Number((d.sheet as any).expMaxA) : DEFAULT_EXPERIMENT_MAX;
          const expMaxB = Number.isFinite(Number((d.sheet as any).expMaxB)) ? Number((d.sheet as any).expMaxB) : (coBEnabledRaw ? DEFAULT_EXPERIMENT_MAX : 0);
          const btlA = normalizeBtlArray((d.sheet as any).btlA, expCountA, 1);
          const btlB = normalizeBtlArray((d.sheet as any).btlB, expCountB, 1);
          // Build per-CO configs if present, or migrate from legacy A/B fields
          const rawCoConfigs = (d.sheet as any).coConfigs;
          const migratedCoConfigs: Record<string, any> = {};
          if (rawCoConfigs && typeof rawCoConfigs === 'object') {
            for (const k of Object.keys(rawCoConfigs)) {
              const cfg = rawCoConfigs[k] || {};
              const ec = clampInt(Number(cfg.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
              migratedCoConfigs[k] = {
                enabled: Boolean(cfg.enabled),
                expCount: ec,
                expMax: Number.isFinite(Number(cfg.expMax)) ? Number(cfg.expMax) : DEFAULT_EXPERIMENT_MAX,
                btl: normalizeBtlArray(cfg.btl, ec, 1),
              };
            }
          }

          // migrate legacy A/B if not present
          const keyA = String(coANum);
          if (!migratedCoConfigs[keyA]) {
            migratedCoConfigs[keyA] = { enabled: coAEnabledRaw, expCount: expCountA, expMax: expMaxA, btl: btlA };
          }
          if (coBNum != null) {
            const keyB = String(coBNum);
            if (!migratedCoConfigs[keyB]) {
              migratedCoConfigs[keyB] = { enabled: coBEnabledRaw, expCount: expCountB, expMax: expMaxB, btl: btlB };
            }
          }

          // Keep migrated CO configs as-is; do not forcibly disable other COs here.

          // Keep legacy flags aligned with the fixed CO pair's config.
          const coAEnabled = Boolean(migratedCoConfigs[String(coANum)]?.enabled ?? coAEnabledRaw);
          const coBEnabled = Boolean(coBNum != null ? (migratedCoConfigs[String(coBNum)]?.enabled ?? coBEnabledRaw) : false);

          const normalizeRowsByStudentId = (raw: any): Record<string, LabRowState> => {
            const src = raw && typeof raw === 'object' ? raw : {};
            const out: Record<string, LabRowState> = {};
            for (const [sid, row0] of Object.entries(src)) {
              const row: any = row0 && typeof row0 === 'object' ? row0 : {};
              const marksByCo = row?.marksByCo && typeof row.marksByCo === 'object' ? { ...row.marksByCo } : {};

              const legacyA = normalizeMarksArray(row?.marksA, expCountA);
              const legacyB = normalizeMarksArray(row?.marksB, expCountB);
              const byA = normalizeMarksArray(marksByCo[keyA], expCountA);
              const byB = coBNum != null ? normalizeMarksArray(marksByCo[String(coBNum)], expCountB) : [];

              const hasAny = (arr: Array<number | ''>) => arr.some((v) => v !== '' && v != null);
              const nextA = hasAny(legacyA) ? legacyA : hasAny(byA) ? byA : legacyA;
              const nextB = expCountB
                ? hasAny(legacyB)
                  ? legacyB
                  : hasAny(byB)
                    ? byB
                    : legacyB
                : legacyB;

              // Always keep per-CO entries for the fixed pair in sync.
              marksByCo[keyA] = byA;
              if (coBNum != null) marksByCo[String(coBNum)] = byB;

              out[String(sid)] = {
                ...row,
                studentId: Number.isFinite(Number(row?.studentId)) ? Number(row.studentId) : Number(sid),
                marksA: nextA,
                marksB: nextB,
                marksByCo,
              } as LabRowState;
            }
            return out;
          };

          const loadedSnapshot = (d.sheet as any).markManagerSnapshot ?? null;
          const loadedApprovalUntil = (d.sheet as any).markManagerApprovalUntil ?? null;
          const loadedLockedRaw = (d.sheet as any).markManagerLocked;
          const loadedLocked = typeof loadedLockedRaw === 'boolean' ? loadedLockedRaw : Boolean(loadedSnapshot);

          setDraft({
            sheet: {
              termLabel: String((d.sheet as any).termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId),
              coANum,
              coBNum,
              coAEnabled,
              coBEnabled,
              ciaExamEnabled,
              expCountA,
              expCountB,
              expMaxA,
              expMaxB,
              btlA,
              btlB,
              coConfigs: migratedCoConfigs,
              rowsByStudentId: normalizeRowsByStudentId((d.sheet as any).rowsByStudentId),
              markManagerLocked: loadedLocked,
              markManagerSnapshot: loadedSnapshot,
              markManagerApprovalUntil: loadedApprovalUntil,
            },
          });
          // set saved metadata if backend provided it
          const updatedAt = (res as any)?.updated_at ?? null;
          const updatedBy = (res as any)?.updated_by ?? null;
          if (updatedAt) {
            try {
              setSavedAt(new Date(String(updatedAt)).toLocaleString());
            } catch {
              setSavedAt(String(updatedAt));
            }
          }
          if (updatedBy) {
            setSavedBy(String(updatedBy.name || updatedBy.username || updatedBy.id || ''));
          }
          try {
            if (key) lsSet(key, { rowsByStudentId: (d.sheet as any).rowsByStudentId || {} });
          } catch {
            // ignore
          }
        } else {
          // No server draft — initialize a fresh sheet for this assessmentKey/subject using the page's CO props.
          const stored = key ? (lsGet<any>(key) as any) : null;
          const rowsByStudentId = stored?.rowsByStudentId && typeof stored.rowsByStudentId === 'object' ? stored.rowsByStudentId : {};
          const aNum = clampInt(Number(coA ?? 1), 1, 5);
          const bNum = coB == null ? null : clampInt(Number(coB), 1, 5);
          const expCountA = DEFAULT_EXPERIMENTS;
          const expCountB = bNum != null ? DEFAULT_EXPERIMENTS : 0;
          const expMaxA = DEFAULT_EXPERIMENT_MAX;
          const expMaxB = bNum != null ? DEFAULT_EXPERIMENT_MAX : 0;
          const btlA = Array.from({ length: expCountA }, () => 1 as const);
          const btlB = bNum != null ? Array.from({ length: expCountB }, () => 1 as const) : [];
          const defaultCoConfigs: Record<string, any> = {
            [String(aNum)]: { enabled: true, expCount: expCountA, expMax: expMaxA, btl: btlA },
            ...(bNum == null
              ? {}
              : { [String(bNum)]: { enabled: true, expCount: expCountB, expMax: expMaxB, btl: btlB } }),
          };

          setDraft({
            sheet: {
              termLabel: String('KRCT AY25-26'),
              batchLabel: String(subjectId || ''),
              coANum: aNum,
              coBNum: bNum,
              coAEnabled: true,
              coBEnabled: Boolean(bNum),
              ciaExamEnabled: ciaAvailable ? true : false,
              expCountA,
              expCountB,
              expMaxA,
              expMaxB,
              btlA,
              btlB,
              coConfigs: defaultCoConfigs,
              rowsByStudentId,
              markManagerLocked: false,
              markManagerSnapshot: null,
            },
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [assessmentKey, subjectId, key, coA, coB]);

  // Fetch roster
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!teachingAssignmentId) {
        setStudents([]);
        return;
      }
      setLoadingRoster(true);
      setRosterError(null);
      try {
        const res = await fetchTeachingAssignmentRoster(teachingAssignmentId);
        if (!mounted) return;
        const roster = (res?.students || []) as any[];
        const sorted = roster
          .map((s: any) => ({
            id: Number(s.id),
            reg_no: String(s.reg_no ?? ''),
            name: String(s.name ?? ''),
            section: s.section ?? null,
          }))
          .filter((s: any) => Number.isFinite(s.id))
          .sort(compareStudentName);
        setStudents(sorted);

        // Ensure rows exist for each student
        setDraft((p) => {
          const expCountA = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
          const expCountB = clampInt(Number(p.sheet.expCountB ?? 0), 0, 12);
          const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };

          for (const st of sorted) {
            const k = String(st.id);
            if (rowsByStudentId[k]) continue;
            rowsByStudentId[k] = {
              studentId: st.id,
              absent: false,
              absentKind: undefined,
              marksA: Array.from({ length: expCountA }, () => ''),
              marksB: Array.from({ length: expCountB }, () => ''),
              marksByCo: {},
              ciaExam: '',
            };
          }

          return {
            ...p,
            sheet: { ...p.sheet, rowsByStudentId },
          };
        });
      } catch (e: any) {
        if (!mounted) return;
        setStudents([]);
        setRosterError(e?.message || 'Failed to load roster');
      } finally {
        if (mounted) setLoadingRoster(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [teachingAssignmentId]);
  

  // Local mirror (for dashboard counts)
  useEffect(() => {
    if (!key) return;
    try {
      lsSet(key, { rowsByStudentId: draft.sheet.rowsByStudentId });
    } catch {
      // ignore
    }
  }, [draft.sheet.rowsByStudentId, key]);

  // Mark Manager workflow:
  // - Editable before first confirmation.
  // - After confirmation, stays locked unless IQAC approves.
  // - Unlock only once per approval window (tracked by publishWindow.approval_until).
  useEffect(() => {
    if (!subjectId) return;
    const hasConfirmed = Boolean(draft.sheet.markManagerSnapshot);
    if (!hasConfirmed) return;

    if (isPublished && markLock?.exists) {
      const nextLocked = Boolean(markLock?.mark_manager_locked);
      if (Boolean(draft.sheet.markManagerLocked) !== nextLocked) {
        setDraft((p) => ({
          ...p,
          sheet: { ...p.sheet, markManagerLocked: nextLocked },
        }));
      }
      return;
    }

    const allowedByApproval = Boolean(markManagerEditWindow?.allowed_by_approval);
    const approvalUntil = markManagerEditWindow?.approval_until ? String(markManagerEditWindow.approval_until) : null;

    if (allowedByApproval && approvalUntil) {
      const lastApprovalUntil = draft.sheet.markManagerApprovalUntil ? String(draft.sheet.markManagerApprovalUntil) : null;
      if (Boolean(draft.sheet.markManagerLocked) && lastApprovalUntil !== approvalUntil) {
        setDraft((p) => ({
          ...p,
          sheet: { ...p.sheet, markManagerLocked: false, markManagerApprovalUntil: approvalUntil },
        }));
      }
      return;
    }

    // Approval not active -> lock if it was unlocked
    if (!Boolean(draft.sheet.markManagerLocked)) {
      setDraft((p) => ({
        ...p,
        sheet: { ...p.sheet, markManagerLocked: true },
      }));
    }
  }, [
    subjectId,
    isPublished,
    markLock?.exists,
    markLock?.mark_manager_locked,
    markManagerEditWindow?.allowed_by_approval,
    markManagerEditWindow?.approval_until,
    draft.sheet.markManagerLocked,
    draft.sheet.markManagerSnapshot,
    draft.sheet.markManagerApprovalUntil,
  ]);

  const coANum = clampInt(Number(draft.sheet.coANum ?? coA ?? 1), 1, 5);
  const coBNumRaw = (draft.sheet as any).coBNum ?? coB ?? null;
  const coBNum = coBNumRaw == null ? null : clampInt(Number(coBNumRaw), 1, 5);

  // Show all CO checkboxes (1..5) in Mark Manager — do not restrict by page.
  const allowedCoNumbers = useMemo(() => [1, 2, 3, 4, 5], []);
  const allowedCoSet = useMemo(() => new Set(allowedCoNumbers.map((n) => String(n))), [allowedCoNumbers]);

  const expCountA = clampInt(Number(draft.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
  const expCountB = clampInt(Number(draft.sheet.expCountB ?? 0), 0, 12);
  const coAEnabled = Boolean(draft.sheet.coAEnabled);
  const coBEnabled = Boolean(draft.sheet.coBEnabled) && coBNum != null;

  const coConfigs = useMemo(() => ensureCoConfigs(draft.sheet), [draft.sheet]);
  const markManagerLocked = Boolean(draft.sheet.markManagerLocked);
  const ciaExamEnabled = ciaAvailable ? draft.sheet.ciaExamEnabled !== false : false;
  const markManagerCurrentSnapshot = useMemo(() => markManagerSnapshotOf(coConfigs, ciaExamEnabled), [coConfigs, ciaExamEnabled]);

  // DB controls post-publish; local confirmation controls pre-publish.
  // Deterministic: block whenever backend says entry is not open.
  // (Pre-publish: entry_open stays false until Mark Manager is confirmed/locked.)
  const tableBlocked = !entryOpen;
  const enabledCoMetas = useMemo(() => {
    return Object.entries(coConfigs || {})
      .filter(([coNumber, cfg]) => allowedCoSet.has(String(coNumber)) && Boolean(cfg && cfg.enabled))
      .map(([coNumber, cfg]) => ({
        coNumber: Number(coNumber),
        expCount: clampInt(Number((cfg as any).expCount ?? 0), 0, 12),
        expMax: clampInt(Number((cfg as any).expMax ?? 0), 0, 100),
        btl: (cfg as any).btl ?? [],
      }));
  }, [coConfigs, allowedCoSet]);

  const totalExpCols = useMemo(() => enabledCoMetas.reduce((sum, m) => sum + m.expCount, 0), [enabledCoMetas]);
  const experimentsCols = Math.max(totalExpCols, 1);
  const hasEnabledCos = enabledCoMetas.length > 0;
  const coAttainmentCols = hasEnabledCos ? enabledCoMetas.length * 2 : 2;
  const maxExpMax = useMemo(() => enabledCoMetas.reduce((m, c) => Math.max(m, c.expMax), 0), [enabledCoMetas]);

  const hasAbsentees = useMemo(() => {
    if (!absentUiEnabled) return false;
    const rows = draft.sheet.rowsByStudentId || {};
    return Object.values(rows).some((r) => Boolean((r as any)?.absent));
  }, [absentUiEnabled, draft.sheet.rowsByStudentId]);

  const renderStudents = useMemo(() => {
    // After publish-lock: keep the table visually empty (per UX) until IQAC approves MARK_ENTRY edits.
    // Once approved, show the existing marks from the last saved draft/published snapshot.
    if (!viewerMode && isPublished && !entryOpen) return [];
    if (!absentUiEnabled) return students;
    if (!showAbsenteesOnly) return students;
    return students.filter((s) => Boolean(draft.sheet.rowsByStudentId?.[String(s.id)]?.absent));
  }, [viewerMode, isPublished, entryOpen, absentUiEnabled, students, showAbsenteesOnly, draft.sheet.rowsByStudentId]);

  // Autosave (debounced) - enabled only when requested (e.g., ReviewEntry).
  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (!subjectId) return;
    if (tableBlocked) return;
    if (publishedEditLocked) return;

    if (autoSaveTimerRef.current != null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const sig = JSON.stringify(draft);
    if (sig === lastAutoSavedSigRef.current) return;

    autoSaveTimerRef.current = window.setTimeout(async () => {
      if (!subjectId) return;
      try {
        setSavingDraft(true);
        await saveDraft(assessmentKey, String(subjectId), draft);
        lastAutoSavedSigRef.current = sig;
        setSavedAt(new Date().toLocaleString());
      } catch {
        // silent autosave failures
      } finally {
        setSavingDraft(false);
      }
    }, autoSaveMs);

    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [autoSaveEnabled, autoSaveMs, assessmentKey, draft, publishedEditLocked, subjectId, tableBlocked]);

  function ensureCoConfigs(sheet: LabSheet): NonNullable<LabSheet['coConfigs']> {
    const existing = (sheet.coConfigs && typeof sheet.coConfigs === 'object' ? sheet.coConfigs : {}) as NonNullable<LabSheet['coConfigs']>;
    const out: NonNullable<LabSheet['coConfigs']> = { ...existing };
    for (const n of [1, 2, 3, 4, 5]) {
      const k = String(n);
      const cur = out[k];
      if (!cur) {
        out[k] = {
          enabled: false,
          expCount: DEFAULT_EXPERIMENTS,
          expMax: DEFAULT_EXPERIMENT_MAX,
          btl: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const),
        };
      } else {
        const expCount = clampInt(Number((cur as any).expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
        out[k] = {
          enabled: Boolean((cur as any).enabled),
          expCount,
          expMax: clampInt(Number((cur as any).expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
          btl: normalizeBtlArray((cur as any).btl, expCount, 1),
        };
      }
    }
    return out;
  }

  function markManagerSnapshotOf(cfgs: NonNullable<LabSheet['coConfigs']>, ciaEnabled: boolean): string {
    const enabled = Object.entries(cfgs)
      .filter(([k, v]) => allowedCoSet.has(String(k)) && Boolean(v?.enabled))
      .map(([k, v]) => ({
        co: clampInt(Number(k), 1, 5),
        expCount: clampInt(Number(v?.expCount ?? 0), 0, 12),
        expMax: clampInt(Number(v?.expMax ?? 0), 0, 100),
      }))
      .sort((a, b) => a.co - b.co);
    return JSON.stringify({ enabled, ciaExamEnabled: Boolean(ciaEnabled) });
  }

  function coConfigsFromSnapshot(snapshot: string | null): NonNullable<LabSheet['coConfigs']> | null {
    if (!snapshot) return null;
    try {
      const parsed = JSON.parse(String(snapshot));
      const enabledList = Array.isArray(parsed?.enabled) ? parsed.enabled : [];
      const out: any = {};
      for (const n of [1, 2, 3, 4, 5]) {
        out[String(n)] = {
          enabled: false,
          expCount: DEFAULT_EXPERIMENTS,
          expMax: DEFAULT_EXPERIMENT_MAX,
          btl: Array.from({ length: DEFAULT_EXPERIMENTS }, () => 1 as const),
        };
      }
      for (const item of enabledList) {
        const co = clampInt(Number(item?.co), 1, 5);
        out[String(co)] = {
          ...out[String(co)],
          enabled: true,
          expCount: clampInt(Number(item?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12),
          expMax: clampInt(Number(item?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
        };
      }
      return out as NonNullable<LabSheet['coConfigs']>;
    } catch {
      return null;
    }
  }

  function countNonEmptyDraftMarksForCos(rowsByStudentId: Record<string, any>, coNums: number[], fixedCoA: number, fixedCoB: number | null) {
    if (!rowsByStudentId) return 0;
    const checkSet = new Set(coNums.map((n) => String(n)));
    let affected = 0;
    for (const row of Object.values(rowsByStudentId)) {
      if (!row || typeof row !== 'object') continue;
      const mbc = row.marksByCo && typeof row.marksByCo === 'object' ? row.marksByCo : {};
      let any = false;
      for (const n of coNums) {
        const k = String(n);
        if (!checkSet.has(k)) continue;
        const arr = (mbc as any)[k];
        if (Array.isArray(arr) && arr.some((v: any) => v !== '' && v != null)) {
          any = true;
          break;
        }
        // legacy A/B marks are only relevant for the fixed pair
        if (!any && n === fixedCoA && Array.isArray(row.marksA) && row.marksA.some((v: any) => v !== '' && v != null)) any = true;
        if (!any && fixedCoB != null && n === fixedCoB && Array.isArray(row.marksB) && row.marksB.some((v: any) => v !== '' && v != null)) any = true;
        if (any) break;
      }
      if (any) affected++;
    }
    return affected;
  }

  function enabledCosFromCfg(cfg: NonNullable<LabSheet['coConfigs']>) {
    return Object.entries(cfg)
      .filter(([k, v]) => allowedCoSet.has(String(k)) && Boolean((v as any)?.enabled))
      .map(([k]) => clampInt(Number(k), 1, 5))
      .sort((a, b) => a - b);
  }

  // Compute diff between two coConfigs objects for COs 1..5
  function computeCoConfigDiff(oldCfg: NonNullable<LabSheet['coConfigs']>, newCfg: NonNullable<LabSheet['coConfigs']>) {
    const added: number[] = [];
    const removed: number[] = [];
    const changed: number[] = [];
    for (const n of [1, 2, 3, 4, 5]) {
      const k = String(n);
      const o = oldCfg[k];
      const ni = newCfg[k];
      const oEnabled = Boolean(o?.enabled);
      const nEnabled = Boolean(ni?.enabled);
      if (!o && ni) {
        if (nEnabled) added.push(n);
        continue;
      }
      if (o && !ni) {
        if (oEnabled) removed.push(n);
        continue;
      }
      if (o && ni) {
        // compare expCount and expMax and enabled
        const oExp = clampInt(Number((o as any).expCount ?? 0), 0, 12);
        const nExp = clampInt(Number((ni as any).expCount ?? 0), 0, 12);
        const oMax = clampInt(Number((o as any).expMax ?? 0), 0, 100);
        const nMax = clampInt(Number((ni as any).expMax ?? 0), 0, 100);
        if (oEnabled !== nEnabled || oExp !== nExp || oMax !== nMax) {
          changed.push(n);
        }
      }
    }
    return { added, removed, changed };
  }

  function countNonEmptyPublishedMarks(rowsByStudentId: Record<string, any>, coNums: number[]) {
    if (!rowsByStudentId) return 0;
    let affected = 0;
    for (const row of Object.values(rowsByStudentId)) {
      if (!row || typeof row !== 'object') continue;
      // check legacy arrays
      const anyLegacy = Array.isArray(row.marksA) && row.marksA.some((v: any) => v !== '' && v != null) || Array.isArray(row.marksB) && row.marksB.some((v: any) => v !== '' && v != null) || (row.ciaExam !== '' && row.ciaExam != null);
      if (anyLegacy) {
        affected++;
        continue;
      }
      const mbc = row.marksByCo && typeof row.marksByCo === 'object' ? row.marksByCo : {};
      let any = false;
      for (const n of coNums) {
        const arr = mbc[String(n)];
        if (Array.isArray(arr) && arr.some((v: any) => v !== '' && v != null)) {
          any = true;
          break;
        }
      }
      if (any) affected++;
    }
    return affected;
  }

  function setCiaExamEnabled(enabled: boolean) {
    setDraft((p) => {
      if (!ciaAvailable) return p;
      if (Boolean(p.sheet.markManagerLocked)) return p;
      return { ...p, sheet: { ...p.sheet, ciaExamEnabled: Boolean(enabled) } };
    });
  }

  function setAbsent(studentId: number, v: boolean) {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;
      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? 0), 0, 12);

      if (v) {
        return {
          ...p,
          sheet: {
            ...p.sheet,
            rowsByStudentId: {
              ...p.sheet.rowsByStudentId,
              [k]: {
                ...existing,
                absent: true,
                absentKind: ((existing as any).absentKind || 'AL') as any,
                marksA: Array.from({ length: expCountA2 }, () => ''),
                marksB: Array.from({ length: expCountB2 }, () => ''),
                ciaExam: '',
              },
            },
          },
        };
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, absent: false, absentKind: undefined },
          },
        },
      };
    });
  }

  function setAbsentKind(studentId: number, absentKind: 'AL' | 'ML' | 'SKL') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;
      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, absent: true, absentKind },
          },
        },
      };
    });
  }

  function toggleCoSelection(coNumber: number, nextChecked: boolean) {
    const n = clampInt(Number(coNumber), 1, 5);
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
      const configs = ensureCoConfigs(p.sheet);
      const key = String(n);
      const existing = configs[key];
      const expCount = clampInt(Number(existing?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expMax = clampInt(Number(existing?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const btl = normalizeBtlArray(existing?.btl ?? [], expCount, 1);

      configs[key] = {
        enabled: Boolean(nextChecked),
        expCount,
        expMax,
        btl,
      };

      const aNum = clampInt(Number((p.sheet as any).coANum ?? coA ?? 1), 1, 5);
      const bNumRaw = (p.sheet as any).coBNum ?? coB ?? null;
      const bNum = bNumRaw == null ? null : clampInt(Number(bNumRaw), 1, 5);

      const nextSheet: any = { ...p.sheet, coConfigs: configs };
      if (n === aNum) nextSheet.coAEnabled = Boolean(nextChecked);
      if (bNum != null && n === bNum) nextSheet.coBEnabled = Boolean(nextChecked);

      return { ...p, sheet: nextSheet };
    });
  }

  async function requestEdit() {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      await createEditRequest({
        assessment: assessmentKey as any,
        subject_code: String(subjectId),
        scope: 'MARK_MANAGER',
        reason: `Edit request: Mark Manager changes for ${label}`,
        teaching_assignment_id: teachingAssignmentId,
      });
      alert('Edit request sent to IQAC.');
    } catch (e: any) {
      setMarkManagerError(e?.message || 'Request failed');
      alert(e?.message || 'Request failed');
    } finally {
      setMarkManagerBusy(false);
    }
  }

  async function confirmMarkManagerWithReset(resetMode: 'none' | 'partial' | 'full', resetCos: number[] = []) {
    if (!subjectId) return;
    setMarkManagerBusy(true);
    setMarkManagerError(null);
    try {
      const fixedCoA = clampInt(Number(coA ?? 1), 1, 5);
      const fixedCoB = coB == null ? null : clampInt(Number(coB), 1, 5);

      // Snapshot the full coConfigs (allow CO1..CO5 to be used and saved).
      const snapshot = markManagerSnapshotOf(coConfigs, ciaExamEnabled);
      const approvalUntil = markManagerEditWindow?.approval_until
        ? String(markManagerEditWindow.approval_until)
        : draft.sheet.markManagerApprovalUntil || null;

      // Ensure the fixed CO pair for this lab assessment stays consistent.
      const cfgA = coConfigs[String(fixedCoA)];
      const cfgB = fixedCoB == null ? null : coConfigs[String(fixedCoB)];

      const nextCoAEnabled = Boolean(cfgA?.enabled);
      const nextCoBEnabled = Boolean(fixedCoB != null && cfgB?.enabled);

      const nextExpCountA = clampInt(Number(cfgA?.expCount ?? draft.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const nextExpMaxA = clampInt(Number(cfgA?.expMax ?? draft.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const nextBtlA = normalizeBtlArray((cfgA as any)?.btl ?? (draft.sheet as any).btlA, nextExpCountA, 1);

      const nextExpCountB = fixedCoB == null ? 0 : clampInt(Number(cfgB?.expCount ?? draft.sheet.expCountB ?? DEFAULT_EXPERIMENTS), 0, 12);
      const nextExpMaxB = fixedCoB == null ? 0 : clampInt(Number(cfgB?.expMax ?? draft.sheet.expMaxB ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const nextBtlB = fixedCoB == null ? [] : normalizeBtlArray((cfgB as any)?.btl ?? (draft.sheet as any).btlB, nextExpCountB, 1);

      const resetSet = new Set(
        resetMode === 'full' ? [1, 2, 3, 4, 5].map(String) : resetMode === 'partial' ? resetCos.map((n) => String(clampInt(Number(n), 1, 5))) : [],
      );

      const normalizeMarksByCo = (row: any, coKey: string, len: number) => {
        const marksByCo = row?.marksByCo && typeof row.marksByCo === 'object' ? row.marksByCo : {};
        return normalizeMarksArray((marksByCo as any)[coKey], len);
      };
      const hasAny = (arr: Array<number | ''>) => arr.some((v) => v !== '' && v != null);

      const nextDraft: LabDraftPayload = {
        ...draft,
        sheet: {
          ...draft.sheet,
          coANum: fixedCoA,
          coBNum: fixedCoB,
          coAEnabled: nextCoAEnabled,
          coBEnabled: nextCoBEnabled,
          expCountA: nextExpCountA,
          expCountB: nextExpCountB,
          expMaxA: nextExpMaxA,
          expMaxB: nextExpMaxB,
          btlA: nextBtlA,
          btlB: nextBtlB,
          coConfigs: coConfigs,
          markManagerLocked: true,
          markManagerSnapshot: snapshot,
          markManagerApprovalUntil: approvalUntil,
          rowsByStudentId: Object.fromEntries(
            Object.entries(draft.sheet.rowsByStudentId || {}).map(([sid, row0]) => {
              const row: any = row0 && typeof row0 === 'object' ? row0 : {};

              // Apply requested resets BEFORE syncing/migrating marks.
              let marksByCo = row?.marksByCo && typeof row.marksByCo === 'object' ? { ...row.marksByCo } : {};

              if (resetMode === 'full') {
                marksByCo = {};
                row.marksA = Array.from({ length: nextExpCountA }, () => '');
                row.marksB = Array.from({ length: nextExpCountB }, () => '');
                row.ciaExam = '';
              } else if (resetMode === 'partial' && resetSet.size) {
                for (const k of Array.from(resetSet)) {
                  const cfg = coConfigs[String(k)];
                  const len = clampInt(Number(cfg?.expCount ?? 0), 0, 12);
                  // Clear the removed/changed column's marks.
                  if (len > 0) marksByCo[String(k)] = Array.from({ length: len }, () => '');
                  else delete (marksByCo as any)[String(k)];

                  // If the fixed pair uses this CO, clear legacy arrays too.
                  if (Number(k) === fixedCoA) row.marksA = Array.from({ length: nextExpCountA }, () => '');
                  if (fixedCoB != null && Number(k) === fixedCoB) row.marksB = Array.from({ length: nextExpCountB }, () => '');
                }
              }

              const legacyA = normalizeMarksArray(row?.marksA, nextExpCountA);
              const legacyB = normalizeMarksArray(row?.marksB, nextExpCountB);
              const byA = normalizeMarksArray(marksByCo[String(fixedCoA)] ?? normalizeMarksByCo(row, String(fixedCoA), nextExpCountA), nextExpCountA);
              const byB = fixedCoB == null ? [] : normalizeMarksArray(marksByCo[String(fixedCoB)] ?? normalizeMarksByCo(row, String(fixedCoB), nextExpCountB), nextExpCountB);

              const nextA = hasAny(legacyA) ? legacyA : hasAny(byA) ? byA : legacyA;
              const nextB = nextExpCountB
                ? hasAny(legacyB)
                  ? legacyB
                  : hasAny(byB)
                    ? byB
                    : legacyB
                : legacyB;

              // Always keep per-CO entries for the fixed pair in sync.
              marksByCo[String(fixedCoA)] = byA;
              if (fixedCoB != null) marksByCo[String(fixedCoB)] = byB;

              return [sid, { ...row, marksA: nextA, marksB: nextB, marksByCo }];
            }),
          ) as any,
        },
      };

      setDraft(nextDraft);
      setMarkManagerModal(null);
      setPendingMarkManagerReset(null);
      setMarkManagerAnimating(true);

      await saveDraft(assessmentKey, String(subjectId), nextDraft);
      setSavedAt(new Date().toLocaleString());

      try {
        await confirmMarkManagerLock(assessmentKey as any, String(subjectId), teachingAssignmentId);
        refreshMarkLock({ silent: true });
      } catch (err) {
        console.warn('confirmMarkManagerLock failed', err);
      }
    } catch (e: any) {
      setMarkManagerError(e?.message || 'Save failed');
    } finally {
      setMarkManagerBusy(false);
      setTimeout(() => setMarkManagerAnimating(false), 2000);
    }
  }

  function setCoEnabled(which: 'A' | 'B', enabled: boolean) {
    setDraft((p) => ({
      ...p,
      sheet: {
        ...p.sheet,
        coAEnabled: which === 'A' ? enabled : p.sheet.coAEnabled,
        coBEnabled: which === 'B' ? enabled : p.sheet.coBEnabled,
      },
    }));
  }

  function setExpCount(which: 'A' | 'B', n: number) {
    const next = clampInt(n, 0, 12);
    setDraft((p) => {
      const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };
      for (const k of Object.keys(rowsByStudentId)) {
        const row = rowsByStudentId[k];
        if (which === 'A') {
          const marksA = normalizeMarksArray((row as any)?.marksA, next);
          rowsByStudentId[k] = { ...row, marksA };
        } else {
          const marksB = normalizeMarksArray((row as any)?.marksB, next);
          rowsByStudentId[k] = { ...row, marksB };
        }
      }

      const btlA =
        which === 'A'
          ? normalizeBtlArray((p.sheet as any).btlA, next, 1)
          : normalizeBtlArray((p.sheet as any).btlA, clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12), 1);
      const btlB =
        which === 'B'
          ? normalizeBtlArray((p.sheet as any).btlB, next, 1)
          : normalizeBtlArray((p.sheet as any).btlB, clampInt(Number(p.sheet.expCountB ?? 0), 0, 12), 1);
      const expMaxA2 = which === 'A' ? (p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX) : Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX);
      const expMaxB2 = which === 'B' ? (p.sheet.expMaxB ?? DEFAULT_EXPERIMENT_MAX) : Number(p.sheet.expMaxB ?? 0);

      return {
        ...p,
        sheet: {
          ...p.sheet,
          expCountA: which === 'A' ? next : p.sheet.expCountA,
          expCountB: which === 'B' ? next : p.sheet.expCountB,
          btlA,
          btlB,
          expMaxA: expMaxA2,
          expMaxB: expMaxB2,
          rowsByStudentId,
        },
      };
    });
  }

  function setExpMax(which: 'A' | 'B', v: number) {
    const next = clampInt(Number(v), 0, 100);
    setDraft((p) => {
      const expMaxA2 = which === 'A' ? next : clampInt(Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const expMaxB2 = which === 'B' ? next : clampInt(Number(p.sheet.expMaxB ?? 0), 0, 100);

      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? 0), 0, 12);

      const rowsByStudentId: Record<string, LabRowState> = {};
      for (const [k, row] of Object.entries(p.sheet.rowsByStudentId || {})) {
        const marksA = normalizeMarksArray((row as any).marksA, expCountA2).map((m) => (typeof m === 'number' ? clampInt(m, 0, expMaxA2) : ''));
        const marksB = normalizeMarksArray((row as any).marksB, expCountB2).map((m) => (typeof m === 'number' ? clampInt(m, 0, expMaxB2) : ''));
        rowsByStudentId[k] = { ...(row as any), marksA, marksB };
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          expMaxA: expMaxA2,
          expMaxB: expMaxB2,
          rowsByStudentId,
        },
      };
    });
  }

  function setCoExpCount(coNumber: number, v: number) {
    const next = clampInt(Number(v), 0, 12);
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
      const configs = ensureCoConfigs(p.sheet);
      const key = String(coNumber);
      const existing = configs[key];
      const expMaxPrev = clampInt(Number(existing?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      configs[key] = {
        enabled: Boolean(existing?.enabled ?? true),
        expCount: next,
        expMax: expMaxPrev,
        btl: normalizeBtlArray(existing?.btl ?? [], next, 1),
      };

      // keep legacy A/B fields in sync if this CO matches them
      const aNum = clampInt(Number((p.sheet as any).coANum ?? coA ?? 1), 1, 5);
      const bNumRaw = (p.sheet as any).coBNum ?? coB ?? null;
      const bNum = bNumRaw == null ? null : clampInt(Number(bNumRaw), 1, 5);

      const rowsByStudentId: Record<string, LabRowState> = { ...(p.sheet.rowsByStudentId || {}) };
      for (const k of Object.keys(rowsByStudentId)) {
        const row = rowsByStudentId[k];
        const marksByCo = (row as any)?.marksByCo && typeof (row as any).marksByCo === 'object' ? { ...(row as any).marksByCo } : {};
        marksByCo[key] = normalizeMarksArray(marksByCo[key], next);

        const nextRow: LabRowState = { ...row, marksByCo };
        if (coNumber === aNum) nextRow.marksA = normalizeMarksArray((row as any).marksA, next);
        if (bNum != null && coNumber === bNum) nextRow.marksB = normalizeMarksArray((row as any).marksB, next);
        rowsByStudentId[k] = nextRow;
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          coConfigs: configs,
          expCountA: coNumber === aNum ? next : p.sheet.expCountA,
          expCountB: coNumber === bNum ? next : p.sheet.expCountB,
          btlA: coNumber === aNum ? configs[key].btl : p.sheet.btlA,
          btlB: coNumber === bNum ? configs[key].btl : p.sheet.btlB,
          rowsByStudentId,
        },
      };
    });
  }

  function setCoExpMax(coNumber: number, v: number) {
    const next = clampInt(Number(v), 0, 100);
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
      const configs = ensureCoConfigs(p.sheet);
      const key = String(coNumber);
      const existing = configs[key];
      const expCount = clampInt(Number(existing?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
      configs[key] = {
        enabled: Boolean(existing?.enabled ?? true),
        expCount,
        expMax: next,
        btl: normalizeBtlArray(existing?.btl ?? [], expCount, 1),
      };

      // keep legacy A/B in sync for max values
      const aNum = clampInt(Number((p.sheet as any).coANum ?? coA ?? 1), 1, 5);
      const bNumRaw = (p.sheet as any).coBNum ?? coB ?? null;
      const bNum = bNumRaw == null ? null : clampInt(Number(bNumRaw), 1, 5);

      const expMaxA2 = coNumber === aNum ? next : clampInt(Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const expMaxB2 = coNumber === bNum ? next : clampInt(Number(p.sheet.expMaxB ?? 0), 0, 100);

      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? 0), 0, 12);

      const rowsByStudentId: Record<string, LabRowState> = {};
      for (const [k, row] of Object.entries(p.sheet.rowsByStudentId || {})) {
        const marksA = normalizeMarksArray((row as any).marksA, expCountA2).map((m) => (typeof m === 'number' ? clampInt(m, 0, expMaxA2) : ''));
        const marksB = normalizeMarksArray((row as any).marksB, expCountB2).map((m) => (typeof m === 'number' ? clampInt(m, 0, expMaxB2) : ''));
        const marksByCo = (row as any)?.marksByCo && typeof (row as any).marksByCo === 'object' ? { ...(row as any).marksByCo } : {};
        marksByCo[key] = normalizeMarksArray(marksByCo[key], expCount).map((m) => (typeof m === 'number' ? clampInt(m, 0, next) : ''));
        rowsByStudentId[k] = { ...(row as any), marksA, marksB, marksByCo };
      }

      return {
        ...p,
        sheet: {
          ...p.sheet,
          coConfigs: configs,
          expMaxA: expMaxA2,
          expMaxB: expMaxB2,
          rowsByStudentId,
        },
      };
    });
  }

  function setBtl(which: 'A' | 'B', expIndex: number, value: BtlLevel) {
    setDraft((p) => {
      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? 0), 0, 12);
      const btlA = normalizeBtlArray((p.sheet as any).btlA, expCountA2, 1);
      const btlB = normalizeBtlArray((p.sheet as any).btlB, expCountB2, 1);
      if (which === 'A') btlA[expIndex] = value;
      else btlB[expIndex] = value;

      return {
        ...p,
        sheet: {
          ...p.sheet,
          btlA,
          btlB,
        },
      };
    });
  }

  function setCoBtl(coNumber: number, expIndex: number, value: BtlLevel) {
    setDraft((p) => {
      if (Boolean(p.sheet.markManagerLocked)) return p;
      const configs = ensureCoConfigs(p.sheet);
      const key = String(clampInt(Number(coNumber), 1, 5));
      const existing = configs[key];
      const expCount = clampInt(Number(existing?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
      const btl = normalizeBtlArray(existing?.btl ?? [], expCount, 1);
      if (expIndex >= 0 && expIndex < btl.length) btl[expIndex] = value;
      configs[key] = {
        enabled: Boolean(existing?.enabled ?? false),
        expCount,
        expMax: clampInt(Number(existing?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100),
        btl,
      };

      // keep legacy A/B fields in sync if this CO matches them
      const aNum = clampInt(Number((p.sheet as any).coANum ?? coA ?? 1), 1, 5);
      const bNumRaw = (p.sheet as any).coBNum ?? coB ?? null;
      const bNum = bNumRaw == null ? null : clampInt(Number(bNumRaw), 1, 5);

      return {
        ...p,
        sheet: {
          ...p.sheet,
          coConfigs: configs,
          btlA: coNumber === aNum ? btl : p.sheet.btlA,
          btlB: coNumber === bNum ? btl : p.sheet.btlB,
        },
      };
    });
  }

  function setCoMark(studentId: number, coNumber: number, expIndex: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;

      if (absentUiEnabled && assessmentKey !== 'model' && Boolean((existing as any).absent)) return p;

      if (assessmentKey === 'model') {
        const absent = Boolean((existing as any).absent);
        const kind = absent ? String((existing as any).absentKind || 'AL').toUpperCase() : '';
        const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));
        if (absent && !canEditAbsent) return p;
      }

      const configs = ensureCoConfigs(p.sheet);
      const coKey = String(clampInt(Number(coNumber), 1, 5));
      const cfg = configs[coKey];
      const expCount = clampInt(Number(cfg?.expCount ?? 0), 0, 12);
      const expMax = clampInt(Number(cfg?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);

      const marksByCo = (existing as any)?.marksByCo && typeof (existing as any).marksByCo === 'object' ? { ...(existing as any).marksByCo } : {};
      const marks = normalizeMarksArray(marksByCo[coKey], expCount);
      const nextValue = value === '' ? '' : clampInt(Number(value), 0, expMax);
      if (expIndex >= 0 && expIndex < marks.length) marks[expIndex] = nextValue;
      marksByCo[coKey] = marks;

      // keep legacy A/B marks in sync if this CO matches them
      const aNum = clampInt(Number((p.sheet as any).coANum ?? coA ?? 1), 1, 5);
      const bNumRaw = (p.sheet as any).coBNum ?? coB ?? null;
      const bNum = bNumRaw == null ? null : clampInt(Number(bNumRaw), 1, 5);

      const nextRow: any = { ...existing, marksByCo };
      if (coNumber === aNum) nextRow.marksA = normalizeMarksArray((existing as any).marksA, expCount).map((m, i) => (i === expIndex ? nextValue : m));
      if (bNum != null && coNumber === bNum) nextRow.marksB = normalizeMarksArray((existing as any).marksB, expCount).map((m, i) => (i === expIndex ? nextValue : m));

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: nextRow,
          },
        },
      };
    });
  }

  function setMark(studentId: number, which: 'A' | 'B', expIndex: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;

      if (assessmentKey === 'model') {
        const absent = Boolean((existing as any).absent);
        const kind = absent ? String((existing as any).absentKind || 'AL').toUpperCase() : '';
        const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));
        if (absent && !canEditAbsent) return p;
      }

      const expCountA2 = clampInt(Number(p.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
      const expCountB2 = clampInt(Number(p.sheet.expCountB ?? 0), 0, 12);

      const expMaxA2 = clampInt(Number(p.sheet.expMaxA ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const expMaxB2 = clampInt(Number(p.sheet.expMaxB ?? 0), 0, 100);

      const marksA = normalizeMarksArray((existing as any).marksA, expCountA2);
      const marksB = normalizeMarksArray((existing as any).marksB, expCountB2);

      const nextValue =
        value === ''
          ? ''
          : which === 'A'
            ? clampInt(Number(value), 0, expMaxA2)
            : clampInt(Number(value), 0, expMaxB2);

      if (which === 'A') marksA[expIndex] = nextValue;
      else marksB[expIndex] = nextValue;

      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, marksA, marksB },
          },
        },
      };
    });
  }

  function setCiaExam(studentId: number, value: number | '') {
    setDraft((p) => {
      const k = String(studentId);
      const existing = p.sheet.rowsByStudentId?.[k];
      if (!existing) return p;

      if (!ciaAvailable) return p;
      if (absentUiEnabled && assessmentKey !== 'model' && Boolean((existing as any).absent)) return p;

      if (assessmentKey === 'model') {
        const absent = Boolean((existing as any).absent);
        const kind = absent ? String((existing as any).absentKind || 'AL').toUpperCase() : '';
        const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));
        if (absent && !canEditAbsent) return p;
      }
      const nextValue = value === '' ? '' : clampInt(Number(value), 0, DEFAULT_CIA_EXAM_MAX);
      return {
        ...p,
        sheet: {
          ...p.sheet,
          rowsByStudentId: {
            ...p.sheet.rowsByStudentId,
            [k]: { ...existing, ciaExam: nextValue },
          },
        },
      };
    });
  }

  async function saveNow() {
    if (!subjectId) return;
    setSavingDraft(true);
    try {
      await saveDraft(assessmentKey, String(subjectId), draft);
      setSavedAt(new Date().toLocaleString());
      alert('Draft saved.');
    } catch (e: any) {
      alert(e?.message || 'Draft save failed');
    } finally {
      setSavingDraft(false);
    }
  }

  async function resetSheet() {
    if (!subjectId) return;
    const ok = window.confirm(`Reset all marks for ${label}? This clears the draft for all students.`);
    if (!ok) return;

    const expCountA2 = clampInt(Number(draft.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
    const expCountB2 = clampInt(Number(draft.sheet.expCountB ?? 0), 0, 12);

    const clearedRowsByStudentId: Record<string, LabRowState> = {};
    for (const s of students) {
      clearedRowsByStudentId[String(s.id)] = {
        studentId: s.id,
        absent: false,
        absentKind: undefined,
        marksA: Array.from({ length: expCountA2 }, () => ''),
        marksB: Array.from({ length: expCountB2 }, () => ''),
        marksByCo: {},
        ciaExam: '',
      };
    }

    const nextDraft: LabDraftPayload = {
      sheet: {
        ...draft.sheet,
        btlA: Array.from({ length: expCountA2 }, () => 1 as const),
        btlB: Array.from({ length: expCountB2 }, () => 1 as const),
        rowsByStudentId: clearedRowsByStudentId,
      },
    };

    setDraft(nextDraft);

    try {
      if (key) lsSet(key, { rowsByStudentId: {} });
    } catch {
      // ignore
    }

    try {
      await saveDraft(assessmentKey, String(subjectId), nextDraft);
      setSavedAt(new Date().toLocaleString());
    } catch {
      // ignore
    }
  }

  async function publish() {
    if (!subjectId) return;

    if (globalLocked) {
      alert('Publishing is locked by IQAC.');
      return;
    }

    if (!publishAllowed) {
      alert('Publish window is closed. Please request IQAC approval.');
      return;
    }

    // After publish, keep the table locked (no edits) until IQAC approval.
    // If already published and entry edits are not open, do nothing.
    if (publishedAt && !entryOpen) return;

    setPublishing(true);
    try {
      console.debug('publish called', { assessment: assessmentKey, subjectId, entryOpen, publishAllowed, globalLocked });
      await publishLabSheet(assessmentKey, String(subjectId), draft, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      console.debug('publish succeeded', { assessment: assessmentKey, subjectId });
      await refreshPublishedSnapshot(false);
      refreshPublishWindow();
      refreshMarkLock({ silent: true });
      try {
        console.debug('obe:published dispatch', { assessment: assessmentKey, subjectId });
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: assessmentKey } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      alert(e?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  async function refreshPublishedSnapshot(showLoading: boolean) {
    if (!subjectId) return;
    if (showLoading) setPublishedViewLoading(true);
    setPublishedViewError(null);
    try {
      const resp = await fetchPublishedLabSheet(assessmentKey, String(subjectId), teachingAssignmentId);
      const data = (resp as any)?.data ?? null;
      if (data && typeof data === 'object') {
        setPublishedViewSnapshot(data as LabDraftPayload);
      }
    } catch (e: any) {
      if (showLoading) setPublishedViewError(e?.message || 'Failed to load published marks');
    } finally {
      if (showLoading) setPublishedViewLoading(false);
    }
  }

  useEffect(() => {
    if (!subjectId) return;
    if (!markLock?.exists || !markLock?.is_published) {
      setPublishedViewSnapshot(null);
      return;
    }
    refreshPublishedSnapshot(false);
  }, [subjectId, assessmentKey, markLock?.exists, markLock?.is_published]);

  const prevEntryOpenRef = React.useRef<boolean>(Boolean(entryOpen));
  useEffect(() => {
    // When IQAC opens MARK_ENTRY edits, re-hydrate the editable draft so the table
    // shows existing marks (prefer last saved draft; fall back to the published snapshot).
    if (!subjectId) return;
    if (!isPublished) return;

    const prev = prevEntryOpenRef.current;
    if (prev || !entryOpen) {
      prevEntryOpenRef.current = Boolean(entryOpen);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const resp = await fetchDraft(assessmentKey as any, String(subjectId), teachingAssignmentId);
        const data = (resp as any)?.data ?? null;
        if (!mounted) return;
        if (data && typeof data === 'object' && (data as any).sheet) {
          setDraft(data as LabDraftPayload);
          return;
        }
      } catch {
        // ignore and fall back
      }
      if (!mounted) return;
      if (publishedViewSnapshot && (publishedViewSnapshot as any).sheet) {
        setDraft(publishedViewSnapshot);
      }
    })();

    prevEntryOpenRef.current = Boolean(entryOpen);
    return () => {
      mounted = false;
    };
  }, [entryOpen, isPublished, subjectId, assessmentKey, publishedViewSnapshot]);

  useEffect(() => {
    // While locked after publish, periodically check if IQAC updated the lock row.
    if (!subjectId) return;
    if (!isPublished) return;
    if (entryOpen) return;
    const tid = window.setInterval(() => {
      refreshMarkLock({ silent: true });
    }, 30000);
    return () => window.clearInterval(tid);
  }, [entryOpen, isPublished, subjectId, refreshMarkLock]);

  useEffect(() => {
    if (!viewMarksModalOpen) return;
    if (!subjectId) return;
    setPublishedViewSnapshot(null);
    refreshPublishedSnapshot(true);
  }, [viewMarksModalOpen, subjectId, assessmentKey]);

  const visibleBtlIndices = useMemo(() => {
    if (totalExpCols === 0) return [] as number[];
    const set = new Set<number>();
    for (const m of enabledCoMetas) {
      for (let i = 0; i < m.expCount; i++) {
        const v = m.btl[i];
        if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) set.add(v);
      }
    }
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [enabledCoMetas, totalExpCols]);

  const headerCols = 3 + (absentUiEnabled ? 1 : 0) + experimentsCols + 1 + (ciaExamEnabled ? 1 : 0) + coAttainmentCols + visibleBtlIndices.length * 2;

  const cellTh: React.CSSProperties = {
    border: '1px solid #111',
    padding: '4px 4px',
    background: '#ecfdf5',
    color: '#065f46',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const cellTd: React.CSSProperties = {
    border: '1px solid #111',
    padding: '4px 4px',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 11,
    textAlign: 'center',
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    background: '#fff',
    padding: 12,
  };

  const COL_SNO_W = 40;
  const COL_RNO_W = 90;
  const COL_NAME_W = 180;
  const COL_AB_W = 56;
  const COL_AVG_W = 52;
  const COL_CIA_W = 72;

  const DEFAULT_DATA_COL_W = 80;

  const restColWidths = useMemo<number[]>(
    () => [
      ...Array.from({ length: experimentsCols }, () => DEFAULT_DATA_COL_W),
      COL_AVG_W,
      ...(ciaExamEnabled ? [COL_CIA_W] : []),
      ...Array.from({ length: coAttainmentCols + visibleBtlIndices.length * 2 }, () => DEFAULT_DATA_COL_W),
    ],
    [experimentsCols, ciaExamEnabled, coAttainmentCols, visibleBtlIndices.length],
  );

  const minTableWidth = useMemo(() => {
    const stickyW = COL_SNO_W + COL_RNO_W + COL_NAME_W + (absentUiEnabled ? COL_AB_W : 0);
    const restW = restColWidths.reduce((a, b) => a + b, 0);
    return Math.max(900, stickyW + restW);
  }, [absentUiEnabled, restColWidths]);

  const minViewTableWidth = useMemo(() => {
    const stickyW = COL_SNO_W + COL_RNO_W + COL_NAME_W;
    const restW = restColWidths.reduce((a, b) => a + b, 0);
    return Math.max(900, stickyW + restW);
  }, [restColWidths]);

  const stickyTh = (left: number, width?: number): React.CSSProperties => ({
    position: 'sticky',
    left,
    zIndex: 40,
    ...(width != null ? { width, minWidth: width, maxWidth: width } : null),
    background: cellTh.background,
  });

  const stickyTd = (left: number, width?: number): React.CSSProperties => ({
    position: 'sticky',
    left,
    zIndex: 25,
    ...(width != null ? { width, minWidth: width, maxWidth: width } : null),
    background: '#fff',
  });

  function renderColGroup(totalCols: number, includeAb: boolean, widths?: number[]) {
    const stickyCols = 3 + (includeAb ? 1 : 0);
    const rest = Math.max(0, totalCols - stickyCols);
    return (
      <colgroup>
        <col style={{ width: COL_SNO_W }} />
        <col style={{ width: COL_RNO_W }} />
        <col style={{ width: COL_NAME_W }} />
        {includeAb ? <col style={{ width: COL_AB_W }} /> : null}
        {Array.from({ length: rest }).map((_, i) => {
          const w = widths?.[i] ?? DEFAULT_DATA_COL_W;
          return <col key={`rest_${i}`} style={{ width: w, minWidth: w, maxWidth: w }} />;
        })}
      </colgroup>
    );
  }

  const coEnableStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
  };

  const bigCheckboxStyle: React.CSSProperties = {
    width: 20,
    height: 20,
    transform: 'scale(1.5)',
    accentColor: '#9a3412',
  };

  const glitchingAnimation = markManagerAnimating ? 'markManagerGlitch 2s ease-in-out' : undefined;
  const dustAnimation = markManagerAnimating ? 'markManagerDust 2s ease-out forwards' : undefined;

  const btlSelectStyle: React.CSSProperties = {
    width: 66,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    padding: '4px 6px',
    fontSize: 12,
    background: '#fff',
  };

  const floatingPanelStyle: React.CSSProperties = {
    position: 'absolute',
    left: '40%',
    top: 18,
    zIndex: 40,
    width: 160,
    background: 'rgba(255,255,255,0.98)',
    border: '1px solid #e5e7eb',
    padding: 10,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
    filter: 'none',
  };

  return (
    <div>
      <style>{`
        @keyframes markManagerGlitch {
          0% { background: #fff7ed; transform: translateX(0); }
          10% { background: #f3f4f6; transform: translateX(-2px); }
          20% { background: #fff7ed; transform: translateX(2px); }
          30% { background: #f3f4f6; transform: translateX(-1px); }
          40% { background: #fff7ed; transform: translateX(1px); }
          50% { background: #f3f4f6; transform: translateX(0); }
          60% { background: #fff7ed; transform: translateX(-1px); }
          70% { background: #f3f4f6; transform: translateX(1px); }
          80% { background: #fff7ed; transform: translateX(0); }
          90% { background: #f3f4f6; transform: translateX(-1px); }
          100% { background: #f3f4f6; transform: translateX(0); }
        }
        @keyframes markManagerDust {
          0% { opacity: 1; transform: scale(1) rotate(0deg); }
          50% { opacity: 0.8; transform: scale(1.1) rotate(180deg); }
          100% { opacity: 0; transform: scale(0.5) rotate(360deg); }
        }
        .markManagerDustParticle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: #d1d5db;
          border-radius: 50%;
          animation: markManagerDust 2s ease-out forwards;
        }
      `}</style>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>COs enabled</div>

        <div
          style={{
            ...coEnableStyle,
            border: '1px solid #fcd34d',
            background: markManagerLocked ? '#f3f4f6' : '#fff7ed',
            padding: 12,
            borderRadius: 12,
            alignItems: 'stretch',
            animation: glitchingAnimation,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {markManagerAnimating && (
            <>
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className="markManagerDustParticle"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 1}s`,
                  }}
                />
              ))}
            </>
          )}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={18} color={markManagerLocked ? '#6b7280' : '#9a3412'} />
              <div style={{ fontWeight: 950, color: '#111827' }}>Mark Manager</div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => {
                  if (markManagerLocked) {
                    setMarkManagerModal({ mode: 'request' });
                    return;
                  }

                  // Mark Manager SAVE clicked (pre-confirm): if COs differ from the previous
                  // confirmed snapshot and old COs are removed, warn + allow reset.
                  const prevCfg = coConfigsFromSnapshot(draft.sheet.markManagerSnapshot ?? null);
                  if (prevCfg) {
                    const prevEnabled = enabledCosFromCfg(prevCfg);
                    const nextEnabled = enabledCosFromCfg(coConfigs);
                    const removed = prevEnabled.filter((n) => !nextEnabled.includes(n));
                    if (removed.length) {
                      const fixedCoA = clampInt(Number(coA ?? 1), 1, 5);
                      const fixedCoB = coB == null ? null : clampInt(Number(coB), 1, 5);
                      const affected = countNonEmptyDraftMarksForCos(draft.sheet.rowsByStudentId as any, removed, fixedCoA, fixedCoB);
                      setPendingMarkManagerReset({ visible: true, removed, affected });
                      return;
                    }
                  }

                  setMarkManagerModal({ mode: 'confirm' });
                }}
                className="obe-btn obe-btn-success"
                disabled={!subjectId || markManagerBusy}
                style={markManagerBusy ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
              >
                {markManagerLocked ? 'Edit' : 'Save'}
              </button>
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            {allowedCoNumbers.map((n) => {
              const cfg = coConfigs[String(n)];
              const checked = Boolean(cfg?.enabled);
              return (
                <label key={n} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12, color: '#111827' }}>
                  <input type="checkbox" checked={checked} disabled={markManagerLocked} onChange={(e) => toggleCoSelection(n, e.target.checked)} style={bigCheckboxStyle} />
                  CO-{n}
                </label>
              );
            })}

            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, fontSize: 12, color: '#111827' }}>
              {ciaAvailable ? (
                <>
                  <input type="checkbox" checked={ciaExamEnabled} disabled={markManagerLocked} onChange={(e) => setCiaExamEnabled(e.target.checked)} style={bigCheckboxStyle} />
                  CIA Exam
                </>
              ) : null}
            </label>
          </div>

          <div style={{ width: '100%', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            {allowedCoNumbers.map((n) => {
              const cfg = coConfigs[String(n)];
              const checked = Boolean(cfg?.enabled);
              if (!checked) return null;
              const expCount = clampInt(Number(cfg?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
              const expMax = clampInt(Number(cfg?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
              return (
                <div key={`cfg_${n}`} style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 10px', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 950 }}>CO-{n}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>No. of {itemLabelN.toLowerCase()}</div>
                  <input type="number" className="obe-input" value={expCount} onChange={(e) => setCoExpCount(n, Number(e.target.value))} min={0} max={12} disabled={markManagerLocked} />
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Max marks</div>
                  <input type="number" className="obe-input" value={expMax} onChange={(e) => setCoExpMax(n, Number(e.target.value))} min={0} max={100} disabled={markManagerLocked} />
                </div>
              );
            })}
          </div>
        </div>

        {markManagerError ? <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{markManagerError}</div> : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button
          onClick={saveNow}
          className="obe-btn obe-btn-success"
          disabled={savingDraft || !subjectId || tableBlocked}
          style={tableBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
        >
          {savingDraft ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          onClick={resetSheet}
          className="obe-btn obe-btn-danger"
          disabled={!subjectId || tableBlocked}
          style={tableBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : undefined}
        >
          Reset
        </button>
        <button
          onClick={publish}
          className="obe-btn obe-btn-primary"
          disabled={!subjectId || publishing || tableBlocked || globalLocked}
          style={tableBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          title={tableBlocked ? 'Table locked — confirm Mark Manager to enable actions' : !publishAllowed ? 'Publish window closed' : globalLocked ? 'Publishing locked' : 'Publish'}
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {loadingRoster ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading roster…</div> : null}
      {rosterError ? (
        <div
          style={{
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
          }}
        >
          {rosterError}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Term</div>
          <div style={{ fontWeight: 700 }}>{draft.sheet.termLabel || '—'}</div>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Batch</div>
          <div style={{ fontWeight: 700 }}>{draft.sheet.batchLabel || '—'}</div>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Saved</div>
          <div style={{ fontWeight: 700 }}>{savedAt || '—'}</div>
          {savedBy ? <div style={{ fontSize: 12, color: '#6b7280' }}>by <span style={{ color: '#0369a1', fontWeight: 700 }}>{savedBy}</span></div> : null}
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Published</div>
          <div style={{ fontWeight: 700 }}>{publishedAt || '—'}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <PublishLockOverlay locked={globalLocked}>
          <div
            className="obe-table-wrapper"
            style={{
              overflowX: 'hidden',
              position: 'relative',
              filter: tableBlocked ? 'grayscale(5%)' : undefined,
              opacity: tableBlocked ? 0.78 : 1,
            }}
          >
            {/* When the mark manager is not confirmed (editable), block the table view and show only a preview */}
            {/** tableBlocked: true when mark manager is editable and needs confirmation to unlock full table **/}
            {/* compute below */}
            <table className="obe-table" style={{ width: '100%', minWidth: 0, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              {renderColGroup(headerCols, absentUiEnabled)}
              <thead>
                <tr>
                  <th style={cellTh} colSpan={headerCols}>
                    {label}
                  </th>
                </tr>
                <tr>
                  <th style={{ ...cellTh, ...stickyTh(0, COL_SNO_W) }} rowSpan={5}>
                    S.No
                  </th>
                  <th style={{ ...cellTh, ...stickyTh(COL_SNO_W, COL_RNO_W) }} rowSpan={5}>
                    R.No
                  </th>
                  <th style={{ ...cellTh, ...stickyTh(COL_SNO_W + COL_RNO_W, COL_NAME_W), textAlign: 'left' }} rowSpan={5}>
                    Name of the Students
                  </th>

                  {absentUiEnabled ? (
                    <th style={{ ...cellTh, ...stickyTh(COL_SNO_W + COL_RNO_W + COL_NAME_W, COL_AB_W) }} rowSpan={5}>
                      AB
                    </th>
                  ) : null}

                  <th style={cellTh} colSpan={experimentsCols}>
                    {itemLabelN}
                  </th>
                  <th style={{ ...cellTh, width: COL_AVG_W, minWidth: COL_AVG_W, maxWidth: COL_AVG_W }} rowSpan={5}>
                    AVG
                  </th>
                  {ciaExamEnabled ? (
                    <th
                      style={{
                        ...cellTh,
                        width: COL_CIA_W,
                        minWidth: COL_CIA_W,
                        maxWidth: COL_CIA_W,
                        whiteSpace: 'pre-line',
                        overflow: 'visible',
                        textOverflow: 'clip',
                        lineHeight: 1.05,
                      }}
                      rowSpan={5}
                      title="CIA Exam"
                    >
                      {'CIA\nEXAM'}
                    </th>
                  ) : null}
                  <th style={cellTh} colSpan={coAttainmentCols}>
                    CO ATTAINMENT
                  </th>
                  {visibleBtlIndices.length ? (
                    <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>
                      BTL ATTAINMENT
                    </th>
                  ) : null}
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>—</th>
                  ) : (
                    <>
                      {enabledCoMetas.map((m) =>
                        Array.from({ length: m.expCount }, (_, i) => (
                          <th key={`co_${m.coNumber}_${i}`} style={cellTh}>
                            {m.coNumber}
                          </th>
                        )),
                      )}
                    </>
                  )}

                  {hasEnabledCos ? (
                    enabledCoMetas.map((m) => (
                      <th key={`coatt_${m.coNumber}`} style={cellTh} colSpan={2}>
                        CO-{m.coNumber}
                      </th>
                    ))
                  ) : (
                    <th style={cellTh} colSpan={2}>
                      —
                    </th>
                  )}
                  {visibleBtlIndices.map((n) => (
                    <th key={`btl_${n}`} style={cellTh} colSpan={2}>
                      BTL-{n}
                    </th>
                  ))}
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>—</th>
                  ) : (
                    <>
                      {enabledCoMetas.map((m) =>
                        Array.from({ length: m.expCount }, (_, i) => (
                          <th key={`max_${m.coNumber}_${i}`} style={cellTh}>
                            {m.expMax}
                          </th>
                        )),
                      )}
                    </>
                  )}

                  {hasEnabledCos ? (
                    enabledCoMetas.map((m) => {
                      const labOverrideVal = (LAB_CO_MAX_OVERRIDE as any)[`co${m.coNumber}`];
                      // build per-experiment max list for this CO and compute its average (matches AVERAGEIF behaviour)
                      const perExpMaxes = Array.from({ length: clampInt(Number(m.expCount ?? 0), 0, 12) }).map(() => clampInt(Number(m.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100));
                      const avgExpMax = perExpMaxes.length ? perExpMaxes.reduce((a, b) => a + b, 0) / perExpMaxes.length : 0;
                      const coBase = isLabCourse && Number.isFinite(Number(labOverrideVal)) ? Number(labOverrideVal) : avgExpMax;
                      const coMax = Math.round((coBase + (ciaExamEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0)) || 0);
                      return (
                        <React.Fragment key={`comax_${m.coNumber}`}>
                          <th style={cellTh}>{coMax}</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <>
                      <th style={cellTh}>—</th>
                      <th style={cellTh}>%</th>
                    </>
                  )}
                  {visibleBtlIndices.map((n) => (
                    <React.Fragment key={`btlmax_${n}`}>
                      <th style={cellTh}>{maxExpMax || DEFAULT_EXPERIMENT_MAX}</th>
                      <th style={cellTh}>%</th>
                    </React.Fragment>
                  ))}
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>No {itemLabelN.toLowerCase()}</th>
                  ) : (
                    <>
                      {enabledCoMetas.map((m) =>
                        Array.from({ length: m.expCount }, (_, i) => (
                          <th key={`e_${m.coNumber}_${i}`} style={cellTh}>
                            {itemColAbbrev}{i + 1}
                          </th>
                        )),
                      )}
                    </>
                  )}
                  <th style={cellTh} colSpan={coAttainmentCols + visibleBtlIndices.length * 2} />
                </tr>

                <tr>
                  {totalExpCols === 0 ? (
                    <th style={cellTh}>BTL</th>
                  ) : (
                    <>
                      {enabledCoMetas.map((m) =>
                        Array.from({ length: m.expCount }, (_, i) => (
                          <th key={`btl_${m.coNumber}_${i}`} style={cellTh}>
                            {(() => {
                              const v = (m.btl?.[i] ?? 1) as BtlLevel;
                              const display = v === '' ? '-' : String(v);
                              const editable = !viewerMode && !tableBlocked && !publishedEditLocked && !globalLocked;
                              return (
                                <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minWidth: 44 }} title={`BTL: ${display}`}>
                              <div
                                style={{
                                  width: '100%',
                                  padding: '4px 6px',
                                  background: '#fff',
                                  textAlign: 'center',
                                  userSelect: 'none',
                                  fontWeight: 800,
                                  cursor: editable ? 'pointer' : 'default',
                                }}
                              >
                                {display}
                              </div>
                              {editable ? (
                                <select
                                  aria-label={`BTL for ${itemLabel1} ${i + 1} (CO-${m.coNumber})`}
                                  value={v}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const next: BtlLevel = raw === '' ? '' : (Number(raw) as 1 | 2 | 3 | 4 | 5 | 6);
                                    setCoBtl(m.coNumber, i, next);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    cursor: 'pointer',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    MozAppearance: 'none',
                                  }}
                                >
                                  <option value="">-</option>
                                  {[1, 2, 3, 4, 5, 6].map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                            </div>
                              );
                            })()}
                          </th>
                        )),
                      )}
                    </>
                  )}
                  <th style={cellTh} colSpan={coAttainmentCols + visibleBtlIndices.length * 2} />
                </tr>
              </thead>

              <tbody>
                {(!tableBlocked && !publishedEditLocked ? students : []).map((s, idx) => {
                  const row = draft.sheet.rowsByStudentId?.[String(s.id)];
                  const ciaExamRaw = (row as any)?.ciaExam;
                  const ciaExamNum = ciaExamEnabled && typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;

                  const marksByCoRaw = (row as any)?.marksByCo;
                  const marksForEnabledCos = enabledCoMetas.map((m) => {
                    const byCo = marksByCoRaw && typeof marksByCoRaw === 'object' ? (marksByCoRaw as any)[String(m.coNumber)] : undefined;
                    const fallback = m.coNumber === coANum ? (row as any)?.marksA : m.coNumber === coBNum ? (row as any)?.marksB : undefined;
                    const marks = normalizeMarksArray(byCo ?? fallback, m.expCount);
                    return { coNumber: m.coNumber, marks };
                  });

                  const allVisibleMarks = marksForEnabledCos.flatMap((x) => x.marks);
                  const avgTotal = avgMarks(allVisibleMarks);
                  const hasAny = avgTotal != null || (ciaExamEnabled && ciaExamNum != null);

                  const coAttainmentValues = hasEnabledCos
                    ? enabledCoMetas.map((m) => {
                        const marks = marksForEnabledCos.find((x) => x.coNumber === m.coNumber)?.marks ?? [];
                        const avg = avgMarks(marks);
                        const mark = !hasAny ? null : (avg ?? 0) + (ciaExamEnabled ? (ciaExamNum ?? 0) / 2 : 0);
                          const labOverrideVal = (LAB_CO_MAX_OVERRIDE as any)[`co${m.coNumber}`];
                          const perExpMaxes = Array.from({ length: clampInt(Number(m.expCount ?? 0), 0, 12) }).map(() => clampInt(Number(m.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100));
                          const avgExpMax = perExpMaxes.length ? perExpMaxes.reduce((a, b) => a + b, 0) / perExpMaxes.length : 0;
                          const coBase = isLabCourse && Number.isFinite(Number(labOverrideVal)) ? Number(labOverrideVal) : avgExpMax;
                          const coMax = Math.round((coBase + (ciaExamEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0)) || 0);
                          return { coNumber: m.coNumber, mark, coMax };
                      })
                    : [];

                  const btlAvgByIndex: Record<number, number | null> = {};
                  for (const n of visibleBtlIndices) {
                    const marks: number[] = [];
                    for (const m of enabledCoMetas) {
                      const marksRow = marksForEnabledCos.find((x) => x.coNumber === m.coNumber)?.marks ?? [];
                      for (let i = 0; i < Math.min(m.expCount, marksRow.length); i++) {
                        if (m.btl[i] === n) {
                          const v = marksRow[i];
                          if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                        }
                      }
                    }
                    btlAvgByIndex[n] = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
                  }

                  return (
                    <tr key={s.id} style={tableBlocked && idx < 3 ? { position: 'relative', zIndex: 35, background: '#fff' } : undefined}>
                      <td style={{ ...cellTd, ...stickyTd(0, COL_SNO_W), textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ ...cellTd, ...stickyTd(COL_SNO_W, COL_RNO_W), textAlign: 'center' }} title={String(s.reg_no || '')}>
                        {shortenRollNo(s.reg_no, 7)}
                      </td>
                      <td style={{ ...cellTd, ...stickyTd(COL_SNO_W + COL_RNO_W, COL_NAME_W) }} title={String(s.name || '')}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {String(s.name || '')}
                        </span>
                      </td>

                      {absentUiEnabled ? (
                        <td style={{ ...cellTd, ...stickyTd(COL_SNO_W + COL_RNO_W + COL_NAME_W, COL_AB_W), textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={Boolean((row as any)?.absent)}
                              onChange={(e) => setAbsent(s.id, e.target.checked)}
                              disabled={tableBlocked}
                            />
                            {Boolean((row as any)?.absent) ? (
                              <div className="obe-ios-select" title="Absent type">
                                <span className="obe-ios-select-value">{String((row as any).absentKind || 'AL')}</span>
                                <select
                                  aria-label="Absent type"
                                  value={((row as any).absentKind || 'AL') as any}
                                  onChange={(e) => setAbsentKind(s.id, e.target.value as any)}
                                  disabled={tableBlocked}
                                >
                                  <option value="AL">AL</option>
                                  <option value="ML">ML</option>
                                  <option value="SKL">SKL</option>
                                </select>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      ) : null}

                      {totalExpCols === 0 ? (
                        <td style={{ ...cellTd, textAlign: 'center', color: '#6b7280' }}>—</td>
                      ) : (
                        enabledCoMetas.map((m) => {
                          const marks = marksForEnabledCos.find((x) => x.coNumber === m.coNumber)?.marks ?? [];
                          return Array.from({ length: m.expCount }, (_, i) => (
                            <td key={`m_${s.id}_${m.coNumber}_${i}`} style={{ ...cellTd, width: 38, minWidth: 0, padding: '2px 2px', background: '#fff7ed' }}>
                              <input
                                type="number"
                                value={marks[i] ?? ''}
                                onChange={(e) => setCoMark(s.id, m.coNumber, i, e.target.value === '' ? '' : Number(e.target.value))}
                                style={inputStyle}
                                min={0}
                                max={m.expMax}
                                disabled={tableBlocked}
                              />
                            </td>
                          ));
                        })
                      )}

                      <td style={{ ...cellTd, width: COL_AVG_W, minWidth: 0, textAlign: 'right', fontWeight: 800 }}>{avgTotal == null ? '' : avgTotal.toFixed(1)}</td>
                      {ciaExamEnabled ? (
                        <td style={{ ...cellTd, width: COL_CIA_W, minWidth: 0, padding: '2px 2px', background: '#fff7ed' }}>
                          <input
                            type="number"
                            value={(row as any)?.ciaExam ?? ''}
                            onChange={(e) => setCiaExam(s.id, e.target.value === '' ? '' : Number(e.target.value))}
                            style={inputStyle}
                            min={0}
                            max={DEFAULT_CIA_EXAM_MAX}
                            disabled={tableBlocked}
                          />
                        </td>
                      ) : null}

                      {hasEnabledCos ? (
                        coAttainmentValues.map((c) => (
                          <React.Fragment key={`coattrow_${s.id}_${c.coNumber}`}>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{c.mark == null ? '' : c.mark.toFixed(1)}</td>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{pct(c.mark, c.coMax)}</td>
                          </React.Fragment>
                        ))
                      ) : (
                        <>
                          <td style={{ ...cellTd, textAlign: 'right' }} />
                          <td style={{ ...cellTd, textAlign: 'right' }} />
                        </>
                      )}

                      {visibleBtlIndices.map((n) => {
                        const m = btlAvgByIndex[n] ?? null;
                        return (
                          <React.Fragment key={`btlcell_${s.id}_${n}`}>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{m == null ? '' : m.toFixed(1)}</td>
                            <td style={{ ...cellTd, textAlign: 'right' }}>{pct(m, maxExpMax || DEFAULT_EXPERIMENT_MAX)}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}

                {students.length === 0 && (
                  <tr>
                    <td colSpan={headerCols} style={{ padding: 10, color: '#6b7280' }}>
                      No students.
                    </td>
                  </tr>
                )}
                {/* Footer row intentionally hidden while table is blocked (no preview rows shown) */}
              </tbody>
            </table>
            {/* Blue overlay when blocked by Mark Manager (pre-confirm) */}
            {tableBlocked && !publishedEditLocked && !viewerMode ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 30,
                  pointerEvents: 'auto',
                  background: 'linear-gradient(180deg, rgba(72, 113, 195, 0.92) 0%, rgba(51, 55, 64, 0.96) 100%)',
                }}
              />
            ) : null}

            {/* Green overlay when blocked after a second Publish click (published edit-lock) */}
            {publishedEditLocked && !viewerMode ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 30,
                  pointerEvents: 'auto',
                  background: 'linear-gradient(180deg, rgba(34,197,94,0.28) 0%, rgba(16,185,129,0.36) 100%)',
                }}
              />
            ) : null}
            {/* Floating panel (image above, text below) when blocked by Mark Manager */}
            {tableBlocked && !publishedEditLocked && !viewerMode ? (
              <div style={floatingPanelStyle}>
                <div style={{ width: 100, height: 72, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 8 }}>
                  <img
                    id="mark-manager-float-gif"
                    src={"https://media.lordicon.com/icons/wired/flat/94-lock-unlock.gif"}
                    alt="gif"
                    style={{ maxWidth: 72, maxHeight: 72, display: 'block' }}
                    onError={(e) => {
                      // Log the failed URL for debugging and fall back to a small inline SVG lock
                      // eslint-disable-next-line no-console
                      console.warn('Failed to load lock GIF:', (e.currentTarget as HTMLImageElement).src);
                      (e.currentTarget as HTMLImageElement).onerror = null;
                      (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
                        `<svg xmlns="https://media.lordicon.com/icons/wired/flat/94-lock-unlock.gif" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
                      );
                    }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: '#111827' }}>Table Locked</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Confirm the Mark Manager</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  
                  
                </div>
              </div>
            ) : null}

            {/* Floating panel when blocked after Publish */}
            {publishedEditLocked && !viewerMode ? (
              <div style={floatingPanelStyle}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 900, color: '#065f46' }}>Published</div>
                  <div style={{ fontSize: 13, color: '#065f46' }}>Marks are locked. Request IQAC approval to edit.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button type="button" className="obe-btn" onClick={() => setViewMarksModalOpen(true)}>
                    View Marks
                  </button>
                  <button
                    type="button"
                    className="obe-btn obe-btn-success"
                    onClick={() => {
                      setPublishedEditModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                </div>

                <div
                  style={{
                    width: 170,
                    height: 92,
                    display: 'grid',
                    placeItems: 'center',
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid rgba(2,6,23,0.08)',
                  }}
                >
                  <img
                    id="published-lock-image"
                    src={new URL('../../assets/gif/lockong.png', import.meta.url).toString()}
                    alt="locked"
                    style={{ maxWidth: 150, maxHeight: 80, display: 'block' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).onerror = null;
                      (e.currentTarget as HTMLImageElement).src = 'https://media.lordicon.com/icons/wired/flat/1103-check-mark.gif';
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </PublishLockOverlay>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {savedAt ? (
          <div>
            Draft saved: {savedAt}
            {savedBy ? <span style={{ marginLeft: 8, color: '#374151' }}>by <strong>{savedBy}</strong></span> : null}
          </div>
        ) : null}
        {publishedAt ? <div>Last published: {publishedAt}</div> : null}
      </div>

      {markManagerModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => {
            if (markManagerBusy) return;
            setMarkManagerModal(null);
          }}
        >
          <div
            style={{
              width: 'min(760px, 96vw)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>
                {markManagerModal.mode === 'confirm' ? `Confirmation - ${label}` : `Request Edit - ${label}`}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{assessmentKey.toUpperCase()}</div>
            </div>

            {markManagerModal.mode === 'confirm' ? (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  Confirm the selected COs and their settings. After confirming, the Mark Manager box will be locked.
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ textAlign: 'left', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>CO</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>{itemLabelN}</th>
                        <th style={{ textAlign: 'right', padding: 10, fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>Max marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(coConfigs)
                        .filter(([k, v]) => allowedCoSet.has(String(k)) && Boolean(v?.enabled))
                        .map(([k, v]) => ({
                          co: clampInt(Number(k), 1, 5),
                          expCount: clampInt(Number(v?.expCount ?? 0), 0, 12),
                          expMax: clampInt(Number(v?.expMax ?? 0), 0, 100),
                        }))
                        .sort((a, b) => a.co - b.co)
                        .map((it) => (
                          <tr key={it.co}>
                            <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CO-{it.co}</td>
                            <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{it.expCount}</td>
                            <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{it.expMax}</td>
                          </tr>
                        ))}
                      {Object.entries(coConfigs).filter(([k, v]) => allowedCoSet.has(String(k)) && Boolean(v?.enabled)).length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: 10, color: '#6b7280' }}>
                            No COs selected.
                          </td>
                        </tr>
                      ) : null}

                      {ciaAvailable ? (
                        <tr>
                          <td style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontWeight: 900 }}>CIA Exam</td>
                          <td colSpan={2} style={{ padding: 10, borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                            {ciaExamEnabled ? 'Enabled' : 'Disabled'}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                This will send an edit request to IQAC. The Mark Manager will remain locked until IQAC approves.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="obe-btn" disabled={markManagerBusy} onClick={() => setMarkManagerModal(null)}>
                Cancel
              </button>
              <button
                className="obe-btn obe-btn-success"
                disabled={markManagerBusy || !subjectId}
                onClick={async () => {
                  if (!subjectId) return;
                  if (markManagerModal.mode === 'request') {
                    // Before sending an edit request to IQAC, check if the published sheet
                    // differs from the current Mark Manager settings and whether marks exist.
                    setMarkManagerBusy(true);
                    setMarkManagerError(null);
                    try {
                      const pub = publishedViewSnapshot;
                      const curCfg = coConfigs;
                      if (pub && pub.sheet && pub.sheet.coConfigs) {
                        const diff = computeCoConfigDiff(ensureCoConfigs(pub.sheet), curCfg);
                        const affected = countNonEmptyPublishedMarks(pub.sheet.rowsByStudentId as any, [...diff.removed, ...diff.changed]);
                        if ((diff.removed.length || diff.changed.length || diff.added.length) && affected > 0) {
                          // show confirmation modal to user
                          setPendingCoDiff({ visible: true, diff, affected, mode: 'request' });
                          setMarkManagerBusy(false);
                          return;
                        }
                      }
                      setMarkManagerModal(null);
                      await requestEdit();
                    } finally {
                      setMarkManagerBusy(false);
                    }
                    return;
                  }
                  // CONFIRM mode: warn + allow resetting removed/changed CO columns BEFORE saving.
                  const prevCfg = coConfigsFromSnapshot(draft.sheet.markManagerSnapshot ?? null);
                  if (prevCfg) {
                    const prevEnabled = enabledCosFromCfg(prevCfg);
                    const nextEnabled = enabledCosFromCfg(coConfigs);
                    const removed = prevEnabled.filter((n) => !nextEnabled.includes(n));
                    if (removed.length) {
                      const fixedCoA = clampInt(Number(coA ?? 1), 1, 5);
                      const fixedCoB = coB == null ? null : clampInt(Number(coB), 1, 5);
                      const affected = countNonEmptyDraftMarksForCos(draft.sheet.rowsByStudentId as any, removed, fixedCoA, fixedCoB);
                      setPendingMarkManagerReset({ visible: true, removed, affected });
                      return;
                    }
                  }
                  await confirmMarkManagerWithReset('none');
                }}
              >
                {markManagerModal.mode === 'confirm' ? 'Confirm' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingCoDiff && pendingCoDiff.visible ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 90 }}
          onClick={() => {
            if (markManagerBusy) return;
            setPendingCoDiff(null);
          }}
        >
          <div style={{ width: 'min(640px, 96vw)', background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e5e7eb' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Mark Manager conflict with published marks</div>
            <div style={{ color: '#374151', marginBottom: 12 }}>
              The selected CO settings differ from the published mark sheet. {pendingCoDiff.affected} student rows contain marks that may be lost.
            </div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
              <div><strong>Added COs:</strong> {pendingCoDiff.diff.added.join(', ') || '—'}</div>
              <div><strong>Removed COs:</strong> {pendingCoDiff.diff.removed.join(', ') || '—'}</div>
              <div><strong>Changed COs:</strong> {pendingCoDiff.diff.changed.join(', ') || '—'}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="obe-btn" onClick={() => setPendingCoDiff(null)} disabled={markManagerBusy}>Cancel</button>
              <button
                className="obe-btn obe-btn-danger"
                disabled={markManagerBusy}
                onClick={async () => {
                  if (!subjectId) return;
                  setMarkManagerBusy(true);
                  try {
                    const cur = draft;
                    const rows = Object.fromEntries(
                      Object.entries(cur.sheet.rowsByStudentId || {}).map(([sid, row0]) => {
                        const row: any = row0 && typeof row0 === 'object' ? row0 : {};
                        const expCountA2 = clampInt(Number(cur.sheet.expCountA ?? DEFAULT_EXPERIMENTS), 0, 12);
                        const expCountB2 = clampInt(Number(cur.sheet.expCountB ?? 0), 0, 12);
                        const nextRow: any = { ...row };
                        nextRow.marksA = Array.from({ length: expCountA2 }, () => '');
                        nextRow.marksB = Array.from({ length: expCountB2 }, () => '');
                        nextRow.ciaExam = '';
                        const mbc = nextRow.marksByCo && typeof nextRow.marksByCo === 'object' ? { ...nextRow.marksByCo } : {};
                        for (const k of [...pendingCoDiff.diff.removed.map(String), ...pendingCoDiff.diff.changed.map(String)]) {
                          if (mbc[k]) {
                            mbc[k] = Array.from({ length: (coConfigs[k]?.expCount ?? 0) }, () => '');
                          }
                        }
                        nextRow.marksByCo = mbc;
                        return [sid, nextRow];
                      }),
                    );

                    const resetDraft: LabDraftPayload = { sheet: { ...cur.sheet, rowsByStudentId: rows } } as any;
                    setDraft(resetDraft);
                    await saveDraft(assessmentKey, String(subjectId), resetDraft);
                    setSavedAt(new Date().toLocaleString());

                    if (pendingCoDiff.mode === 'request') {
                      setPendingCoDiff(null);
                      setMarkManagerModal(null);
                      await requestEdit();
                    } else {
                      try {
                        await confirmMarkManagerLock(assessmentKey as any, String(subjectId), teachingAssignmentId);
                        refreshMarkLock({ silent: true });
                      } catch (err) {
                        console.warn('confirmMarkManagerLock failed after reset', err);
                      }
                      setPendingCoDiff(null);
                    }
                  } catch (e: any) {
                    alert(e?.message || 'Failed to reset marks');
                  } finally {
                    setMarkManagerBusy(false);
                  }
                }}
              >
                Reset & Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingMarkManagerReset && pendingMarkManagerReset.visible ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 95 }}
          onClick={() => {
            if (markManagerBusy) return;
            setPendingMarkManagerReset(null);
          }}
        >
          <div
            style={{ width: 'min(660px, 96vw)', background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e5e7eb' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              {pendingMarkManagerReset.removed.length === 1
                ? `Shall I reset the CO${pendingMarkManagerReset.removed[0]} column?`
                : `Shall I reset the removed CO columns?`}
            </div>
            <div style={{ color: '#374151', marginBottom: 10 }}>
              The new Mark Manager selection removed old COs.
              {pendingMarkManagerReset.affected > 0
                ? ` ${pendingMarkManagerReset.affected} student rows contain marks in these columns.`
                : ' No marks were found in these columns.'}
            </div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
              <div><strong>Removed COs:</strong> {pendingMarkManagerReset.removed.join(', ') || '—'}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="obe-btn" onClick={() => setPendingMarkManagerReset(null)} disabled={markManagerBusy}>Cancel</button>
              <button
                className="obe-btn obe-btn-primary"
                disabled={markManagerBusy}
                onClick={async () => {
                  const partial = pendingMarkManagerReset.removed;
                  setPendingMarkManagerReset(null);
                  await confirmMarkManagerWithReset('partial', partial);
                }}
              >
                {pendingMarkManagerReset.removed.length === 1
                  ? `Reset CO${pendingMarkManagerReset.removed[0]} column`
                  : `Reset removed CO columns`}
              </button>
              <button
                className="obe-btn obe-btn-danger"
                disabled={markManagerBusy}
                onClick={async () => {
                  setPendingMarkManagerReset(null);
                  await confirmMarkManagerWithReset('full');
                }}
              >
                Reset full data
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {publishedEditModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 60,
          }}
          onClick={() => setPublishedEditModalOpen(false)}
        >
          <div
            style={{
              width: 'min(560px, 96vw)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>Edit Request</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(assessmentKey).toUpperCase()} LAB</div>
            </div>

            <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, lineHeight: 1.35 }}>
              <div><strong>Subject:</strong> {label}</div>
              <div><strong>Code:</strong> {String(subjectId || '—')}</div>
              <div><strong>Published:</strong> {publishedAt || '—'}</div>
              <div><strong>Saved:</strong> {savedAt || '—'}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="obe-btn" onClick={() => setPublishedEditModalOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="obe-btn obe-btn-primary"
                onClick={async () => {
                  if (!subjectId) return;
                  try {
                    await createEditRequest({
                      assessment: assessmentKey as any,
                      subject_code: String(subjectId),
                      scope: 'MARK_ENTRY',
                      reason: `Edit request: Marks entry for ${label}`,
                      teaching_assignment_id: teachingAssignmentId,
                    });
                    alert('Edit request sent to IQAC.');
                    setPublishedEditModalOpen(false);
                    refreshMarkLock({ silent: true });
                  } catch (e: any) {
                    alert(e?.message || 'Request failed');
                  }
                }}
              >
                Request Edit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewMarksModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 70,
          }}
          onClick={() => setViewMarksModalOpen(false)}
        >
          <div
            style={{
              width: 'min(1100px, 96vw)',
              maxHeight: 'min(80vh, 900px)',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>View Marks</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(assessmentKey).toUpperCase()} LAB</div>
            </div>

            {publishedViewLoading ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading published marks…</div> : null}
            {publishedViewError ? (
              <div
                style={{
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
                }}
              >
                {publishedViewError}
              </div>
            ) : null}

            <div style={{ overflowX: 'hidden', border: '1px solid #e5e7eb', borderRadius: 12, position: 'relative' }}>
              {(() => {
                // View table never shows AB column, so compute the exact column count.
                const viewHeaderCols = 3 + experimentsCols + 1 + (ciaExamEnabled ? 1 : 0) + coAttainmentCols + visibleBtlIndices.length * 2;
                return (
                  <table className="obe-table" style={{ width: '100%', minWidth: 0, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                    {renderColGroup(viewHeaderCols, false)}
                <thead>
                  <tr>
                    <th style={cellTh} colSpan={viewHeaderCols}>
                      {label}
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...cellTh, ...stickyTh(0, COL_SNO_W) }} rowSpan={5}>
                      S.No
                    </th>
                    <th style={{ ...cellTh, ...stickyTh(COL_SNO_W, COL_RNO_W) }} rowSpan={5}>
                      R.No
                    </th>
                    <th style={{ ...cellTh, ...stickyTh(COL_SNO_W + COL_RNO_W, COL_NAME_W), textAlign: 'left' }} rowSpan={5}>
                      Name of the Students
                    </th>
                    <th style={cellTh} colSpan={experimentsCols}>
                      Experiments
                    </th>
                    <th style={{ ...cellTh, width: COL_AVG_W, minWidth: COL_AVG_W, maxWidth: COL_AVG_W }} rowSpan={5}>
                      AVG
                    </th>
                    {ciaExamEnabled ? (
                      <th
                        style={{
                          ...cellTh,
                          width: COL_CIA_W,
                          minWidth: COL_CIA_W,
                          maxWidth: COL_CIA_W,
                          whiteSpace: 'pre-line',
                          overflow: 'visible',
                          textOverflow: 'clip',
                          lineHeight: 1.05,
                        }}
                        rowSpan={5}
                        title="CIA Exam"
                      >
                        {'CIA\nEXAM'}
                      </th>
                    ) : null}
                    <th style={cellTh} colSpan={coAttainmentCols}>
                      CO ATTAINMENT
                    </th>
                    {visibleBtlIndices.length ? (
                      <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>
                        BTL ATTAINMENT
                      </th>
                    ) : null}
                  </tr>

                  <tr>
                    {totalExpCols === 0 ? (
                      <th style={cellTh}>—</th>
                    ) : (
                      <>
                        {enabledCoMetas.map((m) =>
                          Array.from({ length: m.expCount }, (_, i) => (
                            <th key={`co_view_${m.coNumber}_${i}`} style={cellTh}>
                              {m.coNumber}
                            </th>
                          )),
                        )}
                      </>
                    )}

                    {hasEnabledCos ? (
                      enabledCoMetas.map((m) => (
                        <th key={`coatt_view_${m.coNumber}`} style={cellTh} colSpan={2}>
                          CO-{m.coNumber}
                        </th>
                      ))
                    ) : (
                      <th style={cellTh} colSpan={2}>
                        —
                      </th>
                    )}
                    {visibleBtlIndices.map((n) => (
                      <th key={`btl_view_${n}`} style={cellTh} colSpan={2}>
                        BTL-{n}
                      </th>
                    ))}
                  </tr>

                  <tr>
                    {totalExpCols === 0 ? (
                      <th style={cellTh}>—</th>
                    ) : (
                      <>
                        {enabledCoMetas.map((m) =>
                          Array.from({ length: m.expCount }, (_, i) => (
                            <th key={`max_view_${m.coNumber}_${i}`} style={cellTh}>
                              {m.expMax}
                            </th>
                          )),
                        )}
                      </>
                    )}

                    {hasEnabledCos ? (
                      enabledCoMetas.map((m) => {
                        const coMax = m.expMax + (ciaExamEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0);
                        return (
                          <React.Fragment key={`comax_view_${m.coNumber}`}>
                            <th style={cellTh}>{coMax}</th>
                            <th style={cellTh}>%</th>
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <>
                        <th style={cellTh}>—</th>
                        <th style={cellTh}>%</th>
                      </>
                    )}
                    {visibleBtlIndices.map((n) => (
                      <React.Fragment key={`btlmax_view_${n}`}>
                        <th style={cellTh}>{maxExpMax || DEFAULT_EXPERIMENT_MAX}</th>
                        <th style={cellTh}>%</th>
                      </React.Fragment>
                    ))}
                  </tr>

                  <tr>
                    {totalExpCols === 0 ? (
                      <th style={cellTh}>No experiments</th>
                    ) : (
                      <>
                        {enabledCoMetas.map((m) =>
                          Array.from({ length: m.expCount }, (_, i) => (
                            <th key={`e_view_${m.coNumber}_${i}`} style={cellTh}>
                              E{i + 1}
                            </th>
                          )),
                        )}
                      </>
                    )}
                    <th style={cellTh} colSpan={coAttainmentCols + visibleBtlIndices.length * 2} />
                  </tr>

                  <tr>
                    {totalExpCols === 0 ? (
                      <th style={cellTh}>BTL</th>
                    ) : (
                      <>
                        {enabledCoMetas.map((m) =>
                          Array.from({ length: m.expCount }, (_, i) => (
                            <th key={`btlhdr_view_${m.coNumber}_${i}`} style={cellTh}>
                              {m.btl[i] || 1}
                            </th>
                          )),
                        )}
                      </>
                    )}
                    <th style={cellTh} colSpan={coAttainmentCols + visibleBtlIndices.length * 2} />
                  </tr>
                </thead>

                <tbody>
                  {students.map((s, idx) => {
                    const srcSheet = (publishedViewSnapshot && (publishedViewSnapshot as any).sheet) ? (publishedViewSnapshot as any).sheet : draft.sheet;
                    const row = (srcSheet as any)?.rowsByStudentId?.[String(s.id)];
                    const ciaExamRaw = (row as any)?.ciaExam;
                    const ciaExamNum = ciaExamEnabled && typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;

                    const marksByCoRaw = (row as any)?.marksByCo;
                    const marksForEnabledCos = enabledCoMetas.map((m) => {
                      const byCo = marksByCoRaw && typeof marksByCoRaw === 'object' ? (marksByCoRaw as any)[String(m.coNumber)] : undefined;
                      const fallback = m.coNumber === coANum ? (row as any)?.marksA : m.coNumber === coBNum ? (row as any)?.marksB : undefined;
                      const marks = normalizeMarksArray(byCo ?? fallback, m.expCount);
                      return { coNumber: m.coNumber, marks };
                    });

                    const allVisibleMarks = marksForEnabledCos.flatMap((x) => x.marks);
                    const avgTotal = avgMarks(allVisibleMarks);
                    const hasAny = avgTotal != null || (ciaExamEnabled && ciaExamNum != null);

                    const coAttainmentValues = hasEnabledCos
                      ? enabledCoMetas.map((m) => {
                          const marks = marksForEnabledCos.find((x) => x.coNumber === m.coNumber)?.marks ?? [];
                          const avg = avgMarks(marks);
                          const mark = !hasAny ? null : (avg ?? 0) + (ciaExamEnabled ? (ciaExamNum ?? 0) / 2 : 0);
                          const labOverrideVal = (LAB_CO_MAX_OVERRIDE as any)[`co${m.coNumber}`];
                          const coBase = isLabCourse && Number.isFinite(Number(labOverrideVal)) ? Number(labOverrideVal) : m.expMax;
                          const coMax = coBase + (ciaExamEnabled ? DEFAULT_CIA_EXAM_MAX / 2 : 0);
                          return { coNumber: m.coNumber, mark, coMax };
                        })
                      : [];

                    const btlAvgByIndex: Record<number, number | null> = {};
                    for (const n of visibleBtlIndices) {
                      const marks: number[] = [];
                      for (const m of enabledCoMetas) {
                        const marksRow = marksForEnabledCos.find((x) => x.coNumber === m.coNumber)?.marks ?? [];
                        for (let i = 0; i < Math.min(m.expCount, marksRow.length); i++) {
                          if (m.btl[i] === n) {
                            const v = marksRow[i];
                            if (typeof v === 'number' && Number.isFinite(v)) marks.push(v);
                          }
                        }
                      }
                      btlAvgByIndex[n] = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
                    }

                    return (
                      <tr key={`view_${s.id}`}>
                        <td style={{ ...cellTd, ...stickyTd(0, COL_SNO_W), textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ ...cellTd, ...stickyTd(COL_SNO_W, COL_RNO_W) }} title={String(s.reg_no || '')}>
                          {shortenRollNo(s.reg_no, 7)}
                        </td>
                        <td style={{ ...cellTd, ...stickyTd(COL_SNO_W + COL_RNO_W, COL_NAME_W) }} title={String(s.name || '')}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(s.name || '')}
                          </span>
                        </td>

                        {totalExpCols === 0 ? (
                          <td style={{ ...cellTd, textAlign: 'center', color: '#6b7280' }}>—</td>
                        ) : (
                          enabledCoMetas.map((m) => {
                            const marks = marksForEnabledCos.find((x) => x.coNumber === m.coNumber)?.marks ?? [];
                            return Array.from({ length: m.expCount }, (_, i) => (
                              <td
                                key={`view_m_${s.id}_${m.coNumber}_${i}`}
                                style={{ ...cellTd, width: 38, minWidth: 0, padding: '2px 2px', background: '#fff7ed', textAlign: 'center', fontWeight: 800 }}
                              >
                                {marks[i] ?? ''}
                              </td>
                            ));
                          })
                        )}

                        <td style={{ ...cellTd, width: COL_AVG_W, minWidth: 0, textAlign: 'right', fontWeight: 800 }}>{avgTotal == null ? '' : avgTotal.toFixed(1)}</td>
                        {ciaExamEnabled ? (
                          <td style={{ ...cellTd, width: COL_CIA_W, minWidth: 0, padding: '2px 2px', background: '#fff7ed', textAlign: 'center', fontWeight: 800 }}>
                            {(row as any)?.ciaExam ?? ''}
                          </td>
                        ) : null}

                        {hasEnabledCos ? (
                          coAttainmentValues.map((c) => (
                            <React.Fragment key={`view_coatt_${s.id}_${c.coNumber}`}>
                              <td style={{ ...cellTd, textAlign: 'right' }}>{c.mark == null ? '' : c.mark.toFixed(1)}</td>
                              <td style={{ ...cellTd, textAlign: 'right' }}>{pct(c.mark, c.coMax)}</td>
                            </React.Fragment>
                          ))
                        ) : (
                          <>
                            <td style={{ ...cellTd, textAlign: 'right' }} />
                            <td style={{ ...cellTd, textAlign: 'right' }} />
                          </>
                        )}

                        {visibleBtlIndices.map((n) => {
                          const m = btlAvgByIndex[n] ?? null;
                          return (
                            <React.Fragment key={`view_btl_${s.id}_${n}`}>
                              <td style={{ ...cellTd, textAlign: 'right' }}>{m == null ? '' : m.toFixed(1)}</td>
                              <td style={{ ...cellTd, textAlign: 'right' }}>{pct(m, maxExpMax || DEFAULT_EXPERIMENT_MAX)}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={headerCols} style={{ padding: 10, color: '#6b7280' }}>
                        No students.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                  </table>
                );
              })()}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="obe-btn" onClick={() => setViewMarksModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Compare two coConfigs objects and return added/removed/changed CO numbers
function computeCoConfigDiff(oldCfg: NonNullable<LabSheet['coConfigs']>, newCfg: NonNullable<LabSheet['coConfigs']>) {
  const added: number[] = [];
  const removed: number[] = [];
  const changed: number[] = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const k = String(n);
    const o = oldCfg[k];
    const nn = newCfg[k];
    const oEnabled = Boolean(o?.enabled);
    const nEnabled = Boolean(nn?.enabled);
    if (oEnabled && !nEnabled) removed.push(n);
    if (!oEnabled && nEnabled) added.push(n);
    if (oEnabled && nEnabled) {
      const oExp = clampInt(Number(o?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
      const nExp = clampInt(Number(nn?.expCount ?? DEFAULT_EXPERIMENTS), 0, 12);
      const oMax = clampInt(Number(o?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      const nMax = clampInt(Number(nn?.expMax ?? DEFAULT_EXPERIMENT_MAX), 0, 100);
      if (oExp !== nExp || oMax !== nMax) changed.push(n);
    }
  }
  return { added, removed, changed };
}

function countNonEmptyPublishedMarks(rowsByStudentId: Record<string, LabRowState> | undefined, coNums: number[]) {
  if (!rowsByStudentId) return 0;
  let cnt = 0;
  for (const r of Object.values(rowsByStudentId)) {
    // check marksByCo for given coNums
    const marksByCo = r?.marksByCo && typeof r.marksByCo === 'object' ? r.marksByCo : {};
    for (const c of coNums) {
      const arr = Array.isArray(marksByCo[String(c)]) ? (marksByCo[String(c)] as Array<any>) : [];
      if (arr.some((v) => v !== '' && v != null)) {
        cnt++;
        break;
      }
    }
    // also check legacy marksA/marksB if present
    if (cnt > 0) continue;
    if (r.marksA && r.marksA.some((v) => v !== '' && v != null)) {
      cnt++;
      continue;
    }
    if (r.marksB && r.marksB.some((v) => v !== '' && v != null)) {
      cnt++;
      continue;
    }
    if (typeof r.ciaExam === 'number' && Number.isFinite(r.ciaExam)) {
      cnt++;
      continue;
    }
  }
  return cnt;
}
