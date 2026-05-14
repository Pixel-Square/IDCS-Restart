/**
 * Weightage Page
 * Class Type → QP Types (derived from QP Patterns) → Exam list per QP Type
 * (from QpPatterns with class_type + qp_type) → CO weight popup.
 *
 * Source of truth:
 *  - Exam list : QpPattern[]  where class_type === selectedCtId, grouped by qp_type
 *  - CO weights: ClassType.exam_assignments, matched by exam_display_name === pattern.name
 *  - Save back : PATCH ClassType.exam_assignments
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, X, RefreshCw, Scale, ChevronRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import fetchWithAuth from '../../../services/fetchAuth';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ExamAssignment {
  exam: string;
  exam_display_name: string;
  qp_type: string;
  weight: number;
  co_weights: Record<string, number>;
  mark_manager_enabled?: boolean;
  mm_exam_weight?: number;
  mm_co_weights_with_exam?: Record<string, number>;
  mm_co_weights_without_exam?: Record<string, number>;
  default_cos: number[];
  customize_questions: boolean;
  /** Average marks per item for each CO derived from MM pattern config (not persisted) */
  co_averages?: Record<string, number>;
}

interface ClassType {
  id: string;
  name: string;
  short_code: string;
  display_name: string;
  total_internal_marks: number;
  exam_assignments: ExamAssignment[];
}

interface MarkManagerCOCfg {
  enabled?: boolean;
  num_items?: number;
  max_marks?: number;
}

interface QpPattern {
  id: string;
  name: string;
  qp_type: string;
  class_type: string | null;
  default_weight: number;
  pattern?: {
    cos?: Array<number | null>;
    enabled?: boolean[];
    mark_manager?: {
      enabled?: boolean;
      cia_enabled?: boolean;
      cia_max_marks?: number;
      cos?: Record<string, MarkManagerCOCfg>;
    } | null;
  };
}

