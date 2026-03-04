import React, { useEffect, useMemo, useState } from 'react';
import { Table2, BarChart2, TrendingUp, Trophy, Download } from 'lucide-react';
import {
  fetchClassTypeWeights,
  fetchCiaMarks,
  fetchDraft,
  fetchMyTeachingAssignments,
  fetchPublishedFormative,
  fetchPublishedModelSheet,
  fetchPublishedReview1,
  fetchPublishedReview2,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  TeachingAssignmentItem,
} from '../../../services/obe';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../../../services/roster';
import fetchWithAuth from '../../../services/fetchAuth';
import { lsGet, lsSet } from '../../../utils/localStorage';
import { getCachedMe } from '../../../services/auth';
import { normalizeClassType } from '../../../constants/classTypes';
import MarkAnalysisSheetPage, { SheetCol, SheetRow } from './MarkAnalysisSheetPage';
import BellGraphPage from './BellGraphPage';
import RangeAnalysisPage from './RangeAnalysisPage';
import RankingPage from './RankingPage';
import DownloadReportModal from './DownloadReportModal';

type Props = {
  courseId: string;
  classType?: string | null;
  enabledAssessments?: string[] | null;
};

type CycleKey = 'cycle1' | 'cycle2' | 'model';
type ViewKey = 'sheet' | 'bell' | 'range' | 'rank';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const toNum = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export default function ResultAnalysisPage({ courseId, classType, enabledAssessments }: Props): JSX.Element {
  const ct = useMemo(() => normalizeClassType(classType) || 'THEORY', [classType]);
  const enabledSet = useMemo(
    () => new Set((enabledAssessments || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)),
    [enabledAssessments],
  );

  /* ── UI State ── */
  const [activeCycle, setActiveCycle] = useState<CycleKey>('cycle1');
  const [activeView, setActiveView] = useState<ViewKey>('sheet');
  const [showDownload, setShowDownload] = useState(false);

  /* ── Section / TA ── */
  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);
  const [taError, setTaError] = useState<string | null>(null);

  /* ── Students ── */
  const [students, setStudents] = useState<TeachingAssignmentRosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  /* ── Weights from server ── */
  const [w, setW] = useState({ cia1: 6, ssa1: 2, fa1: 3, cia2: 6, ssa2: 2, fa2: 3 });

  /* ── Raw marks ── */
  type RawSet = Record<string, any>;
  const [raw1, setRaw1] = useState<{ cia1: RawSet; ssa1: RawSet; fa1: RawSet; rev1: RawSet }>({ cia1: {}, ssa1: {}, fa1: {}, rev1: {} });
  const [raw2, setRaw2] = useState<{ cia2: RawSet; ssa2: RawSet; fa2: RawSet; rev2: RawSet }>({ cia2: {}, ssa2: {}, fa2: {}, rev2: {} });
  const [rawModel, setRawModel] = useState<RawSet>({});

  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [error1, setError1] = useState<string | null>(null);
  const [error2, setError2] = useState<string | null>(null);
  const [errorModel, setErrorModel] = useState<string | null>(null);

  /* ── Fetch TAs ── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchMyTeachingAssignments();
        if (!mounted) return;
        let filtered = (all || []).filter((a) => String(a.subject_code) === String(courseId));
        if (filtered.length === 0) {
          try {
            const res = await fetchWithAuth(`/api/academics/teaching-assignments/?subject_code=${encodeURIComponent(courseId)}`);
            if (res.ok) {
              const json = await res.json();
              filtered = Array.isArray(json.results) ? json.results : Array.isArray(json) ? json : (json.items || []);
            }
          } catch { /* ignore */ }
        }
        setTas(filtered);
        const stored = lsGet<number>(`resultAnalysis_selectedTa_${courseId}`);
        const initial = (typeof stored === 'number' && filtered.some((f) => f.id === stored) ? stored : filtered[0]?.id) ?? null;
        setSelectedTaId(initial);
        setTaError(null);
      } catch (e: any) {
        if (!mounted) return;
        setTaError(e?.message || 'Failed to load sections');
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  useEffect(() => {
    if (courseId && selectedTaId != null) lsSet(`resultAnalysis_selectedTa_${courseId}`, selectedTaId);
  }, [courseId, selectedTaId]);

  /* ── Fetch Weights ── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchClassTypeWeights();
        if (!mounted) return;
        const row = (all as any)?.[ct] || (all as any)?.[ct.toLowerCase()] || null;
        if (row) {
          const n = (k: string, def: number) => { const v = Number((row as any)[k]); return Number.isFinite(v) && v > 0 ? v : def; };
          setW({
            cia1: n('cia1', 6), ssa1: n('ssa1', 2), fa1: n('formative1', 3),
            cia2: n('cia2', 6), ssa2: n('ssa2', 2), fa2: n('formative2', 3),
          });
        }
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [courseId, ct]);

  /* ── Fetch Roster ── */
  useEffect(() => {
    if (!selectedTaId) { setStudents([]); return; }
    let mounted = true;
    setLoadingRoster(true);
    (async () => {
      try {
        const res = await fetchTeachingAssignmentRoster(selectedTaId);
        if (!mounted) return;
        setStudents(Array.isArray(res.students) ? res.students : []);
      } catch { if (mounted) setStudents([]); }
      finally { if (mounted) setLoadingRoster(false); }
    })();
    return () => { mounted = false; };
  }, [selectedTaId]);

  const allow = (k: string) => {
    if (ct !== 'SPECIAL') return true;
    if (!enabledSet.size) return true;
    return enabledSet.has(k);
  };

  /* ── Fetch Cycle 1 ── */
  useEffect(() => {
    if (!courseId || selectedTaId == null) return;
    let mounted = true;
    setLoading1(true); setError1(null);
    (async () => {
      try {
        const tryDraft = async (key: any) => {
          try { const d = await fetchDraft<any>(key, courseId, selectedTaId); const m = (d?.draft as any)?.marks; if (m && typeof m === 'object') return m; } catch { /* */ }
          return null;
        };

        const cia1 = await (async () => {
          if (!allow('cia1')) return {};
          try { const r = await fetchCiaMarks('cia1', courseId, selectedTaId); return r?.marks || {}; } catch { return {}; }
        })();

        const ssa1 = await (async () => {
          if (ct === 'LAB' || ct === 'PRACTICAL' || ct === 'PROJECT') return {};
          if (!allow('ssa1')) return {};
          return (await tryDraft('ssa1')) || (await (async () => { try { return (await fetchPublishedSsa1(courseId, selectedTaId))?.marks || {}; } catch { return {}; } })());
        })();

        const fa1 = await (async () => {
          if (ct !== 'THEORY' && ct !== 'TCPL' && ct !== 'SPECIAL') return {};
          if (!allow('formative1')) return {};
          return (await tryDraft('formative1')) || (await (async () => { try { return (await fetchPublishedFormative('formative1', courseId, selectedTaId))?.marks || {}; } catch { return {}; } })());
        })();

        const rev1 = await (async () => {
          if (!(ct === 'TCPR' || ct === 'PROJECT')) return {};
          if (!allow('review1')) return {};
          return (await tryDraft('review1')) || (await (async () => { try { return (await fetchPublishedReview1(courseId))?.marks || {}; } catch { return {}; } })());
        })();

        if (!mounted) return;
        setRaw1({ cia1, ssa1, fa1, rev1 });
      } catch (e: any) { if (mounted) { setRaw1({ cia1: {}, ssa1: {}, fa1: {}, rev1: {} }); setError1(e?.message || 'Failed'); } }
      finally { if (mounted) setLoading1(false); }
    })();
    return () => { mounted = false; };
  }, [courseId, selectedTaId, ct, enabledSet]);

  /* ── Fetch Cycle 2 ── */
  useEffect(() => {
    if (!courseId || selectedTaId == null) return;
    let mounted = true;
    setLoading2(true); setError2(null);
    (async () => {
      try {
        const tryDraft = async (key: any) => {
          try { const d = await fetchDraft<any>(key, courseId, selectedTaId); const m = (d?.draft as any)?.marks; if (m && typeof m === 'object') return m; } catch { /* */ }
          return null;
        };

        const cia2 = await (async () => {
          if (!allow('cia2')) return {};
          try { const r = await fetchCiaMarks('cia2', courseId, selectedTaId); return r?.marks || {}; } catch { return {}; }
        })();

        const ssa2 = await (async () => {
          if (ct === 'LAB' || ct === 'PRACTICAL' || ct === 'PROJECT') return {};
          if (!allow('ssa2')) return {};
          return (await tryDraft('ssa2')) || (await (async () => { try { return (await fetchPublishedSsa2(courseId, selectedTaId))?.marks || {}; } catch { return {}; } })());
        })();

        const fa2 = await (async () => {
          if (ct !== 'THEORY' && ct !== 'TCPL' && ct !== 'SPECIAL') return {};
          if (!allow('formative2')) return {};
          return (await tryDraft('formative2')) || (await (async () => { try { return (await fetchPublishedFormative('formative2', courseId, selectedTaId))?.marks || {}; } catch { return {}; } })());
        })();

        const rev2 = await (async () => {
          if (!(ct === 'TCPR' || ct === 'PROJECT')) return {};
          if (!allow('review2')) return {};
          return (await tryDraft('review2')) || (await (async () => { try { return (await fetchPublishedReview2(courseId))?.marks || {}; } catch { return {}; } })());
        })();

        if (!mounted) return;
        setRaw2({ cia2, ssa2, fa2, rev2 });
      } catch (e: any) { if (mounted) { setRaw2({ cia2: {}, ssa2: {}, fa2: {}, rev2: {} }); setError2(e?.message || 'Failed'); } }
      finally { if (mounted) setLoading2(false); }
    })();
    return () => { mounted = false; };
  }, [courseId, selectedTaId, ct, enabledSet]);

  /* ── Fetch Model ── */
  useEffect(() => {
    if (!courseId || selectedTaId == null) return;
    let mounted = true;
    setLoadingModel(true); setErrorModel(null);
    (async () => {
      try {
        const sheet = await fetchPublishedModelSheet(courseId, selectedTaId);
        if (!mounted) return;
        const data = (sheet as any)?.data ?? null;
        const marks = (data as any)?.marks ?? {};
        // Compute per-student total as sum of question values
        const totals: RawSet = {};
        for (const [sid, qMarks] of Object.entries(marks)) {
          if (qMarks && typeof qMarks === 'object') {
            totals[sid] = Object.values(qMarks as Record<string, any>).reduce(
              (s, v) => s + (Number(v) || 0), 0,
            );
          }
        }
        setRawModel(totals);
      } catch { if (mounted) setRawModel({}); }
      finally { if (mounted) setLoadingModel(false); }
    })();
    return () => { mounted = false; };
  }, [courseId, selectedTaId]);

  /* ── Build Columns per Cycle ── */
  const cols1: SheetCol[] = useMemo(() => {
    const c: SheetCol[] = [];
    if (allow('cia1')) c.push({ key: 'cia1', label: 'CIA 1', max: 60, weight: w.cia1 });
    if (ct !== 'LAB' && ct !== 'PRACTICAL' && ct !== 'PROJECT' && allow('ssa1'))
      c.push({ key: 'ssa1', label: 'SSA 1', max: 20, weight: w.ssa1 });
    if ((ct === 'THEORY' || ct === 'TCPL') && allow('formative1'))
      c.push({ key: 'fa1', label: 'FA 1', max: 20, weight: w.fa1 });
    if ((ct === 'TCPR' || ct === 'PROJECT') && allow('review1'))
      c.push({ key: 'rev1', label: 'Review 1', max: 20, weight: w.fa1 });
    return c;
  }, [ct, enabledSet, w]);

  const cols2: SheetCol[] = useMemo(() => {
    const c: SheetCol[] = [];
    if (allow('cia2')) c.push({ key: 'cia2', label: 'CIA 2', max: 60, weight: w.cia2 });
    if (ct !== 'LAB' && ct !== 'PRACTICAL' && ct !== 'PROJECT' && allow('ssa2'))
      c.push({ key: 'ssa2', label: 'SSA 2', max: 20, weight: w.ssa2 });
    if ((ct === 'THEORY' || ct === 'TCPL') && allow('formative2'))
      c.push({ key: 'fa2', label: 'FA 2', max: 20, weight: w.fa2 });
    if ((ct === 'TCPR' || ct === 'PROJECT') && allow('review2'))
      c.push({ key: 'rev2', label: 'Review 2', max: 20, weight: w.fa2 });
    return c;
  }, [ct, enabledSet, w]);

  const colsModel: SheetCol[] = [{ key: 'model', label: 'Model Exam', max: 100, weight: 1 }];

  /* ── Build Rows per Cycle ── */
  const buildRows = (cols: SheetCol[], rawSource: RawSet): SheetRow[] =>
    students.map((s) => {
      const sid = String(s.id);
      const marks: Record<string, number | null> = {};
      for (const col of cols) {
        const raw = rawSource[col.key] || {};
        if (col.key === 'fa1' || col.key === 'fa2') {
          const fRow = (raw as any)[sid];
          const v = toNum(fRow?.total);
          marks[col.key] = v == null ? null : clamp(v, 0, col.max);
        } else {
          const v = toNum((raw as any)[sid]);
          if (v == null) { marks[col.key] = null; }
          else {
            // SSA can come in as 40-point; halve if needed
            const adj = (col.key === 'ssa1' || col.key === 'ssa2') && v > col.max ? v / 2 : v;
            marks[col.key] = clamp(adj, 0, col.max);
          }
        }
      }
      const wSum = cols.reduce((s, c) => s + (Number(c.weight) || 0), 0);
      const hasAny = cols.some((c) => marks[c.key] != null);
      let total100: number | null = null;
      if (hasAny && wSum > 0) {
        const parts = cols.reduce((s, c) => {
          const m = marks[c.key]; return m == null ? s : s + (m / c.max) * (Number(c.weight) || 0);
        }, 0);
        total100 = Math.round((parts / wSum) * 100);
      }
      return { id: s.id, regNo: s.reg_no, name: s.name, marks, total100 };
    });

  const rawSource1 = useMemo(() => ({ cia1: raw1.cia1, ssa1: raw1.ssa1, fa1: raw1.fa1, rev1: raw1.rev1 }), [raw1]);
  const rawSource2 = useMemo(() => ({ cia2: raw2.cia2, ssa2: raw2.ssa2, fa2: raw2.fa2, rev2: raw2.rev2 }), [raw2]);

  const rows1 = useMemo(() => buildRows(cols1, rawSource1), [students, rawSource1, cols1]);
  const rows2 = useMemo(() => buildRows(cols2, rawSource2), [students, rawSource2, cols2]);
  const rowsModel = useMemo(
    () => students.map((s) => {
      const sid = String(s.id);
      const v = toNum(rawModel[sid] ?? null);
      const marks: Record<string, number | null> = { model: v == null ? null : clamp(v, 0, 100) };
      return { id: s.id, regNo: s.reg_no, name: s.name, marks, total100: marks.model };
    }),
    [students, rawModel],
  );

  const activeCols = activeCycle === 'cycle1' ? cols1 : activeCycle === 'cycle2' ? cols2 : colsModel;
  const activeRows = activeCycle === 'cycle1' ? rows1 : activeCycle === 'cycle2' ? rows2 : rowsModel;
  const activeLoading = loadingRoster || (activeCycle === 'cycle1' ? loading1 : activeCycle === 'cycle2' ? loading2 : loadingModel);
  const activeError = activeCycle === 'cycle1' ? error1 : activeCycle === 'cycle2' ? error2 : errorModel;

  const activeTotals = useMemo(
    () => activeRows.map((r) => r.total100).filter((v): v is number => v != null),
    [activeRows],
  );

  const cycleLabels: Record<CycleKey, string> = { cycle1: 'Cycle 1', cycle2: 'Cycle 2', model: 'Model' };
  const viewMeta: Record<ViewKey, { icon: React.ReactNode; label: string }> = {
    sheet: { icon: <Table2  size={14} />, label: 'Mark Analysis Sheet' },
    bell:  { icon: <BarChart2 size={14} />, label: 'Bell Graph' },
    range: { icon: <TrendingUp size={14} />, label: 'Range Analysis' },
    rank:  { icon: <Trophy size={14} />, label: 'Ranking' },
  };

  /* ── Derived for download ── */
  const selectedTa = tas.find((t) => t.id === selectedTaId);
  const sectionName = selectedTa?.section_name || selectedTa?.subject_code || courseId;
  const courseName = selectedTa?.subject_name || selectedTa?.elective_subject_name || courseId;
  const staffName = (() => {
    const me = getCachedMe() as any;
    if (!me) return '';
    const full = `${me.first_name || ''} ${me.last_name || ''}`.replace(/\s+/g, ' ').trim();
    return full || me.profile?.full_name || me.username || '';
  })();

  return (
    <div style={{ background: '#f8fafc', minHeight: 'calc(100vh - 280px)', width: '100%' }}>
      {/* ─── Page Header ─── */}
      <div style={{ background: '#1e3a5f', color: '#fff', padding: '18px 24px 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.01em' }}>Result Analysis</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              {courseId} · {ct}
            </div>
          </div>
          {/* Section selector */}
          {taError ? (
            <div style={{ color: '#fca5a5', fontSize: 12 }}>{taError}</div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>Section</span>
              <select
                value={selectedTaId ?? ''}
                onChange={(e) => setSelectedTaId(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontWeight: 600, minWidth: 200, cursor: 'pointer' }}
              >
                {tas.map((t) => (
                  <option key={t.id} value={t.id} style={{ background: '#1e3a5f' }}>
                    {t.section_name ? `${t.section_name}` : `${t.subject_code} (${t.id})`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* ── Download Button ── */}
          <button
            onClick={() => setShowDownload(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px',
              borderRadius: 9,
              border: '1.5px solid rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.13)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.15s',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.13)'; }}
          >
            <Download size={16} />
            <span>Download</span>
          </button>
        </div>

        {/* ── Cycle Tabs ── */}
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
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {cycleLabels[c]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px' }}>
        {/* ── View Sub-Tabs ── */}
        <div style={{ display: 'flex', gap: 2, paddingTop: 12 }}>
          {(['sheet', 'bell', 'range', 'rank'] as ViewKey[]).map((v) => (
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {viewMeta[v].icon}{viewMeta[v].label}
              </span>
            </button>
          ))}
          {/* Student count badge */}
          <div style={{ marginLeft: 'auto', alignSelf: 'center', paddingBottom: 4 }}>
            {!loadingRoster && students.length > 0 && (
              <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>
                {students.length} Students
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Content Area ── */}
      <div style={{ padding: '24px', maxWidth: '100%' }}>
        {/* Cycle label */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: 6, padding: '3px 12px', fontWeight: 700, fontSize: 12 }}>
            {cycleLabels[activeCycle]}
          </span>
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            {activeCycle === 'cycle1' && (ct === 'THEORY' || ct === 'TCPL') && 'CIA 1 + SSA 1 + FA 1'}
            {activeCycle === 'cycle1' && (ct === 'TCPR' || ct === 'PROJECT') && 'CIA 1 + SSA 1 + Review 1'}
            {activeCycle === 'cycle1' && (ct === 'LAB' || ct === 'PRACTICAL') && 'CIA 1'}
            {activeCycle === 'cycle2' && (ct === 'THEORY' || ct === 'TCPL') && 'CIA 2 + SSA 2 + FA 2'}
            {activeCycle === 'cycle2' && (ct === 'TCPR' || ct === 'PROJECT') && 'CIA 2 + SSA 2 + Review 2'}
            {activeCycle === 'cycle2' && (ct === 'LAB' || ct === 'PRACTICAL') && 'CIA 2'}
            {activeCycle === 'model' && 'Model Examination'}
          </span>
        </div>

        {activeView === 'sheet' && (
          <MarkAnalysisSheetPage
            cols={activeCols}
            rows={activeRows}
            loading={activeLoading}
            error={activeError}
          />
        )}
        {activeView === 'bell' && (
          <BellGraphPage
            totals={activeTotals}
            loading={activeLoading}
            cycleName={cycleLabels[activeCycle]}
          />
        )}
        {activeView === 'range' && (
          <RangeAnalysisPage
            totals={activeTotals}
            loading={activeLoading}
          />
        )}
        {activeView === 'rank' && (
          <RankingPage
            cols={activeCols}
            rows={activeRows}
            loading={activeLoading}
          />
        )}
      </div>

      {/* ── Download Report Modal ── */}
      <DownloadReportModal
        open={showDownload}
        onClose={() => setShowDownload(false)}
        courseId={courseId}
        courseName={courseName}
        ct={ct}
        sectionName={sectionName}
        staffName={staffName}
        studentCount={students.length}
        cycleName={cycleLabels[activeCycle]}
        cols={activeCols}
        rows={activeRows}
        totals={activeTotals}
      />
    </div>
  );
}
