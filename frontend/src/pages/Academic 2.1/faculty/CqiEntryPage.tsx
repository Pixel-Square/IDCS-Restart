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
import { ArrowLeft, RefreshCw, Save, Send, CheckCircle, AlertTriangle, Info, Clock, Edit2, X } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

// token is now any string (not restricted to 3 values) to support DB-backed token registry
type CqiIfClauseToken = string;

// token may be empty string to represent a RAW boolean RHS clause (no [TOKEN] and no operator)
type CqiIfClause = { token: CqiIfClauseToken; operator?: string; rhs: string };

type CqiAdminCondition = {
  title?: string;
  if: string;
  then: string;
  color?: string;
  cap_enabled?: boolean;
  cap_percent?: number;
  // stored by editor UI; evaluator must use it for pinned Before_CQI + AND behavior
  if_clauses?: CqiIfClause[];
};

type CqiAdminConfig = {
  name: string;
  code: string;
  cos: number[];
  exams?: string[];
  custom_vars?: Array<{ code: string; label?: string; expr: string }>;
  formula: string;
  conditions: CqiAdminCondition[];
  else_formula: string;
  // Admin-defined CO-wise derived variables (COx in name is a runtime CO placeholder)
  derived_variables?: Array<{ name: string; formula: string }>;
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
const CQI_CACHE_PREFIX = 'academic_v2_cqi_entries_v1';

function getCqiCacheKeys(examId?: string | null, taId?: string | null) {
  // When examId is provided use ONLY the exam-scoped key so that two different
  // CQI exams under the same course cannot share / pollute each other's cache.
  if (examId) return [`${CQI_CACHE_PREFIX}:exam:${examId}`];
  return taId ? [`${CQI_CACHE_PREFIX}:ta:${taId}`] : [];
}

function readCqiCache(examId?: string | null, taId?: string | null): CqiEntries | null {
  if (typeof window === 'undefined') return null;
  for (const key of getCqiCacheKeys(examId, taId)) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as CqiEntries;
    } catch {
      continue;
    }
  }
  return null;
}

function writeCqiCache(entries: CqiEntries, examId?: string | null, taId?: string | null) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify(entries || {});
  for (const key of getCqiCacheKeys(examId, taId)) {
    window.localStorage.setItem(key, payload);
  }
}

