import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bulkResetGlobalPublishControls,
  bulkSetGlobalPublishControls,
  bulkUpsertDueSchedule,
  DueAssessmentKey,
  fetchDueScheduleSubjects,
  fetchGlobalPublishControls,
  fetchObeSemesters,
} from '../services/obe';

type SemesterRow = { id: number; number: number | null };

const SEMESTER_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const ALL_ASSESSMENTS: Array<{ key: DueAssessmentKey; label: string }> = [
  { key: 'cia1', label: 'CIA1' },
  { key: 'cia2', label: 'CIA2' },
  { key: 'ssa1', label: 'SSA1' },
  { key: 'review1', label: 'REVIEW1' },
  { key: 'ssa2', label: 'SSA2' },
  { key: 'review2', label: 'REVIEW2' },
  { key: 'model', label: 'MODEL' },
  { key: 'formative1', label: 'LAB1 (Formative1)' },
  { key: 'formative2', label: 'LAB2 (Formative2)' },
];

const ALL_ASSESSMENT_KEYS: DueAssessmentKey[] = ALL_ASSESSMENTS.map((a) => a.key);

function combineDateTime(date: string, time: string): string | null {
  const dd = String(date || '').trim();
  const tt = String(time || '').trim();
  if (!dd || !tt) return null;
  return `${dd}T${tt}:00`;
}

// Semantics used here:
// - ON: due dates enabled (no global overrides, or none returned)
// - OFF: due dates disabled (override OPEN for every assessment)
// - MIXED: partial overrides
function computeToggleStatus(
  globalControls: Array<{ is_open: boolean }> | null | undefined,
  expected: number
): 'ON' | 'OFF' | 'MIXED' {
  if (!globalControls || globalControls.length === 0) return 'ON';
  const openCount = globalControls.filter((g) => g.is_open === true).length;
  if (globalControls.length === expected && openCount === expected) return 'OFF';
  return 'MIXED';
}

