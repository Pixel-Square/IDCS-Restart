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
import { Plus, X, Settings2, GripVertical } from 'lucide-react';

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

const BTL_LEVELS = [1, 2, 3, 4, 5, 6];
const CO_NUMBERS = [1, 2, 3, 4, 5];
const CO_COMBINATIONS: number[][] = (() => {
  const result: number[][] = [];
  const gen = (start: number, len: number, current: number[]) => {
    if (current.length === len) { result.push([...current]); return; }
    for (let i = start; i <= 5; i++) { current.push(i); gen(i + 1, len, current); current.pop(); }
  };
  for (let len = 2; len <= 5; len++) gen(1, len, []);
  return result;
})();

const coLabel = (co: number | number[] | null): string => {
  if (co == null) return '—';
  if (Array.isArray(co)) return co.map(c => `CO${c}`).join(' & ');
  return `CO${co}`;
};

function coToSelectVal(co: number | number[] | null): string {
  if (co == null) return '';
  if (Array.isArray(co)) return co.join(',');
  return String(co);
}
function selectValToCo(val: string): number | number[] | null {
  if (!val) return null;
  if (val.includes(',')) return val.split(',').map(Number);
  return Number(val);
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

  // question table state
  localRows: QuestionDef[];
  onUpdateRow: (idx: number, field: keyof QuestionDef, value: unknown) => void;
  onRemoveQuestion: (idx: number) => void;
  onAddQuestion: () => void;
  onOpenQuestionSettings?: (idx: number) => void; // optional; uses existing modal in parent if provided

  // CQI editor state
  cqiVariables: CqiVar[];
  tokenMeta: (code: string) => { badge: string; badgeClass: string; rowClass: string; tokenClass: string };

  // token insertion
  tokenInsertRequested: boolean; // used by parent to open token picker
  onRequestTokenPicker: (insert: (token: string) => void) => void;

  // update function
  updateCqi: (updater: (prev: NonNullable<ExamAssignment['cqi']>) => NonNullable<ExamAssignment['cqi']>) => void;

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
          <button onClick={props.onClose} className="p-2 rounded hover:bg-gray-100" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body - Horizontal layout */}
        <div className="p-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Left: Question Table */}
            <div className="xl:col-span-5">
              <div className="border rounded-lg overflow-hidden bg-white">
                <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Question Table</div>
                    <div className="text-xs text-gray-500">Required for CQI preview/edit</div>
                  </div>
                  {props.isEditing && (
                    <button onClick={props.onAddQuestion} className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200">
                      <Plus className="w-4 h-4" />
                      Add Row
                    </button>
                  )}
                </div>

                <div className="overflow-auto max-h-[520px]">
                  <table className="w-full text-sm table-fixed">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {props.isEditing && <th className="w-8 px-2 py-2 text-gray-400 text-xs font-semibold">#</th>}
                        <th className="w-20 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Enabled</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Question Title</th>
                        <th className="w-24 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Max</th>
                        <th className="w-24 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">BTL</th>
                        <th className="w-56 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">CO</th>
                        <th className="w-14 px-2 py-2"></th>
                        {props.isEditing && <th className="px-2 py-2 w-8"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {props.localRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={(props.isEditing ? 1 : 0) + 1 + 1 + 1 + 1 + 1 + 1 + (props.isEditing ? 1 : 0)}
                            className="text-center py-10 text-gray-400"
                          >
                            No questions yet.
                          </td>
                        </tr>
                      ) : (
                        props.localRows.map((row, idx) => (
                          <tr key={idx} className={`hover:bg-gray-50 ${!row.enabled ? 'opacity-60' : ''}`}>
                            {props.isEditing && (
                              <td className="px-2 py-2 text-center text-gray-300 cursor-grab">
                                <GripVertical className="w-4 h-4 inline" />
                              </td>
                            )}
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                disabled={!props.isEditing}
                                onChange={(e) => props.onUpdateRow(idx, 'enabled', e.target.checked)}
                                className="w-4 h-4 accent-blue-600"
                              />
                            </td>
                            <td className="px-3 py-2">
                              {props.isEditing ? (
                                <input
                                  value={row.title}
                                  onChange={(e) => props.onUpdateRow(idx, 'title', e.target.value)}
                                  className="w-full px-2 py-2 border rounded focus:ring-1 focus:ring-blue-500 text-sm"
                                  placeholder={`Q${idx + 1}`}
                                />
                              ) : (
                                <span className="font-medium truncate inline-block max-w-full align-middle">{row.title}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {props.isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={row.max_marks}
                                  onChange={(e) => props.onUpdateRow(idx, 'max_marks', Number(e.target.value))}
                                  className="w-20 px-2 py-2 border rounded text-center focus:ring-1 focus:ring-blue-500 text-sm"
                                />
                              ) : (
                                <span className="font-semibold text-gray-700">{row.max_marks}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {props.isEditing ? (
                                <select
                                  value={row.btl_level ?? ''}
                                  onChange={(e) => props.onUpdateRow(idx, 'btl_level', e.target.value ? Number(e.target.value) : null)}
                                  className="px-2 py-2 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">User Selection</option>
                                  {BTL_LEVELS.map(l => <option key={l} value={l}>BT{l}</option>)}
                                </select>
                              ) : row.btl_level ? (
                                <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded">BT{row.btl_level}</span>
                              ) : (
                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">User Sel.</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {props.isEditing ? (
                                <select
                                  value={coToSelectVal(row.co_number)}
                                  onChange={(e) => props.onUpdateRow(idx, 'co_number', selectValToCo(e.target.value))}
                                  className="w-full max-w-[14rem] px-2 py-2 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">—</option>
                                  <optgroup label="Single CO">
                                    {CO_NUMBERS.map(c => <option key={c} value={String(c)}>CO{c}</option>)}
                                  </optgroup>
                                  <optgroup label="Combination COs (mark split equally)" style={{ background: '#f3e8ff' }}>
                                    {CO_COMBINATIONS.map(combo => {
                                      const val = combo.join(',');
                                      const label = combo.map(c => `CO${c}`).join(' & ');
                                      return (
                                        <option key={val} value={val} style={{ background: '#f3e8ff' }}>
                                          {label}
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                </select>
                              ) : row.co_number != null ? (
                                <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded inline-block max-w-[14rem] truncate">
                                  {coLabel(row.co_number)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                onClick={() => props.onOpenQuestionSettings?.(idx)}
                                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-40"
                                title="Question settings"
                                disabled={!props.onOpenQuestionSettings}
                              >
                                <Settings2 className="w-4 h-4" />
                              </button>
                            </td>
                            {props.isEditing && (
                              <td className="px-2 py-2 text-center">
                                <button onClick={() => props.onRemoveQuestion(idx)} className="p-1 text-red-500 hover:text-red-700">
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: CQI settings */}
            <div className="xl:col-span-7">
              <div className="border rounded-lg p-4 bg-white">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-gray-900">CQI Configuration</div>
                  <div className="text-xs text-gray-500">No Mark Manager · edited values saved in class type exam assignments</div>
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

                {/* Token Creator */}
                <div className="mt-5 border-t pt-4">
                  <div className="text-sm font-semibold text-gray-900 mb-1">Custom Variables (Tokens)</div>
                  <div className="text-xs text-gray-500 mb-3">Create reusable tokens and use them in IF/THEN/ELSE.</div>

                  <div className="space-y-2">
                    {(cqi?.custom_vars || []).length === 0 ? (
                      <div className="text-xs text-gray-400">No custom variables created</div>
                    ) : (
                      (cqi?.custom_vars || []).map((cv, idx) => (
                        <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] text-gray-500">Token Code</label>
                              <input
                                value={cv.code || ''}
                                disabled={!props.isEditing}
                                onChange={(e) =>
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.custom_vars || [])];
                                    next[idx] = { ...(next[idx] as any), code: String(e.target.value || '').toUpperCase() };
                                    return { ...prev, custom_vars: next };
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
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.custom_vars || [])];
                                    next[idx] = { ...(next[idx] as any), label: e.target.value };
                                    return { ...prev, custom_vars: next };
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
                                        props.updateCqi((prev) => {
                                          const next = [...(prev.custom_vars || [])];
                                          const prevExpr = String((next[idx] as any)?.expr || '');
                                          next[idx] = { ...(next[idx] as any), expr: props.appendToken(prevExpr, token) };
                                          return { ...prev, custom_vars: next };
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
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.custom_vars || [])];
                                    next[idx] = { ...(next[idx] as any), expr: e.target.value };
                                    return { ...prev, custom_vars: next };
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
                          props.updateCqi((prev) => ({
                            ...prev,
                            custom_vars: [...(prev.custom_vars || []), { code: '', label: '', expr: '' }],
                          }))
                        }
                        className="text-[11px] px-3 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                      >
                        + Add Custom Variable
                      </button>
                    </div>
                  )}

                  {/* Variable Token List (click to insert via parent picker only) */}
                  <div className="mt-4 border rounded-lg p-3 bg-white">
                    <div className="text-xs text-gray-600 font-semibold mb-2">Variable Tokens</div>
                    <div className="max-h-[160px] overflow-auto pr-2">
                      {props.cqiVariables.length === 0 ? (
                        <div className="text-xs text-gray-400">No variables available</div>
                      ) : (
                        <div className="space-y-1">
                          {props.cqiVariables.slice(0, 60).map((v) => (
                            <div key={v.code} className="flex items-start justify-between gap-2 rounded px-2 py-1 bg-gray-50 border">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded ${
                                      v.kind === 'custom' ? 'bg-indigo-100 text-indigo-700' : props.tokenMeta(v.code).badgeClass
                                    }`}
                                  >
                                    {v.kind === 'custom' ? 'CUSTOM' : props.tokenMeta(v.code).badge}
                                  </span>
                                  <code
                                    className={`text-sm font-mono ${
                                      v.kind === 'custom' ? 'text-indigo-700 font-semibold' : props.tokenMeta(v.code).tokenClass
                                    }`}
                                  >
                                    {v.token}
                                  </code>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate mt-1">{v.label}</div>
                              </div>

                              {props.isEditing && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    props.onRequestTokenPicker((token) => {
                                      // For token list we request picker; actual insert will happen from picker
                                      // so we keep this as "Open picker" only.
                                      // Parent still has the +Token buttons as the real insertion path.
                                      // (You can extend this later to insert directly.)
                                      void token;
                                    })
                                  }
                                  className="text-[11px] px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  title="Use + Token buttons to insert (token picker provides accurate insertion)"
                                >
                                  Use
                                </button>
                              )}
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
