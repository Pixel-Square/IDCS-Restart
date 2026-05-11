/**
 * CQI Entry Page (Academic 2.1)
 *
 * Condition/formula-driven: loaded from admin QP Pattern CQI config
 * (ClassType.exam_assignments.cqi). No hardcoded formula.
 *
 * Token [CQI] = faculty-entered value (0-10).
 * Condition evaluation: first matching IF→THEN, else ELSE formula.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, Send, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

type CqiAdminConfig = {
  name: string;
  code: string;
  cos: number[];
  exams?: string[];
  custom_vars?: Array<{ code: string; label?: string; expr: string }>;
  formula: string;
  conditions: Array<{ if: string; then: string; color?: string }>;
  else_formula: string;
};

type COSummary = {
  course_code: string;
  course_name: string;
  co_count: number;
  total_internal_marks: number;
  cqi_config: CqiAdminConfig | null;
  exams: Array<{
    id: string;
    name: string;
    short_name: string;
    weight: number;
    co_weights: Record<string, number>;
    covered_cos: number[];
    weight_per_co: number;
    cia_enabled?: boolean;
    cia_weight?: number;
  }>;
  students: Array<{
    student_id?: string;
    reg_no: string;
    name: string;
    co_totals: number[];
    final_mark: number;
    weighted_marks?: Record<string, number>;
    exam_marks?: Record<string, Record<string, number>>;
  }>;
};

type CqiEntries = Record<string, Record<string, number | null>>;
type CqiDraftResponse = { draft: null | { co_numbers: number[]; threshold_percent: number; entries: Record<string, Record<string, number | null>>; }; updated_at?: string | null; updated_by?: number | null; };
type CqiPublishedResponse = { published: null | { co_numbers: number[]; entries: Record<string, Record<string, number | null>>; published_at?: string | null; published_by?: number | null; }; };

const THRESHOLD_PERCENT = 58;

function normalizeExamCode(input: string) {
  return String(input || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function round2(n: number) { return Math.round(n * 100) / 100; }
function parseEntryNumber(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return clamp(n, 0, 10);
}

// ── Safe expression evaluator ─────────────────────────────────────────────────
type EToken = { t: 'num' | 'op' | 'lp' | 'rp' | 'fn' | 'comma'; v: string; n?: number };

function tokenizeExpr(s: string): EToken[] {
  const tokens: EToken[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === '&' && s[i + 1] === '&') { tokens.push({ t: 'op', v: '&&' }); i += 2; continue; }
    if (s[i] === '|' && s[i + 1] === '|') { tokens.push({ t: 'op', v: '||' }); i += 2; continue; }
    if (/[0-9.]/.test(s[i])) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ t: 'num', v: s.slice(i, j), n: parseFloat(s.slice(i, j)) }); i = j;
    } else if (/[a-z]/i.test(s[i])) {
      let j = i; while (j < s.length && /[a-z0-9]/i.test(s[j])) j++;
      const word = s.slice(i, j).toLowerCase();
      if (word === 'and') tokens.push({ t: 'op', v: '&&' });
      else if (word === 'or') tokens.push({ t: 'op', v: '||' });
      else tokens.push({ t: 'fn', v: word });
      i = j;
    } else if (s[i] === '(') { tokens.push({ t: 'lp', v: '(' }); i++; }
    else if (s[i] === ')') { tokens.push({ t: 'rp', v: ')' }); i++; }
    else if (s[i] === ',') { tokens.push({ t: 'comma', v: ',' }); i++; }
    else if ('<>=!'.includes(s[i])) {
      const two = s.slice(i, i + 2);
      if (['<=', '>=', '==', '!='].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; }
      else { tokens.push({ t: 'op', v: s[i] }); i++; }
    } else if ('+-*/'.includes(s[i])) { tokens.push({ t: 'op', v: s[i] }); i++; }
    else { i++; }
  }
  return tokens;
}

function parseAtom(tokens: EToken[], pos: { i: number }): number {
  const cur = tokens[pos.i];
  if (!cur) return 0;
  if (cur.t === 'num') { pos.i++; return cur.n!; }
  if (cur.t === 'lp') {
    pos.i++;
    const val = parseExprInner(tokens, pos);
    if (tokens[pos.i]?.t === 'rp') pos.i++;
    return val;
  }
  if (cur.t === 'fn') {
    const fn = cur.v; pos.i++;
    if (tokens[pos.i]?.t === 'lp') {
      pos.i++;
      const args: number[] = [];
      while (pos.i < tokens.length && tokens[pos.i]?.t !== 'rp') {
        args.push(parseExprInner(tokens, pos));
        if (tokens[pos.i]?.t === 'comma') pos.i++;
      }
      if (tokens[pos.i]?.t === 'rp') pos.i++;
      if (fn === 'min') return args.length >= 2 ? Math.min(...args) : (args[0] ?? 0);
      if (fn === 'max') return args.length >= 2 ? Math.max(...args) : (args[0] ?? 0);
      if (fn === 'abs') return Math.abs(args[0] ?? 0);
      if (fn === 'round') return Math.round(args[0] ?? 0);
      if (fn === 'sqrt') return Math.sqrt(args[0] ?? 0);
      if (fn === 'floor') return Math.floor(args[0] ?? 0);
      if (fn === 'ceil') return Math.ceil(args[0] ?? 0);
    }
  }
  return 0;
}
function parseUnary(tokens: EToken[], pos: { i: number }): number {
  const cur = tokens[pos.i];
  if (cur?.t === 'op' && cur.v === '-') { pos.i++; return -parseAtom(tokens, pos); }
  if (cur?.t === 'op' && cur.v === '+') { pos.i++; return parseAtom(tokens, pos); }
  return parseAtom(tokens, pos);
}
function parseMulDiv(tokens: EToken[], pos: { i: number }): number {
  let left = parseUnary(tokens, pos);
  while (pos.i < tokens.length) {
    const cur = tokens[pos.i];
    if (cur?.t !== 'op' || !['*', '/'].includes(cur.v)) break;
    pos.i++;
    const right = parseUnary(tokens, pos);
    left = cur.v === '*' ? left * right : (right !== 0 ? left / right : 0);
  }
  return left;
}
function parseAddSub(tokens: EToken[], pos: { i: number }): number {
  let left = parseMulDiv(tokens, pos);
  while (pos.i < tokens.length) {
    const cur = tokens[pos.i];
    if (cur?.t !== 'op' || !['+', '-'].includes(cur.v)) break;
    pos.i++;
    const right = parseMulDiv(tokens, pos);
    left = cur.v === '+' ? left + right : left - right;
  }
  return left;
}
function parseCompare(tokens: EToken[], pos: { i: number }): number {
  let left = parseAddSub(tokens, pos);
  const cur = tokens[pos.i];
  if (cur?.t === 'op' && ['<', '>', '<=', '>=', '==', '!=', '='].includes(cur.v)) {
    const op = cur.v; pos.i++;
    const right = parseAddSub(tokens, pos);
    if (op === '<') return left < right ? 1 : 0;
    if (op === '>') return left > right ? 1 : 0;
    if (op === '<=') return left <= right ? 1 : 0;
    if (op === '>=') return left >= right ? 1 : 0;
    if (op === '==' || op === '=') return left === right ? 1 : 0;
    if (op === '!=') return left !== right ? 1 : 0;
  }
  return left;
}

