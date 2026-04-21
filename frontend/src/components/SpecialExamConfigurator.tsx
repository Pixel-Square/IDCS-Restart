import React, { useCallback, useEffect, useState } from 'react';
import { ModalPortal } from './ModalPortal';
import { SpecialQpQuestion, fetchSpecialQpPattern, saveSpecialQpPattern, fetchIqacQpPattern } from '../services/obe';

type Props = {
  teachingAssignmentId: number;
  exam: string;              // cia1, cia2, model, ssa1, ssa2, formative1, formative2
  classType?: string | null;
  questionPaperType?: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: (questions: SpecialQpQuestion[]) => void;
};

const CO_OPTIONS: Array<{ value: number | string; label: string }> = [
  { value: 1, label: 'CO1' },
  { value: 2, label: 'CO2' },
  { value: 3, label: 'CO3' },
  { value: 4, label: 'CO4' },
  { value: 5, label: 'CO5' },
  { value: '1&2', label: 'CO1&2' },
  { value: '3&4', label: 'CO3&4' },
];

const BTL_OPTIONS = [1, 2, 3, 4, 5, 6];

function makeDefaultRow(idx: number): SpecialQpQuestion {
  return { key: `q${idx + 1}`, label: `Q${idx + 1}`, max: 10, co: 1, btl: 1 };
}

// Same defaults as Cia1Entry — these are what the table already shows
const CIA1_DEFAULT_QUESTIONS: SpecialQpQuestion[] = [
  { key: 'q1', label: 'Q1', max: 2, co: 1, btl: 1 },
  { key: 'q2', label: 'Q2', max: 2, co: 1, btl: 3 },
  { key: 'q3', label: 'Q3', max: 2, co: 1, btl: 4 },
  { key: 'q4', label: 'Q4', max: 2, co: 2, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 2, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 2, btl: 2 },
  { key: 'q7', label: 'Q7', max: 16, co: 1, btl: 2 },
  { key: 'q8', label: 'Q8', max: 16, co: 2, btl: 3 },
  { key: 'q9', label: 'Q9', max: 16, co: '1&2', btl: 5 },
];

const CIA2_DEFAULT_QUESTIONS: SpecialQpQuestion[] = CIA1_DEFAULT_QUESTIONS.map((q) => ({
  ...q,
  co: q.co === 1 ? 3 : q.co === 2 ? 4 : q.co === '1&2' ? '3&4' : q.co,
}));

const MODEL_DEFAULT_QUESTIONS: SpecialQpQuestion[] = [
  { key: 'q1', label: 'Q1', max: 2, co: 1, btl: 1 },
  { key: 'q2', label: 'Q2', max: 2, co: 1, btl: 1 },
  { key: 'q3', label: 'Q3', max: 2, co: 2, btl: 1 },
  { key: 'q4', label: 'Q4', max: 2, co: 2, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 3, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 3, btl: 1 },
  { key: 'q7', label: 'Q7', max: 16, co: 1, btl: 2 },
  { key: 'q8', label: 'Q8', max: 16, co: 2, btl: 3 },
  { key: 'q9', label: 'Q9', max: 16, co: 3, btl: 5 },
];

function getHardcodedDefaults(exam: string): SpecialQpQuestion[] {
  const e = exam.toLowerCase();
  if (e === 'cia2') return CIA2_DEFAULT_QUESTIONS;
  if (e === 'model') return MODEL_DEFAULT_QUESTIONS;
  return CIA1_DEFAULT_QUESTIONS;
}

/** Try to load IQAC-configured QP pattern and convert to SpecialQpQuestion[] */
async function fetchIqacFallback(classType: string | null | undefined, questionPaperType: string | null | undefined, exam: string): Promise<SpecialQpQuestion[] | null> {
  try {
    const ct = String(classType || 'SPECIAL').trim().toUpperCase();
    const qpForApi = ct === 'THEORY' ? (String(questionPaperType || '').trim() || null) : null;
    const examForApi = exam.toUpperCase();

    const res = await fetchIqacQpPattern({ class_type: ct, question_paper_type: qpForApi, exam: examForApi as any });
    const marks = Array.isArray(res?.pattern?.marks) ? res.pattern.marks : [];
    const cos = Array.isArray((res?.pattern as any)?.cos) ? (res.pattern as any).cos : [];
    if (!marks.length) return null;

    return marks.map((max: number, idx: number) => ({
      key: `q${idx + 1}`,
      label: `Q${idx + 1}`,
      max: Number(max) || 0,
      co: cos[idx] ?? 1,
      btl: 1,
    }));
  } catch {
    return null;
  }
}

