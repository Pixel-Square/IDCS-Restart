/**
 * Horizontal CQI editor popup (dedicated UI)
 * - includes Question Table
 * - hides Mark Manager
 * - improves input clarity
 *
 * Note: This component is meant to be used only inside QpPatternEditorPage where
 * the state/update functions already exist.
 */

import React from 'react';
import { Edit3, Plus, Save, X } from 'lucide-react';

interface QuestionDef {
  title: string;
  max_marks: number;
  btl_level: number | null;
  co_number: number | number[] | null;
  enabled: boolean;
  special_split?: boolean;
  special_split_sources?: number[];
}

type CqiVar = { code: string; label: string; token: string; kind?: 'base' | 'custom' };

type CqiIfClause = { token: 'BEFORE_CQI' | 'AFTER_CQI' | 'TOTAL_CQI'; rhs: string };

interface ExamAssignment {
  exam: string;
  exam_display_name?: string;
  qp_type: string;
  kind?: 'exam' | 'cqi';
  cqi?: {
    name: string;
    code: string;
    cycle_id?: string;
    cos: number[];
    exams?: string[];
    custom_vars?: Array<{ code: string; label?: string; expr: string }>;
    co_value_expr?: string;
    formula: string;
    conditions: Array<{
      if: string;
      then: string;
      color?: string;
      if_clauses?: Array<{ token: 'BEFORE_CQI' | 'AFTER_CQI' | 'TOTAL_CQI'; rhs: string }>;
    }>;
    else_formula: string;
  };
}

interface CycleOption {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
}



type HighlightToken = { type: 'token' | 'op' | 'paren' | 'number' | 'ident' | 'text'; value: string };

function highlightMathLikeExpression(
  expr: string,
  tokenMeta: (code: string) => { badge: string; badgeClass: string; rowClass: string; tokenClass: string }
): HighlightToken[] {
  const s = String(expr || '');
  const out: HighlightToken[] = [];
  if (!s) return out;

  // Split by token blocks like [CQI] and keep separators.
  const parts = s.split(/(\[[^\]]+\])/g).filter((p) => p !== '');
  for (const p of parts) {
    if (p.startsWith('[') && p.endsWith(']')) {
      out.push({ type: 'token', value: p });
      continue;
    }

    // Further split to operators/parens while preserving text chunks
    // Operators: + - * / % ; Comparators: < > = !
    const sub = p.split(/([+\-*/%()<>!=])/g).filter((x) => x !== '');
    for (const x of sub) {
      if (/^\[[^\]]+\]$/.test(x)) out.push({ type: 'token', value: x });
      else if (/^[()+\-*/%<>!=]$/.test(x)) {
        if (x === '(' || x === ')') out.push({ type: 'paren', value: x });
        else out.push({ type: 'op', value: x });
      } else if (/^[0-9]+(\.[0-9]+)?$/.test(x)) out.push({ type: 'number', value: x });
      else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(x)) out.push({ type: 'ident', value: x });
      else out.push({ type: 'text', value: x });
    }
  }
  return out;
}

function TokenChip({
  token,
  tokenMeta,
}: {
  token: string;
  tokenMeta: (code: string) => { badge: string; badgeClass: string; rowClass: string; tokenClass: string };
}) {
  const key = token.replace(/^\[|\]$/g, '');
  const meta = tokenMeta(key);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-semibold ${meta.tokenClass} bg-white border border-gray-200`}>
      {token}
    </span>
  );
}

function OperatorSpan({ value }: { value: string }) {
  const isParen = value === '(' || value === ')';
  const cls = isParen
    ? 'text-amber-700 bg-amber-50 border border-amber-200'
    : 'text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200';
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded ${cls} font-semibold`}>
      {value}
    </span>
  );
}

