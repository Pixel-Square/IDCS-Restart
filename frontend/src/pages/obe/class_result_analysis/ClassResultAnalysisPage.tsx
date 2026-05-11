/**
 * ClassResultAnalysisPage
 *
 * Available to: HOD (all dept classes), ADVISOR (their class only)
 *
 * Sub-views:
 *   1. Range Analysis  — cross-subject pivot table (image reference)
 *   2. Class Results   — student × subject marks with failure highlighting (image reference)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchClassTypeWeights,
  fetchCiaMarks,
  fetchMyTeachingAssignments,
  fetchPublishedFormative,
  fetchPublishedLabSheet,
  fetchPublishedModelSheet,
  fetchPublishedReview1,
  fetchPublishedReview2,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  ClassTypeWeightsItem,
} from '../../../services/obe';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../../../services/roster';
import fetchWithAuth from '../../../services/fetchAuth';
import type { ObeProgressSection, ObeProgressResponse } from '../progressTypes';

type ClassGroup = {
  key: string;
  label: string;
  batchName: string;
  courseName: string;
  sections: ObeProgressSection[];
};

type TaSlot = {
  taId: number;
  subjectCode: string;
  subjectName: string;
  sectionName: string;
  sectionId: number;
  classType: string;
  enabledAssessments: string[];
};

type Student = { id: number; regNo: string; name: string };

type TaCacheEntry = {
  roster: Student[];
  totals: Map<number, number | null>; // studentId → total/100
};

type CycleKey = 'cycle1' | 'cycle2' | 'model';
type ViewKey = 'range' | 'results';

/* ──────────────────── CONSTANTS ──────────────────── */

/** Ranges matching the reference image */
const CLASS_RANGES = [
  { label: '0 TO 9',    min: 0,  max: 9   },
  { label: '10 TO 19',  min: 10, max: 19  },
  { label: '20 TO 29',  min: 20, max: 29  },
  { label: '30 TO 39',  min: 30, max: 39  },
  { label: '40 TO 49',  min: 40, max: 49  },
  { label: '50 TO 57',  min: 50, max: 57  },
  { label: '58 TO 60',  min: 58, max: 60  },
  { label: '61 TO 69',  min: 61, max: 69  },
  { label: '70 TO 79',  min: 70, max: 79  },
  { label: '80 TO 89',  min: 80, max: 89  },
  { label: '90 TO 100', min: 90, max: 100 },
];

const PASS_MARK = 50; // percentage out of 100

/* ──────────────────── HELPERS ──────────────────── */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));
const toNum  = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function inferCycleType(classType: string, enabledAssessments: string[]): 'THEORY' | 'TCPL' | 'TCPR' | 'LAB' {
  const ct = String(classType || '').trim().toUpperCase();
  if (ct === 'TCPL') return 'TCPL';
  const ea = new Set((enabledAssessments || []).map((s) => String(s).trim().toLowerCase()));
  if (ea.has('formative1') || ea.has('formative2')) return 'THEORY';
  if (ea.has('review1') || ea.has('review2')) return 'TCPR';
  return 'LAB';
}

function extractLabSheetTotals(data: any): Record<string, number | null> {
  const clampFn = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));
  const out: Record<string, number | null> = {};
  const rows = data?.sheet?.rowsByStudentId ?? {};
  for (const [sid, row] of Object.entries(rows)) {
    const r = row as any;
    if (r == null) { out[sid] = null; continue; }
    // ciaExam is the scalar total for TCPL (theory component in lab hybrid)
    const ciaExam = Number(r.ciaExam);
    if (Number.isFinite(ciaExam)) { out[sid] = clampFn(ciaExam, 0, 100); continue; }
    // Fallback: sum all available marks
    let total = 0;
    const sumArr = (arr: any) => { if (Array.isArray(arr)) { for (const v of arr) total += Number(v) || 0; } };
    const sumObj = (obj: any) => { if (obj && typeof obj === 'object') { for (const v of Object.values(obj)) total += Number(v) || 0; } };
    sumArr(r.marksA); sumArr(r.marksB); sumObj(r.marksByCo);
    sumObj(r.caaExamByCo); sumObj(r.ciaExamByCo);
    out[sid] = clampFn(total, 0, 100);
  }
  return out;
}

/**
 * Compute total/100 per student for a single TA in a given cycle.
 */