export default function OBEDueDatesPage(): JSX.Element {
  const [semesters, setSemesters] = useState<SemesterRow[]>([]);
  const [selectedSemNumber, setSelectedSemNumber] = useState<number>(1);

  const [selectedAssessments, setSelectedAssessments] = useState<DueAssessmentKey[]>(['ssa1', 'cia1']);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');

  const [subjectsBySemester, setSubjectsBySemester] = useState<Record<string, Array<{ subject_code: string; subject_name: string }>>>({});
  const [globalControlsForSelected, setGlobalControlsForSelected] = useState<
    Array<{
      id: number;
      semester: { id: number; number: number | null } | null;
      assessment: string;
      is_open: boolean;
      updated_at: string | null;
      updated_by: number | null;
    }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load semesters once
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
    const out: number[] = [];
    for (const n of SEMESTER_NUMBERS) {
      const id = semesterIdByNumber.get(n);
      if (id) out.push(id);
    }
    return out;
  }, [semesterIdByNumber]);

  const toggleAssessment = useCallback((key: DueAssessmentKey) => {
    setSelectedAssessments((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }, []);

  const reloadSelectedSemester = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      if (!selectedSemesterId) {
        setSubjectsBySemester({});
        setGlobalControlsForSelected([]);
        setMessage(`Semester ${selectedSemNumber} is not available in the database.`);
        return;
      }

      const [subjectsResp, globalResp] = await Promise.all([
        fetchDueScheduleSubjects([selectedSemesterId]),
        fetchGlobalPublishControls([selectedSemesterId], ALL_ASSESSMENT_KEYS.map(String)),
      ]);

      setSubjectsBySemester(subjectsResp?.subjects_by_semester || {});
      setGlobalControlsForSelected(globalResp?.results || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load semester data');
    } finally {
      setLoading(false);
    }
  }, [selectedSemesterId, selectedSemNumber]);

  useEffect(() => {
    void reloadSelectedSemester();
  }, [reloadSelectedSemester]);

  const selectedSubjects = useMemo(() => {
    if (!selectedSemesterId) return [];
    const list = subjectsBySemester?.[String(selectedSemesterId)] || [];
    return list.filter((x) => x && x.subject_code);
  }, [subjectsBySemester, selectedSemesterId]);

  const semesterToggleStatus = useMemo(() => {
    return computeToggleStatus(globalControlsForSelected, ALL_ASSESSMENT_KEYS.length);
  }, [globalControlsForSelected]);

  const setSemesterDueDatesEnabled = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      setMessage(null);
      setError(null);

      try {
        if (!selectedSemesterId) throw new Error(`Semester ${selectedSemNumber} is not available in the database.`);
        if (enabled) {
          await bulkResetGlobalPublishControls({
            semester_ids: [selectedSemesterId],
            assessments: ALL_ASSESSMENT_KEYS.map(String),
          });
          setMessage(`Semester ${selectedSemNumber}: Due Dates ON (deadlines apply)`);
        } else {
          await bulkSetGlobalPublishControls({
            semester_ids: [selectedSemesterId],
            assessments: ALL_ASSESSMENT_KEYS.map(String),
            is_open: true,
          });
          setMessage(`Semester ${selectedSemNumber}: Due Dates OFF (no deadline / no locking)`);
        }
        await reloadSelectedSemester();
      } catch (e: any) {
        setError(e?.message || 'Semester toggle failed');
      } finally {
        setLoading(false);
      }
    },
    [reloadSelectedSemester, selectedSemNumber, selectedSemesterId]
  );

  const setOverallDueDatesEnabled = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      setMessage(null);
      setError(null);

      try {
        if (!allSemesterIds.length) throw new Error('No semesters found (1–8).');
        if (enabled) {
          await bulkResetGlobalPublishControls({
            semester_ids: allSemesterIds,
            assessments: ALL_ASSESSMENT_KEYS.map(String),
          });
          setMessage('All semesters: Due Dates ON (deadlines apply)');
        } else {
          await bulkSetGlobalPublishControls({
            semester_ids: allSemesterIds,
            assessments: ALL_ASSESSMENT_KEYS.map(String),
            is_open: true,
          });
          setMessage('All semesters: Due Dates OFF (no deadline / no locking)');
        }
        await reloadSelectedSemester();
      } catch (e: any) {
        setError(e?.message || 'Overall toggle failed');
      } finally {
        setLoading(false);
      }
    },
    [allSemesterIds, reloadSelectedSemester]
  );

  const saveForSemester = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      if (!selectedSemesterId) throw new Error(`Semester ${selectedSemNumber} is not available in the database.`);
      const dueAt = combineDateTime(dueDate, dueTime);
      if (!dueAt) throw new Error('Select end Due Date and Due Time');
      if (!selectedAssessments.length) throw new Error('Select at least one Exam/Assessment');

      const subjectCodes = Array.from(new Set(selectedSubjects.map((s) => String(s.subject_code).trim()).filter(Boolean)));
      if (!subjectCodes.length) throw new Error(`No courses found for Semester ${selectedSemNumber}`);

      const resp = await bulkUpsertDueSchedule({
        semester_id: selectedSemesterId,
        subject_codes: subjectCodes,
        assessments: selectedAssessments,
        due_at: dueAt,
      });

      setMessage(`Semester ${selectedSemNumber}: Saved (${Number(resp?.updated || 0)} rows).`);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  }, [dueDate, dueTime, selectedAssessments, selectedSemesterId, selectedSemNumber, selectedSubjects]);

  return (
    <main style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ padding: 18 }}>
        <div className="welcome" style={{ marginBottom: 14 }}>
          <div className="welcome-left">
            <div>
              <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>
                OBE Master — Due Dates
              </h2>
              <div className="welcome-sub">Sem 1–8 slider • exam checkboxes • end date/time • save.</div>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #ef444433',
              color: '#991b1b',
              padding: 10,
              borderRadius: 10,
              marginBottom: 10,
              whiteSpace: 'pre-wrap',
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #10b98133',
              color: '#065f46',
              padding: 10,
              borderRadius: 10,
              marginBottom: 10,
              whiteSpace: 'pre-wrap',
            }}
          >
            {message}
          </div>
        )}

        {/* Overall */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Overall Due Dates ON / OFF (All Semesters)</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>Semesters: 1–8</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={() => void setOverallDueDatesEnabled(true)}
                disabled={loading}
                className="obe-btn"
                style={{ background: '#10b981', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800 }}
                title="Use due dates (deadlines + locking apply)"
              >
                ON
              </button>
              <button
                onClick={() => void setOverallDueDatesEnabled(false)}
                disabled={loading}
                className="obe-btn"
                style={{ background: '#ef4444', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800 }}
                title="No deadlines (locking disabled)"
              >
                OFF
              </button>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>OFF = global override OPEN. ON = reset overrides (use due dates).</div>
        </div>

        {/* Slider */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Semester Slider</div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 130, fontWeight: 900, fontSize: 16 }}>SEM {selectedSemNumber}</div>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={selectedSemNumber}
              onChange={(e) => setSelectedSemNumber(Number(e.target.value))}
              style={{ flex: '1 1 320px' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SEMESTER_NUMBERS.map((n) => (
                <button
                  key={n}
                  className="obe-btn"
                  disabled={loading}
                  onClick={() => setSelectedSemNumber(n)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: '1px solid #e5e7eb',
                    background: n === selectedSemNumber ? '#111827' : '#fff',
                    color: n === selectedSemNumber ? '#fff' : '#111827',
                    fontWeight: 900,
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Move slider or click 1–8 to switch semesters.</div>
        </div>

        {/* Semester controls */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>SEM {selectedSemNumber}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{selectedSubjects.length} courses</div>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 260, flex: '1 1 360px' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Semester Due Dates ON / OFF</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: '#374151', fontWeight: 900 }}>Status: {semesterToggleStatus}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => void setSemesterDueDatesEnabled(true)}
                    disabled={loading}
                    className="obe-btn"
                    style={{ background: '#10b981', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800 }}
                  >
                    ON
                  </button>
                  <button
                    onClick={() => void setSemesterDueDatesEnabled(false)}
                    disabled={loading}
                    className="obe-btn"
                    style={{ background: '#ef4444', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800 }}
                  >
                    OFF
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                If OFF: Semester {selectedSemNumber} will ignore due times (publish always allowed).
              </div>
            </div>

            <div style={{ minWidth: 280, flex: '2 1 520px' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Exam / Assessment</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 8,
                  maxHeight: 160,
                  overflow: 'auto',
                  paddingRight: 6,
                }}
              >
                {ALL_ASSESSMENTS.map((a) => (
                  <label key={a.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={selectedAssessments.includes(a.key)} onChange={() => toggleAssessment(a.key)} />
                    <span style={{ fontWeight: 800 }}>{a.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ minWidth: 260, flex: '1 1 360px' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>End Date & Time</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: '1px solid #e5e7eb' }}
                />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: '1px solid #e5e7eb' }}
                />
                <button
                  onClick={() => void saveForSemester()}
                  disabled={loading}
                  className="obe-btn obe-btn-primary"
                  style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 900 }}
                >
                  {loading ? 'Saving…' : 'Save (All Courses in SEM)'}
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>Applies to all courses loaded for the selected semester.</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
