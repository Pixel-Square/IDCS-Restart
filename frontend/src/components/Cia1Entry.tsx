import React, { useEffect, useMemo, useState } from 'react';
import { fetchCia1Marks, fetchDraft, publishCia1Sheet, saveDraft } from '../services/obe';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type Props = {
  subjectId: string;
};

type QuestionDef = {
  key: string;
  label: string;
  max: number;
  // 1&2 means split 50/50 into both COs (matches Excel pattern: +O/2 for CO-1 and CO-2)
  co: 1 | 2 | '1&2';
  btl: 1 | 2 | 3 | 4 | 5 | 6;
};

// Defaults (overridden by OBE Master -> Assessment Headers)
const DEFAULT_QUESTIONS: QuestionDef[] = [
  { key: 'q1', label: 'Q1', max: 2, co: 1, btl: 1 },
  { key: 'q2', label: 'Q2', max: 2, co: 1, btl: 3 },
  { key: 'q3', label: 'Q3', max: 2, co: 1, btl: 4 },
  { key: 'q4', label: 'Q4', max: 2, co: 2, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 2, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 2, btl: 2 },
  { key: 'q7', label: 'Q7', max: 16, co: 1, btl: 2 },
  { key: 'q8', label: 'Q8', max: 16, co: 2, btl: 3 },
  // Common CIA1 template uses last question split equally between CO-1 and CO-2.
  { key: 'q9', label: 'Q9', max: 16, co: '1&2', btl: 5 },
];

function parseCo(raw: unknown): 1 | 2 | '1&2' {
  if (raw === '1&2' || raw === 'both') return '1&2';
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '1&2' || s === '1,2' || s === '1/2' || s === '2/1') return '1&2';
    if (s === '2') return 2;
    if (s === '1') return 1;
  }
  if (Array.isArray(raw)) {
    const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (nums.includes(1) && nums.includes(2)) return '1&2';
    if (nums.includes(2)) return 2;
    if (nums.includes(1)) return 1;
  }
  const n = Number(raw);
  if (n === 2) return 2;
  if (n === 12) return '1&2';
  return 1;
}

function coWeights(co: 1 | 2 | '1&2'): { co1: number; co2: number } {
  if (co === '1&2') return { co1: 0.5, co2: 0.5 };
  return co === 2 ? { co1: 0, co2: 1 } : { co1: 1, co2: 0 };
}

function effectiveCoWeightsForQuestion(questions: QuestionDef[], idx: number): { co1: number; co2: number } {
  const q = questions[idx];
  if (!q) return { co1: 0, co2: 0 };
  // Primary: explicit split configured.
  if (q.co === '1&2') return { co1: 0.5, co2: 0.5 };

  // Fallback for legacy configs: if no split question exists, treat the last question
  // (typically the "O" column in the Excel template, often Q9) as split 50/50.
  const hasAnySplit = questions.some((x) => x.co === '1&2');
  const isLast = idx === questions.length - 1;
  const looksLikeQ9 = String(q.key || '').toLowerCase() === 'q9' || String(q.label || '').toLowerCase().includes('q9');
  if (!hasAnySplit && isLast && looksLikeQ9) return { co1: 0.5, co2: 0.5 };

  return coWeights(q.co);
}

type Cia1RowState = {
  studentId: number;
  absent: boolean;
  // question key -> mark
  q: Record<string, number | ''>;
};

type Cia1Sheet = {
  termLabel: string;
  batchLabel: string;
  // question key -> selected BTL (1..6) or '' (unset)
  questionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
  rowsByStudentId: Record<string, Cia1RowState>;
};

type Cia1DraftPayload = {
  termLabel: string;
  batchLabel: string;
  questionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
  rowsByStudentId: Record<string, Cia1RowState>;
};

