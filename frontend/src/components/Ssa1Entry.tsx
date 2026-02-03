import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchDraft, publishSsa1, saveDraft } from '../services/obe';

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function pct(mark: number | null, max: number) {
  if (mark == null) return '';
  if (!max) return '-';
  const p = (mark / max) * 100;
  return `${Number.isFinite(p) ? p.toFixed(0) : 0}`;
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
    btl1: Number.isFinite(Number(ssa1Cfg?.btlMax?.['1'])) ? Number(ssa1Cfg.btlMax['1']) : DEFAULT_BTL_MAX.btl1,
    btl2: Number.isFinite(Number(ssa1Cfg?.btlMax?.['2'])) ? Number(ssa1Cfg.btlMax['2']) : DEFAULT_BTL_MAX.btl2,
    btl3: Number.isFinite(Number(ssa1Cfg?.btlMax?.['3'])) ? Number(ssa1Cfg.btlMax['3']) : DEFAULT_BTL_MAX.btl3,
    btl4: Number.isFinite(Number(ssa1Cfg?.btlMax?.['4'])) ? Number(ssa1Cfg.btlMax['4']) : DEFAULT_BTL_MAX.btl4,
    btl5: Number.isFinite(Number(ssa1Cfg?.btlMax?.['5'])) ? Number(ssa1Cfg.btlMax['5']) : DEFAULT_BTL_MAX.btl5,
    btl6: Number.isFinite(Number(ssa1Cfg?.btlMax?.['6'])) ? Number(ssa1Cfg.btlMax['6']) : DEFAULT_BTL_MAX.btl6,
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
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  const visibleBtlIndices = useMemo(() => {
    const set = new Set(selectedBtls);
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [selectedBtls]);

  const totalTableCols = useMemo(() => {
    // Base columns (S.No, Section, RegNo, Name, Total) = 5
    // CO columns (CO1 mark/% + CO2 mark/%) = 4
    // BTL columns = selected count * 2 (mark/% per BTL)
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
      await publishSsa1(subjectId, sheet);
      setPublishedAt(new Date().toLocaleString());
      try {
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to publish SSA1');
    } finally {
      setPublishing(false);
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

      const btlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
      const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
      const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
        if (totalRaw == null) return null;
        if (!visibleIndicesZeroBased.includes(idx)) return null;
        // If BTL has a configured max (>0) clamp to it, otherwise assign the share directly
        if (max > 0) return clamp(btlShare as number, 0, max);
        return round1(btlShare as number);
      });

      return {
        sno: i + 1,
        section: r.section,
        registerNo: r.registerNo,
        name: r.name,
        total,
        co1_mark: co1 ?? '',
        co1_pct: pct(co1, CO_MAX.co1),
        co2_mark: co2 ?? '',
        co2_pct: pct(co2, CO_MAX.co2),
        btl1_mark: btlMarksByIndex[0] ?? '',
        btl1_pct: pct(btlMarksByIndex[0], BTL_MAX.btl1),
        btl2_mark: btlMarksByIndex[1] ?? '',
        btl2_pct: pct(btlMarksByIndex[1], BTL_MAX.btl2),
        btl3_mark: btlMarksByIndex[2] ?? '',
        btl3_pct: pct(btlMarksByIndex[2], BTL_MAX.btl3),
        btl4_mark: btlMarksByIndex[3] ?? '',
        btl4_pct: pct(btlMarksByIndex[3], BTL_MAX.btl4),
        btl5_mark: btlMarksByIndex[4] ?? '',
        btl5_pct: pct(btlMarksByIndex[4], BTL_MAX.btl5),
        btl6_mark: btlMarksByIndex[5] ?? '',
        btl6_pct: pct(btlMarksByIndex[5], BTL_MAX.btl6),
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

  // Sticky left columns (freeze on horizontal scroll)
  const STICKY = {
    sno: { left: 0, width: 60 },
    section: { left: 60, width: 100 },
    reg: { left: 160, width: 140 },
    name: { left: 300, width: 260 },
  } as const;

  const toggleBtl = (n: number) => {
    setSelectedBtls((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : prev.concat(n).sort((a, b) => a - b)));
  };

  const selectAllBtl = () => setSelectedBtls([1, 2, 3, 4, 5, 6]);
  const clearAllBtl = () => setSelectedBtls([]);

  return (
    <div>
      <div className="obe-card"
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>SSA1 Sheet</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Excel-like layout (CO + BTL attainment). Subject: <b>{subjectId}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setBtlPickerOpen((v) => !v)} style={{ padding: '6px 10px' }}>
            BTL Columns
          </button>
          <button
            onClick={loadRoster}
            style={{ padding: '6px 10px' }}
            disabled={rosterLoading || !teachingAssignmentId}
            title={!teachingAssignmentId ? 'Select a Teaching Assignment/Section first' : 'Reload students from roster'}
          >
            {rosterLoading ? 'Loading…' : 'Reload Students'}
          </button>
          <button
            onClick={resetAllMarks}
            style={{ padding: '6px 10px' }}
            disabled={!sheet.rows.length}
            title={!sheet.rows.length ? 'No students loaded' : 'Reset all marks to 0'}
          >
            Reset Marks
          </button>
          <button onClick={saveDraftToDb} className="obe-btn" disabled={savingDraft || !sheet.rows.length}>
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={publish}
            disabled={publishing || !sheet.rows.length}
            className="obe-btn obe-btn-primary"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
          <button
            onClick={exportSheetCsv}
            style={{ padding: '6px 10px' }}
            disabled={!sheet.rows.length}
            title={!sheet.rows.length ? 'Add at least one row to export' : 'Export as CSV'}
          >
            Export CSV
          </button>
          {savedAt && <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>Draft: {savedAt}</div>}
          {publishedAt && <div style={{ fontSize: 12, color: '#16a34a', alignSelf: 'center' }}>Published: {publishedAt}</div>}
        </div>
      </div>

      {saveError && <div style={{ margin: '6px 0 10px 0', fontSize: 12, color: '#b91c1c' }}>{saveError}</div>}

      {btlPickerOpen && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 12,
            background: '#fff',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>BTL columns to show</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={selectAllBtl} style={{ padding: '4px 8px' }}>
                Select All
              </button>
              <button onClick={clearAllBtl} style={{ padding: '4px 8px' }}>
                Clear
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#111827' }}>
                <input type="checkbox" checked={selectedBtls.includes(n)} onChange={() => toggleBtl(n)} />
                BTL-{n}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
            Selected: {visibleBtlIndices.length ? visibleBtlIndices.map((n) => `BTL-${n}`).join(', ') : 'None'}
          </div>
        </div>
      )}

      {rosterError && (
        <div style={{ margin: '6px 0 10px 0', fontSize: 12, color: '#b91c1c' }}>{rosterError}</div>
      )}

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 12,
          background: '#fff',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#374151' }}>
            Term
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.termLabel}</div>
          </label>
          <label style={{ fontSize: 12, color: '#374151' }}>
            Sheet Label
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.batchLabel}</div>
          </label>
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            CO split: 10 + 10; BTL active: BTL-3, BTL-4
          </div>
        </div>
      </div>

      <div className="obe-table-wrapper" style={{ position: 'relative' }}>
        <table className="obe-table" style={{ minWidth: 1200 }}>
          <thead>
            <tr>
              <th style={cellTh} colSpan={totalTableCols}>
                {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; SSA1
              </th>
            </tr>
            <tr>
              <th
                style={{
                  ...cellTh,
                  position: 'sticky',
                  left: STICKY.sno.left,
                  minWidth: STICKY.sno.width,
                  zIndex: 5,
                }}
                rowSpan={3}
              >
                S.No
              </th>
              <th
                style={{
                  ...cellTh,
                  position: 'sticky',
                  left: STICKY.section.left,
                  minWidth: STICKY.section.width,
                  zIndex: 5,
                }}
                rowSpan={3}
              >
                SECTION
              </th>
              <th
                style={{
                  ...cellTh,
                  position: 'sticky',
                  left: STICKY.reg.left,
                  minWidth: STICKY.reg.width,
                  zIndex: 5,
                }}
                rowSpan={3}
              >
                Register No.
              </th>
              <th
                style={{
                  ...cellTh,
                  position: 'sticky',
                  left: STICKY.name.left,
                  minWidth: STICKY.name.width,
                  zIndex: 5,
                }}
                rowSpan={3}
              >
                Name of the Students
              </th>
              <th style={cellTh} rowSpan={3}>
                Total
              </th>
              <th style={cellTh} colSpan={4}>
                CO ATTAINMENT
              </th>
              {visibleBtlIndices.length > 0 && (
                <th style={cellTh} colSpan={visibleBtlIndices.length * 2}>
                  BTL ATTAINMENT
                </th>
              )}
            </tr>
            <tr>
              <th style={cellTh} colSpan={2}>
                CO-1
              </th>
              <th style={cellTh} colSpan={2}>
                CO-2
              </th>
              {visibleBtlIndices.map((n) => (
                <th key={n} style={cellTh} colSpan={2}>
                  BTL-{n}
                </th>
              ))}
            </tr>
            <tr>
              {Array.from({ length: 2 + visibleBtlIndices.length }).flatMap((_, i) => (
                <React.Fragment key={i}>
                  <th style={cellTh}>Mark</th>
                  <th style={{ ...cellTh, background: '#ecfdf5', color: '#065f46' }}>%</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={4}>
                Name / Max Marks
              </td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{MAX_ASMT1}</td>

              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{CO_MAX.co1}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{CO_MAX.co2}</td>
              <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>

              {visibleBtlIndices.map((n) => {
                const maxByIndex = [
                  BTL_MAX.btl1,
                  BTL_MAX.btl2,
                  BTL_MAX.btl3,
                  BTL_MAX.btl4,
                  BTL_MAX.btl5,
                  BTL_MAX.btl6,
                ];
                const max = maxByIndex[n - 1] ?? 0;
                return (
                  <React.Fragment key={n}>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{max}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                  </React.Fragment>
                );
              })}
            </tr>

            {sheet.rows.length === 0 ? (
              <tr>
                <td style={{ ...cellTd, textAlign: 'center', color: '#6b7280' }} colSpan={totalTableCols}>
                  No students loaded. Select a Teaching Assignment/Section above.
                </td>
              </tr>
            ) : (
              sheet.rows.map((r, i) => {
                const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT1) : null;
                const total = totalRaw == null ? '' : round1(totalRaw);

                const coSplitCount = 2;
                const coShare = totalRaw == null ? null : round1(totalRaw / coSplitCount);
                const co1 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co1);
                const co2 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co2);

                const btlMaxByIndex = [
                  BTL_MAX.btl1,
                  BTL_MAX.btl2,
                  BTL_MAX.btl3,
                  BTL_MAX.btl4,
                  BTL_MAX.btl5,
                  BTL_MAX.btl6,
                ];
                const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
                const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
                  if (totalRaw == null) return null;
                  if (!visibleIndicesZeroBased.includes(idx)) return null;
                  if (max > 0) return clamp(btlShare as number, 0, max);
                  return round1(btlShare as number);
                });

                return (
                  <tr key={i}>
                    <td style={{ ...cellTd, textAlign: 'center', position: 'sticky', left: STICKY.sno.left, minWidth: STICKY.sno.width, background: '#fff', zIndex: 4 }}>{i + 1}</td>
                    <td style={{ ...cellTd, color: '#111827', position: 'sticky', left: STICKY.section.left, minWidth: STICKY.section.width, background: '#fff', zIndex: 4 }}>{r.section}</td>
                    <td style={{ ...cellTd, color: '#111827', position: 'sticky', left: STICKY.reg.left, minWidth: STICKY.reg.width, background: '#fff', zIndex: 4 }}>{r.registerNo}</td>
                    <td style={{ ...cellTd, color: '#111827', position: 'sticky', left: STICKY.name.left, minWidth: STICKY.name.width, background: '#fff', zIndex: 4 }}>{r.name}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <input
                        className="obe-input"
                        style={{ textAlign: 'center' }}
                        type="number"
                        value={typeof r.total === 'number' ? r.total : ''}
                        min={0}
                        max={MAX_ASMT1}
                        step={0.1}
                        placeholder=""
                        disabled={selectedBtls.length === 0}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            updateRow(i, { total: '' });
                            return;
                          }
                          const n = clamp(Number(raw), 0, MAX_ASMT1);
                          updateRow(i, { total: Number.isFinite(n) ? round1(n) : '' });
                        }}
                      />
                    </td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1 == null ? '' : co1.toFixed(1)}</td>
                    <td style={{ ...cellTd, textAlign: 'center', background: 'linear-gradient(180deg,#ecfdf5,#ffffff)' }}>
                      <span className="obe-pct-badge">{pct(co1, CO_MAX.co1)}</span>
                    </td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2 == null ? '' : co2.toFixed(1)}</td>
                    <td style={{ ...cellTd, textAlign: 'center', background: 'linear-gradient(180deg,#ecfdf5,#ffffff)' }}>
                      <span className="obe-pct-badge">{pct(co2, CO_MAX.co2)}</span>
                    </td>

                    {visibleBtlIndices.map((n) => {
                      const mark = btlMarksByIndex[n - 1] ?? 0;
                      const max = btlMaxByIndex[n - 1] ?? 0;
                      return (
                        <React.Fragment key={n}>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{mark == null ? '' : Number(mark).toFixed(1)}</td>
                          <td style={{ ...cellTd, textAlign: 'center', background: 'linear-gradient(180deg,#ecfdf5,#ffffff)' }}>
                            <span className="obe-pct-badge">{pct(mark == null ? null : Number(mark), max)}</span>
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {selectedBtls.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(255,255,255,0.8)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>Pick BTL columns to enable editing</div>
            <div style={{ color: '#6b7280' }}>The table is disabled until at least one BTL column is selected.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setBtlPickerOpen(true)} style={{ padding: '6px 10px' }}>
                Choose BTL Columns
              </button>
              <button onClick={() => selectAllBtl()} style={{ padding: '6px 10px' }}>
                Select All
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
        Saved key: <span style={{ fontFamily: 'monospace' }}>{key}</span>
      </div>
    </div>
  );
}