function normalizeExamCode(input: string) {
  return String(input || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeImplicitTokenSums(input: string) {
  return String(input || '').replace(/\]\s+\[/g, '] + [');
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function round2(n: number) { return Math.round(n * 100) / 100; }
function getContrastColor(hex: string): string {
  const h = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#000000';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1a1a1a' : '#ffffff';
}
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

  // Exam-scoped shortcuts: SSA_1-TOTAL / SSA_1-OBT / SSA_1-WEIGHT bind to CURRENT CO
  // Also allow DIFF as legacy alias for obtained.
  m = k.match(/^([A-Z0-9_]+)-(TOTAL|OBT|DIFF|WEIGHT)$/);
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
  const normalizedFormula = normalizeImplicitTokenSums(formula);
  const substituted = normalizedFormula.replace(/\[([A-Z0-9_-]+)\]/gi, (_, key) => {
    const val = resolveTokenValue(key, ctx, coNum);
    return Number.isFinite(val) ? String(val) : '0';
  });
  try {
    const tokens = tokenizeExpr(substituted);
    const pos = { i: 0 };
    const val = parseExprInner(tokens, pos);
    // Mirror backend behavior: malformed expressions must fail instead of
    // silently succeeding on a partially parsed prefix.
    if (pos.i !== tokens.length) return 0;
    return Number.isFinite(val) ? val : 0;
  } catch { return 0; }
}
function evalCondition(condition: string, ctx: Record<string, number>, coNum?: number): boolean {
  return evalFormula(condition, ctx, coNum) !== 0;
}

function extractTokenKeys(text: string): string[] {
  const raw = normalizeImplicitTokenSums(text).match(/\[[^\]]+\]/g) || [];
  const keys = raw.map((t) => t.slice(1, -1).trim().toUpperCase()).filter(Boolean);
  return Array.from(new Set(keys));
}

function substituteTokens(text: string, ctx: Record<string, number>, coNum: number): string {
  return normalizeImplicitTokenSums(text).replace(/\[([A-Z0-9_-]+)\]/gi, (_, key) => {
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
  cqiTotals?: { beforeValue: number; beforePct: number; afterValue: number; afterPct: number; beforeMax: number },
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
  // Aggregate max weight for the current CO from the checked exam assignments in the CQI config.
  // coMaxByCo is already pre-filtered to considered exams (coMaxByCoSelected), so this is a direct alias.
  ctx['COX-EXAMS-MAX-WEIGHT'] = round2(curMax);
  // Aliases for the "current" CO
  ctx['CO-TOTAL-RAW'] = ctx['CO-RAW'];
  ctx['CO-TOTAL-WEIGHT'] = ctx['CO-WEIGHT'];

  // New dynamic CO tokens — percent and before/after totals for condition builder
  ctx['COX_PERCENT'] = ctx['CO-WEIGHT'];
  ctx[`CO${coNum}_PERCENT`] = ctx['CO-WEIGHT'];
  // New token: BEFORE_CQI_COX refers to the current CO's pre-CQI raw value.
  // (Also stored as CO{n} form for convenience.)
  ctx['BEFORE_CQI_COX'] = ctx['CO-RAW'];
  ctx[`BEFORE_CQI_CO${coNum}`] = ctx['CO-RAW'];
  ctx['BEFORE_CQI_COX_TOTAL'] = ctx['CO-RAW'];
  ctx[`BEFORE_CQI_CO${coNum}_TOTAL`] = ctx['CO-RAW'];
  ctx['AFTER_CQI_COX_TOTAL'] = ctx['CO-RAW'];    // Updated after CQI mapping, same origin
  ctx[`AFTER_CQI_CO${coNum}_TOTAL`] = ctx['CO-RAW'];

  // Faculty-entered CQI value (0-10)
  ctx['CQI'] = cqiInput != null && Number.isFinite(cqiInput) ? cqiInput : 0;
  ctx['X'] = ctx['CQI'];

  // CQI Entry columns (row-level tokens)
  if (cqiTotals) {
    ctx['BEFORE_CQI'] = round2(Number(cqiTotals.beforeValue) || 0);
    ctx['AFTER_CQI'] = round2(Number(cqiTotals.afterValue) || 0);
    ctx['TOTAL_CQI'] = round2(Number(cqiTotals.beforePct) || 0);
    ctx['CQI-TOTAL-MAX'] = round2(Number(cqiTotals.beforeMax) || 0);
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
    ctx[`${shortCode}-WEIGHT`] = round2(Number(ctx[`${shortCode}-CO${coNum}-WEIGHT`] ?? 0) || 0);
    // Legacy alias
    ctx[`${shortCode}-DIFF`] = ctx[`${shortCode}-OBT`];
    // Plain shortcode alias: [SSA1] = raw obtained marks for current CO (convenient in derived var formulas)
    ctx[shortCode] = ctx[`${shortCode}-OBT`];

    // COx placeholder tokens (explicitly requested)
    ctx[`${shortCode}-COX-OBT`] = ctx[`${shortCode}-OBT`];
    ctx[`COX-${shortCode}-OBT`] = ctx[`${shortCode}-OBT`];
    ctx[`${shortCode}-COX-WEIGHT`] = ctx[`${shortCode}-WEIGHT`];
    ctx[`COX-${shortCode}-WEIGHT`] = ctx[`${shortCode}-WEIGHT`];
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

/**
 * Evaluates admin-defined derived variables against the current CO context and injects
 * them into the context object IN PLACE.
 *
 * For a variable named  BEFORE_CQI_COx  evaluated at CO=2:
 *   - ctx['BEFORE_CQI_COX']  = computed value  (placeholder form — COx → uppercase COX)
 *   - ctx['BEFORE_CQI_CO2']  = same value       (resolved form for this CO)
 *
 * Variables are evaluated sequentially so later ones can reference earlier results.
 */
function applyDerivedVariables(
  ctx: Record<string, number>,
  derivedVars: Array<{ name: string; formula: string }> | undefined,
  coNum: number,
): void {
  if (!Array.isArray(derivedVars) || derivedVars.length === 0) return;
  for (const dv of derivedVars) {
    const rawName = String(dv.name || '').trim().toUpperCase();
    const formula = String(dv.formula || '').trim();
    if (!rawName || !formula) continue;
    const val = round2(evalFormula(formula, ctx, coNum));
    // Placeholder form: COX (uppercase) stored as-is
    const placeholderKey = rawName.replace(/COX/g, 'COX');
    ctx[placeholderKey] = val;
    // Resolved form: replace COX → CO{n} for this specific CO
    const resolvedKey = rawName.replace(/COX/g, `CO${coNum}`);
    if (resolvedKey !== placeholderKey) ctx[resolvedKey] = val;
  }
}

function evalIfClauses(cond: CqiAdminCondition, ctxBase: Record<string, number>, coNum: number): boolean {
  const clauses = Array.isArray(cond.if_clauses) ? cond.if_clauses : null;
  if (!clauses || clauses.length === 0) {
    const ifRaw = String(cond.if || '');
    if (!ifRaw.trim()) return false;
    return evalCondition(ifRaw, ctxBase, coNum);
  }

  // Pinned Before_CQI is clause[0]. Additional clauses are AND'ed.
  const clauseVals = clauses
    .filter((c) => c && String(c.rhs || '').trim().length > 0)
    .map((c) => {
      const tok = String((c as any).token || '').trim();
      const rhs = String(c.rhs || '').trim();

      // RAW clause: RHS is the whole boolean expression
      if (!tok) {
        return evalCondition(rhs, ctxBase, coNum);
      }

      const tokenExpr = `[${tok}]`;
      // Support explicit operator field (new format) or operator embedded in rhs (legacy)
      const expr = c.operator
        ? `${tokenExpr} ${c.operator} ${rhs}`
        : `${tokenExpr} ${rhs}`;
      return evalCondition(expr, ctxBase, coNum);
    });

  if (clauseVals.length === 0) return false;
  return clauseVals.every(Boolean);
}

function parseConditionClauses(raw: string): CqiIfClause[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  const parts = s.split(/\s*(?:&&|\bAND\b)\s*/i).map((part) => String(part || '').trim()).filter(Boolean);
  const clauses: CqiIfClause[] = [];
  for (const part of parts) {
    const match = part.match(/^\(?\s*\[([A-Za-z0-9_-]+)\]\s*(.*?)\)?\s*$/);
    if (!match) continue;
    const tokenRaw = String(match[1] || '').toUpperCase();
    const token = tokenRaw === 'BEFORE_CQI' ? 'BEFORE_CQI_COX' : tokenRaw;
    const rest = String(match[2] || '').trim().replace(/\)+$/g, '').trim();
    // Extract leading operator into separate field for new format
    const opMatch = rest.match(/^(<=|>=|==|!=|=|<|>)\s*(.*)/);
    if (opMatch) {
      clauses.push({ token, operator: opMatch[1], rhs: opMatch[2].trim() });
    } else {
      clauses.push({ token, rhs: rest });
    }
  }
  return clauses;
}

function normalizeConditionClause(clause: CqiIfClause): CqiIfClause {
  const tokenRaw = String((clause as any)?.token || '').trim().toUpperCase();
  const token = tokenRaw === 'BEFORE_CQI' ? 'BEFORE_CQI_COX' : tokenRaw;
  if (!token) {
    return { token: '', rhs: String((clause as any)?.rhs || '').trim() };
  }
  let operator = String(clause?.operator || '').trim();
  if (operator === '=') operator = '==';
  let rhs = String(clause?.rhs || '').trim();

  const prefixMatch = rhs.match(/^((?:(?:<=|>=|==|!=|=|<|>)\s*)+)(.*)$/);
  if (prefixMatch) {
    const ops = prefixMatch[1].match(/<=|>=|==|!=|=|<|>/g) || [];
    operator = String(ops[ops.length - 1] || operator || '').trim();
    if (operator === '=') operator = '==';
    rhs = String(prefixMatch[2] || '').trim();
  }

  const standaloneExpr = (
    (token === 'BEFORE_CQI' || token === 'BEFORE_CQI_COX') &&
    (!operator || operator === '==' || operator === '=') &&
    /(<=|>=|==|!=|=|<|>)/.test(rhs) &&
    !/^(<=|>=|==|!=|=|<|>)/.test(rhs)
  );

  // Convert legacy standalone expression into RAW clause so it stays stable.
  return standaloneExpr ? { token: '', rhs } : { token, operator, rhs };
}

function hasConditionClauses(cond: CqiAdminCondition | null | undefined): boolean {
  return Boolean(
    Array.isArray(cond?.if_clauses)
    && cond!.if_clauses!.some((clause) => clause && String((clause as any).rhs || '').trim().length > 0)
  );
}

function hasConditionMatcher(cond: CqiAdminCondition | null | undefined): boolean {
  if (!cond) return false;
  return hasConditionClauses(cond) || Boolean(String(cond.if || '').trim());
}

function buildConditionExpressionFromClauses(clauses: CqiIfClause[]): string {
  return (Array.isArray(clauses) ? clauses : [])
    .map((clause) => normalizeConditionClause(clause))
    .map((clause, idx) => {
      const rhs = String(clause?.rhs || '').trim();
      const tokenRaw = String((clause as any)?.token || '').trim();
      if (!rhs) return '';
      if (!tokenRaw) return `(${rhs})`;
      const token = String(tokenRaw || '').trim().toUpperCase();
      const opRaw = String(clause.operator || '').trim();
      const op = opRaw === '=' ? '==' : opRaw;
      // Use explicit operator field when present
      if (op) {
        return `([${clause.token}] ${op} ${rhs})`;
      }
      // Backward-compat for malformed saved clauses: missing operator means
      // threshold comparison for this token.
      if (!/^(<=|>=|==|!=|=|<|>)/.test(rhs)) {
        return `([${clause.token}] < ${rhs})`;
      }
      // Legacy: rhs already contains the operator (e.g. '< 58')
      const isComparatorOnly = /^(<=|>=|==|!=|=|<|>)/.test(rhs);
      return isComparatorOnly ? `([${clause.token}] ${rhs})` : `(${rhs})`;
    })
    .filter(Boolean)
    .join(' && ');
}

function evaluateConditionMatcher(cond: CqiAdminCondition, ctxBase: Record<string, number>, coNum: number): boolean {
  const ifRaw = getConditionExpressionText(cond);
  if (ifRaw) return evalCondition(ifRaw, ctxBase, coNum);
  return false;
}

function getConditionExpressionText(cond: CqiAdminCondition): string {
  if (hasConditionClauses(cond)) {
    return buildConditionExpressionFromClauses(cond.if_clauses || []);
  }
  const parsedClauses = parseConditionClauses(String(cond.if || ''));
  if (parsedClauses.length > 0) {
    return buildConditionExpressionFromClauses(parsedClauses);
  }
  return String(cond.if || '').trim();
}

function firstMatchedCondition(cfg: CqiAdminConfig | null, ctxBase: Record<string, number>, coNum: number) {
  if (!cfg) return null;
  const list = Array.isArray(cfg.conditions) ? cfg.conditions : [];

  for (const c of list) {
    if (!c) continue;
    if (evaluateConditionMatcher(c, ctxBase, coNum)) return c;
  }
  return null;
}

function evaluateCqiOutcome(
  expression: string,
  ctxBase: Record<string, number>,
  cqiInput: number | null,
  coNum: number,
): { addRaw: number; ctxAfter: Record<string, number> } {
  const ctx = { ...ctxBase };
  ctx['CQI'] = cqiInput != null && Number.isFinite(cqiInput) ? Number(cqiInput) : 0;
  ctx['X'] = ctx['CQI'];
  syncCurrentCoAliases(ctx, coNum);

  const beforeRaw = Number(ctxBase['CO-RAW'] ?? 0) || 0;
  const coMax = Number(ctxBase['CO-MAX'] ?? 0) || 0;

  let addRaw = 0;
  if (scriptHasAssignment(expression)) {
    executeTaskScript(expression, ctx, coNum);
    let afterRaw = Number(ctx['CO-RAW'] ?? beforeRaw) || beforeRaw;
    afterRaw = clamp(afterRaw, 0, coMax > 0 ? coMax : afterRaw);
    addRaw = round2(Math.max(0, afterRaw - beforeRaw));
    ctx['CO-RAW'] = afterRaw;
    syncCurrentCoAliases(ctx, coNum);
  } else {
    const mapped = evalFormula(expression, ctx, coNum);
    const maxAdd = coMax > 0 ? Math.max(0, coMax - beforeRaw) : Math.max(0, mapped);
    addRaw = round2(clamp(Number(mapped) || 0, 0, maxAdd));
    ctx['CO-RAW'] = round2(beforeRaw + addRaw);
    syncCurrentCoAliases(ctx, coNum);
  }

  // CQI applies per-CO: treat BEFORE_CQI_COX (or CO-RAW) as the base for this CO.
  const beforeTotal = Number(ctxBase['BEFORE_CQI_COX'] ?? ctxBase['CO-RAW'] ?? 0) || 0;
  const totalMax = Number(ctxBase['CQI-TOTAL-MAX'] ?? 0) || 0;
  const afterTotal = round2(beforeTotal + addRaw);
  ctx['AFTER_CQI'] = afterTotal;
  ctx['TOTAL_CQI'] = round2(totalMax > 0 ? (afterTotal / totalMax) * 100 : Number(ctxBase['TOTAL_CQI'] ?? 0) || 0);

  return { addRaw, ctxAfter: ctx };
}

function evaluateCqiImpact(
  cfg: CqiAdminConfig,
  ctxBase: Record<string, number>,
  cqiInput: number | null,
  coNum: number,
): { addRaw: number; notAttainedBefore: boolean; notAttainedAfter: boolean } {
  const matchedBefore = firstMatchedCondition(cfg, ctxBase, coNum);
  const notAttainedBefore = Boolean(matchedBefore);

  if (!matchedBefore) {
    return { addRaw: 0, notAttainedBefore: false, notAttainedAfter: false };
  }

  const outcomeExpr = String(matchedBefore.then || '').trim() || String(cfg.else_formula || '').trim() || '[CQI]';
  if (!outcomeExpr) {
    return { addRaw: 0, notAttainedBefore: true, notAttainedAfter: true };
  }

  const { addRaw, ctxAfter } = evaluateCqiOutcome(outcomeExpr, ctxBase, cqiInput, coNum);
  const notAttainedAfter = Boolean(firstMatchedCondition(cfg, ctxAfter, coNum));

  return { addRaw, notAttainedBefore: true, notAttainedAfter };
}

function applyPerConditionCap(
  addRaw: number,
  beforeCoValue: number,
  coMaxValue: number,
  matchedCond: any,
): number {
  if (!Number.isFinite(addRaw) || addRaw <= 0) return 0;
  // Cap rule: CQI should not push a CO beyond the admin-defined cap.
  // IMPORTANT: apply cap ONLY when the matched condition explicitly enables it.
  // (Yellow conditions with cap unchecked must not be limited.)
  const capEnabled = matchedCond?.cap_enabled === true;
  if (!capEnabled) return round2(addRaw);

  // If a condition explicitly provides a cap_percent, prefer it; otherwise fall back to 58%.
  const capPct = Number(matchedCond?.cap_percent);
  const effectiveCapPct = Number.isFinite(capPct) && capPct > 0 ? capPct : THRESHOLD_PERCENT;
  if (!Number.isFinite(effectiveCapPct) || effectiveCapPct <= 0) return round2(addRaw);
  if (!Number.isFinite(coMaxValue) || coMaxValue <= 0) return round2(addRaw);

  const capCeiling = (effectiveCapPct / 100) * coMaxValue;
  const maxAdd = Math.max(0, capCeiling - (Number(beforeCoValue) || 0));
  return round2(Math.min(addRaw, maxAdd));
}

function evaluateCqiImpactWithCap(
  cfg: CqiAdminConfig,
  ctxBase: Record<string, number>,
  cqiInput: number | null,
  coNum: number,
  matchedCondHint?: any,
): { addRaw: number; notAttainedBefore: boolean; notAttainedAfter: boolean } {
  const matchedBefore = matchedCondHint ?? firstMatchedCondition(cfg, ctxBase, coNum);
  const notAttainedBefore = Boolean(matchedBefore);
  if (!matchedBefore) return { addRaw: 0, notAttainedBefore: false, notAttainedAfter: false };

  const outcomeExpr = String(matchedBefore.then || '').trim() || String(cfg.else_formula || '').trim() || '[CQI]';
  if (!outcomeExpr) return { addRaw: 0, notAttainedBefore: true, notAttainedAfter: true };

  const beforeCoValue = Number(ctxBase['CO-RAW'] ?? 0) || 0;
  const coMaxValue = Number(ctxBase['CO-MAX'] ?? 0) || 0;

  const out = evaluateCqiOutcome(outcomeExpr, ctxBase, cqiInput, coNum);
  let addRaw = out.addRaw;
  let ctxAfter = out.ctxAfter;

  const capped = applyPerConditionCap(addRaw, beforeCoValue, coMaxValue, matchedBefore);
  if (capped !== addRaw) {
    addRaw = capped;
    const afterCoValue = round2(beforeCoValue + addRaw);
    ctxAfter = { ...ctxBase };
    ctxAfter['CQI'] = cqiInput != null && Number.isFinite(cqiInput) ? Number(cqiInput) : 0;
    ctxAfter['X'] = ctxAfter['CQI'];
    ctxAfter['CO-RAW'] = round2(coMaxValue > 0 ? clamp(afterCoValue, 0, coMaxValue) : afterCoValue);
    syncCurrentCoAliases(ctxAfter, coNum);

    const beforeTotal = Number(ctxBase['BEFORE_CQI_COX'] ?? ctxBase['CO-RAW'] ?? 0) || 0;
    const totalMax = Number(ctxBase['CQI-TOTAL-MAX'] ?? 0) || 0;
    const afterTotal = round2(beforeTotal + addRaw);
    ctxAfter['AFTER_CQI'] = afterTotal;
    ctxAfter['TOTAL_CQI'] = round2(totalMax > 0 ? (afterTotal / totalMax) * 100 : Number(ctxBase['TOTAL_CQI'] ?? 0) || 0);
  }

  const notAttainedAfter = Boolean(firstMatchedCondition(cfg, ctxAfter, coNum));
  return { addRaw, notAttainedBefore: true, notAttainedAfter };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CqiEntryPage() {
  const { courseId: courseIdParam, examId } = useParams<{ courseId?: string; examId?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [taId, setTaId] = useState<string | null>(courseIdParam ?? null);
  const [activeCqiConfig, setActiveCqiConfig] = useState<CqiAdminConfig | null>(null);
  const [coSummary, setCoSummary] = useState<COSummary | null>(null);
  const [notifFlags, setNotifFlags] = useState<{ student_publish_enabled: boolean; cqi_announce_enabled: boolean } | null>(null);
  const [publishControlInfo, setPublishControlInfo] = useState<any | null>(null);
  const [draftLog, setDraftLog] = useState<{ updated_at?: string | null; updated_by?: number | null } | null>(null);
  const [publishedLog, setPublishedLog] = useState<{ published_at?: string | null } | null>(null);
  const [entries, setEntries] = useState<CqiEntries>(() => readCqiCache(examId ?? null, courseIdParam ?? null) || {});
  const [dirty, setDirty] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [announcementNotif, setAnnouncementNotif] = useState<{ studentCount: number; timestamp: number } | null>(null);
  const announcementTimerRef = useRef<any>(null);
  const [announcementTimeLeft, setAnnouncementTimeLeft] = useState(0);
  const saveTimer = useRef<number | null>(null);

  // Request-edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalView, setEditModalView] = useState<'reason' | 'sending' | 'track'>('reason');
  const [editReason, setEditReason] = useState('');
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const isPublished = Boolean(publishedLog?.published_at);

  // CQI-native publish control (from cqi-published endpoint)
  const pc = publishControlInfo as any;
  const publishControlEnabled = Boolean(pc?.publish_control_enabled);
  const pcLocked = isPublished && !(pc?.is_editable);
  const pcHasPending = Boolean(pc?.has_pending_request);
  const editWindowUntilRaw = pc?.edit_window_until as string | null | undefined;
  const editWindowUntilMs = editWindowUntilRaw ? Date.parse(editWindowUntilRaw) : NaN;
  const editWindowRemainingSec = Number.isFinite(editWindowUntilMs) && editWindowUntilMs > Date.now()
    ? Math.ceil((editWindowUntilMs - Date.now()) / 1000)
    : null;
  const hasEditWindow = Boolean(editWindowRemainingSec && editWindowRemainingSec > 0);
  const approvalWorkflowRoles: string[] = Array.isArray(pc?.approval_workflow_roles) ? pc.approval_workflow_roles : [];
  const approvalWorkflowAssignees: Array<{ role: string; user_id: string | null; user_name: string | null }> =
    Array.isArray(pc?.approval_workflow_assignees) ? pc.approval_workflow_assignees : [];

  // After publish: table is editable only if there is an open edit window (when publish control is enabled).
  // If publish control is disabled, CQI should remain editable and allow re-publish anytime.
  const tableBlocked = isPublished && publishControlEnabled && !hasEditWindow;

  const formatRemaining = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const openRemainingSec = (() => {
    const openFrom = pc?.open_from;
    const ms = openFrom ? Date.parse(String(openFrom)) : NaN;
    if (Number.isFinite(ms) && ms > Date.now()) return Math.ceil((ms - Date.now()) / 1000);
    return 0;
  })();
  const dueRemainingSec = (() => {
    const dueAt = pc?.due_at;
    const ms = dueAt ? Date.parse(String(dueAt)) : NaN;
    if (!Number.isFinite(ms)) return null;
    return Math.ceil((ms - Date.now()) / 1000);
  })();
  const cqiConfig = activeCqiConfig ?? (coSummary?.cqi_config ?? null);
  // A config is active if it has at least one condition matcher or an ELSE expression/task.
  // Some existing DB rows have matcher clauses but empty THEN; in that case we still
  // allow CQI entry and treat mapped value as [CQI].
  const hasCqiConfig = Boolean(
    cqiConfig && (
      (cqiConfig.conditions || []).some((c) => hasConditionMatcher(c))
      || Boolean(String(cqiConfig.else_formula || '').trim())
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

  const coMaxByCoSelected = useMemo(() => {
    const n = coSummary?.co_count ?? 0;
    const outOf = Number(coSummary?.total_internal_marks ?? 40) || 40;

    // Match InternalMarkPage weighted-space max denominators for the
    // CQI-selected exam assignments:
    // - InternalMarkPage weighted per CO = (raw / co_max) * co_weight
    // - For "max" we assume raw == co_max, so weighted max per CO becomes co_weight
    //   scaled to the exam's contribution in the final internal-mark outOf space.
    //
    // We approximate scaling like:
    //   examContributionTotal = (exam.weight / 100) * outOf
    // Then distribute that examContributionTotal across covered COs proportional
    // to admin co_weights (fallback to even split when missing/zero).
    const out = Array.from({ length: n }, () => 0);

    for (const ex of consideredExams || []) {
      // Mirror InternalMarkPage selectedCqiExamWeightByCo: fall back to co_weights keys when covered_cos is empty
      const coveredFromList = Array.isArray(ex.covered_cos) && ex.covered_cos.length > 0
        ? ex.covered_cos
        : Object.keys(ex.co_weights || {}).map((k) => Number(k)).filter((v) => Number.isFinite(v) && v >= 1 && v <= n);
      if (!coveredFromList.length) continue;

      const nCovered = coveredFromList.length || 1;

      // InternalMarkPage CO cells use CO-wise "y" that is already in the weighted-space
      // that matches `weighted_marks[${examId}_CO${co}]` rollups.
      // Therefore for CQI denominator we must sum the same effective CO weights directly,
      // without rescaling by course outOf/internal total.
      for (let i = 0; i < coveredFromList.length; i++) {
        const coNum = coveredFromList[i];
        if (!coNum || coNum < 1 || coNum > n) continue;

        const base =
          Number((ex.co_weights as any)?.[String(coNum)] ?? (ex.co_weights as any)?.[coNum] ?? (ex as any)?.weight_per_co ?? 0) || 0;
        const ciaShare = (ex.cia_enabled && ex.cia_weight) ? (Number(ex.cia_weight) / nCovered) : 0;

        out[coNum - 1] += (Number.isFinite(base) ? base : 0) + (Number.isFinite(ciaShare) ? ciaShare : 0);
      }
    }

    return out.map((v) => round2(v));
  }, [coSummary?.co_count, coSummary?.total_internal_marks, consideredExams]);

  const loadAll = async () => {
    try {
      setLoading(true); setMessage(null);
      // Clear stale exam-specific state so a previously loaded CQI's config and
      // entries are never shown while the new exam is still being fetched.
      setActiveCqiConfig(null);
      setCoSummary(null);

      let effectiveTaId = courseIdParam ?? taId;

      if (examId) {
        const exRes = await fetchWithAuth(`/api/academic-v2/exams/${examId}/`);
        if (!exRes.ok) {
          const err = await exRes.json().catch(() => ({}));
          throw new Error((err as any)?.detail || 'Failed to load exam info');
        }
        const examJson = await exRes.json().catch(() => ({}));
        if ((examJson as any)?.publish_control) setPublishControlInfo((examJson as any).publish_control);
        setActiveCqiConfig(((examJson as any)?.cqi_config as any) ?? null);
        if ((examJson as any)?.course_id !== undefined && (examJson as any)?.course_id !== null) {
          effectiveTaId = String((examJson as any).course_id);
          setTaId(effectiveTaId);
        }
      } else {
        setActiveCqiConfig(null);
      }

      if (!effectiveTaId) {
        throw new Error('Missing course id');
      }

      const draftUrl = examId
        ? `/api/academic-v2/exams/${examId}/cqi-draft/`
        : `/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-draft/`;
      const pubUrl = examId
        ? `/api/academic-v2/exams/${examId}/cqi-published/`
        : `/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-published/`;

      const [coRes, draftResult, pubResult, flagsResult] = await Promise.allSettled([
        fetchWithAuth(`/api/academic-v2/faculty/courses/${effectiveTaId}/co-summary/`),
        fetchWithAuth(draftUrl),
        fetchWithAuth(pubUrl),
        fetchWithAuth(`/api/academic-v2/faculty/notification-flags/`),
      ]);

      if (coRes.status !== 'fulfilled') {
        throw new Error('Failed to load CO summary');
      }

      if (!coRes.value.ok) {
        let detail = 'Failed to load CO summary';
        try {
          const err = await coRes.value.json();
          detail = String((err as any)?.detail || detail);
        } catch {
          // Keep generic fallback.
        }
        throw new Error(detail);
      }

      setCoSummary((await coRes.value.json()) as COSummary);

      const draftRes = draftResult.status === 'fulfilled' && draftResult.value.ok ? draftResult.value : null;
      const pubRes = pubResult.status === 'fulfilled' && pubResult.value.ok ? pubResult.value : null;
      const flagsRes = flagsResult.status === 'fulfilled' && flagsResult.value.ok ? flagsResult.value : null;

      const draftJson = (await draftRes?.json().catch(() => ({ draft: null })) ?? { draft: null }) as CqiDraftResponse;
      setDraftLog({ updated_at: draftJson?.updated_at ?? null, updated_by: draftJson?.updated_by ?? null });
      const pubJson = (await pubRes?.json().catch(() => ({ published: null })) ?? { published: null }) as any;
      setPublishedLog({ published_at: pubJson?.published?.published_at ?? null });
      // Store CQI-native publish_control (replaces the old enabled-assessments meta)
      if (pubJson?.publish_control) {
        setPublishControlInfo(pubJson.publish_control);
      }
      try {
        if (flagsRes) {
          const f = await flagsRes.json();
          setNotifFlags({
            student_publish_enabled: Boolean((f as any)?.student_publish_enabled),
            cqi_announce_enabled: Boolean((f as any)?.cqi_announce_enabled),
          });
        }
      } catch { /* ignore */ }
      const cachedEntries = readCqiCache(examId ?? null, effectiveTaId ?? null);
      if (pubJson?.published?.entries) {
        const nextEntries = (pubJson.published.entries as any) || {};
        setEntries(nextEntries);
        writeCqiCache(nextEntries, examId ?? null, effectiveTaId ?? null);
        setDirty(false);
      } else if (draftJson?.draft?.entries) {
        setEntries(draftJson.draft.entries);
        writeCqiCache(draftJson.draft.entries, examId ?? null, effectiveTaId ?? null);
        setDirty(false);
      } else if (cachedEntries) {
        setEntries(cachedEntries);
        setDirty(false);
      } else {
        setEntries({});
        setDirty(false);
      }
    } catch (e: any) { console.error(e); setMessage({ type: 'error', text: e?.message || 'Failed to load CQI page' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [examId, courseIdParam]);

  const saveDraft = async (nextEntries?: CqiEntries) => {
    const effectiveTaId = courseIdParam ?? taId;
    if (!examId && !effectiveTaId) return;
    try {
      setSaving(true); setMessage(null);
      const url = examId
        ? `/api/academic-v2/exams/${examId}/cqi-draft/`
        : `/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-draft/`;
      const res = await fetchWithAuth(url, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ co_numbers: displayCoNumbers, threshold_percent: THRESHOLD_PERCENT, entries: nextEntries ?? entries }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any)?.detail || 'Draft save failed'); }
      const data = await res.json().catch(() => ({}));
      setDraftLog({ updated_at: (data as any)?.updated_at ?? null, updated_by: (data as any)?.updated_by ?? null });
      writeCqiCache(nextEntries ?? entries, examId ?? null, effectiveTaId ?? null);
      setDirty(false);
    } catch (e: any) { console.error(e); setMessage({ type: 'error', text: e?.message || 'Failed to save draft' }); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    const effectiveTaId = courseIdParam ?? taId;
    if (!examId && !effectiveTaId) return;
    try {
      setPublishing(true); setMessage(null);
      await saveDraft(entries);

      if (examId) {
        const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-publish/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries, co_numbers: displayCoNumbers }),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any)?.detail || 'Publish failed'); }
        const data = await res.json().catch(() => ({}));
        setPublishedLog({ published_at: (data as any)?.published_at ?? null });
        writeCqiCache(entries, examId ?? null, effectiveTaId ?? null);
        try {
          const exRes = await fetchWithAuth(`/api/academic-v2/exams/${examId}/`);
          if (exRes.ok) {
            const exJson = await exRes.json().catch(() => ({}));
            if ((exJson as any)?.publish_control) setPublishControlInfo((exJson as any).publish_control);
          }
        } catch { /* ignore */ }
      } else {
        const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-publish/`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries, co_numbers: displayCoNumbers }),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any)?.detail || 'Publish failed'); }
        const data = await res.json().catch(() => ({}));
        setPublishedLog({ published_at: (data as any)?.published_at ?? null });
        writeCqiCache(entries, examId ?? null, effectiveTaId ?? null);
        if ((data as any)?.publish_control) setPublishControlInfo((data as any).publish_control);
      }

      setMessage({ type: 'success', text: 'CQI published' });
    } catch (e: any) { console.error(e); setMessage({ type: 'error', text: e?.message || 'Failed to publish' }); }
    finally { setPublishing(false); }
  };

  const openRequestEditModal = () => {
    setEditModalError(null);
    setEditModalView('reason');
    setEditReason('');
    setEditModalOpen(true);
  };

  const openTrackModal = async () => {
    setEditModalError(null);
    // Refresh published info to get latest publish_control
    try {
      if (examId) {
        const [exRes, pubRes] = await Promise.all([
          fetchWithAuth(`/api/academic-v2/exams/${examId}/`),
          fetchWithAuth(`/api/academic-v2/exams/${examId}/cqi-published/`),
        ]);
        if (exRes.ok) {
          const exJson = await exRes.json().catch(() => ({}));
          if ((exJson as any)?.publish_control) setPublishControlInfo((exJson as any).publish_control);
        }
        if (pubRes.ok) {
          const data = await pubRes.json().catch(() => ({}));
          if (data?.publish_control) setPublishControlInfo(data.publish_control);
          if (data?.published?.published_at !== undefined) setPublishedLog({ published_at: data.published?.published_at ?? null });
        }
      } else {
        const effectiveTaId = courseIdParam ?? taId;
        if (effectiveTaId) {
          const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-published/`);
          if (res.ok) {
            const data = await res.json();
            if (data?.publish_control) setPublishControlInfo(data.publish_control);
            if (data?.published?.published_at !== undefined) setPublishedLog({ published_at: data.published?.published_at ?? null });
          }
        }
      }
    } catch (e) { console.error(e); }
    setEditModalView('track');
    setEditModalOpen(true);
  };

  const cancelEditRequest = async () => {
    const effectiveTaId = courseIdParam ?? taId;
    if (!examId && !effectiveTaId) return;
    if (!window.confirm('Are you sure you want to cancel this edit request?')) return;
    try {
      setProcessingAction('cancel_edit');
      if (examId) {
        const reqId = pc?.pending_request?.id || pc?.pending_request_id || null;
        if (!reqId) throw new Error('No pending edit request found.');
        const res = await fetchWithAuth(`/api/academic-v2/edit-requests/${reqId}/cancel/`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any)?.detail || (err as any)?.error || 'Failed to cancel request'); }
        try {
          const exRes = await fetchWithAuth(`/api/academic-v2/exams/${examId}/`);
          if (exRes.ok) {
            const exJson = await exRes.json().catch(() => ({}));
            if ((exJson as any)?.publish_control) setPublishControlInfo((exJson as any).publish_control);
          }
        } catch { /* ignore */ }
      } else {
        const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-cancel-edit-request/`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as any)?.detail || 'Failed to cancel request'); }
        const data = await res.json().catch(() => ({}));
        if (data?.publish_control) setPublishControlInfo(data.publish_control);
      }
      setEditModalError(null);
      setEditReason('');
      setEditModalView('reason');
    } catch (e) { alert(e instanceof Error ? e.message : 'Error canceling request'); }
    finally { setProcessingAction(null); }
  };

  const submitEditRequest = async () => {
    const effectiveTaId = courseIdParam ?? taId;
    if (!examId && !effectiveTaId) return;
    const reason = String(editReason || '').trim();
    if (!reason) { setEditModalError('Reason is required.'); return; }
    try {
      setEditModalError(null);
      setEditModalView('sending');
      setProcessingAction('request_edit');
      const url = examId
        ? `/api/academic-v2/exams/${examId}/request-edit/`
        : `/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-request-edit/`;
      const res = await fetchWithAuth(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error((errJson as any)?.detail || (errJson as any)?.error || 'Request failed');
      }
      const data = await res.json().catch(() => ({}));
      if ((data as any)?.publish_control) setPublishControlInfo((data as any).publish_control);
      setEditModalView('track');
    } catch (e) {
      setEditModalView('reason');
      setEditModalError(e instanceof Error ? e.message : 'Failed to request edit');
    } finally { setProcessingAction(null); }
  };

  const announce = async () => {
    const effectiveTaId = courseIdParam ?? taId;
    // Announce currently uses course-level CQI condition evaluation; for multi-CQI
    // exam pages it can be misleading, so keep it on legacy route only.
    if (examId) {
      setMessage({ type: 'error', text: 'CQI announce is available from the course CQI page only.' });
      return;
    }
    if (!effectiveTaId) return;
    try {
      setAnnouncing(true);
      setMessage(null);
      
      const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${effectiveTaId}/cqi-announce/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      let data: any = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error('Failed to parse response:', parseErr);
        data = {};
      }
      
      if (!res.ok) {
        const errorMsg = data?.detail || data?.error || `HTTP ${res.status}`;
        throw new Error(String(errorMsg));
      }
      
      const sent = Number(data?.sent ?? 0);
      const matched = Number(data?.matched ?? 0);
      const successMsg = sent > 0
        ? `Announced to ${sent} student${sent !== 1 ? 's' : ''}`
        : matched > 0
        ? `Found ${matched} student${matched !== 1 ? 's' : ''} in CQI table, but no notifications were sent`
        : 'No CQI students found';
      setMessage({ type: sent > 0 || matched > 0 ? 'success' : 'error', text: successMsg });
      
      // Show floating announcement notification only if students were reached
      if (sent > 0) {
        setAnnouncementNotif({ studentCount: sent, timestamp: Date.now() });
        setAnnouncementTimeLeft(6000); // 6 seconds
        
        // Clear any existing timer
        if (announcementTimerRef.current) clearInterval(announcementTimerRef.current);
        
        // Start countdown timer
        announcementTimerRef.current = setInterval(() => {
          setAnnouncementTimeLeft((prev) => {
            const next = prev - 100;
            if (next <= 0) {
              if (announcementTimerRef.current) clearInterval(announcementTimerRef.current);
              setAnnouncementNotif(null);
              return 0;
            }
            return next;
          });
        }, 100);
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e) || 'Failed to announce';
      console.error('Announce error:', errorMsg);
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setAnnouncing(false);
    }
  };

  const setEntry = (studentId: string, coKey: string, raw: string) => {
    if (tableBlocked) return;
    const val = parseEntryNumber(raw);
    setEntries((prev) => {
      const next = { ...prev };
      next[studentId] = { ...(next[studentId] || {}), [coKey]: val };
      writeCqiCache(next, examId ?? null, taId ?? courseIdParam ?? null);
      return next;
    });
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
      // CQI Entry must be computed in INTERNALMARKPage *weighted* space.
      // InternalMarkPage uses `weighted_marks` for per-CO weighted contributions.
      const totals = s.co_totals || [];
      const co_count = coSummary?.co_count ?? totals.length;

      // Weighted obtained per CO (sum across considered exam assignments, using InternalMarkPage logic)
      // For normal exam components: weighted_marks[`${examId}_CO${co}`]
      // For CIA split columns: weighted_marks[`${examId}_exam_CO${co}`]
      let evalTotals = Array.from({ length: co_count }, (_, i) => totals[i] ?? 0);
      if (s.weighted_marks && s.weighted_marks && exams.length > 0) {
        const next = Array.from({ length: co_count }, () => 0);
        for (const ex of exams) {
          // Regular per-CO weighted marks
          for (let co = 1; co <= co_count; co++) {
            const key = `${ex.id}_CO${co}`;
            const v = Number(s.weighted_marks?.[key] ?? 0);
            next[co - 1] += Number.isFinite(v) ? v : 0;

            // CIA split weighted contributions are already reflected in weighted_marks[`${ex.id}_CO${co}`]
            // (per InternalMarkPage CO weighted space). Do not double-count exam split columns here.
          }
        }
        evalTotals = next.map((v) => round2(v));
      }

      // IMPORTANT:
      // BEFORE CQI must roll up exactly from the CO column "x/y":
      // - x  => perCo.value
      // - y  => perCo.max
      const perCo = displayCoNumbers.map((coNum) => {
        const x = Number(evalTotals[coNum - 1] ?? 0);
        const y = Number(coMaxByCoSelected[coNum - 1] ?? 0);
        return {
          coNum,
          value: round2(x),
          max: round2(y),
        };
      });

      const beforeValueRaw = perCo.reduce((sum, c) => sum + (Number.isFinite(c.value) ? c.value : 0), 0);
      const beforeMaxRaw = perCo.reduce((sum, c) => sum + (Number.isFinite(c.max) ? c.max : 0), 0);

      const beforeValue = round2(beforeValueRaw);
      const beforeMax = round2(beforeMaxRaw);
      const beforePct = beforeMaxRaw > 0 ? (beforeValueRaw / beforeMaxRaw) * 100 : 0;

      const perCoMeta = perCo.map((c) => {
        const baseTotals = { beforeValue, beforePct, afterValue: beforeValue, afterPct: beforePct };
        const ctxBase = buildContext(
          evalTotals,
          coMaxByCoSelected,
          0,
          c.coNum,
          exams,
          s.exam_marks,
          s.weighted_marks,
          cqiConfig?.custom_vars,
          { ...baseTotals, beforeMax },
        );
        // Apply derived variables to context (adds BEFORE_CQI_COX, BEFORE_CQI_CO1, etc.)
        applyDerivedVariables(ctxBase, cqiConfig?.derived_variables, c.coNum);
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

      const appliedAdds: Record<number, number> = {};
      // Apply CQI only for the admin-selected COs shown in this page.
      for (const c of perCoMeta) {
        if (!c.max || c.max <= 0) continue;
        const input = entries?.[studentId]?.[`co${c.coNum}`] ?? null;
        if (input == null) continue;
        if (!hasCqiConfig || !cqiConfig) continue;
        if (!c.notAttainedBefore || !c.matchedCond) continue;
        const ctxBase = c.ctxBase;
        const impact = evaluateCqiImpactWithCap(cqiConfig, ctxBase, Number(input), c.coNum, c.matchedCond);
        const desiredAdd = impact.addRaw;
        if (!Number.isFinite(desiredAdd) || desiredAdd <= 0) continue;

        const applied = round2(desiredAdd);
        if (applied > 0) {
          appliedAdds[c.coNum] = applied;
          delta += applied;
          afterValue += applied;
        }
      }
      // Apply an overall total cap when any matched condition has cap_enabled.
      // Per-CO caps (applyPerConditionCap) prevent each individual CO from exceeding capPct% of
      // its own max, but COs that were ALREADY above cap still contribute their full (pre-CQI)
      // value to the total — so afterValue can still exceed capPct% × beforeMax.
      // The total cap ensures the displayed AFTER CQI value never exceeds the cap ceiling.
      const anyCapCond = perCoMeta.find((c: any) => c.matchedCond?.cap_enabled === true);
      if (anyCapCond && beforeMax > 0) {
        const _capPct = Number((anyCapCond as any).matchedCond?.cap_percent);
        const _effectiveCapPct = Number.isFinite(_capPct) && _capPct > 0 ? _capPct : THRESHOLD_PERCENT;
        const totalCapCeiling = round2((_effectiveCapPct / 100) * beforeMax);
        if (afterValue > totalCapCeiling) {
          afterValue = totalCapCeiling;
          delta = round2(afterValue - beforeValue);
        }
      }
      afterValue = Number.isFinite(afterValue) ? clamp(afterValue, 0, beforeMax || afterValue) : beforeValue;
      const afterPct = beforeMax > 0 ? (afterValue / beforeMax) * 100 : 0;

      const perCoUi = perCoMeta.map((c) => {
        const appliedAdd = Number(appliedAdds[c.coNum] ?? 0) || 0;
        const input = entries?.[studentId]?.[`co${c.coNum}`] ?? null;

        let notAttainedAfter = c.notAttainedBefore;
        if (hasCqiConfig && cqiConfig && input != null && c.notAttainedBefore && c.matchedCond) {
          const ctxAfter = { ...c.ctxBase };
          const afterCoValue = round2((Number(ctxAfter['CO-RAW'] ?? c.value) || 0) + appliedAdd);
          ctxAfter['CQI'] = Number(input) || 0;
          ctxAfter['X'] = ctxAfter['CQI'];
          ctxAfter['CO-RAW'] = c.max > 0 ? clamp(afterCoValue, 0, c.max) : afterCoValue;
          syncCurrentCoAliases(ctxAfter, c.coNum);
          // Override row-level totals so conditions using TOTAL_CQI see the current row outcome.
          ctxAfter['AFTER_CQI'] = round2(afterValue);
          ctxAfter['TOTAL_CQI'] = round2(afterPct);
          notAttainedAfter = Boolean(firstMatchedCondition(cqiConfig, ctxAfter, c.coNum));
        }

        const { ctxBase, matchedCond, ...rest } = c as any;
        return { ...rest, input, appliedAdd: round2(appliedAdd), notAttainedAfter };
      });

      return {
        idx,
        studentId,
        regNo: s.reg_no,
        name: s.name,
        perCo: perCoUi,
        perCoMeta,
        beforeValue,
        beforeMax,
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
  }, [coSummary, consideredExams, displayCoNumbers, coMaxByCoSelected, entries, cqiConfig, hasCqiConfig]);

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!coSummary) return <div className="p-6 text-center text-red-600">Failed to load CQI</div>;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      {/* Floating Announcement Notification */}
      {announcementNotif && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-lg p-4 md:left-auto md:right-4 md:w-96">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="font-semibold text-green-900">CQI Announcement Sent</div>
              <div className="text-sm text-green-800 mt-1">Notification sent to {announcementNotif.studentCount} student{announcementNotif.studentCount !== 1 ? 's' : ''} via WhatsApp</div>
            </div>
            <button
              onClick={() => {
                if (announcementTimerRef.current) clearInterval(announcementTimerRef.current);
                setAnnouncementNotif(null);
              }}
              className="text-green-500 hover:text-green-700 font-bold text-lg leading-none"
            >
              ×
            </button>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1 bg-green-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all linear"
              style={{ width: `${Math.max(0, (announcementTimeLeft / 6000) * 100)}%`, transitionDuration: '100ms' }}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const effectiveTaId = courseIdParam ?? taId;
              if (effectiveTaId) navigate(`/academic-v2/course/${effectiveTaId}`);
              else navigate('/academic-v2/courses');
            }}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${draftLog?.updated_at ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'}`}>
                Last draft: {draftLog?.updated_at ? new Date(draftLog.updated_at).toLocaleString() : 'never'}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${publishedLog?.published_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {publishedLog?.published_at ? 'Published' : 'Not published'}
              </span>
              {publishedLog?.published_at && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium bg-emerald-50 text-emerald-600">
                  {new Date(publishedLog.published_at).toLocaleString()}
                </span>
              )}
            </div>
            {publishControlInfo?.meta && (
              <p className="text-xs text-gray-400 mt-1">
                Publish window: {String((publishControlInfo as any)?.meta?.window_state || 'UNKNOWN')} {(publishControlInfo as any)?.meta?.due_at ? `• Due: ${new Date((publishControlInfo as any).meta.due_at).toLocaleString()}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Publish control timers + toolbar (MarkEntry-style) */}
      <div className="bg-white rounded-xl shadow-sm border">
        {(openRemainingSec > 0 || dueRemainingSec !== null || hasEditWindow) && (
          <div className="px-4 py-2 border-b bg-blue-50/40 text-sm flex flex-wrap items-center gap-4">
            {openRemainingSec > 0 && (
              <span className="inline-flex items-center gap-1.5 text-blue-700">
                <AlertTriangle className="w-4 h-4" />
                Opens in <strong>{formatRemaining(openRemainingSec)}</strong>
              </span>
            )}
            {dueRemainingSec !== null && (
              <span className={`inline-flex items-center gap-1.5 ${dueRemainingSec <= 0 ? 'text-red-700' : 'text-gray-700'}`}>
                <Clock className="w-4 h-4" />
                {dueRemainingSec <= 0 ? 'Due time passed' : <>Due in <strong>{formatRemaining(dueRemainingSec)}</strong></>}
              </span>
            )}
            {hasEditWindow && (
              <span className="inline-flex items-center gap-1.5 text-teal-700">
                <Edit2 className="w-4 h-4" />
                Edit window ends in <strong>{formatRemaining(editWindowRemainingSec || 0)}</strong>
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <button onClick={loadAll} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setDebugOpen((v) => !v)}
            className={`px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1.5 ${debugOpen ? 'bg-gray-900 text-white border-gray-900' : 'hover:bg-gray-50'}`}
            title="Show formula + token values per cell"
          >
            Debug
          </button>

          <div className="flex-1" />

          <button
            onClick={() => saveDraft()}
            disabled={tableBlocked || saving}
            className={`px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1.5 ${tableBlocked || saving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Sync Draft'}
          </button>

          {/* Publish / Request Edit / Track */}
          {!isPublished ? (
            <button
              onClick={publish}
              disabled={publishing}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 text-white ${publishing ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              <Send className="w-3.5 h-3.5" /> {publishing ? 'Publishing…' : 'Publish'}
            </button>
          ) : !publishControlEnabled ? (
            // Publish control disabled → allow re-publish any time
            <button
              onClick={publish}
              disabled={publishing}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 text-white ${publishing ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              <Send className="w-3.5 h-3.5" /> {publishing ? 'Publishing…' : 'Re-Publish'}
            </button>
          ) : hasEditWindow ? (
            // Has an approved edit window — allow re-publish
            <button
              onClick={publish}
              disabled={publishing}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 text-white ${publishing ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              <Send className="w-3.5 h-3.5" /> {publishing ? 'Publishing…' : 'Re-Publish'}
            </button>
          ) : pcHasPending ? (
            // Already submitted, show Track
            <button
              onClick={openTrackModal}
              className="px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 bg-red-600 text-white hover:bg-red-700"
            >
              <Clock className="w-3.5 h-3.5" /> Track
            </button>
          ) : (
            // Published + locked + no pending → faculty can request edit
            <button
              onClick={openRequestEditModal}
              disabled={processingAction === 'request_edit'}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 text-white ${processingAction === 'request_edit' ? 'bg-gray-300 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700'}`}
            >
              {processingAction === 'request_edit' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Edit2 className="w-3.5 h-3.5" />}
              Request Edit
            </button>
          )}

          {Boolean(notifFlags?.cqi_announce_enabled) && !examId && (
            <button
              onClick={announce}
              disabled={announcing || publishing}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 text-white ${
                announcing || publishing
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
              title="Send CQI announcement to students who match any condition"
            >
              <Send className="w-3.5 h-3.5" /> {announcing ? 'Announcing…' : 'Announce'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{message.text}</div>
      )}

      {/* ── Request Edit / Track Modal ──────────────────────────────────────────── */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm text-gray-500">CQI Entry</div>
                <div className="text-lg font-semibold text-gray-900">
                  {editModalView === 'track' ? 'Track Edit Request' : 'Request Edit'}
                </div>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editModalView === 'reason' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter reason for requesting edit access…"
                    />
                    <div className="text-xs text-gray-500 mt-1">This reason will be visible to approvers.</div>
                  </div>
                  {editModalError && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editModalError}</div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button
                      onClick={submitEditRequest}
                      disabled={processingAction === 'request_edit'}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                </>
              )}

              {editModalView === 'sending' && (
                <div className="py-10 text-center space-y-3">
                  <div className="text-lg font-semibold text-gray-900">Sending request…</div>
                  <div className="text-sm text-gray-500">Please wait while we submit your request.</div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}

              {editModalView === 'track' && (() => {
                const pr = pc?.pending_request;
                const wf = approvalWorkflowRoles;
                const wfAssignees = approvalWorkflowAssignees;
                const statusStr = String(pr?.status || '').toUpperCase();
                const history: any[] = Array.isArray(pr?.approval_history) ? pr.approval_history : [];
                const currentStage = Math.max(1, Number(pr?.current_stage || 1));
                const pendingStatuses = new Set(['PENDING', 'HOD_PENDING', 'IQAC_PENDING']);

                const assigneeByRole = new Map(
                  wfAssignees.filter((a) => a && a.role).map((a) => [String(a.role).toUpperCase(), a] as const)
                );

                const liveExpiresSec = (() => {
                  const ea = pr?.expires_at;
                  if (!ea) return null;
                  const ms = Date.parse(ea);
                  if (!Number.isFinite(ms)) return null;
                  return Math.max(0, Math.ceil((ms - Date.now()) / 1000));
                })();
                const expiresSec = liveExpiresSec !== null ? liveExpiresSec
                  : (typeof pr?.expires_remaining_seconds === 'number' ? pr.expires_remaining_seconds : null);

                const requiredRole = (() => {
                  const rr = pr?.required_role ? String(pr.required_role).toUpperCase() : '';
                  if (rr) return rr;
                  const idx = Math.max(0, currentStage - 1);
                  if (wf[idx]) return String(wf[idx]).toUpperCase();
                  if (statusStr === 'HOD_PENDING') return 'HOD';
                  if (statusStr === 'IQAC_PENDING') return 'IQAC';
                  return '';
                })();

                const stageDoneRoles = new Set(
                  wf.slice(0, Math.max(0, currentStage - 1)).map((r) => String(r || '').toUpperCase()).filter(Boolean)
                );
                const approvedRoles = new Set(
                  history.filter((h: any) => String(h?.action || '').toUpperCase() === 'APPROVED')
                    .map((h: any) => String(h?.role || '').toUpperCase()).filter(Boolean)
                );

                const steps = [
                  { key: 'FACULTY', label: 'Faculty' },
                  ...wf.map((r) => {
                    const role = String(r).toUpperCase();
                    const a = assigneeByRole.get(role);
                    return { key: role, label: role, sublabel: a?.user_name || '' };
                  }),
                  { key: 'APPROVED', label: 'Approved' },
                ];

                const isDone = (key: string) => {
                  if (key === 'FACULTY') return true;
                  if (key === 'APPROVED') return statusStr === 'APPROVED';
                  if (statusStr === 'APPROVED') return true;
                  if (approvedRoles.has(key) || stageDoneRoles.has(key)) return true;
                  return false;
                };

                const currentKey = (() => {
                  if (statusStr === 'APPROVED') return 'APPROVED';
                  if (statusStr === 'REJECTED') return requiredRole || (wf[0] ? String(wf[0]).toUpperCase() : 'FACULTY');
                  if (pendingStatuses.has(statusStr)) return requiredRole || (wf[Math.max(0, currentStage - 1)] ? String(wf[Math.max(0, currentStage - 1)]).toUpperCase() : 'FACULTY');
                  return 'FACULTY';
                })();

                const nextApprover = (() => {
                  const na = pr?.next_approver;
                  if (na && (na.user_name || na.role)) return na;
                  if (!requiredRole) return null;
                  const a = assigneeByRole.get(requiredRole);
                  return a ? { role: requiredRole, user_id: a.user_id ?? null, user_name: a.user_name ?? null }
                    : { role: requiredRole, user_id: null, user_name: null };
                })();

                return (
                  <>
                    {!pr ? (
                      <div className="text-sm text-gray-600">No pending request found.</div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            Status: <span className="font-semibold">{statusStr || 'PENDING'}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            {expiresSec !== null && (
                              <span>Request expires in <span className="font-semibold text-gray-700">{formatRemaining(expiresSec)}</span></span>
                            )}
                            {nextApprover && (nextApprover.role || nextApprover.user_name) && (
                              <span>
                                Next approver: <span className="font-semibold text-gray-700">{nextApprover.user_name || '—'}</span>
                                {nextApprover.role ? <span className="text-gray-600"> ({String(nextApprover.role).toUpperCase()})</span> : null}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Approval stepper */}
                        <div className="pt-6 pb-4">
                          <div className="relative flex items-start justify-between gap-2">
                            <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" style={{ left: '12%', right: '12%', width: '76%' }}>
                              <div
                                className="h-full bg-blue-600 transition-all duration-500"
                                style={{ width: `${Math.round((Math.max(0, steps.filter(s => isDone(s.key)).length - 1) / Math.max(1, steps.length - 1)) * 100)}%` }}
                              />
                            </div>
                            {steps.map((s, idx) => {
                              const done = isDone(s.key);
                              const active = s.key === currentKey && statusStr !== 'APPROVED';
                              const circleClass = done ? 'bg-blue-600 text-white'
                                : active ? 'bg-white text-yellow-500 border-2 border-yellow-400'
                                : 'bg-white text-gray-400 border-2 border-gray-200';
                              return (
                                <div key={s.key} className="relative z-10 flex flex-col items-center w-24">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${circleClass}`} title={s.label}>
                                    {done ? (idx === 0 ? '1' : '✓') : (active ? <Clock className="w-4 h-4 text-yellow-500" /> : <Clock className="w-4 h-4 text-gray-300" />)}
                                  </div>
                                  <div className="mt-2 text-[10px] font-bold text-gray-700 uppercase tracking-widest text-center">{s.label}</div>
                                  <div className="mt-1 flex justify-center w-full">
                                    {done ? (
                                      <div className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200 shadow-sm">{idx === 0 ? 'Submitted' : 'Approved'}</div>
                                    ) : active ? (
                                      <div className="px-2 py-0.5 border border-yellow-400 text-yellow-600 text-[10px] font-bold rounded-full bg-yellow-50 shadow-sm">{statusStr === 'REJECTED' ? 'Rejected' : 'Pending'}</div>
                                    ) : (
                                      <div className="px-2 py-0.5 border border-gray-200 text-gray-400 text-[10px] font-bold rounded-full bg-gray-50 shadow-sm">Pending</div>
                                    )}
                                  </div>
                                  {('sublabel' in s && (s as any).sublabel) ? (
                                    <div className="mt-2 text-[11px] font-semibold text-gray-900 text-center truncate max-w-full px-1" title={(s as any).sublabel}>{(s as any).sublabel}</div>
                                  ) : idx === 0 && (
                                    <div className="mt-2 text-[11px] font-semibold text-gray-900 text-center truncate max-w-full px-1">Faculty</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {wfAssignees.length > 0 && (
                          <div className="border rounded-lg p-3 bg-white">
                            <div className="text-xs font-semibold text-gray-700 mb-2">Approval stages</div>
                            <div className="space-y-2">
                              {wfAssignees.map((a) => (
                                <div key={String(a.role)} className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-medium text-gray-800">{String(a.role || '').toUpperCase()}</div>
                                  <div className="text-sm text-gray-600 truncate">{a.user_name || '—'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="border rounded-lg p-3 bg-gray-50">
                          <div className="text-xs font-semibold text-gray-700 mb-1">Reason</div>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">{pr.reason || '—'}</div>
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1 border-t mt-4">
                      {pr && pendingStatuses.has(statusStr) ? (
                        <button
                          onClick={cancelEditRequest}
                          disabled={processingAction === 'cancel_edit'}
                          className="px-4 py-2 mt-2 rounded-lg border border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-50 text-sm"
                        >
                          {processingAction === 'cancel_edit' ? 'Canceling…' : 'Cancel Request'}
                        </button>
                      ) : <div />}
                      <button
                        onClick={() => setEditModalOpen(false)}
                        className="px-4 py-2 mt-2 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
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
          {(cqiConfig!.conditions || []).map((c, i) => {
            const clauses = Array.isArray(c.if_clauses) ? c.if_clauses : [];
            const hasPinned = clauses.length > 0;
            const toIfText = () => {
              if (!hasPinned) return String(c.if || '');
              return clauses
                .filter((cl) => cl && cl.token && String(cl.rhs || '').trim())
                .map((cl, idx) => {
                  const tok = cl.token;
                  const rhs = normalizeImplicitTokenSums(String(cl.rhs || '').trim());
                  // Editor stores token types as BEFORE_CQI_COX / AFTER_CQI / TOTAL_CQI
                  const label =
                    tok === 'BEFORE_CQI_COX' ? 'Before CQI (COx)' :
                    tok === 'BEFORE_CQI' ? 'Before CQI' :
                    tok === 'AFTER_CQI' ? 'After CQI' :
                    tok === 'TOTAL_CQI' ? 'Total CQI' : tok;
                  const usesComparator = /^(<=|>=|==|!=|=|<|>)/.test(rhs);
                  if (idx === 0) {
                    return `${label} = ${rhs}`;
                  }
                  return `${idx === 0 ? '' : ' AND '}${usesComparator ? `${label} ${rhs}` : `${label} = ${rhs}`}`;
                })
                .join('')
                .trim();
            };

            return (
              <div key={i}>
                IF&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">{toIfText() || String(c.if || '')}</code>
                &nbsp;THEN&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">{String(c.then || '')}</code>
              </div>
            );
          })}
          {cqiConfig!.else_formula && (
            <div>ELSE&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">{String(cqiConfig!.else_formula || '')}</code></div>
          )}
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
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-[120px]">TOTAL</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-[120px]">AFTER CQI</th>
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
                      <div className="inline-flex min-w-[92px] flex-col rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                        {/* Split BEFORE_CQI by selected COs in this page */}
                        <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center">
                          {(r.perCoMeta || []).map((cm: any) => {
                            const v = Number(cm?.ctxBase?.['BEFORE_CQI_COX'] ?? cm?.ctxBase?.[`BEFORE_CQI_CO${cm.coNum}`] ?? cm?.ctxBase?.['CO-RAW'] ?? 0) || 0;
                            return (
                              <span key={cm.coNum} className="bg-slate-100 text-slate-700 rounded px-1 text-xs font-mono">
                                CO{cm.coNum}:{' '}{round2(v)}
                              </span>
                            );
                          })}
                        </div>

                        {/* Per-CO derived variable values — shown only when derived vars with COX are defined */}
                        {(() => {
                          const derivedVars = cqiConfig?.derived_variables;
                          if (!derivedVars?.length) return null;
                          const coxVars = derivedVars.filter((dv) => String(dv.name || '').toUpperCase().includes('COX'));
                          if (!coxVars.length) return null;
                          return (
                            <div className="mt-1.5 border-t border-slate-200 pt-1.5 space-y-1">
                              {coxVars.map((dv) => {
                                const dvName = String(dv.name || '').toUpperCase();
                                return (
                                  <div key={dvName} className="text-[10px] text-gray-500">
                                    <div className="font-medium text-gray-600 mb-0.5">{dvName.replace(/COX/g, 'CO#')}</div>
                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-center">
                                      {(r.perCoMeta || []).map((cm: any) => {
                                        const resolvedKey = dvName.replace(/COX/g, `CO${cm.coNum}`);
                                        const val = cm.ctxBase?.[resolvedKey] ?? cm.ctxBase?.[dvName];
                                        return (
                                          <span key={cm.coNum} className="bg-purple-50 text-purple-700 rounded px-1">
                                            CO{cm.coNum}:{' '}{val != null ? round2(val) : '—'}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center font-bold">
                      <div
                        className="inline-flex min-w-[96px] flex-col rounded-2xl border border-slate-200 px-3 py-2 shadow-sm"
                      >
                        <div className="text-gray-900 text-sm font-extrabold">{round2(r.beforePct)}%</div>
                        <div className="text-xs text-gray-500 mt-1">{round2(r.beforeValue)}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center font-bold">
                      <div
                        className="inline-flex min-w-[96px] flex-col rounded-2xl border border-slate-200 px-3 py-2 shadow-sm"
                        style={r.totalHighlightColor ? { backgroundColor: r.totalHighlightColor } : undefined}
                      >
                        <div className="text-gray-900 text-sm font-extrabold">{round2(r.afterPct)}%</div>
                        {(() => {
                          const d = round2(r.afterPct - r.beforePct);
                          if (!Number.isFinite(d) || d <= 0) return null;
                          return <div className="text-xs font-semibold text-emerald-700 mt-0.5">+{d}%</div>;
                        })()}
                        <div className="text-xs text-gray-500 mt-1">{round2(r.afterValue)}</div>
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
                      const ctxBase = (cMeta?.ctxBase as Record<string, number> | undefined) || undefined;
                      const contrastColor = matchedColor ? getContrastColor(matchedColor) : null;

                      /**
                       * Edit+color are driven by IF match (now based on if_clauses).
                       * - If matchedCond exists => student row/CO should show matchedCond.color (red by admin)
                       * - Input becomes editable for that matched row/CO only (notAttainedBefore must be true too).
                       */
                      const allowInput = !tableBlocked && hasCqiConfig && cqiConfig && notAttainedBefore && !!matchedCond;

                      const addRaw = Number((c as any)?.appliedAdd ?? 0) || 0;
                      const notAttainedAfter = Boolean((c as any)?.notAttainedAfter);
                      const isCqiAttained = notAttainedBefore && hasInput && !notAttainedAfter;
                      const cellTone = !hasCqiConfig
                        ? 'border-amber-200 bg-amber-50'
                        : (!notAttainedBefore ? 'border-green-200 bg-green-50' : (matchedColor ? '' : (allowInput ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')));

                      const debugBlock = (() => {
                        if (!debugOpen || !hasCqiConfig || !cqiConfig || !ctxBase) return null;
                        const conds = Array.isArray(cqiConfig.conditions) ? cqiConfig.conditions : [];
                        const condEvaluations = conds
                          .filter((x) => hasConditionMatcher(x))
                          .map((x, i) => {
                            const ifRaw = getConditionExpressionText(x);
                            const ifSub = substituteTokens(ifRaw, ctxBase, c.coNum);
                            const ok = evaluateConditionMatcher(x, ctxBase, c.coNum);
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
                          className="px-3 py-2 text-center"
                        >
                          <div
                            className={`rounded-2xl border px-3 py-3 shadow-sm ${cellTone}`}
                            style={matchedColor ? { backgroundColor: matchedColor, borderColor: matchedColor, color: contrastColor! } : undefined}
                          >
                            <div className="mb-2 text-sm font-semibold text-gray-700" style={contrastColor ? { color: contrastColor } : undefined}>{round2(c.value)} / {round2(c.max)}</div>
                            {!hasCqiConfig ? (
                              <div>
                                <div className="mb-2 text-[11px] font-semibold text-amber-600">Formula not set</div>
                                <input
                                  type="number" inputMode="decimal"
                                  value={current ?? ''}
                                  onChange={(e) => setEntry(r.studentId, coKey, e.target.value)}
                                  disabled={tableBlocked}
                                  placeholder="Enter CQI"
                                  className="w-[96px] rounded-xl border border-gray-300 bg-white px-2 py-1.5 text-center text-sm disabled:bg-gray-100"
                                />
                              </div>
                            ) : !notAttainedBefore ? (
                              <div className="text-xs font-semibold text-green-700" style={contrastColor ? { color: contrastColor } : undefined}>Attained</div>
                            ) : (
                              <div>
                                {isCqiAttained ? (
                                  <div className="mb-2 text-[11px] font-bold text-red-600" style={contrastColor ? { color: contrastColor } : undefined}>CQI Attained</div>
                                ) : hasCqiConfig ? (
                                  <div className="mb-2 text-[11px] font-semibold text-red-700" style={contrastColor ? { color: contrastColor } : undefined}>
                                    CO Not Attained{hasInput && addRaw > 0 && <span className="ml-1 text-green-700" style={contrastColor ? { color: contrastColor } : undefined}>+{round2(addRaw)}</span>}
                                  </div>
                                ) : (
                                  <div className="mb-2 text-[11px] font-semibold text-amber-500" style={contrastColor ? { color: contrastColor } : undefined}>Formula not set</div>
                                )}
                                {allowInput ? (
                                  <input
                                    type="number" inputMode="decimal"
                                    value={current ?? ''}
                                    onChange={(e) => setEntry(r.studentId, coKey, e.target.value)}
                                    disabled={tableBlocked}
                                    placeholder="Enter CQI"
                                    className="w-[96px] rounded-xl border border-gray-300 bg-white px-2 py-1.5 text-center text-sm disabled:bg-gray-100"
                                  />
                                ) : current !== null && current !== undefined ? (
                                  <div
                                    className="w-[96px] rounded-xl border px-2 py-1.5 text-center text-sm font-semibold mx-auto"
                                    style={{ borderColor: contrastColor ? 'rgba(128,128,128,0.4)' : '#d1d5db', backgroundColor: contrastColor ? 'rgba(255,255,255,0.15)' : '#f9fafb', color: contrastColor || '#374151' }}
                                  >
                                    {current}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-gray-400" style={contrastColor ? { color: contrastColor } : undefined}>—</div>
                                )}
                              </div>
                            )}
                            {debugBlock}
                          </div>
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
