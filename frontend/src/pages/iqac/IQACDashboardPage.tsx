import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ComposedChart, ErrorBar,
} from 'recharts';
import fetchWithAuth from '../../services/fetchAuth';
import type { ObeProgressResponse, ObeProgressTA } from '../obe/progressTypes';

/* ─────────── Types from backend analytics endpoint ─────────── */

type DeptOption = { id: number; code: string; name: string; short_name: string };

type DeptPerformance = {
  department_id: number;
  department_code: string;
  department_name: string;
  department_short_name: string;
  subject_count: number;
  student_count: number;
  mark_count: number;
  avg_percentage: number;
  min_percentage: number;
  max_percentage: number;
  pass_percentage: number;
};

type BottleneckByDept = {
  department_id: number;
  department_code: string;
  department_name: string;
  publish_pending: number;
  edit_pending: number;
};

type BlockedStaff = {
  staff_user_id: number;
  name: string;
  publish_pending: number;
  edit_pending: number;
  total: number;
};

type HeatmapRow = {
  department_id: number;
  department_code: string;
  department_name: string;
  department_short_name: string;
  cells: Record<string, { ta_total: number; published: number; pct: number }>;
};

type AnalyticsResponse = {
  academic_year: { id: number | null; name: string | null } | null;
  departments: DeptOption[];
  department_performance: DeptPerformance[];
  bottlenecks: {
    pending_publish_total: number;
    pending_edit_total: number;
    by_department: BottleneckByDept[];
    top_blocked_staff: BlockedStaff[];
  };
  completion_heatmap: {
    assessments: string[];
    rows: HeatmapRow[];
  };
};

type ChartView = 'bar' | 'radar' | 'range';
type ClassTypeFilter = 'ALL' | 'THEORY' | 'LAB' | 'TCPL' | 'PROJECT' | 'SPECIAL';

/* ─────────── Helpers ─────────── */

function colorForPct(pct: number): string {
  // 0 → faint slate, 100 → deep blue
  const clamped = Math.max(0, Math.min(100, pct));
  const lightness = 96 - clamped * 0.42; // 96% → 54%
  return `hsl(204, 78%, ${lightness}%)`;
}

