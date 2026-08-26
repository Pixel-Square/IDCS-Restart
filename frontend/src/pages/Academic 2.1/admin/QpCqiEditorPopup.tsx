/**
 * Horizontal CQI editor popup (dedicated UI)
 * - includes Question Table
 * - hides Mark Manager
 * - improves input clarity
 *
 * Note: This component is meant to be used only inside QpPatternEditorPage where
 * the state/update functions already exist.
 */

import React, { useState } from 'react';
import { Check, ClipboardPaste, Copy, Edit3, Plus, Save, Trash2, X } from 'lucide-react';

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

// New format: operator is a separate field. Old format: operator embedded in rhs.
type CqiIfClause = { token: string; operator?: string; rhs: string };

// Admin-defined CO-wise derived variable (name may contain COx as runtime placeholder)
type CqiDerivedVariable = { name: string; formula: string };

interface DbCqiToken {
  id: string;
  code: string;
  label: string;
  category: 'core' | 'co_alias' | 'co_dynamic' | 'exam' | 'custom';
  is_dynamic_co: boolean;
  is_system: boolean;
  available_in_condition: boolean;
  available_in_formula: boolean;
  order: number;
}

interface DbCqiOperator {
  id: string;
  code: string;
  symbol: string;
  label: string;
  order: number;
}

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
      title?: string;
      if: string;
      then: string;
      color?: string;
      if_clauses?: CqiIfClause[];
    }>;
    else_formula: string;
    derived_variables?: CqiDerivedVariable[];
  };
}

interface CycleOption {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
}



type HighlightToken = { type: 'token' | 'op' | 'paren' | 'number' | 'ident' | 'text'; value: string };

function normalizeClauseOperator(opRaw: string): string {
  const op = String(opRaw || '').trim();
  if (!op) return '';
  return op === '=' ? '==' : op;
}

function normalizeClauseForEditor(clause: CqiIfClause): CqiIfClause {
  const tokenRaw = String((clause as any)?.token || '').toUpperCase();
  const token = tokenRaw === 'BEFORE_CQI' ? 'BEFORE_CQI_COX' : tokenRaw;
  const operatorRaw = String((clause as any)?.operator || '').trim();
  let operator = normalizeClauseOperator(operatorRaw);
  let rhs = String((clause as any)?.rhs || '').trim();

  // RAW clause: RHS is the whole boolean expression; don't split/normalize further.
  if (!token) {
    return { token: '', rhs };
  }

  const prefixMatch = rhs.match(/^((?:(?:<=|>=|==|!=|=|<|>)\s*)+)(.*)$/);
  if (prefixMatch) {
    const ops = prefixMatch[1].match(/<=|>=|==|!=|=|<|>/g) || [];
    operator = normalizeClauseOperator((ops[ops.length - 1] || operator || '').trim());
    rhs = String(prefixMatch[2] || '').trim();
  }

  const standaloneExpr = (
    (token === 'BEFORE_CQI' || token === 'BEFORE_CQI_COX') &&
    (!operator || operator === '==' || operator === '=') &&
    /(<=|>=|==|!=|=|<|>)/.test(rhs) &&
    !/^(<=|>=|==|!=|=|<|>)/.test(rhs)
  );

  // Convert legacy "standalone" expression into a RAW clause to avoid operator dropdown fallback.
  return standaloneExpr ? { token: '', rhs } : { token, operator, rhs };
}

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
  onSave?: () => Promise<void> | void;
  saving?: boolean;

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
  courseOutcomeNumbers?: number[];
  cycles: CycleOption[];

  // DB-backed token and operator registries
  dbCqiTokens?: DbCqiToken[];
  dbCqiOperators?: DbCqiOperator[];
};