function parseExprInner(tokens: EToken[], pos: { i: number }): number {
  let left = parseCompare(tokens, pos);
  while (pos.i < tokens.length) {
    const cur = tokens[pos.i];
    if (cur?.t !== 'op' || !['&&', '||'].includes(cur.v)) break;
    const op = cur.v;
    pos.i++;
    const right = parseCompare(tokens, pos);
    if (op === '&&') left = (left !== 0 && right !== 0) ? 1 : 0;
    else left = (left !== 0 || right !== 0) ? 1 : 0;
  }
  return left;
}

function resolveTokenValue(key: string, ctx: Record<string, number>, coNum?: number): number {
  const k = String(key || '').toUpperCase();
  if (!coNum || !Number.isFinite(coNum)) return 0;

  // Treat explicit CO numbers in tokens as placeholders for the CURRENT CO column.
  // Example: CO3-SSA_1-RAW in the CO2 column should resolve as CO2-SSA_1-RAW.
  let m: RegExpMatchArray | null;

  // Per-CO totals placeholders: CO3-TOTAL-RAW / COx-TOTAL-WEIGHT
  m = k.match(/^CO(\d+|X)-TOTAL-(RAW|WEIGHT)$/);
  if (m) {
    const mapped = `CO${coNum}-TOTAL-${m[2]}`;
    const v = ctx[mapped];
    return Number.isFinite(v) ? v : 0;
  }

  // CO-first exam tokens: CO3-SSA_1-RAW/WEIGHT/TOTAL/OBT (CO number is placeholder)
  // Also allow DIFF as legacy alias for obtained.
  m = k.match(/^CO(\d+|X)-([A-Z0-9_]+)-(RAW|WEIGHT|TOTAL|OBT|DIFF)$/);
  if (m) {
    const suffix = m[3] === 'DIFF' ? 'OBT' : m[3];
    const mapped = `CO${coNum}-${m[2]}-${suffix}`;
    const v = ctx[mapped];
    return Number.isFinite(v) ? v : 0;
  }

  const direct = ctx[k];
  if (Number.isFinite(direct)) return direct;

  // Exam-first tokens with explicit CO: SSA_1-CO3-RAW/WEIGHT/TOTAL/OBT (CO number is placeholder)
  // Also allow DIFF as legacy alias for obtained.
  m = k.match(/^([A-Z0-9_]+)-CO(\d+|X)-(RAW|WEIGHT|TOTAL|OBT|DIFF)$/);
  if (m) {
    const suffix = m[3] === 'DIFF' ? 'OBT' : m[3];
    const mapped = `${m[1]}-CO${coNum}-${suffix}`;
    const v = ctx[mapped];
    return Number.isFinite(v) ? v : 0;
  }

  // Exam-scoped shortcuts: SSA_1-TOTAL / SSA_1-OBT should bind to CURRENT CO
  // Also allow DIFF as legacy alias for obtained.
  m = k.match(/^([A-Z0-9_]+)-(TOTAL|OBT|DIFF)$/);
  if (m) {
    const suffix = m[2] === 'DIFF' ? 'OBT' : m[2];
    const mapped1 = `${m[1]}-CO${coNum}-${suffix}`;
    const mapped2 = `CO${coNum}-${m[1]}-${suffix}`;
    const v1 = ctx[mapped1];
    if (Number.isFinite(v1)) return v1;
    const v2 = ctx[mapped2];
    return Number.isFinite(v2) ? v2 : 0;
  }

  return 0;
}

function evalFormula(formula: string, ctx: Record<string, number>, coNum?: number): number {
  if (!formula.trim()) return 0;
  const substituted = formula.replace(/\[([A-Z0-9_-]+)\]/gi, (_, key) => {
    const val = resolveTokenValue(key, ctx, coNum);
    return Number.isFinite(val) ? String(val) : '0';
  });
  try {
    const val = parseExprInner(tokenizeExpr(substituted), { i: 0 });
    return Number.isFinite(val) ? val : 0;
  } catch { return 0; }
}
function evalCondition(condition: string, ctx: Record<string, number>, coNum?: number): boolean {
  return evalFormula(condition, ctx, coNum) !== 0;
}

