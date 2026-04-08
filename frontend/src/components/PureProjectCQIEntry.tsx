/**
 * PureProjectCQIEntry
 *
 * CQI assessment for pure PROJECT type courses (non-PRBL).
 * Review 1 (/50) + Review 2 (/50) = Total (/100).
 * If total < 58 → CQI NOT ATTAINED.
 *
 * Rules:
 *  - Single CQI test per student (not separate for each review).
 *  - CQI mark is out of 10.
 *  - After CQI: add 60% of the CQI mark (mark × 0.6).
 *  - If adding makes total exceed 58, cap at 58.
 */
import React, { useEffect, useMemo, useState } from 'react';
import fetchWithAuth from '../services/fetchAuth';
import { fetchPublishedLabSheet, fetchPublishedReview1, fetchPublishedReview2 } from '../services/obe';
import { fetchTeachingAssignmentRoster } from '../services/roster';
import { useCqiEditRequestsEnabled } from '../utils/requestControl';
import { useMarkTableLock } from '../hooks/useMarkTableLock';
import { useEditRequestPending } from '../hooks/useEditRequestPending';

// ──────────────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────────────
const REVIEW_MAX           = 50;   // each review is out of 50
const TOTAL_MAX            = 100;  // review1(50) + review2(50)
const THRESHOLD_MARKS      = 58;   // if total < 58 → CQI
const CQI_INPUT_MAX        = 10;   // CQI mark entered out of 10
const CQI_RATE             = 0.6;  // take 60% of CQI mark

// ──────────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Extract a student's review total from the published review response.
 *  Handles both numeric-keyed marks and draft/component formats. */
function extractReviewMark(reviewRes: any, studentId: number | string): number | null {
  const sid = String(studentId);

  // Try draft first (if present)
  const draftSheet = reviewRes?.draft?.sheet && typeof reviewRes.draft.sheet === 'object'
    ? reviewRes.draft.sheet
    : reviewRes?.draft && typeof reviewRes.draft === 'object' && (reviewRes.draft as any)?.rowsByStudentId
      ? reviewRes.draft
      : null;
  if (draftSheet) {
    const row = draftSheet.rowsByStudentId?.[sid];
    if (row && typeof row === 'object') {
      const ciaExamTotal = toNumOrNull((row as any)?.ciaExam);
      if (ciaExamTotal != null) return clamp(ciaExamTotal, 0, REVIEW_MAX);
      const componentMarks = (row as any)?.reviewComponentMarks && typeof (row as any).reviewComponentMarks === 'object'
        ? Object.values((row as any).reviewComponentMarks)
        : [];
      let hasNumeric = false;
      const sum = componentMarks.reduce<number>((acc, raw) => {
        const n = toNumOrNull(raw);
        if (n != null) hasNumeric = true;
        return acc + (n == null ? 0 : n);
      }, 0);
      if (hasNumeric) return clamp(sum, 0, REVIEW_MAX);
    }
  }

  // Published marks
  const total = toNumOrNull(reviewRes?.marks?.[sid]);
  return total == null ? null : clamp(Number(total), 0, REVIEW_MAX);
}

/**
 * Project review pages are published through lab-published-sheet endpoints.
 * Read per-student total directly from sheet rows when marks endpoint is empty.
 */
function extractReviewMarkFromLabSheet(sheetRes: any, studentId: number | string): number | null {
  const sid = String(studentId);
  const rowsByStudentId =
    (sheetRes?.data?.sheet?.rowsByStudentId && typeof sheetRes.data.sheet.rowsByStudentId === 'object')
      ? sheetRes.data.sheet.rowsByStudentId
      : (sheetRes?.data?.rowsByStudentId && typeof sheetRes.data.rowsByStudentId === 'object')
        ? sheetRes.data.rowsByStudentId
        : null;

  if (!rowsByStudentId) return null;
  const row = rowsByStudentId[sid];
  if (!row || typeof row !== 'object') return null;

  const ciaExamTotal = toNumOrNull((row as any)?.ciaExam);
  if (ciaExamTotal != null) return clamp(ciaExamTotal, 0, REVIEW_MAX);

  const componentMarks =
    (row as any)?.reviewComponentMarks && typeof (row as any).reviewComponentMarks === 'object'
      ? Object.values((row as any).reviewComponentMarks)
      : [];

  let hasNumeric = false;
  const sum = componentMarks.reduce<number>((acc, raw) => {
    const n = toNumOrNull(raw);
    if (n != null) hasNumeric = true;
    return acc + (n == null ? 0 : n);
  }, 0);
  if (hasNumeric) return clamp(sum, 0, REVIEW_MAX);

  return null;
}

