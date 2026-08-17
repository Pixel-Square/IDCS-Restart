import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Award, BookOpen, ChevronRight, GraduationCap, Loader2, Medal, Sparkles, TrendingUp, Trophy, UserRound, X, Zap } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import RequirementsPage from '../../settings/RequirementsPage';
import MyMarksLayout from './MyMarksLayout';

/* ── Types ─────────────────────────────────────────────────── */
type MyMarksConfig = {
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
  has_profile_photo: boolean;
  has_mobile_number: boolean;
};
type CourseCard = {
  ta_id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  faculty_name: string;
  exams_entered: number;
  obtained_weight: number;
  max_weight: number;
  entered_weight_pct: number | null;
};
type LeaderboardStudent = {
  student_id: number;
  student_name: string;
  average_pct: number | null;
  rank: number;
};
type ClassLeaderboard = {
  top_students: LeaderboardStudent[];
  current_student: LeaderboardStudent | null;
  course_count: number;
};
type CyclePoint = { name: string; pct: number | null };

/* ── Colour helpers ─────────────────────────────────────────── */
function scoreBg(pct: number | null) {
  if (pct === null) return 'bg-gray-200';
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-rose-500';
}
function scoreText(pct: number | null) {
  if (pct === null) return 'text-gray-400';
  if (pct >= 75) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-rose-600';
}