function ColoredExpressionPreview({
  expr,
  tokenMeta,
}: {
  expr: string;
  tokenMeta: (code: string) => { badge: string; badgeClass: string; rowClass: string; tokenClass: string };
}) {
  const tokens = highlightMathLikeExpression(expr, tokenMeta);
  if (!String(expr || '').trim()) return <span className="text-gray-400 italic">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
      {tokens.map((t, idx) => {
        if (t.type === 'token') return <TokenChip key={idx} token={t.value} tokenMeta={tokenMeta} />;
        if (t.type === 'op' || t.type === 'paren') return <OperatorSpan key={idx} value={t.value} />;
        if (t.type === 'number' || t.type === 'ident') return <span key={idx} className="text-gray-800 font-medium">{t.value}</span>;
        return <span key={idx} className="text-gray-500">{t.value}</span>;
      })}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;

  // CQI editing identity
  selectedExamAssignment: { exam: ExamAssignment['exam']; exam_display_name: string; qp_type: string } | null;
  selectedExamAssignmentItem: { exam: ExamAssignment; idx: number } | null;

  // state + editing permissions
  isEditing: boolean;
  onEnableEditing?: () => void;

  // question table state
  localRows: QuestionDef[];
  onUpdateRow: (idx: number, field: keyof QuestionDef, value: unknown) => void;
  onRemoveQuestion: (idx: number) => void;
  onAddQuestion: () => void;
  onOpenQuestionSettings?: (idx: number) => void; // optional; uses existing modal in parent if provided

  // CQI editor state
  cqiVariables: CqiVar[];
  groupedCqiVariables: Array<{
    key: string;
    meta: { title: string; description: string; headerClass: string; panelClass: string };
    items: CqiVar[];
  }>;
  tokenMeta: (code: string) => { badge: string; badgeClass: string; rowClass: string; tokenClass: string };

  // token insertion
  tokenInsertRequested: boolean; // used by parent to open token picker
  onRequestTokenPicker: (insert: (token: string) => void) => void;

  // update function
  updateCqi: (updater: (prev: NonNullable<ExamAssignment['cqi']>) => NonNullable<ExamAssignment['cqi']>) => void;
  availableExamAssignments: ExamAssignment[];
  sharedCustomVars: Array<{ code: string; label?: string; expr: string }>;
  updateSharedCustomVars: (updater: (prev: Array<{ code: string; label?: string; expr: string }>) => Array<{ code: string; label?: string; expr: string }>) => void;
  onSaveSharedCustomVars: () => Promise<void> | void;
  savingSharedCustomVars?: boolean;

  // helpers for IF clause building (parent already has these in file; we keep minimal rendering here)
  parseIfClauses: (raw: string) => CqiIfClause[];
  buildIfFromClauses: (clauses: CqiIfClause[]) => string;
  appendToken: (current: string, token: string) => string;

  // misc
  selectedClassTypeDefaultCoCount: number;
  cycles: CycleOption[];
};

