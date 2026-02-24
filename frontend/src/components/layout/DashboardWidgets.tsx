import React, { useMemo } from 'react';
import {
  LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart as RBarChart, Bar, Cell,
  PieChart, Pie,
  ScatterChart as RScatterChart, Scatter, ZAxis,
  ReferenceLine,
} from 'recharts';
import { lsGet } from '../../utils/localStorage';

// ─── Data helpers ────────────────────────────────────────────────────────────

function safeGetSheet(subjectId: string, key: string): Record<string, any> | null {
  try {
    const raw = lsGet<any>(`${key}_${subjectId}`);
    if (!raw) return null;
    if (raw.rowsByStudentId && typeof raw.rowsByStudentId === 'object') return raw.rowsByStudentId;
    if (Array.isArray(raw.rows)) {
      const map: Record<string, any> = {};
      raw.rows.forEach((r: any) => { map[String(r.studentId || r.id || '')] = r; });
      return map;
    }
    if (Array.isArray(raw)) {
      const map: Record<string, any> = {};
      raw.forEach((r: any) => { map[String(r.studentId || r.id || '')] = r; });
      return map;
    }
    return typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function scoreOf(row: any): number | null {
  if (!row) return null;
  for (const k of ['total', 'mark', 'score', 'marks']) {
    if (typeof (row as any)[k] === 'number') return (row as any)[k];
  }
  return null;
}

type Student = { id: string; cia1?: number; cia2?: number; model?: number; avg?: number };

const FAIL_THRESHOLD = 58;

const GRADE_COLORS: Record<string, string> = {
  Fail: '#ef4444',
  '58-64': '#f59e0b',
  '65-74': '#3b82f6',
  '75+': '#10b981',
};

// ─── Card wrapper ──────────────────────────────────────────────────────────────

function Widget({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="obe-card" style={{ padding: '18px 18px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function NoData() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth={1.5} style={{ margin: '0 auto 6px', display: 'block' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-5 4 3 4-6" />
      </svg>
      No marks saved yet
    </div>
  );
}

function buildStudents(subjectId: string): Student[] {
  const cia1 = safeGetSheet(subjectId, 'cia1_sheet');
  const cia2 = safeGetSheet(subjectId, 'cia2_sheet');
  const model = safeGetSheet(subjectId, 'model_sheet');
  const ids = new Set<string>();
  [cia1, cia2, model].forEach((s) => s && Object.keys(s).forEach((k) => ids.add(k)));
  return Array.from(ids).map((id) => {
    const v1 = cia1?.[id] ? scoreOf(cia1[id]) : null;
    const v2 = cia2?.[id] ? scoreOf(cia2[id]) : null;
    const vm = model?.[id] ? scoreOf(model[id]) : null;
    const vals = [v1, v2, vm].filter((v) => v !== null) as number[];
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { id, cia1: v1 ?? undefined, cia2: v2 ?? undefined, model: vm ?? undefined, avg: avg ?? undefined };
  });
}

// ─── KPI Strip ─────────────────────────────────────────────────────────────────

function KpiStrip({ students }: { students: Student[] }) {
  const valid = students.filter((s) => typeof s.avg === 'number');
  const total = valid.length;
  const passed = valid.filter((s) => (s.avg ?? 0) >= FAIL_THRESHOLD).length;
  const classAvg = total ? valid.reduce((a, s) => a + (s.avg ?? 0), 0) / total : 0;
  const highest = total ? Math.max(...valid.map((s) => s.avg ?? 0)) : 0;
  const lowest = total ? Math.min(...valid.map((s) => s.avg ?? 0)) : 0;

  const kpis = [
    { label: 'Total Students', value: total, color: '#0b74b8' },
    { label: 'Passed', value: passed, color: '#10b981' },
    { label: 'Class Avg', value: classAvg.toFixed(1), color: '#f59e0b' },
    { label: 'Highest', value: highest.toFixed(1), color: '#8b5cf6' },
    { label: 'Lowest', value: lowest.toFixed(1), color: '#ef4444' },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
      {kpis.map((k) => (
        <div key={k.label} style={{
          flex: '1 1 120px', background: '#fff', borderRadius: 12, padding: '14px 18px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: `4px solid ${k.color}`,
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 600 }}>{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Trend Widget (Recharts LineChart) ─────────────────────────────────────────

function TrendWidget({ students }: { students: Student[] }) {
  const avg = (vals: (number | undefined)[]) => {
    const nums = vals.filter((v) => typeof v === 'number') as number[];
    return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0;
  };
  const data = [
    { name: 'CIA 1', average: avg(students.map((s) => s.cia1)) },
    { name: 'CIA 2', average: avg(students.map((s) => s.cia2)) },
    { name: 'Model', average: avg(students.map((s) => s.model)) },
  ];

  if (students.length === 0) return <NoData />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RLineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
        <Line type="monotone" dataKey="average" stroke="#0b74b8" strokeWidth={3}
          dot={{ r: 6, fill: '#ff8c42', stroke: '#fff', strokeWidth: 2 }}
          activeDot={{ r: 8 }} />
      </RLineChart>
    </ResponsiveContainer>
  );
}

    // ─── Grade Distribution Widget (Recharts PieChart) ─────────────────────────────

    const PIE_COLORS = ['#ef4444', '#f59e0b', '#06b6d4', '#10b981'];

    function GradeWidget({ students }: { students: Student[] }) {
      const bands = { 'Fail (<58)': 0, '58–64': 0, '65–74': 0, '75+': 0 } as Record<string, number>;
      students.forEach((s) => {
        const v = s.avg ?? 0;
        if (v < 58) bands['Fail (<58)'] += 1;
        else if (v < 65) bands['58–64'] += 1;
        else if (v < 75) bands['65–74'] += 1;
        else bands['75+'] += 1;
      });
      const data = Object.entries(bands).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
      const total = students.filter((s) => typeof s.avg === 'number').length;
      const passRate = total ? Math.round(((total - bands['Fail (<58)']) / total) * 100) : 0;

      if (data.length === 0) return <NoData />;
      return (
        <>
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: passRate >= 75 ? '#10b981' : '#f59e0b' }}>{passRate}%</span>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>Pass Rate</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {data.map((_entry, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </>
      );
    }

    // ─── Top / Bottom Performers (Recharts BarChart) ────────────────────────────────

    function TopBottomWidget({ students }: { students: Student[] }) {
      const sorted = [...students].filter((s) => typeof s.avg === 'number').sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
      const slice = [
        ...sorted.slice(0, 5).map((s) => ({ id: s.id.slice(-6), avg: +(s.avg ?? 0).toFixed(1), group: 'Top' })),
        ...sorted.slice(-5).reverse().map((s) => ({ id: s.id.slice(-6), avg: +(s.avg ?? 0).toFixed(1), group: 'Bottom' })),
      ];

      if (slice.length === 0) return <NoData />;
      return (
        <ResponsiveContainer width="100%" height={260}>
          <RBarChart data={slice} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis dataKey="id" type="category" tick={{ fontSize: 11, fill: '#475569' }} width={56} />
            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
            <Bar dataKey="avg" radius={[0, 6, 6, 0]}>
              {slice.map((entry, idx) => (
                <Cell key={idx} fill={entry.group === 'Top' ? '#0b74b8' : '#ef4444'} />
              ))}
            </Bar>
          </RBarChart>
        </ResponsiveContainer>
      );
    }

    // ─── Assessment Comparison Widget (Recharts grouped BarChart) ──────────────────

    function AssessmentComparisonWidget({ students }: { students: Student[] }) {
      const data = students
        .filter((s) => s.cia1 != null || s.cia2 != null || s.model != null)
        .slice(0, 25)
        .map((s) => ({
          id: s.id.slice(-5),
          CIA1: s.cia1 != null ? +s.cia1.toFixed(1) : null,
          CIA2: s.cia2 != null ? +s.cia2.toFixed(1) : null,
          Model: s.model != null ? +s.model.toFixed(1) : null,
        }));

      if (data.length === 0) return <NoData />;
      return (
        <ResponsiveContainer width="100%" height={240}>
          <RBarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="id" tick={{ fontSize: 9, fill: '#475569' }} angle={-45} textAnchor="end" interval={0} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
            <Legend iconType="circle" iconSize={9} />
            <Bar dataKey="CIA1" fill="#0b74b8" radius={[3, 3, 0, 0]} />
            <Bar dataKey="CIA2" fill="#06b6d4" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Model" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </RBarChart>
        </ResponsiveContainer>
      );
    }

    // ─── Scatter Widget (CIA1 vs CIA2 via Recharts ScatterChart) ───────────────────

    function ScatterWidget({ students }: { students: Student[] }) {
      const data = students
        .filter((s) => s.cia1 != null && s.cia2 != null)
        .map((s) => ({ x: +(s.cia1 ?? 0).toFixed(1), y: +(s.cia2 ?? 0).toFixed(1), id: s.id }));

      if (data.length === 0) return <NoData />;
      return (
        <ResponsiveContainer width="100%" height={220}>
          <RScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" dataKey="x" name="CIA1" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'CIA 1', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#475569' }} />
            <YAxis type="number" dataKey="y" name="CIA2" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'CIA 2', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#475569' }} />
            <ZAxis range={[40, 40]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: 10, fontSize: 12 }}
              content={({ payload }) => payload?.length ? (
                <div style={{ background: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <div><b>{payload[0]?.payload?.id}</b></div>
                  <div>CIA1: {payload[0]?.payload?.x} &nbsp; CIA2: {payload[0]?.payload?.y}</div>
                </div>
              ) : null}
            />
            <ReferenceLine x={FAIL_THRESHOLD} stroke="#ef4444" strokeDasharray="5 3" label={{ value: 'Fail', fill: '#ef4444', fontSize: 10 }} />
            <ReferenceLine y={FAIL_THRESHOLD} stroke="#ef4444" strokeDasharray="5 3" />
            <Scatter data={data} fill="#0b74b8" opacity={0.75} />
          </RScatterChart>
        </ResponsiveContainer>
      );
    }

export default function DashboardWidgets({ subjectId }: { subjectId?: string | number | null }) {
  const subj = String(subjectId || '');
  const students = useMemo(() => buildStudents(subj), [subj]);

  return (
    <div style={{ padding: '4px 0' }}>
      <KpiStrip students={students} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Widget title="Trend Over Time" subtitle="Class avg per assessment">
          <TrendWidget students={students} />
        </Widget>

        <Widget title="Grade Distribution" subtitle={'Pass rate (fail < 58)'}>
          <GradeWidget students={students} />
        </Widget>

        <Widget title="Top vs Bottom Performers" subtitle="Avg marks (last 5 digits of ID)">
          <TopBottomWidget students={students} />
        </Widget>

        <Widget title="CIA1 vs CIA2 Scatter" subtitle="Each dot = one student">
          <ScatterWidget students={students} />
        </Widget>

        <Widget title="Per-Student Assessment Comparison" subtitle="First 25 students · CIA1 / CIA2 / Model">
          <AssessmentComparisonWidget students={students} />
        </Widget>
      </div>
    </div>
  );
}