async function computeTaTotal(
  taId: number,
  cycle: CycleKey,
  subjectCode: string,
  classType: string,
  enabledAssessments: string[],
  weights: Record<string, ClassTypeWeightsItem>,
): Promise<{ roster: Student[]; totals: Map<number, number | null> }> {
  // 1. Roster
  let roster: Student[] = [];
  try {
    const resp = await fetchTeachingAssignmentRoster(taId);
    roster = (resp.students || []).map((s: TeachingAssignmentRosterStudent) => ({
      id: s.id,
      regNo: s.reg_no,
      name: s.name,
    }));
  } catch {
    /* ignore */
  }

  const totalsMap = new Map<number, number | null>();
  if (roster.length === 0) return { roster, totals: totalsMap };

  const cType = inferCycleType(classType, enabledAssessments);
  const wtItem: ClassTypeWeightsItem | undefined = weights[cType] || weights['THEORY'];
  const wCia = Number(wtItem?.cia_weight ?? 6);
  const wSsa = Number(wtItem?.ssa_weight ?? 2);
  const wFa  = Number(wtItem?.fa_weight  ?? 3);

  // 2. Fetch marks in parallel
  if (cycle === 'model') {
    const modelRaw: Record<string, any> = {};
    try {
      const resp = await fetchPublishedModelSheet(subjectCode, taId);
      // sum all question marks per student
      const marksData = (resp as any)?.data?.marks || (resp as any)?.marks || {};
      for (const [sid, qMap] of Object.entries(marksData)) {
        const qm = qMap as Record<string, any>;
        const total = Object.values(qm).reduce((s: number, v) => s + (Number(v) || 0), 0);
        modelRaw[sid] = total;
      }
    } catch { /* ignore */ }
    for (const s of roster) {
      const v = toNum(modelRaw[String(s.id)] ?? null);
      totalsMap.set(s.id, v == null ? null : clamp(v, 0, 100));
    }
    return { roster, totals: totalsMap };
  }

  // Cycle 1 or 2
  const sfx = cycle === 'cycle1' ? '1' : '2';
  const formativeKey = cycle === 'cycle1' ? 'formative1' : 'formative2';

  // TCPL: CIA (theory-style) + Lab marks (stored in LabPublishedSheet)
  if (cType === 'TCPL') {
    const [ciaResp, labResp] = await Promise.allSettled([
      fetchCiaMarks(`cia${sfx}` as any, subjectCode, taId),
      fetchPublishedLabSheet(formativeKey, subjectCode, taId),
    ]);
    const ciaRaw: Record<string, any> = ciaResp.status === 'fulfilled' ? ((ciaResp.value as any)?.marks || {}) : {};
    const labRaw: Record<string, number | null> = labResp.status === 'fulfilled'
      ? extractLabSheetTotals((labResp.value as any)?.data)
      : {};
    const ciaMax = 25;
    const labMax = 25;
    for (const s of roster) {
      const sid = String(s.id);
      const ciaV = toNum(ciaRaw[sid] ?? null);
      const labV = labRaw[sid] != null ? labRaw[sid] : null;
      const weights_arr = [
        ...(ciaV != null ? [{ val: ciaV, max: ciaMax, w: wCia }] : []),
        ...(labV != null ? [{ val: labV, max: labMax, w: wFa  }] : []),
      ];
      if (weights_arr.length === 0) { totalsMap.set(s.id, null); continue; }
      const wSum   = weights_arr.reduce((acc, x) => acc + x.w, 0);
      const wScore = weights_arr.reduce((acc, x) => acc + (x.val! / x.max) * x.w, 0);
      totalsMap.set(s.id, clamp(Math.round((wScore / wSum) * 100), 0, 100));
    }
    return { roster, totals: totalsMap };
  }

  const [ciaResp, ssaResp, faResp] = await Promise.allSettled([
    fetchCiaMarks(`cia${sfx}` as any, subjectCode, taId),
    cycle === 'cycle1' ? fetchPublishedSsa1(subjectCode, taId) : fetchPublishedSsa2(subjectCode, taId),
    cType === 'TCPR'
      ? (cycle === 'cycle1' ? fetchPublishedReview1(subjectCode) : fetchPublishedReview2(subjectCode))
      : fetchPublishedFormative(formativeKey, subjectCode, taId),
  ]);

  const ciaRaw: Record<string, any> = ciaResp.status === 'fulfilled' ? ((ciaResp.value as any)?.marks || {}) : {};
  const ssaRaw: Record<string, any> = ssaResp.status === 'fulfilled' ? ((ssaResp.value as any)?.marks || {}) : {};
  const faRaw:  Record<string, any> = faResp.status  === 'fulfilled'
    ? ((faResp.value as any)?.marks || (faResp.value as any)?.data?.marks || {})
    : {};

  // Max values
  const ciaMax = 25; // 25 per CIA (could be 30 for some, but 25 is standard)
  const ssaMax = 20; // 20 per SSA
  const faMax  = 15; // 15 per FA/Review

  for (const s of roster) {
    const sid = String(s.id);
    const ciaV = toNum(ciaRaw[sid] ?? null);
    let ssaV = toNum(ssaRaw[sid] ?? null);
    if (ssaV != null && ssaV > ssaMax) ssaV = ssaV / 2; // 40→20 halving
    const faEntry = faRaw[sid];
    const faV = faEntry != null
      ? (typeof faEntry === 'object' ? toNum(faEntry?.total) : toNum(faEntry))
      : null;

    if (cType === 'LAB') {
      // Only CIA, max 100
      totalsMap.set(s.id, ciaV == null ? null : clamp(ciaV, 0, 100));
      continue;
    }

    const weights_arr = [
      { val: ciaV, max: ciaMax, w: wCia },
      { val: ssaV, max: ssaMax, w: wSsa },
      { val: faV,  max: faMax,  w: wFa  },
    ].filter((x) => x.val != null);

    if (weights_arr.length === 0) {
      totalsMap.set(s.id, null);
      continue;
    }

    const wSum    = weights_arr.reduce((s, x) => s + x.w, 0);
    const wScore  = weights_arr.reduce((s, x) => s + (x.val! / x.max) * x.w, 0);
    const total   = Math.round((wScore / wSum) * 100);
    totalsMap.set(s.id, clamp(total, 0, 100));
  }

  return { roster, totals: totalsMap };
}

