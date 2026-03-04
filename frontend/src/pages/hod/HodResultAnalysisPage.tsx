/**
 * HodResultAnalysisPage
 *
 * 1. Shows department section cards  (from /api/obe/progress)
 *    Each card: section name, batch, course, dept, subjects count, student count
 *
 * 2. On section click → 3 tabs:
 *    📋 Mark Analysis  — student rows × subject columns
 *    📊 Bell Graph     — multi-coloured line per subject over range buckets
 *    🏆 Ranking        — podium top-3 + full table (sum of all subject totals)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  fetchClassTypeWeights,
  fetchCiaMarks,
  fetchMyTeachingAssignments,
  fetchPublishedFormative,
  fetchPublishedModelSheet,
  fetchPublishedReview1,
  fetchPublishedReview2,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  ClassTypeWeightsItem,
  TeachingAssignmentItem,
} from '../../services/obe';
import { fetchTeachingAssignmentRoster } from '../../services/roster';
import fetchWithAuth from '../../services/fetchAuth';
import DownloadReportModal from '../obe/result_analysis/DownloadReportModal';
import { getCachedMe } from '../../services/auth';
import { SheetCol, SheetRow } from '../obe/result_analysis/MarkAnalysisSheetPage';

/* ─────────────────────── TYPES ─────────────────────── */

type ObeProgressExam = { assessment: string; rows_filled: number; total_students: number; percentage: number; published: boolean };
type ObeProgressTA  = { id: number | null; subject_code: string | null; subject_name: string | null; enabled_assessments: string[]; exam_progress: ObeProgressExam[] };
type ObeProgressStaff = { id: number; name: string; user_id: number | null; teaching_assignments: ObeProgressTA[] };
type ObeProgressSection = {
  id: number | null;
  name: string | null;
  batch: { id: number | null; name: string | null };
  course: { id: number | null; name: string | null };
  department: { id: number | null; code: string | null; name: string | null; short_name: string | null };
  staff: ObeProgressStaff[];
};
type ObeProgressResponse = {
  role: string;
  academic_year: { id: number | null; name: string | null } | null;
  department: { id: number | null; code: string | null; name: string | null; short_name: string | null } | null;
  sections: ObeProgressSection[];
};

type CycleKey = 'cycle1' | 'cycle2' | 'model';
type ViewKey  = 'marks' | 'bell' | 'ranking';

type TaSlot = {
  taId: number;
  subjectCode: string;
  subjectName: string;
  enabledAssessments: string[];
  classType?: string | null;
};

type Student = { id: number; regNo: string; name: string };

type TaCacheEntry = {
  roster: Student[];
  totals: Map<number, number | null>;
};

/* ─────────────────────── CONSTANTS ─────────────────────── */

const RANGES = [
  { label: '0–9',    min: 0,  max: 9   },
  { label: '10–19',  min: 10, max: 19  },
  { label: '20–29',  min: 20, max: 29  },
  { label: '30–39',  min: 30, max: 39  },
  { label: '40–49',  min: 40, max: 49  },
  { label: '50–59',  min: 50, max: 59  },
  { label: '60–69',  min: 60, max: 69  },
  { label: '70–79',  min: 70, max: 79  },
  { label: '80–89',  min: 80, max: 89  },
  { label: '90–100', min: 90, max: 100 },
];

const SUBJECT_COLORS = [
  '#2563eb','#10b981','#f59e0b','#ef4444','#7c3aed',
  '#0891b2','#be185d','#c2410c','#065f46','#1d4ed8',
];