/* ── A: Horizontal Score Bars ───────────────────────────────── */
function HorizontalBars({ courses }: { courses: CourseCard[] }) {
  const sorted = [...courses].sort((a, b) => (b.entered_weight_pct ?? 0) - (a.entered_weight_pct ?? 0));
  return (
    <div className="space-y-3.5">
      {sorted.map((c, idx) => {
        const pct = c.entered_weight_pct;
        return (
          <div key={c.ta_id} className="animate-[fadeInUp_0.4s_ease_forwards] opacity-0" style={{ animationDelay: `${idx * 80}ms` }}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="max-w-[55%] truncate text-xs font-semibold text-gray-700">{c.course_code}</span>
              <span className={`text-xs font-black ${scoreText(pct)}`}>{pct !== null ? `${Math.round(pct)}%` : '—'}</span>
            </div>
            <div className="relative h-5 overflow-hidden rounded-full bg-gray-100">
              {/* threshold lines */}
              <div className="absolute left-[50%] top-0 h-full w-px bg-amber-200/80" />
              <div className="absolute left-[75%] top-0 h-full w-px bg-emerald-200/80" />
              <div
                className={`flex h-full items-center rounded-full transition-all duration-1000 ${scoreBg(pct)}`}
                style={{ width: pct !== null ? `${Math.min(pct, 100)}%` : '4px' }}
              >
                {pct !== null && pct > 20 && (
                  <span className="ml-2 truncate text-[10px] font-bold text-white">{c.course_name.split(' ')[0]}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div className="mt-1 flex text-[9px] text-gray-300 font-medium">
        <span className="w-[50%] text-right pr-1">50%</span>
        <span className="w-[25%] text-right pr-1">75%</span>
      </div>
    </div>
  );
}

/* ── B: Radar / Spider Chart ────────────────────────────────── */
function RadarChart({ courses }: { courses: CourseCard[] }) {
  const n = courses.length;
  if (n < 3) return null;
  const cx = 110, cy = 105, r = 75;
  const angles = Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n - Math.PI / 2);
  const pt = (frac: number, angle: number) => ({
    x: cx + frac * r * Math.cos(angle),
    y: cy + frac * r * Math.sin(angle),
  });
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const polyPath = (frac: number) =>
    angles.map((a, i) => { const p = pt(frac, a); return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ') + 'Z';
  const perfPoints = courses.map((c, i) => pt((c.entered_weight_pct ?? 0) / 100, angles[i]));
  const perfPath = perfPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z';

  return (
    <svg viewBox="0 0 220 210" className="w-full h-full">
      {/* Background grid */}
      {gridLevels.map((f, i) => (
        <path key={i} d={polyPath(f)} fill={f === 1 ? 'none' : 'none'} stroke="#e2e8f0" strokeWidth="0.7" />
      ))}
      {/* Grid label at 50% and 75% */}
      {[0.5, 0.75].map((f) => (
        <text key={f} x={cx + 2} y={cy - f * r - 1} fontSize="6" fill="#cbd5e1" textAnchor="start">{Math.round(f * 100)}%</text>
      ))}
      {/* Spokes */}
      {angles.map((a, i) => {
        const end = pt(1, a);
        return <line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke="#e2e8f0" strokeWidth="0.7" />;
      })}
      {/* Performance area */}
      <path d={perfPath} fill="rgba(99,102,241,0.18)" stroke="#6366f1" strokeWidth="1.8" strokeLinejoin="round" />
      {/* Performance dots */}
      {perfPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#6366f1" stroke="white" strokeWidth="1.2" />)}
      {/* Labels */}
      {courses.map((c, i) => {
        const lp = pt(1.22, angles[i]);
        const anchor = lp.x < cx - 10 ? 'end' : lp.x > cx + 10 ? 'start' : 'middle';
        return (
          <text key={i} x={lp.x.toFixed(1)} y={lp.y.toFixed(1)} textAnchor={anchor} fontSize="7.5" fill="#475569" fontWeight="700">
            {c.course_code}
          </text>
        );
      })}
    </svg>
  );
}

/* ── C: Score Fill Tiles ────────────────────────────────────── */
function FillTiles({ courses }: { courses: CourseCard[] }) {
  const sorted = [...courses].sort((a, b) => (a.entered_weight_pct ?? 0) - (b.entered_weight_pct ?? 0));
  return (
    <div className="flex gap-2 sm:gap-3">
      {sorted.map((c, idx) => {
        const pct = c.entered_weight_pct ?? 0;
        const fillClass = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-500';
        const labelClass = pct > 60 ? 'text-white' : 'text-gray-800';
        const pctClass = pct > 60 ? 'text-white' : scoreText(c.entered_weight_pct);
        return (
          <div
            key={c.ta_id}
            className="relative flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 animate-[fadeInUp_0.5s_ease_forwards] opacity-0"
            style={{ height: 120, animationDelay: `${idx * 100}ms` }}
          >
            {/* Fill from bottom */}
            <div
              className={`absolute bottom-0 left-0 right-0 transition-all duration-1000 ${fillClass}`}
              style={{ height: `${Math.min(pct, 100)}%` }}
            />
            {/* Content overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1">
              <span className={`text-center text-[10px] font-bold leading-tight ${labelClass} drop-shadow-sm`}>
                {c.course_code}
              </span>
              <span className={`text-xl font-black drop-shadow-sm ${pctClass}`}>
                {c.entered_weight_pct !== null ? `${Math.round(c.entered_weight_pct)}%` : '—'}
              </span>
            </div>
            {/* Top label: tier */}
            <div className="absolute top-1.5 left-0 right-0 flex justify-center">
              <span className={`text-[9px] font-semibold uppercase tracking-widest opacity-70 ${pct >= 75 ? 'text-emerald-100' : pct >= 50 ? 'text-amber-100' : 'text-rose-100'}`}>
                {pct >= 75 ? '★ Strong' : pct >= 50 ? '◎ Avg' : '▽ Focus'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── E: Sparkline Card ──────────────────────────────────────── */
function SparklineCard({ course, cycles }: { course: CourseCard; cycles: CyclePoint[] }) {
  const valid = cycles.filter((c) => c.pct !== null) as Array<{ name: string; pct: number }>;
  if (valid.length < 2) return null;
  const W = 100, H = 36;
  const minV = Math.min(...valid.map((p) => p.pct)) - 5;
  const maxV = Math.max(...valid.map((p) => p.pct)) + 5;
  const range = Math.max(maxV - minV, 15);
  const px = (i: number) => (i / (valid.length - 1)) * W;
  const py = (v: number) => H - ((v - minV) / range) * H;
  const linePath = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.pct).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  const trend = valid[valid.length - 1].pct - valid[0].pct;
  const trendColor = trend > 2 ? 'text-emerald-600' : trend < -2 ? 'text-rose-600' : 'text-gray-500';
  const trendIcon = trend > 2 ? '↑' : trend < -2 ? '↓' : '→';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-gray-800">{course.course_code}</p>
        <p className="truncate text-[10px] text-gray-400">{course.course_name}</p>
        <p className="mt-0.5 text-[10px] text-gray-400">{valid.length} cycles</p>
      </div>
      <svg width={W} height={H} className="shrink-0">
        <defs>
          <linearGradient id={`sg-${course.ta_id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#sg-${course.ta_id})`} />
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {valid.map((p, i) => (
          <circle key={i} cx={px(i)} cy={py(p.pct)} r="2.5" fill="#6366f1" stroke="white" strokeWidth="1" />
        ))}
      </svg>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-black ${trendColor}`}>{trendIcon} {Math.abs(Math.round(trend))}%</p>
        <p className="text-[10px] text-gray-400">trend</p>
      </div>
    </div>
  );
}

/* ── Smart Insights (rule-based ML-style) ───────────────────── */
function InsightCard({ courses }: { courses: CourseCard[] }) {
  const ranked = [...courses]
    .filter((c) => c.entered_weight_pct !== null)
    .sort((a, b) => a.entered_weight_pct! - b.entered_weight_pct!);
  if (ranked.length === 0) return null;

  const weakest = ranked[0];
  const strongest = ranked[ranked.length - 1];
  const avg = ranked.reduce((s, c) => s + c.entered_weight_pct!, 0) / ranked.length;

  const tips: Record<string, string> = {
    critical: 'Immediate action needed — revisit fundamentals and attend extra sessions.',
    weak: 'Review past exam topics consistently. Short daily practice sessions help.',
    average: 'You\'re on track. Push past 75% by solving additional problem sets.',
    strong: 'Great work! Challenge yourself with advanced problems to stay sharp.',
  };
  const tier = (pct: number) =>
    pct < 40 ? 'critical' : pct < 60 ? 'weak' : pct < 75 ? 'average' : 'strong';

  const weakTip = tips[tier(weakest.entered_weight_pct!)];
  const selfBetter = strongest.ta_id !== weakest.ta_id;

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-lg bg-indigo-100 p-1.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
        </div>
        <span className="text-sm font-bold text-indigo-900">Smart Insights</span>
        <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">AI-powered</span>
      </div>

      <div className="space-y-2.5">
        {/* Weakest */}
        <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 px-3 py-2.5 border border-rose-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>
            <p className="text-xs font-bold text-rose-700">Focus Area · {weakest.course_code}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-rose-600">{weakTip}</p>
          </div>
          <span className="ml-auto shrink-0 text-sm font-black text-rose-600">{Math.round(weakest.entered_weight_pct!)}%</span>
        </div>

        {/* Strongest */}
        {selfBetter && (
          <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5 border border-emerald-100">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-xs font-bold text-emerald-700">Top Subject · {strongest.course_code}</p>
              <p className="mt-0.5 text-[11px] text-emerald-600">Scoring {Math.round(strongest.entered_weight_pct!)}% — excellent consistency.</p>
            </div>
            <span className="ml-auto shrink-0 text-sm font-black text-emerald-600">{Math.round(strongest.entered_weight_pct!)}%</span>
          </div>
        )}

        {/* Overall average bar */}
        <div className="flex items-center gap-3 rounded-lg bg-white/80 px-3 py-2 border border-gray-100">
          <span className="shrink-0 text-[11px] font-semibold text-gray-500">Overall</span>
          <div className="flex-1 overflow-hidden rounded-full bg-gray-200 h-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${scoreBg(avg)}`}
              style={{ width: `${Math.min(avg, 100)}%` }}
            />
          </div>
          <span className={`shrink-0 text-sm font-black ${scoreText(avg)}`}>{Math.round(avg)}%</span>
        </div>
      </div>
    </div>
  );
}

/* ── Compact Stat Card ─────────────────────────────────────── */
function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  note,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className={`shrink-0 rounded-lg p-2 ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-xl font-black text-gray-900 leading-tight">{value}</p>
        {note && <p className="mt-0.5 truncate text-[10px] text-gray-400">{note}</p>}
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────── */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MyMarksConfig | null>(null);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleMap, setCycleMap] = useState<Record<number, CyclePoint[]>>({});
  const [leaderboard, setLeaderboard] = useState<ClassLeaderboard | null>(null);
  const [showRanksModal, setShowRanksModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchWithAuth('/api/academic-v2/student/my-marks-config/').then((res) => res.json()),
      fetchWithAuth('/api/academic-v2/student/my-courses/').then(async (res) => {
        if (!res.ok) return { courses: [] };
        return res.json();
      }),
      fetchWithAuth('/api/academic-v2/student/my-class-leaderboard/').then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      }),
    ])
      .then(([cfg, courseResp, leaderboardResp]) => {
        if (!mounted) return;
        setConfig(cfg);
        const list: CourseCard[] = Array.isArray(courseResp?.courses) ? courseResp.courses : [];
        setCourses(list);
        setLeaderboard(leaderboardResp ?? null);

        // Fetch cycle data for sparklines (async, non-blocking)
        if (list.length > 0) {
          Promise.all(
            list.map((c) =>
              fetchWithAuth(`/api/academic-v2/student/my-courses/${c.ta_id}/`)
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => ({
                  ta_id: c.ta_id,
                  cycles: (d?.cycles ?? []).map((cy: Record<string, unknown>) => ({
                    name: cy.cycle_name as string,
                    pct: cy.entered_weight_pct as number | null,
                  })),
                }))
                .catch(() => ({ ta_id: c.ta_id, cycles: [] })),
            ),
          ).then((results) => {
            if (!mounted) return;
            const map: Record<number, CyclePoint[]> = {};
            results.forEach((r) => { map[r.ta_id] = r.cycles; });
            setCycleMap(map);
          });
        }
      })
      .catch(() => {
        if (!mounted) return;
        setConfig(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading dashboard…</span>
      </div>
    );
  }

  if (config) {
    const canView =
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number);
    if (!canView) return <RequirementsPage externalConfig={config} />;
  }

  const withMarks = courses.filter((c) => c.entered_weight_pct !== null);
  const average = withMarks.length
    ? Math.round(withMarks.reduce((s, c) => s + c.entered_weight_pct!, 0) / withMarks.length)
    : null;
  const best = withMarks.length
    ? withMarks.reduce((a, b) => (b.entered_weight_pct! > a.entered_weight_pct! ? b : a), withMarks[0])
    : null;

  const sparklineCourses = courses.filter((c) => (cycleMap[c.ta_id]?.filter((p) => p.pct !== null).length ?? 0) >= 2);
  const hasRadar = courses.length >= 3;

  return (
    <MyMarksLayout activeTab="dashboard" title="My Marks Dashboard">
      {/* ── Compact stat cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={BookOpen} iconBg="bg-indigo-50" iconColor="text-indigo-600" label="Enrolled" value={String(courses.length)} note="Academic 2.1 courses" />
        <StatCard icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" label="Average Score" value={average !== null ? `${average}%` : '—'} note="Entered exams only" />
        <StatCard icon={GraduationCap} iconBg="bg-amber-50" iconColor="text-amber-600" label="Best Subject" value={best ? `${Math.round(best.entered_weight_pct!)}%` : '—'} note={best?.course_code ?? '—'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <p className="text-base font-bold text-gray-900">Class Leaderboard</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                {leaderboard?.course_count ?? 0} courses
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Average performance for your cohort across enrolled courses.</p>

            {leaderboard?.top_students?.length ? (
              <div className="mt-8 flex items-end justify-center gap-6 pb-6 pt-4">
                {/* 3rd Place (Priya K. style - left side) */}
                {leaderboard.top_students[2] && (
                  <div className="flex flex-col items-center">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-amber-600/70 bg-blue-50/50 shadow-md">
                      <UserRound className="h-9 w-9 text-amber-700/60" />
                      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white shadow">
                        3
                      </div>
                    </div>
                    <span className="mt-3 text-xs font-bold text-gray-800 truncate max-w-[80px]">
                      {leaderboard.top_students[2].student_name}
                    </span>
                    <span className="text-[11px] font-black text-indigo-600">
                      {leaderboard.top_students[2].average_pct !== null ? `${Math.round(leaderboard.top_students[2].average_pct)}%` : '—'}
                    </span>
                  </div>
                )}

                {/* 1st Place (Sarah J. style - center, larger) */}
                {leaderboard.top_students[0] && (
                  <div className="flex flex-col items-center -translate-y-3">
                    <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-[4px] border-yellow-400 bg-amber-50 shadow-lg ring-4 ring-yellow-400/10">
                      <Award className="h-14 w-14 text-yellow-500" />
                      <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-xs font-black text-amber-950 shadow ring-2 ring-white">
                        1
                      </div>
                    </div>
                    <span className="mt-3 text-sm font-extrabold text-gray-900 truncate max-w-[100px]">
                      {leaderboard.top_students[0].student_name}
                    </span>
                    <span className="text-xs font-black text-indigo-700">
                      {leaderboard.top_students[0].average_pct !== null ? `${Math.round(leaderboard.top_students[0].average_pct)}%` : '—'}
                    </span>
                  </div>
                )}

                {/* 2nd Place (Alex M. style - right side) */}
                {leaderboard.top_students[1] && (
                  <div className="flex flex-col items-center">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-slate-300 bg-blue-50/50 shadow-md">
                      <UserRound className="h-9 w-9 text-slate-400" />
                      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-400 text-[10px] font-bold text-white shadow">
                        2
                      </div>
                    </div>
                    <span className="mt-3 text-xs font-bold text-gray-800 truncate max-w-[80px]">
                      {leaderboard.top_students[1].student_name}
                    </span>
                    <span className="text-[11px] font-black text-indigo-600">
                      {leaderboard.top_students[1].average_pct !== null ? `${Math.round(leaderboard.top_students[1].average_pct)}%` : '—'}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Class leaderboard will update once internal marks are entered for your section.
              </div>
            )}
          </div>

          {leaderboard?.top_students?.length ? (
            <div className="mt-4 border-t border-gray-100 pt-4 text-center">
              <button
                onClick={() => setShowRanksModal(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 transition"
              >
                View all ranks <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Top Subjects Performance</p>
              <p className="mt-1 text-xs text-gray-500">Your internal percentages by course.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{courses.length} courses</span>
          </div>
          <div className="mt-4">
            <HorizontalBars courses={courses} />
          </div>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="mt-8 rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-base font-semibold text-gray-800">No courses yet</p>
          <p className="mt-1 text-sm text-gray-500">Academic 2.1 course assignments will appear here automatically.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">

          {/* ── Row 1: Smart Insight (full width) ── */}
          <InsightCard courses={courses} />

          {/* ── Row 2: Horizontal Bars + Radar ── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            {/* Horizontal Bars */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:col-span-3">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Score Comparison</p>
              <HorizontalBars courses={courses} />
            </div>
            {/* Radar Chart */}
            {hasRadar && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:col-span-2">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Performance Radar</p>
                <div className="flex h-44 items-center justify-center">
                  <RadarChart courses={courses} />
                </div>
              </div>
            )}
            {!hasRadar && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 md:col-span-2 flex items-center justify-center">
                <p className="text-xs text-gray-400 text-center">Radar chart available<br />with 3+ courses</p>
              </div>
            )}
          </div>

          {/* ── Row 3: Score Fill Tiles (weak → strong spectrum) ── */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Strength Spectrum — Weak → Strong</p>
            <FillTiles courses={courses} />
          </div>

          {/* ── Row 4: Sparklines (lazy-loaded) ── */}
          {sparklineCourses.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Cycle-wise Trend</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sparklineCourses.map((c) => (
                  <button
                    key={c.ta_id}
                    type="button"
                    onClick={() => navigate(`/academic-v2/student/course/${c.ta_id}`)}
                    className="group text-left"
                  >
                    <SparklineCard course={c} cycles={cycleMap[c.ta_id] ?? []} />
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}      {showRanksModal && leaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <h3 className="text-lg font-bold text-gray-900">All Section Ranks</h3>
              </div>
              <button
                onClick={() => setShowRanksModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 overflow-y-auto flex-1 pr-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4 text-right">Average Score</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.top_students.map((student) => {
                    const isMe = student.student_id === leaderboard.current_student?.student_id;
                    return (
                      <tr
                        key={student.student_id}
                        className={`border-b text-sm transition hover:bg-gray-50/80 ${
                          isMe ? 'bg-indigo-50/70 font-semibold text-indigo-900' : 'text-gray-700'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          {student.rank === 1 ? <span className="text-base mr-1">🥇</span> : null}
                          {student.rank === 2 ? <span className="text-base mr-1">🥈</span> : null}
                          {student.rank === 3 ? <span className="text-base mr-1">🥉</span> : null}
                          {student.rank > 3 ? <span className="text-gray-400 w-5 inline-block text-center">{student.rank}</span> : null}
                        </td>
                        <td className="py-3.5 px-4">
                          {student.student_name}
                          {isMe && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 py-0.5 px-1.5 rounded-full font-bold">You</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black">
                          {student.average_pct !== null ? `${Math.round(student.average_pct)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 border-t pt-4 flex justify-end">
              <button
                onClick={() => setShowRanksModal(false)}
                className="rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </MyMarksLayout>
  );
}
