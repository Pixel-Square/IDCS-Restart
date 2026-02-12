import React, { useEffect, useMemo, useState } from 'react';
import { fetchIqacQpPattern, upsertIqacQpPattern } from '../../services/obe';

type QpOption = {
  key: string;
  label: string;
  class_type: 'THEORY' | 'TCPR' | 'TCPL' | 'LAB';
  question_paper_type?: 'QP1' | 'QP2';
};

export default function AcademicControllerQPPage(): JSX.Element {
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

  const [selectedExam, setSelectedExam] = useState<'CIA1' | 'CIA2' | 'MODEL'>('CIA1');

  type PatternRow = { marks: string; co: string };

  const [patternRows, setPatternRows] = useState<PatternRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const backendKey = useMemo(() => {
    const class_type = selected?.class_type || 'THEORY';
    const question_paper_type = selected?.question_paper_type || null;
    return {
      class_type,
      question_paper_type,
      exam: selectedExam,
    };
  }, [selected, selectedExam]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMessage(null);
      setError(null);
      setIsLoading(true);
      setLastSavedAt(null);
      try {
        const data = await fetchIqacQpPattern(backendKey);
        if (cancelled) return;
        const marks = Array.isArray((data as any)?.pattern?.marks) ? (data as any).pattern.marks : [];
        const cos = Array.isArray((data as any)?.pattern?.cos) ? (data as any).pattern.cos : [];
        const normalized: PatternRow[] = marks.map((m: any, idx: number) => ({
          marks: String(m),
          co: cos[idx] == null ? '' : String(cos[idx]),
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
  }, [backendKey]);

  const addRow = () => {
    setPatternRows((prev) => [...prev, { marks: '', co: selectedExam === 'CIA2' ? '3' : '1' }]);
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
      const cos = cleaned.map((r) => coToStored(r.co)).filter((v) => v !== '');
      if (cos.length !== marks.length) {
        setError('CO values must be valid for all rows.');
        return;
      }
      const saved = await upsertIqacQpPattern({
        class_type: backendKey.class_type,
        question_paper_type: backendKey.question_paper_type,
        exam: backendKey.exam,
        pattern: { marks, cos },
      });
      setLastSavedAt(saved?.updated_at ?? null);
      setMessage('Saved.');
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['CIA1', 'CIA2', 'MODEL'] as const).map((k) => {
          const active = selectedExam === k;
          return (
            <button
              key={k}
              onClick={() => setSelectedExam(k)}
              className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
              type="button"
            >
              {k === 'CIA1' ? 'CIA 1' : k === 'CIA2' ? 'CIA 2' : 'MODEL'}
            </button>
          );
        })}
      </div>

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
            {' '}• Exam: <strong>{selectedExam === 'CIA1' ? 'CIA 1' : selectedExam === 'CIA2' ? 'CIA 2' : 'MODEL'}</strong>
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
          <div style={{ fontSize: 12, color: '#6b7280' }}>{selectedExam === 'CIA1' ? 'CIA 1' : selectedExam === 'CIA2' ? 'CIA 2' : 'MODEL'} • {selected?.label || selectedKey}</div>
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
                        {selectedExam === 'MODEL' ? (
                          <>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </>
                        ) : selectedExam === 'CIA2' ? (
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
    </div>
  );
}
