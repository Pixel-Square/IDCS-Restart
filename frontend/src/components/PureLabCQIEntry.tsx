/**
 * PureLabCQIEntry
 *
 * CQI assessment for PURE_LAB type courses.
 * Combines Cycle 1 (25) + Cycle 2 (25) + Cycle 3/Records (10) → total 60.
 * Students with combined total < 58% of 60 (= 34.8) are flagged as "CQI NOT ATTAINED".
 */
import React, { useEffect, useMemo, useState } from 'react';
import fetchWithAuth from '../services/fetchAuth';
import { fetchPublishedLabSheet } from '../services/obe';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import { useCqiEditRequestsEnabled } from '../utils/requestControl';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { useEditRequestPending } from '../hooks/useEditRequestPending';

// ──────────────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────────────
const PURE_LAB_CIA_WEIGHT    = 7.5;
const PURE_LAB_EXP_WEIGHT    = 17.5;
const PURE_LAB_CYCLE_MAX     = 25;
const PURE_LAB_RECORD_WEIGHT = 10;
const PURE_LAB_TOTAL_MAX     = 60;   // 25 + 25 + 10
const PURE_LAB_THRESHOLD_PCT = 58;   // 58% of 60 → 34.8
const DEFAULT_EXP_MAX        = 25;
const DEFAULT_CIA_MAX        = 30;

// ──────────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function avgArr(arr: Array<number | ''>): number | null {
  const nums = arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function normalizeMarks(raw: unknown, len: number): Array<number | ''> {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: len }, (_, i) => {
    const v = arr[i];
    if (v === '' || v == null) return '';
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : '';
  });
}

type CycleBreakdown = {
  exp: number | null;   // experiment avg converted to weight
  cia: number | null;   // CIA exam converted to weight (null for cycle 3)
  total: number | null; // exp + cia
};

const NULL_BREAKDOWN: CycleBreakdown = { exp: null, cia: null, total: null };

/** Compute cycle 1 or cycle 2 breakdown (max 25) from a published lab sheet row. */
function computeCycle12Breakdown(row: any, sheet: any): CycleBreakdown {
  const ciaMax    = Number(sheet?.ciaExamMax ?? DEFAULT_CIA_MAX);
  const co1Config = sheet?.coConfigs?.['1'];
  const expCount  = Number(co1Config?.expCount ?? sheet?.expCountA ?? 5);
  const expMax    = Number(co1Config?.expMax   ?? sheet?.expMaxA   ?? DEFAULT_EXP_MAX);

  // CIA exam mark (single value)
  const ciaRaw = (row as any)?.ciaExam;
  const cia    = typeof ciaRaw === 'number' && Number.isFinite(ciaRaw) ? clamp(ciaRaw, 0, ciaMax) : 0;

  // Experiment marks for CO1
  const byCo  = (row as any)?.marksByCo;
  const raw1  = byCo?.['1'] ?? (row as any)?.marksA;
  const marks = normalizeMarks(raw1, expCount);
  const avg   = avgArr(marks);

  if (avg == null && cia === 0) return NULL_BREAKDOWN;

  const ciaContrib = ciaMax > 0 ? round2((cia / ciaMax) * PURE_LAB_CIA_WEIGHT) : 0;
  const expContrib = avg != null && expMax > 0 ? round2((avg / expMax) * PURE_LAB_EXP_WEIGHT) : 0;
  return { exp: expContrib, cia: ciaContrib, total: round2(ciaContrib + expContrib) };
}

/** Compute cycle 3 breakdown (max 10) from a published lab sheet row. */
function computeCycle3Breakdown(row: any, sheet: any): CycleBreakdown {
  const co1Config = sheet?.coConfigs?.['1'];
  const expCount  = Number(co1Config?.expCount ?? sheet?.expCountA ?? 5);
  const expMax    = Number(co1Config?.expMax   ?? sheet?.expMaxA   ?? DEFAULT_EXP_MAX);

  const byCo  = (row as any)?.marksByCo;
  const raw1  = byCo?.['1'] ?? (row as any)?.marksA;
  const marks = normalizeMarks(raw1, expCount);
  const avg   = avgArr(marks);

  if (avg == null) return NULL_BREAKDOWN;
  const expContrib = expMax > 0 ? round2((avg / expMax) * PURE_LAB_RECORD_WEIGHT) : null;
  return { exp: expContrib, cia: null, total: expContrib };
}

