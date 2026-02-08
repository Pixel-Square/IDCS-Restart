import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { createPublishRequest, fetchDraft, publishSsa1, saveDraft } from '../services/obe';
import { formatRemaining, usePublishWindow } from '../hooks/usePublishWindow';
import PublishLockOverlay from './PublishLockOverlay';

type Props = { subjectId: string; teachingAssignmentId?: number };

type Ssa1Row = {
  studentId: number;
  section: string;
  registerNo: string;
  name: string;
  total: number | '';
};

type Ssa1Sheet = {
  termLabel: string;
  batchLabel: string;
  rows: Ssa1Row[];
};

type Ssa1DraftPayload = {
  sheet: Ssa1Sheet;
  selectedBtls: number[];
};

const DEFAULT_MAX_ASMT1 = 20;
const DEFAULT_CO_MAX = { co1: 10, co2: 10 };
const DEFAULT_BTL_MAX = { btl1: 0, btl2: 0, btl3: 10, btl4: 10, btl5: 0, btl6: 0 };
const DEFAULT_BTL_MAX_WHEN_VISIBLE = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function pct(mark: number | null, max: number) {
  if (mark == null) return '';
  if (!Number.isFinite(max) || max <= 0) return '0';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
}

function readFiniteNumber(value: any): number | null {
  if (value === '' || value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getBtlMaxFromCfg(cfg: any, n: 1 | 2 | 3 | 4 | 5 | 6, fallback: number): number {
  const btlMax = cfg?.btlMax;
  const raw = btlMax?.[String(n)] ?? btlMax?.[`btl${n}`] ?? btlMax?.[n];
  const parsed = readFiniteNumber(raw);
  return parsed == null ? fallback : parsed;
}

function displayBtlMax(raw: any): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BTL_MAX_WHEN_VISIBLE;
}

function storageKey(subjectId: string) {
  return `ssa1_sheet_${subjectId}`;
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')]
    .concat(
      rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h];
            const s = String(v ?? '').replace(/\n/g, ' ');
            return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      ),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const an = String(a?.name || '').trim().toLowerCase();
  const bn = String(b?.name || '').trim().toLowerCase();
  if (an && bn) {
    const byName = an.localeCompare(bn);
    if (byName) return byName;
  } else if (an || bn) {
    // Put students with a name first
    return an ? -1 : 1;
  }

  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  const byReg = ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
  if (byReg) return byReg;
  return 0;
}

function shortenRegisterNo(registerNo: string): string {
  return registerNo.slice(-8);
}