function extractTokenKeys(text: string): string[] {
  const raw = String(text || '').match(/\[[^\]]+\]/g) || [];
  const keys = raw.map((t) => t.slice(1, -1).trim().toUpperCase()).filter(Boolean);
  return Array.from(new Set(keys));
}

function substituteTokens(text: string, ctx: Record<string, number>, coNum: number): string {
  return String(text || '').replace(/\[([A-Z0-9_-]+)\]/gi, (_, key) => {
    const v = resolveTokenValue(key, ctx, coNum);
    return String(round2(Number(v) || 0));
  });
}

function buildContext(
  coTotals: number[],
  coMaxByCo: number[],
  cqiInput: number | null,
  coNum: number,
  exams: COSummary['exams'],
  examMarks?: Record<string, Record<string, number>>,
  weightedMarks?: Record<string, number>,
  customVars?: Array<{ code: string; label?: string; expr: string }>,
  cqiTotals?: { beforeValue: number; beforePct: number; afterValue: number; afterPct: number },
): Record<string, number> {
  const ctx: Record<string, number> = {};
  const totalRaw = coTotals.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const totalMax = coMaxByCo.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  ctx['TOTAL-RAW'] = round2(totalRaw);
  ctx['TOTAL-WEIGHT'] = round2(totalMax > 0 ? (totalRaw / totalMax) * 100 : 0);
  for (let i = 0; i < coTotals.length; i++) {
    const co = i + 1;
    const raw = round2(coTotals[i] ?? 0);
    const max = coMaxByCo[i] ?? 0;
    ctx[`CO${co}-TOTAL-RAW`] = raw;
    ctx[`CO${co}-TOTAL-WEIGHT`] = round2(max > 0 ? (raw / max) * 100 : 0);
  }
  const curRaw = round2(coTotals[coNum - 1] ?? 0);
  const curMax = coMaxByCo[coNum - 1] ?? 0;
  ctx['CO-RAW'] = curRaw;
  ctx['CO-WEIGHT'] = round2(curMax > 0 ? (curRaw / curMax) * 100 : 0);
  ctx['CO-MAX'] = round2(curMax);
  // Aliases for the "current" CO
  ctx['CO-TOTAL-RAW'] = ctx['CO-RAW'];
  ctx['CO-TOTAL-WEIGHT'] = ctx['CO-WEIGHT'];
  // Faculty-entered CQI value (0-10)
  ctx['CQI'] = cqiInput != null && Number.isFinite(cqiInput) ? cqiInput : 0;
  ctx['X'] = ctx['CQI'];

  // CQI Entry columns (row-level tokens)
  if (cqiTotals) {
    ctx['BEFORE_CQI'] = round2(Number(cqiTotals.beforeValue) || 0);
    ctx['AFTER_CQI'] = round2(Number(cqiTotals.afterValue) || 0);
    ctx['TOTAL_CQI'] = round2(Number(cqiTotals.beforePct) || 0);
  }
  const co_count = coTotals.length;
  for (const ex of exams) {
    const marks = examMarks?.[ex.id] || {};
    const shortCode = (ex.short_name || ex.name || '').replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
    if (!shortCode) continue;
    const covered = Array.isArray(ex.covered_cos) ? ex.covered_cos : [];
    const nCovered = covered.length || 1;
    for (let co = 1; co <= co_count; co++) {
      const raw = Number(marks[`co${co}`] ?? 0);
      ctx[`${shortCode}-CO${co}-RAW`] = raw;
      ctx[`CO${co}-${shortCode}-RAW`] = raw;
      // Obtained (raw) alias
      ctx[`${shortCode}-CO${co}-OBT`] = raw;
      ctx[`CO${co}-${shortCode}-OBT`] = raw;
      // Legacy alias
      ctx[`${shortCode}-CO${co}-DIFF`] = raw;
      ctx[`CO${co}-${shortCode}-DIFF`] = raw;
      const w = weightedMarks ? round2(weightedMarks[`${ex.id}_CO${co}`] ?? 0) : 0;
      ctx[`${shortCode}-CO${co}-WEIGHT`] = w;
      ctx[`CO${co}-${shortCode}-WEIGHT`] = w;

      // Max marks for this CO in this exam assignment (from QP pattern question table / config)
      let maxForCo = 0;
      if (covered.includes(co)) {
        const base = Number(ex.co_weights?.[String(co)] ?? (ex as any)?.co_weights?.[co] ?? ex.weight_per_co ?? 0);
        maxForCo += Number.isFinite(base) ? base : 0;
        if (ex.cia_enabled && ex.cia_weight) {
          const share = Number(ex.cia_weight) / nCovered;
          maxForCo += Number.isFinite(share) ? share : 0;
        }
      }
      maxForCo = round2(maxForCo);
      ctx[`${shortCode}-CO${co}-TOTAL`] = maxForCo;
      ctx[`CO${co}-${shortCode}-TOTAL`] = maxForCo;
    }

    // Shortcuts bind to the CURRENT CO column
    ctx[`${shortCode}-TOTAL`] = round2(Number(ctx[`${shortCode}-CO${coNum}-TOTAL`] ?? 0) || 0);
    ctx[`${shortCode}-OBT`] = round2(Number(ctx[`${shortCode}-CO${coNum}-OBT`] ?? 0) || 0);
    // Legacy alias
    ctx[`${shortCode}-DIFF`] = ctx[`${shortCode}-OBT`];

    // COx placeholder tokens (explicitly requested)
    ctx[`${shortCode}-COX-OBT`] = ctx[`${shortCode}-OBT`];
    ctx[`COX-${shortCode}-OBT`] = ctx[`${shortCode}-OBT`];
    // Legacy placeholders
    ctx[`${shortCode}-COX-DIFF`] = ctx[`${shortCode}-OBT`];
    ctx[`COX-${shortCode}-DIFF`] = ctx[`${shortCode}-OBT`];
  }

  // Custom variables: computed in order, can reference base tokens + previous custom vars.
  const list = Array.isArray(customVars) ? customVars : [];
  for (const cv of list) {
    const code = String(cv?.code || '').trim().toUpperCase();
    const expr = String(cv?.expr || '').trim();
    if (!code || !expr) continue;
    ctx[code] = round2(evalFormula(expr, ctx, coNum));
  }
  return ctx;
}