export default function SpecialExamConfigurator({ teachingAssignmentId, exam, classType, questionPaperType, open, onClose, onSaved }: Props) {
  const [questions, setQuestions] = useState<SpecialQpQuestion[]>([makeDefaultRow(0)]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load existing pattern when popup opens (3-tier: saved → IQAC pattern → hardcoded defaults)
  useEffect(() => {
    if (!open || !teachingAssignmentId || !exam) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setLoaded(false);
    (async () => {
      // 1. Try saved special QP pattern
      let savedQs: SpecialQpQuestion[] | null = null;
      try {
        const resp = await fetchSpecialQpPattern(teachingAssignmentId, exam);
        if (!alive) return;
        const qs = resp?.pattern?.questions;
        if (Array.isArray(qs) && qs.length) {
          savedQs = qs.map((q, i) => ({
            key: q.key || `q${i + 1}`,
            label: q.label || `Q${i + 1}`,
            max: Number(q.max) || 10,
            co: q.co ?? 1,
            btl: Number(q.btl) || 1,
          }));
        }
      } catch {
        // Saved pattern not available (e.g. migration not applied) — continue to fallback
      }

      if (!alive) return;

      if (savedQs) {
        setQuestions(savedQs);
        setLoaded(true);
        setLoading(false);
        return;
      }

      // 2. Try IQAC QP pattern (what the table currently uses)
      const iqacQs = await fetchIqacFallback(classType, questionPaperType, exam);
      if (!alive) return;

      if (iqacQs && iqacQs.length) {
        setQuestions(iqacQs);
      } else {
        // 3. Hardcoded defaults (same as entry components)
        setQuestions(getHardcodedDefaults(exam));
      }
      setLoaded(true);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, teachingAssignmentId, exam, classType, questionPaperType]);

  const addRow = useCallback(() => {
    setQuestions((prev) => [...prev, makeDefaultRow(prev.length)]);
  }, []);

  const removeRow = useCallback((idx: number) => {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Re-key
      return next.map((q, i) => ({ ...q, key: `q${i + 1}`, label: `Q${i + 1}` }));
    });
  }, []);

  const updateField = useCallback((idx: number, field: keyof SpecialQpQuestion, value: any) => {
    setQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  }, []);

  const totalMarks = questions.reduce((s, q) => s + (Number(q.max) || 0), 0);

  const handleSave = async () => {
    if (questions.length === 0) {
      setError('Add at least one question');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].max || questions[i].max <= 0) {
        setError(`Question ${i + 1}: marks must be > 0`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await saveSpecialQpPattern(teachingAssignmentId, exam, questions);
      const saved = resp?.pattern?.questions || questions;
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  };

  const panelStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 14,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    width: 'min(680px, 95vw)',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <ModalPortal>
      <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                Customize Questions — {exam.toUpperCase()}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Define number of questions, marks, CO mapping, and BTL level
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', padding: 4 }}>✕</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading…</div>
            ) : (
              <>
                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>#</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Label</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Max Marks</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>CO</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>BTL</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#475569' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '6px' }}>
                            <input
                              className="obe-input"
                              style={{ width: 80 }}
                              value={q.label}
                              onChange={(e) => updateField(idx, 'label', e.target.value)}
                            />
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <input
                              className="obe-input"
                              type="number"
                              style={{ width: 70, textAlign: 'center' }}
                              min={1}
                              value={q.max}
                              onChange={(e) => updateField(idx, 'max', Math.max(1, Number(e.target.value) || 0))}
                            />
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <select
                              className="obe-input"
                              style={{ width: 90, textAlign: 'center' }}
                              value={String(q.co)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const numeric = Number(raw);
                                updateField(idx, 'co', Number.isFinite(numeric) && !raw.includes('&') ? numeric : raw);
                              }}
                            >
                              {CO_OPTIONS.map((o) => (
                                <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                              ))}
                              {classType === 'THEORY' && questionPaperType === 'QP2' && (
                                <option value="1&2&3&4&5">All (1-5)</option>
                              )}
                            </select>
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <select
                              className="obe-input"
                              style={{ width: 70, textAlign: 'center' }}
                              value={q.btl}
                              onChange={(e) => updateField(idx, 'btl', Number(e.target.value) || 1)}
                            >
                              {BTL_OPTIONS.map((b) => (
                                <option key={b} value={b}>BTL{b}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <button
                              className="obe-btn obe-btn-danger"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              onClick={() => removeRow(idx)}
                              disabled={questions.length <= 1}
                              title="Remove question"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add row + summary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                  <button className="obe-btn obe-btn-primary" style={{ fontSize: 13 }} onClick={addRow}>
                    + Add Question
                  </button>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    Total: {totalMarks} marks · {questions.length} question{questions.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {error && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
                    {error}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="obe-btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="obe-btn obe-btn-success" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save Structure'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