export default function Ssa1Entry({ subjectId, teachingAssignmentId }: Props) {
  const key = useMemo(() => storageKey(subjectId), [subjectId]);
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [sheet, setSheet] = useState<Ssa1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rows: [],
  });

  const masterTermLabel = String(masterCfg?.termLabel || 'KRCT AY25-26');
  const ssa1Cfg = masterCfg?.assessments?.ssa1 || {};
  const MAX_ASMT1 = Number.isFinite(Number(ssa1Cfg?.maxTotal)) ? Number(ssa1Cfg.maxTotal) : DEFAULT_MAX_ASMT1;
  const CO_MAX = {
    co1: Number.isFinite(Number(ssa1Cfg?.coMax?.co1)) ? Number(ssa1Cfg.coMax.co1) : DEFAULT_CO_MAX.co1,
    co2: Number.isFinite(Number(ssa1Cfg?.coMax?.co2)) ? Number(ssa1Cfg.coMax.co2) : DEFAULT_CO_MAX.co2,
  };
  const BTL_MAX = {
    btl1: getBtlMaxFromCfg(ssa1Cfg, 1, DEFAULT_BTL_MAX.btl1),
    btl2: getBtlMaxFromCfg(ssa1Cfg, 2, DEFAULT_BTL_MAX.btl2),
    btl3: getBtlMaxFromCfg(ssa1Cfg, 3, DEFAULT_BTL_MAX.btl3),
    btl4: getBtlMaxFromCfg(ssa1Cfg, 4, DEFAULT_BTL_MAX.btl4),
    btl5: getBtlMaxFromCfg(ssa1Cfg, 5, DEFAULT_BTL_MAX.btl5),
    btl6: getBtlMaxFromCfg(ssa1Cfg, 6, DEFAULT_BTL_MAX.btl6),
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        // Keep local rows, but adopt master term + subject for sheet label.
        setSheet((p) => ({ ...p, termLabel: String((cfg as any)?.termLabel || p.termLabel || 'KRCT AY25-26'), batchLabel: subjectId }));
      } catch {
        // If master config fails, continue with local defaults.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [btlPickerOpen, setBtlPickerOpen] = useState(true);
  const [selectedBtls, setSelectedBtls] = useState<number[]>([]);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  const {
    data: publishWindow,
    loading: publishWindowLoading,
    error: publishWindowError,
    remainingSeconds,
    publishAllowed,
    refresh: refreshPublishWindow,
  } = usePublishWindow({ assessment: 'ssa1', subjectCode: subjectId, teachingAssignmentId });

  const globalLocked = Boolean(publishWindow?.global_override_active && publishWindow?.global_is_open === false);

  const [requestReason, setRequestReason] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const visibleBtlIndices = useMemo(() => {
    const set = new Set(selectedBtls);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [selectedBtls]);

  const totalTableCols = useMemo(() => {
    // Layout matching the Excel header template, but BTL columns are dynamic.
    // S.No, RegNo, Name, SSA1, Total = 5
    // CO Attainment (CO-1 Mark/% + CO-2 Mark/%) = 4
    // BTL Attainment = selected count * 2 (Mark/% per BTL)
    return 9 + visibleBtlIndices.length * 2;
  }, [visibleBtlIndices.length]);

  // Persist selected BTLs to localStorage and autosave to server (debounced)
  useEffect(() => {
    if (!subjectId) return;
    try {
      const sk = `ssa1_selected_btls_${subjectId}`;
      lsSet(sk, selectedBtls);
    } catch {}

    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const payload: Ssa1DraftPayload = { sheet, selectedBtls };
        await saveDraft('ssa1', subjectId, payload);
        try {
          if (key) lsSet(key, { termLabel: sheet.termLabel, batchLabel: sheet.batchLabel, rows: sheet.rows });
        } catch {}
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore autosave errors
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [selectedBtls, subjectId, sheet]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<Ssa1Sheet>(key);
    if (stored && typeof stored === 'object' && Array.isArray((stored as any).rows)) {
      setSheet({
        termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
        batchLabel: subjectId,
        rows: (stored as any).rows,
      });
    } else {
      setSheet({ termLabel: masterTermLabel || 'KRCT AY25-26', batchLabel: subjectId, rows: [] });
    }
  }, [key, subjectId, masterCfg, masterTermLabel]);

  // Load draft from DB (preferred) and merge into local state.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Ssa1DraftPayload>('ssa1', subjectId);
        if (!mounted) return;
        const d = res?.draft;
        const draftSheet = (d as any)?.sheet;
        const draftBtls = (d as any)?.selectedBtls;
        if (draftSheet && typeof draftSheet === 'object' && Array.isArray((draftSheet as any).rows)) {
          setSheet({
            termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
            batchLabel: subjectId,
            rows: (draftSheet as any).rows,
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
          // Persist server draft into localStorage so roster merge will pick it up
          try {
            if (key) lsSet(key, { termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'), batchLabel: subjectId, rows: (draftSheet as any).rows });
          } catch {
            // ignore localStorage errors
          }
        }
        if (Array.isArray(draftBtls)) {
          setSelectedBtls(draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
          try {
            const sk = `ssa1_selected_btls_${subjectId}`;
            lsSet(sk, draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)));
          } catch {
            // ignore
          }
        }
      } catch {
        // If draft fetch fails, keep local fallback.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, masterTermLabel]);


  const mergeRosterIntoRows = (students: TeachingAssignmentRosterStudent[]) => {
    setSheet((prev) => {
      const existingById = new Map<number, Ssa1Row>();
      const existingByReg = new Map<string, Ssa1Row>();
      for (const r of prev.rows || []) {
        if (typeof (r as any).studentId === 'number') existingById.set((r as any).studentId, r as any);
        if (r.registerNo) existingByReg.set(String(r.registerNo), r);
      }

      const nextRows: Ssa1Row[] = (students || [])
        .slice()
        .sort(compareStudentName)
        .map((s) => {
          const prevRow = existingById.get(s.id) || existingByReg.get(String(s.reg_no || ''));
          return {
            studentId: s.id,
            section: String(s.section || ''),
            registerNo: String(s.reg_no || ''),
            name: String(s.name || ''),
            total:
              typeof (prevRow as any)?.total === 'number'
                ? clamp(Number((prevRow as any).total), 0, MAX_ASMT1)
                : (prevRow as any)?.total === ''
                  ? ''
                  : '',
          };
        });

      return { ...prev, rows: nextRows };
    });
  };

  const loadRoster = async () => {
    if (!teachingAssignmentId) {
      setRosterError('Select a Teaching Assignment/Section to load students.');
      return;
    }
    setRosterLoading(true);
    setRosterError(null);
    try {
      const res = await fetchTeachingAssignmentRoster(teachingAssignmentId);
      mergeRosterIntoRows(res.students || []);
    } catch (e: any) {
      setRosterError(e?.message || 'Failed to load roster');
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    // When section changes, refresh roster but preserve existing marks.
    if (!teachingAssignmentId) return;
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingAssignmentId]);

  const saveDraftToDb = async () => {
    setSavingDraft(true);
    setSaveError(null);
    try {
      const payload: Ssa1DraftPayload = { sheet, selectedBtls };
      await saveDraft('ssa1', subjectId, payload);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save SSA1 draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setSaveError(null);
    try {
      await publishSsa1(subjectId, sheet, teachingAssignmentId);
      setPublishedAt(new Date().toLocaleString());
      refreshPublishWindow();
        try {
          console.debug('obe:published dispatch', { assessment: assessmentKey, subjectId });
          window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId, assessment: assessmentKey } }));
        } catch {
          // ignore
        }
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to publish SSA1');
    } finally {
      setPublishing(false);
    }
  };

  const requestApproval = async () => {
    setRequesting(true);
    setRequestMessage(null);
    setSaveError(null);
    try {
      await createPublishRequest({ assessment: 'ssa1', subject_code: subjectId, reason: requestReason, teaching_assignment_id: teachingAssignmentId });
      setRequestMessage('Request sent to IQAC for approval.');
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to request approval');
    } finally {
      setRequesting(false);
      refreshPublishWindow();
    }
  };

  const resetAllMarks = () => {
    if (!confirm('Reset SSA1 marks for all students in this section?')) return;
    setSheet((prev) => ({
      ...prev,
      rows: (prev.rows || []).map((r) => ({ ...r, total: '' })),
    }));
  };

  const updateRow = (idx: number, patch: Partial<Ssa1Row>) => {
    setSheet((prev) => {
      const copy = prev.rows.slice();
      const existing = copy[idx] || ({ studentId: 0, section: '', registerNo: '', name: '', total: '' } as Ssa1Row);
      copy[idx] = { ...existing, ...patch };
      return { ...prev, rows: copy };
    });
  };

  const exportSheetCsv = () => {
    const out = sheet.rows.map((r, i) => {
      const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT1) : null;
      const total = totalRaw == null ? '' : round1(totalRaw);

      const coSplitCount = 2;
      const coShare = totalRaw == null ? null : round1(totalRaw / coSplitCount);
      const co1 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co1);
      const co2 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co2);

      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
      const rawBtlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
      const btlMaxByIndex = rawBtlMaxByIndex.map((rawMax, idx) => {
        if (!visibleIndicesZeroBased.includes(idx)) return rawMax;
        return rawMax > 0 ? rawMax : DEFAULT_BTL_MAX_WHEN_VISIBLE;
      });
      const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
      const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
        if (totalRaw == null) return null;
        if (!visibleIndicesZeroBased.includes(idx)) return null;
        if (max > 0) return clamp(btlShare as number, 0, max);
        return round1(btlShare as number);
      });

      return {
        sno: i + 1,
        registerNo: r.registerNo,
        name: r.name,
        total,
        co1_mark: co1 ?? '',
        co1_pct: pct(co1, CO_MAX.co1),
        co2_mark: co2 ?? '',
        co2_pct: pct(co2, CO_MAX.co2),
        btl1_mark: btlMarksByIndex[0] ?? '',
        btl1_pct: pct(btlMarksByIndex[0], btlMaxByIndex[0]),
        btl2_mark: btlMarksByIndex[1] ?? '',
        btl2_pct: pct(btlMarksByIndex[1], btlMaxByIndex[1]),
        btl3_mark: btlMarksByIndex[2] ?? '',
        btl3_pct: pct(btlMarksByIndex[2], btlMaxByIndex[2]),
        btl4_mark: btlMarksByIndex[3] ?? '',
        btl4_pct: pct(btlMarksByIndex[3], btlMaxByIndex[3]),
        btl5_mark: btlMarksByIndex[4] ?? '',
        btl5_pct: pct(btlMarksByIndex[4], btlMaxByIndex[4]),
        btl6_mark: btlMarksByIndex[5] ?? '',
        btl6_pct: pct(btlMarksByIndex[5], btlMaxByIndex[5]),
      };
    });

    downloadCsv(`${subjectId}_SSA1_sheet.csv`, out);
  };

  const cellTh: React.CSSProperties = {
    border: '1px solid #111',
    padding: '6px 6px',
    background: '#ecfdf5',
    color: '#065f46',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 12,
    whiteSpace: 'nowrap',
  };

  const cellTd: React.CSSProperties = {
    border: '1px solid #111',
    padding: '6px 6px',
    fontSize: 12,
    whiteSpace: 'nowrap',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 12,
  };

  const btlBoxStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 999,
    background: '#fff',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 12,
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 12,
    background: '#fff',
  };

  const toggleBtl = (n: number) => {
    setSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : prev.concat(n).sort((a, b) => a - b)));
  };

  const selectAllBtl = () => setSelectedBtls([1, 2, 3, 4, 5, 6]);
  const clearAllBtl = () => setSelectedBtls([]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadRoster} className="obe-btn obe-btn-secondary" disabled={rosterLoading}>
            {rosterLoading ? 'Loading roster…' : 'Load/Refresh Roster'}
          </button>
          <button onClick={resetAllMarks} className="obe-btn obe-btn-danger" disabled={!sheet.rows.length}>
            Reset Marks
          </button>
          <button onClick={exportSheetCsv} className="obe-btn obe-btn-secondary" disabled={!sheet.rows.length}>
            Export CSV
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={saveDraftToDb} className="obe-btn obe-btn-success" disabled={savingDraft}>
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={publish} className="obe-btn obe-btn-primary" disabled={publishing || !publishAllowed}>
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: publishAllowed ? '#065f46' : '#b91c1c' }}>
        {publishWindowLoading ? (
          'Checking publish due time…'
        ) : publishWindowError ? (
          publishWindowError
        ) : publishWindow?.due_at ? (
          <>
            Due: {new Date(publishWindow.due_at).toLocaleString()} • Remaining: {formatRemaining(remainingSeconds)}
            {publishWindow.allowed_by_approval && publishWindow.approval_until ? (
              <> • Approved until {new Date(publishWindow.approval_until).toLocaleString()}</>
            ) : null}
          </>
        ) : (
          'Due time not set by IQAC.'
        )}
      </div>

      {globalLocked ? (
        <div style={{ marginTop: 10, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Publishing disabled by IQAC</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Global publishing is turned OFF for this assessment. You can view the sheet, but editing and publishing are locked.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="obe-btn" onClick={() => refreshPublishWindow()} disabled={publishWindowLoading}>Refresh</button>
          </div>
        </div>
      ) : !publishAllowed ? (
        <div style={{ marginTop: 10, border: '1px solid #fecaca', background: '#fff7ed', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Publish time is over</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Send a request to IQAC to approve publishing.</div>
          <textarea
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={3}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="obe-btn" onClick={() => refreshPublishWindow()} disabled={requesting || publishWindowLoading}>Refresh</button>
            <button className="obe-btn obe-btn-primary" onClick={requestApproval} disabled={requesting}>{requesting ? 'Requesting…' : 'Request Approval'}</button>
          </div>
          {requestMessage ? <div style={{ marginTop: 8, fontSize: 12, color: '#065f46' }}>{requestMessage}</div> : null}
        </div>
      ) : null}

      {(rosterError || saveError) && (
        <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>
          {rosterError || saveError}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Term</div>
          <div style={{ fontWeight: 700 }}>{sheet.termLabel || '—'}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Batch</div>
          <div style={{ fontWeight: 700 }}>{sheet.batchLabel || '—'}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Saved</div>
          <div style={{ fontWeight: 700 }}>{savedAt || '—'}</div>
          {savedBy ? <div style={{ fontSize: 12, color: '#6b7280' }}>by <span style={{ color: '#0369a1', fontWeight: 700 }}>{savedBy}</span></div> : null}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Published</div>
          <div style={{ fontWeight: 700 }}>{publishedAt || '—'}</div>
        </div>
      </div>

      <div style={{ marginTop: 14, ...cardStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800 }}>BTL Selection</div>
          <button className="obe-btn obe-btn-secondary" onClick={() => setBtlPickerOpen((p) => !p)}>
            {btlPickerOpen ? 'Hide' : 'Show'}
          </button>
        </div>
        {btlPickerOpen && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const active = selectedBtls.includes(n);
              return (
                <div
                  key={n}
                  style={{
                    ...btlBoxStyle,
                    borderColor: active ? '#16a34a' : '#cbd5e1',
                    background: active ? '#ecfdf5' : '#fff',
                  }}
                  onClick={() =>
                    setSelectedBtls((prev) =>
                      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b),
                    )
                  }
                >
                  <input type="checkbox" checked={active} readOnly />
                  <span style={{ fontWeight: 800 }}>BTL{n}</span>
                  <span style={{ color: '#6b7280' }}>(max {String((BTL_MAX as any)[`btl${n}`] ?? 0)})</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <PublishLockOverlay locked={globalLocked}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 920 }}>
          <thead>
            <tr>
              <th style={cellTh} colSpan={totalTableCols}>
                {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; SSA1
              </th>
            </tr>
            <tr>
              <th style={{ ...cellTh, width: 42, minWidth: 42 }} rowSpan={4}>S.No</th>
              <th style={cellTh} rowSpan={4}>Register No.</th>
              <th style={cellTh} rowSpan={3}>Name of the Students</th>

              <th style={cellTh}>SSA1</th>
              <th style={cellTh}>Total</th>

              <th style={cellTh} colSpan={4}>CO ATTAINMENT</th>
              {visibleBtlIndices.length ? (
                <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>BTL ATTAINMENT</th>
              ) : null}
            </tr>
            <tr>
              <th style={cellTh}>
                <div style={{ fontWeight: 800 }}>COs</div>
                <div style={{ fontSize: 12 }}>1,2</div>
              </th>
              <th style={cellTh} />

              <th style={cellTh} colSpan={2}>CO-1</th>
              <th style={cellTh} colSpan={2}>CO-2</th>

              {visibleBtlIndices.map((n) => (
                <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                  BTL-{n}
                </th>
              ))}
            </tr>
            <tr>
              <th style={cellTh}>
                <div style={{ fontWeight: 800 }}>BTL</div>
                <div style={{ fontSize: 12 }}>{visibleBtlIndices.length ? visibleBtlIndices.join(',') : '-'}</div>
              </th>
              <th style={cellTh} />

              {Array.from({ length: 2 + visibleBtlIndices.length }).flatMap((_, i) => (
                <React.Fragment key={i}>
                  <th style={cellTh}>Mark</th>
                  <th style={cellTh}>%</th>
                </React.Fragment>
              ))}
            </tr>
            <tr>
              <th style={cellTh}>Name / Max Marks</th>
              <th style={cellTh}>{MAX_ASMT1}</th>
              <th style={cellTh}>{MAX_ASMT1}</th>
              <th style={cellTh}>{CO_MAX.co1}</th>
              <th style={cellTh}>%</th>
              <th style={cellTh}>{CO_MAX.co2}</th>
              <th style={cellTh}>%</th>
              {visibleBtlIndices.flatMap((n) => [
                <th key={`btl-max-${n}`} style={cellTh}>
                  {String(displayBtlMax((BTL_MAX as any)[`btl${n}`]))}
                </th>,
                <th key={`btl-pct-${n}`} style={cellTh}>%</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 ? (
              <tr>
                <td colSpan={totalTableCols} style={{ padding: 14, color: '#6b7280', fontSize: 13 }}>
                  No students loaded yet. Choose a Teaching Assignment above, then click “Load/Refresh Roster”.
                </td>
              </tr>
            ) : (
              sheet.rows.map((r, idx) => {
                const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT1) : null;

                const coShare = totalRaw == null ? null : round1(totalRaw / 2);
                const co1 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co1);
                const co2 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co2);

                const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                const rawBtlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
                const btlMaxByIndex = rawBtlMaxByIndex.map((rawMax, idx) => {
                  if (!visibleIndicesZeroBased.includes(idx)) return rawMax;
                  return rawMax > 0 ? rawMax : DEFAULT_BTL_MAX_WHEN_VISIBLE;
                });
                const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
                const btlMarksByIndex = btlMaxByIndex.map((max, i) => {
                  if (totalRaw == null) return null;
                  if (!visibleIndicesZeroBased.includes(i)) return null;
                  if (max > 0) return clamp(btlShare as number, 0, max);
                  return round1(btlShare as number);
                });

                return (
                  <tr key={String(r.studentId || idx)}>
                    <td style={{ ...cellTd, textAlign: 'center', width: 42, minWidth: 42, paddingLeft: 2, paddingRight: 2 }}>{idx + 1}</td>
                    <td style={cellTd}>{shortenRegisterNo(r.registerNo)}</td>
                    <td style={cellTd}>{r.name}</td>
                    <td style={{ ...cellTd, width: 90, background: '#fff7ed' }}>
                      <input
                        style={inputStyle}
                        type="number"
                        value={r.total}
                        min={0}
                        max={MAX_ASMT1}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') return updateRow(idx, { total: '' });
                          const n = clamp(Number(raw), 0, MAX_ASMT1);
                          updateRow(idx, { total: Number.isFinite(n) ? n : '' });
                        }}
                      />
                    </td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{totalRaw ?? ''}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{co1 ?? ''}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{pct(co1, CO_MAX.co1)}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{co2 ?? ''}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{pct(co2, CO_MAX.co2)}</td>

                    {visibleBtlIndices.map((btl) => {
                      const idx0 = btl - 1;
                      const mark = btlMarksByIndex[idx0];
                      const max = btlMaxByIndex[idx0];
                      return (
                        <React.Fragment key={btl}>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{mark ?? ''}</td>
                          <td style={{ ...cellTd, textAlign: 'right' }}>{pct(mark, max)}</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
            </table>
          </div>
        </PublishLockOverlay>
      </div>
    </div>
  );
}