function passColor(pct: number): string {
  if (pct >= 80) return '#10b981'; // green
  if (pct >= 60) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

function classTypeMatches(filter: ClassTypeFilter, taType: string | null | undefined): boolean {
  if (filter === 'ALL') return true;
  const t = (taType || '').toUpperCase();
  if (filter === 'THEORY') return t === 'THEORY' || t === 'TCPR';
  return t === filter;
}

function isFullyCompleted(ta: ObeProgressTA): boolean {
  if (!ta.exam_progress || ta.exam_progress.length === 0) return false;
  return ta.exam_progress.every(
    (e) => e.published === true && e.total_students > 0 && e.rows_filled >= e.total_students,
  );
}

function isPendingPublish(ta: ObeProgressTA): boolean {
  if (!ta.exam_progress || ta.exam_progress.length === 0) return false;
  const allFilled = ta.exam_progress.every(
    (e) => e.total_students > 0 && e.rows_filled >= e.total_students,
  );
  const anyUnpublished = ta.exam_progress.some((e) => !e.published);
  return allFilled && anyUnpublished;
}

function isPendingEntry(ta: ObeProgressTA): boolean {
  if (!ta.exam_progress || ta.exam_progress.length === 0) return false;
  return ta.exam_progress.some((e) => e.total_students > 0 && e.rows_filled < e.total_students);
}

const ASSESSMENT_LABELS: Record<string, string> = {
  ssa1: 'SSA 1',
  formative1: 'FA 1',
  cia1: 'CIA 1',
  ssa2: 'SSA 2',
  formative2: 'FA 2',
  cia2: 'CIA 2',
  model: 'MODEL',
};

/* ─────────── Component ─────────── */

export default function IQACDashboardPage(): JSX.Element {
  const [progress, setProgress] = useState<ObeProgressResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [deptFilter, setDeptFilter] = useState<number | 'ALL'>('ALL');
  const [classTypeFilter, setClassTypeFilter] = useState<ClassTypeFilter>('ALL');
  const [chartView, setChartView] = useState<ChartView>('bar');

  const loadAll = useCallback(async (deptId: number | 'ALL') => {
    setLoading(true);
    setError(null);
    try {
      const analyticsUrl = deptId === 'ALL'
        ? '/api/obe/iqac/dashboard-analytics'
        : `/api/obe/iqac/dashboard-analytics?department_id=${encodeURIComponent(String(deptId))}`;
      const [pRes, aRes] = await Promise.all([
        fetchWithAuth('/api/obe/progress'),
        fetchWithAuth(analyticsUrl),
      ]);
      if (!pRes.ok) throw new Error(`Progress HTTP ${pRes.status}`);
      if (!aRes.ok) throw new Error(`Analytics HTTP ${aRes.status}`);
      const pJs: ObeProgressResponse = await pRes.json();
      const aJs: AnalyticsResponse = await aRes.json();
      setProgress(pJs);
      setAnalytics(aJs);
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(deptFilter); }, [deptFilter, loadAll]);

  /* ─── Side card aggregation from /api/obe/progress ─── */
  const sideStats = useMemo(() => {
    let fully = 0;
    let pendingPublish = 0;
    let pendingEntry = 0;
    let totalTas = 0;
    let totalStudents = 0;
    if (progress?.sections) {
      for (const sec of progress.sections) {
        if (deptFilter !== 'ALL' && sec.department?.id !== deptFilter) continue;
        for (const st of sec.staff || []) {
          for (const ta of st.teaching_assignments || []) {
            if (!classTypeMatches(classTypeFilter, ta.class_type)) continue;
            totalTas += 1;
            // student total derived from the largest enabled-assessment total_students
            const maxTotal = (ta.exam_progress || []).reduce((m, e) => Math.max(m, e.total_students || 0), 0);
            totalStudents += maxTotal;
            if (isFullyCompleted(ta)) fully += 1;
            else if (isPendingPublish(ta)) pendingPublish += 1;
            else if (isPendingEntry(ta)) pendingEntry += 1;
          }
        }
      }
    }
    return { fully, pendingPublish, pendingEntry, totalTas, totalStudents };
  }, [progress, deptFilter, classTypeFilter]);

  /* ─── KPI strip ─── */
  const kpis = useMemo(() => {
    const perf = analytics?.department_performance || [];
    const totalSubjects = perf.reduce((s, d) => s + (d.subject_count || 0), 0);
    const totalStudents = perf.reduce((s, d) => s + (d.student_count || 0), 0);
    const sumProduct = perf.reduce((s, d) => s + d.avg_percentage * (d.mark_count || 0), 0);
    const sumWeights = perf.reduce((s, d) => s + (d.mark_count || 0), 0);
    const overallAvg = sumWeights > 0 ? sumProduct / sumWeights : 0;
    const completion = sideStats.totalTas > 0 ? (sideStats.fully * 100) / sideStats.totalTas : 0;
    return {
      totalSubjects,
      totalStudents,
      overallAvg: Math.round(overallAvg * 10) / 10,
      completion: Math.round(completion * 10) / 10,
    };
  }, [analytics, sideStats]);

  /* ─── Department chart data ─── */
  const perfData = analytics?.department_performance || [];
  const bottleneckData = useMemo(
    () => (analytics?.bottlenecks.by_department || []).map((b) => ({
      department: b.department_code,
      'Pending Publish': b.publish_pending,
      'Pending Edit': b.edit_pending,
      total: b.publish_pending + b.edit_pending,
    })),
    [analytics],
  );
  const heatmap = analytics?.completion_heatmap;

  if (loading && !analytics) {
    return (
      <div style={{ padding: 24, color: '#64748b' }}>Loading dashboard…</div>
    );
  }
  if (error) {
    return (
      <div className="obe-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>
        Failed to load dashboard: {error}
        <button className="obe-btn" style={{ marginLeft: 12 }} onClick={() => loadAll(deptFilter)}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header bar */}
      <div className="obe-card" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0b4a6f' }}>Institutional Dashboard</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>
            {analytics?.academic_year?.name ? `Academic Year ${analytics.academic_year.name}` : 'Academic Year —'}
            {' · '}
            {sideStats.totalTas} courses tracked
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Department</label>
          <select
            value={String(deptFilter)}
            onChange={(e) => {
              const v = e.target.value;
              setDeptFilter(v === 'ALL' ? 'ALL' : Number(v));
            }}
            className="obe-input"
            style={{ width: 220 }}
          >
            <option value="ALL">All Departments</option>
            {(analytics?.departments || []).map((d) => (
              <option key={d.id} value={d.id}>{d.short_name || d.code} — {d.name}</option>
            ))}
          </select>
          <button className="obe-btn" onClick={() => loadAll(deptFilter)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard label="Subjects with Marks" value={String(kpis.totalSubjects)} accent="#3730a3" tint="rgba(99,102,241,0.08)" />
        <KpiCard label="Students Assessed" value={String(kpis.totalStudents)} accent="#0e7490" tint="rgba(14,116,144,0.08)" />
        <KpiCard label="Overall Avg %" value={`${kpis.overallAvg}%`} accent="#065f46" tint="rgba(16,185,129,0.10)" />
        <KpiCard label="Mark Entry Completion" value={`${kpis.completion}%`} accent="#9a3412" tint="rgba(249,115,22,0.10)" />
      </div>

      {/* Mark entry completion side cards */}
      <div className="obe-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0b4a6f' }}>Mark Entry & CQI Completion</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>Counts are per teaching assignment. A course is "fully completed" only when every enabled assessment has all rows filled and is published.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Class Type</label>
            <select
              value={classTypeFilter}
              onChange={(e) => setClassTypeFilter(e.target.value as ClassTypeFilter)}
              className="obe-input"
              style={{ width: 160 }}
            >
              <option value="ALL">All Types</option>
              <option value="THEORY">Theory</option>
              <option value="LAB">Lab</option>
              <option value="TCPL">TCPL</option>
              <option value="PROJECT">Project</option>
              <option value="SPECIAL">Special</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <SideCard
            label="Fully Completed"
            value={sideStats.fully}
            denom={sideStats.totalTas}
            color="#047857"
            tint="rgba(5,150,105,0.10)"
            description="All assessments filled & published"
          />
          <SideCard
            label="Pending Publish"
            value={sideStats.pendingPublish}
            denom={sideStats.totalTas}
            color="#b45309"
            tint="rgba(245,158,11,0.10)"
            description="Filled but not yet published"
          />
          <SideCard
            label="Pending Mark Entry"
            value={sideStats.pendingEntry}
            denom={sideStats.totalTas}
            color="#b91c1c"
            tint="rgba(239,68,68,0.10)"
            description="Some students still missing marks"
          />
        </div>
      </div>

      {/* Department performance chart */}
      <div className="obe-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0b4a6f' }}>Department-wise Internal Mark Performance</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>From persisted final internal marks. Pass threshold = 50% of max mark.</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['bar', 'radar', 'range'] as ChartView[]).map((v) => (
              <button
                key={v}
                className="obe-btn"
                onClick={() => setChartView(v)}
                style={{
                  padding: '6px 12px',
                  background: chartView === v ? 'linear-gradient(180deg,#0b74b8,#0b5f92)' : undefined,
                  color: chartView === v ? '#fff' : undefined,
                  borderColor: chartView === v ? 'rgba(2,6,23,0.08)' : undefined,
                }}
              >
                {v === 'bar' ? 'Bar' : v === 'radar' ? 'Radar' : 'Range'}
              </button>
            ))}
          </div>
        </div>

        {perfData.length === 0 ? (
          <div style={{ color: '#64748b', padding: '20px 0', textAlign: 'center' }}>
            No final internal marks have been computed yet.
          </div>
        ) : chartView === 'bar' ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={perfData}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="department_code" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip
                formatter={(v: any, k: string) => [
                  typeof v === 'number' ? `${v.toFixed(1)}%` : v,
                  k,
                ]}
                labelFormatter={(label: string) => {
                  const r = perfData.find((p) => p.department_code === label);
                  return r ? `${r.department_code} — ${r.department_name}` : label;
                }}
              />
              <Legend />
              <Bar dataKey="avg_percentage" name="Avg %" radius={[6, 6, 0, 0]}>
                {perfData.map((d, i) => (
                  <Cell key={i} fill={passColor(d.pass_percentage)} />
                ))}
              </Bar>
              <Bar dataKey="pass_percentage" name="Pass %" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : chartView === 'radar' ? (
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart data={perfData} outerRadius={130}>
              <PolarGrid stroke="#cbd5e1" />
              <PolarAngleAxis dataKey="department_code" tick={{ fontSize: 12, fill: '#0b4a6f' }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Radar name="Avg %" dataKey="avg_percentage" stroke="#0b74b8" fill="#0b74b8" fillOpacity={0.35} />
              <Radar name="Pass %" dataKey="pass_percentage" stroke="#10b981" fill="#10b981" fillOpacity={0.20} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart
              data={perfData.map((d) => ({
                ...d,
                spread: [d.avg_percentage - d.min_percentage, d.max_percentage - d.avg_percentage],
              }))}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="department_code" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip
                formatter={(v: any, k: string) => {
                  if (Array.isArray(v)) return [`${v[0]} – ${v[1]}`, k];
                  return [typeof v === 'number' ? `${v.toFixed(1)}%` : v, k];
                }}
              />
              <Legend />
              <Bar dataKey="avg_percentage" name="Avg %" fill="#0b74b8" radius={[6, 6, 0, 0]}>
                <ErrorBar dataKey="spread" width={4} stroke="#1e293b" strokeWidth={2} direction="y" />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Department detail strip */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 8 }}>
          {perfData.map((d) => (
            <div key={d.department_id} style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(14,96,148,0.12)',
              background: '#f8fbff',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0b4a6f', letterSpacing: 0.04 }}>
                {d.department_code} · {d.subject_count} subj · {d.student_count} stu
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'baseline' }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#0b4a6f' }}>{d.avg_percentage.toFixed(1)}%</span>
                <span style={{ fontSize: 11, color: passColor(d.pass_percentage) }}>
                  {d.pass_percentage.toFixed(0)}% pass
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                  {d.min_percentage.toFixed(0)}–{d.max_percentage.toFixed(0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottleneck Tracker */}
      <div className="obe-card">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0b4a6f' }}>Bottleneck Tracker</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>
              {analytics?.bottlenecks.pending_publish_total || 0} publish · {analytics?.bottlenecks.pending_edit_total || 0} edit · pending IQAC review
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 2fr) minmax(220px, 1fr)', gap: 14 }}>
          <div>
            {bottleneckData.length === 0 ? (
              <div style={{ color: '#64748b', padding: '20px 0', textAlign: 'center' }}>No pending requests. 🎉</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, bottleneckData.length * 40)}>
                <BarChart data={bottleneckData} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="department" tick={{ fontSize: 12 }} width={70} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Pending Publish" stackId="x" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Pending Edit" stackId="x" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 8 }}>
              Top blocked staff
            </div>
            {(analytics?.bottlenecks.top_blocked_staff || []).length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>No staff with pending requests.</div>
            ) : (
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(analytics?.bottlenecks.top_blocked_staff || []).slice(0, 5).map((s, i) => (
                  <li key={s.staff_user_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: i === 0 ? 'rgba(239,68,68,0.06)' : '#f8fafc',
                    border: '1px solid rgba(148,163,184,0.25)',
                  }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 12,
                      background: i === 0 ? '#ef4444' : '#94a3b8',
                      color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 12,
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {s.publish_pending} publish · {s.edit_pending} edit
                      </div>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#b91c1c' }}>{s.total}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* Completion Heatmap */}
      <div className="obe-card">
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0b4a6f' }}>Mark Completion Heatmap</div>
          <div style={{ color: '#64748b', fontSize: 12 }}>
            % of teaching assignments per department that have <em>published</em> each assessment.
          </div>
        </div>
        {!heatmap || heatmap.rows.length === 0 ? (
          <div style={{ color: '#64748b', padding: '20px 0', textAlign: 'center' }}>No data yet for this filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: 0.06,
                  }}>
                    Department
                  </th>
                  {heatmap.assessments.map((a) => (
                    <th key={a} style={{
                      padding: '8px 10px',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: 0.06,
                      textAlign: 'center',
                    }}>
                      {ASSESSMENT_LABELS[a] || a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.rows.map((row) => (
                  <tr key={row.department_id}>
                    <td style={{
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: 13,
                      color: '#0b4a6f',
                      whiteSpace: 'nowrap',
                    }}>
                      <span title={row.department_name}>{row.department_short_name || row.department_code}</span>
                    </td>
                    {heatmap.assessments.map((a) => {
                      const cell = row.cells?.[a];
                      const ta = cell?.ta_total ?? 0;
                      const pub = cell?.published ?? 0;
                      const pct = cell?.pct ?? 0;
                      return (
                        <td key={a} style={{ padding: 0 }}>
                          <div
                            title={ta > 0 ? `${pub}/${ta} TAs published (${pct.toFixed(1)}%)` : 'No TAs for this assessment'}
                            style={{
                              padding: '10px 6px',
                              borderRadius: 8,
                              background: ta > 0 ? colorForPct(pct) : '#f1f5f9',
                              color: pct >= 60 ? '#0b3d5b' : '#475569',
                              textAlign: 'center',
                              fontWeight: 800,
                              fontSize: 12,
                              border: '1px solid rgba(14,96,148,0.10)',
                              minWidth: 60,
                            }}
                          >
                            {ta > 0 ? `${pct.toFixed(0)}%` : '—'}
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginTop: 2 }}>
                              {ta > 0 ? `${pub}/${ta}` : ''}
                            </div>
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
  );
}

/* ─────────── Small subcomponents ─────────── */

function KpiCard(props: { label: string; value: string; accent: string; tint: string }): JSX.Element {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 14,
      background: `linear-gradient(135deg, ${props.tint}, rgba(255,255,255,0.4))`,
      border: `1px solid ${props.accent}33`,
      boxShadow: `0 2px 10px ${props.accent}1a`,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: 0.07,
        textTransform: 'uppercase', color: props.accent, opacity: 0.85,
      }}>{props.label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: props.accent, marginTop: 4 }}>{props.value}</div>
    </div>
  );
}

function SideCard(props: { label: string; value: number; denom: number; color: string; tint: string; description: string }): JSX.Element {
  const pct = props.denom > 0 ? (props.value * 100) / props.denom : 0;
  return (
    <div style={{
      padding: 16,
      borderRadius: 14,
      background: `linear-gradient(135deg, ${props.tint}, rgba(255,255,255,0.4))`,
      border: `1px solid ${props.color}33`,
      boxShadow: `0 2px 10px ${props.color}1a`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: 0.06,
        textTransform: 'uppercase', color: props.color,
      }}>{props.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: props.color }}>{props.value}</span>
        <span style={{ fontSize: 13, color: props.color, opacity: 0.7 }}>/ {props.denom}</span>
      </div>
      <div style={{
        position: 'relative',
        height: 6,
        borderRadius: 999,
        background: 'rgba(148,163,184,0.18)',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          width: `${Math.min(100, pct)}%`,
          background: props.color,
          borderRadius: 999,
        }} />
      </div>
      <div style={{ fontSize: 11, color: '#64748b' }}>{props.description}</div>
    </div>
  );
}