interface QpTypeRecord {
  id: string;
  name: string;
  code: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function deriveCos(pattern: QpPattern['pattern']): number[] {
  const p = pattern;
  if (!p || !Array.isArray(p.cos)) return [1, 2, 3, 4, 5];
  const enabled = Array.isArray(p.enabled) ? p.enabled : p.cos.map(() => true);
  const set = new Set<number>();
  p.cos.forEach((co, i) => {
    if (co != null && typeof co === 'number' && (i < enabled.length ? enabled[i] : true)) {
      set.add(co);
    }
  });
  return set.size > 0 ? [...set].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

/** Compute average marks per item for each CO from the Mark Manager pattern config. */
function deriveCoAverages(pattern: QpPattern['pattern'], coList: number[]): Record<string, number> {
  const mm = pattern?.mark_manager;
  if (!mm?.enabled || !mm.cos) return {};
  const averages: Record<string, number> = {};
  coList.forEach(co => {
    const key = String(co);
    const coCfg = mm.cos![key];
    if (coCfg) {
      const numItems = Number(coCfg.num_items) || 1;
      const maxMarks = Number(coCfg.max_marks) || 0;
      averages[key] = numItems > 0 ? Math.round((maxMarks / numItems) * 100) / 100 : maxMarks;
    }
  });
  return averages;
}

function findWeightEntry(
  examAssignments: ExamAssignment[],
  pattern: QpPattern,
): ExamAssignment | undefined {
  const nameLower = pattern.name.trim().toLowerCase();
  return examAssignments.find(
    ea =>
      ea.qp_type === pattern.qp_type &&
      (
        ea.exam_display_name?.trim().toLowerCase() === nameLower ||
        ea.exam?.trim().toLowerCase() === nameLower
      ),
  );
}

function buildDefaultEntry(pattern: QpPattern): ExamAssignment {
  const cos = deriveCos(pattern.pattern);
  const isMm = !!pattern.pattern?.mark_manager?.enabled;
  const wt = Number(pattern.default_weight) || 0;
  const coWeights: Record<string, number> = {};
  let coAverages: Record<string, number> | undefined;

  if (isMm) {
    // For Mark Manager exams: default CO weight = average marks per item (max_marks / num_items)
    coAverages = deriveCoAverages(pattern.pattern, cos);
    cos.forEach(co => { coWeights[String(co)] = coAverages![String(co)] ?? 0; });
  } else {
    const perCo = cos.length > 0 && wt > 0 ? Math.round((wt / cos.length) * 100) / 100 : 0;
    cos.forEach(co => { coWeights[String(co)] = perCo; });
  }

  return {
    exam: pattern.name,          // unique per exam (e.g. "CIA 1"), NOT the shared qp_type
    exam_display_name: pattern.name,
    qp_type: pattern.qp_type,
    weight: isMm ? Object.values(coWeights).reduce((s, w) => s + w, 0) : wt,
    co_weights: { ...coWeights },
    mark_manager_enabled: isMm,
    mm_exam_weight: 0,
    mm_co_weights_with_exam: { ...coWeights },
    mm_co_weights_without_exam: { ...coWeights },
    default_cos: cos,
    co_averages: coAverages,
    customize_questions: false,
  };
}

function hydrate(ea: ExamAssignment, pattern: QpPattern): ExamAssignment {
  const cos = deriveCos(pattern.pattern);
  const isMm = !!pattern.pattern?.mark_manager?.enabled;
  const base = ea.co_weights || {};
  // For MM exams: if no existing per-CO weights, seed with per-item averages from pattern
  const coAverages = isMm ? deriveCoAverages(pattern.pattern, cos) : undefined;
  const mmBase = Object.keys(base).length > 0 ? base : (coAverages ?? base);
  return {
    ...ea,
    exam_display_name: ea.exam_display_name || pattern.name,
    default_cos: cos.length > 0 ? cos : (ea.default_cos || []),
    mark_manager_enabled: ea.mark_manager_enabled ?? isMm,
    mm_co_weights_with_exam: ea.mm_co_weights_with_exam || { ...mmBase },
    mm_co_weights_without_exam: ea.mm_co_weights_without_exam || { ...mmBase },
    mm_exam_weight: Number(ea.mm_exam_weight) || 0,
    co_averages: coAverages,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function WeightagePage() {
  const [loading, setLoading] = useState(true);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [qpPatterns, setQpPatterns] = useState<QpPattern[]>([]);
  const [qpTypeRecords, setQpTypeRecords] = useState<QpTypeRecord[]>([]);
  const [selectedCtId, setSelectedCtId] = useState<string | null>(null);
  const [popupQpTypeKey, setPopupQpTypeKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [localExams, setLocalExams] = useState<ExamAssignment[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ctRes, ptRes, qtRes] = await Promise.all([
        fetchWithAuth('/api/academic-v2/class-types/'),
        fetchWithAuth('/api/academic-v2/qp-patterns/'),
        fetchWithAuth('/api/academic-v2/qp-types/'),
      ]);
      if (!ctRes.ok) throw new Error('class-types');
      const [ctData, ptData, qtData] = await Promise.all([
        ctRes.json(),
        ptRes.ok ? ptRes.json() : { results: [] },
        qtRes.ok ? qtRes.json() : { results: [] },
      ]);
      setClassTypes(Array.isArray(ctData) ? ctData : (ctData.results || []));
      setQpPatterns(Array.isArray(ptData) ? ptData : (ptData.results || []));
      setQpTypeRecords(Array.isArray(qtData) ? qtData : (qtData.results || []));
    } catch {
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const selectedCt = classTypes.find(ct => ct.id === selectedCtId) ?? null;

  const patternsByQpType = useMemo<Record<string, QpPattern[]>>(() => {
    if (!selectedCtId) return {};
    const groups: Record<string, QpPattern[]> = {};
    qpPatterns
      .filter(p => p.class_type === selectedCtId)
      .forEach(p => {
        const key = p.qp_type || 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });
    return groups;
  }, [qpPatterns, selectedCtId]);

  const qpTypeKeys = useMemo(() => Object.keys(patternsByQpType).sort(), [patternsByQpType]);

  const qpTypeLabel = (key: string) => {
    const rec = qpTypeRecords.find(q => q.code === key);
    return rec?.name || key;
  };

  const totalWeightForQpType = (key: string) => {
    const patterns = patternsByQpType[key] || [];
    return patterns.reduce((sum, p) => {
      const ea = findWeightEntry(selectedCt?.exam_assignments || [], p);
      if (!ea) return sum;
      if (ea.mark_manager_enabled) {
        const wc = ea.mm_co_weights_with_exam || {};
        return sum + Object.values(wc).reduce((s, w) => s + (Number(w) || 0), 0) + (Number(ea.mm_exam_weight) || 0);
      }
      return sum + Object.values(ea.co_weights || {}).reduce((s, w) => s + (Number(w) || 0), 0);
    }, 0);
  };

  const openPopup = (qpTypeKey: string) => {
    const patterns = patternsByQpType[qpTypeKey] || [];
    const exams = patterns.map(p => {
      const existing = findWeightEntry(selectedCt?.exam_assignments || [], p);
      return hydrate(existing ?? buildDefaultEntry(p), p);
    });
    setLocalExams(JSON.parse(JSON.stringify(exams)));
    setIsDirty(false);
    setPopupQpTypeKey(qpTypeKey);
  };

  const closePopup = () => { setPopupQpTypeKey(null); setLocalExams([]); setIsDirty(false); };

  const handleSave = async () => {
    if (!selectedCtId || !selectedCt || !popupQpTypeKey) return;
    try {
      setSaving(true);
      const base = (selectedCt.exam_assignments || []).filter(ea => ea.qp_type !== popupQpTypeKey);
      const merged = [...base, ...localExams];
      const response = await fetchWithAuth(`/api/academic-v2/class-types/${selectedCtId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ exam_assignments: merged }),
      });
      if (!response.ok) throw new Error('save');
      const updated: ClassType = await response.json();
      setClassTypes(prev => prev.map(ct => ct.id === updated.id ? updated : ct));
      setMessage({ type: 'success', text: 'Weights saved' });
      closePopup();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save weights' });
    } finally {
      setSaving(false);
    }
  };

  const updateExam = (idx: number, updater: (e: ExamAssignment) => ExamAssignment) => {
    setLocalExams(prev => prev.map((e, i) => i === idx ? updater(e) : e));
    setIsDirty(true);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Scale className="w-6 h-6 text-blue-600" /> Weightage
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Set CO weights for each exam under each QP type, per class type.</p>
        </div>
        <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-4 gap-5">
        <div className="col-span-1 bg-white rounded-lg shadow self-start overflow-hidden">
          <div className="px-3 py-2.5 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase tracking-wide">Class Types</div>
          {classTypes.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No class types.{' '}
              <Link to="/academic-v2/admin/class-types" className="text-blue-600 hover:underline">Create one →</Link>
            </div>
          ) : (
            classTypes.map(ct => (
              <button key={ct.id} onClick={() => setSelectedCtId(ct.id)}
                className={`w-full text-left px-3 py-3 border-b last:border-none hover:bg-gray-50 transition-colors flex items-center justify-between ${selectedCtId === ct.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}>
                <div>
                  <div className="font-medium text-sm text-gray-900">{ct.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{ct.short_code}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            ))
          )}
        </div>

        <div className="col-span-3">
          {!selectedCt ? (
            <div className="bg-white rounded-lg shadow border-dashed border-2 p-16 text-center">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Select a class type to view its QP types</p>
            </div>
          ) : qpTypeKeys.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Scale className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">No QP patterns found for <strong>{selectedCt.name}</strong>.</p>
              <Link to="/academic-v2/admin/qp-patterns" className="text-blue-600 hover:underline text-sm">Set up QP Patterns first →</Link>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800">{selectedCt.name}</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{selectedCt.short_code}</span>
                <span className="text-xs text-gray-400">— click a QP type card to configure weights</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {qpTypeKeys.map(key => {
                  const patterns = patternsByQpType[key] || [];
                  const total = totalWeightForQpType(key);
                  return (
                    <button key={key} onClick={() => openPopup(key)}
                      className="bg-white rounded-lg shadow p-4 text-left hover:shadow-md hover:border-blue-300 border border-gray-200 transition-all group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900">{qpTypeLabel(key)}</span>
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{key}</code>
                      </div>
                      <div className="text-xs text-gray-500 mb-3">{patterns.length} exam{patterns.length !== 1 ? 's' : ''}</div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {patterns.slice(0, 4).map(p => (
                            <span key={p.id} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{p.name}</span>
                          ))}
                          {patterns.length > 4 && <span className="text-[10px] text-gray-400">+{patterns.length - 4} more</span>}
                        </div>
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded ml-2 flex-shrink-0">Σ {total}</span>
                      </div>
                      <div className="mt-3 text-xs text-blue-600 group-hover:underline">Edit weights →</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {popupQpTypeKey !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{qpTypeLabel(popupQpTypeKey)} — Weight Settings</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedCt?.name} · <code className="bg-gray-100 px-1 rounded">{popupQpTypeKey}</code></p>
              </div>
              <button onClick={closePopup} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {localExams.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  No exams for this QP type.{' '}
                  <Link to="/academic-v2/admin/qp-patterns" className="text-blue-600 hover:underline">Add exams in QP Patterns →</Link>
                </div>
              ) : (
                localExams.map((exam, examIdx) => (
                  <div key={examIdx} className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center gap-3">
                      <code className="text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-600">{exam.exam}</code>
                      <span className="font-semibold text-sm text-gray-800">{exam.exam_display_name}</span>
                      {exam.mark_manager_enabled && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium ml-auto">Mark Manager</span>
                      )}
                    </div>
                    <div className="p-4">
                      {exam.mark_manager_enabled ? (
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Without Exam</div>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: 5 }, (_, i) => i + 1).map(co => {
                                const coKey = String(co);
                                const coWeight = (exam.mm_co_weights_without_exam || {})[coKey] ?? 0;
                                const avg = exam.co_averages?.[coKey];
                                return (
                                  <div key={`wo-${co}`} className="flex flex-col items-center gap-0.5 bg-blue-50 rounded px-1.5 py-1">
                                    <span className="text-[10px] text-blue-600 font-medium">CO{co}</span>
                                    {avg != null && (
                                      <span className="text-[9px] text-gray-400">avg:{avg}</span>
                                    )}
                                    <input type="number" step="any" min="0" value={coWeight}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        updateExam(examIdx, ex => {
                                          const wo = { ...(ex.mm_co_weights_without_exam || {}), [coKey]: v };
                                          const wc = ex.mm_co_weights_with_exam || {};
                                          const wTotal = Object.values(wc).reduce((s, w) => s + (Number(w) || 0), 0) + (Number(ex.mm_exam_weight) || 0);
                                          return { ...ex, mm_co_weights_without_exam: wo, weight: wTotal };
                                        });
                                      }}
                                      className="w-14 px-1 py-0.5 border rounded text-center text-xs focus:ring-1 focus:ring-blue-400" />
                                  </div>
                                );
                              })}
                              <div className="flex items-center gap-0.5 bg-gray-100 rounded px-1.5 py-1 ml-1">
                                <span className="text-[10px] text-gray-500">Σ</span>
                                <span className="text-xs font-bold text-gray-700">{Object.values(exam.mm_co_weights_without_exam || {}).reduce((s, w) => s + (Number(w) || 0), 0)}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide">With Exam</div>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <div className="flex items-center gap-0.5 bg-amber-50 rounded px-1.5 py-1">
                                <span className="text-[10px] text-amber-700 font-medium">Exam</span>
                                <input type="number" step="any" min="0" value={Number(exam.mm_exam_weight) || 0}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value) || 0;
                                    updateExam(examIdx, ex => {
                                      const wc = ex.mm_co_weights_with_exam || {};
                                      const wTotal = Object.values(wc).reduce((s, w) => s + (Number(w) || 0), 0) + v;
                                      return { ...ex, mm_exam_weight: v, weight: wTotal };
                                    });
                                  }}
                                  className="w-14 px-1 py-0.5 border rounded text-center text-xs focus:ring-1 focus:ring-amber-400" />
                              </div>
                              {Array.from({ length: 5 }, (_, i) => i + 1).map(co => {
                                const coKey = String(co);
                                const coWeight = (exam.mm_co_weights_with_exam || {})[coKey] ?? 0;
                                const avg = exam.co_averages?.[coKey];
                                return (
                                  <div key={`w-${co}`} className="flex flex-col items-center gap-0.5 bg-blue-50 rounded px-1.5 py-1">
                                    <span className="text-[10px] text-blue-600 font-medium">CO{co}</span>
                                    {avg != null && (
                                      <span className="text-[9px] text-gray-400">avg:{avg}</span>
                                    )}
                                    <input type="number" step="any" min="0" value={coWeight}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        updateExam(examIdx, ex => {
                                          const wc = { ...(ex.mm_co_weights_with_exam || {}), [coKey]: v };
                                          const wTotal = Object.values(wc).reduce((s, w) => s + (Number(w) || 0), 0) + (Number(ex.mm_exam_weight) || 0);
                                          return { ...ex, mm_co_weights_with_exam: wc, weight: wTotal };
                                        });
                                      }}
                                      className="w-14 px-1 py-0.5 border rounded text-center text-xs focus:ring-1 focus:ring-blue-400" />
                                  </div>
                                );
                              })}
                              <div className="flex items-center gap-0.5 bg-gray-100 rounded px-1.5 py-1 ml-1">
                                <span className="text-[10px] text-gray-500">Σ</span>
                                <span className="text-xs font-bold text-gray-700">{(Object.values(exam.mm_co_weights_with_exam || {}).reduce((s, w) => s + (Number(w) || 0), 0) + (Number(exam.mm_exam_weight) || 0))}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from({ length: 5 }, (_, i) => i + 1).map(co => {
                            const coKey = String(co);
                            const coWeight = (exam.co_weights || {})[coKey] ?? 0;
                            return (
                              <div key={co} className="flex items-center gap-0.5 bg-blue-50 rounded px-1.5 py-1">
                                <span className="text-[10px] text-blue-600 font-medium">CO{co}</span>
                                <input type="number" step="any" min="0" value={coWeight}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value) || 0;
                                    updateExam(examIdx, ex => {
                                      const cw = { ...(ex.co_weights || {}), [coKey]: v };
                                      return { ...ex, co_weights: cw, weight: Object.values(cw).reduce((s, w) => s + (Number(w) || 0), 0) };
                                    });
                                  }}
                                  className="w-14 px-1 py-0.5 border rounded text-center text-xs focus:ring-1 focus:ring-blue-400" />
                              </div>
                            );
                          })}
                          <div className="flex items-center gap-0.5 bg-gray-100 rounded px-1.5 py-1 ml-1">
                            <span className="text-[10px] text-gray-500">Σ</span>
                            <span className="text-xs font-bold text-gray-700">{Object.values(exam.co_weights || {}).reduce((s, w) => s + (Number(w) || 0), 0)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div className="text-xs text-gray-500">
                Total weight: <span className="font-bold text-gray-800">
                  {localExams.reduce((sum, e) => {
                    if (e.mark_manager_enabled) {
                      const wc = e.mm_co_weights_with_exam || {};
                      return sum + Object.values(wc).reduce((s, w) => s + (Number(w) || 0), 0) + (Number(e.mm_exam_weight) || 0);
                    }
                    return sum + Object.values(e.co_weights || {}).reduce((s, w) => s + (Number(w) || 0), 0);
                  }, 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={closePopup} className="px-4 py-2 border rounded-lg text-sm hover:bg-white">Cancel</button>
                <button onClick={handleSave} disabled={!isDirty || saving}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${isDirty && !saving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save Weights'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