// ──────────────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────────────
type Student = { id: number; reg_no: string; name: string; section?: string | null };

type RowData = {
  student: Student;
  review1: number | null;   // out of 50
  review2: number | null;   // out of 50
  combined: number | null;  // out of 100
  needsCqi: boolean;
  afterCqi: number | null;
};

type Props = {
  subjectId?: string | null;
  teachingAssignmentId?: number;
};

// ──────────────────────────────────────────────────────────────────────
//  Component
// ──────────────────────────────────────────────────────────────────────
export default function PureProjectCQIEntry({ subjectId, teachingAssignmentId }: Props) {
  const editRequestsEnabled = useCqiEditRequestsEnabled();

  // Lock / publish state
  const { data: lockData, refresh: refreshLock } = useMarkTableLock({
    assessment: 'cqi_project_combined',
    subjectCode: String(subjectId || ''),
    teachingAssignmentId,
  });
  const publishedEditLocked = Boolean(lockData?.is_published && lockData?.published_blocked);
  const isPublished         = Boolean(lockData?.is_published);
  const publishButtonIsRequestEdit = publishedEditLocked && editRequestsEnabled;
  const editRequestsBlocked = publishedEditLocked && !editRequestsEnabled;

  const {
    pending: editRequestPending,
    refresh: refreshEditReq,
  } = useEditRequestPending({
    enabled: Boolean(editRequestsEnabled) && Boolean(subjectId),
    assessment: 'cqi_project_combined',
    subjectCode: subjectId ? String(subjectId) : null,
    scope: 'MARK_ENTRY',
    teachingAssignmentId,
  });

  // Data state
  const [roster, setRoster]       = useState<Student[]>([]);
  const [review1Res, setReview1Res] = useState<any>(null);
  const [review2Res, setReview2Res] = useState<any>(null);
  const [review1SheetRes, setReview1SheetRes] = useState<any>(null);
  const [review2SheetRes, setReview2SheetRes] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // CQI marks: studentId → number | ''
  const [cqiEntries, setCqiEntries] = useState<Record<string, number | ''>>({});
  const [savedAt, setSavedAt]       = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMsg, setStatusMsg]   = useState<string | null>(null);

  // Edit-request modal
  const [editReasonOpen, setEditReasonOpen] = useState(false);
  const [editReason, setEditReason]         = useState('');
  const [editReasonBusy, setEditReasonBusy] = useState(false);

  // ── Fetch published reviews + CQI draft/published ───────────────────
  useEffect(() => {
    if (!subjectId || teachingAssignmentId == null) return;
    let mounted = true;
    setLoading(true);
    setLoadError(null);

    const taId = teachingAssignmentId;

    Promise.all([
      fetchPublishedReview1(subjectId, taId).catch(() => ({ marks: {} })),
      fetchPublishedReview2(subjectId, taId).catch(() => ({ marks: {} })),
      fetchPublishedLabSheet('review1', subjectId, taId).catch(() => ({ data: null })),
      fetchPublishedLabSheet('review2', subjectId, taId).catch(() => ({ data: null })),
      fetchTeachingAssignmentRoster(taId).catch(() => null),
      // CQI draft
      fetchWithAuth(
        `/api/obe/cqi-draft/${encodeURIComponent(subjectId)}/?teaching_assignment_id=${taId}&assessment_type=project_combined&page_key=project_combined_cqi&co_numbers=1`,
        { method: 'GET' },
      ).catch(() => null),
      // CQI published
      fetchWithAuth(
        `/api/obe/cqi-published/${encodeURIComponent(subjectId)}/?teaching_assignment_id=${taId}&assessment_type=project_combined&page_key=project_combined_cqi&co_numbers=1`,
        { method: 'GET' },
      ).catch(() => null),
    ]).then(([r1Res, r2Res, r1Sheet, r2Sheet, rosterRes, draftHttpRes, pubHttpRes]) => {
      if (!mounted) return;

      setReview1Res(r1Res);
      setReview2Res(r2Res);
      setReview1SheetRes(r1Sheet);
      setReview2SheetRes(r2Sheet);

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

  // ── Build row data ──────────────────────────────────────────────────
  const rows: RowData[] = useMemo(() => {
    if (!roster.length) return [];

    return roster.map((s) => {
      const sid = String(s.id);
      const review1 = extractReviewMark(review1Res, sid) ?? extractReviewMarkFromLabSheet(review1SheetRes, sid);
      const review2 = extractReviewMark(review2Res, sid) ?? extractReviewMarkFromLabSheet(review2SheetRes, sid);

      const hasSome = review1 != null || review2 != null;
      const combined = hasSome ? round2((review1 ?? 0) + (review2 ?? 0)) : null;

      const needsCqi = combined != null && combined < THRESHOLD_MARKS;

      // After CQI: add 60% of CQI mark, cap at 58
      const cqiMark = cqiEntries[sid];
      const cqiNum = typeof cqiMark === 'number' && Number.isFinite(cqiMark) ? cqiMark : 0;

      let afterCqi: number | null = null;
      if (combined != null) {
        if (needsCqi && cqiNum > 0) {
          const rawAdd = cqiNum * CQI_RATE;
          const maxAllowed = Math.max(0, THRESHOLD_MARKS - combined);
          afterCqi = round2(combined + Math.min(rawAdd, maxAllowed));
        } else {
          afterCqi = combined;
        }
      }

      return { student: s, review1, review2, combined, needsCqi, afterCqi };
    });
  }, [roster, review1Res, review2Res, review1SheetRes, review2SheetRes, cqiEntries]);

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
            assessment_type: 'project_combined',
            page_key: 'project_combined_cqi',
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
            assessment_type: 'project_combined',
            page_key: 'project_combined_cqi',
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
            assessment: 'cqi_project_combined',
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

  // ── Filter state ──────────────────────────────────────────────────────
  const [regNoFilter, setRegNoFilter] = useState('');

  const filteredRows = useMemo(() => {
    const trimmed = regNoFilter.trim();
    const filtered = !trimmed
      ? rows
      : rows.filter((r) => {
          const regNo = r.student.reg_no ?? '';
          const last3 = regNo.slice(-3);
          return last3.startsWith(trimmed);
        });
    // Sort by last 3 digits of reg_no numerically
    return [...filtered].sort((a, b) => {
      const aLast3 = parseInt(a.student.reg_no?.slice(-3) ?? '0', 10);
      const bLast3 = parseInt(b.student.reg_no?.slice(-3) ?? '0', 10);
      return aLast3 - bLast3;
    });
  }, [rows, regNoFilter]);

  // ── Render ────────────────────────────────────────────────────────────
  const isViewOnly   = editRequestsBlocked || (isPublished && !editRequestPending);
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
        Loading Project CQI data…
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
        CQI – Project Combined Assessment
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
        Threshold: {THRESHOLD_MARKS} out of {TOTAL_MAX}.
        Students below threshold are marked <strong style={{ color: '#dc2626' }}>CQI NOT ATTAINED</strong>.
      </div>
      <div style={{ fontSize: 11, color: '#475569', marginBottom: 12, lineHeight: 1.6 }}>
        <strong>Formula:</strong>{' '}
        Review 1 (/{REVIEW_MAX}) + Review 2 (/{REVIEW_MAX}) = Total /{TOTAL_MAX}{' · '}
        CQI: mark × {CQI_RATE}, capped at {THRESHOLD_MARKS}
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
            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Published &amp; Locked</span>
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

      {/* Reg No Filter */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
          Filter by Last 3 Digits of Reg No:
        </label>
        <input
          type="text"
          maxLength={3}
          value={regNoFilter}
          onChange={(e) => setRegNoFilter(e.target.value.replace(/\D/g, ''))}
          placeholder="e.g. 023"
          style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
            fontSize: 12, width: 90,
          }}
        />
        {regNoFilter && (
          <button
            onClick={() => setRegNoFilter('')}
            style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
              background: '#f1f5f9', fontSize: 12, cursor: 'pointer', fontWeight: 600, color: '#475569',
            }}
          >
            Clear
          </button>
        )}
        {regNoFilter && (
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {filteredRows.length} of {rows.length} students
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 700, width: '100%' }}>
          <thead>
            <tr>
              <th style={hStyle}>S.No</th>
              <th style={{ ...hStyle, textAlign: 'left', minWidth: 100 }}>Reg No</th>
              <th style={{ ...hStyle, textAlign: 'left', minWidth: 140 }}>Name</th>
              <th style={hStyle}>Review 1<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/{REVIEW_MAX}</span></th>
              <th style={hStyle}>Review 2<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/{REVIEW_MAX}</span></th>
              <th style={hStyle}>Total<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/{TOTAL_MAX}</span></th>
              <th style={hStyle}>CQI Status</th>
              <th style={hStyle}>CQI Mark<br /><span style={{ fontWeight: 400, fontSize: 10 }}>(0–{CQI_INPUT_MAX})</span></th>
              <th style={hStyle}>After CQI<br /><span style={{ fontWeight: 400, fontSize: 10 }}>/{TOTAL_MAX}</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, idx) => {
              const sid = String(r.student.id);
              const rowBg = r.needsCqi ? '#fef2f2' : idx % 2 === 0 ? '#fff' : '#f9fafb';
              return (
                <tr key={sid} style={{ background: rowBg }}>
                  <td style={cellStyle}>{idx + 1}</td>
                  <td style={{ ...cellStyle, textAlign: 'left' }}>{r.student.reg_no}</td>
                  <td style={{ ...cellStyle, textAlign: 'left' }}>{r.student.name}</td>
                  {/* Review 1 */}
                  <td style={{ ...cellStyle, fontWeight: 700 }}>
                    {r.review1 != null ? round2(r.review1) : '—'}
                  </td>
                  {/* Review 2 */}
                  <td style={{ ...cellStyle, fontWeight: 700 }}>
                    {r.review2 != null ? round2(r.review2) : '—'}
                  </td>
                  {/* Combined total */}
                  <td style={{
                    ...cellStyle,
                    fontWeight: 800,
                    color: r.combined != null
                      ? (r.needsCqi ? '#dc2626' : '#16a34a')
                      : '#94a3b8',
                  }}>
                    {r.combined != null ? (
                      <div>
                        <div>{round2(r.combined)}</div>
                      </div>
                    ) : '—'}
                  </td>
                  {/* CQI Status */}
                  <td style={{
                    ...cellStyle,
                    fontWeight: 700,
                    color: r.needsCqi ? '#dc2626' : '#16a34a',
                    fontSize: 11,
                  }}>
                    {r.combined == null ? '—' : r.needsCqi ? '✗ CQI NOT ATTAINED' : '✓ ATTAINED'}
                  </td>
                  {/* CQI Mark input */}
                  <td style={cellStyle}>
                    {r.needsCqi && !isViewOnly ? (
                      <div>
                        <input
                          type="number"
                          min={0}
                          max={CQI_INPUT_MAX}
                          step="any"
                          value={cqiEntries[sid] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              setCqiEntries((prev) => ({ ...prev, [sid]: '' }));
                            } else {
                              const n = parseFloat(val);
                              setCqiEntries((prev) => ({
                                ...prev,
                                [sid]: Number.isFinite(n) ? clamp(n, 0, CQI_INPUT_MAX) : '',
                              }));
                            }
                          }}
                          style={{
                            width: 70, padding: '4px 6px', borderRadius: 4,
                            border: '1px solid #cbd5e1', textAlign: 'center', fontSize: 12,
                          }}
                        />
                      </div>
                    ) : (
                      <span style={{ color: '#64748b' }}>
                        {r.needsCqi && cqiEntries[sid] !== undefined && cqiEntries[sid] !== ''
                          ? String(cqiEntries[sid])
                          : (r.needsCqi ? '—' : '–')}
                      </span>
                    )}
                  </td>
                  {/* After CQI total */}
                  <td style={{
                    ...cellStyle,
                    fontWeight: 700,
                    backgroundColor: r.afterCqi != null && r.combined != null && r.afterCqi > r.combined ? '#f0fdf4' : 'transparent',
                  }}>
                    {r.afterCqi != null ? (
                      <div>
                        <div>{round2(r.afterCqi)}</div>
                        {r.afterCqi > (r.combined ?? 0) && (
                          <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>
                            +{round2(r.afterCqi - (r.combined ?? 0))}
                          </div>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...cellStyle, color: '#94a3b8', textAlign: 'center', padding: 24 }}>
                  No student data available. Ensure Review 1 and Review 2 are published first.
                </td>
              </tr>
            )}
            {rows.length > 0 && filteredRows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...cellStyle, color: '#94a3b8', textAlign: 'center', padding: 24 }}>
                  No students match the filter &ldquo;{regNoFilter}&rdquo;.
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
