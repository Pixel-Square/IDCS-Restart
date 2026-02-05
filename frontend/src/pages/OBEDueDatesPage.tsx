import React, { useEffect, useMemo, useState } from 'react';

import fetchWithAuth from '../services/fetchAuth';
import {
  bulkUpsertDueSchedule,
  DueAssessmentKey,
  fetchDueScheduleSubjects,
  fetchDueSchedules,
  DueScheduleRow,
  upsertDueSchedule,
  fetchGlobalPublishControls,
  bulkSetGlobalPublishControls,
  bulkResetGlobalPublishControls,
} from '../services/obe';

type AcademicYear = {
  id: number;
  name: string;
  parity?: string | null;
  is_active?: boolean;
};

const ALL_ASSESSMENTS: Array<{ key: DueAssessmentKey; label: string }> = [
  { key: 'cia1', label: 'CIA1' },
  { key: 'cia2', label: 'CIA2' },
  { key: 'ssa1', label: 'SSA1' },
  { key: 'ssa2', label: 'SSA2' },
  { key: 'formative1', label: 'Formative1' },
  { key: 'formative2', label: 'Formative2' },
];

function toLocalDateInputValue(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

function combineDateTime(date: string, time: string): string | null {
  const dd = String(date || '').trim();
  const tt = String(time || '').trim();
  if (!dd || !tt) return null;
  // send ISO-like string; backend will make it aware in server tz
  return `${dd}T${tt}:00`;
}

function formatCountdown(seconds: number): string {
  const s = Math.abs(Math.floor(seconds));
  const dd = Math.floor(s / (24 * 3600));
  const hh = Math.floor((s % (24 * 3600)) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  if (dd > 0) return `${dd}d ${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m`;
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, '0')}m`;
  return `${mm}m`;
}

export default function OBEDueDatesPage(): JSX.Element {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAyIds, setSelectedAyIds] = useState<number[]>([]);
  const [selectedAssessments, setSelectedAssessments] = useState<DueAssessmentKey[]>(['cia1', 'ssa1']);

  const [subjectsByAy, setSubjectsByAy] = useState<Record<string, Array<{ subject_code: string; subject_name: string }>>>({});
  const [schedules, setSchedules] = useState<DueScheduleRow[]>([]);

  const [bulkDate, setBulkDate] = useState('');
  const [bulkTime, setBulkTime] = useState('');
  const [globalControls, setGlobalControls] = useState<Array<{ id: number; academic_year: { id: number; name: string } | null; assessment: string; is_open: boolean; updated_at: string | null; updated_by: number | null }>>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    // live countdown for loaded due schedules
    const tid = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(tid);
  }, []);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, DueScheduleRow>();
    for (const r of schedules || []) {
      map.set(`${r.academic_year?.id}|${r.subject_code}|${r.assessment}`, r);
    }
    return map;
  }, [schedules]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/academics/academic-years/');
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json?.results || []);
        if (!mounted) return;
        setAcademicYears((list || []).map((x: any) => ({
          id: Number(x.id),
          name: String(x.name || ''),
          parity: x.parity ?? null,
          is_active: Boolean(x.is_active),
        })).filter((x: AcademicYear) => Number.isFinite(x.id) && x.name));
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load academic years');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleAy = (id: number) => {
    setSelectedAyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAssessment = (key: DueAssessmentKey) => {
    setSelectedAssessments((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const reload = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      if (!selectedAyIds.length) {
        setSubjectsByAy({});
        setSchedules([]);
        setMessage('Select Academic Year(s) to load courses.');
        return;
      }
      const [subjectsResp, schedulesResp] = await Promise.all([
        fetchDueScheduleSubjects(selectedAyIds),
        fetchDueSchedules(selectedAyIds),
      ]);
      // also fetch global publish controls for UI
      try {
        const gc = await fetchGlobalPublishControls(selectedAyIds, selectedAssessments.map((x) => String(x)));
        setGlobalControls(gc.results || []);
      } catch (e) {
        setGlobalControls([]);
      }
      setSubjectsByAy(subjectsResp.subjects_by_academic_year || {});
      setSchedules(schedulesResp.results || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load due schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAyIds.join(',')]);

  const allRows = useMemo(() => {
    const out: Array<{ ayId: number; ayName: string; subject_code: string; subject_name: string }> = [];
    for (const ayKey of Object.keys(subjectsByAy || {})) {
      const ayId = Number(ayKey);
      const ayName = academicYears.find((a) => a.id === ayId)?.name || `AY ${ayKey}`;
      const list = subjectsByAy?.[ayKey] || [];
      for (const s of list) {
        out.push({ ayId, ayName, subject_code: s.subject_code, subject_name: s.subject_name });
      }
    }
    out.sort((a, b) => (a.ayId - b.ayId) || a.subject_code.localeCompare(b.subject_code));
    return out;
  }, [subjectsByAy, academicYears]);

  const applyBulk = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const dueAt = combineDateTime(bulkDate, bulkTime);
      if (!dueAt) throw new Error('Select bulk Due Date and Due Time');
      if (!selectedAyIds.length) throw new Error('Select at least one Academic Year');
      if (!selectedAssessments.length) throw new Error('Select at least one Exam/Assessment');

      const byAy: Record<number, string[]> = {};
      for (const row of allRows) {
        if (!selectedAyIds.includes(row.ayId)) continue;
        byAy[row.ayId] = byAy[row.ayId] || [];
        byAy[row.ayId].push(row.subject_code);
      }

      let updated = 0;
      for (const ayId of selectedAyIds) {
        const codes = Array.from(new Set(byAy[ayId] || [])).filter(Boolean);
        if (!codes.length) continue;
        const resp = await bulkUpsertDueSchedule({ academic_year_id: ayId, subject_codes: codes, assessments: selectedAssessments, due_at: dueAt });
        updated += Number(resp.updated || 0);
      }

      setMessage(`Saved bulk schedules (${updated} rows).`);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Bulk save failed');
    } finally {
      setLoading(false);
    }
  };

  const computeGlobalStatus = () => {
    if (!selectedAyIds.length || !selectedAssessments.length) return 'No selection';
    if (!globalControls || globalControls.length === 0) return 'No override';
    const allOpen = globalControls.every((g) => g.is_open === true);
    const allClosed = globalControls.every((g) => g.is_open === false);
    if (allOpen) return 'Global ON';
    if (allClosed) return 'Global OFF';
    return 'Mixed';
  };

  const setGlobal = async (isOpen: boolean) => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      if (!selectedAyIds.length) throw new Error('Select at least one Academic Year');
      if (!selectedAssessments.length) throw new Error('Select at least one Exam/Assessment');
      await bulkSetGlobalPublishControls({ academic_year_ids: selectedAyIds, assessments: selectedAssessments.map((x) => String(x)), is_open: isOpen });
      setMessage(`Global publish set to ${isOpen ? 'ON' : 'OFF'}`);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Global set failed');
    } finally {
      setLoading(false);
    }
  };

  const resetGlobal = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      if (!selectedAyIds.length) throw new Error('Select at least one Academic Year');
      if (!selectedAssessments.length) throw new Error('Select at least one Exam/Assessment');
      await bulkResetGlobalPublishControls({ academic_year_ids: selectedAyIds, assessments: selectedAssessments.map((x) => String(x)) });
      setMessage('Global overrides reset; using due dates');
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Global reset failed');
    } finally {
      setLoading(false);
    }
  };

  const saveCell = async (ayId: number, subjectCode: string, subjectName: string, assessment: DueAssessmentKey, date: string, time: string) => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const dueAt = combineDateTime(date, time);
      if (!dueAt) throw new Error('Select Due Date and Due Time');
      await upsertDueSchedule({ academic_year_id: ayId, subject_code: subjectCode, subject_name: subjectName, assessment, due_at: dueAt });
      setMessage(`Saved ${subjectCode} • ${assessment.toUpperCase()}`);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const [editing, setEditing] = useState<Record<string, { date: string; time: string }>>({});

  const getEditing = (ayId: number, subjectCode: string, assessment: DueAssessmentKey) => {
    const key = `${ayId}|${subjectCode}|${assessment}`;
    const existing = editing[key];
    if (existing) return existing;
    const row = scheduleMap.get(key);
    return toLocalDateInputValue(row?.due_at);
  };

  const setEditingCell = (ayId: number, subjectCode: string, assessment: DueAssessmentKey, patch: Partial<{ date: string; time: string }>) => {
    const key = `${ayId}|${subjectCode}|${assessment}`;
    setEditing((prev) => ({ ...prev, [key]: { ...getEditing(ayId, subjectCode, assessment), ...patch } }));
  };

  return (
    <main style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ padding: 18 }}>
        <div className="welcome" style={{ marginBottom: 14 }}>
          <div className="welcome-left">
            <div>
              <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>OBE Master — Due Dates</h2>
              <div className="welcome-sub">Set assessment due time by Academic Year + Course + Exam.</div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b98133', color: '#065f46', padding: 10, borderRadius: 10, marginBottom: 10 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Academic Years</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflow: 'auto', paddingRight: 6 }}>
              {academicYears.map((ay) => (
                <label key={ay.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={selectedAyIds.includes(ay.id)} onChange={() => toggleAy(ay.id)} />
                  <span style={{ fontWeight: 700 }}>{ay.name}</span>
                  {ay.parity ? <span style={{ color: '#6b7280' }}>({ay.parity})</span> : null}
                  {ay.is_active ? <span style={{ marginLeft: 'auto', fontSize: 12, color: '#16a34a', fontWeight: 700 }}>Active</span> : null}
                </label>
              ))}
            </div>

            <div style={{ height: 10 }} />

            <div style={{ fontWeight: 800, marginBottom: 8 }}>Exam / Assessment</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {ALL_ASSESSMENTS.map((a) => (
                <label key={a.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={selectedAssessments.includes(a.key)} onChange={() => toggleAssessment(a.key)} />
                  <span style={{ fontWeight: 700 }}>{a.label}</span>
                </label>
              ))}
            </div>

            <div style={{ height: 12 }} />

            <div style={{ fontWeight: 800, marginBottom: 8 }}>Bulk Apply</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: '#374151' }}>
                Due Date
                <input value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} type="date" style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 10, border: '1px solid #e5e7eb' }} />
              </label>
              <label style={{ fontSize: 12, color: '#374151' }}>
                Time
                <input value={bulkTime} onChange={(e) => setBulkTime(e.target.value)} type="time" style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 10, border: '1px solid #e5e7eb' }} />
              </label>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={applyBulk} disabled={loading} className="obe-btn obe-btn-primary">{loading ? 'Saving…' : 'Apply to all loaded courses'}</button>
              <button onClick={reload} disabled={loading} className="obe-btn">Refresh</button>
            </div>
            <div style={{ height: 12 }} />

            <div style={{ fontWeight: 800, marginBottom: 8 }}>Global Turn OFF / ON</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>{computeGlobalStatus()}</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => setGlobal(true)} disabled={loading} className="obe-btn" style={{ background: '#10b981', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800 }}>Turn ON</button>
                <button onClick={() => setGlobal(false)} disabled={loading} className="obe-btn" style={{ background: '#ef4444', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800 }}>Turn OFF</button>
                <button onClick={resetGlobal} disabled={loading} className="obe-btn">Reset</button>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              Tip: Select Academic Year(s), pick Exam(s), then apply due date/time.
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontWeight: 800 }}>Courses</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{allRows.length} courses loaded</div>
            </div>

            {!selectedAyIds.length ? (
              <div style={{ color: '#6b7280', padding: 10 }}>Select Academic Year(s) on the left.</div>
            ) : loading ? (
              <div style={{ color: '#6b7280', padding: 10 }}>Loading…</div>
            ) : allRows.length === 0 ? (
              <div style={{ color: '#6b7280', padding: 10 }}>No courses found for selected academic years.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="obe-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Academic Year</th>
                      <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Course</th>
                      {selectedAssessments.map((a) => (
                        <th key={a} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{a.toUpperCase()} Due</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.map((row) => (
                      <tr key={`${row.ayId}|${row.subject_code}`}>
                        <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', fontWeight: 700 }}>{row.ayName}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ fontWeight: 800 }}>{row.subject_code}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>{row.subject_name || '—'}</div>
                        </td>
                        {selectedAssessments.map((a) => {
                          const key = `${row.ayId}|${row.subject_code}|${a}`;
                          const current = scheduleMap.get(key);
                          const { date, time } = getEditing(row.ayId, row.subject_code, a);
                          const dueIso = current?.due_at || null;
                          let remainingLabel: string | null = null;
                          if (dueIso) {
                            const dueMs = new Date(dueIso).getTime();
                            const nowMs = nowTick;
                            if (Number.isFinite(dueMs)) {
                              const sec = Math.floor((dueMs - nowMs) / 1000);
                              remainingLabel = sec >= 0 ? `Remaining: ${formatCountdown(sec)}` : `Overdue: ${formatCountdown(sec)} ago`;
                            }
                          }
                          return (
                            <td key={key} style={{ padding: 8, borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                  type="date"
                                  value={date}
                                  onChange={(e) => setEditingCell(row.ayId, row.subject_code, a, { date: e.target.value })}
                                  style={{ padding: 6, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                />
                                <input
                                  type="time"
                                  value={time}
                                  onChange={(e) => setEditingCell(row.ayId, row.subject_code, a, { time: e.target.value })}
                                  style={{ padding: 6, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                />
                                <button
                                  className="obe-btn obe-btn-primary"
                                  disabled={loading}
                                  onClick={() => saveCell(row.ayId, row.subject_code, row.subject_name, a, date, time)}
                                >
                                  Save
                                </button>
                              </div>
                              <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                                Current: {current?.due_at ? new Date(current.due_at).toLocaleString() : '—'}
                                {remainingLabel ? <span style={{ marginLeft: 8, fontWeight: 700, color: remainingLabel.startsWith('Overdue') ? '#b91c1c' : '#065f46' }}>{remainingLabel}</span> : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