export default function QpCqiEditorPopup(props: Props) {
  if (!props.open) return null;
  const exam = props.selectedExamAssignmentItem?.exam;
  const cqi = exam?.cqi;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4 flex items-start justify-center overflow-auto">
      <div className="w-full max-w-[1200px] bg-white rounded-lg shadow-xl border overflow-hidden mt-10">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">CQI Editor</div>
            <div className="text-xs text-gray-500 truncate">
              {props.selectedExamAssignment?.exam_display_name || props.selectedExamAssignment?.exam || 'CQI'} · {props.selectedExamAssignment?.qp_type || '-'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!props.isEditing && props.onEnableEditing && (
              <button
                type="button"
                onClick={props.onEnableEditing}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100"
                title="Enable editing for CQI"
              >
                <Edit3 className="w-3.5 h-3.5" /> Enable Edit
              </button>
            )}
            <button onClick={props.onClose} className="p-2 rounded hover:bg-gray-100" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body - Horizontal layout */}
        <div className="p-4">
          <div className="grid grid-cols-1 gap-4">
            {/* CQI settings (full width — Question Table removed for CQI exam type) */}
            <div>
              <div className="border rounded-lg p-4 bg-white">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-gray-900">CQI Configuration</div>
                  <div className="text-xs text-gray-500">Uses class type exam assignments, shared tokens, and Mark Manager aware exam tokens.</div>
                </div>

                {/* Name / Code */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">CQI Name</label>
                    <input
                      value={cqi?.name || ''}
                      onChange={(e) => props.updateCqi((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      disabled={!props.isEditing}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">CQI Code</label>
                    <input
                      value={cqi?.code || ''}
                      onChange={(e) => props.updateCqi((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      disabled={!props.isEditing}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Cycle</label>
                    <select
                      value={cqi?.cycle_id || ''}
                      onChange={(e) => props.updateCqi((prev) => ({ ...prev, cycle_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      disabled={!props.isEditing}
                    >
                      <option value="">Select cycle</option>
                      {props.cycles.map((cycle) => (
                        <option key={cycle.id} value={cycle.id}>
                          {cycle.name}{cycle.code ? ` (${cycle.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* CO Selection */}
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-2">CO Selection</div>
                  <div className="flex flex-wrap gap-3">
                    {Array.from({ length: props.selectedClassTypeDefaultCoCount }, (_, i) => i + 1).map((co) => {
                      const selected = (cqi?.cos || []).includes(co);
                      return (
                        <label key={co} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={!props.isEditing}
                            onChange={(e) => {
                              props.updateCqi((prev) => {
                                const set = new Set(prev.cos || []);
                                if (e.target.checked) set.add(co);
                                else set.delete(co);
                                return { ...prev, cos: Array.from(set).sort((a, b) => a - b) };
                              });
                            }}
                            className="w-5 h-5"
                          />
                          <span className="text-gray-800">CO{co}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Exam Assignments Considered */}
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-2">Exam Assignments Considered</div>
                  <div className="text-[11px] text-gray-400 mb-2">
                    If none are selected, all exam assignments for this QP type are considered.
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {(() => {
                      const allCodes = props.availableExamAssignments
                        .map((e) => String(e.exam_display_name || e.exam || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
                        .filter(Boolean);
                      const rawSelected = cqi?.exams || [];
                      const selectedSet = new Set(
                        (Array.isArray(rawSelected) && rawSelected.length > 0 ? rawSelected : allCodes)
                          .map((x) => String(x || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
                          .filter(Boolean)
                      );
                      return props.availableExamAssignments.map((availableExam) => {
                        const code = String(availableExam.exam_display_name || availableExam.exam || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                        const label = String(availableExam.exam_display_name || availableExam.exam || code);
                        const checked = code ? selectedSet.has(code) : false;
                        return (
                          <label key={code || label} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!props.isEditing || !code}
                              onChange={(e) => {
                                if (!code) return;
                                props.updateCqi((prev) => {
                                  const init = new Set(
                                    (Array.isArray(prev.exams) && prev.exams.length > 0 ? prev.exams : allCodes)
                                      .map((x) => String(x || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
                                      .filter(Boolean)
                                  );
                                  if (e.target.checked) init.add(code);
                                  else init.delete(code);
                                  return { ...prev, exams: Array.from(init).sort((a, b) => a.localeCompare(b)) };
                                });
                              }}
                              className="w-5 h-5"
                            />
                            <span className="text-gray-800">{label}</span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Shared Token Creator */}
                <div className="mt-5 border-t pt-4">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Shared Custom Variables</div>
                      <div className="text-xs text-gray-500">Saved at class type level and available across all QP types in this class type.</div>
                    </div>
                    {props.isEditing && (
                      <button
                        type="button"
                        onClick={() => void props.onSaveSharedCustomVars()}
                        disabled={!!props.savingSharedCustomVars}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Save className="w-3.5 h-3.5" /> {props.savingSharedCustomVars ? 'Saving…' : 'Save Shared Tokens'}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {props.sharedCustomVars.length === 0 ? (
                      <div className="text-xs text-gray-400">No custom variables created</div>
                    ) : (
                      props.sharedCustomVars.map((cv, idx) => (
                        <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] text-gray-500">Token Code</label>
                              <input
                                value={cv.code || ''}
                                disabled={!props.isEditing}
                                onChange={(e) =>
                                  props.updateSharedCustomVars((prev) => {
                                    const next = [...prev];
                                    next[idx] = { ...(next[idx] as any), code: String(e.target.value || '').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') };
                                    return next;
                                  })
                                }
                                className="w-full px-3 py-2 border rounded text-sm font-mono mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-gray-500">Label (optional)</label>
                              <input
                                value={cv.label || ''}
                                disabled={!props.isEditing}
                                onChange={(e) =>
                                  props.updateSharedCustomVars((prev) => {
                                    const next = [...prev];
                                    next[idx] = { ...(next[idx] as any), label: e.target.value };
                                    return next;
                                  })
                                }
                                className="w-full px-3 py-2 border rounded text-sm mt-1"
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[11px] text-gray-500">Expression</label>
                                {props.isEditing && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      props.onRequestTokenPicker((token) => {
                                        props.updateSharedCustomVars((prev) => {
                                          const next = [...prev];
                                          const prevExpr = String((next[idx] as any)?.expr || '');
                                          next[idx] = { ...(next[idx] as any), expr: props.appendToken(prevExpr, token) };
                                          return next;
                                        });
                                      })
                                    }
                                    className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    + Token
                                  </button>
                                )}
                              </div>
                              <textarea
                                value={cv.expr || ''}
                                disabled={!props.isEditing}
                                onChange={(e) =>
                                  props.updateSharedCustomVars((prev) => {
                                    const next = [...prev];
                                    next[idx] = { ...(next[idx] as any), expr: e.target.value };
                                    return next;
                                  })
                                }
                                className="w-full px-3 py-2 border rounded text-sm font-mono mt-1 min-h-[56px] resize-y"
                                placeholder="Example: ([COX-SSA_1-OBT] / 10) * 1.5"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {props.isEditing && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          props.updateSharedCustomVars((prev) => [...prev, { code: '', label: '', expr: '' }])
                        }
                        className="text-[11px] px-3 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                      >
                        + Add Custom Variable
                      </button>
                    </div>
                  )}

                  {/* Variable Token List */}
                  <div className="mt-4 space-y-3">
                    <div className="text-xs text-gray-600 font-semibold">Variable Tokens</div>
                    <div className="max-h-[280px] overflow-auto pr-2 space-y-3">
                      {props.cqiVariables.length === 0 ? (
                        <div className="text-xs text-gray-400">No variables available</div>
                      ) : (
                        <div className="space-y-3">
                          {props.groupedCqiVariables.map((section) => (
                            <div key={section.key} className={`rounded-xl border ${section.meta.panelClass}`}>
                              <div className="px-3 py-2 border-b border-black/5 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">{section.meta.title}</div>
                                  <div className="text-[11px] text-gray-500">{section.meta.description}</div>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${section.meta.headerClass}`}>{section.items.length}</span>
                              </div>
                              <div className="divide-y divide-black/5">
                                {section.items.map((v) => (
                                  <div key={v.code} className="flex items-start justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className={`text-[10px] px-2 py-0.5 rounded ${v.kind === 'custom' ? 'bg-indigo-100 text-indigo-700' : props.tokenMeta(v.code).badgeClass}`}>
                                          {v.kind === 'custom' ? 'CUSTOM' : props.tokenMeta(v.code).badge}
                                        </span>
                                        <code className={`text-sm font-mono ${v.kind === 'custom' ? 'text-indigo-700 font-semibold' : props.tokenMeta(v.code).tokenClass}`}>
                                          {v.token}
                                        </code>
                                      </div>
                                      <div className="text-[11px] text-gray-500 mt-1">{v.label}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CQI Operation + Conditions */}
                <div className="mt-5 border-t pt-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">CQI Operation (Conditions)</div>
                      <div className="text-xs text-gray-500">IF → THEN; last else used as default</div>
                    </div>
                    {props.isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          props.updateCqi((prev) => ({
                            ...prev,
                            conditions: [...(prev.conditions || []), { if: '', then: '', color: '#FEE2E2', if_clauses: [{ token: 'BEFORE_CQI', rhs: '' }] }],
                          }));
                        }}
                        className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Add Condition
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {(cqi?.conditions || []).map((cond, idx) => {
                      const rawIf = (cond as any)?.if || '';
                      const clauses = Array.isArray((cond as any)?.if_clauses)
                        ? ((cond as any).if_clauses as CqiIfClause[])
                        : props.parseIfClauses(rawIf);

                      const writeClauses = (nextClauses: CqiIfClause[]) => {
                        props.updateCqi((prev) => {
                          const next = [...(prev.conditions || [])];
                          const cur: any = next[idx] || {};
                          cur.if_clauses = nextClauses;
                          cur.if = props.buildIfFromClauses(nextClauses);
                          next[idx] = cur;
                          return { ...prev, conditions: next };
                        });
                      };

                      return (
                        <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                            {/* IF */}
                            <div className="md:col-span-1">
                              <div className="text-xs text-gray-500 mb-2">Condition (IF)</div>

                              {props.isEditing && (
                                <div className="flex gap-2 mb-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      props.updateCqi((prev) => {
                                        const next = [...(prev.conditions || [])];
                                        const cur: any = next[idx] || {};
                                        const curClauses: CqiIfClause[] = Array.isArray(cur.if_clauses) ? cur.if_clauses : props.parseIfClauses(cur.if || '');
                                        curClauses.push({ token: 'TOTAL_CQI', rhs: '' });
                                        cur.if_clauses = curClauses;
                                        cur.if = props.buildIfFromClauses(curClauses);
                                        next[idx] = cur;
                                        return { ...prev, conditions: next };
                                      })
                                    }
                                    className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    + AND
                                  </button>
                                </div>
                              )}

                              <div className="space-y-2">
                                {clauses.map((cl, ci) => (
                                  <div key={ci} className="flex items-center gap-2">
                                    {ci === 0 ? (
                                      <div className="px-2 py-2 border rounded-lg text-sm font-mono bg-gray-100 text-gray-700 whitespace-nowrap">
                                        Before_CQI =
                                      </div>
                                    ) : (
                                      <select
                                        disabled={!props.isEditing}
                                        value={cl.token}
                                        onChange={(e) => {
                                          const nextToken = e.target.value as CqiIfClause['token'];
                                          const nextClauses = clauses.map((x, j) => (j === ci ? { ...x, token: nextToken } : x));
                                          writeClauses(nextClauses);
                                        }}
                                        className="px-2 py-2 border rounded-lg text-sm font-mono bg-white text-gray-700"
                                      >
                                        <option value="BEFORE_CQI">BEFORE_CQI</option>
                                        <option value="AFTER_CQI">AFTER_CQI</option>
                                        <option value="TOTAL_CQI">TOTAL_CQI</option>
                                      </select>
                                    )}

<div className="space-y-2">
  <input
    value={cl.rhs}
    disabled={!props.isEditing}
    onChange={(e) => {
      const nextClauses = clauses.map((x, j) => (j === ci ? { ...x, rhs: e.target.value } : x));
      writeClauses(nextClauses);
    }}
    placeholder={ci === 0 ? 'Example: < 58' : 'Example: >= 58'}
    className="w-full px-4 py-3 border rounded-lg text-sm font-mono"
  />
  <ColoredExpressionPreview expr={cl.rhs} tokenMeta={props.tokenMeta} />
</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* THEN */}
                            <div>
                              <div className="text-xs text-gray-500 mb-2 flex items-center justify-between gap-2">
                                <span>Internal Mark Value (THEN)</span>
                                {props.isEditing && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      props.onRequestTokenPicker((token) => {
                                        props.updateCqi((prev) => {
                                          const next = [...(prev.conditions || [])];
                                          const c: any = next[idx] || {};
                                          c.then = props.appendToken(String(c.then || ''), token);
                                          next[idx] = c;
                                          return { ...prev, conditions: next };
                                        });
                                      })
                                    }
                                    className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    + Token
                                  </button>
                                )}
                              </div>

<textarea
  value={(cond as any)?.then || ''}
  disabled={!props.isEditing}
  onChange={(e) => {
    props.updateCqi((prev) => {
      const next = [...(prev.conditions || [])];
      const c: any = next[idx] || {};
      c.then = e.target.value;
      next[idx] = c;
      return { ...prev, conditions: next };
    });
  }}
  placeholder="Example: [CQI] * 1.5"
  className="w-full px-4 py-3 border rounded-lg text-sm font-mono min-h-[80px] resize-y"
 />
 <div className="mt-2">
   <div className="text-[11px] text-gray-500 mb-1">Preview (colored)</div>
   <ColoredExpressionPreview expr={(cond as any)?.then || ''} tokenMeta={props.tokenMeta} />
 </div>
                            </div>

                            {/* Color */}
                            <div>
                              <div className="text-xs text-gray-500 mb-2">Cell Color</div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={String((cond as any)?.color || '#FEE2E2')}
                                  disabled={!props.isEditing}
                                  onChange={(e) => {
                                    props.updateCqi((prev) => {
                                      const next = [...(prev.conditions || [])];
                                      const c: any = next[idx] || {};
                                      c.color = e.target.value;
                                      next[idx] = c;
                                      return { ...prev, conditions: next };
                                    });
                                  }}
                                  className="h-10 w-14 p-0 border rounded bg-white"
                                />
                                <input
                                  value={String((cond as any)?.color || '')}
                                  disabled={!props.isEditing}
                                  onChange={(e) => {
                                    props.updateCqi((prev) => {
                                      const next = [...(prev.conditions || [])];
                                      const c: any = next[idx] || {};
                                      c.color = e.target.value;
                                      next[idx] = c;
                                      return { ...prev, conditions: next };
                                    });
                                  }}
                                  placeholder="#FEE2E2"
                                  className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                                />
                              </div>

                              {props.isEditing && (
                                <div className="mt-2 text-xs text-red-600 underline cursor-pointer">
                                  Remove handled by parent (or extend here)
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Else */}
                    <div className="border rounded-lg p-3 bg-white">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-xs text-gray-500 font-semibold">Else Formula (default)</div>
                        {props.isEditing && (
                          <button
                            type="button"
                            onClick={() =>
                              props.onRequestTokenPicker((token) => {
                                props.updateCqi((prev) => ({
                                  ...prev,
                                  else_formula: props.appendToken(prev.else_formula || '', token),
                                }));
                              })
                            }
                            className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                          >
                            + Token
                          </button>
                        )}
                      </div>
<textarea
  value={cqi?.else_formula || ''}
  disabled={!props.isEditing}
  onChange={(e) => props.updateCqi((prev) => ({ ...prev, else_formula: e.target.value }))}
  placeholder="Example: [CQI] * 1.5"
  className="w-full px-4 py-3 border rounded-lg text-sm font-mono min-h-[80px] resize-y"
 />
 <div className="mt-2">
   <div className="text-[11px] text-gray-500 mb-1">Preview (colored)</div>
   <ColoredExpressionPreview expr={cqi?.else_formula || ''} tokenMeta={props.tokenMeta} />
 </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Close hint */}
              <div className="mt-3 text-xs text-gray-500">Tip: Use the token picker from the parent page to insert variables.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