function defaultQuestionBtl(questions: QuestionDef[]): Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''> {
  return Object.fromEntries((questions || []).map((q) => [q.key, q.btl])) as Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''>;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(mark: number, max: number) {
  if (!max) return '-';
  const p = (mark / max) * 100;
  if (!Number.isFinite(p)) return '-';
  const s = p.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function sheetKey(subjectId: string) {
  return `cia1_sheet_${subjectId}`;
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')]
    .concat(
      rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h];
            const s = String(v ?? '').replace(/\n/g, ' ');
            return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      ),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Cia1Entry({ subjectId }: Props) {
  const [masterCfg, setMasterCfg] = useState<any>(null);
  const [masterCfgWarning, setMasterCfgWarning] = useState<string | null>(null);
  const questions = useMemo<QuestionDef[]>(() => {
    const qs = masterCfg?.assessments?.cia1?.questions;
    if (Array.isArray(qs) && qs.length) {
      return qs
        .map((q: any) => ({
          key: String(q?.key || ''),
          label: String(q?.label || q?.key || ''),
          max: Number(q?.max || 0),
          co: parseCo(q?.co),
          btl: Math.min(6, Math.max(1, Number(q?.btl || 1))) as 1 | 2 | 3 | 4 | 5 | 6,
        }))
        .filter((q: any) => q.key);
    }
    return DEFAULT_QUESTIONS;
  }, [masterCfg]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [serverTotals, setServerTotals] = useState<Record<number, number | null>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Cia1Sheet>({
    termLabel: 'KRCT AY25-26',
    batchLabel: subjectId,
    questionBtl: defaultQuestionBtl(DEFAULT_QUESTIONS),
    rowsByStudentId: {},
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
        setMasterCfgWarning(null);
        setSheet((p) => ({
          ...p,
          termLabel: String((cfg as any)?.termLabel || p.termLabel || 'KRCT AY25-26'),
          batchLabel: subjectId,
        }));
      } catch (e: any) {
        if (!mounted) return;
        setMasterCfg(null);
        setMasterCfgWarning(e?.message || 'Failed to load OBE Master config; using derived maxima from questions.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!subjectId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCia1Marks(subjectId);
        if (!mounted) return;
        const roster = (data.students || []).slice().sort((a, b) => {
          const an = String(a?.name || '').trim().toLowerCase();
          const bn = String(b?.name || '').trim().toLowerCase();
          if (an && bn) {
            const byName = an.localeCompare(bn);
            if (byName) return byName;
          } else if (an || bn) {
            return an ? -1 : 1;
          }
          return String(a?.reg_no || '').localeCompare(String(b?.reg_no || ''), undefined, { numeric: true, sensitivity: 'base' });
        });
        setStudents(roster);
        const apiMarks = data.marks || {};
        const totals: Record<number, number | null> = {};
        for (const [k, v] of Object.entries(apiMarks)) {
          const sid = Number(k);
          if (!Number.isFinite(sid)) continue;
          if (v === null || v === undefined || v === '') {
            totals[sid] = null;
            continue;
          }
          const n = Number(v);
          totals[sid] = Number.isFinite(n) ? n : null;
        }
        setServerTotals(totals);

        // Load local sheet and merge with roster.
        const stored = lsGet<Cia1Sheet>(sheetKey(subjectId));
        const base: Cia1Sheet =
          stored && typeof stored === 'object'
            ? {
                termLabel: masterCfg?.termLabel ? String(masterCfg.termLabel) : String((stored as any).termLabel || 'KRCT AY25-26'),
                batchLabel: subjectId,
                questionBtl:
                  (stored as any).questionBtl && typeof (stored as any).questionBtl === 'object'
                    ? (stored as any).questionBtl
                    : defaultQuestionBtl(questions),
                rowsByStudentId: (stored as any).rowsByStudentId && typeof (stored as any).rowsByStudentId === 'object' ? (stored as any).rowsByStudentId : {},
              }
            : { termLabel: String(masterCfg?.termLabel || 'KRCT AY25-26'), batchLabel: subjectId, questionBtl: defaultQuestionBtl(questions), rowsByStudentId: {} };

        // Backfill missing questionBtl keys.
        const nextQuestionBtl: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | ''> = { ...defaultQuestionBtl(questions), ...(base.questionBtl || {}) };
        for (const q of questions) {
          const v = (nextQuestionBtl as any)[q.key];
          if (!(v === '' || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6)) nextQuestionBtl[q.key] = '';
        }

        // Ensure every roster student has an entry.
        const merged: Record<string, Cia1RowState> = { ...base.rowsByStudentId };
        for (const s of data.students || []) {
          const key = String(s.id);
          if (merged[key]) {
            merged[key] = {
              studentId: s.id,
              absent: Boolean((merged[key] as any).absent),
              q: { ...(merged[key] as any).q },
            };
          } else {
            merged[key] = {
              studentId: s.id,
              absent: false,
              q: Object.fromEntries(questions.map((q) => [q.key, ''])),
            };
          }

          // Backfill missing question keys.
          for (const q of questions) {
            if (!(q.key in (merged[key].q || {}))) merged[key].q[q.key] = '';
          }
        }

        setSheet({ ...base, questionBtl: nextQuestionBtl, termLabel: base.termLabel || String(masterCfg?.termLabel || 'KRCT AY25-26'), batchLabel: subjectId, rowsByStudentId: merged });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load CIA1 roster');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [subjectId, masterCfg, questions]);

  // Load draft from DB (preferred) and merge into local sheet.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const res = await fetchDraft<Cia1DraftPayload>('cia1', subjectId);
        if (!mounted) return;
        const d = res?.draft;
        if (d && typeof d === 'object') {
          setSheet((prev) => ({
            ...prev,
            termLabel: String((d as any).termLabel || prev.termLabel),
            batchLabel: subjectId,
            questionBtl:
              (d as any).questionBtl && typeof (d as any).questionBtl === 'object'
                ? (d as any).questionBtl
                : prev.questionBtl,
            rowsByStudentId:
              (d as any).rowsByStudentId && typeof (d as any).rowsByStudentId === 'object'
                ? (d as any).rowsByStudentId
                : prev.rowsByStudentId,
          }));
          try {
            const sk = sheetKey(subjectId);
            lsSet(sk, {
              termLabel: String((d as any).termLabel || 'KRCT AY25-26'),
              batchLabel: String(subjectId),
              questionBtl: (d as any).questionBtl && typeof (d as any).questionBtl === 'object' ? (d as any).questionBtl : defaultQuestionBtl(questions),
              rowsByStudentId: (d as any).rowsByStudentId && typeof (d as any).rowsByStudentId === 'object' ? (d as any).rowsByStudentId : {},
            });
          } catch {
            // ignore localStorage errors
          }
        }
      } catch (e: any) {
        // If draft fetch fails (permissions/network), keep working locally.
        if (!mounted) return;
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  const totalsMax = useMemo(() => questions.reduce((sum, q) => sum + q.max, 0), [questions]);
  const questionCoMax = useMemo(() => {
    let co1 = 0;
    let co2 = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const w = effectiveCoWeightsForQuestion(questions, i);
      co1 += q.max * w.co1;
      co2 += q.max * w.co2;
    }
    return { co1, co2 };
  }, [questions]);

  const effectiveCoMax = useMemo(() => {
    const cfg = (masterCfg as any)?.assessments?.cia1?.coMax as { co1?: unknown; co2?: unknown } | undefined;
    const rawCo1 = Number(cfg?.co1);
    const rawCo2 = Number(cfg?.co2);
    return {
      co1: Number.isFinite(rawCo1) ? Math.max(0, rawCo1) : questionCoMax.co1,
      co2: Number.isFinite(rawCo2) ? Math.max(0, rawCo2) : questionCoMax.co2,
    };
  }, [masterCfg, questionCoMax]);

  const visibleBtls = useMemo(() => {
    const set = new Set<number>();
    for (const q of questions) {
      const v = (sheet.questionBtl || ({} as any))[q.key];
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) set.add(v);
    }
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n));
  }, [sheet.questionBtl, questions]);

  const questionBtlMax = useMemo(() => {
    const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const q of questions) {
      const v = (sheet.questionBtl || ({} as any))[q.key];
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) out[v] += q.max;
    }
    return out as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  }, [sheet.questionBtl, questions]);

  const effectiveBtlMax = useMemo(() => {
    const cfg = (masterCfg as any)?.assessments?.cia1?.btlMax as Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', unknown>> | undefined;
    const get = (k: '1' | '2' | '3' | '4' | '5' | '6', fallback: number) => {
      const raw = Number((cfg as any)?.[k]);
      return Number.isFinite(raw) ? Math.max(0, raw) : fallback;
    };
    return {
      1: get('1', questionBtlMax[1]),
      2: get('2', questionBtlMax[2]),
      3: get('3', questionBtlMax[3]),
      4: get('4', questionBtlMax[4]),
      5: get('5', questionBtlMax[5]),
      6: get('6', questionBtlMax[6]),
    } as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  }, [masterCfg, questionBtlMax]);

  const setAbsent = (studentId: number, absent: boolean) => {
    setSheet((prev) => {
      const key = String(studentId);
      const existing = prev.rowsByStudentId[key] || {
        studentId,
        absent: false,
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };

      const next: Cia1RowState = absent
        ? { ...existing, absent: true, q: Object.fromEntries(questions.map((q) => [q.key, ''])) }
        : { ...existing, absent: false };

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [key]: next,
        },
      };
    });
  };

  const setQuestionBtl = (qKey: string, value: 1 | 2 | 3 | 4 | 5 | 6 | '') => {
    setSheet((prev) => ({
      ...prev,
      questionBtl: {
        ...(prev.questionBtl || defaultQuestionBtl(questions)),
        [qKey]: value,
      },
    }));
  };

  // Autosave question BTL changes (debounced) and persist to localStorage
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const draft: Cia1DraftPayload = {
          termLabel: sheet.termLabel,
          batchLabel: subjectId,
          questionBtl: sheet.questionBtl,
          rowsByStudentId: sheet.rowsByStudentId,
        };
        await saveDraft('cia1', subjectId, draft);
        try {
          const sk = sheetKey(subjectId);
          lsSet(sk, {
            termLabel: sheet.termLabel,
            batchLabel: subjectId,
            questionBtl: sheet.questionBtl,
            rowsByStudentId: sheet.rowsByStudentId,
          });
        } catch {}
        if (!cancelled) setSavedAt(new Date().toLocaleString());
      } catch {
        // ignore autosave errors
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [sheet.questionBtl, subjectId, sheet.rowsByStudentId]);

  const setQuestionMark = (studentId: number, qKey: string, value: number | '') => {
    setSheet((prev) => {
      const key = String(studentId);
      const existing = prev.rowsByStudentId[key] || {
        studentId,
        absent: false,
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };
      const def = questions.find((q) => q.key === qKey);
      const max = def?.max ?? totalsMax;

      const nextValue = value === '' ? '' : clamp(Number(value || 0), 0, max);

      return {
        ...prev,
        rowsByStudentId: {
          ...prev.rowsByStudentId,
          [key]: {
            ...existing,
            q: {
              ...(existing.q || {}),
              [qKey]: nextValue,
            },
          },
        },
      };
    });
  };

  const payload = useMemo(() => {
    const out: Record<number, number | null> = {};
    for (const s of students) {
      const row = sheet.rowsByStudentId[String(s.id)];
      if (!row) {
        out[s.id] = null;
        continue;
      }
      if (row.absent) {
        out[s.id] = 0;
        continue;
      }
      const total = questions.reduce((sum, q) => sum + clamp(Number(row.q?.[q.key] || 0), 0, q.max), 0);
      out[s.id] = total;
    }
    return out;
  }, [students, sheet.rowsByStudentId, questions]);

  const saveDraftToDb = async () => {
    setSaving(true);
    setError(null);
    try {
      const draft: Cia1DraftPayload = {
        termLabel: sheet.termLabel,
        batchLabel: subjectId,
        questionBtl: sheet.questionBtl,
        rowsByStudentId: sheet.rowsByStudentId,
      };
      await saveDraft('cia1', subjectId, draft);
      setSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setError(e?.message || 'Failed to save CIA1 draft');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      // Persist a snapshot of the sheet + question headers used for CO calculations.
      const data = {
        ...sheet,
        batchLabel: subjectId,
        questions,
      };
      await publishCia1Sheet(subjectId, data);
      setPublishedAt(new Date().toLocaleString());
      try {
        window.dispatchEvent(new CustomEvent('obe:published', { detail: { subjectId } }));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to publish CIA1');
    } finally {
      setPublishing(false);
    }
  };

  const exportSheetCsv = () => {
    const out = students.map((s, i) => {
      const row = sheet.rowsByStudentId[String(s.id)] || {
        studentId: s.id,
        absent: false,
        q: Object.fromEntries(questions.map((q) => [q.key, ''])),
      };

      const qMarks = Object.fromEntries(
        questions.map((q) => [q.key, row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)]),
      );
      const total = row.absent ? 0 : questions.reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);

      let co1 = 0;
      let co2 = 0;
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const w = effectiveCoWeightsForQuestion(questions, qi);
        const m = Number(qMarks[q.key] || 0);
        co1 += m * w.co1;
        co2 += m * w.co2;
      }

      const btl: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      for (const q of questions) {
        const v = (sheet.questionBtl || ({} as any))[q.key];
        if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) btl[v] += Number(qMarks[q.key] || 0);
      }

      return {
        sno: i + 1,
        registerNo: s.reg_no,
        name: s.name,
        absent: row.absent ? 1 : 0,
        ...qMarks,
        total,
        co1_mark: co1,
        co1_pct: pct(co1, effectiveCoMax.co1),
        co2_mark: co2,
        co2_pct: pct(co2, effectiveCoMax.co2),
        ...Object.fromEntries(
          visibleBtls.flatMap((n) => [
            [`btl${n}_mark`, btl[n as 1 | 2 | 3 | 4 | 5 | 6]],
            [`btl${n}_pct`, pct(btl[n as 1 | 2 | 3 | 4 | 5 | 6], effectiveBtlMax[n as 1 | 2 | 3 | 4 | 5 | 6])],
          ]),
        ),
      };
    });

    downloadCsv(`${subjectId}_CIA1_sheet.csv`, out);
  };

  if (loading) return <div style={{ color: '#6b7280' }}>Loading CIA1 roster…</div>;

  const cellTh: React.CSSProperties = {
    border: '1px solid #111',
    padding: '6px 6px',
    background: '#f3f4f6',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const cellTd: React.CSSProperties = {
    border: '1px solid #111',
    padding: '6px 6px',
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 12,
  };

  return (
    <div>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {masterCfgWarning && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b55', color: '#92400e', padding: 10, borderRadius: 10, marginBottom: 10 }}>
          {masterCfgWarning}
        </div>
      )}

      <div className="obe-card"
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>CIA1 Sheet</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Excel-like layout (Q-wise + CO + BTL). Subject: <b>{subjectId}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={saveDraftToDb} className="obe-btn" disabled={saving || students.length === 0}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={exportSheetCsv} className="obe-btn" disabled={students.length === 0}>
            Export CSV
          </button>
          <button
            onClick={publish}
            disabled={publishing || students.length === 0}
            className="obe-btn obe-btn-primary"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
          {savedAt && (
            <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
              Saved: {savedAt}
            </div>
          )}
          {publishedAt && (
            <div style={{ fontSize: 12, color: '#16a34a', alignSelf: 'center' }}>
              Published: {publishedAt}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 12,
          background: '#fff',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#374151' }}>
            Term
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.termLabel}</div>
          </label>
          <label style={{ fontSize: 12, color: '#374151' }}>
            Sheet Label
            <div style={{ marginLeft: 8, padding: 6, border: '1px solid #d1d5db', borderRadius: 8, minWidth: 160 }}>{sheet.batchLabel}</div>
          </label>
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            Total max: {totalsMax} | Questions: {questions.length} | COs: 1–2 | BTLs: 1–6
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>No students found for this subject.</div>
      ) : (
        <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="obe-table" style={{ minWidth: 0, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={cellTh} colSpan={4 + questions.length + 1 + 4 + visibleBtls.length * 2}>
                  {sheet.termLabel} &nbsp;&nbsp;|&nbsp;&nbsp; {sheet.batchLabel} &nbsp;&nbsp;|&nbsp;&nbsp; CIA1
                </th>
              </tr>
              <tr>
                <th style={cellTh} rowSpan={3}>
                  S.No
                </th>
                <th style={cellTh} rowSpan={3}>
                  Register No.
                </th>
                <th style={cellTh} rowSpan={3}>
                  Name of the Students
                </th>
                <th style={cellTh} rowSpan={3}>
                  ABSENT
                </th>

                <th style={cellTh} colSpan={questions.length}>
                  QUESTIONS
                </th>
                <th style={cellTh} rowSpan={3}>
                  Total
                </th>
                <th style={cellTh} colSpan={4}>
                  CO ATTAINMENT
                </th>
                {visibleBtls.length ? (
                  <th style={cellTh} colSpan={visibleBtls.length * 2}>
                    BTL ATTAINMENT
                  </th>
                ) : null}
              </tr>
              <tr>
                {questions.map((q) => (
                  <th key={q.key} style={cellTh}>
                    {q.label}
                  </th>
                ))}
                <th style={cellTh} colSpan={2}>
                  CO-1
                </th>
                <th style={cellTh} colSpan={2}>
                  CO-2
                </th>
                {visibleBtls.map((n) => (
                  <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                    BTL-{n}
                  </th>
                ))}
              </tr>
              <tr>
                {questions.map((q) => (
                  <th key={q.key} style={cellTh}>
                    {q.max}
                  </th>
                ))}
                {Array.from({ length: 2 + visibleBtls.length }).flatMap((_, i) => (
                  <React.Fragment key={i}>
                    <th style={cellTh}>Mark</th>
                    <th style={cellTh}>%</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody>
              <tr>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={3} />
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>BTL</td>
                {questions.map((q) => (
                  <td key={`btl-select-${q.key}`} style={{ ...cellTd, textAlign: 'center' }}>
                    <select
                      value={(sheet.questionBtl || ({} as any))[q.key] ?? ''}
                      onChange={(e) =>
                        setQuestionBtl(q.key, e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6))
                      }
                      style={{ width: '100%', fontSize: 12, padding: '2px 4px' }}
                    >
                      <option value="">-</option>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} />
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={4} />
                {visibleBtls.map((n) => (
                  <React.Fragment key={`btl-pad-${n}`}>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} />
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} />
                  </React.Fragment>
                ))}
              </tr>

              <tr>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }} colSpan={3}>
                  Name / Max Marks
                </td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>-</td>

                {questions.map((q) => (
                  <td key={q.key} style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>
                    {q.max}
                  </td>
                ))}
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{totalsMax}</td>

                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{effectiveCoMax.co1}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{effectiveCoMax.co2}</td>
                <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                {visibleBtls.map((n) => (
                  <React.Fragment key={`btl-max-${n}`}>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>{effectiveBtlMax[n as 1 | 2 | 3 | 4 | 5 | 6]}</td>
                    <td style={{ ...cellTd, fontWeight: 700, textAlign: 'center' }}>%</td>
                  </React.Fragment>
                ))}
              </tr>

              {students.map((s, i) => {
                const row = sheet.rowsByStudentId[String(s.id)] || {
                  studentId: s.id,
                  absent: false,
                  q: Object.fromEntries(questions.map((q) => [q.key, ''])),
                };

                const qMarks = Object.fromEntries(
                  questions.map((q) => [q.key, row.absent ? 0 : clamp(Number(row.q?.[q.key] || 0), 0, q.max)]),
                ) as Record<string, number>;
                const total = row.absent ? 0 : questions.reduce((sum, q) => sum + Number(qMarks[q.key] || 0), 0);

                let co1 = 0;
                let co2 = 0;
                for (let qi = 0; qi < questions.length; qi++) {
                  const q = questions[qi];
                  const w = effectiveCoWeightsForQuestion(questions, qi);
                  const m = Number(qMarks[q.key] || 0);
                  co1 += m * w.co1;
                  co2 += m * w.co2;
                }

                const btl: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
                for (const q of questions) {
                  const v = (sheet.questionBtl || ({} as any))[q.key];
                  if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) btl[v] += Number(qMarks[q.key] || 0);
                }

                const rowStyle: React.CSSProperties | undefined = row.absent
                  ? { background: '#f3f4f6', color: '#6b7280' }
                  : undefined;

                const serverTotal = serverTotals[s.id];

                return (
                  <tr key={s.id} style={rowStyle}>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{i + 1}</td>
                    <td style={cellTd}>{s.reg_no}</td>
                    <td style={cellTd}>{s.name}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={row.absent}
                        onChange={(e) => setAbsent(s.id, e.target.checked)}
                      />
                    </td>

                    {questions.map((q) => (
                      <td key={q.key} style={{ ...cellTd, textAlign: 'center' }}>
                        <input
                          style={{ ...inputStyle, textAlign: 'center', opacity: row.absent ? 0.5 : 1 }}
                          type="number"
                          min={0}
                          max={q.max}
                          value={row.absent ? '' : row.q?.[q.key] === '' || row.q?.[q.key] == null ? '' : clamp(Number(row.q?.[q.key] || 0), 0, q.max)}
                          onChange={(e) => setQuestionMark(s.id, q.key, e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={row.absent}
                        />
                      </td>
                    ))}

                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }} title={serverTotal != null ? `Server total: ${serverTotal}` : undefined}>
                      {total}
                    </td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>{co1}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co1, effectiveCoMax.co1)}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{co2}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{pct(co2, effectiveCoMax.co2)}</td>

                    {visibleBtls.map((n) => (
                      <React.Fragment key={`btl-row-${s.id}-${n}`}>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{btl[n as 1 | 2 | 3 | 4 | 5 | 6]}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{pct(btl[n as 1 | 2 | 3 | 4 | 5 | 6], effectiveBtlMax[n as 1 | 2 | 3 | 4 | 5 | 6])}</td>
                      </React.Fragment>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
