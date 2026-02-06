import React, { useEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';

type Props = {
  subjectId: string;
  teachingAssignmentId?: number;
  classType?: string | null;
  questionPaperType?: string | null;
};

type BtlValue = '' | 1 | 2 | 3 | 4 | 5 | 6;

type CellNumber = '' | number;

type AbsenceKind = 'AL' | 'ML' | 'SKL';

type TcplRowEntry = {
  absent?: boolean;
  absentKind?: AbsenceKind;
  lab?: CellNumber;
  q?: Record<string, CellNumber>;
};

type TcplSheetState = Record<string, TcplRowEntry>;

type QuestionDef = {
  key: string;
  label: string;
  max: number;
};

// Keep the same default question layout as CIA for a familiar sheet template.
const DEFAULT_MODEL_QUESTIONS: QuestionDef[] = [
  { key: 'q1', label: 'Q1', max: 2 },
  { key: 'q2', label: 'Q2', max: 2 },
  { key: 'q3', label: 'Q3', max: 2 },
  { key: 'q4', label: 'Q4', max: 2 },
  { key: 'q5', label: 'Q5', max: 2 },
  { key: 'q6', label: 'Q6', max: 2 },
  { key: 'q7', label: 'Q7', max: 16 },
  { key: 'q8', label: 'Q8', max: 16 },
  { key: 'q9', label: 'Q9', max: 16 },
];

export default function ModelEntry({ subjectId, classType, teachingAssignmentId, questionPaperType }: Props) {
  const questions = useMemo(() => DEFAULT_MODEL_QUESTIONS, []);
  const visibleBtls = useMemo(() => [1, 2, 3, 4, 5, 6] as const, []);

  const cellTh: React.CSSProperties = {
    border: '1px solid #111',
    padding: '4px 4px',
    background: '#ecfdf5',
    color: '#065f46',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const cellTd: React.CSSProperties = {
    border: '1px solid #111',
    padding: '4px 4px',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const SNO_COL_WIDTH = 32;
  const colSpan = 4 + questions.length + 1 + 4 + visibleBtls.length * 2;

  const [students, setStudents] = useState<TeachingAssignmentRosterStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAbsenteesOnly, setShowAbsenteesOnly] = useState(false);
  const [absenteesSnapshotKeys, setAbsenteesSnapshotKeys] = useState<string[] | null>(null);
  const [limitDialog, setLimitDialog] = useState<{ title: string; message: string } | null>(null);
  const [tcplSheet, setTcplSheet] = useState<TcplSheetState>({});
  const [theorySheet, setTheorySheet] = useState<TcplSheetState>({});

  const normalizedClassType = String(classType ?? '').trim().toUpperCase();
  const isTheory = normalizedClassType === 'THEORY';
  const isTcplLike = normalizedClassType === 'TCPL' || normalizedClassType === 'TCPR';
  const tcplLikeKind = normalizedClassType === 'TCPR' ? 'TCPR' : 'TCPL';
  const normalizedQpType = String(questionPaperType ?? '').trim().toUpperCase();

  const activeSheet: TcplSheetState = isTcplLike ? (tcplSheet || {}) : (theorySheet || {});

  const excelInputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    fontSize: 11,
    textAlign: 'center',
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!teachingAssignmentId) {
        setStudents([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTeachingAssignmentRoster(teachingAssignmentId);
        if (!mounted) return;
        const roster = (res?.students || []) as TeachingAssignmentRosterStudent[];
        const sorted = [...roster].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        setStudents(sorted);
      } catch (e: any) {
        if (!mounted) return;
        setStudents([]);
        setError(e?.message || 'Failed to load roster');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [teachingAssignmentId]);

  const rowsToRender = useMemo(() => {
    if (students.length) return students;
    // Fallback skeleton rows when roster isn't available yet.
    return Array.from({ length: 5 }, (_, i) => ({ id: -(i + 1), reg_no: '', name: '', section: null }));
  }, [students]);

  const hasAbsentees = useMemo(() => {
    const sheet = activeSheet || {};
    return Object.values(sheet).some((r) => Boolean((r as any)?.absent));
  }, [activeSheet]);

  const tcplQuestions = useMemo(() => {
    // TCPL: 15 questions (10x2 marks + 5x16 marks)
    // TCPR: 12 questions (8x2 marks + 4x16 marks)
    const count = tcplLikeKind === 'TCPR' ? 12 : 15;
    const twoMarkCount = tcplLikeKind === 'TCPR' ? 8 : 10;
    return Array.from({ length: count }, (_, i) => {
      const idx = i + 1;
      return {
        key: `q${idx}`,
        label: `Q${idx}`,
        max: idx <= twoMarkCount ? 2 : 16,
      };
    });
  }, [tcplLikeKind]);

  const tcplTotalMax = useMemo(() => tcplQuestions.reduce((sum, q) => sum + q.max, 0), [tcplQuestions]);

  const tcplLabMax = 30;
  // TCPR: REVIEW is treated as CO5 (no splitting across COs).
  // TCPL: LAB is split equally across all COs (existing Excel-style logic).
  const tcplReviewIsCo5 = tcplLikeKind === 'TCPR';
  const tcplCoCount = 5;
  const tcplLabShareMax = tcplReviewIsCo5 ? 0 : tcplLabMax / tcplCoCount;
  const tcplLabLabel = tcplLikeKind === 'TCPR' ? 'REVIEW' : 'LAB';

  // THEORY header template (matches provided screenshot)
  const theoryQuestions = useMemo<QuestionDef[]>(
    () => [
      { key: 'q1', label: 'Q1', max: 2 },
      { key: 'q2', label: 'Q2', max: 2 },
      { key: 'q3', label: 'Q3', max: 2 },
      { key: 'q4', label: 'Q4', max: 2 },
      { key: 'q5', label: 'Q5', max: 2 },
      { key: 'q6', label: 'Q6', max: 2 },
      { key: 'q7', label: 'Q7', max: 2 },
      { key: 'q8', label: 'Q8', max: 2 },
      { key: 'q9', label: 'Q9', max: 2 },
      { key: 'q10', label: 'Q10', max: 2 },
      { key: 'q11', label: 'Q11', max: 14 },
      { key: 'q12', label: 'Q12', max: 14 },
      { key: 'q13', label: 'Q13', max: 14 },
      { key: 'q14', label: 'Q14', max: 14 },
      { key: 'q15', label: 'Q15', max: 14 },
      { key: 'q16', label: 'Q16', max: 10 },
    ],
    [],
  );

  const theoryCoCount = 5;
  const theoryTotalMax = useMemo(() => theoryQuestions.reduce((sum, q) => sum + q.max, 0), [theoryQuestions]);

  // CO mapping row under Q1..Q16.
  const theoryCosRow = useMemo(
    () => [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5, 5] as const,
    [],
  );

  // BTL mapping row under Q1..Q16.
  // Default derived from screenshot: BTL2=8, BTL3=54, BTL4=28, BTL5=10.
  const defaultTheoryBtlRow = useMemo(
    () => [2, 2, 3, 3, 3, 2, 2, 3, 3, 3, 4, 4, 3, 3, 3, 5] as const,
    [],
  );

  const theoryCoTheoryMaxRow = useMemo(() => {
    const coMax: number[] = Array.from({ length: theoryCoCount }, () => 0);
    theoryQuestions.forEach((q, i) => {
      const co = theoryCosRow[i] ?? 1;
      if (co >= 1 && co <= theoryCoCount) coMax[co - 1] += q.max;
    });
    return coMax;
  }, [theoryQuestions, theoryCosRow]);

  const theoryCoMaxRow = useMemo(() => {
    // THEORY: CO max is based on question max only (no LAB/REVIEW column).
    return theoryCoTheoryMaxRow;
  }, [theoryCoTheoryMaxRow]);

  const theoryQuestionBtlStorageKey = useMemo(() => `model_theory_questionBtl_${subjectId}`, [subjectId]);
  const defaultTheoryQuestionBtl = useMemo(() => {
    return Object.fromEntries(
      theoryQuestions.map((q, i) => {
        const v = defaultTheoryBtlRow[i];
        return [q.key, (typeof v === 'number' ? (v as 1 | 2 | 3 | 4 | 5 | 6) : '') as BtlValue];
      }),
    ) as Record<string, BtlValue>;
  }, [theoryQuestions, defaultTheoryBtlRow]);

  const [theoryQuestionBtl, setTheoryQuestionBtl] = useState<Record<string, BtlValue>>(defaultTheoryQuestionBtl);

  useEffect(() => {
    if (!isTheory) return;
    const stored = lsGet<Record<string, BtlValue>>(theoryQuestionBtlStorageKey);
    if (stored && typeof stored === 'object') {
      setTheoryQuestionBtl({
        ...defaultTheoryQuestionBtl,
        ...stored,
      });
    } else {
      setTheoryQuestionBtl(defaultTheoryQuestionBtl);
    }
  }, [isTheory, theoryQuestionBtlStorageKey, defaultTheoryQuestionBtl]);

  const setTheoryBtl = (qKey: string, value: BtlValue) => {
    setTheoryQuestionBtl((prev) => {
      const next = { ...(prev || {}), [qKey]: value };
      lsSet(theoryQuestionBtlStorageKey, next);
      return next;
    });
  };

  const theoryBtlRow = useMemo(() => {
    return theoryQuestions.map((q, i) => {
      const v = (theoryQuestionBtl || ({} as any))[q.key];
      if (v === '' || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) return v;
      const fallback = defaultTheoryBtlRow[i];
      return (typeof fallback === 'number' ? (fallback as 1 | 2 | 3 | 4 | 5 | 6) : '') as BtlValue;
    });
  }, [theoryQuestions, theoryQuestionBtl, defaultTheoryBtlRow]);

  const theoryBtlMaxRow = useMemo(() => {
    const btlMax: number[] = [0, 0, 0, 0, 0, 0];
    theoryQuestions.forEach((q, i) => {
      const b = theoryBtlRow[i];
      if (typeof b === 'number' && b >= 1 && b <= 6) btlMax[b - 1] += q.max;
    });
    return btlMax;
  }, [theoryQuestions, theoryBtlRow]);

  // CO mapping under Q1..Qn.
  // - TCPL mapping is from the provided header screenshot.
  // - TCPR uses CO1..CO4 only, following the same repeating pattern.
  const tcplCosRow = useMemo(() => {
    if (tcplLikeKind === 'TCPR') return [1, 1, 2, 2, 3, 3, 4, 4, 1, 2, 3, 4] as const;
    return [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5] as const;
  }, [tcplLikeKind]);

  const tcplStoragePrefix = tcplLikeKind === 'TCPR' ? 'tcpr' : 'tcpl';
  const tcplQuestionBtlStorageKey = useMemo(() => `model_${tcplStoragePrefix}_questionBtl_${subjectId}`, [subjectId, tcplStoragePrefix]);
  const defaultTcplQuestionBtl = useMemo(() => {
    return Object.fromEntries(tcplQuestions.map((q) => [q.key, '' as BtlValue]));
  }, [tcplQuestions]);

  const [tcplQuestionBtl, setTcplQuestionBtl] = useState<Record<string, BtlValue>>(defaultTcplQuestionBtl);

  useEffect(() => {
    if (!isTcplLike) return;
    const stored = lsGet<Record<string, BtlValue>>(tcplQuestionBtlStorageKey);
    if (stored && typeof stored === 'object') {
      setTcplQuestionBtl({
        ...defaultTcplQuestionBtl,
        ...stored,
      });
    } else {
      setTcplQuestionBtl(defaultTcplQuestionBtl);
    }
  }, [isTcplLike, tcplQuestionBtlStorageKey, defaultTcplQuestionBtl]);

  const setTcplBtl = (qKey: string, value: BtlValue) => {
    setTcplQuestionBtl((prev) => {
      const next = { ...(prev || {}), [qKey]: value };
      lsSet(tcplQuestionBtlStorageKey, next);
      return next;
    });
  };

  const tcplSheetStorageKey = useMemo(
    () => `model_${tcplStoragePrefix}_sheet_${subjectId}_${String(teachingAssignmentId ?? 'none')}`,
    [subjectId, teachingAssignmentId, tcplStoragePrefix],
  );

  useEffect(() => {
    if (!isTcplLike) return;
    const stored = lsGet<TcplSheetState>(tcplSheetStorageKey);
    if (stored && typeof stored === 'object') setTcplSheet(stored);
    else setTcplSheet({});
  }, [isTcplLike, tcplSheetStorageKey]);

  const theorySheetStorageKey = useMemo(
    () => `model_theory_sheet_${subjectId}_${String(teachingAssignmentId ?? 'none')}`,
    [subjectId, teachingAssignmentId],
  );

  useEffect(() => {
    if (isTcplLike) return;
    const stored = lsGet<TcplSheetState>(theorySheetStorageKey);
    if (stored && typeof stored === 'object') setTheorySheet(stored);
    else setTheorySheet({});
  }, [isTcplLike, theorySheetStorageKey]);

  const setTcplCell = (rowKey: string, next: TcplRowEntry) => {
    setTcplSheet((prev) => {
      const updated = { ...(prev || {}), [rowKey]: next };
      lsSet(tcplSheetStorageKey, updated);
      return updated;
    });
  };

  const setTheoryCell = (rowKey: string, next: TcplRowEntry) => {
    setTheorySheet((prev) => {
      const updated = { ...(prev || {}), [rowKey]: next };
      lsSet(theorySheetStorageKey, updated);
      return updated;
    });
  };

  const clampCell = (value: string, max: number): CellNumber => {
    const raw = String(value ?? '');
    if (raw.trim() === '') return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    return Math.max(0, Math.min(max, n));
  };

  const fmt1 = (n: number) => {
    const v = Math.round((n + Number.EPSILON) * 10) / 10;
    const s = v.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };

  const tcplCoTheoryMaxRow = useMemo(() => {
    const coMax: number[] = Array.from({ length: tcplCoCount }, () => 0);
    tcplQuestions.forEach((q, i) => {
      const co = tcplCosRow[i] ?? 1;
      if (co >= 1 && co <= tcplCoCount) coMax[co - 1] += q.max;
    });
    return coMax;
  }, [tcplQuestions, tcplCosRow, tcplCoCount]);

  const tcplCoMaxRow = useMemo(() => {
    if (tcplReviewIsCo5) {
      // TCPR: CO1..CO4 max are from questions only; CO5 max is REVIEW max.
      return tcplCoTheoryMaxRow.map((m, i) => (i === 4 ? tcplLabMax : m));
    }

    // TCPL: Excel logic inferred from screenshot:
    // CO max = (sum of question max for that CO) + (LAB max / CO-count)
    return tcplCoTheoryMaxRow.map((m) => m + tcplLabShareMax);
  }, [tcplCoTheoryMaxRow, tcplLabShareMax, tcplReviewIsCo5, tcplLabMax]);

  const tcplBtlMaxRow = useMemo(() => {
    const btlMax: number[] = [0, 0, 0, 0, 0, 0];
    tcplQuestions.forEach((q) => {
      const b = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
      if (typeof b === 'number' && b >= 1 && b <= 6) btlMax[b - 1] += q.max;
    });
    return btlMax;
  }, [tcplQuestions, tcplQuestionBtl]);

  const tcplVisibleBtls = useMemo(() => {
    const set = new Set<number>();
    tcplQuestions.forEach((q) => {
      const b = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
      if (b === 1 || b === 2 || b === 3 || b === 4 || b === 5 || b === 6) set.add(b);
    });
    // Keep the header stable until at least one BTL is chosen.
    if (set.size === 0) return [1, 2, 3, 4, 5, 6] as const;
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n)) as Array<1 | 2 | 3 | 4 | 5 | 6>;
  }, [tcplQuestions, tcplQuestionBtl]);

  const getRowKey = (s: TeachingAssignmentRosterStudent, idx: number) => {
    const sid = (s as any)?.id;
    if (typeof sid === 'number' && sid > 0) return `id:${sid}`;
    const reg = String((s as any)?.reg_no || '').trim();
    if (reg) return `reg:${reg}`;
    return `idx:${idx}`;
  };

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const registerRef = (key: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[key] = el;
  };
  const focusRef = (key: string) => {
    const el = inputRefs.current[key];
    if (el) {
      el.focus();
      // Excel-like UX: select the whole cell value when moving.
      try {
        el.select();
      } catch {
        // ignore
      }
    }
  };

  // BTL attainment columns are dynamic (only enabled/used BTLs are shown, like CIA sheets).
  const tcplColSpan = 4 + tcplQuestions.length + 1 + 1 + tcplCoCount * 2 + tcplVisibleBtls.length * 2;
  const theoryVisibleBtls = useMemo(() => {
    const set = new Set<number>();
    theoryQuestions.forEach((q) => {
      const b = (theoryQuestionBtl || ({} as any))[q.key] ?? '';
      if (b === 1 || b === 2 || b === 3 || b === 4 || b === 5 || b === 6) set.add(b);
    });
    if (set.size === 0) return [1, 2, 3, 4, 5, 6] as const;
    return [1, 2, 3, 4, 5, 6].filter((n) => set.has(n)) as Array<1 | 2 | 3 | 4 | 5 | 6>;
  }, [theoryQuestions, theoryQuestionBtl]);
  const theoryColSpan = 4 + theoryQuestions.length + 1 + theoryCoCount * 2 + theoryVisibleBtls.length * 2;

  const renderRows = useMemo(() => {
    if (!showAbsenteesOnly) return rowsToRender;
    return rowsToRender.filter((s, idx) => {
      const rowKey = getRowKey(s as any, idx);
      // Keep list stable while editing (toggling absent off shouldn't remove the row immediately).
      if (absenteesSnapshotKeys && absenteesSnapshotKeys.length) return absenteesSnapshotKeys.includes(rowKey);
      return Boolean((activeSheet || ({} as any))[rowKey]?.absent);
    });
  }, [rowsToRender, showAbsenteesOnly, activeSheet, absenteesSnapshotKeys]);

  return (
    <div>
      {limitDialog ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => setLimitDialog(null)}
        >
          <div
            style={{
              width: 'min(520px, 100%)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid rgba(15,23,42,0.10)',
              boxShadow: '0 20px 60px rgba(2,6,23,0.25)',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>{limitDialog.title}</div>
            <div style={{ fontSize: 13, color: '#334155', marginBottom: 12 }}>{limitDialog.message}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="obe-btn" onClick={() => setLimitDialog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ marginBottom: 10, color: '#6b7280', fontSize: 12 }}>
        Subject: <b>{subjectId}</b> | Assessment: <b>MODEL</b>
        {normalizedClassType ? (
          <>
            {' '}| Class: <b>{normalizedClassType}</b>
          </>
        ) : null}
        {normalizedQpType ? (
          <>
            {' '}| QP: <b>{normalizedQpType}</b>
          </>
        ) : null}
      </div>

      {loading ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading roster…</div> : null}
      {error ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #ef444433',
            color: '#991b1b',
            padding: 10,
            borderRadius: 10,
            marginBottom: 10,
            maxWidth: '100%',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>
      ) : null}

      {
        /* Show for all MODEL types. Disabled until at least one AB is marked. */
      }
      <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            className="obe-btn"
            disabled={!hasAbsentees}
            onClick={() => {
              if (showAbsenteesOnly) return;
              const snap = (rowsToRender || [])
                .map((s, idx) => ({ key: getRowKey(s as any, idx), isAbsent: Boolean((activeSheet || ({} as any))[getRowKey(s as any, idx)]?.absent) }))
                .filter((x) => x.isAbsent)
                .map((x) => x.key);
              setAbsenteesSnapshotKeys(snap);
              setShowAbsenteesOnly(true);
            }}
            title={hasAbsentees ? 'Filter the table to show only absentees' : 'No absentees marked yet'}
            style={showAbsenteesOnly ? { background: 'linear-gradient(180deg, #111827, #334155)', color: '#fff', borderColor: 'rgba(2,6,23,0.12)' } : undefined}
          >
            Show absentees list
            {showAbsenteesOnly ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAbsenteesOnly(false);
                                  setAbsenteesSnapshotKeys(null);
                }}
                role="button"
                aria-label="Close absentees list"
                title="Close absentees list"
                style={{
                  marginLeft: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  fontWeight: 900,
                  lineHeight: 1,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                ×
              </span>
            ) : null}
          </button>
        </div>
      </>

      <div className="obe-table-wrapper" style={{ overflowX: 'auto' }}>
        <table className="obe-table" style={{ width: 'max-content', minWidth: '100%', tableLayout: 'auto' }}>
          {!isTcplLike ? (
            <>
              {isTheory ? (
                <>
                  <thead>
                    <tr>
                      <th style={cellTh} colSpan={theoryColSpan}>
                        MODEL (THEORY Header Template)
                      </th>
                    </tr>

                    <tr>
                      <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }} rowSpan={5}>
                        S.No
                      </th>
                      <th style={{ ...cellTh, minWidth: 110, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                        Register No.
                      </th>
                      <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                        Name of the Students
                      </th>
                      <th style={{ ...cellTh, minWidth: 92 }} rowSpan={5}>
                        ABSENT
                      </th>

                      {theoryQuestions.map((q) => (
                        <th key={q.key} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                          {q.label}
                        </th>
                      ))}

                      <th style={{ ...cellTh, minWidth: 56 }} rowSpan={3}>
                        Total
                      </th>

                      <th style={cellTh} colSpan={theoryCoCount * 2}>
                        CO ATTAINMENT
                      </th>
                      <th style={cellTh} colSpan={theoryVisibleBtls.length * 2}>
                        BTL ATTAINMENT
                      </th>
                    </tr>

                    <tr>
                      <th style={{ ...cellTh, fontWeight: 800 }} colSpan={theoryQuestions.length}>
                        COs
                      </th>
                      <th style={cellTh} colSpan={theoryCoCount * 2}>
                        &nbsp;
                      </th>
                      <th style={cellTh} colSpan={theoryVisibleBtls.length * 2}>
                        &nbsp;
                      </th>
                    </tr>

                    <tr>
                      {theoryCosRow.map((v, i) => (
                        <th key={`theory-co-map-${i}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                          {v}
                        </th>
                      ))}

                      {Array.from({ length: theoryCoCount }).map((_, i) => (
                        <th key={`theory-co-head-${i}`} style={cellTh} colSpan={2}>
                          CO-{i + 1}
                        </th>
                      ))}

                      {theoryVisibleBtls.map((n) => (
                        <th key={`theory-btl-head-${n}`} style={cellTh} colSpan={2}>
                          BTL-{n}
                        </th>
                      ))}
                    </tr>

                    <tr>
                      <th style={{ ...cellTh, fontWeight: 800 }} colSpan={theoryQuestions.length}>
                        BTL
                      </th>
                      <th style={cellTh}>&nbsp;</th>

                      {Array.from({ length: theoryCoCount + theoryVisibleBtls.length }).flatMap((_, i) => (
                        <React.Fragment key={`theory-mkpct-${i}`}>
                          <th style={cellTh}>
                            <div style={{ whiteSpace: 'pre-line', lineHeight: '0.9', fontSize: '0.7em' }}>{'M\nA\nR\nK'}</div>
                          </th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>

                    <tr>
                      {theoryQuestions.map((q, i) => {
                        const v = (theoryQuestionBtl || ({} as any))[q.key] ?? '';
                        const display = v === '' ? '-' : String(v);
                        return (
                          <th key={`theory-btl-map-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40, padding: 0 }}>
                            <div style={{ position: 'relative', minWidth: 40 }}>
                              <div
                                style={{
                                  width: '100%',
                                  fontSize: 11,
                                  padding: '4px 4px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: 8,
                                  background: '#fff',
                                  textAlign: 'center',
                                  userSelect: 'none',
                                  margin: 2,
                                }}
                                title={`BTL: ${display}`}
                              >
                                {display}
                              </div>
                              <select
                                aria-label={`BTL for ${q.label}`}
                                value={v}
                                onChange={(e) =>
                                  setTheoryBtl(
                                    q.key,
                                    (e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)) as BtlValue,
                                  )
                                }
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  width: '100%',
                                  height: '100%',
                                  opacity: 0,
                                  cursor: 'pointer',
                                  appearance: 'none',
                                }}
                              >
                                <option value="">-</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5</option>
                                <option value="6">6</option>
                              </select>
                            </div>
                          </th>
                        );
                      })}
                      <th style={cellTh}>&nbsp;</th>

                      {Array.from({ length: theoryCoCount * 2 + theoryVisibleBtls.length * 2 }).map((_, i) => (
                        <th key={`theory-tailblank-${i}`} style={cellTh}>
                          &nbsp;
                        </th>
                      ))}
                    </tr>

                    <tr>
                      <th style={cellTh}>S.No</th>
                      <th style={cellTh}>Register No.</th>
                      <th style={cellTh}>Name / Max Marks</th>
                      <th style={cellTh}>&nbsp;</th>

                      {theoryQuestions.map((q) => (
                        <th key={`theory-qmax-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                          {q.max}
                        </th>
                      ))}

                      <th style={cellTh}>{theoryTotalMax}</th>

                      {theoryCoMaxRow.flatMap((max, i) => (
                        <React.Fragment key={`theory-co-max-mm-${i}`}>
                          <th style={cellTh}>{fmt1(max)}</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}

                      {theoryVisibleBtls.flatMap((n) => (
                        <React.Fragment key={`theory-btl-max-mm-${n}`}>
                          <th style={cellTh}>{fmt1(theoryBtlMaxRow[n - 1] || 0)}</th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {renderRows.map((s, idx) => (
                      <tr key={String((s as any).id ?? idx)}>
                        {(() => {
                          const rowKey = getRowKey(s as any, idx);
                          const row = (activeSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
                          const absent = Boolean(row.absent);

                          const kind: AbsenceKind | null = absent ? ((row as any).absentKind || 'AL') : null;
                          const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));

                          const assignedTotal = absent && kind === 'AL' ? 0 : null;
                          const cap = absent && kind === 'ML' ? 60 : absent && kind === 'SKL' ? 75 : null;

                          const qMarks: Record<string, number> = {};
                          theoryQuestions.forEach((q) => {
                            const v = (row.q || ({} as any))[q.key] ?? '';
                            const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                            qMarks[q.key] = Math.max(0, Math.min(q.max, n));
                          });
                          const total = Object.values(qMarks).reduce((sum, n) => sum + n, 0);

                          const coMark: number[] = Array.from({ length: theoryCoCount }, () => 0);
                          theoryQuestions.forEach((q, i) => {
                            const co = theoryCosRow[i] ?? 1;
                            if (co >= 1 && co <= theoryCoCount) coMark[co - 1] += qMarks[q.key] || 0;
                          });

                          const coPct = coMark.map((m, i) => {
                            const denom = theoryCoMaxRow[i] || 0;
                            if (!denom) return 0;
                            return (m / denom) * 100;
                          });

                          const btlMark: number[] = [0, 0, 0, 0, 0, 0];
                          theoryQuestions.forEach((q, i) => {
                            const b = theoryBtlRow[i];
                            if (typeof b === 'number' && b >= 1 && b <= 6) btlMark[b - 1] += qMarks[q.key] || 0;
                          });
                          const btlPct = btlMark.map((m, i) => {
                            const denom = theoryBtlMaxRow[i] || 0;
                            if (!denom) return 0;
                            return (m / denom) * 100;
                          });

                          const setAbsent = (v: boolean) => {
                            if (v) {
                              setTheoryCell(rowKey, {
                                ...row,
                                absent: true,
                                absentKind: (((row as any).absentKind || 'AL') as AbsenceKind),
                                q: Object.fromEntries(theoryQuestions.map((q) => [q.key, ''])),
                              });
                              return;
                            }
                            setTheoryCell(rowKey, {
                              ...row,
                              absent: false,
                              absentKind: undefined,
                            });
                          };

                          const setAbsentKind = (v: AbsenceKind) => {
                            setTheoryCell(rowKey, {
                              ...row,
                              absent: true,
                              absentKind: v,
                            });
                          };

                          const setQ = (qKey: string, raw: string, max: number) => {
                            if (absent && !canEditAbsent) return;
                            const nextValue = clampCell(raw, max);
                            const nextQ = {
                              ...(row.q || {}),
                              [qKey]: nextValue,
                            };

                            if (cap != null) {
                              const nextTotal = theoryQuestions.reduce((sum, q) => {
                                const v = (nextQ as any)[q.key] ?? '';
                                const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                                return sum + Math.max(0, Math.min(q.max, n));
                              }, 0);
                              if (nextTotal > cap) {
                                setLimitDialog({
                                  title: 'Mark limit exceeded',
                                  message: kind === 'ML' ? 'For malpractice the total mark assigned is 60' : 'For Sick leave the Total mark assigned is 75',
                                });
                                return;
                              }
                            }

                            setTheoryCell(rowKey, {
                              ...row,
                              q: nextQ,
                            });
                          };

                          return (
                            <>
                              <td style={{ ...cellTd, textAlign: 'center' }}>{idx + 1}</td>
                              <td style={cellTd}>{(s as any).reg_no || '\u00A0'}</td>
                              <td style={cellTd}>{(s as any).name || '\u00A0'}</td>
                              <td style={{ ...cellTd, textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                  <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
                                  {absent ? (
                                    <div className="obe-ios-select" title="Absent type">
                                      <span className="obe-ios-select-value">{String((row as any).absentKind || 'AL')}</span>
                                      <select
                                        aria-label="Absent type"
                                        value={((row as any).absentKind || 'AL') as any}
                                        onChange={(e) => setAbsentKind(e.target.value as AbsenceKind)}
                                      >
                                        <option value="AL">AL</option>
                                        <option value="ML">ML</option>
                                        <option value="SKL">SKL</option>
                                      </select>
                                    </div>
                                  ) : null}
                                </div>
                              </td>

                              {theoryQuestions.map((q) => {
                                const v = (row.q || ({} as any))[q.key] ?? '';
                                const inputKey = `${rowKey}|${q.key}`;

                                const colOrder = theoryQuestions.map((qq) => qq.key) as string[];
                                const moveFocus = (colKey: string, dir: 'left' | 'right' | 'up' | 'down') => {
                                  const colIndex = Math.max(0, colOrder.indexOf(colKey));
                                  const nextColIndex =
                                    dir === 'left'
                                      ? Math.max(0, colIndex - 1)
                                      : dir === 'right'
                                        ? Math.min(colOrder.length - 1, colIndex + 1)
                                        : colIndex;
                                  const nextRowIndex =
                                    dir === 'up'
                                      ? Math.max(0, idx - 1)
                                      : dir === 'down'
                                        ? Math.min(renderRows.length - 1, idx + 1)
                                        : idx;
                                  const nextRowKey = getRowKey(renderRows[nextRowIndex] as any, nextRowIndex);
                                  focusRef(`${nextRowKey}|${colOrder[nextColIndex]}`);
                                };

                                const onCellKeyDown = (colKey: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
                                  if (e.key === 'Tab') {
                                    e.preventDefault();
                                    moveFocus(colKey, e.shiftKey ? 'left' : 'right');
                                  } else if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    moveFocus(colKey, 'left');
                                  } else if (e.key === 'ArrowRight') {
                                    e.preventDefault();
                                    moveFocus(colKey, 'right');
                                  } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
                                    e.preventDefault();
                                    moveFocus(colKey, 'up');
                                  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                                    e.preventDefault();
                                    moveFocus(colKey, 'down');
                                  }
                                };
                                return (
                                  <td key={`${idx}-${q.key}`} style={{ ...cellTd, textAlign: 'center' }}>
                                    <input
                                      ref={registerRef(inputKey)}
                                      type="text"
                                      inputMode="decimal"
                                      disabled={absent && !canEditAbsent}
                                      value={v === '' ? '' : String(v)}
                                      onChange={(e) => setQ(q.key, e.target.value, q.max)}
                                      onFocus={(e) => e.currentTarget.select()}
                                      onKeyDown={onCellKeyDown(q.key)}
                                      style={excelInputStyle}
                                    />
                                  </td>
                                );
                              })}

                              <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{fmt1(assignedTotal != null ? assignedTotal : total)}</td>

                              {coMark.flatMap((m, i) => (
                                <React.Fragment key={`theory-co-${idx}-${i}`}>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(m)}</td>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(coPct[i])}</td>
                                </React.Fragment>
                              ))}

                              {theoryVisibleBtls.flatMap((n) => (
                                <React.Fragment key={`theory-btl-${idx}-${n}`}>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlMark[n - 1] || 0)}</td>
                                  <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlPct[n - 1] || 0)}</td>
                                </React.Fragment>
                              ))}
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th style={cellTh} colSpan={colSpan}>
                        MODEL (Blank Template)
                      </th>
                    </tr>
                    <tr>
                      <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }} rowSpan={3}>
                        S.No
                      </th>
                      <th style={{ ...cellTh, minWidth: 70, overflow: 'visible', textOverflow: 'clip' }} rowSpan={3}>
                        R.No
                      </th>
                      <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }} rowSpan={3}>
                        Name of the Students
                      </th>
                      <th style={{ ...cellTh, minWidth: 32 }} rowSpan={3}>
                        AB
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
                      <th style={cellTh} colSpan={visibleBtls.length * 2}>
                        BTL ATTAINMENT
                      </th>
                    </tr>
                    <tr>
                      {questions.map((q) => (
                        <th key={q.key} style={{ ...cellTh, width: 46, minWidth: 46 }}>
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
                        <th key={q.key} style={{ ...cellTh, width: 46, minWidth: 46 }}>
                          {q.max}
                        </th>
                      ))}
                      {Array.from({ length: 2 + visibleBtls.length }).flatMap((_, i) => (
                        <React.Fragment key={i}>
                          <th style={cellTh}>
                            <div style={{ whiteSpace: 'pre-line', lineHeight: '0.9', fontSize: '0.7em' }}>{'M\nA\nR\nK'}</div>
                          </th>
                          <th style={cellTh}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {renderRows.map((s, idx) => (
                      <tr key={String((s as any).id ?? idx)}>
                    {(() => {
                      const rowKey = getRowKey(s as any, idx);
                      const row = (activeSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
                      const absent = Boolean(row.absent);

                      const kind: AbsenceKind | null = absent ? ((row as any).absentKind || 'AL') : null;
                      const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));

                      const assignedTotal = absent && kind === 'AL' ? 0 : null;
                      const cap = absent && kind === 'ML' ? 60 : absent && kind === 'SKL' ? 75 : null;

                      const qMarks: Record<string, number> = {};
                      questions.forEach((q) => {
                        const v = (row.q || ({} as any))[q.key] ?? '';
                        const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                        qMarks[q.key] = Math.max(0, Math.min(q.max, n));
                      });
                      const total = Object.values(qMarks).reduce((sum, n) => sum + n, 0);

                      const setAbsent = (v: boolean) => {
                        if (v) {
                          setTheoryCell(rowKey, {
                            ...row,
                            absent: true,
                            absentKind: (((row as any).absentKind || 'AL') as AbsenceKind),
                            q: Object.fromEntries(questions.map((q) => [q.key, ''])),
                          });
                          return;
                        }
                        setTheoryCell(rowKey, {
                          ...row,
                          absent: false,
                          absentKind: undefined,
                        });
                      };

                      const setAbsentKind = (v: AbsenceKind) => {
                        setTheoryCell(rowKey, {
                          ...row,
                          absent: true,
                          absentKind: v,
                        });
                      };

                      const setQ = (qKey: string, raw: string, max: number) => {
                        if (absent && !canEditAbsent) return;
                        const nextValue = clampCell(raw, max);
                        const nextQ = {
                          ...(row.q || {}),
                          [qKey]: nextValue,
                        };

                        if (cap != null) {
                          const nextTotal = questions.reduce((sum, q) => {
                            const v = (nextQ as any)[q.key] ?? '';
                            const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                            return sum + Math.max(0, Math.min(q.max, n));
                          }, 0);
                          if (nextTotal > cap) {
                            setLimitDialog({
                              title: 'Mark limit exceeded',
                              message: kind === 'ML' ? 'For malpractice the total mark assigned is 60' : 'For Sick leave the Total mark assigned is 75',
                            });
                            return;
                          }
                        }

                        setTheoryCell(rowKey, {
                          ...row,
                          q: nextQ,
                        });
                      };

                      return (
                        <>
                          <td style={{ ...cellTd, textAlign: 'center' }}>{idx + 1}</td>
                          <td style={cellTd}>{s.reg_no || '\u00A0'}</td>
                          <td style={cellTd}>{s.name || '\u00A0'}</td>
                          <td style={{ ...cellTd, textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
                              {absent ? (
                                <div className="obe-ios-select" title="Absent type">
                                  <span className="obe-ios-select-value">{String((row as any).absentKind || 'AL')}</span>
                                  <select aria-label="Absent type" value={((row as any).absentKind || 'AL') as any} onChange={(e) => setAbsentKind(e.target.value as AbsenceKind)}>
                                    <option value="AL">AL</option>
                                    <option value="ML">ML</option>
                                    <option value="SKL">SKL</option>
                                  </select>
                                </div>
                              ) : null}
                            </div>
                          </td>

                          {questions.map((q) => {
                            const v = (row.q || ({} as any))[q.key] ?? '';
                            const inputKey = `${rowKey}|${q.key}`;

                            const colOrder = questions.map((qq) => qq.key) as string[];
                            const moveFocus = (colKey: string, dir: 'left' | 'right' | 'up' | 'down') => {
                              const colIndex = Math.max(0, colOrder.indexOf(colKey));
                              const nextColIndex =
                                dir === 'left'
                                  ? Math.max(0, colIndex - 1)
                                  : dir === 'right'
                                    ? Math.min(colOrder.length - 1, colIndex + 1)
                                    : colIndex;
                              const nextRowIndex =
                                dir === 'up'
                                  ? Math.max(0, idx - 1)
                                  : dir === 'down'
                                    ? Math.min(renderRows.length - 1, idx + 1)
                                    : idx;
                              const nextRowKey = getRowKey(renderRows[nextRowIndex] as any, nextRowIndex);
                              focusRef(`${nextRowKey}|${colOrder[nextColIndex]}`);
                            };

                            const onCellKeyDown = (colKey: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === 'Tab') {
                                e.preventDefault();
                                moveFocus(colKey, e.shiftKey ? 'left' : 'right');
                              } else if (e.key === 'ArrowLeft') {
                                e.preventDefault();
                                moveFocus(colKey, 'left');
                              } else if (e.key === 'ArrowRight') {
                                e.preventDefault();
                                moveFocus(colKey, 'right');
                              } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
                                e.preventDefault();
                                moveFocus(colKey, 'up');
                              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                                e.preventDefault();
                                moveFocus(colKey, 'down');
                              }
                            };
                            return (
                              <td key={`${idx}-${q.key}`} style={{ ...cellTd, textAlign: 'center' }}>
                                <input
                                  ref={registerRef(inputKey)}
                                  type="text"
                                  inputMode="decimal"
                                  disabled={absent && !canEditAbsent}
                                  value={v === '' ? '' : String(v)}
                                  onChange={(e) => setQ(q.key, e.target.value, q.max)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onKeyDown={onCellKeyDown(q.key)}
                                  style={excelInputStyle}
                                />
                              </td>
                            );
                          })}

                          <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{fmt1(assignedTotal != null ? assignedTotal : total)}</td>
                        </>
                      );
                    })()}

                    <td style={{ ...cellTd, textAlign: 'center' }}>&nbsp;</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>&nbsp;</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>&nbsp;</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>&nbsp;</td>

                    {visibleBtls.flatMap((n) => (
                      <React.Fragment key={`${idx}-btl-${n}`}>
                        <td style={{ ...cellTd, textAlign: 'center' }}>&nbsp;</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>&nbsp;</td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
                </>
              )}
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <th style={cellTh} colSpan={tcplColSpan}>
                    MODEL ({normalizedClassType || 'TCPL'} Header Template)
                  </th>
                </tr>
                <tr>
                  <th style={{ ...cellTh, width: SNO_COL_WIDTH, minWidth: SNO_COL_WIDTH }} rowSpan={5}>
                    S.No
                  </th>
                  <th style={{ ...cellTh, minWidth: 110, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                    Register No.
                  </th>
                  <th style={{ ...cellTh, minWidth: 240, overflow: 'visible', textOverflow: 'clip' }} rowSpan={5}>
                    Name of the Students
                  </th>
                  <th style={{ ...cellTh, minWidth: 92 }} rowSpan={5}>
                    AB
                  </th>

                  {tcplQuestions.map((q) => (
                    <th key={q.key} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                      {q.label}
                    </th>
                  ))}

                  <th style={{ ...cellTh, minWidth: 56 }} rowSpan={3}>
                    Total
                  </th>
                  <th style={{ ...cellTh, minWidth: 56 }} rowSpan={3}>
                    {tcplLabLabel}
                  </th>

                  <th style={cellTh} colSpan={tcplCoCount * 2}>
                    CO ATTAINMENT
                  </th>
                  <th style={cellTh} colSpan={tcplVisibleBtls.length * 2}>
                    BTL ATTAINMENT
                  </th>
                </tr>

                <tr>
                  <th style={{ ...cellTh, fontWeight: 800 }} colSpan={tcplQuestions.length}>
                    COS
                  </th>
                  <th style={cellTh} colSpan={tcplCoCount * 2}>
                    &nbsp;
                  </th>
                  <th style={cellTh} colSpan={tcplVisibleBtls.length * 2}>
                    &nbsp;
                  </th>
                </tr>

                <tr>
                  {tcplCosRow.map((v, i) => (
                    <th key={`co-map-${i}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                      {v}
                    </th>
                  ))}

                  {Array.from({ length: tcplCoCount }).map((_, i) => (
                    <th key={`co-head-${i}`} style={cellTh} colSpan={2}>
                      CO-{i + 1}
                    </th>
                  ))}

                  {tcplVisibleBtls.map((n) => (
                    <th key={`btl-head-${n}`} style={cellTh} colSpan={2}>
                      BTL-{n}
                    </th>
                  ))}
                </tr>

                <tr>
                  <th style={{ ...cellTh, fontWeight: 800 }} colSpan={tcplQuestions.length}>
                    BTL
                  </th>
                  <th style={cellTh}>&nbsp;</th>
                  <th style={cellTh}>&nbsp;</th>

                  {/* CO mark/% + BTL mark/% labels */}
                  {Array.from({ length: tcplCoCount + tcplVisibleBtls.length }).flatMap((_, i) => (
                    <React.Fragment key={`mkpct-${i}`}>
                      <th style={cellTh}>
                        <div style={{ whiteSpace: 'pre-line', lineHeight: '0.9', fontSize: '0.7em' }}>{'M\nA\nR\nK'}</div>
                      </th>
                      <th style={cellTh}>%</th>
                    </React.Fragment>
                  ))}
                </tr>

                <tr>
                  {tcplQuestions.map((q) => {
                    const v = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
                    const display = v === '' ? '-' : String(v);
                    return (
                      <th key={`btl-map-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40, padding: 0 }}>
                        <div style={{ position: 'relative', minWidth: 40 }}>
                          <div
                            style={{
                              width: '100%',
                              fontSize: 11,
                              padding: '4px 4px',
                              border: '1px solid #d1d5db',
                              borderRadius: 8,
                              background: '#fff',
                              textAlign: 'center',
                              userSelect: 'none',
                              margin: 2,
                            }}
                            title={`BTL: ${display}`}
                          >
                            {display}
                          </div>
                          <select
                            aria-label={`BTL for ${q.label}`}
                            value={v}
                            onChange={(e) =>
                              setTcplBtl(
                                q.key,
                                (e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)) as BtlValue,
                              )
                            }
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              cursor: 'pointer',
                              appearance: 'none',
                            }}
                          >
                            <option value="">-</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                          </select>
                        </div>
                      </th>
                    );
                  })}
                  <th style={cellTh}>&nbsp;</th>
                  <th style={cellTh}>&nbsp;</th>

                  {/* Max marks are shown in the 'Name / Max Marks' row (Excel-style). */}
                  {Array.from({ length: tcplCoCount * 2 + tcplVisibleBtls.length * 2 }).map((_, i) => (
                    <th key={`tailblank-${i}`} style={cellTh}>
                      &nbsp;
                    </th>
                  ))}
                </tr>

                {/* Excel-style 'Name / Max Marks' row */}
                <tr>
                  <th style={cellTh}>S.No</th>
                  <th style={cellTh}>Register No.</th>
                  <th style={cellTh}>Name / Max Marks</th>
                  <th style={cellTh}>&nbsp;</th>

                  {tcplQuestions.map((q) => (
                    <th key={`qmax-${q.key}`} style={{ ...cellTh, width: 40, minWidth: 40 }}>
                      {q.max}
                    </th>
                  ))}

                  <th style={cellTh}>{tcplTotalMax}</th>
                  <th style={cellTh}>30</th>

                  {/* CO max marks + % */}
                  {tcplCoMaxRow.flatMap((max, i) => (
                    <React.Fragment key={`co-max-mm-${i}`}>
                      <th style={cellTh}>{fmt1(max)}</th>
                      <th style={cellTh}>%</th>
                    </React.Fragment>
                  ))}

                  {/* BTL max marks + % (in max-marks row as requested) */}
                  {tcplVisibleBtls.flatMap((n) => (
                    <React.Fragment key={`btl-max-mm-${n}`}>
                      <th style={cellTh}>{fmt1(tcplBtlMaxRow[n - 1] || 0)}</th>
                      <th style={cellTh}>%</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {renderRows.map((s, idx) => (
                  <tr key={String((s as any).id ?? idx)}>
                    {(() => {
                      const rowKey = getRowKey(s as any, idx);
                      const row = (tcplSheet || ({} as any))[rowKey] || ({} as TcplRowEntry);
                      const absent = Boolean(row.absent);
                      const lab = (row.lab ?? '') as CellNumber;

                      const kind: AbsenceKind | null = absent ? ((row as any).absentKind || 'AL') : null;
                      const canEditAbsent = Boolean(showAbsenteesOnly && absent && (kind === 'ML' || kind === 'SKL'));
                      const assignedTotal = absent && kind === 'AL' ? 0 : null;
                      const cap = absent && kind === 'ML' ? 60 : absent && kind === 'SKL' ? 75 : null;

                      const qMarks: Record<string, number> = {};
                      tcplQuestions.forEach((q) => {
                        const v = (row.q || ({} as any))[q.key] ?? '';
                        const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                        qMarks[q.key] = Math.max(0, Math.min(q.max, n));
                      });

                      const labNum = typeof lab === 'number' && Number.isFinite(lab) ? Math.max(0, Math.min(tcplLabMax, lab)) : 0;
                      const total = Object.values(qMarks).reduce((sum, n) => sum + n, 0);

                      const coMark: number[] = Array.from({ length: tcplCoCount }, () => 0);
                      tcplQuestions.forEach((q, i) => {
                        const co = tcplCosRow[i] ?? 1;
                        if (co >= 1 && co <= tcplCoCount) coMark[co - 1] += qMarks[q.key] || 0;
                      });
                      if (tcplReviewIsCo5) {
                        // TCPR: add REVIEW only to CO5.
                        coMark[4] += labNum;
                      } else {
                        // TCPL: add equal LAB share to each CO.
                        for (let i = 0; i < tcplCoCount; i++) coMark[i] += labNum / tcplCoCount;
                      }

                      const coPct = coMark.map((m, i) => {
                        const denom = tcplCoMaxRow[i] || 0;
                        if (!denom) return 0;
                        return (m / denom) * 100;
                      });

                      const btlMark: number[] = [0, 0, 0, 0, 0, 0];
                      tcplQuestions.forEach((q) => {
                        const b = (tcplQuestionBtl || ({} as any))[q.key] ?? '';
                        if (typeof b === 'number' && b >= 1 && b <= 6) btlMark[b - 1] += qMarks[q.key] || 0;
                      });
                      const btlPct = btlMark.map((m, i) => {
                        const denom = tcplBtlMaxRow[i] || 0;
                        if (!denom) return 0;
                        return (m / denom) * 100;
                      });

                      const setAbsent = (v: boolean) => {
                        if (v) {
                          setTcplCell(rowKey, {
                            ...row,
                            absent: true,
                            absentKind: (((row as any).absentKind || 'AL') as AbsenceKind),
                            q: Object.fromEntries(tcplQuestions.map((q) => [q.key, ''])),
                            lab: '',
                          });
                          return;
                        }

                        setTcplCell(rowKey, {
                          ...row,
                          absent: false,
                          absentKind: undefined,
                        });
                      };

                      const setAbsentKind = (v: AbsenceKind) => {
                        setTcplCell(rowKey, {
                          ...row,
                          absent: true,
                          absentKind: v,
                        });
                      };

                      const setLab = (raw: string) => {
                        if (absent && !canEditAbsent) return;
                        setTcplCell(rowKey, {
                          ...row,
                          lab: clampCell(raw, tcplLabMax),
                        });
                      };

                      const setQ = (qKey: string, raw: string, max: number) => {
                        if (absent && !canEditAbsent) return;
                        const nextValue = clampCell(raw, max);
                        const nextQ = {
                          ...(row.q || {}),
                          [qKey]: nextValue,
                        };

                        if (cap != null) {
                          const nextTotal = tcplQuestions.reduce((sum, q) => {
                            const v = (nextQ as any)[q.key] ?? '';
                            const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
                            return sum + Math.max(0, Math.min(q.max, n));
                          }, 0);
                          if (nextTotal > cap) {
                            setLimitDialog({
                              title: 'Mark limit exceeded',
                              message: kind === 'ML' ? 'For malpractice the total mark assigned is 60' : 'For Sick leave the Total mark assigned is 75',
                            });
                            return;
                          }
                        }

                        setTcplCell(rowKey, {
                          ...row,
                          q: nextQ,
                        });
                      };

                      const colOrder = [...tcplQuestions.map((q) => q.key), 'lab'] as const;

                      const moveFocus = (colKey: string, dir: 'left' | 'right' | 'up' | 'down') => {
                        const colIndex = colOrder.indexOf(colKey as any);
                        const nextColIndex =
                          dir === 'left'
                            ? Math.max(0, colIndex - 1)
                            : dir === 'right'
                              ? Math.min(colOrder.length - 1, colIndex + 1)
                              : colIndex;
                        const nextRowIndex =
                          dir === 'up'
                            ? Math.max(0, idx - 1)
                            : dir === 'down'
                              ? Math.min(renderRows.length - 1, idx + 1)
                              : idx;
                        const nextRowKey = getRowKey(renderRows[nextRowIndex] as any, nextRowIndex);
                        const target = `${nextRowKey}|${colOrder[nextColIndex]}`;
                        focusRef(target);
                      };

                      const onCellKeyDown = (colKey: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          moveFocus(colKey, e.shiftKey ? 'left' : 'right');
                        } else if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          moveFocus(colKey, 'left');
                        } else if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          moveFocus(colKey, 'right');
                        } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
                          e.preventDefault();
                          moveFocus(colKey, 'up');
                        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                          e.preventDefault();
                          moveFocus(colKey, 'down');
                        }
                      };

                      return (
                        <>
                    <td style={{ ...cellTd, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={cellTd}>{s.reg_no || '\u00A0'}</td>
                    <td style={cellTd}>{s.name || '\u00A0'}</td>
                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
                        {absent ? (
                          <div className="obe-ios-select" title="Absent type">
                            <span className="obe-ios-select-value">{String((row as any).absentKind || 'AL')}</span>
                            <select aria-label="Absent type" value={((row as any).absentKind || 'AL') as any} onChange={(e) => setAbsentKind(e.target.value as AbsenceKind)}>
                              <option value="AL">AL</option>
                              <option value="ML">ML</option>
                              <option value="SKL">SKL</option>
                            </select>
                          </div>
                        ) : null}
                      </div>
                    </td>

                    {tcplQuestions.map((q) => {
                      const v = (row.q || ({} as any))[q.key] ?? '';
                      const inputKey = `${rowKey}|${q.key}`;
                      return (
                        <td key={`${idx}-${q.key}`} style={{ ...cellTd, textAlign: 'center' }}>
                          <input
                            ref={registerRef(inputKey)}
                            type="text"
                            inputMode="decimal"
                            disabled={absent && !canEditAbsent}
                            value={v === '' ? '' : String(v)}
                            onChange={(e) => setQ(q.key, e.target.value, q.max)}
                            onFocus={(e) => e.currentTarget.select()}
                            onKeyDown={onCellKeyDown(q.key)}
                            style={excelInputStyle}
                          />
                        </td>
                      );
                    })}

                    <td style={{ ...cellTd, textAlign: 'center', fontWeight: 700 }}>{fmt1(assignedTotal != null ? assignedTotal : total)}</td>

                    <td style={{ ...cellTd, textAlign: 'center' }}>
                      <input
                        ref={registerRef(`${rowKey}|lab`)}
                        type="text"
                        inputMode="decimal"
                        disabled={absent && !canEditAbsent}
                        value={lab === '' ? '' : String(lab)}
                        onChange={(e) => setLab(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={onCellKeyDown('lab')}
                        style={excelInputStyle}
                      />
                    </td>

                    {/* CO attainment: MARK + % */}
                    {coMark.flatMap((m, i) => (
                      <React.Fragment key={`co-${idx}-${i}`}>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(m)}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(coPct[i])}</td>
                      </React.Fragment>
                    ))}

                    {/* BTL attainment: MARK + % */}
                    {tcplVisibleBtls.flatMap((n) => (
                      <React.Fragment key={`btl-${idx}-${n}`}>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlMark[n - 1] || 0)}</td>
                        <td style={{ ...cellTd, textAlign: 'center' }}>{fmt1(btlPct[n - 1] || 0)}</td>
                      </React.Fragment>
                    ))}
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}
