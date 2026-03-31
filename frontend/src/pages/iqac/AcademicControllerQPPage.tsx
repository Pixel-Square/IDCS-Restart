import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchIqacBatchQpPattern,
  fetchAcademicYears,
  fetchIqacCustomExamBatchesByYear,
  fetchIqacQpPattern,
  upsertIqacBatchQpPattern,
  upsertIqacQpPattern,
  type AcademicYearItem,
  type CustomExamBatch,
} from '../../services/obe';
import { fetchAssessmentMasterConfig, saveAssessmentMasterConfig } from '../../services/cdapDb';

type QpOption = {
  key: string;
  label: string;
  class_type: 'THEORY' | 'TCPR' | 'TCPL' | 'LAB';
  question_paper_type?: 'QP1' | 'QP2';
};

export default function AcademicControllerQPPage(): JSX.Element {
  const [tab, setTab] = useState<'qp' | 'custom'>('qp');

  const options: QpOption[] = useMemo(
    () => [
      { key: 'THEORY_QP1', label: 'Theory QP 1', class_type: 'THEORY', question_paper_type: 'QP1' },
      { key: 'THEORY_QP2', label: 'Theory QP 2', class_type: 'THEORY', question_paper_type: 'QP2' },
      { key: 'TCPR', label: 'TCPR', class_type: 'TCPR' },
      { key: 'TCPL', label: 'TCPL', class_type: 'TCPL' },
      { key: 'LAB', label: 'LAB', class_type: 'LAB' },
    ],
    []
  );

  const [selectedKey, setSelectedKey] = useState<string>(options[0]?.key || '');
  const selected = useMemo(() => options.find((o) => o.key === selectedKey) || null, [options, selectedKey]);

  const [selectedExam, setSelectedExam] = useState<'SSA1' | 'SSA2' | 'FORMATIVE1' | 'FORMATIVE2' | 'CIA1' | 'CIA2' | 'MODEL'>('SSA1');

  const isReviewCfgClass = selected?.class_type === 'TCPR' || selected?.class_type === 'TCPL';
  const [selectedReviewExam, setSelectedReviewExam] = useState<'review1' | 'review2'>('review1');

  type ReviewCfg = {
    cia_max?: number;
    split_enabled?: boolean;
  };

  type ReviewConfigRoot = {
    TCPR?: { review1?: ReviewCfg; review2?: ReviewCfg };
    TCPL?: { review1?: ReviewCfg; review2?: ReviewCfg };
  };

  const [reviewConfig, setReviewConfig] = useState<ReviewConfigRoot>({});
  const [reviewCfgLoading, setReviewCfgLoading] = useState(false);
  const [reviewCfgSaving, setReviewCfgSaving] = useState(false);
  const [reviewCfgMsg, setReviewCfgMsg] = useState<string | null>(null);
  const [reviewCfgErr, setReviewCfgErr] = useState<string | null>(null);

  type PatternRow = { marks: string; co: string };

  const [patternRows, setPatternRows] = useState<PatternRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Customizable Exam (batch override)
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [batches, setBatches] = useState<CustomExamBatch[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const selectedBatch = useMemo(() => batches.find((b) => b.id === selectedBatchId) || null, [batches, selectedBatchId]);

  const customExamKeys = useMemo(
    () => [
      { key: 'SSA1', label: 'SSA 1' },
      { key: 'SSA2', label: 'SSA 2' },
      { key: 'FORMATIVE1', label: 'FA 1' },
      { key: 'FORMATIVE2', label: 'FA 2' },
      { key: 'CIA1', label: 'CIA 1' },
      { key: 'CIA2', label: 'CIA 2' },
      { key: 'MODEL', label: 'MODEL' },
    ],
    []
  );
  const [selectedCustomExam, setSelectedCustomExam] = useState<string>('SSA1');
  const [customIsOverride, setCustomIsOverride] = useState<boolean>(false);

  const backendKey = useMemo(() => {
    const class_type = selected?.class_type || 'THEORY';
    const question_paper_type = selected?.question_paper_type || null;
    return {
      class_type,
      question_paper_type,
      exam: selectedExam,
    };
  }, [selected, selectedExam]);

  const customBackendKey = useMemo(() => {
    const class_type = selected?.class_type || 'THEORY';
    const question_paper_type = selected?.question_paper_type || null;
    return {
      batch_id: selectedBatchId,
      class_type,
      question_paper_type,
      exam: selectedCustomExam,
    };
  }, [selected?.class_type, selected?.question_paper_type, selectedBatchId, selectedCustomExam]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (tab !== 'qp') return;
      setMessage(null);
      setError(null);
      setIsLoading(true);
      setLastSavedAt(null);
      try {
        const data = await fetchIqacQpPattern(backendKey);
        if (cancelled) return;
        const marks = Array.isArray((data as any)?.pattern?.marks) ? (data as any).pattern.marks : [];
        const cos = Array.isArray((data as any)?.pattern?.cos) ? (data as any).pattern.cos : [];

        const storedCoToUi = (stored: any): string => {
          // Backend commonly stores split as 12/34 or sometimes as 'both'.
          // UI select expects '1&2' for CIA1 and '3&4' for CIA2.
          const s = String(stored ?? '').trim();
          if (!s) return '';

          // Normalize numeric encodings.
          const n = Number(s);
          if (Number.isFinite(n)) {
            if (n === 12) return '1&2';
            if (n === 34) return '3&4';
            return String(Math.trunc(n));
          }

          const upper = s.toUpperCase();
          if (upper === 'BOTH') {
            return backendKey.exam === 'CIA2' ? '3&4' : '1&2';
          }
          if (upper === '1&2' || upper === '3&4') return upper;
          return s;
        };

        const normalized: PatternRow[] = marks.map((m: any, idx: number) => ({
          marks: String(m),
          co: cos[idx] == null ? '' : storedCoToUi(cos[idx]),
        }));
        setPatternRows(normalized);
        setLastSavedAt(data?.updated_at ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load pattern.'));
        setPatternRows([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [backendKey, tab]);

  useEffect(() => {
    let cancelled = false;
    if (tab !== 'custom') return;
    (async () => {
      setBatchLoading(true);
      try {
        const years = await fetchAcademicYears();
        if (cancelled) return;
        setAcademicYears(years);

        const active = years.find((y) => y.is_active) || years[0] || null;
        const ayId = selectedAcademicYearId ?? (active ? Number(active.id) : null);
        setSelectedAcademicYearId(ayId);
        if (!ayId) {
          setBatches([]);
          setSelectedBatchId(null);
          return;
        }

        const list = await fetchIqacCustomExamBatchesByYear(ayId);
        if (cancelled) return;
        setBatches(list);
        if (!selectedBatchId && list.length) setSelectedBatchId(list[0].id);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load batches.'));
      } finally {
        if (!cancelled) setBatchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    if (tab !== 'custom') return;
    if (!selectedAcademicYearId) return;
    (async () => {
      setBatchLoading(true);
      setError(null);
      try {
        const list = await fetchIqacCustomExamBatchesByYear(selectedAcademicYearId);
        if (cancelled) return;
        setBatches(list);
        // Reset batch if current batch is not in list.
        if (selectedBatchId && !list.some((b) => b.id === selectedBatchId)) {
          setSelectedBatchId(list[0]?.id ?? null);
        }
        if (!selectedBatchId && list.length) setSelectedBatchId(list[0].id);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load batches.'));
        setBatches([]);
      } finally {
        if (!cancelled) setBatchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAcademicYearId, tab]);

  useEffect(() => {
    let cancelled = false;
    async function loadCustom() {
      if (tab !== 'custom') return;
      if (!customBackendKey.batch_id) return;
      setMessage(null);
      setError(null);
      setIsLoading(true);
      setLastSavedAt(null);
      setCustomIsOverride(false);
      try {
        const data = await fetchIqacBatchQpPattern({
          batch_id: customBackendKey.batch_id,
          class_type: customBackendKey.class_type,
          question_paper_type: customBackendKey.question_paper_type,
          exam: customBackendKey.exam,
        });
        if (cancelled) return;
        const marks = Array.isArray((data as any)?.pattern?.marks) ? (data as any).pattern.marks : [];
        const cos = Array.isArray((data as any)?.pattern?.cos) ? (data as any).pattern.cos : [];

        const storedCoToUi = (stored: any): string => {
          const s = String(stored ?? '').trim();
          if (!s) return '';
          const n = Number(s);
          if (Number.isFinite(n)) {
            if (n === 12) return '1&2';
            if (n === 34) return '3&4';
            return String(Math.trunc(n));
          }
          const upper = s.toUpperCase();
          if (upper === 'BOTH') return 'both';
          if (upper === '1&2' || upper === '3&4' || upper === 'BOTH') return upper;
          return s;
        };

        const normalized: PatternRow[] = marks.map((m: any, idx: number) => ({
          marks: String(m),
          co: cos[idx] == null ? '' : storedCoToUi(cos[idx]),
        }));
        setPatternRows(normalized);
        setLastSavedAt((data as any)?.updated_at ?? null);
        setCustomIsOverride(Boolean((data as any)?.is_override));
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load pattern.'));
        setPatternRows([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadCustom();
    return () => {
      cancelled = true;
    };
  }, [customBackendKey, tab]);

  useEffect(() => {
    let cancelled = false;
    if (!isReviewCfgClass) return;
    (async () => {
      setReviewCfgLoading(true);
      setReviewCfgMsg(null);
      setReviewCfgErr(null);
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (cancelled) return;
        const root = (cfg as any)?.review_config;
        if (root && typeof root === 'object') setReviewConfig(root as ReviewConfigRoot);
        else setReviewConfig({});
      } catch (e: any) {
        if (cancelled) return;
        setReviewCfgErr(String(e?.message || e || 'Failed to load review config.'));
      } finally {
        if (!cancelled) setReviewCfgLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReviewCfgClass, selected?.class_type]);

  const currentReviewCfg = useMemo(() => {
    const ct = selected?.class_type;
    const root = reviewConfig || {};
    const byCt: any = (ct && (root as any)[ct]) || {};
    return (byCt && byCt[selectedReviewExam]) || {};
  }, [reviewConfig, selected?.class_type, selectedReviewExam]);

  const updateReviewCiaMax = (value: string) => {
    const ct = selected?.class_type;
    if (!ct) return;
    const next = value === '' ? undefined : Number(value);
    setReviewConfig((prev) => {
      const out: any = { ...(prev || {}) };
      const ctBlock: any = { ...(out[ct] || {}) };
      const examBlock: any = { ...(ctBlock[selectedReviewExam] || {}) };
      examBlock.cia_max = Number.isFinite(next as any) ? Math.max(0, Math.trunc(next as any)) : undefined;
      ctBlock[selectedReviewExam] = examBlock;
      out[ct] = ctBlock;
      return out;
    });
  };

  const updateReviewSplitEnabled = (enabled: boolean) => {
    const ct = selected?.class_type;
    if (!ct) return;
    setReviewConfig((prev) => {
      const out: any = { ...(prev || {}) };
      const ctBlock: any = { ...(out[ct] || {}) };
      const examBlock: any = { ...(ctBlock[selectedReviewExam] || {}) };
      examBlock.split_enabled = enabled;
      ctBlock[selectedReviewExam] = examBlock;
      out[ct] = ctBlock;
      return out;
    });
  };

  const saveReviewConfig = async () => {
    setReviewCfgMsg(null);
    setReviewCfgErr(null);
    try {
      setReviewCfgSaving(true);
      const existing = await fetchAssessmentMasterConfig();
      const merged = { ...(existing || {}), review_config: reviewConfig || {} };
      await saveAssessmentMasterConfig(merged);
      setReviewCfgMsg('Review config saved.');
    } catch (e: any) {
      setReviewCfgErr(String(e?.message || e || 'Save failed.'));
    } finally {
      setReviewCfgSaving(false);
    }
  };

  const addRow = () => {
    const examKey = tab === 'custom' ? String(selectedCustomExam || '') : String(selectedExam || '');
    const defaultCo = examKey === 'CIA2' || examKey === 'SSA2' || examKey === 'FORMATIVE2' ? '3' : '1';
    setPatternRows((prev) => [...prev, { marks: '', co: defaultCo }]);
  };

  const deleteRow = (idx: number) => {
    setPatternRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMarks = (idx: number, value: string) => {
    setPatternRows((prev) => {
      const copy = [...prev];
      const existing = copy[idx] || { marks: '', co: '' };
      copy[idx] = { ...existing, marks: value };
      return copy;
    });
  };

  const updateCo = (idx: number, value: string) => {
    setPatternRows((prev) => {
      const copy = [...prev];
      const existing = copy[idx] || { marks: '', co: '' };
      copy[idx] = { ...existing, co: value };
      return copy;
    });
  };

  const savePattern = async () => {
    setMessage(null);
    setError(null);
    try {
      const cleaned = patternRows.map((r) => ({ marks: String(r.marks ?? '').trim(), co: String((r as any)?.co ?? '').trim() }));
      // Basic validation: allow empty rows? -> disallow empty when any rows exist.
      if (cleaned.length && cleaned.some((r) => !r.marks || !r.co)) {
        setError('Enter marks and CO for all rows (or delete empty rows).');
        return;
      }
      // Numeric validation
      for (const r of cleaned) {
        const n = Number(r.marks);
        if (!Number.isFinite(n) || n < 0) {
          setError('Marks must be a non-negative number.');
          return;
        }
      }

      const coToStored = (raw: string): number | string => {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (s === 'both') return 'both';
        if (s === '1&2') return 12;
        if (s === '3&4') return 34;
        const n = Number(s);
        if (!Number.isFinite(n)) return '';
        return Math.trunc(n);
      };

      setIsSaving(true);
      const marks = cleaned.map((r) => Number(r.marks));
      const cos = cleaned.map((r) => coToStored(r.co));
      if (cos.some((v) => v === '')) {
        setError('CO values must be valid for all rows.');
        return;
      }
      if (tab === 'custom') {
        if (!customBackendKey.batch_id) {
          setError('Select a batch.');
          return;
        }
        const saved = await upsertIqacBatchQpPattern({
          batch_id: customBackendKey.batch_id,
          class_type: customBackendKey.class_type,
          question_paper_type: customBackendKey.question_paper_type,
          exam: customBackendKey.exam,
          pattern: { marks, cos },
        });
        setLastSavedAt(saved?.updated_at ?? null);
        setCustomIsOverride(Boolean(saved?.is_override));
        setMessage('Saved override.');
      } else {
        const saved = await upsertIqacQpPattern({
          class_type: backendKey.class_type,
          question_paper_type: backendKey.question_paper_type,
          exam: backendKey.exam,
          pattern: { marks, cos },
        });
        setLastSavedAt(saved?.updated_at ?? null);
        setMessage('Saved.');

        // Best-effort broadcast so already-open CIA pages can refresh patterns without a full reload.
        try {
          window.dispatchEvent(new CustomEvent('obe:qp-pattern-updated', { detail: { ...backendKey } }));
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>QP</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>Select the QP/class type option.</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {([
          { key: 'qp', label: 'QP Pattern' },
          { key: 'custom', label: 'Customizable Exam' },
        ] as const).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
              type="button"
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {options.map((o) => {
          const active = o.key === selectedKey;
          return (
            <button
              key={o.key}
              onClick={() => setSelectedKey(o.key)}
              className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
              type="button"
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {tab === 'qp' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {(['SSA1', 'SSA2', 'FORMATIVE1', 'FORMATIVE2', 'CIA1', 'CIA2', 'MODEL'] as const).map((k) => {
            const active = selectedExam === k;
            const label = k === 'SSA1' ? 'SSA 1' 
              : k === 'SSA2' ? 'SSA 2'
              : k === 'FORMATIVE1' ? 'FA 1'
              : k === 'FORMATIVE2' ? 'FA 2'
              : k === 'CIA1' ? 'CIA 1' 
              : k === 'CIA2' ? 'CIA 2' 
              : 'MODEL';
            return (
              <button
                key={k}
                onClick={() => setSelectedExam(k)}
                className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="obe-card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Academic year</div>
              <select
                className="obe-input"
                value={selectedAcademicYearId == null ? '' : String(selectedAcademicYearId)}
                onChange={(e) => setSelectedAcademicYearId(e.target.value ? Number(e.target.value) : null)}
                style={{ minWidth: 220 }}
                disabled={batchLoading}
              >
                <option value="">Select</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={String(y.id)}>
                    {y.name}{y.parity ? ` (${y.parity})` : ''}{y.is_active ? ' • Active' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Batch</div>
              <select
                className="obe-input"
                value={selectedBatchId == null ? '' : String(selectedBatchId)}
                onChange={(e) => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
                style={{ minWidth: 260 }}
                disabled={batchLoading}
              >
                <option value="">Select batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {String((b as any)?.label ?? (b as any)?.name ?? b.id)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Exam</div>
              <select className="obe-input" value={selectedCustomExam} onChange={(e) => setSelectedCustomExam(e.target.value)} style={{ minWidth: 180 }}>
                {customExamKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {selectedBatch ? (
                <div>
                  <div style={{ fontWeight: 800, color: '#111827' }}>{String((selectedBatch as any)?.label ?? (selectedBatch as any)?.name ?? selectedBatch.id)}</div>
                  <div>
                    {customIsOverride ? 'Using batch override' : 'No override (fallback where available)'}
                  </div>
                </div>
              ) : (
                <div>{batchLoading ? 'Loading batches…' : 'Select a batch to edit overrides.'}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {selected ? (
        <div className="obe-card" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Selected</div>
          <div style={{ fontWeight: 900, color: '#111827' }}>{selected.label}</div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}>
            Class type: <strong>{selected.class_type}</strong>
            {selected.question_paper_type ? (
              <>
                {' '}• QP: <strong>{selected.question_paper_type}</strong>
              </>
            ) : null}
            {' '}• Exam: <strong>{
              selectedExam === 'SSA1' ? 'SSA 1'
              : selectedExam === 'SSA2' ? 'SSA 2'
              : selectedExam === 'FORMATIVE1' ? 'FA 1'
              : selectedExam === 'FORMATIVE2' ? 'FA 2'
              : selectedExam === 'CIA1' ? 'CIA 1' 
              : selectedExam === 'CIA2' ? 'CIA 2' 
              : 'MODEL'
            }</strong>
          </div>
          {isLoading ? (
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Loading saved pattern…</div>
          ) : lastSavedAt ? (
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Last saved: {new Date(lastSavedAt).toLocaleString()}</div>
          ) : null}
        </div>
      ) : null}

      {/* CIA / MODEL pattern table */}
      <div className="obe-card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, color: '#111827' }}>QP Pattern</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {tab === 'qp'
              ? `${
                  selectedExam === 'SSA1' ? 'SSA 1'
                  : selectedExam === 'SSA2' ? 'SSA 2'
                  : selectedExam === 'FORMATIVE1' ? 'FA 1'
                  : selectedExam === 'FORMATIVE2' ? 'FA 2'
                  : selectedExam === 'CIA1' ? 'CIA 1' 
                  : selectedExam === 'CIA2' ? 'CIA 2' 
                  : 'MODEL'
                } • ${selected?.label || selectedKey}`
              : `${customExamKeys.find((k) => k.key === selectedCustomExam)?.label || selectedCustomExam} • ${selected?.label || selectedKey}${selectedBatch ? ` • ${selectedBatch.name}` : ''}`}
          </div>
        </div>

        {error ? (
          <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        {message ? (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b98133', color: '#065f46', padding: 10, borderRadius: 10, marginBottom: 10 }}>
            {message}
          </div>
        ) : null}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>S.No</th>
                <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Marks</th>
                <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>CO</th>
                <th style={{ width: 120, borderBottom: '1px solid #e5e7eb' }} />
              </tr>
            </thead>
            <tbody>
              {patternRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 10, color: '#6b7280' }}>No questions yet. Click + to add.</td>
                </tr>
              ) : (
                patternRows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6', fontWeight: 800 }}>{idx + 1}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      <input
                        className="obe-input"
                        type="number"
                        min={0}
                        step="0.5"
                        value={r.marks}
                        onChange={(e) => updateMarks(idx, e.target.value)}
                        placeholder="Marks"
                        style={{ maxWidth: 160 }}
                      />
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      <select
                        className="obe-input"
                        value={String((r as any)?.co ?? '')}
                        onChange={(e) => updateCo(idx, e.target.value)}
                        style={{ maxWidth: 160 }}
                      >
                        <option value="">Select</option>
                        {(tab === 'custom' ? selectedCustomExam : selectedExam) === 'MODEL' ? (
                          <>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </>
                        ) : (tab === 'custom' ? selectedCustomExam : selectedExam) === 'CIA2' || (tab === 'custom' ? selectedCustomExam : selectedExam) === 'SSA2' || (tab === 'custom' ? selectedCustomExam : selectedExam) === 'FORMATIVE2' ? (
                          <>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="3&4">3&4</option>
                          </>
                        ) : (
                          <>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="1&2">1&2</option>
                          </>
                        )}
                      </select>
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      <button type="button" className="obe-btn obe-btn-danger" onClick={() => deleteRow(idx)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" className="obe-btn obe-btn-secondary" onClick={addRow}>
            +
          </button>
          <button type="button" className="obe-btn obe-btn-primary" onClick={savePattern} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* TCPR/TCPL Review configuration */}
      {isReviewCfgClass ? (
        <div className="obe-card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, color: '#111827' }}>Review Config</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{selected?.label || selectedKey} • {selectedReviewExam === 'review1' ? 'Review 1' : 'Review 2'}</div>
          </div>

          {reviewCfgErr ? (
            <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10 }}>
              {reviewCfgErr}
            </div>
          ) : null}
          {reviewCfgMsg ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #10b98133', color: '#065f46', padding: 10, borderRadius: 10, marginBottom: 10 }}>
              {reviewCfgMsg}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Exam type</div>
              <select className="obe-input" value={selectedReviewExam} onChange={(e) => setSelectedReviewExam(e.target.value as any)} style={{ minWidth: 160 }}>
                <option value="review1">Review 1</option>
                <option value="review2">Review 2</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>CIA exam max marks</div>
              <input
                className="obe-input"
                type="number"
                min={0}
                step={1}
                value={String((currentReviewCfg as any)?.cia_max ?? '')}
                onChange={(e) => updateReviewCiaMax(e.target.value)}
                placeholder="e.g. 40"
                style={{ maxWidth: 160 }}
                disabled={reviewCfgLoading}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38, paddingBottom: 2 }}>
              <input
                type="checkbox"
                checked={Boolean((currentReviewCfg as any)?.split_enabled)}
                onChange={(e) => updateReviewSplitEnabled(e.target.checked)}
                disabled={reviewCfgLoading}
              />
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800 }}>Enable mark splitup</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Show + / - split controls for faculty in this review sheet.</div>
              </div>
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="obe-btn obe-btn-secondary" onClick={() => {
                setReviewCfgMsg(null);
                setReviewCfgErr(null);
              }} disabled={reviewCfgSaving}>
                Clear message
              </button>
              <button type="button" className="obe-btn obe-btn-primary" onClick={saveReviewConfig} disabled={reviewCfgSaving || reviewCfgLoading}>
                {reviewCfgSaving ? 'Saving…' : 'Save Review Config'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
