import React, { useEffect, useMemo, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchDraft, publishSsa2, saveDraft } from '../services/obe';

type Props = { subjectId: string; teachingAssignmentId?: number };

type Ssa2Row = {
  studentId: number;
  section: string;
  registerNo: string;
  name: string;
  total: number | '';
};

type Ssa2Sheet = {
  termLabel: string;
  batchLabel: string;
  rows: Ssa2Row[];
};

type Ssa2DraftPayload = {
  sheet: Ssa2Sheet;
  selectedBtls: number[];
};

const DEFAULT_MAX_ASMT2 = 20;
const DEFAULT_CO_MAX = { co3: 10, co4: 10 };
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
  return `ssa2_sheet_${subjectId}`;
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
    return an ? -1 : 1;
  }

  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  const byReg = ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
  if (byReg) return byReg;
  return 0;
}

export default function Ssa2Entry({ subjectId, teachingAssignmentId }: Props) {
  const key = useMemo(() => storageKey(subjectId), [subjectId]);
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [sheet, setSheet] = useState<Ssa2Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    rows: [],
  });

  const masterTermLabel = String(masterCfg?.termLabel || 'KRCT AY25-26');
  const ssa2Cfg = masterCfg?.assessments?.ssa2 || {};
  const MAX_ASMT2 = Number.isFinite(Number(ssa2Cfg?.maxTotal)) ? Number(ssa2Cfg.maxTotal) : DEFAULT_MAX_ASMT2;
  const CO_MAX = {
    // Prefer explicit CO3/CO4 config; fall back to legacy CO1/CO2 keys.
    co3: Number.isFinite(Number(ssa2Cfg?.coMax?.co3))
      ? Number(ssa2Cfg.coMax.co3)
      : Number.isFinite(Number(ssa2Cfg?.coMax?.co1))
        ? Number(ssa2Cfg.coMax.co1)
        : DEFAULT_CO_MAX.co3,
    co4: Number.isFinite(Number(ssa2Cfg?.coMax?.co4))
      ? Number(ssa2Cfg.coMax.co4)
      : Number.isFinite(Number(ssa2Cfg?.coMax?.co2))
        ? Number(ssa2Cfg.coMax.co2)
        : DEFAULT_CO_MAX.co4,
  };
  const BTL_MAX = {
    btl1: Number.isFinite(Number(ssa2Cfg?.btlMax?.['1'])) ? Number(ssa2Cfg.btlMax['1']) : DEFAULT_BTL_MAX.btl1,
    btl2: Number.isFinite(Number(ssa2Cfg?.btlMax?.['2'])) ? Number(ssa2Cfg.btlMax['2']) : DEFAULT_BTL_MAX.btl2,
    btl3: Number.isFinite(Number(ssa2Cfg?.btlMax?.['3'])) ? Number(ssa2Cfg.btlMax['3']) : DEFAULT_BTL_MAX.btl3,
    btl4: Number.isFinite(Number(ssa2Cfg?.btlMax?.['4'])) ? Number(ssa2Cfg.btlMax['4']) : DEFAULT_BTL_MAX.btl4,
    btl5: Number.isFinite(Number(ssa2Cfg?.btlMax?.['5'])) ? Number(ssa2Cfg.btlMax['5']) : DEFAULT_BTL_MAX.btl5,
    btl6: Number.isFinite(Number(ssa2Cfg?.btlMax?.['6'])) ? Number(ssa2Cfg.btlMax['6']) : DEFAULT_BTL_MAX.btl6,
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        setSheet((p) => ({
          ...p,
          termLabel: String((cfg as any)?.termLabel || p.termLabel || 'KRCT AY25-26'),
          batchLabel: subjectId,
        }));
      } catch {
        // ignore
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
    return 9 + visibleBtlIndices.length * 2;
  }, [visibleBtlIndices.length]);

  useEffect(() => {
    if (!subjectId) return;
    try {
      const sk = `ssa2_selected_btls_${subjectId}`;
      lsSet(sk, selectedBtls);
    } catch {}

    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const payload: Ssa2DraftPayload = { sheet, selectedBtls };
        await saveDraft('ssa2', subjectId, payload);
        try {
          if (key) lsSet(key, { termLabel: sheet.termLabel, batchLabel: sheet.batchLabel, rows: sheet.rows });
        } catch {}
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [selectedBtls, subjectId, sheet, key]);

  useEffect(() => {
    if (!subjectId) return;
    const stored = lsGet<Ssa2Sheet>(key);
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Ssa2DraftPayload>('ssa2', subjectId);
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
          try {
            if (key)
              lsSet(key, {
                termLabel: String((draftSheet as any).termLabel || masterTermLabel || 'KRCT AY25-26'),
                batchLabel: subjectId,
                rows: (draftSheet as any).rows,
              });
          } catch {
            // ignore
          }
        }
        if (Array.isArray(draftBtls)) {
          const next = draftBtls.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
          setSelectedBtls(next);
          try {
            const sk = `ssa2_selected_btls_${subjectId}`;
            lsSet(sk, next);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId, masterTermLabel, key]);

  const mergeRosterIntoRows = (students: TeachingAssignmentRosterStudent[]) => {
    setSheet((prev) => {
      const existingById = new Map<number, Ssa2Row>();
      const existingByReg = new Map<string, Ssa2Row>();
      for (const r of prev.rows || []) {
        if (typeof (r as any).studentId === 'number') existingById.set((r as any).studentId, r as any);
        if (r.registerNo) existingByReg.set(String(r.registerNo), r);
      }

      const nextRows: Ssa2Row[] = (students || [])
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
                ? clamp(Number((prevRow as any).total), 0, MAX_ASMT2)
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
    if (!teachingAssignmentId) return;
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingAssignmentId]);

  const saveDraftToDb = async () => {
    setSavingDraft(true);
    setSaveError(null);
    try {
      const payload: Ssa2DraftPayload = { sheet, selectedBtls };
      await saveDraft('ssa2', subjectId, payload);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save SSA2 draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setSaveError(null);
    try {
      await publishSsa2(subjectId, sheet);
      setPublishedAt(new Date().toLocaleString());
      try {
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to publish SSA2');
    } finally {
      setPublishing(false);
    }
  };

  const resetAllMarks = () => {
    if (!confirm('Reset SSA2 marks for all students in this section?')) return;
    setSheet((prev) => ({
      ...prev,
      rows: (prev.rows || []).map((r) => ({ ...r, total: '' })),
    }));
  };

  const updateRow = (idx: number, patch: Partial<Ssa2Row>) => {
    setSheet((prev) => {
      const copy = prev.rows.slice();
      const existing = copy[idx] || ({ studentId: 0, section: '', registerNo: '', name: '', total: '' } as Ssa2Row);
      copy[idx] = { ...existing, ...patch };
      return { ...prev, rows: copy };
    });
  };

  const exportSheetCsv = () => {
    const out = sheet.rows.map((r, i) => {
      const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT2) : null;
      const total = totalRaw == null ? '' : round1(totalRaw);

      const coSplitCount = 2;
      const coShare = totalRaw == null ? null : round1(totalRaw / coSplitCount);
      const co3 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co3);
      const co4 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co4);

      const btlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
      const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
      const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
      const btlMarksByIndex = btlMaxByIndex.map((max, idx) => {
        if (totalRaw == null) return null;
        if (!visibleIndicesZeroBased.includes(idx)) return null;
        if (max > 0) return clamp(btlShare as number, 0, max);
        return round1(btlShare as number);
      });

      return {
        sno: i + 1,
        section: r.section,
        registerNo: r.registerNo,
        name: r.name,
        total,
        co3_mark: co3 ?? '',
        co3_pct: pct(co3, CO_MAX.co3),
        co4_mark: co4 ?? '',
        co4_pct: pct(co4, CO_MAX.co4),
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

    downloadCsv(`${subjectId}_SSA2_sheet.csv`, out);
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
          <button onClick={publish} className="obe-btn obe-btn-primary" disabled={publishing}>
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

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

      <div style={{ marginTop: 14, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 920 }}>
          <thead>
            <tr>
              <th style={cellTh}>S.No</th>
              <th style={cellTh}>Section</th>
              <th style={cellTh}>RegNo</th>
              <th style={cellTh}>Name</th>
              <th style={cellTh}>Total</th>
              <th style={cellTh}>CO3</th>
              <th style={cellTh}>CO3%</th>
              <th style={cellTh}>CO4</th>
              <th style={cellTh}>CO4%</th>
              {visibleBtlIndices.map((btl) => (
                <React.Fragment key={btl}>
                  <th style={cellTh}>BTL{btl}</th>
                  <th style={cellTh}>BTL{btl}%</th>
                </React.Fragment>
              ))}
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
                const totalRaw = typeof r.total === 'number' ? clamp(Number(r.total), 0, MAX_ASMT2) : null;

                const coShare = totalRaw == null ? null : round1(totalRaw / 2);
                const co3 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co3);
                const co4 = coShare == null ? null : clamp(coShare, 0, CO_MAX.co4);

                const btlMaxByIndex = [BTL_MAX.btl1, BTL_MAX.btl2, BTL_MAX.btl3, BTL_MAX.btl4, BTL_MAX.btl5, BTL_MAX.btl6];
                const visibleIndicesZeroBased = visibleBtlIndices.map((n) => n - 1);
                const btlShare = totalRaw == null ? null : visibleIndicesZeroBased.length ? round1(totalRaw / visibleIndicesZeroBased.length) : 0;
                const btlMarksByIndex = btlMaxByIndex.map((max, i) => {
                  if (totalRaw == null) return null;
                  if (!visibleIndicesZeroBased.includes(i)) return null;
                  if (max > 0) return clamp(btlShare as number, 0, max);
                  return round1(btlShare as number);
                });

                return (
                  <tr key={String(r.studentId || idx)}>
                    <td style={cellTd}>{idx + 1}</td>
                    <td style={cellTd}>{r.section}</td>
                    <td style={cellTd}>{r.registerNo}</td>
                    <td style={cellTd}>{r.name}</td>
                    <td style={{ ...cellTd, width: 90, background: '#fff7ed' }}>
                      <input
                        style={inputStyle}
                        type="number"
                        value={r.total}
                        min={0}
                        max={MAX_ASMT2}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') return updateRow(idx, { total: '' });
                          const n = clamp(Number(raw), 0, MAX_ASMT2);
                          updateRow(idx, { total: Number.isFinite(n) ? n : '' });
                        }}
                      />
                    </td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{co3 ?? ''}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{pct(co3, CO_MAX.co3)}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{co4 ?? ''}</td>
                    <td style={{ ...cellTd, textAlign: 'right' }}>{pct(co4, CO_MAX.co4)}</td>

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
    </div>
  );
}