// ── CQI "task" execution: requires assignment syntax ────────────────────────
function findAssignmentIndex(stmt: string): number {
  // Find an '=' that is NOT part of ==, !=, <=, >=
  for (let i = 0; i < stmt.length; i++) {
    if (stmt[i] !== '=') continue;
    const prev = stmt[i - 1] ?? '';
    const next = stmt[i + 1] ?? '';
    if (prev === '=' || prev === '!' || prev === '<' || prev === '>') continue;
    if (next === '=') continue;
    return i;
  }
  return -1;
}

function scriptHasAssignment(script: string): boolean {
  const chunks = String(script || '').split(/\n|;/g).map(s => s.trim()).filter(Boolean);
  return chunks.some((s) => findAssignmentIndex(s) >= 0);
}

function normalizeVarKey(raw: string): string {
  const s = String(raw || '').trim();
  const unwrapped = s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s;
  return unwrapped.trim().toUpperCase();
}

function syncCurrentCoAliases(ctx: Record<string, number>, coNum: number) {
  const curMax = Number(ctx['CO-MAX'] ?? 0) || 0;
  const curRaw = Number(ctx['CO-RAW'] ?? 0) || 0;
  const curWeight = curMax > 0 ? (curRaw / curMax) * 100 : 0;
  ctx['CO-RAW'] = round2(curRaw);
  ctx['CO-WEIGHT'] = round2(curWeight);
  ctx['CO-TOTAL-RAW'] = ctx['CO-RAW'];
  ctx['CO-TOTAL-WEIGHT'] = ctx['CO-WEIGHT'];
  ctx[`CO${coNum}-TOTAL-RAW`] = ctx['CO-RAW'];
  ctx[`CO${coNum}-TOTAL-WEIGHT`] = ctx['CO-WEIGHT'];
}

function applyAssignment(ctx: Record<string, number>, lhsKey: string, rhsValue: number, coNum: number) {
  const k = lhsKey;
  const coMax = Number(ctx['CO-MAX'] ?? 0) || 0;

  // Support assigning either raw or weight for the current CO.
  if (k === 'CO-WEIGHT' || k === 'CO-TOTAL-WEIGHT') {
    const w = Number.isFinite(rhsValue) ? rhsValue : 0;
    const raw = coMax > 0 ? (w / 100) * coMax : 0;
    ctx['CO-RAW'] = raw;
    syncCurrentCoAliases(ctx, coNum);
    return;
  }

  if (k === 'CO-RAW' || k === 'CO-TOTAL-RAW') {
    ctx['CO-RAW'] = Number.isFinite(rhsValue) ? rhsValue : 0;
    syncCurrentCoAliases(ctx, coNum);
    return;
  }

  // Generic assignment: store as-is.
  ctx[k] = Number.isFinite(rhsValue) ? rhsValue : 0;
}

function executeTaskScript(script: string, ctx: Record<string, number>, coNum: number) {
  const chunks = String(script || '').split(/\n|;/g).map(s => s.trim()).filter(Boolean);
  for (const stmt of chunks) {
    const eq = findAssignmentIndex(stmt);
    if (eq < 0) continue; // "a+b" is considered invalid: ignore.
    const lhsRaw = stmt.slice(0, eq).trim();
    const rhsRaw = stmt.slice(eq + 1).trim();
    const lhsKey = normalizeVarKey(lhsRaw);
    if (!lhsKey) continue;
    const rhsValue = evalFormula(rhsRaw, ctx, coNum);
    applyAssignment(ctx, lhsKey, rhsValue, coNum);
  }
}

function firstNotAttainedCondition(cfg: CqiAdminConfig | null): { if: string; then: string } | null {
  if (!cfg) return null;
  const list = Array.isArray(cfg.conditions) ? cfg.conditions : [];
  for (const c of list) {
    if (String(c.if || '').trim()) return c;
  }
  return null;
}

function firstMatchedCondition(cfg: CqiAdminConfig | null, ctxBase: Record<string, number>, coNum: number) {
  if (!cfg) return null;
  const list = Array.isArray(cfg.conditions) ? cfg.conditions : [];
  for (const c of list) {
    if (!String(c.if || '').trim()) continue;
    if (evalCondition(String(c.if || ''), ctxBase, coNum)) return c;
  }
  return null;
}