// ──────────────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────────────
type Student = { id: number; reg_no: string; name: string; section?: string | null };

type RowData = {
  student: Student;
  cycle1: CycleBreakdown;  // max 25
  cycle2: CycleBreakdown;  // max 25
  cycle3: CycleBreakdown;  // max 10
  combined: number | null; // max 60
  needsCqi: boolean;       // combined < 34.8
  afterCqi: number | null; // combined after CQI intervention
};

type Props = {
  subjectId?: string | null;
  teachingAssignmentId?: number;
};

// ──────────────────────────────────────────────────────────────────────
//  Component
// ──────────────────────────────────────────────────────────────────────
export default function PureLabCQIEntry({ subjectId, teachingAssignmentId }: Props) {
  const editRequestsEnabled = useCqiEditRequestsEnabled();

  // ── Lock / publish state ─────────────────────────────────────────────
  const { data: lockData, refresh: refreshLock } = useMarkTableLock({
    assessment: 'cqi_model',
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
  });
  const publishedEditLocked = Boolean(lockData?.is_published && lockData?.published_blocked);
  const isPublished         = Boolean(lockData?.is_published);
  const publishButtonIsRequestEdit = publishedEditLocked && editRequestsEnabled;
  const editRequestsBlocked = publishedEditLocked && !editRequestsEnabled;

  const {
    pending: editRequestPending,
    setPendingUntilMs: setEditReqPendingUntilMs,
    refresh: refreshEditReq,
  } = useEditRequestPending({
    enabled: Boolean(editRequestsEnabled) && Boolean(subjectId),
    assessment: 'cqi_model',
    subjectCode: subjectId ? String(subjectId) : null,
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
  });

  // ── Data state ───────────────────────────────────────────────────────
  const [roster, setRoster]           = useState<Student[]>([]);
  const [cycle1Sheet, setCycle1Sheet] = useState<any>(null);
  const [cycle2Sheet, setCycle2Sheet] = useState<any>(null);
  const [cycle3Sheet, setCycle3Sheet] = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);

  // CQI intervention marks: studentId → mark input (integer, can be '')
  const [cqiEntries, setCqiEntries]   = useState<Record<string, number | ''>>({});
  const [savedAt, setSavedAt]         = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [publishing, setPublishing]   = useState(false);
  const [statusMsg, setStatusMsg]     = useState<string | null>(null);

  // Edit-request modal
  const [editReasonOpen, setEditReasonOpen]   = useState(false);
  const [editReason, setEditReason]           = useState('');
  const [editReasonBusy, setEditReasonBusy]   = useState(false);

  // ── Fetch published sheets + draft ───────────────────────────────────
  useEffect(() => {
    if (!subjectId || teachingAssignmentId == null) return;
    let mounted = true;
    setLoading(true);
    setLoadError(null);

    const taId = teachingAssignmentId;

    Promise.all([
      fetchPublishedLabSheet('cia1', subjectId, taId).catch(() => null),
      fetchPublishedLabSheet('cia2', subjectId, taId).catch(() => null),
      fetchPublishedLabSheet('model', subjectId, taId).catch(() => null),
      fetchTeachingAssignmentRoster(taId).catch(() => null),
      // Load CQI draft
      fetchWithAuth(
        `/api/obe/cqi-draft/${encodeURIComponent(subjectId)}/?teaching_assignment_id=${taId}&assessment_type=model&page_key=pure_lab_cqi&co_numbers=1`,
        { method: 'GET' },
      ).catch(() => null),
      // Load CQI published
      fetchWithAuth(
        `/api/obe/cqi-published/${encodeURIComponent(subjectId)}/?teaching_assignment_id=${taId}&assessment_type=model&page_key=pure_lab_cqi&co_numbers=1`,
        { method: 'GET' },
      ).catch(() => null),
    ]).then(([c1Res, c2Res, c3Res, rosterRes, draftHttpRes, pubHttpRes]) => {
      if (!mounted) return;

      const c1Sheet = (c1Res as any)?.data?.sheet ?? null;
      const c2Sheet = (c2Res as any)?.data?.sheet ?? null;
      const c3Sheet = (c3Res as any)?.data?.sheet ?? null;
      setCycle1Sheet(c1Sheet);
      setCycle2Sheet(c2Sheet);
      setCycle3Sheet(c3Sheet);

      const students: Student[] = Array.isArray((rosterRes as any)?.students)
        ? (rosterRes as any).students
        : [];
      setRoster(students);

      Promise.all([
        draftHttpRes && typeof (draftHttpRes as any).json === 'function'
          ? (draftHttpRes as any).json().catch(() => null)
          : Promise.resolve(null),
        pubHttpRes && typeof (pubHttpRes as any).json === 'function'
          ? (pubHttpRes as any).json().catch(() => null)
          : Promise.resolve(null),
      ]).then(([draftJson, pubJson]) => {
        if (!mounted) return;

        // Published CQI entries
        const pubEntries = (pubJson as any)?.published?.entries ?? null;
        if (pubEntries && typeof pubEntries === 'object') {
          const flat: Record<string, number | ''> = {};
          for (const [sid, val] of Object.entries(pubEntries)) {
            const n = Number((val as any)?.cqiMark ?? val);
            flat[sid] = Number.isFinite(n) ? n : '';
          }
          setCqiEntries(flat);
          setPublishedAt((pubJson as any)?.published?.publishedAt ?? null);
        } else {
          // Draft entries
          const draftEntries = (draftJson as any)?.draft?.entries ?? null;
          if (draftEntries && typeof draftEntries === 'object') {
            const flat: Record<string, number | ''> = {};
            for (const [sid, val] of Object.entries(draftEntries)) {
              const n = Number((val as any)?.cqiMark ?? val);
              flat[sid] = Number.isFinite(n) ? n : '';
            }
            setCqiEntries(flat);
            setSavedAt((draftJson as any)?.updated_at ?? null);
          }
        }
        setLoading(false);
      });
    }).catch((err) => {
      if (!mounted) return;
      setLoadError(String(err?.message || 'Failed to load data'));
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [subjectId, teachingAssignmentId]);

  // ── Build row data ────────────────────────────────────────────────────
  const rows: RowData[] = useMemo(() => {
    if (!roster.length) return [];
    const threshold = (PURE_LAB_THRESHOLD_PCT / 100) * PURE_LAB_TOTAL_MAX; // 34.8

    return roster.map((s) => {
      const sid = String(s.id);
      const c1Row = cycle1Sheet?.rowsByStudentId?.[sid] ?? null;
      const c2Row = cycle2Sheet?.rowsByStudentId?.[sid] ?? null;
      const c3Row = cycle3Sheet?.rowsByStudentId?.[sid] ?? null;

      const cycle1 = c1Row ? computeCycle12Breakdown(c1Row, cycle1Sheet) : NULL_BREAKDOWN;
      const cycle2 = c2Row ? computeCycle12Breakdown(c2Row, cycle2Sheet) : NULL_BREAKDOWN;
      const cycle3 = c3Row ? computeCycle3Breakdown(c3Row, cycle3Sheet) : NULL_BREAKDOWN;

      const hasSome = cycle1.total != null || cycle2.total != null || cycle3.total != null;
      const combined = hasSome
        ? round2((cycle1.total ?? 0) + (cycle2.total ?? 0) + (cycle3.total ?? 0))
        : null;

      const needsCqi = combined != null && combined < threshold;

      // After CQI: combined + CQI intervention marks entered
      const cqiMark = cqiEntries[sid];
      const cqiNum  = typeof cqiMark === 'number' && Number.isFinite(cqiMark) ? cqiMark : 0;
      const afterCqi = combined != null ? round2(Math.min(combined + cqiNum, PURE_LAB_TOTAL_MAX)) : null;

      return { student: s, cycle1, cycle2, cycle3, combined, needsCqi, afterCqi };
    });
  }, [roster, cycle1Sheet, cycle2Sheet, cycle3Sheet, cqiEntries]);

  // ── Save draft ────────────────────────────────────────────────────────
  async function saveDraft() {
    if (!subjectId || teachingAssignmentId == null) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const entries: Record<string, any> = {};
      for (const [sid, val] of Object.entries(cqiEntries)) {
        entries[sid] = { cqiMark: typeof val === 'number' ? val : null };
      }
      const res = await fetchWithAuth(
        `/api/obe/cqi-draft/${encodeURIComponent(subjectId)}/?teaching_assignment_id=${teachingAssignmentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            teaching_assignment_id: teachingAssignmentId,
            assessment_type: 'model',
            page_key: 'pure_lab_cqi',
            co_numbers: [1],
            entries,
          }),
        },
      );
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const json = await res.json();
      setSavedAt(json?.updated_at ?? new Date().toISOString());
      setStatusMsg('Draft saved.');
    } catch (e: any) {
      setStatusMsg(`Error: ${e?.message || 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────
  async function publishCqi() {
    if (!subjectId || teachingAssignmentId == null) return;
    setPublishing(true);
    setStatusMsg(null);
    try {
      await saveDraft();
      const entries: Record<string, any> = {};
      for (const [sid, val] of Object.entries(cqiEntries)) {
        entries[sid] = { cqiMark: typeof val === 'number' ? val : null };
      }
      const res = await fetchWithAuth(
        `/api/obe/cqi-publish/${encodeURIComponent(subjectId)}/`,
        {
          method: 'POST',
          body: JSON.stringify({
            teaching_assignment_id: teachingAssignmentId,
            assessment_type: 'model',
            page_key: 'pure_lab_cqi',
            co_numbers: [1],
            entries,
          }),
        },
      );
      if (!res.ok) throw new Error(`Publish failed (${res.status})`);
      const json = await res.json();
      setPublishedAt(json?.published_at ?? new Date().toISOString());
      setStatusMsg('CQI Published successfully.');
      refreshLock();
    } catch (e: any) {
      setStatusMsg(`Error: ${e?.message || 'Publish failed'}`);
    } finally {
      setPublishing(false);
    }
  }

  // ── Request edit ──────────────────────────────────────────────────────
  async function submitEditRequest() {
    if (!subjectId || teachingAssignmentId == null || !editReason.trim()) return;
    setEditReasonBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetchWithAuth(
        `/api/obe/edit-request/`,
        {
          method: 'POST',
          body: JSON.stringify({
            subject_code: subjectId,
            teaching_assignment_id: teachingAssignmentId,
            assessment: 'cqi_model',
            reason: editReason.trim(),
          }),
        },
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setEditReasonOpen(false);
      setEditReason('');
      setStatusMsg('Edit request submitted. Awaiting IQAC approval.');
      refreshEditReq();
    } catch (e: any) {
      setStatusMsg(`Error: ${e?.message || 'Request failed'}`);
    } finally {
      setEditReasonBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const isViewOnly  = editRequestsBlocked || (isPublished && !editRequestPending);
  const threshold   = (PURE_LAB_THRESHOLD_PCT / 100) * PURE_LAB_TOTAL_MAX;
  const flaggedCount = rows.filter((r) => r.needsCqi).length;

  const cellStyle: React.CSSProperties = {
    padding: '6px 8px',
    border: '1px solid #e5e7eb',
    fontSize: 12,
    textAlign: 'center',
  };
  const hStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 800,
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
        Loading Pure Lab CQI data…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 24, color: '#dc2626', fontWeight: 600 }}>
        {loadError}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 8px' }}>
      {/* Header */}
      <div style={{ fontWeight: 900, fontSize: 16, color: '#0f172a', marginBottom: 4 }}>
        CQI – Final Internal Assessment
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
        Threshold: {PURE_LAB_THRESHOLD_PCT}% of {PURE_LAB_TOTAL_MAX} = {threshold} marks.
        Students below threshold are marked <strong style={{ color: '#dc2626' }}>CQI NOT ATTAINED</strong>.
      </div>
      <div style={{ fontSize: 11, color: '#475569', marginBottom: 12, lineHeight: 1.6 }}>
        <strong>Formula:</strong>{' '}
        Cycle 1 = Exp Avg/{PURE_LAB_EXP_WEIGHT} + CIA/{PURE_LAB_CIA_WEIGHT} = /{PURE_LAB_CYCLE_MAX}{' · '}
        Cycle 2 = Exp Avg/{PURE_LAB_EXP_WEIGHT} + CIA/{PURE_LAB_CIA_WEIGHT} = /{PURE_LAB_CYCLE_MAX}{' · '}
        Cycle 3 = Exp Avg/{PURE_LAB_RECORD_WEIGHT} (no CIA){' · '}
        Total = /{PURE_LAB_TOTAL_MAX}
      </div>

      {/* Summary */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16,
        padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          Total students: {rows.length}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
          CQI NOT ATTAINED: {flaggedCount}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
          Attained: {rows.length - flaggedCount}
        </span>
      </div>

      {/* Published lock banner */}
      {publishedEditLocked && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
            CQI is read-only after publish. Use Request Edit to ask IQAC for edit access.
          </span>
          {publishButtonIsRequestEdit && (
            <button
              onClick={() => { setEditReasonOpen(true); }}
              disabled={editRequestPending}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: editRequestPending ? '#94a3b8' : '#1d4ed8', color: '#fff',
                fontWeight: 700, fontSize: 12,
              }}
            >
              {editRequestPending ? 'Request Pending' : 'Request Edit'}
            </button>
          )}
          {editRequestsBlocked && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Published & Locked</span>
          )}
        </div>
      )}

      {/* Published note */}
      {publishedAt && (
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
          Published: {new Date(publishedAt).toLocaleString()}
        </div>
      )}
      {savedAt && !publishedAt && (
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
          Draft saved: {new Date(savedAt).toLocaleString()}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 800, width: '100%' }}>
          <thead>
            {/* Top header row with grouped columns */}
            <tr>
              <th rowSpan={2} style={hStyle}>S.No</th>
              <th rowSpan={2} style={{ ...hStyle, textAlign: 'left', minWidth: 100 }}>Reg No</th>
              <th rowSpan={2} style={{ ...hStyle, textAlign: 'left', minWidth: 140 }}>Name</th>
              <th colSpan={3} style={{ ...hStyle, borderBottom: 'none' }}>Cycle 1<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/25</span></th>
              <th colSpan={3} style={{ ...hStyle, borderBottom: 'none' }}>Cycle 2<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/25</span></th>
              <th rowSpan={2} style={hStyle}>Cycle 3<br /><span style={{ fontWeight: 400, fontSize: 10 }}>Exp /10</span></th>
              <th rowSpan={2} style={hStyle}>Total<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/60</span></th>
              <th rowSpan={2} style={hStyle}>CQI Status</th>
              <th rowSpan={2} style={hStyle}>CQI Marks<br /><span style={{ fontWeight: 400, fontSize: 10 }}>(intervention)</span></th>
              <th rowSpan={2} style={hStyle}>After CQI<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/60</span></th>
            </tr>
            {/* Sub-header row for Cycle 1 & Cycle 2 breakdown */}
            <tr>
              <th style={{ ...hStyle, fontSize: 10, fontWeight: 600, padding: '3px 6px' }}>Exp<br />/{PURE_LAB_EXP_WEIGHT}</th>
              <th style={{ ...hStyle, fontSize: 10, fontWeight: 600, padding: '3px 6px' }}>CIA<br />/{PURE_LAB_CIA_WEIGHT}</th>
              <th style={{ ...hStyle, fontSize: 10, fontWeight: 600, padding: '3px 6px' }}>Total<br />/{PURE_LAB_CYCLE_MAX}</th>
              <th style={{ ...hStyle, fontSize: 10, fontWeight: 600, padding: '3px 6px' }}>Exp<br />/{PURE_LAB_EXP_WEIGHT}</th>
              <th style={{ ...hStyle, fontSize: 10, fontWeight: 600, padding: '3px 6px' }}>CIA<br />/{PURE_LAB_CIA_WEIGHT}</th>
              <th style={{ ...hStyle, fontSize: 10, fontWeight: 600, padding: '3px 6px' }}>Total<br />/{PURE_LAB_CYCLE_MAX}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const sid = String(r.student.id);
              const rowBg = r.needsCqi ? '#fef2f2' : idx % 2 === 0 ? '#fff' : '#f9fafb';
              return (
                <tr key={sid} style={{ background: rowBg }}>
                  <td style={cellStyle}>{idx + 1}</td>
                  <td style={{ ...cellStyle, textAlign: 'left' }}>{r.student.reg_no}</td>
                  <td style={{ ...cellStyle, textAlign: 'left' }}>{r.student.name}</td>
                  {/* Cycle 1 breakdown */}
                  <td style={{ ...cellStyle, fontSize: 11 }}>{r.cycle1.exp != null ? r.cycle1.exp : '—'}</td>
                  <td style={{ ...cellStyle, fontSize: 11 }}>{r.cycle1.cia != null ? r.cycle1.cia : '—'}</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{r.cycle1.total != null ? r.cycle1.total : '—'}</td>
                  {/* Cycle 2 breakdown */}
                  <td style={{ ...cellStyle, fontSize: 11 }}>{r.cycle2.exp != null ? r.cycle2.exp : '—'}</td>
                  <td style={{ ...cellStyle, fontSize: 11 }}>{r.cycle2.cia != null ? r.cycle2.cia : '—'}</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{r.cycle2.total != null ? r.cycle2.total : '—'}</td>
                  {/* Cycle 3 (exp only) */}
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{r.cycle3.total != null ? r.cycle3.total : '—'}</td>
                  <td style={{
                    ...cellStyle,
                    fontWeight: 800,
                    color: r.combined != null
                      ? (r.needsCqi ? '#dc2626' : '#16a34a')
                      : '#94a3b8',
                  }}>
                    {r.combined != null ? r.combined : '—'}
                  </td>
                  <td style={{
                    ...cellStyle,
                    fontWeight: 700,
                    color: r.needsCqi ? '#dc2626' : '#16a34a',
                    fontSize: 11,
                  }}>
                    {r.combined == null ? '—' : r.needsCqi ? '✗ CQI NOT ATTAINED' : '✓ ATTAINED'}
                  </td>
                  <td style={cellStyle}>
                    {r.needsCqi && !isViewOnly ? (
                      <input
                        type="number"
                        min={0}
                        max={PURE_LAB_TOTAL_MAX}
                        value={cqiEntries[sid] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setCqiEntries((prev) => ({ ...prev, [sid]: '' }));
                          } else {
                            const n = parseFloat(val);
                            setCqiEntries((prev) => ({ ...prev, [sid]: Number.isFinite(n) ? clamp(n, 0, PURE_LAB_TOTAL_MAX) : '' }));
                          }
                        }}
                        style={{
                          width: 60, padding: '4px 6px', borderRadius: 4,
                          border: '1px solid #cbd5e1', textAlign: 'center', fontSize: 12,
                        }}
                      />
                    ) : (
                      <span style={{ color: '#64748b' }}>
                        {r.needsCqi && cqiEntries[sid] !== undefined && cqiEntries[sid] !== ''
                          ? String(cqiEntries[sid])
                          : (r.needsCqi ? '—' : '–')}
                      </span>
                    )}
                  </td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>
                    {r.afterCqi != null ? r.afterCqi : '—'}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} style={{ ...cellStyle, color: '#94a3b8', textAlign: 'center', padding: 24 }}>
                  No student data available. Ensure Cycle 1, Cycle 2, and Cycle 3 are published first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      {!isViewOnly && !publishedEditLocked && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button
            onClick={saveDraft}
            disabled={saving || publishing}
            style={{
              padding: '8px 18px', borderRadius: 6, border: '1px solid #cbd5e1',
              background: '#f8fafc', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={() => {
              if (window.confirm('Publish CQI? This will lock the data. Are you sure?')) {
                publishCqi();
              }
            }}
            disabled={saving || publishing}
            style={{
              padding: '8px 18px', borderRadius: 6, border: 'none',
              background: publishing ? '#94a3b8' : '#1d4ed8', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            {publishing ? 'Publishing…' : 'Publish CQI'}
          </button>
        </div>
      )}

      {/* Status message */}
      {statusMsg && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 6,
          background: statusMsg.startsWith('Error') ? '#fef2f2' : '#f0fdf4',
          color: statusMsg.startsWith('Error') ? '#dc2626' : '#16a34a',
          fontSize: 12, fontWeight: 600,
        }}>
          {statusMsg}
        </div>
      )}

      {/* Edit reason modal */}
      {editReasonOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: 24, minWidth: 340, maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Request Edit Access</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Provide a reason for requesting edit access from IQAC.
            </div>
            <textarea
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              rows={3}
              placeholder="Reason for edit request…"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setEditReasonOpen(false); setEditReason(''); }}
                style={{
                  padding: '7px 16px', borderRadius: 6, border: '1px solid #cbd5e1',
                  background: '#f8fafc', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitEditRequest}
                disabled={!editReason.trim() || editReasonBusy}
                style={{
                  padding: '7px 16px', borderRadius: 6, border: 'none',
                  background: editReason.trim() && !editReasonBusy ? '#1d4ed8' : '#94a3b8',
                  color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                {editReasonBusy ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