/* ──────────────────── COMPONENT ──────────────────── */

type Props = {
  canViewProgress: boolean;
};

export default function ClassResultAnalysisPage({ canViewProgress }: Props): JSX.Element {
  /* ── Progress data ── */
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError,   setProgressError  ] = useState<string | null>(null);
  const [progressData,    setProgressData   ] = useState<ObeProgressResponse | null>(null);

  /* ── Weights ── */
  const [weights, setWeights] = useState<Record<string, ClassTypeWeightsItem>>({});

  /* ── UI State ── */
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [activeCycle,      setActiveCycle      ] = useState<CycleKey>('cycle1');
  const [activeView,       setActiveView       ] = useState<ViewKey>('range');
  const [failureFilter,    setFailureFilter    ] = useState<number | null>(null);

  /* ── Marks cache ── */
  const [marksLoading, setMarksLoading] = useState(false);
  const [taCache,      setTaCache     ] = useState<Map<string, TaCacheEntry>>(new Map());

  /* ── Fetch progress on mount ── */
  useEffect(() => {
    let mounted = true;
    setProgressLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth('/api/obe/progress');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const js: ObeProgressResponse = await res.json();
        if (!mounted) return;
        setProgressData(js);
      } catch (e: any) {
        if (mounted) setProgressError(e?.message || 'Failed to load class data');
      } finally {
        if (mounted) setProgressLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* ── Fetch weights on mount ── */
  useEffect(() => {
    fetchClassTypeWeights().then((w) => setWeights(w)).catch(() => {});
  }, []);

  /* ── Class groups (batch + course grouping) ── */
  const classGroups: ClassGroup[] = useMemo(() => {
    const map = new Map<string, ObeProgressSection[]>();
    for (const sec of progressData?.sections ?? []) {
      const k = `${sec.batch?.id ?? 'nb'}_${sec.course?.id ?? 'nc'}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(sec);
    }
    return Array.from(map.entries()).map(([key, secs]) => ({
      key,
      label: [secs[0].batch?.name, secs[0].course?.name].filter(Boolean).join(' — ') || 'Class',
      batchName: secs[0].batch?.name ?? '',
      courseName: secs[0].course?.name ?? '',
      sections: secs,
    }));
  }, [progressData]);

  /* Auto-select first group */
  useEffect(() => {
    if (classGroups.length > 0 && !selectedGroupKey) {
      setSelectedGroupKey(classGroups[0].key);
    }
  }, [classGroups, selectedGroupKey]);

  /* ── All TAs in selected group ── */
  const selectedGroup = useMemo(
    () => classGroups.find((g) => g.key === selectedGroupKey) ?? null,
    [classGroups, selectedGroupKey],
  );

  const taSlots: TaSlot[] = useMemo(() => {
    if (!selectedGroup) return [];
    const slots: TaSlot[] = [];
    for (const sec of selectedGroup.sections) {
      const secId = sec.id ?? -1;
      const secName = sec.name ?? '?';
      for (const st of sec.staff) {
        for (const ta of st.teaching_assignments) {
          if (!ta.id || !ta.subject_code) continue;
          slots.push({
            taId: ta.id,
            subjectCode: ta.subject_code,
            subjectName: ta.subject_name ?? ta.subject_code,
            sectionName: secName,
            sectionId: secId,
            classType: String(ta.class_type || '').trim().toUpperCase() || 'THEORY',
            enabledAssessments: ta.enabled_assessments || [],
          });
        }
      }
    }
    // Deduplicate by taId
    const seen = new Set<number>();
    return slots.filter((s) => { if (seen.has(s.taId)) return false; seen.add(s.taId); return true; });
  }, [selectedGroup]);

  /* ── Fetch marks when group/cycle changes ── */
  useEffect(() => {
    if (taSlots.length === 0) return;
    const keys = taSlots.map((s) => `${s.taId}_${activeCycle}`);
    const missing = taSlots.filter((_, i) => !taCache.has(keys[i]));
    if (missing.length === 0) return;

    let mounted = true;
    setMarksLoading(true);
    Promise.all(
      missing.map((slot) =>
        computeTaTotal(slot.taId, activeCycle, slot.subjectCode, slot.classType, slot.enabledAssessments, weights)
          .then((entry) => ({ key: `${slot.taId}_${activeCycle}`, entry })),
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

  /* ── Subject-section columns (for table headers) ── */
  const subjectCols = useMemo(() => {
    // Group slots by subjectCode, then sort sections alphabetically inside
    const subjectOrder: string[] = [];
    const subjectSlots = new Map<string, TaSlot[]>();
    for (const slot of taSlots) {
      if (!subjectSlots.has(slot.subjectCode)) {
        subjectSlots.set(slot.subjectCode, []);
        subjectOrder.push(slot.subjectCode);
      }
      subjectSlots.get(slot.subjectCode)!.push(slot);
    }
    return subjectOrder.map((code) => ({
      subjectCode: code,
      subjectName: subjectSlots.get(code)![0].subjectName,
      sections: subjectSlots.get(code)!.sort((a, b) => a.sectionName.localeCompare(b.sectionName)),
    }));
  }, [taSlots]);

  /* ── All unique students (union across all TAs) ── */
  const allStudents: Student[] = useMemo(() => {
    const byRegNo = new Map<string, Student>();
    for (const slot of taSlots) {
      const cacheKey = `${slot.taId}_${activeCycle}`;
      const cached = taCache.get(cacheKey);
      if (cached) {
        for (const s of cached.roster) {
          if (!byRegNo.has(s.regNo)) byRegNo.set(s.regNo, s);
        }
      }
    }
    return Array.from(byRegNo.values()).sort((a, b) => a.regNo.localeCompare(b.regNo));
  }, [taSlots, taCache, activeCycle]);

  /* ── Build student × subject results ── */
  type StudentResult = {
    student: Student;
    scores: Record<string, number | null>; // taId → total/100
    failures: number;
    passCount: number;
  };

  const studentResults: StudentResult[] = useMemo(() => {
    return allStudents.map((student) => {
      const scores: Record<string, number | null> = {};
      let failures = 0;
      let passCount = 0;
      for (const slot of taSlots) {
        const cacheKey = `${slot.taId}_${activeCycle}`;
        const cached = taCache.get(cacheKey);
        const total = cached?.totals.get(student.id) ?? null;
        scores[`ta_${slot.taId}`] = total;
        if (total != null) {
          if (total < PASS_MARK) failures++;
          else passCount++;
        }
      }
      return { student, scores, failures, passCount };
    });
  }, [allStudents, taSlots, taCache, activeCycle]);

  /* ── Range table data ── */
  type RangeCell = { count: number; strength: number };
  const rangeTableData = useMemo(() => {
    return CLASS_RANGES.map((range) => {
      const cells: Record<string, RangeCell> = {};
      for (const slot of taSlots) {
        const ck = `${slot.taId}_${activeCycle}`;
        const cached = taCache.get(ck);
        if (!cached) { cells[`ta_${slot.taId}`] = { count: 0, strength: 0 }; continue; }
        const count = Array.from(cached.totals.values()).filter(
          (v) => v != null && v >= range.min && v <= range.max,
        ).length;
        cells[`ta_${slot.taId}`] = { count, strength: cached.roster.length };
      }
      return { range, cells };
    });
  }, [taSlots, taCache, activeCycle]);

  /* ── Strength/Attended/Absent per TA ── */
  const taStats = useMemo(() => {
    const stats: Record<string, { strength: number; attended: number; absent: number }> = {};
    for (const slot of taSlots) {
      const ck = `${slot.taId}_${activeCycle}`;
      const cached = taCache.get(ck);
      if (!cached) { stats[`ta_${slot.taId}`] = { strength: 0, attended: 0, absent: 0 }; continue; }
      const strength = cached.roster.length;
      const attended = Array.from(cached.totals.values()).filter((v) => v != null).length;
      stats[`ta_${slot.taId}`] = { strength, attended, absent: strength - attended };
    }
    return stats;
  }, [taSlots, taCache, activeCycle]);

  const isDataLoading = progressLoading || marksLoading;
  const failureCounts = useMemo(
    () => Array.from(new Set(studentResults.map((r) => r.failures))).sort((a, b) => a - b),
    [studentResults],
  );

  const cycleLabels: Record<CycleKey, string> = { cycle1: 'Cycle 1', cycle2: 'Cycle 2', model: 'Model' };
  const viewLabels: Record<ViewKey, string> = {
    range: '📊 Range Analysis',
    results: '📋 Class Results',
  };

  /* ────────────────── RENDER ────────────────── */

  if (!canViewProgress) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
        You don't have permission to view class result analysis.
      </div>
    );
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: 400, width: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .cra-row:hover td { background: #f0f6ff !important; }
        .cra-col-hdr:hover { background: rgba(255,255,255,0.08) !important; }
      `}</style>

      {/* ── Dark blue header ── */}
      <div style={{ background: '#1e3a5f', color: '#fff', padding: '18px 24px 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.01em' }}>Class Result Analysis</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              {progressData?.role === 'HOD'
                ? `HOD View · ${progressData.department?.short_name || progressData.department?.code || ''}`
                : progressData?.role === 'ADVISOR'
                ? 'Advisor View · Your Advised Class'
                : ''}
              {progressData?.academic_year?.name ? ` · AY ${progressData.academic_year.name}` : ''}
            </div>
          </div>
          {progressData && taSlots.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(255,255,255,0.12)', color: '#e2e8f0', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                {taSlots.length} Subjects
              </span>
              <span style={{ background: 'rgba(255,255,255,0.12)', color: '#e2e8f0', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                {allStudents.length} Students
              </span>
            </div>
          )}
        </div>

        {/* Cycle tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['cycle1', 'cycle2', 'model'] as CycleKey[]).map((c) => (
            <button
              key={c}
              onClick={() => setActiveCycle(c)}
              style={{
                padding: '9px 22px',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                background: activeCycle === c ? '#fff' : 'rgba(255,255,255,0.12)',
                color: activeCycle === c ? '#1e3a5f' : 'rgba(255,255,255,0.8)',
                transition: 'all 0.15s',
              }}
            >
              {cycleLabels[c]}
            </button>
          ))}
        </div>
      </div>

      {/* View sub-tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 2, paddingTop: 12 }}>
          {(['range', 'results'] as ViewKey[]).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              style={{
                padding: '8px 20px',
                border: 'none',
                borderBottom: activeView === v ? '3px solid #2563eb' : '3px solid transparent',
                background: 'transparent',
                fontWeight: activeView === v ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
                color: activeView === v ? '#2563eb' : '#6b7280',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {viewLabels[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px' }}>
        {/* Loading / Error */}
        {progressLoading && (
          <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
            <div style={{ display: 'inline-block', width: 36, height: 36, border: '4px solid #e5e7eb', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
            <div>Loading class data…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
          </div>
        )}
        {progressError && !progressLoading && (
          <div style={{ padding: 16, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 14 }}>
            ❌ {progressError}
          </div>
        )}

        {!progressLoading && !progressError && progressData && (
          <>
            {/* Class group picker (show only if HOD has multiple classes) */}
            {classGroups.length > 1 && (
              <div style={{ marginBottom: 20, animation: 'fadeInUp 0.4s ease both' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Select Class
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {classGroups.map((g) => {
                    const sel = selectedGroupKey === g.key;
                    return (
                      <button
                        key={g.key}
                        onClick={() => setSelectedGroupKey(g.key)}
                        style={{
                          padding: '10px 18px',
                          borderRadius: 10,
                          border: sel ? '2px solid #2563eb' : '1.5px solid #e5e7eb',
                          background: sel ? '#eff6ff' : '#fff',
                          color: sel ? '#2563eb' : '#374151',
                          fontSize: 14,
                          fontWeight: sel ? 800 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          boxShadow: sel ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
                        }}
                      >
                        <div>{g.batchName}</div>
                        <div style={{ fontSize: 12, color: sel ? '#3b82f6' : '#6b7280', marginTop: 2 }}>{g.courseName}</div>
                        <div style={{ fontSize: 11, color: sel ? '#93c5fd' : '#9ca3af', marginTop: 2 }}>
                          {g.sections.length} section{g.sections.length !== 1 ? 's' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No class selected */}
            {!selectedGroup && (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>
                Select a class above to view results.
              </div>
            )}

            {selectedGroup && taSlots.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>
                No teaching assignments found for this class.
              </div>
            )}

            {selectedGroup && taSlots.length > 0 && (
              <div style={{ animation: 'fadeInUp 0.4s ease both' }}>
                {/* Cycle label strip */}
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: 6, padding: '3px 12px', fontWeight: 700, fontSize: 12 }}>
                    {cycleLabels[activeCycle]}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>{selectedGroup.label}</span>
                  {isDataLoading && (
                    <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Fetching marks…
                    </span>
                  )}
                </div>

                {/* ── VIEW: Range Analysis ── */}
                {activeView === 'range' && (
                  <RangeAnalysisView
                    subjectCols={subjectCols}
                    rangeTableData={rangeTableData}
                    taStats={taStats}
                    loading={isDataLoading}
                  />
                )}

                {/* ── VIEW: Class Results ── */}
                {activeView === 'results' && (
                  <ClassResultsView
                    subjectCols={subjectCols}
                    studentResults={studentResults}
                    failureFilter={failureFilter}
                    setFailureFilter={setFailureFilter}
                    failureCounts={failureCounts}
                    loading={isDataLoading}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   SUB-VIEW: Range Analysis
───────────────────────────────────────── */

function RangeAnalysisView({
  subjectCols,
  rangeTableData,
  taStats,
  loading,
}: {
  subjectCols: Array<{ subjectCode: string; subjectName: string; sections: TaSlot[] }>;
  rangeTableData: Array<{ range: (typeof CLASS_RANGES)[0]; cells: Record<string, { count: number; strength: number }> }>;
  taStats: Record<string, { strength: number; attended: number; absent: number }>;
  loading?: boolean;
}): JSX.Element {
  if (subjectCols.length === 0) {
    return <div style={{ padding: 24, color: '#94a3b8', textAlign: 'center' }}>No subject data available.</div>;
  }

  // Compute all (subjectCode, sectionName, taId) combos for columns
  const allCols: TaSlot[] = subjectCols.flatMap((s) => s.sections);
  const totalCols = allCols.length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>Range Analysis</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
          Count of students in each score range per subject × section
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1.5px solid #e5e7eb', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: Math.max(700, 220 + totalCols * 90) }}>
          {/* ── 3-level header ── */}
          <thead>
            {/* Row 1: Subject codes (spanning their sections) */}
            <tr style={{ background: 'linear-gradient(90deg, #1e3a5f, #1e4080)' }}>
              <th rowSpan={3} style={{ ...cH, width: 120, minWidth: 100, borderBottom: '2px solid rgba(255,255,255,0.15)', textAlign: 'left', paddingLeft: 16 }}>
                Range
              </th>
              {subjectCols.map((sc) => (
                <th
                  key={sc.subjectCode}
                  colSpan={sc.sections.length}
                  style={{ ...cH, background: sc.sections.length > 1 ? 'rgba(255,255,255,0.06)' : 'transparent', fontSize: 13, letterSpacing: '0.04em', borderLeft: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {sc.subjectCode}
                </th>
              ))}
            </tr>
            {/* Row 2: Subject names */}
            <tr style={{ background: '#1e3a5f' }}>
              {subjectCols.map((sc) => (
                <th
                  key={sc.subjectCode}
                  colSpan={sc.sections.length}
                  style={{ ...cH, fontSize: 10, opacity: 0.75, fontWeight: 600, borderLeft: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'normal', maxWidth: 160 }}
                >
                  {sc.subjectName}
                </th>
              ))}
            </tr>
            {/* Row 3: Section letters */}
            <tr style={{ background: '#fef08a' }}>
              {allCols.map((slot) => (
                <th
                  key={slot.taId}
                  style={{
                    ...cH,
                    background: '#fef08a',
                    color: '#78350f',
                    fontWeight: 900,
                    fontSize: 13,
                    borderLeft: '1px solid #fde047',
                    borderBottom: '2px solid #ca8a04',
                    padding: '8px 12px',
                  }}
                >
                  {slot.sectionName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Range rows */}
            {rangeTableData.map(({ range, cells }, ridx) => {
              const isFailZone = range.max < 50;
              return (
                <tr
                  key={range.label}
                  style={{ background: ridx % 2 === 0 ? '#fff' : '#f8fafc', transition: 'background 0.15s' }}
                >
                  <td style={{ ...rL, fontWeight: isFailZone ? 800 : 600, color: isFailZone ? '#dc2626' : '#111827', fontSize: 14 }}>
                    {range.label}
                  </td>
                  {allCols.map((slot) => {
                    const cell = cells[`ta_${slot.taId}`];
                    const count = cell?.count ?? 0;
                    return (
                      <td key={slot.taId} style={{ ...rC }}>
                        {loading && count === 0 ? (
                          <span style={{ color: '#d1d5db', fontSize: 12 }}>…</span>
                        ) : count > 0 ? (
                          <span style={{ fontWeight: 900, fontSize: 15, color: isFailZone ? '#dc2626' : '#111827' }}>{count}</span>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 14 }}>0</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* STRENGTH / ATTENDED / ABSENT */}
            {[
              { label: 'STRENGTH',   key: 'strength' as const, bg: '#f8fafc',   color: '#1e3a5f', fw: 800 },
              { label: 'ATTENDED',   key: 'attended' as const, bg: '#f0fdf4',   color: '#15803d', fw: 700 },
              { label: 'ABSENT (A)', key: 'absent'   as const, bg: '#fef2f2',   color: '#b91c1c', fw: 700 },
            ].map(({ label, key, bg, color, fw }) => (
              <tr key={key} style={{ background: bg }}>
                <td style={{ ...rL, fontWeight: fw, color, fontSize: 13, borderTop: key === 'strength' ? '2px solid #e5e7eb' : 'none' }}>
                  {label}
                </td>
                {allCols.map((slot) => {
                  const stat = taStats[`ta_${slot.taId}`];
                  const v = stat?.[key] ?? 0;
                  return (
                    <td key={slot.taId} style={{ ...rC, fontWeight: fw, color, borderTop: key === 'strength' ? '2px solid #e5e7eb' : 'none' }}>
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
        {[
          { color: '#dc2626', label: '0 – 49 · Fail zone' },
          { color: '#f59e0b', label: '50 – 57 · Borderline Pass' },
          { color: '#10b981', label: '58 – 69 · Pass' },
          { color: '#2563eb', label: '70 – 89 · Good' },
          { color: '#7c3aed', label: '90+ · Distinction' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   SUB-VIEW: Class Results
───────────────────────────────────────── */

function ClassResultsView({
  subjectCols,
  studentResults,
  failureFilter,
  setFailureFilter,
  failureCounts,
  loading,
}: {
  subjectCols: Array<{ subjectCode: string; subjectName: string; sections: TaSlot[] }>;
  studentResults: Array<{ student: Student; scores: Record<string, number | null>; failures: number; passCount: number }>;
  failureFilter: number | null;
  setFailureFilter: (v: number | null) => void;
  failureCounts: number[];
  loading?: boolean;
}): JSX.Element {
  const allCols: TaSlot[] = subjectCols.flatMap((s) => s.sections);

  const filteredResults = failureFilter === null
    ? studentResults
    : studentResults.filter((r) => r.failures === failureFilter);

  const failureRowColor = (failures: number): string => {
    if (failures === 0) return '#fff';
    if (failures === 1) return '#f0fdf4'; // light green
    if (failures === 2) return '#fff7ed'; // light orange
    if (failures === 3) return '#fef2f2'; // light red
    return '#fdf4ff'; // purple for 4+
  };

  const failureBadgeColor = (failures: number): { bg: string; text: string } => {
    if (failures === 0) return { bg: '#f0fdf4', text: '#16a34a' };
    if (failures === 1) return { bg: '#f0fdf4', text: '#15803d' };
    if (failures === 2) return { bg: '#fff7ed', text: '#c2410c' };
    if (failures === 3) return { bg: '#fef2f2', text: '#b91c1c' };
    return { bg: '#fdf4ff', text: '#7c3aed' };
  };

  return (
    <div>
      {/* Header + filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>Class Results</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
            Total scores per student across all subjects · Pass mark: {PASS_MARK}/100
          </div>
        </div>

        {/* Failure count filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Filter by failures:</span>
          <button
            onClick={() => setFailureFilter(null)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: failureFilter === null ? '#1e3a5f' : '#f1f5f9',
              color: failureFilter === null ? '#fff' : '#374151',
              fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
            }}
          >
            All ({studentResults.length})
          </button>
          {failureCounts.map((fc) => {
            const cnt = studentResults.filter((r) => r.failures === fc).length;
            const c = failureBadgeColor(fc);
            return (
              <button
                key={fc}
                onClick={() => setFailureFilter(failureFilter === fc ? null : fc)}
                style={{
                  padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: failureFilter === fc ? c.text : c.bg,
                  color: failureFilter === fc ? '#fff' : c.text,
                  fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                }}
              >
                {fc === 0 ? 'All Pass' : `${fc} Fail`} ({cnt})
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1.5px solid #e5e7eb', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: Math.max(700, 400 + allCols.length * 90) }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg, #1e3a5f, #1e4080)' }}>
              <th style={{ ...cH, width: 40, textAlign: 'center' }}>Sl.</th>
              <th style={{ ...cH, width: 150, textAlign: 'left', paddingLeft: 12 }}>Register No.</th>
              <th style={{ ...cH, minWidth: 180, textAlign: 'left', paddingLeft: 12 }}>Name</th>
              {subjectCols.map((sc) => (
                <th
                  key={sc.subjectCode}
                  colSpan={sc.sections.length}
                  style={{ ...cH, borderLeft: '1px solid rgba(255,255,255,0.15)', fontSize: 13 }}
                >
                  <div>{sc.subjectCode}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, marginTop: 2, whiteSpace: 'normal', maxWidth: 140 }}>{sc.subjectName}</div>
                </th>
              ))}
              <th style={{ ...cH, background: '#f59e0b', color: '#78350f', fontWeight: 900, fontSize: 13, minWidth: 80, borderLeft: '2px solid rgba(255,255,255,0.3)' }}>
                Failures
              </th>
            </tr>
            {/* Section row */}
            <tr style={{ background: '#fef08a' }}>
              <th style={{ ...cHY }} />
              <th style={{ ...cHY, textAlign: 'left', paddingLeft: 12 }}>Section</th>
              <th style={{ ...cHY }} />
              {allCols.map((slot) => (
                <th key={slot.taId} style={{ ...cHY, borderLeft: '1px solid #fde047' }}>{slot.sectionName}</th>
              ))}
              <th style={{ ...cHY, borderLeft: '2px solid #fde047' }}>—</th>
            </tr>
          </thead>
          <tbody>
            {loading && filteredResults.length === 0 && (
              <tr>
                <td colSpan={4 + allCols.length} style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
                  Loading student results…
                </td>
              </tr>
            )}
            {!loading && filteredResults.length === 0 && (
              <tr>
                <td colSpan={4 + allCols.length} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  No students match the selected filter.
                </td>
              </tr>
            )}
            {filteredResults.map((r, idx) => {
              const rowBg = failureRowColor(r.failures);
              const fc = failureBadgeColor(r.failures);
              return (
                <tr
                  key={r.student.regNo}
                  className="cra-row"
                  style={{ background: rowBg, transition: 'background 0.15s' }}
                >
                  <td style={{ ...rC, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ ...rL, fontFamily: 'monospace', fontSize: 13 }}>{r.student.regNo}</td>
                  <td style={{ ...rL, fontWeight: 600, color: '#111827', fontSize: 14 }}>{r.student.name}</td>
                  {allCols.map((slot) => {
                    const total = r.scores[`ta_${slot.taId}`] ?? null;
                    const passed = total != null && total >= PASS_MARK;
                    const failed = total != null && total < PASS_MARK;
                    return (
                      <td
                        key={slot.taId}
                        style={{
                          ...rC,
                          fontWeight: total != null ? 800 : 400,
                          fontSize: total != null ? 15 : 13,
                          color: total == null ? '#d1d5db' : failed ? '#dc2626' : '#15803d',
                          borderLeft: '1px solid #f3f4f6',
                          background: failed ? 'rgba(220,38,38,0.06)' : passed ? 'rgba(21,128,61,0.04)' : 'transparent',
                        }}
                      >
                        {total ?? '—'}
                      </td>
                    );
                  })}
                  <td style={{ ...rC, background: fc.bg, borderLeft: '2px solid #f0f0f0' }}>
                    <span style={{
                      display: 'inline-block',
                      fontWeight: 900,
                      fontSize: 15,
                      color: fc.text,
                      minWidth: 24,
                      textAlign: 'center',
                    }}>
                      {r.failures}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Failure colour legend */}
      <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#374151' }}>
        {[
          { bg: '#fff',    border: '#e5e7eb', label: 'No failures (All Pass)' },
          { bg: '#f0fdf4', border: '#bbf7d0', label: '1 subject failure'     },
          { bg: '#fff7ed', border: '#fed7aa', label: '2 subject failures'     },
          { bg: '#fef2f2', border: '#fecaca', label: '3 subject failures'     },
          { bg: '#fdf4ff', border: '#e9d5ff', label: '4+ subject failures'    },
        ].map(({ bg, border, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: bg, border: `1.5px solid ${border}` }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────── Shared table cell styles ──────────────────── */
const cH: React.CSSProperties = {
  padding: '11px 12px',
  textAlign: 'center',
  color: '#fff',
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const cHY: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'center',
  color: '#78350f',
  fontWeight: 900,
  fontSize: 13,
  background: '#fef08a',
  borderBottom: '2px solid #ca8a04',
  whiteSpace: 'nowrap',
};

const rL: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #f3f4f6',
  color: '#374151',
  fontSize: 13,
  fontWeight: 600,
};

const rC: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  textAlign: 'center',
  fontSize: 14,
  color: '#374151',
};