export default function QpCqiEditorPopup(props: Props) {
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [schemaInputOpen, setSchemaInputOpen] = useState(false);
  const [schemaInputText, setSchemaInputText] = useState('');
  const [schemaInputError, setSchemaInputError] = useState<string | null>(null);

  if (!props.open) return null;
  const exam = props.selectedExamAssignmentItem?.exam;
  const cqi = exam?.cqi;
  const coNumbers = Array.from(new Set((props.courseOutcomeNumbers || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);

  const handleCopySchema = () => {
    // When copying the CQI schema, include all fields, but leave code empty so it doesn't overwrite with identical code on import
    const schema = {
      name: cqi?.name || '',
      code: '', // Left empty as requested so target CQI code is distinct/chosen separately
      cycle_id: cqi?.cycle_id || '',
      cos: cqi?.cos || [],
      exams: cqi?.exams || [],
      co_value_expr: cqi?.co_value_expr || '',
      formula: cqi?.formula || '',
      conditions: (cqi?.conditions || []).map((c: any) => ({
        title: c.title || '',
        if: c.if || '',
        then: c.then || '',
        color: c.color || '#FEE2E2',
        cap_enabled: Boolean(c.cap_enabled),
        cap_percent: c.cap_percent != null ? c.cap_percent : undefined,
        if_clauses: Array.isArray(c.if_clauses)
          ? c.if_clauses.map((cl: any) => ({
              token: cl.token || '',
              operator: cl.operator || '<',
              rhs: cl.rhs || '',
            }))
          : undefined,
      })),
      else_formula: cqi?.else_formula || '',
      derived_variables: (cqi?.derived_variables || []).map((dv) => ({
        name: dv.name || '',
        formula: dv.formula || '',
      })),
    };

    const text = JSON.stringify(schema, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2500);
    }).catch(() => {
      setSchemaInputText(text);
      setSchemaInputOpen(true);
    });
  };

  const handleApplySchema = () => {
    try {
      const parsed = JSON.parse(schemaInputText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('CQI Schema must be a valid JSON object');
      }

      props.updateCqi((prev) => {
        return {
          ...prev,
          name: parsed.name != null && String(parsed.name).trim() ? String(parsed.name).trim() : prev.name,
          // If parsed code is provided and non-empty, use it; otherwise preserve target's unique code
          code: parsed.code != null && String(parsed.code).trim() ? String(parsed.code).trim() : prev.code,
          cycle_id: parsed.cycle_id != null ? String(parsed.cycle_id) : prev.cycle_id,
          cos: Array.isArray(parsed.cos) ? parsed.cos.map(Number).filter((n: number) => !Number.isNaN(n)) : prev.cos,
          exams: Array.isArray(parsed.exams) ? parsed.exams.map((x: any) => String(x || '')).filter(Boolean) : prev.exams,
          co_value_expr: parsed.co_value_expr != null ? String(parsed.co_value_expr) : prev.co_value_expr,
          formula: parsed.formula != null ? String(parsed.formula) : prev.formula,
          conditions: Array.isArray(parsed.conditions)
            ? parsed.conditions.map((c: any) => {
                const rawClauses = Array.isArray(c.if_clauses)
                  ? c.if_clauses.map((cl: any) => ({
                      token: String(cl.token || '').trim(),
                      operator: String(cl.operator || '<').trim(),
                      rhs: String(cl.rhs || '').trim(),
                    }))
                  : props.parseIfClauses(String(c.if || ''));
                return {
                  title: String(c.title || ''),
                  if: String(c.if || ''),
                  then: String(c.then || ''),
                  color: c.color || '#FEE2E2',
                  cap_enabled: Boolean(c.cap_enabled),
                  cap_percent: c.cap_percent != null ? Number(c.cap_percent) : undefined,
                  if_clauses: rawClauses,
                };
              })
            : prev.conditions,
          else_formula: parsed.else_formula != null ? String(parsed.else_formula) : prev.else_formula,
          derived_variables: Array.isArray(parsed.derived_variables)
            ? parsed.derived_variables.map((dv: any) => ({
                name: String(dv.name || ''),
                formula: String(dv.formula || ''),
              }))
            : prev.derived_variables,
        };
      });

      if (!props.isEditing && props.onEnableEditing) {
        props.onEnableEditing();
      }

      setSchemaInputOpen(false);
      setSchemaInputText('');
      setSchemaInputError(null);
    } catch (e: any) {
      setSchemaInputError(`Invalid CQI schema: ${e.message}`);
    }
  };

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
            {/* Copy Schema Button */}
            <button
              type="button"
              onClick={handleCopySchema}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                schemaCopied ? 'bg-green-50 border-green-400 text-green-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Copy all CQI fields, formulas, and conditions to clipboard"
            >
              {schemaCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {schemaCopied ? 'Copied!' : 'Copy Schema'}
            </button>

            {/* Input Schema Button */}
            <button
              type="button"
              onClick={() => { setSchemaInputText(''); setSchemaInputError(null); setSchemaInputOpen(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium"
              title="Paste a copied CQI schema to apply to this CQI"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              Input Schema
            </button>

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
            {props.isEditing && (
              <button
                type="button"
                disabled={!!props.saving}
                onClick={async () => {
                  try {
                    if (props.onSave) await props.onSave();
                    props.onClose();
                  } catch (e) {
                    // Parent is expected to surface an error message.
                    console.error('CQI save failed', e);
                  }
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60"
                title="Save CQI configuration"
              >
                <Save className="w-3.5 h-3.5" /> {props.saving ? 'Saving…' : 'Save & Close'}
              </button>
            )}
            <button onClick={props.onClose} className="p-2 rounded hover:bg-gray-100" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Input Schema Modal for CQI */}
        {schemaInputOpen && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border w-full max-w-lg overflow-hidden">
              <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Input CQI Schema</div>
                  <div className="text-xs text-gray-500">Paste JSON schema copied from another CQI configuration</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSchemaInputOpen(false)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <textarea
                  value={schemaInputText}
                  onChange={(e) => { setSchemaInputText(e.target.value); setSchemaInputError(null); }}
                  placeholder={`Paste CQI JSON here, e.g.:\n{\n  "name": "CQI 1",\n  "cos": [1, 2, 3],\n  "conditions": [\n    {\n      "title": "Condition 1",\n      "if": "[BEFORE_CQI_COX] < 50",\n      "then": "([CQI]/10) * 0.6"\n    }\n  ]\n}`}
                  className="w-full h-56 px-3 py-2 border rounded-lg text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {schemaInputError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {schemaInputError}
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSchemaInputOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplySchema}
                  disabled={!schemaInputText.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-50"
                >
                  Apply CQI Schema
                </button>
              </div>
            </div>
          </div>
        )}

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
                  {coNumbers.length === 0 ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      No Course Outcomes found. Please add Course Outcomes in Exam Management, Course Outcome tab.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {coNumbers.map((co) => {
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
                  )}
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

                {/* CQI Derived Variables — admin-defined CO-wise formulas */}
                <div className="mt-5 border-t pt-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Derived Variables</div>
                      <div className="text-xs text-gray-500">
                        Define CO-wise computed tokens using <code className="font-mono">COx</code> as placeholder (e.g.{' '}
                        <code className="font-mono">BEFORE_CQI_COx</code>). Resolved to{' '}
                        <code className="font-mono">CO1</code>, <code className="font-mono">CO2</code>… at runtime.
                      </div>
                    </div>
                    {props.isEditing && (
                      <button
                        type="button"
                        onClick={() =>
                          props.updateCqi((prev) => ({
                            ...prev,
                            derived_variables: [...(prev.derived_variables || []), { name: '', formula: '' }],
                          }))
                        }
                        className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex items-center gap-2 whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4" /> Add Variable
                      </button>
                    )}
                  </div>

                  {(cqi?.derived_variables || []).length === 0 ? (
                    <div className="text-xs text-gray-400 italic py-2">
                      No derived variables defined. Add one to create CO-wise computed tokens.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(cqi?.derived_variables || []).map((dv, di) => (
                        <div key={di} className="border rounded-lg p-3 bg-purple-50/40">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Variable Name</div>
                              <input
                                value={dv.name}
                                disabled={!props.isEditing}
                                onChange={(e) => {
                                  const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^_+/, '');
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.derived_variables || [])];
                                    next[di] = { ...next[di], name: cleaned };
                                    return { ...prev, derived_variables: next };
                                  });
                                }}
                                placeholder="e.g. BEFORE_CQI_COx"
                                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                              />
                              <div className="text-[10px] text-gray-400 mt-0.5">Use COx as CO-number placeholder</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1 flex items-center justify-between gap-2">
                                <span>Formula</span>
                                {props.isEditing && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      props.onRequestTokenPicker((token) =>
                                        props.updateCqi((prev) => {
                                          const next = [...(prev.derived_variables || [])];
                                          next[di] = { ...next[di], formula: props.appendToken(next[di].formula, token) };
                                          return { ...prev, derived_variables: next };
                                        })
                                      )
                                    }
                                    className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    + Token
                                  </button>
                                )}
                              </div>
                              <textarea
                                value={dv.formula}
                                disabled={!props.isEditing}
                                onChange={(e) =>
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.derived_variables || [])];
                                    next[di] = { ...next[di], formula: e.target.value };
                                    return { ...prev, derived_variables: next };
                                  })
                                }
                                placeholder="e.g. (([SSA1-OBT]+[CIA1-OBT])/50)*3"
                                className="w-full px-3 py-2 border rounded-lg text-sm font-mono min-h-[60px] resize-y"
                              />
                            </div>
                          </div>
                          {props.isEditing && (
                            <div className="flex justify-end mt-2">
                              <button
                                type="button"
                                onClick={() =>
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.derived_variables || [])];
                                    next.splice(di, 1);
                                    return { ...prev, derived_variables: next };
                                  })
                                }
                                className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                            conditions: [...(prev.conditions || []), { title: '', if: '', then: '', color: '#FEE2E2', if_clauses: [{ token: '', rhs: '' }] }],
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
                      const rawClauses = Array.isArray((cond as any)?.if_clauses)
                        ? ((cond as any).if_clauses as CqiIfClause[])
                        : props.parseIfClauses(rawIf);
                      const clauses = (rawClauses || []).map((cl) => normalizeClauseForEditor(cl));

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
                          {props.isEditing && (
                            <div className="flex justify-end mb-2">
                              <button
                                type="button"
                                onClick={() => {
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.conditions || [])];
                                    next.splice(idx, 1);
                                    return { ...prev, conditions: next };
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 text-xs"
                                title="Delete this condition"
                              >
                                <Trash2 className="w-3 h-3" /> Delete Condition
                              </button>
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                            {/* TITLE */}
                            <div className="md:col-span-3">
                              <div className="text-xs text-gray-500 mb-2">Condition Title (used in announce messages)</div>
                              <input
                                value={String((cond as any)?.title || '')}
                                disabled={!props.isEditing}
                                onChange={(e) =>
                                  props.updateCqi((prev) => {
                                    const next = [...(prev.conditions || [])];
                                    const cur: any = next[idx] || {};
                                    cur.title = e.target.value;
                                    next[idx] = cur;
                                    return { ...prev, conditions: next };
                                  })
                                }
                                placeholder="e.g., CO1 below threshold"
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                              />
                            </div>

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
                                        curClauses.push({ token: 'TOTAL_CQI', operator: '<', rhs: '' });
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
                                {clauses.map((cl, ci) => {
                                  const tokenValue = String((cl as any)?.token || '').trim();
                                  // Tokens available in conditions from DB (fallback to 3 core tokens)
                                  const conditionTokens = (props.dbCqiTokens || [])
                                    .filter((t) => t.available_in_condition)
                                    .map((t) => (t.code === 'BEFORE_CQI'
                                      ? { ...t, code: 'BEFORE_CQI_COX', label: 'BEFORE_CQI_COX' }
                                      : t))
                                    // de-dupe by code after normalization
                                    .filter((t, idx, arr) => arr.findIndex((x) => x.code === t.code) === idx);
                                  // Also include derived variables as condition tokens
                                  const derivedVarTokens = (cqi?.derived_variables || [])
                                    .filter((dv) => dv.name)
                                    .map((dv) => ({
                                      id: `dv_${dv.name}`,
                                      code: dv.name,
                                      label: dv.name,
                                      category: 'co_dynamic' as const,
                                      is_dynamic_co: true,
                                      is_system: false,
                                      available_in_condition: true,
                                      available_in_formula: true,
                                      order: -1,
                                    }));
                                  const allConditionTokens = [...derivedVarTokens, ...conditionTokens];
                                  const hasDbTokens = allConditionTokens.length > 0;
                                  // Operators from DB (fallback to 6 core operators)
                                  const operatorOptions = (props.dbCqiOperators || []).length > 0
                                    ? props.dbCqiOperators!
                                    : [
                                        { id: '1', code: '<', symbol: '<', label: 'Less than', order: 1 },
                                        { id: '2', code: '<=', symbol: '≤', label: 'Less than or equal', order: 2 },
                                        { id: '3', code: '>', symbol: '>', label: 'Greater than', order: 3 },
                                        { id: '4', code: '>=', symbol: '≥', label: 'Greater than or equal', order: 4 },
                                        { id: '5', code: '==', symbol: '=', label: 'Equal', order: 5 },
                                        { id: '6', code: '!=', symbol: '≠', label: 'Not equal', order: 6 },
                                      ];
                                  const operatorOptionsNormalized = operatorOptions.map((op) => ({
                                    ...op,
                                    code: normalizeClauseOperator(String(op.code || '').trim()) || String(op.code || '').trim(),
                                  }));
                                  return (
                                  <div key={ci} className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {/* Token selector — dynamic from DB + derived variables */}
                                      {hasDbTokens ? (
                                        <select
                                          disabled={!props.isEditing}
                                          value={tokenValue}
                                          onChange={(e) => {
                                            const nextToken = String(e.target.value || '').trim();
                                            const nextClauses = clauses.map((x, j) => {
                                              if (j !== ci) return x;
                                              // RAW clause: clear operator so it doesn't get serialized.
                                              return nextToken ? { ...x, token: nextToken } : { ...x, token: '', operator: '', rhs: String((x as any).rhs || '') };
                                            });
                                            writeClauses(nextClauses);
                                          }}
                                          className="px-2 py-1.5 border rounded-lg text-xs font-mono bg-white text-gray-700 min-w-[120px]"
                                        >
                                          <option value="">— (RHS only)</option>
                                          {allConditionTokens.map((t) => (
                                            <option key={t.id} value={t.code}>{t.code}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <select
                                          disabled={!props.isEditing}
                                          value={tokenValue}
                                          onChange={(e) => {
                                            const nextToken = String(e.target.value || '').trim();
                                            const nextClauses = clauses.map((x, j) => {
                                              if (j !== ci) return x;
                                              return nextToken ? { ...x, token: nextToken } : { ...x, token: '', operator: '', rhs: String((x as any).rhs || '') };
                                            });
                                            writeClauses(nextClauses);
                                          }}
                                          className="px-2 py-1.5 border rounded-lg text-xs font-mono bg-white text-gray-700"
                                        >
                                          <option value="">— (RHS only)</option>
                                            <option value="BEFORE_CQI_COX">BEFORE_CQI_COX</option>
                                          <option value="AFTER_CQI">AFTER_CQI</option>
                                          <option value="TOTAL_CQI">TOTAL_CQI</option>
                                        </select>
                                      )}

                                      {/* Operator selector */}
                                      <select
                                        disabled={!props.isEditing || !tokenValue}
                                        value={tokenValue ? (normalizeClauseOperator(String((cl as any).operator || '').trim()) || '<') : ''}
                                        onChange={(e) => {
                                          const nextOp = normalizeClauseOperator(String(e.target.value || '<').trim()) || '<';
                                          const nextClauses = clauses.map((x, j) => j === ci ? { ...x, operator: nextOp } : x);
                                          writeClauses(nextClauses);
                                        }}
                                        className="px-2 py-1.5 border rounded-lg text-xs font-mono bg-white text-gray-700 w-16"
                                      >
                                        <option value="" disabled>—</option>
                                        {operatorOptionsNormalized.map((op) => (
                                          <option key={op.id} value={String(op.code || '').trim()} title={op.label}>{op.symbol}</option>
                                        ))}
                                      </select>

                                      {/* RHS value */}
                                      <input
                                        value={cl.rhs}
                                        disabled={!props.isEditing}
                                        onChange={(e) => {
                                          const nextClauses = clauses.map((x, j) => j === ci ? { ...x, rhs: e.target.value } : x);
                                          writeClauses(nextClauses);
                                        }}
                                        placeholder={tokenValue ? 'value e.g. 58' : 'boolean IF expr e.g. ([TOTAL_CQI] < 58)'}
                                        className="flex-1 min-w-[60px] px-2 py-1.5 border rounded-lg text-xs font-mono"
                                      />

                                      {/* Remove clause button (not first clause) */}
                                      {ci > 0 && props.isEditing && (
                                        <button
                                          type="button"
                                          onClick={() => writeClauses(clauses.filter((_, j) => j !== ci))}
                                          className="text-red-400 hover:text-red-600 px-1"
                                          title="Remove clause"
                                        >×</button>
                                      )}
                                    </div>
                                  </div>
                                  );
                                })}
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
                            </div>
                          </div>

                          {/* Cap limit (optional, admin-set per-condition) */}
                          <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={Boolean((cond as any)?.cap_enabled)}
                                  disabled={!props.isEditing}
                                  onChange={(e) => {
                                    props.updateCqi((prev) => {
                                      const next = [...(prev.conditions || [])];
                                      const c: any = { ...(next[idx] || {}) };
                                      c.cap_enabled = e.target.checked;
                                      if (!e.target.checked) delete c.cap_percent;
                                      next[idx] = c;
                                      return { ...prev, conditions: next };
                                    });
                                  }}
                                  className="w-4 h-4 rounded text-blue-600"
                                />
                                <span className="text-xs font-medium text-gray-700">Cap CO total at</span>
                              </label>
                              {Boolean((cond as any)?.cap_enabled) && (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.5"
                                      value={(cond as any)?.cap_percent ?? 58}
                                      disabled={!props.isEditing}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        props.updateCqi((prev) => {
                                          const next = [...(prev.conditions || [])];
                                          const c: any = { ...(next[idx] || {}) };
                                          c.cap_percent = Number.isFinite(v) && v >= 0 ? v : 58;
                                          next[idx] = c;
                                          return { ...prev, conditions: next };
                                        });
                                      }}
                                      className="w-20 px-2 py-1.5 border rounded-lg text-center text-xs font-mono focus:ring-2 focus:ring-blue-400"
                                    />
                                    <span className="text-xs text-gray-600 font-medium">%</span>
                                  </div>
                                  <span className="text-xs text-gray-400">
                                    Students matching this condition: CQI additions stop once the weighted CO total reaches this % of CO-MAX.
                                  </span>
                                </>
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