function evaluateCqiImpact(
  cfg: CqiAdminConfig,
  ctxBase: Record<string, number>,
  cqiInput: number | null,
  coNum: number,
): { addRaw: number; notAttainedBefore: boolean; notAttainedAfter: boolean } {
  const cond = firstNotAttainedCondition(cfg);
  const notAttainedBefore = !!cond && evalCondition(cond.if, ctxBase, coNum);

  if (!notAttainedBefore) {
    return { addRaw: 0, notAttainedBefore: false, notAttainedAfter: false };
  }

  const ctx = { ...ctxBase };
  ctx['CQI'] = cqiInput != null && Number.isFinite(cqiInput) ? Number(cqiInput) : 0;
  ctx['X'] = ctx['CQI'];
  syncCurrentCoAliases(ctx, coNum);

  // Execute THEN tasks for the first matching condition, else fallback to ELSE.
  let matched = false;
  for (const c of cfg.conditions || []) {
    if (!String(c.if || '').trim()) continue;
    if (evalCondition(c.if, ctxBase, coNum)) {
      executeTaskScript(c.then || '', ctx, coNum);
      matched = true;
      break;
    }
  }
  if (!matched) {
    executeTaskScript(cfg.else_formula || '', ctx, coNum);
  }

  // Clamp to CO max and compute add in RAW space
  const beforeRaw = Number(ctxBase['CO-RAW'] ?? 0) || 0;
  const coMax = Number(ctxBase['CO-MAX'] ?? 0) || 0;
  let afterRaw = Number(ctx['CO-RAW'] ?? beforeRaw) || beforeRaw;
  afterRaw = clamp(afterRaw, 0, coMax > 0 ? coMax : afterRaw);
  const addRaw = round2(Math.max(0, afterRaw - beforeRaw));

  // Re-check not-attained status after applying tasks
  ctx['CO-RAW'] = afterRaw;
  syncCurrentCoAliases(ctx, coNum);
  const notAttainedAfter = !!cond && evalCondition(cond.if, ctx, coNum);

  return { addRaw, notAttainedBefore: true, notAttainedAfter };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CqiEntryPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [coSummary, setCoSummary] = useState<COSummary | null>(null);
  const [draftLog, setDraftLog] = useState<{ updated_at?: string | null; updated_by?: number | null } | null>(null);
  const [publishedLog, setPublishedLog] = useState<{ published_at?: string | null } | null>(null);
  const [entries, setEntries] = useState<CqiEntries>({});
  const [dirty, setDirty] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const isPublished = Boolean(publishedLog?.published_at);
  const tableBlocked = isPublished || publishing;
  const cqiConfig = coSummary?.cqi_config ?? null;
  // A config is only "active" if it has at least one IF and a THEN with assignment, or an ELSE with assignment.
  const hasCqiConfig = Boolean(
    cqiConfig && (
      (cqiConfig.conditions || []).some(c => String(c.if || '').trim() && scriptHasAssignment(String(c.then || '')))
      || scriptHasAssignment(String(cqiConfig.else_formula || ''))
    )
  );

  const consideredExams = useMemo(() => {
    const exams = coSummary?.exams || [];
    const selected = Array.isArray(cqiConfig?.exams)
      ? (cqiConfig!.exams as any[]).map((x) => normalizeExamCode(String(x || ''))).filter(Boolean)
      : [];
    if (selected.length === 0) return exams;
    const sel = new Set(selected);
    return exams.filter((e) => sel.has(normalizeExamCode(e.short_name || e.name || '')));
  }, [coSummary?.exams, cqiConfig?.exams]);

  const allCoNumbers = useMemo(() => {
    const n = coSummary?.co_count ?? 0;
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [coSummary?.co_count]);

  const displayCoNumbers = useMemo(() => {
    const n = coSummary?.co_count ?? 0;
    const configured = (cqiConfig?.cos || [])
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x >= 1 && x <= n)
      .sort((a, b) => a - b);
    return configured.length > 0 ? configured : allCoNumbers;
  }, [allCoNumbers, cqiConfig?.cos, coSummary?.co_count]);

  const coMaxByCo = useMemo(() => {
    const n = coSummary?.co_count ?? 0;
    const out = Array.from({ length: n }, () => 0);
    for (const ex of consideredExams || []) {
      const covered = Array.isArray(ex.covered_cos) ? ex.covered_cos : [];
      for (const coNum of covered) {
        if (!coNum || coNum < 1 || coNum > n) continue;
        const base = Number(ex.co_weights?.[String(coNum)] ?? (ex as any)?.co_weights?.[coNum] ?? ex.weight_per_co ?? 0);
        out[coNum - 1] += Number.isFinite(base) ? base : 0;
      }
      if (ex.cia_enabled && ex.cia_weight) {
        const nCos = covered.length || 1;
        const share = Number(ex.cia_weight) / nCos;
        for (const coNum of covered) {
          if (!coNum || coNum < 1 || coNum > n) continue;
          out[coNum - 1] += Number.isFinite(share) ? share : 0;
        }
      }
    }
    return out.map((v) => round2(v));
  }, [coSummary?.co_count, consideredExams]);

  const loadAll = async () => {
    if (!courseId) return;
    try {
      setLoading(true); setMessage(null);
      const [coRes, draftRes, pubRes] = await Promise.all([
        fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`),
        fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/cqi-draft/`),
        fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/cqi-published/`),
      ]);
      if (!coRes.ok) throw new Error('Failed to load CO summary');
      setCoSummary((await coRes.json()) as COSummary);
      const draftJson = (await draftRes.json().catch(() => ({ draft: null }))) as CqiDraftResponse;
      setDraftLog({ updated_at: draftJson?.updated_at ?? null, updated_by: draftJson?.updated_by ?? null });
      const pubJson = (await pubRes.json().catch(() => ({ published: null }))) as CqiPublishedResponse;
      setPublishedLog({ published_at: pubJson?.published?.published_at ?? null });
      if (pubJson?.published) { setEntries((pubJson.published.entries as any) || {}); setDirty(false); }
      else if (draftJson?.draft?.entries) { setEntries(draftJson.draft.entries); setDirty(false); }
      else { setEntries({}); setDirty(false); }
    } catch (e) { console.error(e); setMessage({ type: 'error', text: 'Failed to load CQI page' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courseId]);

  const saveDraft = async (nextEntries?: CqiEntries) => {
    if (!courseId) return;
    try {
      setSaving(true); setMessage(null);
      const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/cqi-draft/`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ co_numbers: displayCoNumbers, threshold_percent: THRESHOLD_PERCENT, entries: nextEntries ?? entries }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any)?.detail || 'Draft save failed'); }
      const data = await res.json().catch(() => ({}));
      setDraftLog({ updated_at: (data as any)?.updated_at ?? null, updated_by: (data as any)?.updated_by ?? null });
      setDirty(false);
    } catch (e: any) { console.error(e); setMessage({ type: 'error', text: e?.message || 'Failed to save draft' }); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    if (!courseId) return;
    try {
      setPublishing(true); setMessage(null);
      await saveDraft(entries);
      const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/cqi-publish/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, co_numbers: displayCoNumbers }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any)?.detail || 'Publish failed'); }
      const data = await res.json().catch(() => ({}));
      setPublishedLog({ published_at: (data as any)?.published_at ?? null });
      setMessage({ type: 'success', text: 'CQI published' });
    } catch (e: any) { console.error(e); setMessage({ type: 'error', text: e?.message || 'Failed to publish' }); }
    finally { setPublishing(false); }
  };

  const setEntry = (studentId: string, coKey: string, raw: string) => {
    if (tableBlocked) return;
    const val = parseEntryNumber(raw);
    setEntries((prev) => { const next = { ...prev }; next[studentId] = { ...(next[studentId] || {}), [coKey]: val }; return next; });
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty || tableBlocked) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { saveDraft(); }, 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, entries, tableBlocked]);

  const rows = useMemo(() => {
    const students = coSummary?.students || [];
    const exams = consideredExams || [];
    const hasExamFilter = Array.isArray(cqiConfig?.exams) && (cqiConfig!.exams || []).length > 0;
    return students.map((s, idx) => {
      const studentId = String(s.student_id || s.reg_no);
      const totals = s.co_totals || [];
      const co_count = coSummary?.co_count ?? totals.length;

      // If admin selected specific exams for CQI, recompute per-CO totals from exam_marks for display + evaluation.
      let evalTotals = totals;
      if (hasExamFilter && s.exam_marks && exams.length > 0) {
        const next = Array.from({ length: co_count }, () => 0);
        for (const ex of exams) {
          const marks = s.exam_marks?.[ex.id] || {};
          for (let co = 1; co <= co_count; co++) {
            next[co - 1] += Number(marks[`co${co}`] ?? 0);
          }
        }
        evalTotals = next.map((v) => round2(v));
      }

      const perCo = displayCoNumbers.map((coNum) => ({
        coNum,
        value: round2(Number(evalTotals[coNum - 1] ?? 0)),
        max: round2(Number(coMaxByCo[coNum - 1] ?? 0)),
      }));
      const beforeValue = round2(perCo.reduce((sum, c) => sum + c.value, 0));
      const beforeMax = round2(perCo.reduce((sum, c) => sum + c.max, 0));
      const beforePct = beforeMax > 0 ? (beforeValue / beforeMax) * 100 : 0;

      const perCoMeta = perCo.map((c) => {
        const baseTotals = { beforeValue, beforePct, afterValue: beforeValue, afterPct: beforePct };
        const ctxBase = buildContext(
          evalTotals,
          coMaxByCo,
          0,
          c.coNum,
          exams,
          s.exam_marks,
          s.weighted_marks,
          cqiConfig?.custom_vars,
          baseTotals,
        );
        const notAttainedBefore = hasCqiConfig && cqiConfig
          ? evaluateCqiImpact(cqiConfig, ctxBase, null, c.coNum).notAttainedBefore
          : false;
        const matchedCond = hasCqiConfig && cqiConfig && notAttainedBefore
          ? firstMatchedCondition(cqiConfig, ctxBase, c.coNum)
          : null;
        const matchedColor = String((matchedCond as any)?.color || '').trim();
        return { ...c, ctxBase, notAttainedBefore, matchedCond, matchedColor };
      });

      const firstEligible = perCoMeta.find((c) => c.notAttainedBefore && c.matchedCond) || null;
      const totalHighlightColor = firstEligible
        ? (String((firstEligible as any).matchedColor || '').trim() || '#FEE2E2')
        : '';
      let afterValue = beforeValue;
      let delta = 0;
      // Apply CQI only for the admin-selected COs shown in this page.
      for (const c of perCoMeta) {
        if (!c.max || c.max <= 0) continue;
        const input = entries?.[studentId]?.[`co${c.coNum}`] ?? null;
        if (input == null) continue;
        if (!hasCqiConfig || !cqiConfig) continue;
        if (!c.notAttainedBefore || !c.matchedCond) continue;
        const ctxBase = c.ctxBase;
        const impact = evaluateCqiImpact(cqiConfig, ctxBase, Number(input), c.coNum);
        if (Number.isFinite(impact.addRaw) && impact.addRaw > 0) { delta += impact.addRaw; afterValue += impact.addRaw; }
      }
      afterValue = Number.isFinite(afterValue) ? clamp(afterValue, 0, beforeMax || afterValue) : beforeValue;
      const afterPct = beforeMax > 0 ? (afterValue / beforeMax) * 100 : 0;
      return {
        idx,
        studentId,
        regNo: s.reg_no,
        name: s.name,
        perCo: perCoMeta.map(({ ctxBase, matchedCond, ...rest }) => rest),
        perCoMeta,
        beforeValue,
        beforePct,
        afterValue: round2(afterValue),
        afterPct,
        delta: round2(delta),
        coTotals: evalTotals,
        examMarks: s.exam_marks,
        weightedMarks: s.weighted_marks,
        totalHighlightColor,
      };
    });
  }, [coSummary, consideredExams, displayCoNumbers, coMaxByCo, entries, cqiConfig, hasCqiConfig]);

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!coSummary) return <div className="p-6 text-center text-red-600">Failed to load CQI</div>;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/academic-v2/course/${courseId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">CQI Entry</h1>
              {isPublished ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700"><CheckCircle className="w-3.5 h-3.5" /> Published</span>
              ) : dirty ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> Unsaved</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">Auto-save</span>
              )}
            </div>
            <p className="text-gray-500">{coSummary.course_code} — {coSummary.course_name}</p>
            <p className="text-xs text-gray-400 mt-1">
              Draft: {draftLog?.updated_at ? new Date(draftLog.updated_at).toLocaleString() : 'never'}
              {' • '}Published: {publishedLog?.published_at ? new Date(publishedLog.published_at).toLocaleString() : 'never'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={loadAll} className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setDebugOpen((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm ${debugOpen ? 'bg-gray-900 text-white border-gray-900' : 'hover:bg-gray-50'}`}
            title="Show formula + token values per cell"
          >
            Debug
          </button>
          <button onClick={() => saveDraft()} disabled={tableBlocked || saving}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm ${tableBlocked || saving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Sync Draft'}
          </button>
          <button onClick={publish} disabled={tableBlocked || publishing}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white ${tableBlocked || publishing ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
            <Send className="w-4 h-4" /> Publish
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{message.text}</div>
      )}

      {/* CQI formula info */}
      {!hasCqiConfig ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 text-sm">CQI formula not configured</p>
            <p className="text-sm text-amber-700 mt-0.5">Ask admin to set Condition 1 (IF) and a valid assignment task in THEN/ELSE (example: <code className="font-mono">CO-RAW = CO-RAW + X</code>). Marks can still be entered but no add-on will be computed.</p>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex flex-col gap-0.5">
          <span className="font-semibold">Active CQI Formula (admin-defined)</span>
          <div>COs: <span className="font-medium">{displayCoNumbers.map((n) => `CO${n}`).join(', ')}</span></div>
          <div>Exams considered: <span className="font-medium">{(consideredExams || []).map((e) => e.short_name || e.name).filter(Boolean).join(', ') || '—'}</span></div>
          {(cqiConfig!.conditions || []).map((c, i) => (
            <div key={i}>IF&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">{c.if}</code>&nbsp;THEN&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">{c.then}</code></div>
          ))}
          {cqiConfig!.else_formula && <div>ELSE&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">{cqiConfig!.else_formula}</code></div>}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">S.No</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[150px]">Reg No</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[220px]">Name</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-[110px]">BEFORE CQI</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-[110px]">AFTER CQI</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-[120px]">TOTAL</th>
                {displayCoNumbers.map((coNum) => (
                  <th key={coNum} className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-[170px]">CO{coNum}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                return (
                  <tr key={r.studentId} className="hover:bg-blue-50/30">
                    <td className="px-3 py-2 text-gray-400">{r.idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-900">{r.regNo}</td>
                    <td className="px-3 py-2 text-gray-900">{r.name}</td>
                    <td className="px-3 py-2 text-center font-semibold">
                      <div className="text-gray-900">{round2(r.beforeValue)}</div>
                      <div className="text-xs text-gray-500">({round2(r.beforePct)}%)</div>
                    </td>
                    <td className={`px-3 py-2 text-center font-semibold ${r.afterValue > r.beforeValue ? 'bg-green-50' : ''}`}>
                      <div className="text-gray-900">{round2(r.afterValue)}</div>
                      <div className="text-xs text-gray-500">({round2(r.afterPct)}%)</div>
                      {r.delta > 0 && <div className="text-xs text-green-600 mt-0.5">+{round2(r.delta)}</div>}
                    </td>
                    <td className="px-3 py-2 text-center font-bold">
                      <div
                        className="inline-block px-2 py-1 rounded"
                        style={r.totalHighlightColor ? { backgroundColor: r.totalHighlightColor } : undefined}
                      >
                        <div className="text-gray-900 text-sm font-extrabold">{round2(r.beforePct)}%</div>
                        <div className="text-xs text-gray-500 mt-1">{round2(r.beforeValue)}</div>
                      </div>
                    </td>
                    {r.perCo.map((c) => {
                      if (!c.max || c.max <= 0) return <td key={c.coNum} className="px-3 py-2 text-center text-gray-400">—</td>;
                      const coKey = `co${c.coNum}`;
                      const current = entries?.[r.studentId]?.[coKey];
                      const input = current == null ? null : Number(current);
                      const hasInput = input != null && Number.isFinite(input);

                      const cMeta = (r.perCoMeta || []).find((x: any) => x.coNum === c.coNum) as any;
                      const notAttainedBefore = Boolean(cMeta?.notAttainedBefore);
                      const matchedCond = (cMeta?.matchedCond as any) || null;
                      const matchedColor = String(cMeta?.matchedColor || '').trim();
                      const allowInput = !tableBlocked && hasCqiConfig && cqiConfig && notAttainedBefore && !!matchedCond;

                      const ctxBase = buildContext(
                        r.coTotals,
                        coMaxByCo,
                        0,
                        c.coNum,
                        consideredExams,
                        r.examMarks,
                        r.weightedMarks,
                        cqiConfig?.custom_vars,
                        { beforeValue: r.beforeValue, beforePct: r.beforePct, afterValue: r.afterValue, afterPct: r.afterPct },
                      );

                      let addRaw = 0;
                      let notAttainedAfter = notAttainedBefore;
                      if (hasInput && hasCqiConfig && cqiConfig && allowInput) {
                        const impact = evaluateCqiImpact(cqiConfig, ctxBase, input, c.coNum);
                        addRaw = impact.addRaw;
                        notAttainedAfter = impact.notAttainedAfter;
                      }

                      const isCqiAttained = notAttainedBefore && hasInput && !notAttainedAfter;
                      const bg = !hasCqiConfig
                        ? 'bg-amber-50'
                        : (!notAttainedBefore ? 'bg-green-50' : (matchedColor ? '' : (allowInput ? 'bg-red-50' : '')));

                      const debugBlock = (() => {
                        if (!debugOpen || !hasCqiConfig || !cqiConfig) return null;
                        const conds = Array.isArray(cqiConfig.conditions) ? cqiConfig.conditions : [];
                        const condEvaluations = conds
                          .filter((x) => String(x.if || '').trim())
                          .map((x, i) => {
                            const ifRaw = String(x.if || '');
                            const ifSub = substituteTokens(ifRaw, ctxBase, c.coNum);
                            const ok = evalCondition(ifRaw, ctxBase, c.coNum);
                            return { i, ifRaw, ifSub, ok, thenRaw: String(x.then || '') };
                          });
                        const matched = condEvaluations.find((x) => x.ok) || null;
                        const thenScript = matched ? matched.thenRaw : '';
                        const elseScript = String(cqiConfig.else_formula || '');

                        const tokenKeys = Array.from(new Set([
                          ...condEvaluations.flatMap((x) => extractTokenKeys(x.ifRaw)),
                          ...extractTokenKeys(thenScript),
                          ...extractTokenKeys(elseScript),
                        ])).slice(0, 30);

                        const tokenLines = tokenKeys
                          .map((k) => ({ k, v: round2(resolveTokenValue(k, ctxBase, c.coNum)) }))
                          .map(({ k, v }) => `${k}=${Number.isFinite(v) ? v : 0}`)
                          .join('  ');

                        const formatScript = (script: string) => {
                          const lines = String(script || '').split(/\n|;/g).map((s) => s.trim()).filter(Boolean);
                          return lines.slice(0, 6).map((ln) => {
                            const eq = findAssignmentIndex(ln);
                            if (eq < 0) return { raw: ln, sub: substituteTokens(ln, ctxBase, c.coNum) };
                            const lhs = ln.slice(0, eq).trim();
                            const rhs = ln.slice(eq + 1).trim();
                            const rhsSub = substituteTokens(rhs, ctxBase, c.coNum);
                            const rhsVal = round2(evalFormula(rhs, ctxBase, c.coNum));
                            return { raw: ln, sub: `${lhs} = ${rhsSub}  (=${rhsVal})` };
                          });
                        };

                        return (
                          <div className="mt-2 text-[10px] text-gray-700 text-left">
                            <div className="font-semibold mb-1">Debug</div>
                            <div className="space-y-1">
                              {condEvaluations.slice(0, 3).map((e) => (
                                <div key={e.i} className={e.ok ? 'text-emerald-700' : 'text-gray-600'}>
                                  <div>IF{e.i + 1}: <span className="font-mono">{e.ifRaw}</span></div>
                                  <div className="font-mono">→ {e.ifSub} ({e.ok ? 'TRUE' : 'FALSE'})</div>
                                </div>
                              ))}
                              {matched ? (
                                <div>
                                  <div className="font-semibold">THEN</div>
                                  {formatScript(thenScript).map((l, i) => (
                                    <div key={i} className="font-mono">{l.raw} → {l.sub}</div>
                                  ))}
                                </div>
                              ) : (
                                elseScript ? (
                                  <div>
                                    <div className="font-semibold">ELSE</div>
                                    {formatScript(elseScript).map((l, i) => (
                                      <div key={i} className="font-mono">{l.raw} → {l.sub}</div>
                                    ))}
                                  </div>
                                ) : null
                              )}
                              {tokenLines ? (
                                <div className="font-mono text-gray-500 break-words">{tokenLines}{tokenKeys.length >= 30 ? ' …' : ''}</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })();

                      return (
                        <td
                          key={c.coNum}
                          className={`px-3 py-2 text-center ${bg}`}
                          style={matchedColor ? { backgroundColor: matchedColor } : undefined}
                        >
                          <div className="text-sm text-gray-600 mb-1">{round2(c.value)} / {round2(c.max)}</div>
                          {!hasCqiConfig ? (
                            <div>
                              <div className="text-[11px] font-semibold mb-1 text-amber-600">⚠ Formula not set</div>
                              <input
                                type="number" inputMode="decimal"
                                value={current ?? ''}
                                onChange={(e) => setEntry(r.studentId, coKey, e.target.value)}
                                disabled={tableBlocked}
                                placeholder="Enter CQI"
                                className="w-[90px] px-2 py-1 text-sm text-center rounded border border-gray-300 bg-white disabled:bg-gray-100"
                              />
                            </div>
                          ) : !notAttainedBefore ? (
                            <div className="text-xs font-semibold text-green-700">✓ ATTAINED</div>
                          ) : (
                            <div>
                              {isCqiAttained ? (
                                <div className="text-[11px] font-bold mb-1 text-red-600">CQI ATTAINED</div>
                              ) : hasCqiConfig ? (
                                <div className="text-[11px] font-semibold mb-1 text-red-700">
                                  CO Not Attained{hasInput && addRaw > 0 && <span className="ml-1 text-green-700">+{round2(addRaw)}</span>}
                                </div>
                              ) : (
                                <div className="text-[11px] font-semibold mb-1 text-amber-500">⚠ Formula not set</div>
                              )}
                              {allowInput ? (
                                <input
                                  type="number" inputMode="decimal"
                                  value={current ?? ''}
                                  onChange={(e) => setEntry(r.studentId, coKey, e.target.value)}
                                  disabled={tableBlocked}
                                  placeholder="Enter CQI"
                                  className="w-[90px] px-2 py-1 text-sm text-center rounded border border-gray-300 bg-white disabled:bg-gray-100"
                                />
                              ) : (
                                <div className="text-[11px] text-gray-400">—</div>
                              )}
                              {debugBlock}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6 + displayCoNumbers.length} className="px-4 py-10 text-center text-gray-400">No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        CQI input range: 0–10
        {hasCqiConfig && <span className="ml-2 text-blue-500">Formula active (admin-configured)</span>}
      </div>
    </div>
  );
}