/* ─────────────────────── HELPERS ─────────────────────── */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));
const toNum  = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function inferCType(ea: string[], classType?: string | null): 'THEORY' | 'TCPR' | 'LAB' {
  const ct = String(classType || '').toUpperCase();
  if (ct) {
    if (ct === 'THEORY' || ct === 'TCPL' || ct === 'SPECIAL') return 'THEORY';
    if (ct === 'TCPR' || ct === 'PROJECT') return 'TCPR';
    if (ct === 'LAB' || ct === 'PRACTICAL') return 'LAB';
  }
  const s = new Set((ea || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
  if (s.has('formative1') || s.has('formative2')) return 'THEORY';
  if (s.has('review1') || s.has('review2')) return 'TCPR';
  return 'LAB';
}

async function fetchTaTotal(
  taId: number,
  cycle: CycleKey,
  subjectCode: string,
  enabledAssessments: string[],
  classType: string | null | undefined,
  weights: Record<string, ClassTypeWeightsItem>,
): Promise<TaCacheEntry> {
  let roster: Student[] = [];
  try {
    const resp = await fetchTeachingAssignmentRoster(taId);
    roster = (resp.students || []).map((s) => ({ id: s.id, regNo: s.reg_no, name: s.name }));
  } catch { /* ignore */ }

  const totals = new Map<number, number | null>();
  if (roster.length === 0) return { roster, totals };

  const ct  = inferCType(enabledAssessments, classType);
  const wt  = (weights as any)[ct] || (weights as any)['THEORY'];
  const wCia = Number((wt as any)?.cia_weight ?? (wt as any)?.cia1 ?? 6);
  const wSsa = Number((wt as any)?.ssa_weight ?? (wt as any)?.ssa1 ?? 2);
  const wFa  = Number((wt as any)?.fa_weight  ?? (wt as any)?.fa1  ?? 3);

  if (cycle === 'model') {
    const mr: Record<string, any> = {};
    try {
      const resp = await fetchPublishedModelSheet(subjectCode, taId);
      const m = (resp as any)?.data?.marks || (resp as any)?.marks || {};
      for (const [sid, qm] of Object.entries(m))
        mr[sid] = Object.values(qm as any).reduce((s: number, v) => s + (Number(v) || 0), 0);
    } catch { /* ignore */ }
    for (const s of roster) {
      const v = toNum(mr[String(s.id)] ?? null);
      totals.set(s.id, v == null ? null : clamp(v, 0, 100));
    }
    return { roster, totals };
  }

  const sfx = cycle === 'cycle1' ? '1' : '2';
  const [ciaRes, ssaRes, faRes] = await Promise.allSettled([
    fetchCiaMarks(`cia${sfx}` as any, subjectCode, taId),
    cycle === 'cycle1' ? fetchPublishedSsa1(subjectCode, taId) : fetchPublishedSsa2(subjectCode, taId),
    ct === 'TCPR'
      ? (cycle === 'cycle1' ? fetchPublishedReview1(subjectCode) : fetchPublishedReview2(subjectCode))
      : fetchPublishedFormative(cycle === 'cycle1' ? 'formative1' : 'formative2', subjectCode, taId),
  ]);

  const ciaRaw: Record<string, any> = ciaRes.status === 'fulfilled' ? ((ciaRes.value as any)?.marks || {}) : {};
  const ssaRaw: Record<string, any> = ssaRes.status === 'fulfilled' ? ((ssaRes.value as any)?.marks || {}) : {};
  const faRaw:  Record<string, any> = faRes.status  === 'fulfilled'
    ? ((faRes.value as any)?.marks || (faRes.value as any)?.data?.marks || {})
    : {};

  for (const s of roster) {
    const sid   = String(s.id);
    const ciaV  = toNum(ciaRaw[sid] ?? null);
    let   ssaV  = toNum(ssaRaw[sid] ?? null);
    if (ssaV != null && ssaV > 20) ssaV = ssaV / 2;
    const faEntry = faRaw[sid];
    const faV  = faEntry != null
      ? (typeof faEntry === 'object' ? toNum(faEntry?.total) : toNum(faEntry))
      : null;
    if (ct === 'LAB') { totals.set(s.id, ciaV == null ? null : clamp(ciaV, 0, 100)); continue; }
    const parts = [
      { val: ciaV, max: 25, w: wCia },
      { val: ssaV, max: 20, w: wSsa },
      { val: faV,  max: 15, w: wFa  },
    ].filter((x) => x.val != null);
    if (parts.length === 0) { totals.set(s.id, null); continue; }
    const wSum   = parts.reduce((s, x) => s + x.w, 0);
    const wScore = parts.reduce((s, x) => s + (x.val! / x.max) * x.w, 0);
    totals.set(s.id, clamp(Math.round((wScore / wSum) * 100), 0, 100));
  }
  return { roster, totals };
}

function scoreColor(v: number | null) {
  if (v == null) return '#d1d5db';
  if (v < 40)   return '#dc2626';
  if (v < 50)   return '#d97706';
  if (v < 75)   return '#2563eb';
  return '#059669';
}

/* ─────────────────────── SECTION CARD ─────────────────────── */

function SectionCard({
  sec, subjectCount, studentCount, onClick,
}: { sec: ObeProgressSection; subjectCount: number; studentCount: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.1s' }}
      onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#2563eb'; b.style.boxShadow='0 6px 20px rgba(37,99,235,0.15)'; b.style.transform='translateY(-2px)'; }}
      onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#e5e7eb'; b.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; b.style.transform='translateY(0)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>{sec.name || 'Section'}</div>
        <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>▶ View</span>
      </div>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
        {sec.batch?.name && <span style={{ fontWeight: 600 }}>{sec.batch.name}</span>}
        {sec.batch?.name && sec.course?.name && <span style={{ color: '#9ca3af' }}> · </span>}
        {sec.course?.name && <span>{sec.course.name}</span>}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {sec.department?.short_name && (
          <span style={{ background: '#f0fdf4', color: '#059669', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{sec.department.short_name}</span>
        )}
        <span style={{ background: '#faf5ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
          {subjectCount} Subject{subjectCount !== 1 ? 's' : ''}
        </span>
        {studentCount > 0 && (
          <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
            {studentCount} Students
          </span>
        )}
      </div>
    </button>
  );
}

/* ─────────────────────── MARK ANALYSIS VIEW ─────────────────────── */

function MarkAnalysisView({ taSlots, taCache, cycle }: { taSlots: TaSlot[]; taCache: Map<string, TaCacheEntry>; cycle: CycleKey }) {
  // IMPORTANT: don't union student rosters across subjects.
  // Some subjects (electives/shared) can have different rosters and create anomalies.
  // Use a single canonical roster: the largest roster among the subject TAs.
  const classRoster = useMemo(() => {
    let best: Student[] = [];
    for (const slot of taSlots) {
      const cached = taCache.get(`${slot.taId}_${cycle}`);
      if (cached?.roster?.length && cached.roster.length > best.length) best = cached.roster;
    }
    return [...best].sort((a, b) => a.regNo.localeCompare(b.regNo));
  }, [taSlots, taCache, cycle]);

  const hasAnyRoster = useMemo(() => {
    for (const slot of taSlots) {
      const cached = taCache.get(`${slot.taId}_${cycle}`);
      if ((cached?.roster?.length || 0) > 0) return true;
    }
    return false;
  }, [taSlots, taCache, cycle]);

  if (classRoster.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
        {hasAnyRoster ? 'No mark data for this cycle.' : 'Loading student list…'}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(600, 320 + taSlots.length * 130), fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#1e3a5f' }}>
            <th style={{ border: '1px solid #2d4f7a', padding: '10px 14px', color: '#fff', textAlign: 'left', fontWeight: 700, minWidth: 110 }}>Roll No.</th>
            <th style={{ border: '1px solid #2d4f7a', padding: '10px 14px', color: '#fff', textAlign: 'left', fontWeight: 700, minWidth: 200 }}>Name</th>
            {taSlots.map((slot, i) => (
              <th key={slot.taId} style={{ border: '1px solid #2d4f7a', padding: '10px 12px', color: '#fff', textAlign: 'center', fontWeight: 800, minWidth: 120, borderBottom: `3px solid ${SUBJECT_COLORS[i % SUBJECT_COLORS.length]}` }}>
                <div style={{ fontSize: 12 }}>{slot.subjectCode}</div>
                <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{slot.subjectName}</div>
              </th>
            ))}
            <th style={{ border: '1px solid #2d4f7a', padding: '10px 12px', color: '#fef08a', textAlign: 'center', fontWeight: 800, minWidth: 90, background: 'rgba(254,240,138,0.15)' }}>Avg/100</th>
          </tr>
        </thead>
        <tbody>
          {classRoster.map((student, idx) => {
            const scores = taSlots.map((slot) => taCache.get(`${slot.taId}_${cycle}`)?.totals.get(student.id) ?? null);
            const valid  = scores.filter((v): v is number => v !== null);
            const avg    = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
            return (
              <tr key={student.id}
                style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#eff6ff'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#fff' : '#f9fafb'; }}
              >
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 14px', color: '#6b7280', fontWeight: 500 }}>{student.regNo}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 14px', color: '#111827', fontWeight: 600 }}>{student.name}</td>
                {scores.map((score, si) => (
                  <td key={si} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'center', fontWeight: score != null ? 700 : 400, color: score != null ? scoreColor(score) : '#d1d5db', background: score != null && score < 50 ? 'rgba(254,226,226,0.35)' : undefined, fontSize: score != null ? 14 : 13 }}>
                    {score != null ? score : '—'}
                  </td>
                ))}
                <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'center', fontWeight: 900, fontSize: avg != null ? 15 : 13, color: avg != null ? scoreColor(avg) : '#d1d5db', background: 'rgba(254,240,138,0.25)' }}>
                  {avg != null ? avg : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────── BELL GRAPH VIEW ─────────────────────── */

function BellGraphView({ taSlots, taCache, cycle }: { taSlots: TaSlot[]; taCache: Map<string, TaCacheEntry>; cycle: CycleKey }) {
  const classRoster = useMemo(() => {
    let best: Student[] = [];
    for (const slot of taSlots) {
      const cached = taCache.get(`${slot.taId}_${cycle}`);
      if (cached?.roster?.length && cached.roster.length > best.length) best = cached.roster;
    }
    return best;
  }, [taSlots, taCache, cycle]);

  const hasAnyRoster = useMemo(() => {
    for (const slot of taSlots) {
      const cached = taCache.get(`${slot.taId}_${cycle}`);
      if ((cached?.roster?.length || 0) > 0) return true;
    }
    return false;
  }, [taSlots, taCache, cycle]);

  const chartData = useMemo(() =>
    RANGES.map((range) => {
      const row: Record<string, any> = { label: range.label };
      for (const slot of taSlots) {
        const cached = taCache.get(`${slot.taId}_${cycle}`);
        row[slot.subjectCode] = cached
          ? classRoster.reduce((acc, s) => {
            const v = cached.totals.get(s.id);
            return acc + (v != null && v >= range.min && v <= range.max ? 1 : 0);
          }, 0)
          : 0;
      }
      return row;
    }),
  [taSlots, taCache, cycle, classRoster]);

  if (taSlots.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No subjects found.</div>;
  if (classRoster.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>{hasAnyRoster ? 'No mark data for this cycle.' : 'Loading student list…'}</div>;

  return (
    <div>
      {/* Legend */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {taSlots.map((slot, i) => (
          <div key={slot.taId} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#374151' }}>
            <div style={{ width: 28, height: 4, borderRadius: 2, background: SUBJECT_COLORS[i % SUBJECT_COLORS.length] }} />
            <span style={{ fontWeight: 700 }}>{slot.subjectCode}</span>
            <span style={{ color: '#9ca3af', fontSize: 11 }}>{slot.subjectName}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '24px 16px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} angle={-30} textAnchor="end" interval={0}
              label={{ value: 'Score Range', position: 'insideBottom', offset: -28, style: { fontSize: 12, fill: '#64748b' } }}
            />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false}
              label={{ value: 'No. of Students', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#64748b' } }}
            />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
              formatter={(val: number, name: string) => [`${val} students`, name]}
            />
            <Legend wrapperStyle={{ paddingTop: 30, fontSize: 12 }} />
            {taSlots.map((slot, i) => (
              <Line key={slot.taId} type="monotone" dataKey={slot.subjectCode}
                stroke={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} strokeWidth={2.5}
                dot={{ r: 4, fill: SUBJECT_COLORS[i % SUBJECT_COLORS.length] }} activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─────────────────────── RANKING VIEW ─────────────────────── */

function CupSVG({ rank }: { rank: 1 | 2 | 3 }) {
  const [c1, c2, c3] = rank === 1 ? ['#FFD700','#FFA500','#FF8C00'] : rank === 2 ? ['#E8E8E8','#C0C0C0','#A0A0A0'] : ['#CD7F32','#A0522D','#8B4513'];
  return (
    <svg width={52} height={52} viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}>
      <defs><linearGradient id={`hcg${rank}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={c1}/><stop offset="100%" stopColor={c3}/></linearGradient></defs>
      <path d="M30 10 L70 10 L65 55 Q50 65 35 55 Z" fill={`url(#hcg${rank})`}/>
      <rect x="10" y="10" width="20" height="8" fill={`url(#hcg${rank})`} opacity="0.75"/>
      <rect x="70" y="10" width="20" height="8" fill={`url(#hcg${rank})`} opacity="0.75"/>
      <path d="M10 10 Q10 35 30 45 L30 55 L70 55 L70 45 Q90 35 90 10 Z" fill="none" stroke={c2} strokeWidth="3"/>
      <rect x="42" y="55" width="16" height="18" fill={`url(#hcg${rank})`}/>
      <rect x="30" y="70" width="40" height="10" rx="3" fill={`url(#hcg${rank})`}/>
      <text x="50" y="38" textAnchor="middle" fontSize="24" fill="white" opacity="0.55" fontWeight="bold">{rank}</text>
    </svg>
  );
}

function RankingView({ taSlots, taCache, cycle }: { taSlots: TaSlot[]; taCache: Map<string, TaCacheEntry>; cycle: CycleKey }) {
  const classRoster = useMemo(() => {
    let best: Student[] = [];
    for (const slot of taSlots) {
      const cached = taCache.get(`${slot.taId}_${cycle}`);
      if (cached?.roster?.length && cached.roster.length > best.length) best = cached.roster;
    }
    return [...best].sort((a, b) => a.regNo.localeCompare(b.regNo));
  }, [taSlots, taCache, cycle]);

  const hasAnyRoster = useMemo(() => {
    for (const slot of taSlots) {
      const cached = taCache.get(`${slot.taId}_${cycle}`);
      if ((cached?.roster?.length || 0) > 0) return true;
    }
    return false;
  }, [taSlots, taCache, cycle]);

  const ranked = useMemo(() =>
    classRoster.map((student) => {
      const scores = taSlots.map((slot) => taCache.get(`${slot.taId}_${cycle}`)?.totals.get(student.id) ?? null);
      const valid  = scores.filter((v): v is number => v !== null);
      const sum    = valid.reduce((a, b) => a + b, 0);
      return { student, scores, sum, avg: valid.length > 0 ? Math.round(sum / valid.length) : null, count: valid.length };
    }).filter((r) => r.count > 0).sort((a, b) => b.sum - a.sum),
  [classRoster, taSlots, taCache, cycle]);

  if (classRoster.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>{hasAnyRoster ? 'No mark data for ranking.' : 'Loading student list…'}</div>;

  if (ranked.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No data for ranking.</div>;

  const podium = ranked.slice(0, 3);
  const podiumOrder = [1, 0, 2]; // display order: 2nd, 1st, 3rd
  const HEIGHTS = [160, 210, 130];
  const PBGS = ['#16213e','#1a1a2e','#0f3460'];

  return (
    <div>
      {/* Podium */}
      <div style={{ background: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', borderRadius: 20, padding: '36px 24px 28px', marginBottom: 28 }}>
        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 32, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          🏆 Class Rankings — {cycle === 'cycle1' ? 'Cycle 1' : cycle === 'cycle2' ? 'Cycle 2' : 'Model'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 14 }}>
          {podiumOrder.map((pi) => {
            const entry = podium[pi];
            if (!entry) return <div key={pi} style={{ width: 150 }} />;
            const rank = (pi + 1) as 1|2|3;
            return (
              <div key={pi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 150 }}>
                <CupSVG rank={rank} />
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', textAlign: 'center', marginTop: 6, border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>#{rank}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.student.name}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{entry.student.regNo}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: rank===1?'#FFD700':rank===2?'#E8E8E8':'#CD7F32', marginTop: 4 }}>{entry.sum}<span style={{ fontSize: 11, color: '#64748b', marginLeft: 2 }}>pts</span></div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Avg {entry.avg ?? '—'}/100</div>
                </div>
                <div style={{ width: 130, height: HEIGHTS[pi] - 100, background: PBGS[pi], borderRadius: '8px 8px 0 0', marginTop: 6, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 26, fontWeight: 900 }}>
                  {rank}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ background: '#1e3a5f', padding: '12px 18px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          Full Rankings — {ranked.length} Students
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151', width: 60 }}>Rank</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', minWidth: 110 }}>Roll No.</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', minWidth: 180 }}>Name</th>
                {taSlots.map((slot, i) => (
                  <th key={slot.taId} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length], minWidth: 90, fontSize: 11 }}>{slot.subjectCode}</th>
                ))}
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#1e3a5f', width: 80, background: '#eff6ff' }}>Total</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#1e3a5f', width: 80, background: '#fef9c3' }}>Avg</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((entry, idx) => {
                const rank = idx + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                return (
                  <tr key={entry.student.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderTop: '1px solid #f0f0f0' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#eff6ff'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#fff' : '#fafafa'; }}
                  >
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: rank <= 3 ? '#f59e0b' : '#6b7280', fontSize: rank <= 3 ? 16 : 14 }}>{medal || rank}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontWeight: 500 }}>{entry.student.regNo}</td>
                    <td style={{ padding: '10px 14px', color: '#111827', fontWeight: 600 }}>{entry.student.name}</td>
                    {entry.scores.map((score, si) => (
                      <td key={si} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: score != null ? 700 : 400, color: score != null ? scoreColor(score) : '#d1d5db' }}>
                        {score != null ? score : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 900, color: '#1e3a5f', background: '#eff6ff', fontSize: 15 }}>{entry.sum}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: entry.avg !== null ? scoreColor(entry.avg) : '#d1d5db', background: 'rgba(254,240,138,0.25)' }}>{entry.avg ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── MAIN COMPONENT ─────────────────────── */

export default function HodResultAnalysisPage(): JSX.Element {
  const [progressData,    setProgressData   ] = useState<ObeProgressResponse | null>(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError,   setProgressError  ] = useState<string | null>(null);
  const [weights,         setWeights        ] = useState<Record<string, ClassTypeWeightsItem>>({});
  const [selectedKey,     setSelectedKey    ] = useState<string | null>(null);
  const [activeCycle,     setActiveCycle    ] = useState<CycleKey>('cycle1');
  const [activeView,      setActiveView     ] = useState<ViewKey>('marks');
  const [search,          setSearch         ] = useState('');
  const [marksLoading,    setMarksLoading   ] = useState(false);
  const [taCache,         setTaCache        ] = useState<Map<string, TaCacheEntry>>(new Map());
  const [showDownload,    setShowDownload   ] = useState(false);

  /* fetch progress */
  useEffect(() => {
    let mounted = true;
    setProgressLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth('/api/obe/progress');
        if (res.status === 403) {
          // Fallback for accounts that can't access /api/obe/progress
          // (e.g., some ADVISOR accounts). Build section cards from teaching assignments.
          const list = await fetchMyTeachingAssignments().catch(() => [] as TeachingAssignmentItem[]);

          const bySection = new Map<string, TeachingAssignmentItem[]>();
          for (const ta of list) {
            const k = String(ta.section_id ?? ta.section_name ?? 'section');
            if (!bySection.has(k)) bySection.set(k, []);
            bySection.get(k)!.push(ta);
          }

          const sections: ObeProgressSection[] = Array.from(bySection.values()).map((tas, idx) => {
            const first = tas[0];
            const sectionId = (typeof first.section_id === 'number' ? first.section_id : null) ?? (-(idx + 1));
            const sectionName = first.section_name ?? 'Section';
            const batchName = (first.batch as any)?.name ?? first.academic_year ?? null;
            const courseName = first.semester != null ? `Semester ${first.semester}` : null;
            const dept = first.department || null;
            return {
              id: sectionId,
              name: sectionName,
              batch: { id: null, name: batchName },
              course: { id: null, name: courseName },
              department: {
                id: (dept as any)?.id ?? null,
                code: (dept as any)?.code ?? null,
                name: (dept as any)?.name ?? null,
                short_name: (dept as any)?.short_name ?? null,
              },
              staff: [
                {
                  id: 0,
                  name: '',
                  user_id: null,
                  teaching_assignments: tas
                    .filter((t) => t && typeof t.id === 'number' && t.subject_code)
                    .map((t) => ({
                      id: t.id,
                      subject_code: t.subject_code,
                      subject_name: t.subject_name,
                      enabled_assessments: [],
                      exam_progress: [],
                      class_type: t.class_type ?? null,
                    })) as any,
                },
              ],
            };
          });

          const js: ObeProgressResponse = { role: 'fallback', academic_year: null, department: null, sections };
          if (mounted) {
            setProgressData(js);
            setProgressError(null);
          }
          return;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const js: ObeProgressResponse = await res.json();
        if (mounted) setProgressData(js);
      } catch (e: any) {
        if (mounted) setProgressError(e?.message || 'Failed to load class data');
      } finally {
        if (mounted) setProgressLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => { fetchClassTypeWeights().then(setWeights).catch(() => {}); }, []);

  const sections: ObeProgressSection[] = progressData?.sections ?? [];

  // Create stable unique keys per card (backend can return null section IDs).
  const sectionItems = useMemo(() => {
    return sections.map((sec, idx) => {
      const fallback = [sec.name, sec.batch?.name, sec.course?.name, sec.department?.short_name].filter(Boolean).join('|') || 'section';
      return {
        key: sec.id != null ? `id:${sec.id}` : `idx:${idx}:${fallback}`,
        sec,
      };
    });
  }, [sections]);

  const filteredSectionItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sectionItems;
    return sectionItems.filter(({ sec }) =>
      (sec.name || '').toLowerCase().includes(q) ||
      (sec.batch?.name || '').toLowerCase().includes(q) ||
      (sec.course?.name || '').toLowerCase().includes(q),
    );
  }, [sectionItems, search]);

  const selectedSectionItem = sectionItems.find((x) => x.key === selectedKey) ?? null;
  const selectedSection = selectedSectionItem?.sec ?? null;

  const taSlots: TaSlot[] = useMemo(() => {
    if (!selectedSection) return [];
    const slots: TaSlot[] = [];
    const seen = new Set<number>();
    for (const staff of selectedSection.staff) {
      for (const ta of staff.teaching_assignments) {
        if (!ta.id || !ta.subject_code || seen.has(ta.id)) continue;
        seen.add(ta.id);
        slots.push({
          taId: ta.id,
          subjectCode: ta.subject_code,
          subjectName: ta.subject_name || ta.subject_code,
          enabledAssessments: ta.enabled_assessments || [],
          classType: (ta as any)?.class_type ?? null,
        });
      }
    }
    return slots;
  }, [selectedSection]);

  /* fetch marks when taSlots / cycle changes */
  useEffect(() => {
    if (taSlots.length === 0) return;
    const missing = taSlots.filter((s) => !taCache.has(`${s.taId}_${activeCycle}`));
    if (missing.length === 0) return;
    let mounted = true;
    setMarksLoading(true);
    Promise.all(
      missing.map((slot) =>
        fetchTaTotal(slot.taId, activeCycle, slot.subjectCode, slot.enabledAssessments, slot.classType, weights)
          .then((entry) => ({ key: `${slot.taId}_${activeCycle}`, entry }))
      ),
    ).then((results) => {
      if (!mounted) return;
      setTaCache((prev) => {
        const next = new Map(prev);
        for (const { key, entry } of results) next.set(key, entry);
        return next;
      });
    }).finally(() => { if (mounted) setMarksLoading(false); });
    return () => { mounted = false; };
  }, [taSlots, activeCycle, weights]);

  /* ── derive cols / rows / totals for DownloadReportModal ── */
  const dlClassRoster = useMemo(() => {
    let best: Student[] = [];
    for (const slot of taSlots) {
      const cached = taCache.get(`${slot.taId}_${activeCycle}`);
      if (cached?.roster?.length && cached.roster.length > best.length) best = cached.roster;
    }
    return [...best].sort((a, b) => a.regNo.localeCompare(b.regNo));
  }, [taSlots, taCache, activeCycle]);

  const dlCols: SheetCol[] = useMemo(() =>
    taSlots.map((slot) => ({
      key: slot.subjectCode,
      label: `${slot.subjectCode} — ${slot.subjectName}`,
      max: 100,
      weight: 1,
    })),
  [taSlots]);

  const dlRows: SheetRow[] = useMemo(() =>
    dlClassRoster.map((student) => {
      const marks: Record<string, number | null> = {};
      let validCount = 0, sum = 0;
      for (const slot of taSlots) {
        const v = taCache.get(`${slot.taId}_${activeCycle}`)?.totals.get(student.id) ?? null;
        marks[slot.subjectCode] = v;
        if (v != null) { sum += v; validCount++; }
      }
      const avg = validCount > 0 ? Math.round(sum / validCount) : null;
      return { id: student.id, regNo: student.regNo, name: student.name, marks, total100: avg };
    }),
  [dlClassRoster, taSlots, taCache, activeCycle]);

  const dlTotals: number[] = useMemo(() =>
    dlRows.map((r) => r.total100 ?? 0),
  [dlRows]);

  function studentCount(sec: ObeProgressSection) {
    for (const st of sec.staff)
      for (const ta of st.teaching_assignments)
        for (const ep of ta.exam_progress)
          if (ep.total_students > 0) return ep.total_students;
    return 0;
  }

  const cycleLabels: Record<CycleKey, string> = { cycle1: 'Cycle 1', cycle2: 'Cycle 2', model: 'Model' };

  /* ── HOD/Advisor download metadata ── */
  const _hodUser = (() => {
    const me = getCachedMe() as any;
    if (!me) return '';
    const full = `${me.first_name || ''} ${me.last_name || ''}`.replace(/\s+/g, ' ').trim();
    return full || me.profile?.full_name || me.username || '';
  })();
  const _hodRoleLabel = progressData?.role === 'HOD' ? 'HOD' : 'Advisor';
  const dlStaffName  = _hodUser;
  const _batchYear   = selectedSection?.batch?.name ? selectedSection.batch.name.slice(0, 4) : '';
  const _deptShort   = selectedSection?.department?.short_name || selectedSection?.department?.code || '';
  const dlSectionName = selectedSection ? [selectedSection.name, _batchYear, _deptShort].filter(Boolean).join(' ') : '';

  /* ── SECTION DETAIL VIEW ── */
  if (selectedSection) {
    return (
      <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

        {/* Header */}
        <div style={{ background: '#1e3a5f', color: '#fff', padding: '16px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setSelectedKey(null); setTaCache(new Map()); }}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
            >
              ← Back
            </button>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{selectedSection.name} — Result Analysis</div>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 1 }}>
                {[selectedSection.batch?.name, selectedSection.course?.name, selectedSection.department?.short_name].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {marksLoading
                ? <span style={{ color: '#93c5fd', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Loading…
                  </span>
                : <span style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>{taSlots.length} Subjects</span>
              }
              <button
                onClick={() => setShowDownload(true)}
                disabled={dlRows.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: dlRows.length > 0 ? '#2563eb' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: dlRows.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, opacity: dlRows.length > 0 ? 1 : 0.5 }}
              >
                ⬇ Download Report
              </button>
            </div>
          </div>

          {/* Cycle tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['cycle1','cycle2','model'] as CycleKey[]).map((c) => (
              <button key={c} onClick={() => setActiveCycle(c)}
                style={{ padding: '8px 20px', border: 'none', borderRadius: '8px 8px 0 0', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: activeCycle===c?'#fff':'rgba(255,255,255,0.12)', color: activeCycle===c?'#1e3a5f':'rgba(255,255,255,0.8)', transition: 'all 0.15s' }}
              >{cycleLabels[c]}</button>
            ))}
          </div>
        </div>

        {/* View sub-tabs */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px' }}>
          <div style={{ display: 'flex', gap: 2, paddingTop: 12 }}>
            {([['marks','📋 Mark Analysis'],['bell','📊 Bell Graph'],['ranking','🏆 Ranking']] as [ViewKey,string][]).map(([k,label]) => (
              <button key={k} onClick={() => setActiveView(k)}
                style={{ padding: '8px 20px', border: 'none', borderBottom: activeView===k?'3px solid #2563eb':'3px solid transparent', background: 'transparent', fontWeight: activeView===k?800:500, fontSize: 13, cursor: 'pointer', color: activeView===k?'#2563eb':'#6b7280', transition: 'color 0.15s, border-color 0.15s' }}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {activeView === 'marks'   && <MarkAnalysisView   taSlots={taSlots} taCache={taCache} cycle={activeCycle} />}
          {activeView === 'bell'    && <BellGraphView      taSlots={taSlots} taCache={taCache} cycle={activeCycle} />}
          {activeView === 'ranking' && <RankingView        taSlots={taSlots} taCache={taCache} cycle={activeCycle} />}
        </div>

        {/* ── Download Report Modal ── */}
        <DownloadReportModal
          open={showDownload}
          onClose={() => setShowDownload(false)}
          courseId={selectedSection.batch?.name || selectedSection.department?.code || ''}
          courseName={selectedSection.course?.name || selectedSection.batch?.name || selectedSection.name || ''}
          ct={taSlots[0]?.classType || ''}
          sectionName={dlSectionName}
          staffLabel={_hodRoleLabel}
          staffName={dlStaffName}
          studentCount={dlClassRoster.length}
          cycleName={cycleLabels[activeCycle]}
          cols={dlCols}
          rows={dlRows}
          totals={dlTotals}
          isClassReport={true}
        />
      </div>
    );
  }

  /* ── SECTION PICKER ── */
  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: 40 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* Header */}
      <div style={{ background: '#1e3a5f', color: '#fff', padding: '24px 28px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 32 }}>📊</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Result Analysis</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
              {progressData?.role === 'HOD' ? 'HOD — all department sections' : progressData?.role === 'ADVISOR' ? 'Advisor — your advised class' : 'Select a section to analyse'}
              {progressData?.academic_year?.name ? ` · AY ${progressData.academic_year.name}` : ''}
            </div>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search section, batch, course…"
            style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {progressLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12, color: '#6b7280' }}>
            <div style={{ width: 26, height: 26, border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Loading sections…
          </div>
        )}
        {progressError && !progressLoading && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', color: '#b91c1c', fontSize: 13 }}>{progressError}</div>
        )}
        {!progressLoading && !progressError && filteredSectionItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 14 }}>{search ? `No sections matching "${search}"` : 'No sections found.'}</div>
        )}
        {!progressLoading && !progressError && sections.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: 'Total Sections', val: sections.length, color: '#1d4ed8', bg: '#eff6ff' },
              { label: 'Showing',        val: filteredSectionItems.length, color: '#059669', bg: '#f0fdf4' },
              { label: 'Dept',           val: progressData?.department?.short_name || progressData?.department?.code || '—', color: '#7c3aed', bg: '#faf5ff' },
            ].map(({ label, val, color, bg }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 8, padding: '6px 14px', fontSize: 12 }}>
                <span style={{ color, fontWeight: 800 }}>{val}</span>
                <span style={{ color: '#6b7280', marginLeft: 5 }}>{label}</span>
              </div>
            ))}
          </div>
        )}
        {!progressLoading && !progressError && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(295px, 1fr))', gap: 16 }}>
            {filteredSectionItems.map(({ key, sec }) => {
              const subjectCount = sec.staff.reduce((n, st) => n + st.teaching_assignments.filter((ta) => ta.id && ta.subject_code).length, 0);
              return (
                <SectionCard key={key} sec={sec} subjectCount={subjectCount} studentCount={studentCount(sec)}
                  onClick={() => { setSelectedKey(key); setActiveView('marks'); setActiveCycle('cycle1'); }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
