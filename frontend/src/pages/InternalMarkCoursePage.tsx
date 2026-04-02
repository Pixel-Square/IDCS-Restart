import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import newBannerSrc from '../assets/new_banner.png';
import krLogoSrc from '../assets/krlogo.png';
import idcsLogoSrc from '../assets/idcs-logo.png';

import {
  fetchClassTypeWeights,
  fetchDraft,
  fetchMarkTableLockStatus,
  fetchIqacCqiConfig,
  fetchIqacQpPattern,
  fetchMyTeachingAssignments,
  fetchPublishedCiaSheet,
  fetchPublishedFormative,
  fetchPublishedLabSheet,
  fetchPublishedModelSheet,
  fetchPublishedReview1,
  fetchPublishedReview2,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  fetchTeachingAssignmentEnabledAssessmentsInfo,
  TeachingAssignmentItem,
} from '../services/obe';
import { fetchAssessmentMasterConfig } from '../services/cdapDb';
import { fetchTeachingAssignmentRoster, TeachingAssignmentRosterStudent } from '../services/roster';
import fetchWithAuth from '../services/fetchAuth';
import { fetchDeptRow, fetchDeptRows, fetchMasters } from '../services/curriculum';
import { lsGet, lsSet } from '../utils/localStorage';
import { normalizeClassType, normalizeObeClassType } from '../constants/classTypes';

type Props = { courseId: string; enabledAssessments?: string[] | null; classType?: string | null; questionPaperType?: string | null };

type Student = {
  id: number;
  reg_no: string;
  name: string;
  section?: string | null;
};

type QuestionDef = { key: string; max: number; co: 1 | 2 | '1&2' };
type QuestionDef34 = { key: string; max: number; co: 3 | 4 | '3&4' };

type IqacPattern = { marks: number[]; cos?: Array<number | string> };

type CqiPublishedPage = {
  key: string;
  assessmentType?: string | null;
  coNumbers?: number[];
  publishedAt?: string | null;
  entries?: Record<number | string, Record<string, number | null>>;
};

type CqiPublishedSnapshot = {
  publishedAt?: string;
  coNumbers?: number[];
  entries?: Record<number, Record<string, number | null>>;
  pages?: CqiPublishedPage[];
};

const DEFAULT_INTERNAL_MAPPING = {
  // CO1/CO2 are split like CO3/CO4: ssa/cia/fa columns.
  header: ['CO1', 'CO1', 'CO1', 'CO2', 'CO2', 'CO2', 'CO3', 'CO3', 'CO3', 'CO4', 'CO4', 'CO4', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5'],
  weights: [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0],
  cycles: ['ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ME', 'ME', 'ME', 'ME', 'ME'],
};

const DEFAULT_CIA1_QUESTIONS: QuestionDef[] = [
  { key: 'q1', max: 2, co: 1 },
  { key: 'q2', max: 2, co: 1 },
  { key: 'q3', max: 2, co: 1 },
  { key: 'q4', max: 2, co: 2 },
  { key: 'q5', max: 2, co: 2 },
  { key: 'q6', max: 2, co: 2 },
  { key: 'q7', max: 16, co: 1 },
  { key: 'q8', max: 16, co: 2 },
  { key: 'q9', max: 16, co: '1&2' },
];

const DEFAULT_CIA2_QUESTIONS: QuestionDef34[] = [
  { key: 'q1', max: 2, co: 3 },
  { key: 'q2', max: 2, co: 3 },
  { key: 'q3', max: 2, co: 3 },
  { key: 'q4', max: 2, co: 4 },
  { key: 'q5', max: 2, co: 4 },
  { key: 'q6', max: 2, co: 4 },
  { key: 'q7', max: 16, co: 3 },
  { key: 'q8', max: 16, co: 4 },
  { key: 'q9', max: 16, co: '3&4' },
];

// Same model (theory) sheet template mapping used in CO Attainment.
const MODEL_THEORY_QUESTIONS: Array<{ key: string; max: number }> = [
  { key: 'q1', max: 2 },
  { key: 'q2', max: 2 },
  { key: 'q3', max: 2 },
  { key: 'q4', max: 2 },
  { key: 'q5', max: 2 },
  { key: 'q6', max: 2 },
  { key: 'q7', max: 2 },
  { key: 'q8', max: 2 },
  { key: 'q9', max: 2 },
  { key: 'q10', max: 2 },
  { key: 'q11', max: 14 },
  { key: 'q12', max: 14 },
  { key: 'q13', max: 14 },
  { key: 'q14', max: 14 },
  { key: 'q15', max: 14 },
  { key: 'q16', max: 10 },
];

const MODEL_THEORY_CO_ROW = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5, 5] as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNumOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractProjectReviewMarks(snapshot: any): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object'
    ? snapshot.sheet
    : snapshot && typeof snapshot === 'object' && snapshot?.rowsByStudentId
      ? snapshot
      : null;
  const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object'
    ? sheet.rowsByStudentId
    : null;

  if (rowsByStudentId) {
    for (const [studentId, row] of Object.entries(rowsByStudentId)) {
      if (!row || typeof row !== 'object') continue;
      const ciaExamTotal = toNumOrNull((row as any).ciaExam);
      if (ciaExamTotal != null) {
        out[String(studentId)] = clamp(ciaExamTotal, 0, 50);
        continue;
      }

      const reviewComponentMarks = (row as any).reviewComponentMarks && typeof (row as any).reviewComponentMarks === 'object'
        ? Object.values((row as any).reviewComponentMarks)
        : [];
      let hasComponentValue = false;
      const componentTotal = reviewComponentMarks.reduce<number>((sum, raw) => {
        const n = toNumOrNull(raw);
        if (n != null) hasComponentValue = true;
        return sum + (n == null ? 0 : n);
      }, 0);
      if (hasComponentValue) {
        out[String(studentId)] = clamp(componentTotal, 0, 50);
      }
    }
    return out;
  }

  const marks = snapshot?.marks && typeof snapshot.marks === 'object' ? snapshot.marks : {};
  for (const [studentId, raw] of Object.entries(marks)) {
    const total = toNumOrNull(raw);
    out[String(studentId)] = total == null ? null : clamp(total, 0, 50);
  }
  return out;
}

function extractTcprReviewCoSplits(snapshot: any, coKeys: string[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const sheet = snapshot?.data && typeof snapshot.data === 'object'
    ? snapshot.data
    : snapshot?.sheet && typeof snapshot.sheet === 'object'
      ? snapshot.sheet
      : snapshot && typeof snapshot === 'object'
        ? snapshot
        : null;
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : Array.isArray(snapshot?.rows) ? snapshot.rows : [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const sid = String((row as any)?.studentId ?? '').trim();
    if (!sid) continue;
    const entry: Record<string, number> = {};

    for (const coKey of coKeys) {
      const rawReviewCoMarks = (row as any)?.reviewCoMarks?.[coKey];
      if (Array.isArray(rawReviewCoMarks)) {
        const total = rawReviewCoMarks.reduce<number>((sum, val) => {
          const n = toNumOrNull(val);
          return sum + (n == null ? 0 : n);
        }, 0);
        if (total > 0) {
          entry[coKey] = total;
          continue;
        }
      }

      const directVal = toNumOrNull((row as any)?.[coKey]);
      if (directVal != null) entry[coKey] = directVal;
    }

    if (Object.keys(entry).length) out[sid] = entry;
  }

  return out;
}

function compareStudentName(a: { name?: string; reg_no?: string }, b: { name?: string; reg_no?: string }) {
  const an = String(a?.name || '').trim().toLowerCase();
  const bn = String(b?.name || '').trim().toLowerCase();
  if (an && bn) {
    const byName = an.localeCompare(bn);
    if (byName) return byName;
  } else if (an || bn) {
    return an ? -1 : 1;
  }
  const ar = String(a?.reg_no || '').trim();
  const br = String(b?.reg_no || '').trim();
  return ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
}

function effectiveCoWeights12(co: 1 | 2 | '1&2') {
  if (co === '1&2') return { co1: 0.5, co2: 0.5 };
  return co === 2 ? { co1: 0, co2: 1 } : { co1: 1, co2: 0 };
}

function effectiveCoWeights34(co: 3 | 4 | '3&4') {
  if (co === '3&4') return { co3: 0.5, co4: 0.5 };
  return co === 4 ? { co3: 0, co4: 1 } : { co3: 1, co4: 0 };
}

function parseCo12(raw: unknown): 1 | 2 | '1&2' {
  if (raw === 'both') return '1&2';
  if (raw === '1&2') return '1&2';
  if (Array.isArray(raw)) {
    const vals = raw.map((x) => String(x ?? '').trim().toUpperCase());
    if (vals.some((v) => v === 'BOTH')) return '1&2';
    const has1 = vals.some((v) => v === '1' || v === 'CO1');
    const has2 = vals.some((v) => v === '2' || v === 'CO2');
    if (has1 && has2) return '1&2';
    if (has2) return 2;
    return 1;
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase();
    if (s === 'BOTH') return '1&2';
    if (s === '1&2' || s === '1,2' || s === '1/2' || s === '2/1' || s === 'CO1&CO2' || s === 'CO1,CO2') return '1&2';
    if (s === '2' || s === 'CO2') return 2;
    if (s === '1' || s === 'CO1') return 1;
  }
  const n = Number(raw);
  if (n === 2) return 2;
  if (n === 12) return '1&2';
  return 1;
}

function parseCo34(raw: unknown): 3 | 4 | '3&4' {
  if (raw === 'both') return '3&4';
  if (raw === '3&4') return '3&4';
  if (Array.isArray(raw)) {
    const vals = raw.map((x) => String(x ?? '').trim().toUpperCase());
    if (vals.some((v) => v === 'BOTH')) return '3&4';
    // Legacy configs sometimes tag CIA2 as 1/2.
    const hasLegacy1 = vals.some((v) => v === '1' || v === 'CO1');
    const hasLegacy2 = vals.some((v) => v === '2' || v === 'CO2');
    const has3 = vals.some((v) => v === '3' || v === 'CO3');
    const has4 = vals.some((v) => v === '4' || v === 'CO4');
    if (has3 && has4) return '3&4';
    if (hasLegacy1 && hasLegacy2) return '3&4';
    if (has4) return 4;
    if (hasLegacy2) return 4;
    return 3;
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase();
    if (s === 'BOTH') return '3&4';
    // Treat CIA2 legacy 1/2 tagging as 3/4.
    if (s === '1&2' || s === '1,2' || s === '1/2' || s === '2/1' || s === 'CO1&CO2' || s === 'CO1,CO2') return '3&4';
    if (s === '3&4' || s === '3,4' || s === '3/4' || s === '4/3' || s === 'CO3&CO4' || s === 'CO3,CO4') return '3&4';
    if (s === '4' || s === 'CO4') return 4;
    if (s === '3' || s === 'CO3') return 3;
    if (s === '2' || s === 'CO2') return 4;
    if (s === '1' || s === 'CO1') return 3;
  }
  const n = Number(raw);
  if (n === 4) return 4;
  if (n === 34) return '3&4';
  if (n === 2) return 4;
  if (n === 1) return 3;
  if (n === 12) return '3&4';
  return 3;
}

function parseQuestionCoNumbers(raw: unknown): number[] {
  if (raw == null) return [1];
  if (typeof raw === 'number' && Number.isFinite(raw)) return [raw];
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase().replace(/\s+/g, '');
    const parts = s.split(/[&,\/]+/);
    const nums: number[] = [];
    for (const p of parts) {
      const m = p.match(/\d+/);
      if (m) nums.push(Number(m[0]));
    }
    if (nums.length > 0) return [...new Set(nums)];
  }
  if (Array.isArray(raw)) {
    const nums: number[] = [];
    for (const v of raw) {
      const m = String(v ?? '').match(/\d+/);
      if (m) nums.push(Number(m[0]));
    }
    if (nums.length > 0) return [...new Set(nums)];
  }
  return [1];
}

function effectiveCoWeights12ForQuestion(questions: QuestionDef[], idx: number) {
  const q = questions[idx];
  if (!q) return { co1: 0, co2: 0 };
  if (q.co === '1&2') return { co1: 0.5, co2: 0.5 };
  return effectiveCoWeights12(q.co);
}

function effectiveCoWeights34ForQuestion(questions: QuestionDef34[], idx: number) {
  const q = questions[idx];
  if (!q) return { co3: 0, co4: 0 };
  if (q.co === '3&4') return { co3: 0.5, co4: 0.5 };
  return effectiveCoWeights34(q.co);
}

function weightedOutOf(args: {
  ssaMark: number | null;
  ciaMark: number | null;
  faMark: number | null;
  ssaMax: number;
  ciaMax: number;
  faMax: number;
  ssaW: number;
  ciaW: number;
  faW: number;
  outOf: number;
}): number | null {
  const { ssaMark, ciaMark, faMark, ssaMax, ciaMax, faMax, ssaW, ciaW, faW, outOf } = args;
  const items: Array<{ mark: number | null; max: number; w: number }> = [
    { mark: ssaMark, max: ssaMax, w: ssaW },
    { mark: ciaMark, max: ciaMax, w: ciaW },
    { mark: faMark, max: faMax, w: faW },
  ].filter((x) => Number(x.w || 0) > 0);

  if (!items.length) return null;
  if (!outOf || !Number.isFinite(outOf)) return null;
  if (items.some((it) => it.mark == null)) return null;
  if (items.some((it) => !it.max || !Number.isFinite(it.max))) return null;
  const sumW = items.reduce((s, it) => s + it.w, 0);
  if (!sumW) return null;
  const frac = items.reduce((s, it) => s + ((it.mark as number) / it.max) * it.w, 0) / sumW;
  const out = frac * outOf;
  return Number.isFinite(out) ? clamp(out, 0, outOf) : null;
}

function splitCycleWeight(total: number, ssaW: number, ciaW: number, faW: number): [number, number, number] {
  const t = Number(total);
  const s = Number(ssaW);
  const c = Number(ciaW);
  const f = Number(faW);
  const sum = (Number.isFinite(s) ? s : 0) + (Number.isFinite(c) ? c : 0) + (Number.isFinite(f) ? f : 0);
  if (!Number.isFinite(t) || t <= 0 || !sum) return [0, 0, 0];
  const a = round2((t * (s || 0)) / sum);
  const b = round2((t * (c || 0)) / sum);
  const d = round2((t * (f || 0)) / sum);
  return [a, b, d];
}

type InternalSchema = {
  visible: number[];
  header: string[];
  cycles: string[];
  labels: string[];
};

function buildInternalSchema(classType: string | null, enabledSet: Set<string>, isPrbl?: boolean, isQp1Final?: boolean): InternalSchema {
  const ct = normalizeObeClassType(classType);
  const allHeader = DEFAULT_INTERNAL_MAPPING.header;
  const allCycles = DEFAULT_INTERNAL_MAPPING.cycles;
  const allLabels = [
    'CO1-SSA',
    'CO1-CIA',
    'CO1-FA',
    'CO2-SSA',
    'CO2-CIA',
    'CO2-FA',
    'CO3-SSA',
    'CO3-CIA',
    'CO3-FA',
    'CO4-SSA',
    'CO4-CIA',
    'CO4-FA',
    'ME-CO1',
    'ME-CO2',
    'ME-CO3',
    'ME-CO4',
    'ME-CO5',
  ];

  // Default: show all 17 columns (theory-like schema)
  let visible = Array.from({ length: 17 }, (_, i) => i);
  let cycles = [...allCycles];
  let labels = [...allLabels];

  if (ct === 'TCPR') {
    // TCPR uses Review1/Review2 instead of Formatives.
    cycles = cycles.map((c, idx) => {
      if (idx === 2 || idx === 5 || idx === 8 || idx === 11) return 'review';
      return c;
    });
    labels = labels.map((l, idx) => {
      if (idx === 2 || idx === 5 || idx === 8 || idx === 11) return l.replace('-FA', '-Review');
      return l;
    });
  }

  if (ct === 'TCPL') {
    // TCPL uses 21-slot schema: SSA/CIA/LAB/CIAExam per CO + ME CO1..CO5.
    const tcplVisible: number[] = [];
    const tcplHeader: string[] = [];
    const tcplCycles: string[] = [];
    const tcplLabels: string[] = [];
    for (let co = 1; co <= 4; co++) {
      const base = (co - 1) * 4;
      const labSuffix = co <= 2 ? 'LAB1' : 'LAB2';
      tcplVisible.push(base, base + 1, base + 2, base + 3);
      tcplHeader.push(`CO${co}`, `CO${co}`, `CO${co}`, `CO${co}`);
      tcplCycles.push('ssa', 'cia', 'lab', 'cia_exam');
      tcplLabels.push(`CO${co}-SSA`, `CO${co}-CIA`, `CO${co}-${labSuffix}`, `CO${co}-CIAExam`);
    }
    // ME columns at indices 16-20
    for (let c = 1; c <= 5; c++) {
      tcplVisible.push(15 + c);
      tcplHeader.push(`CO${c}`);
      tcplCycles.push('ME');
      tcplLabels.push(`ME-CO${c}`);
    }
    return { visible: tcplVisible, header: tcplHeader, cycles: tcplCycles, labels: tcplLabels };
  }

  // QP1 FINAL YEAR: 3 COs only. CO2 gets contributions from BOTH cycle 1 and cycle 2.
  // 15-slot layout: [CO1-SSA, CO1-CIA, CO1-FA, CO2-SSA(C1), CO2-CIA(C1), CO2-FA(C1),
  //                  CO2-SSA(C2), CO2-CIA(C2), CO2-FA(C2), CO3-SSA, CO3-CIA, CO3-FA,
  //                  ME-CO1, ME-CO2, ME-CO3]
  if (isQp1Final) {
    return {
      visible: Array.from({ length: 15 }, (_, i) => i),
      header:  ['CO1','CO1','CO1','CO2','CO2','CO2','CO2','CO2','CO2','CO3','CO3','CO3','CO1','CO2','CO3'],
      cycles:  ['ssa','cia','fa','ssa','cia','fa','ssa','cia','fa','ssa','cia','fa','ME','ME','ME'],
      labels:  ['CO1-SSA','CO1-CIA','CO1-FA','CO2-SSA(C1)','CO2-CIA(C1)','CO2-FA(C1)',
                'CO2-SSA(C2)','CO2-CIA(C2)','CO2-FA(C2)','CO3-SSA','CO3-CIA','CO3-FA',
                'ME-CO1','ME-CO2','ME-CO3'],
    };
  }

  if (ct === 'LAB') {
    const modelEnabled = enabledSet.has('model');
    // LAB uses CIA 1 LAB, CIA 2 LAB and optional MODEL LAB (no SSA/FA).
    visible = modelEnabled ? [1, 4, 7, 10, 16] : [1, 4, 7, 10];
    const header = modelEnabled ? ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'] : ['CO1', 'CO2', 'CO3', 'CO4'];
    const cyc = modelEnabled ? ['CIA 1 LAB', 'CIA 1 LAB', 'CIA 2 LAB', 'CIA 2 LAB', 'MODEL LAB'] : ['CIA 1 LAB', 'CIA 1 LAB', 'CIA 2 LAB', 'CIA 2 LAB'];
    const lab = modelEnabled ? ['CO1-CIA1', 'CO2-CIA1', 'CO3-CIA2', 'CO4-CIA2', 'ME-CO5'] : ['CO1-CIA1', 'CO2-CIA1', 'CO3-CIA2', 'CO4-CIA2'];
    return { visible, header, cycles: cyc, labels: lab };
  }

  if (ct === 'PRACTICAL') {
    // PRACTICAL keeps CIA + MODEL behavior.
    visible = [1, 4, 7, 10, 16];
    const header = ['CO1', 'CO2', 'CO3', 'CO4', 'ME'];
    const cyc = ['CIA 1', 'CIA 1', 'CIA 2', 'CIA 2', 'MODEL'];
    const lab = ['CO1-CIA1', 'CO2-CIA1', 'CO3-CIA2', 'CO4-CIA2', 'ME-CO5'];
    return { visible, header, cycles: cyc, labels: lab };
  }

  if (ct === 'PROJECT') {
    if (isPrbl) {
      // PRBL: Cycle1(SSA1+Review1)=15, Cycle2(SSA2+Review2)=15, Cycle3(Model)=30 → 60
      visible = [0, 2, 3, 8, 16];  // indices into 17-slot partsFull (co1Ssa, co1Fa, co2Ssa, co3Fa, meCo1)
      const header = ['SSA 1', 'Review 1', 'SSA 2', 'Review 2', 'Model'];
      const cyc = ['Cycle 1', 'Cycle 1', 'Cycle 2', 'Cycle 2', 'Cycle 3'];
      const lab = ['SSA1', 'REVIEW1', 'SSA2', 'REVIEW2', 'MODEL'];
      return { visible, header, cycles: cyc, labels: lab };
    }
    // PROJECT uses only Review 1 and Review 2, each scaled to 30 marks.
    visible = [2, 8];
    const header = ['Review 1', 'Review 2'];
    const cyc = ['Project Review', 'Project Review'];
    const lab = ['REVIEW1-CO1', 'REVIEW2-CO1'];
    return { visible, header, cycles: cyc, labels: lab };
  }

  if (ct === 'SPECIAL' && enabledSet.size) {
    // SPECIAL has only the enabled subset of SSA/CIA/Formative and no MODEL.
    const allowed: number[] = [];
    const pushIf = (cond: boolean, idxs: number[]) => {
      if (cond) for (const i of idxs) allowed.push(i);
    };
    pushIf(enabledSet.has('ssa1'), [0, 3]);
    pushIf(enabledSet.has('cia1'), [1, 4]);
    pushIf(enabledSet.has('formative1'), [2, 5]);
    pushIf(enabledSet.has('ssa2'), [6, 9]);
    pushIf(enabledSet.has('cia2'), [7, 10]);
    pushIf(enabledSet.has('formative2'), [8, 11]);
    visible = allowed;
  }

  const header = visible.map((i) => allHeader[i]);
  const cyc = visible.map((i) => cycles[i]);
  const lab = visible.map((i) => labels[i]);
  return { visible, header, cycles: cyc, labels: lab };
}

function tcplCoMarks(labSheet: any, co: 1 | 2, maxMarks: number) {
  if (!labSheet || typeof labSheet !== 'object') return { total: null, attainment: null };
  const questions: Array<{ key: string; max: number; co?: number | string }> = Array.isArray(labSheet.questions) ? labSheet.questions : [];
  const rows: Record<string, any> = typeof labSheet.rowsByStudentId === 'object' ? labSheet.rowsByStudentId : {};
  if (!questions.length || !Object.keys(rows).length) return { total: null, attainment: null };

  const coQuestions = questions.filter((q) => {
    const qCo = String(q.co || '').trim();
    if (qCo === String(co)) return true;
    // Handle legacy '1&2' as both
    if (qCo === '1&2') return true;
    return false;
  });

  if (!coQuestions.length) return { total: null, attainment: null };

  const maxCoTotal = coQuestions.reduce((sum, q) => sum + (Number(q.max) || 0), 0);
  if (maxCoTotal <= 0) return { total: null, attainment: null };

  const studentTotals: number[] = [];
  for (const studentId in rows) {
    const row = rows[studentId];
    if (!row || typeof row !== 'object') continue;
    const studentCoTotal = coQuestions.reduce((sum, q) => {
      const mark = toNumOrNull(row[q.key]);
      return sum + (mark ?? 0);
    }, 0);
    studentTotals.push(studentCoTotal);
  }

  if (!studentTotals.length) return { total: null, attainment: null };

  const averageCoTotal = studentTotals.reduce((sum, total) => sum + total, 0) / studentTotals.length;
  const attainment = (averageCoTotal / maxCoTotal) * 100;

  return { total: averageCoTotal, attainment };
}

function splitLegacyTcplCombinedWeight(total: unknown): [number, number] {
  const labDefault = 2;
  const ciaExamDefault = 1.5;
  const totalDefault = labDefault + ciaExamDefault;
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return [labDefault, ciaExamDefault];
  const lab = Math.round(((n * labDefault) / totalDefault) * 100) / 100;
  const ciaExam = Math.round((n - lab) * 100) / 100;
  return [lab, ciaExam];
}

export default function InternalMarkCoursePage({ courseId, enabledAssessments, classType: classTypeProp, questionPaperType: qpTypeProp }: Props): JSX.Element {
  const [assignmentEnabledAssessments, setAssignmentEnabledAssessments] = useState<string[] | null | undefined>(undefined);
  const effectiveEnabledAssessments = useMemo(
    () => (assignmentEnabledAssessments === undefined ? enabledAssessments : assignmentEnabledAssessments),
    [assignmentEnabledAssessments, enabledAssessments],
  );
  const enabledSet = useMemo(
    () => new Set((effectiveEnabledAssessments || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)),
    [effectiveEnabledAssessments],
  );

  const [tas, setTas] = useState<TeachingAssignmentItem[]>([]);
  const [selectedTaId, setSelectedTaId] = useState<number | null>(null);
  const [taError, setTaError] = useState<string | null>(null);

  const [classType, setClassType] = useState<string | null>(null);
  const effectiveClassType = useMemo(() => {
    const fromProp = normalizeObeClassType(classTypeProp);
    if (fromProp) return fromProp;
    return normalizeObeClassType(classType);
  }, [classTypeProp, classType]);

  const rawClassType = useMemo(() => {
    const fromProp = normalizeClassType(classTypeProp);
    if (fromProp) return fromProp;
    return normalizeClassType(classType);
  }, [classTypeProp, classType]);

  const isPrbl = useMemo(() => rawClassType === 'PRBL', [rawClassType]);

  const qpTypeNorm = useMemo(() => String(qpTypeProp ?? '').trim().toUpperCase(), [qpTypeProp]);
  const isQp1Final = useMemo(
    () => effectiveClassType === 'THEORY' && /QP1\s*FINAL/i.test(qpTypeNorm),
    [effectiveClassType, qpTypeNorm],
  );

  useEffect(() => {
    if (effectiveClassType !== 'LAB' || selectedTaId == null) {
      setAssignmentEnabledAssessments(undefined);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const info = await fetchTeachingAssignmentEnabledAssessmentsInfo(Number(selectedTaId));
        if (!mounted) return;
        const arr = Array.isArray(info?.enabled_assessments)
          ? info.enabled_assessments.map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean)
          : [];
        setAssignmentEnabledAssessments(arr);
      } catch {
        if (!mounted) return;
        setAssignmentEnabledAssessments(Array.isArray(enabledAssessments) ? enabledAssessments : []);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [effectiveClassType, selectedTaId, enabledAssessments]);

  const [masterCfg, setMasterCfg] = useState<any>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [weights, setWeights] = useState<{ ssa1: number; cia1: number; formative1: number }>({ ssa1: 1.5, cia1: 3, formative1: 2.5 });
  const [internalMarkWeights, setInternalMarkWeights] = useState<number[]>([...DEFAULT_INTERNAL_MAPPING.weights]);

  const [published, setPublished] = useState<{ ssa1: Record<string, any>; ssa2: Record<string, any>; f1: Record<string, any>; f2: Record<string, any>; cia1: any | null; cia2: any | null }>({
    ssa1: {},
    ssa2: {},
    f1: {},
    f2: {},
    cia1: null,
    cia2: null,
  });

  const [publishedReview, setPublishedReview] = useState<{ r1: Record<string, any>; r2: Record<string, any> }>({ r1: {}, r2: {} });
  const [publishedLab, setPublishedLab] = useState<{ cia1: any | null; cia2: any | null; model: any | null }>({
    cia1: null,
    cia2: null,
    model: null,
  });
  const [publishedTcplLab, setPublishedTcplLab] = useState<{ lab1: any | null; lab2: any | null }>({ lab1: null, lab2: null });
  const [publishedModel, setPublishedModel] = useState<any | null>(null);
  const [publishedPrblModel, setPublishedPrblModel] = useState<Record<string, number | null>>({});

  // Per-CO split marks from SSA drafts, returned by the published endpoint.
  // Maps studentId → { co1: x, co2: y } (SSA1) or { co3: x, co4: y } (SSA2).
  const [ssaCoSplits, setSsaCoSplits] = useState<{ ssa1: Record<string, any>; ssa2: Record<string, any> }>({ ssa1: {}, ssa2: {} });

  const [iqacCiaPattern, setIqacCiaPattern] = useState<{ cia1: IqacPattern | null; cia2: IqacPattern | null }>({ cia1: null, cia2: null });
  const [iqacModelPattern, setIqacModelPattern] = useState<IqacPattern | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [reloadCounter, setReloadCounter] = useState(0);

  const [cqiPublished, setCqiPublished] = useState<CqiPublishedSnapshot | null>(null);
  const [cqiGlobalCfg, setCqiGlobalCfg] = useState<{ divider: number; multiplier: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'actual' | 'after-cqi'>('after-cqi');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!courseId || selectedTaId == null) {
        if (mounted) setCqiPublished(null);
        return;
      }
      try {
        const qp = `?teaching_assignment_id=${encodeURIComponent(String(selectedTaId))}`;
        const res = await fetchWithAuth(`/api/obe/cqi-published/${encodeURIComponent(String(courseId))}${qp}`);
        if (!mounted) return;
        if (res && res.ok) {
          const j = await res.json().catch(() => null);
          const pub = j?.published && typeof j.published === 'object' ? (j.published as CqiPublishedSnapshot) : null;
          setCqiPublished(pub);
        } else {
          setCqiPublished(null);
        }
      } catch {
        if (mounted) setCqiPublished(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [courseId, selectedTaId, reloadCounter]);

  // Load global IQAC CQI config (divider/multiplier).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res: any = await fetchIqacCqiConfig();
        if (!mounted) return;
        const divider = Number(res?.divider);
        const multiplier = Number(res?.multiplier);
        setCqiGlobalCfg({
          divider: Number.isFinite(divider) && divider > 0 ? divider : 2,
          multiplier: Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 0.15,
        });
      } catch {
        if (mounted) setCqiGlobalCfg(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Reload published snapshots when a publish happens elsewhere in the UI.
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as any)?.detail || {};
        const subjectId = detail.subjectId;
        if (!subjectId || String(subjectId) !== String(courseId)) return;
        setReloadCounter((x) => x + 1);
      } catch {
        // ignore
      }
    };
    window.addEventListener('obe:published', handler as any);
    return () => window.removeEventListener('obe:published', handler as any);
  }, [courseId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        setMasterCfg(cfg || null);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchMyTeachingAssignments();
        if (!mounted) return;
        let filtered = (all || []).filter((a) => String(a.subject_code) === String(courseId));
        
        // If user doesn't have a TA for this subject, try to fetch from server
        if (filtered.length === 0) {
          try {
            const taListRes = await fetchWithAuth(`/api/academics/teaching-assignments/?subject_code=${encodeURIComponent(String(courseId || ''))}`);
            if (taListRes.ok) {
              const taListJson = await taListRes.json();
              const items = Array.isArray(taListJson.results) ? taListJson.results : Array.isArray(taListJson) ? taListJson : (taListJson.items || []);
              filtered = items || [];
            }
          } catch (err) {
            console.warn('Server TA list fetch failed:', err);
          }
        }
        
        setTas(filtered);
        const stored = lsGet<number>(`internalMark_selectedTa_${courseId}`);
        const initial = (typeof stored === 'number' && filtered.some((f) => f.id === stored) ? stored : filtered[0]?.id) ?? null;
        setSelectedTaId(initial);
        setTaError(null);
      } catch (e: any) {
        if (!mounted) return;
        setTas([]);
        setSelectedTaId(null);
        setTaError(e?.message || 'Failed to load teaching assignments');
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  useEffect(() => {
    if (!courseId || selectedTaId == null) return;
    lsSet(`internalMark_selectedTa_${courseId}`, selectedTaId);
  }, [courseId, selectedTaId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ta = (tas || []).find((t) => t.id === selectedTaId) || null;
        const curriculumRowId = (ta as any)?.curriculum_row_id;
        if (!curriculumRowId) {
          const courseCodeNorm = String(courseId).trim().toUpperCase();
          const rows = await fetchDeptRows();
          if (!mounted) return;
          const matchDept = (rows || []).find((r: any) => String(r.course_code || '').trim().toUpperCase() === courseCodeNorm);
          const deptClassType = (matchDept as any)?.class_type ?? null;
          if (deptClassType) {
            setClassType(deptClassType);
            return;
          }
          const masters = await fetchMasters();
          if (!mounted) return;
          const matchMaster = (masters || []).find((m: any) => String(m.course_code || '').trim().toUpperCase() === courseCodeNorm);
          setClassType((matchMaster as any)?.class_type ?? null);
          return;
        }
        const row = await fetchDeptRow(Number(curriculumRowId));
        if (!mounted) return;
        setClassType((row as any)?.class_type ?? null);
      } catch {
        if (mounted) setClassType(null);
      }
    })();
    return () => { mounted = false; };
  }, [tas, selectedTaId, courseId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ct = effectiveClassType;
        const applyWeights = (w: any) => {
          if (!w || typeof w !== 'object') return false;
          const ssa1W = Number.isFinite(Number(w.ssa1)) ? Number(w.ssa1) : 1.5;
          const cia1W = Number.isFinite(Number(w.cia1)) ? Number(w.cia1) : 3;
          const fa1W = Number.isFinite(Number(w.formative1)) ? Number(w.formative1) : 2.5;
          setWeights({ ssa1: ssa1W, cia1: cia1W, formative1: fa1W });

          const im = (w as any).internal_mark_weights;
          if (Array.isArray(im) && im.length) {
            let arr = im.map((x: any) => {
              const n = Number(x);
              return Number.isFinite(n) ? n : 0;
            });

            const sanitizeLabPractical = (input: number[]) => {
              const out = [...input];
              const labCiaFallback = Number(DEFAULT_INTERNAL_MAPPING.weights[1] ?? 3);
              const modelFallback = Number(DEFAULT_INTERNAL_MAPPING.weights[16] ?? 4);
              const pickLabCia = (legacy: unknown) => {
                const n = Number(legacy);
                if (Number.isFinite(n) && n >= 2.9 && n <= 5) return n;
                return labCiaFallback;
              };
              while (out.length < DEFAULT_INTERNAL_MAPPING.weights.length) out.push(DEFAULT_INTERNAL_MAPPING.weights[out.length] ?? 0);
              out[1] = pickLabCia(out[1]);
              out[4] = pickLabCia(out[4]);
              out[7] = pickLabCia(out[7]);
              out[10] = pickLabCia(out[10]);
              const meCo5Raw = Number(out[16]);
              out[16] = Number.isFinite(meCo5Raw) && meCo5Raw > 0 ? meCo5Raw : modelFallback;
              return out;
            };

            // Backward compatibility: old format had 13 weights with CO1/CO2 as a single "cycle 1" column.
            // New format has 17 weights with CO1/CO2 split into ssa/cia/fa.
            if (arr.length === 13 && DEFAULT_INTERNAL_MAPPING.weights.length === 17) {
              if (ct === 'LAB' || ct === 'PRACTICAL') {
                const labCiaFallback = Number(DEFAULT_INTERNAL_MAPPING.weights[1] ?? 3);
                const modelFallback = Number(DEFAULT_INTERNAL_MAPPING.weights[16] ?? 4);
                const pickLabCia = (legacy: unknown) => {
                  const n = Number(legacy);
                  if (Number.isFinite(n) && n >= 2.9 && n <= 5) return n;
                  return labCiaFallback;
                };
                const co1Cia = pickLabCia(arr[0]);
                const co2Cia = pickLabCia(arr[1]);
                const co3Cia = pickLabCia(arr[3]);
                const co4Cia = pickLabCia(arr[6]);
                const meCo5Raw = Number(arr[12]);
                const meCo5 = Number.isFinite(meCo5Raw) && meCo5Raw > 0 ? meCo5Raw : modelFallback;
                arr = [0, co1Cia, 0, 0, co2Cia, 0, 0, co3Cia, 0, 0, co4Cia, 0, 0, 0, 0, 0, meCo5];
              } else {
                const [co1Ssa, co1Cia, co1Fa] = splitCycleWeight(arr[0] || 0, ssa1W, cia1W, fa1W);
                const [co2Ssa, co2Cia, co2Fa] = splitCycleWeight(arr[1] || 0, ssa1W, cia1W, fa1W);
                arr = [co1Ssa, co1Cia, co1Fa, co2Ssa, co2Cia, co2Fa, ...arr.slice(2)];
              }
            }

            // TCPL: upgrade 17-slot → 21-slot by inserting 0 for CIA Exam slots.
            if (ct === 'TCPL' && arr.length === DEFAULT_INTERNAL_MAPPING.weights.length) {
              const upgraded: number[] = [];
              for (let co = 0; co < 4; co++) {
                const base = co * 3;
                const [labWeight, ciaExamWeight] = splitLegacyTcplCombinedWeight(arr[base + 2]);
                upgraded.push(arr[base] ?? 0, arr[base + 1] ?? 0, labWeight, ciaExamWeight);
              }
              upgraded.push(...arr.slice(12, 17));
              arr = upgraded;
            }
            const tcplSlotLen = 21;
            const slotLen = ct === 'TCPL' ? tcplSlotLen : DEFAULT_INTERNAL_MAPPING.weights.length;
            while (arr.length < slotLen) arr.push(ct === 'TCPL' ? 0 : (DEFAULT_INTERNAL_MAPPING.weights[arr.length] ?? 0));
            if (ct === 'LAB' || ct === 'PRACTICAL') {
              arr = sanitizeLabPractical(arr);
            }
            setInternalMarkWeights(arr.slice(0, slotLen));
          } else {
            setInternalMarkWeights(ct === 'TCPL'
              ? [1, 3.25, 2, 1.5, 1, 3.25, 2, 1.5, 1, 3.25, 2, 1.5, 1, 3.25, 2, 1.5, 3, 3, 3, 3, 7]
              : [...DEFAULT_INTERNAL_MAPPING.weights]);
          }
          return true;
        };

        // Prefer server; fallback to localStorage (used when server save isn't available)
        try {
          const remote = await fetchClassTypeWeights();
          if (!mounted) return;
          const wRemote = (remote && (remote as any)[ct]) || null;
          if (applyWeights(wRemote)) return;
        } catch {
          // ignore
        }

        try {
          const local = lsGet<any>('iqac_class_type_weights');
          const wLocal = (local && (local as any)[ct]) || null;
          if (applyWeights(wLocal)) return;
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [effectiveClassType]);

  useEffect(() => {
    let mounted = true;
    const loadRoster = async () => {
      if (!selectedTaId) return;
      setLoadingRoster(true);
      setRosterError(null);
      try {
        // Always use the backend roster endpoint — it handles both section-based
        // and elective TAs, and also filters by batch when applicable.
        const resp = await fetchTeachingAssignmentRoster(selectedTaId);
        if (!mounted) return;
        const roster = (resp.students || [])
          .map((s: TeachingAssignmentRosterStudent) => ({
            id: Number(s.id),
            reg_no: String(s.reg_no ?? ''),
            name: String(s.name ?? ''),
            section: s.section ?? null,
          }))
          .filter((s) => Number.isFinite(s.id))
          .sort(compareStudentName);
        setStudents(roster);
      } catch (e: any) {
        if (!mounted) return;
        setStudents([]);
        setRosterError(e?.message || 'Failed to load roster');
      } finally {
        if (mounted) setLoadingRoster(false);
      }
    };
    loadRoster();
    return () => { mounted = false; };
  }, [selectedTaId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingData(true);
      setDataError(null);
      try {
        const ct = effectiveClassType;
        const taId = selectedTaId ?? undefined;
        const isTcpl = ct === 'TCPL';
        const isTcpr = ct === 'TCPR';
        const isProject = ct === 'PROJECT';
        const isLabLike = ct === 'LAB' || ct === 'PRACTICAL';
        const isSpecial = ct === 'SPECIAL' && enabledSet.size;
        const allow = (k: string) => (!isSpecial ? true : enabledSet.has(String(k).toLowerCase()));

        // reset optional snapshots to avoid stale render between class type switches
        setPublishedReview({ r1: {}, r2: {} });
        setPublishedPrblModel({});
        setPublishedLab({ cia1: null, cia2: null, model: null });
        setPublishedTcplLab({ lab1: null, lab2: null });
        setPublishedModel(null);
        setIqacCiaPattern({ cia1: null, cia2: null });
        setIqacModelPattern(null);

        // Preload IQAC QP patterns (CIA entry uses these to override question maxima/count).
        // Internal Marks must match the same question definitions, especially when drafts exist
        // (draft snapshots don't store `questions`).
        const qpForPattern = ct === 'THEORY' ? (qpTypeNorm || null) : null;
        const fetchPattern = async (exam: 'CIA1' | 'CIA2'): Promise<IqacPattern | null> => {
          if (!ct) return null;
          let best: IqacPattern | null = null;
          try {
            const r: any = await fetchIqacQpPattern({ class_type: String(ct).toUpperCase(), question_paper_type: qpForPattern, exam });
            const p = r && (r as any).pattern;
            if (p && ((Array.isArray(p.marks) && p.marks.length) || (Array.isArray(p.cos) && p.cos.length))) {
              best = p as IqacPattern;
            }
          } catch {
            // ignore and fallback
          }
          if (!best) {
            try {
              const r: any = await fetchIqacQpPattern({ class_type: String(ct).toUpperCase(), question_paper_type: qpForPattern, exam: 'CIA' as any });
              const p = r && (r as any).pattern;
              if (p && ((Array.isArray(p.marks) && p.marks.length) || (Array.isArray(p.cos) && p.cos.length))) {
                best = p as IqacPattern;
              }
            } catch {
              // ignore
            }
          }
          return best;
        };

        try {
          const [p1, p2] = await Promise.all([fetchPattern('CIA1'), fetchPattern('CIA2')]);
          if (mounted) setIqacCiaPattern({ cia1: p1, cia2: p2 });
        } catch {
          if (mounted) setIqacCiaPattern({ cia1: null, cia2: null });
        }

        let ssa1Res: any = null;
        let ssa2Res: any = null;
        let f1Res: any = null;
        let f2Res: any = null;
        let cia1Res: any = null;
        let cia2Res: any = null;

        let review1Res: any = null;
        let review2Res: any = null;

        let labCia1Res: any = null;
        let labCia2Res: any = null;
        let labModelRes: any = null;

        let tcplLab1Res: any = null;
        let tcplLab2Res: any = null;
        let modelRes: any = null;

        // If an assessment is already published (lock exists + is_published), prefer
        // the published snapshot over any stale draft that might still be present.
        const lockByAssessment: Record<string, { is_published: boolean } | null> = {};
        try {
          const needLocks: Array<string> = [];
          if (allow('ssa1')) needLocks.push('ssa1');
          if (allow('ssa2')) needLocks.push('ssa2');
          if (allow('formative1')) needLocks.push('formative1');
          if (allow('formative2')) needLocks.push('formative2');
          if (allow('cia1')) needLocks.push('cia1');
          if (allow('cia2')) needLocks.push('cia2');
          needLocks.push('model');
          if (isTcpr || isProject) {
            needLocks.push('review1');
            needLocks.push('review2');
          }

          const lockResults = await Promise.all(
            needLocks.map(async (a) => {
              try {
                const res: any = await fetchMarkTableLockStatus(a as any, courseId, taId);
                return [a, res] as const;
              } catch {
                return [a, null] as const;
              }
            }),
          );
          for (const [a, res] of lockResults) {
            lockByAssessment[a] = res;
          }
        } catch {
          // ignore lock errors; fallback to existing draft-first behavior
        }

        const preferPublished = (assessment: string) => Boolean(lockByAssessment[assessment]?.is_published);

        if (isLabLike) {
          // LAB / PRACTICAL uses lab-style sheets for CIA1/CIA2/MODEL
          if (!preferPublished('cia1')) {
            try { const d = await fetchDraft('cia1', courseId, taId); if (d?.draft) labCia1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          }
          if (!preferPublished('cia2')) {
            try { const d = await fetchDraft('cia2', courseId, taId); if (d?.draft) labCia2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          }
          if (!preferPublished('model')) {
            try { const d = await fetchDraft('model', courseId, taId); if (d?.draft) labModelRes = { data: (d.draft as any).data ?? d.draft }; } catch {}
          }
          if (!labCia1Res?.data) {
            try { labCia1Res = await fetchPublishedLabSheet('cia1', courseId, taId); } catch { labCia1Res = null; }
          }
          if (!labCia2Res?.data) {
            try { labCia2Res = await fetchPublishedLabSheet('cia2', courseId, taId); } catch { labCia2Res = null; }
          }
          if (!labModelRes?.data) {
            try { labModelRes = await fetchPublishedModelSheet(courseId, taId); } catch { labModelRes = null; }
          }

          if (!mounted) return;
          setPublishedLab({
            cia1: (labCia1Res as any)?.data ?? null,
            cia2: (labCia2Res as any)?.data ?? null,
            model: (labModelRes as any)?.data ?? null,
          });

          // No SSA/Formative/CIA sheet snapshots needed for lab-like.
          setPublished({ ssa1: {}, ssa2: {}, f1: {}, f2: {}, cia1: null, cia2: null });
          setSsaCoSplits({ ssa1: {}, ssa2: {} });
          return;
        }

        // Prefer entered/draft marks (staff view), fallback to published.
        // Also extract per-CO splits from draft rows when available.
        let ssa1CoSplitsLocal: Record<string, any> = {};
        let ssa2CoSplitsLocal: Record<string, any> = {};
        if (allow('ssa1')) {
          if (!preferPublished('ssa1')) {
            try {
              const d = await fetchDraft('ssa1', courseId, taId);
              if (d?.draft) {
                if ((d.draft as any).marks) ssa1Res = { marks: (d.draft as any).marks };
                // Extract per-CO splits from draft rows
                const draftSheet = (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft;
                const rows = draftSheet?.rows || [];
                if (Array.isArray(rows)) {
                  for (const r of rows) {
                    const sid = String(r?.studentId ?? '');
                    if (!sid) continue;
                    const co1 = toNumOrNull(r?.co1);
                    const co2 = toNumOrNull(r?.co2);
                    if (co1 != null && co2 != null) ssa1CoSplitsLocal[sid] = { co1, co2 };
                  }
                }
              }
            } catch {}
          }
        }
        if (allow('ssa2')) {
          if (!preferPublished('ssa2')) {
            try {
              const d = await fetchDraft('ssa2', courseId, taId);
              if (d?.draft) {
                if ((d.draft as any).marks) ssa2Res = { marks: (d.draft as any).marks };
                const draftSheet = (d.draft as any).data ?? (d.draft as any).sheet ?? d.draft;
                const rows = draftSheet?.rows || [];
                if (Array.isArray(rows)) {
                  for (const r of rows) {
                    const sid = String(r?.studentId ?? '');
                    if (!sid) continue;
                    const co3 = toNumOrNull(r?.co3);
                    const co4 = toNumOrNull(r?.co4);
                    if (co3 != null && co4 != null) ssa2CoSplitsLocal[sid] = { co3, co4 };
                  }
                }
              }
            } catch {}
          }
        }

        if (allow('ssa1') && !ssa1Res?.marks) {
          try { ssa1Res = await fetchPublishedSsa1(courseId, taId); } catch { ssa1Res = null; }
        }
        if (allow('ssa2') && !ssa2Res?.marks) {
          try { ssa2Res = await fetchPublishedSsa2(courseId, taId); } catch { ssa2Res = null; }
        }

        if (isTcpr || isProject) {
          if (isProject) {
            if (!preferPublished('review1')) {
              try {
                const d = await fetchDraft('review1', courseId, taId);
                if (d?.draft) review1Res = d.draft;
              } catch {}
            }
            if (!preferPublished('review2')) {
              try {
                const d = await fetchDraft('review2', courseId, taId);
                if (d?.draft) review2Res = d.draft;
              } catch {}
            }
            if (!review1Res) {
              try { review1Res = (await fetchPublishedLabSheet('review1', courseId, taId))?.data ?? null; } catch { review1Res = null; }
            }
            if (!review2Res) {
              try { review2Res = (await fetchPublishedLabSheet('review2', courseId, taId))?.data ?? null; } catch { review2Res = null; }
            }
            if (!mounted) return;
            setPublishedReview({ r1: extractProjectReviewMarks(review1Res), r2: extractProjectReviewMarks(review2Res) });

            // PRBL: Also load model assessment (stored via LabEntry format)
            if (isPrbl) {
              let prblModelRes: any = null;
              if (!preferPublished('model')) {
                try {
                  const d = await fetchDraft('model', courseId, taId);
                  if (d?.draft) prblModelRes = d.draft;
                } catch {}
              }
              if (!prblModelRes) {
                try { prblModelRes = (await fetchPublishedLabSheet('model', courseId, taId))?.data ?? null; } catch { prblModelRes = null; }
              }
              if (mounted) setPublishedPrblModel(extractProjectReviewMarks(prblModelRes));
            }
          } else {
            if (!preferPublished('review1')) {
              try {
                const d = await fetchDraft('review1', courseId, taId);
                if (d?.draft) {
                  const coSplits = extractTcprReviewCoSplits(d.draft, ['co1', 'co2']);
                  const marks = (d.draft as any).marks;
                  if ((marks && typeof marks === 'object') || Object.keys(coSplits).length) {
                    review1Res = { marks: marks || {}, co_splits: coSplits };
                  }
                }
              } catch {}
            }
            if (!preferPublished('review2')) {
              try {
                const d = await fetchDraft('review2', courseId, taId);
                if (d?.draft) {
                  const coSplits = extractTcprReviewCoSplits(d.draft, ['co3', 'co4']);
                  const marks = (d.draft as any).marks;
                  if ((marks && typeof marks === 'object') || Object.keys(coSplits).length) {
                    review2Res = { marks: marks || {}, co_splits: coSplits };
                  }
                }
              } catch {}
            }
            if (!review1Res?.marks) {
              try { review1Res = await fetchPublishedReview1(courseId, taId); } catch { review1Res = null; }
            }
            if (!review2Res?.marks) {
              try { review2Res = await fetchPublishedReview2(courseId, taId); } catch { review2Res = null; }
            }
            if (!mounted) return;
            setPublishedReview({ 
              r1: { ...review1Res?.marks, co_splits: review1Res?.co_splits || {} }, 
              r2: { ...review2Res?.marks, co_splits: review2Res?.co_splits || {} } 
            });
          }
        }

        if (isTcpl) {
          try { const d = await fetchDraft('formative1', courseId, taId); if (d?.draft) tcplLab1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          try { const d = await fetchDraft('formative2', courseId, taId); if (d?.draft) tcplLab2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          if (!tcplLab1Res?.data) {
            try { tcplLab1Res = await fetchPublishedLabSheet('formative1', courseId, taId); } catch { tcplLab1Res = null; }
          }
          if (!tcplLab2Res?.data) {
            try { tcplLab2Res = await fetchPublishedLabSheet('formative2', courseId, taId); } catch { tcplLab2Res = null; }
          }

          if (!mounted) return;
          setPublishedTcplLab({ lab1: (tcplLab1Res as any)?.data ?? null, lab2: (tcplLab2Res as any)?.data ?? null });
        } else {
          if (!isTcpr && !isProject && allow('formative1')) {
            if (!preferPublished('formative1')) {
              try { const d = await fetchDraft('formative1', courseId, taId); if (d?.draft && (d.draft as any).marks) f1Res = { marks: (d.draft as any).marks }; } catch {}
            }
            if (!f1Res?.marks) {
              try { f1Res = await fetchPublishedFormative('formative1', courseId, taId); } catch { f1Res = null; }
            }
          }
          if (!isTcpr && !isProject && allow('formative2')) {
            if (!preferPublished('formative2')) {
              try { const d = await fetchDraft('formative2', courseId, taId); if (d?.draft && (d.draft as any).marks) f2Res = { marks: (d.draft as any).marks }; } catch {}
            }
            if (!f2Res?.marks) {
              try { f2Res = await fetchPublishedFormative('formative2', courseId, taId); } catch { f2Res = null; }
            }
          }
        }

        if (allow('cia1')) {
          if (!preferPublished('cia1')) {
            try { const d = await fetchDraft('cia1', courseId, taId); if (d?.draft) cia1Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          }
          if (!cia1Res?.data) {
            try { cia1Res = await fetchPublishedCiaSheet('cia1', courseId, taId); } catch { cia1Res = null; }
          }
        }
        if (allow('cia2')) {
          if (!preferPublished('cia2')) {
            try { const d = await fetchDraft('cia2', courseId, taId); if (d?.draft) cia2Res = { data: (d.draft as any).data ?? d.draft }; } catch {}
          }
          if (!cia2Res?.data) {
            try { cia2Res = await fetchPublishedCiaSheet('cia2', courseId, taId); } catch { cia2Res = null; }
          }
        }

        if (!preferPublished('model')) {
          try { const d = await fetchDraft('model', courseId, taId); if (d?.draft) modelRes = { data: (d.draft as any).data ?? d.draft }; } catch {}
        }
        if (!modelRes?.data) {
          try { modelRes = await fetchPublishedModelSheet(courseId, taId); } catch { modelRes = null; }
        }

        try {
          const modelPayload = (modelRes as any)?.data;
          const modelQpTypeRaw = String((modelPayload as any)?.qpType || '').trim().toUpperCase();
          // Prefer the component-level qpTypeNorm (from CourseOBEPage) which preserves full QP type e.g. QP1FINAL.
          // Fall back to the model payload's qpType if available.
          const modelQpType = qpTypeNorm || modelQpTypeRaw || null;
          const modelClass = String((ct || '')).toUpperCase();
          const modelPatternRes: any = await fetchIqacQpPattern({
            class_type: modelClass,
            question_paper_type: modelClass === 'THEORY' ? modelQpType : null,
            exam: 'MODEL',
          });
          const pattern = modelPatternRes?.pattern;
          if (pattern && Array.isArray(pattern.marks) && pattern.marks.length) {
            if (mounted) setIqacModelPattern(pattern as IqacPattern);
          }
        } catch {
          // ignore and fallback to defaults
        }

        if (!mounted) return;
        setPublished({
          ssa1: ssa1Res?.marks || {},
          ssa2: ssa2Res?.marks || {},
          f1: (f1Res?.marks || {}) || {},
          f2: (f2Res?.marks || {}) || {},
          cia1: cia1Res?.data || null,
          cia2: cia2Res?.data || null,
        });
        // Per-CO splits: prefer draft-extracted splits, then backend co_splits from published endpoint.
        const backendSsa1Splits = (ssa1Res as any)?.co_splits && typeof (ssa1Res as any).co_splits === 'object' ? (ssa1Res as any).co_splits : {};
        const backendSsa2Splits = (ssa2Res as any)?.co_splits && typeof (ssa2Res as any).co_splits === 'object' ? (ssa2Res as any).co_splits : {};
        setSsaCoSplits({
          ssa1: { ...backendSsa1Splits, ...ssa1CoSplitsLocal },
          ssa2: { ...backendSsa2Splits, ...ssa2CoSplitsLocal },
        });
        setPublishedModel(modelRes?.data || null);
      } catch (e: any) {
        if (!mounted) return;
        setDataError(e?.message || 'Failed to load marks');
      } finally {
        if (mounted) setLoadingData(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [courseId, effectiveClassType, enabledSet, selectedTaId, reloadCounter, qpTypeNorm]);

  const schema = useMemo(() => buildInternalSchema(effectiveClassType, enabledSet, isPrbl, isQp1Final), [effectiveClassType, enabledSet, isPrbl, isQp1Final]);

  // QP1 FINAL YEAR fixed weights: CO1(2+4+3)=9, CO2(1+2+2+1+2+2)=10, CO3(2+4+3)=9, ME(4+4+4)=12.  Total=40.
  const QP1FINAL_WEIGHTS = [2, 4, 3, 1, 2, 2, 1, 2, 2, 2, 4, 3, 4, 4, 4];

  const effMapping = useMemo(() => {
    // TCPL uses 21 weight slots; all other class types use 17.
    const isTcplScheme = effectiveClassType === 'TCPL';
    const maxSlot = isTcplScheme ? 21 : DEFAULT_INTERNAL_MAPPING.weights.length;
    const weightsArr = Array.isArray(internalMarkWeights) && internalMarkWeights.length ? internalMarkWeights : DEFAULT_INTERNAL_MAPPING.weights;
    const weightsAll = weightsArr.slice(0, maxSlot);
    while (weightsAll.length < maxSlot) weightsAll.push(0);
    const weights = isQp1Final
      ? QP1FINAL_WEIGHTS
      : effectiveClassType === 'PROJECT'
        ? (isPrbl ? [3, 12, 3, 12, 30] : [30, 30])
        : schema.visible.map((i) => weightsAll[i] ?? 0);
    return { header: schema.header, weights, cycles: schema.cycles, visible: schema.visible, labels: schema.labels };
  }, [internalMarkWeights, schema, effectiveClassType, isPrbl, isQp1Final]);

  const maxTotal = useMemo(() => {
    const w = effMapping.weights.map((x: any) => Number(x) || 0);
    return w.reduce((s, n) => s + n, 0);
  }, [effMapping]);

  const publishedCoSet = useMemo(() => {
    const nums = (cqiPublished?.coNumbers || [])
      .filter((n) => typeof n === 'number' && Number.isFinite(n))
      .map((n) => Number(n));
    return new Set<number>(nums.filter((n) => n >= 1 && n <= 20));
  }, [cqiPublished]);

  const THRESHOLD_PERCENT = 58;
  // CQI rates: below threshold → 60%, at/above threshold → 15%
  const CQI_BELOW_RATE = 0.6;
  const CQI_ABOVE_RATE = 0.15;

  const displayCols = useMemo(() => {
    const labels = Array.isArray((effMapping as any)?.labels) ? ((effMapping as any).labels as string[]) : [];
    const header = Array.isArray((effMapping as any)?.header) ? ((effMapping as any).header as any[]) : [];
    const cycles = Array.isArray((effMapping as any)?.cycles) ? ((effMapping as any).cycles as any[]) : [];
    const weightsRow = Array.isArray((effMapping as any)?.weights) ? ((effMapping as any).weights as any[]) : [];
    const shouldMergeForCqi = activeTab === 'after-cqi';

    const out: Array<{
      key: string;
      indices: number[];
      header: string;
      cycle: string;
      weight: number;
      isMerged: boolean;
      co?: number;
    }> = [];

    // Extract CO number from any label format:
    //   "CO1-SSA" → 1, "CO2-CIA(C1)" → 2, "ME-CO3" → 3, etc.
    const getCoFromLabel = (lab: string): number | null => {
      const m1 = /^CO(\d+)/i.exec(lab);
      if (m1) return Number(m1[1]);
      const m2 = /ME-CO(\d+)/i.exec(lab);
      if (m2) return Number(m2[1]);
      return null;
    };

    if (shouldMergeForCqi) {
      // Final (With CQI) tab: merge ALL sub-columns (SSA+CIA+FA+ME) by CO number.
      // QP1FINAL → 3 columns (CO1, CO2, CO3), regular theory → 5 columns (CO1–CO5).
      const mergedDone = new Set<number>();
      for (let i = 0; i < labels.length; i++) {
        const lab = String(labels[i] || '').trim();
        const co = getCoFromLabel(lab);
        if (co != null) {
          if (mergedDone.has(co)) continue;
          const idxs: number[] = [];
          for (let j = 0; j < labels.length; j++) {
            if (getCoFromLabel(String(labels[j] || '').trim()) === co) idxs.push(j);
          }
          idxs.sort((a, b) => a - b);
          const wSum = round2(idxs.reduce((s, idx) => s + (Number(weightsRow[idx]) || 0), 0));
          out.push({
            key: `merged-co-${co}`,
            indices: idxs,
            header: `CO${co}`,
            cycle: 'Total',
            weight: wSum,
            isMerged: true,
            co,
          });
          mergedDone.add(co);
        } else {
          // Non-CO column (e.g. project reviews): keep as individual column
          out.push({
            key: `col-${i}`,
            indices: [i],
            header: String(header[i] ?? ''),
            cycle: String(cycles[i] ?? ''),
            weight: Number(weightsRow[i] ?? 0) || 0,
            isMerged: false,
          });
        }
      }
    } else {
      // Before CQI tab: show all individual columns (SSA, CIA, FA, ME separately)
      for (let i = 0; i < labels.length; i++) {
        out.push({
          key: `col-${i}`,
          indices: [i],
          header: String(header[i] ?? ''),
          cycle: String(cycles[i] ?? ''),
          weight: Number(weightsRow[i] ?? 0) || 0,
          isMerged: false,
        });
      }
    }

    return out;
  }, [effMapping, publishedCoSet, activeTab]);

  const getDisplayValue = (rowCells: any[], col: { indices: number[]; isMerged: boolean }): number | null => {
    const cells = Array.isArray(rowCells) ? rowCells : [];
    if (!col.indices.length) return null;
    if (!col.isMerged) {
      const v = cells[col.indices[0]];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }

    const vals = col.indices.map((idx) => cells[idx]);
    const hasAny = vals.some((v) => typeof v === 'number' && Number.isFinite(v));
    if (!hasAny) return null;
    const sum = vals.reduce((s, v) => s + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);
    return round2(sum);
  };

  const computeCqiAdd = (args: { coValue: number; coMax: number; input: number | null | undefined }): number => {
    const { coValue, coMax, input } = args;
    if (input == null) return 0;
    const inp = Number(input);
    if (!Number.isFinite(inp) || inp <= 0) return 0;
    if (!coMax || !Number.isFinite(coMax) || coMax <= 0) return 0;
    const pct = (Number(coValue) / Number(coMax)) * 100;

    if (Number.isFinite(pct) && pct < THRESHOLD_PERCENT) {
      // Below threshold: CQI mark (out of 10) × 0.6, cap the CO at threshold%
      const rawAdd = inp * CQI_BELOW_RATE;
      const cap = (coMax * THRESHOLD_PERCENT) / 100;
      const maxAllowed = Math.max(0, cap - Number(coValue));
      const add = Math.min(rawAdd, maxAllowed);
      return Number.isFinite(add) && add > 0 ? add : 0;
    } else {
      // At or above threshold: CQI mark (out of 10) × 0.15, no cap
      const add = inp * CQI_ABOVE_RATE;
      return Number.isFinite(add) && add > 0 ? add : 0;
    }
  };

  const computedRows = useMemo(() => {
    const ct = effectiveClassType;

    // Map the visible weights back into their slot positions.
    // TCPL uses 21 slots (SSA/CIA/LAB/CIAExam per CO + ME×5); all others use 17.
    const isTcpl = ct === 'TCPL';
    const wFullLen = isTcpl ? 21 : 17;
    const wFull = new Array(wFullLen).fill(0);
    for (let i = 0; i < effMapping.visible.length; i++) {
      const idx = effMapping.visible[i];
      if (idx < wFull.length) wFull[idx] = Number(effMapping.weights[i]) || 0;
    }
    // TCPL 21-slot: CO1=[0..3], CO2=[4..7], CO3=[8..11], CO4=[12..15], ME=[16..20]
    // Other 17-slot: CO1=[0..2], CO2=[3..5], CO3=[6..8], CO4=[9..11], ME=[12..16]
    const wCo1Ssa = wFull[0] || 0;
    const wCo1Cia = wFull[1] || 0;
    const wCo1Fa = wFull[2] || 0;
    const wCo1CiaExam = isTcpl ? (wFull[3] || 0) : 0;
    const wCo2Ssa = wFull[isTcpl ? 4 : 3] || 0;
    const wCo2Cia = wFull[isTcpl ? 5 : 4] || 0;
    const wCo2Fa = wFull[isTcpl ? 6 : 5] || 0;
    const wCo2CiaExam = isTcpl ? (wFull[7] || 0) : 0;
    const wCo3Ssa = wFull[isTcpl ? 8 : 6] || 0;
    const wCo3Cia = wFull[isTcpl ? 9 : 7] || 0;
    const wCo3Fa = wFull[isTcpl ? 10 : 8] || 0;
    const wCo3CiaExam = isTcpl ? (wFull[11] || 0) : 0;
    const wCo4Ssa = wFull[isTcpl ? 12 : 9] || 0;
    const wCo4Cia = wFull[isTcpl ? 13 : 10] || 0;
    const wCo4Fa = wFull[isTcpl ? 14 : 11] || 0;
    const wCo4CiaExam = isTcpl ? (wFull[15] || 0) : 0;
    const wMeCo1 = wFull[isTcpl ? 16 : 12] || 0;
    const wMeCo2 = wFull[isTcpl ? 17 : 13] || 0;
    const wMeCo3 = wFull[isTcpl ? 18 : 14] || 0;
    const wMeCo4 = wFull[isTcpl ? 19 : 15] || 0;
    const wMeCo5 = wFull[isTcpl ? 20 : 16] || 0;

    const cia1Snap = published.cia1 && typeof published.cia1 === 'object' ? published.cia1 : null;
    const cia2Snap = published.cia2 && typeof published.cia2 === 'object' ? published.cia2 : null;

    const iqacCia1 = iqacCiaPattern?.cia1;
    const iqacCia2 = iqacCiaPattern?.cia2;
    const masterCia1Questions: QuestionDef[] = Array.isArray(masterCfg?.assessments?.cia1?.questions)
      ? (masterCfg.assessments.cia1.questions as any[])
          .map((q: any) => ({ key: String(q?.key || ''), max: Number(q?.max ?? q?.maxMarks ?? 0), co: parseCo12(q?.co) as any }))
          .filter((q: any) => q.key)
      : [];
    const masterCia2Questions: QuestionDef34[] = Array.isArray(masterCfg?.assessments?.cia2?.questions)
      ? (masterCfg.assessments.cia2.questions as any[])
          .map((q: any) => ({
            key: String(q?.key || ''),
            max: Number(q?.max ?? q?.maxMarks ?? 0),
            co: (isQp1Final ? q?.co : parseCo34(q?.co)) as any,
          }))
          .filter((q: any) => q.key)
      : [];

    const fromIqacCia1: QuestionDef[] = (iqacCia1 && Array.isArray(iqacCia1.marks) && iqacCia1.marks.length)
      ? iqacCia1.marks
          .map((mx, idx) => {
            const fallback = masterCia1Questions[idx];
            const coRaw = Array.isArray(iqacCia1.cos) ? iqacCia1.cos[idx] : undefined;
            return {
              key: `q${idx + 1}`,
              max: Number(mx) || 0,
              co: (coRaw != null ? parseCo12(coRaw) : (fallback?.co ?? 1)) as any,
            };
          })
          .filter((q) => Boolean(q.key))
      : [];

    const fromIqacCia2: QuestionDef34[] = (iqacCia2 && Array.isArray(iqacCia2.marks) && iqacCia2.marks.length)
      ? iqacCia2.marks
          .map((mx, idx) => {
            const fallback = masterCia2Questions[idx];
            const coRaw = Array.isArray(iqacCia2.cos) ? iqacCia2.cos[idx] : undefined;
            return {
              key: `q${idx + 1}`,
              max: Number(mx) || 0,
              co: (isQp1Final
                ? (coRaw != null ? coRaw : (fallback?.co ?? 2))
                : (coRaw != null ? parseCo34(coRaw) : (fallback?.co ?? 3))) as any,
            };
          })
          .filter((q) => Boolean(q.key))
      : [];

    // When building questions from snapshot, overlay IQAC COs AND marks if available (snapshot may have stale COs/marks).
    const iqacCia1Cos = Array.isArray(iqacCia1?.cos) ? iqacCia1.cos : null;
    const iqacCia2Cos = Array.isArray(iqacCia2?.cos) ? iqacCia2.cos : null;
    const iqacCia1Marks = Array.isArray(iqacCia1?.marks) ? iqacCia1.marks : null;
    const iqacCia2Marks = Array.isArray(iqacCia2?.marks) ? iqacCia2.marks : null;

    // If IQAC pattern exists, prefer IQAC-based questions.
    const cia1SnapQuestions = Array.isArray(cia1Snap?.questions) ? cia1Snap.questions : null;
    const cia2SnapQuestions = Array.isArray(cia2Snap?.questions) ? cia2Snap.questions : null;
    const cia1QuestionsSource = cia1SnapQuestions
      ? (iqacCia1Marks && iqacCia1Marks.length > 0
          ? iqacCia1Marks.map((mx: any, idx: number) => ({ key: `q${idx + 1}`, max: Number(mx) || 0, co: cia1SnapQuestions[idx]?.co }))
          : cia1SnapQuestions)
      : null;
    const cia2QuestionsSource = cia2SnapQuestions
      ? (iqacCia2Marks && iqacCia2Marks.length > 0
          ? iqacCia2Marks.map((mx: any, idx: number) => ({ key: `q${idx + 1}`, max: Number(mx) || 0, co: cia2SnapQuestions[idx]?.co }))
          : cia2SnapQuestions)
      : null;

    const cia1Questions: QuestionDef[] = cia1QuestionsSource
      ? cia1QuestionsSource.map((q: any, idx: number) => ({
          key: String(q?.key || `q${idx + 1}`),
          max: (iqacCia1Marks && iqacCia1Marks[idx] != null && Number(iqacCia1Marks[idx]) > 0)
            ? Number(iqacCia1Marks[idx])
            : Number(q?.max ?? q?.maxMarks ?? 0),
          co: (iqacCia1Cos && iqacCia1Cos[idx] != null ? parseCo12(iqacCia1Cos[idx]) : parseCo12(q?.co)) as any,
        })).filter((q: any) => q.key)
      : (fromIqacCia1.length ? fromIqacCia1 : (masterCia1Questions.length ? masterCia1Questions : DEFAULT_CIA1_QUESTIONS));
    const cia2Questions: QuestionDef34[] = cia2QuestionsSource
      ? cia2QuestionsSource.map((q: any, idx: number) => ({
          key: String(q?.key || `q${idx + 1}`),
          max: (iqacCia2Marks && iqacCia2Marks[idx] != null && Number(iqacCia2Marks[idx]) > 0)
            ? Number(iqacCia2Marks[idx])
            : Number(q?.max ?? q?.maxMarks ?? 0),
          co: (isQp1Final
            ? (iqacCia2Cos && iqacCia2Cos[idx] != null ? iqacCia2Cos[idx] : q?.co)
            : (iqacCia2Cos && iqacCia2Cos[idx] != null ? parseCo34(iqacCia2Cos[idx]) : parseCo34(q?.co))) as any,
        })).filter((q: any) => q.key)
      : (fromIqacCia2.length ? fromIqacCia2 : (masterCia2Questions.length ? masterCia2Questions : DEFAULT_CIA2_QUESTIONS));

    const qp1FinalCia2Offset = isQp1Final
      ? (() => {
          const maxCoSeen = Math.max(0, ...cia2Questions.map((q: any) => Math.max(0, ...parseQuestionCoNumbers(q?.co))));
          return maxCoSeen > 0 && maxCoSeen <= 2 ? 1 : 0;
        })()
      : 0;

    const qp1FinalQuestionWeight = (q: any, targetCoNum: number, offset = 0) => {
      const coNums = parseQuestionCoNumbers(q?.co).map((n: number) => n + offset);
      if (coNums.length === 1 && coNums[0] === targetCoNum) return 1;
      if (coNums.length > 1 && coNums.includes(targetCoNum)) return 1 / coNums.length;
      return 0;
    };

    const cia1ById: Record<string, any> = cia1Snap?.rowsByStudentId && typeof cia1Snap.rowsByStudentId === 'object' ? cia1Snap.rowsByStudentId : {};
    const cia2ById: Record<string, any> = cia2Snap?.rowsByStudentId && typeof cia2Snap.rowsByStudentId === 'object' ? cia2Snap.rowsByStudentId : {};

    const cia1MaxCo = cia1Questions.reduce((s, q, idx) => {
      if (isQp1Final) {
        const rawCoVal = (q as any)?.co;
        const rawCoNum = typeof rawCoVal === 'number' ? rawCoVal : Number(String(rawCoVal ?? '').replace(/[^0-9]/g, '') || '0');
        return rawCoNum === 1 ? s + q.max : s;
      }
      const w = effectiveCoWeights12ForQuestion(cia1Questions, idx);
      return s + q.max * w.co1;
    }, 0);
    const cia1MaxCo2 = cia1Questions.reduce((s, q, idx) => {
      if (isQp1Final) {
        const rawCoVal = (q as any)?.co;
        const rawCoNum = typeof rawCoVal === 'number' ? rawCoVal : Number(String(rawCoVal ?? '').replace(/[^0-9]/g, '') || '0');
        return rawCoNum === 2 ? s + q.max : s;
      }
      const w = effectiveCoWeights12ForQuestion(cia1Questions, idx);
      return s + q.max * w.co2;
    }, 0);
    const cia2MaxCo3 = cia2Questions.reduce((s, q, idx) => {
      if (isQp1Final) return s + q.max * qp1FinalQuestionWeight(q, 2, qp1FinalCia2Offset);
      const w = effectiveCoWeights34ForQuestion(cia2Questions, idx);
      return s + q.max * w.co3;
    }, 0);
    const cia2MaxCo4 = cia2Questions.reduce((s, q, idx) => {
      if (isQp1Final) return s + q.max * qp1FinalQuestionWeight(q, 3, qp1FinalCia2Offset);
      const w = effectiveCoWeights34ForQuestion(cia2Questions, idx);
      return s + q.max * w.co4;
    }, 0);

    const ssa1Cfg = masterCfg?.assessments?.ssa1 || {};
    const ssa2Cfg = masterCfg?.assessments?.ssa2 || {};
    const f1Cfg = masterCfg?.assessments?.formative1 || {};
    const f2Cfg = masterCfg?.assessments?.formative2 || {};
    const cia1Cfg = masterCfg?.assessments?.cia1 || {};
    const cia2Cfg = masterCfg?.assessments?.cia2 || {};

    const ssa1Co1 = Number(ssa1Cfg?.coMax?.co1);
    const ssa1Co2 = Number(ssa1Cfg?.coMax?.co2);
    const ssa2Co3 = Number(ssa2Cfg?.coMax?.co3 ?? ssa2Cfg?.coMax?.co1);
    const ssa2Co4 = Number(ssa2Cfg?.coMax?.co4 ?? ssa2Cfg?.coMax?.co2);

    const cia1Co1 = Number(cia1Cfg?.coMax?.co1);
    const cia1Co2 = Number(cia1Cfg?.coMax?.co2);
    const cia2Co3 = Number(cia2Cfg?.coMax?.co3 ?? cia2Cfg?.coMax?.co1);
    const cia2Co4 = Number(cia2Cfg?.coMax?.co4 ?? cia2Cfg?.coMax?.co2);

    const f1Co = Number(f1Cfg?.maxCo);
    const f2Co = Number(f2Cfg?.maxCo);

    const isTcplCourse = ct === 'TCPL';

    const maxes = {
      ssa1: {
        co1: Number.isFinite(ssa1Co1) ? Math.max(0, ssa1Co1) : 10,
        co2: Number.isFinite(ssa1Co2) ? Math.max(0, ssa1Co2) : 10,
      },
      ssa2: {
        co3: Number.isFinite(ssa2Co3) ? Math.max(0, ssa2Co3) : 10,
        co4: Number.isFinite(ssa2Co4) ? Math.max(0, ssa2Co4) : 10,
      },
      cia1: {
        co1: isTcplCourse
          ? (cia1MaxCo > 0 ? cia1MaxCo : (Number.isFinite(cia1Co1) ? Math.max(0, cia1Co1) : 30))
          : (Number.isFinite(cia1Co1) ? Math.max(0, cia1Co1) : cia1MaxCo),
        co2: isTcplCourse
          ? (cia1MaxCo2 > 0 ? cia1MaxCo2 : (Number.isFinite(cia1Co2) ? Math.max(0, cia1Co2) : 30))
          : (Number.isFinite(cia1Co2) ? Math.max(0, cia1Co2) : cia1MaxCo2),
      },
      cia2: {
        co3: isTcplCourse
          ? (cia2MaxCo3 > 0 ? cia2MaxCo3 : (Number.isFinite(cia2Co3) ? Math.max(0, cia2Co3) : 30))
          : (Number.isFinite(cia2Co3) ? Math.max(0, cia2Co3) : cia2MaxCo3),
        co4: isTcplCourse
          ? (cia2MaxCo4 > 0 ? cia2MaxCo4 : (Number.isFinite(cia2Co4) ? Math.max(0, cia2Co4) : 30))
          : (Number.isFinite(cia2Co4) ? Math.max(0, cia2Co4) : cia2MaxCo4),
      },
      f1: {
        co1: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
        co2: Number.isFinite(f1Co) ? Math.max(0, f1Co) : 10,
      },
      f2: {
        co3: Number.isFinite(f2Co) ? Math.max(0, f2Co) : 10,
        co4: Number.isFinite(f2Co) ? Math.max(0, f2Co) : 10,
      },
      review1: { co1: 15, co2: 15 },
      review2: { co3: 15, co4: 15 },
    };

    const modelIsTcpl = ct === 'TCPL';
    const modelIsTcpr = ct === 'TCPR';
    const modelIsTcplLike = modelIsTcpl || modelIsTcpr;
    const modelPatternMarks = Array.isArray(iqacModelPattern?.marks) ? iqacModelPattern!.marks : null;

    const modelQuestions = (() => {
      if (Array.isArray(modelPatternMarks) && modelPatternMarks.length) {
        return modelPatternMarks.map((mx, idx) => ({ key: `q${idx + 1}`, max: Number(mx) || 0 }));
      }
      if (modelIsTcplLike) {
        const count = modelIsTcpr ? 12 : 15;
        const twoMarkCount = modelIsTcpr ? 8 : 10;
        return Array.from({ length: count }, (_, i) => {
          const idx = i + 1;
          return { key: `q${idx}`, max: idx <= twoMarkCount ? 2 : 16 };
        });
      }
      return MODEL_THEORY_QUESTIONS;
    })();

    const modelCosRow = (() => {
      const cos = Array.isArray(iqacModelPattern?.cos) ? iqacModelPattern!.cos : null;
      if (Array.isArray(cos) && cos.length === modelQuestions.length) {
        return cos.map((v: any) => {
          const n = Number(v);
          if (Number.isFinite(n)) return clamp(Math.round(n), 1, 5);
          const s = String(v ?? '').toUpperCase();
          const m = s.match(/\d+/);
          return m ? clamp(Number(m[0]), 1, 5) : 1;
        });
      }
      if (modelIsTcpr) {
        const base = [1, 1, 2, 2, 3, 3, 4, 4, 1, 2, 3, 4];
        if (modelQuestions.length === base.length) return base;
        return Array.from({ length: modelQuestions.length }, (_, i) => base[i % base.length]);
      }
      if (modelIsTcpl) {
        const base = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 3, 4, 5];
        if (modelQuestions.length === base.length) return base;
        return Array.from({ length: modelQuestions.length }, (_, i) => base[i % base.length]);
      }
      if (modelQuestions.length === MODEL_THEORY_CO_ROW.length) return [...MODEL_THEORY_CO_ROW];
      return Array.from({ length: modelQuestions.length }, (_, i) => MODEL_THEORY_CO_ROW[i % MODEL_THEORY_CO_ROW.length]);
    })();

    const modelQuestionMaxByCo = (() => {
      const out = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
      for (let i = 0; i < modelQuestions.length; i++) {
        const def = modelQuestions[i];
        const co = modelCosRow[i] ?? 1;
        if (co === 1) out.co1 += def.max;
        else if (co === 2) out.co2 += def.max;
        else if (co === 3) out.co3 += def.max;
        else if (co === 4) out.co4 += def.max;
        else if (co === 5) out.co5 += def.max;
      }
      return out;
    })();

    const modelMaxes = (() => {
      const base = { ...modelQuestionMaxByCo };
      if (modelIsTcpr) {
        return { ...base, co5: base.co5 + 30 };
      }
      if (modelIsTcpl) {
        const share = 30 / 5;
        return {
          co1: base.co1 + share,
          co2: base.co2 + share,
          co3: base.co3 + share,
          co4: base.co4 + share,
          co5: base.co5 + share,
        };
      }
      return base;
    })();

    const taKey = String(selectedTaId ?? 'none');
    const modelPayload = publishedModel && typeof publishedModel === 'object' ? publishedModel : null;
    const modelSheet = (() => {
      if (modelPayload) {
        const payloadClassType = normalizeClassType((modelPayload as any)?.classType);
        const payloadTcplLike = payloadClassType === 'TCPL' || payloadClassType === 'TCPR';
        const fromPayload = payloadTcplLike ? (modelPayload as any)?.tcplSheet : (modelPayload as any)?.theorySheet;
        if (fromPayload && typeof fromPayload === 'object') return fromPayload;
      }

      const k1 = `model_theory_sheet_${courseId}_${taKey}`;
      const k2 = `model_theory_sheet_${courseId}_none`;
      const kt1 = `model_tcpl_sheet_${courseId}_${taKey}`;
      const kt2 = `model_tcpl_sheet_${courseId}_none`;
      const kr1 = `model_tcpr_sheet_${courseId}_${taKey}`;
      const kr2 = `model_tcpr_sheet_${courseId}_none`;
      const kLegacy = `model_sheet_${courseId}`;
      const v1 = lsGet<any>(k1);
      if (v1 && typeof v1 === 'object') return v1;
      const v2 = lsGet<any>(k2);
      if (v2 && typeof v2 === 'object') return v2;
      const vt1 = lsGet<any>(kt1);
      if (vt1 && typeof vt1 === 'object') return vt1;
      const vt2 = lsGet<any>(kt2);
      if (vt2 && typeof vt2 === 'object') return vt2;
      const vr1 = lsGet<any>(kr1);
      if (vr1 && typeof vr1 === 'object') return vr1;
      const vr2 = lsGet<any>(kr2);
      if (vr2 && typeof vr2 === 'object') return vr2;
      const v3 = lsGet<any>(kLegacy);
      if (v3 && typeof v3 === 'object') return v3;
      return null;
    })();

    const getModelCoMarks = (s: Student) => {
      const max = modelMaxes;
      if (!modelSheet) return { co1: null, co2: null, co3: null, co4: null, co5: null, max };
      const rowKeyById = `id:${String(s.id)}`;
      const rowKeyByReg = s.reg_no ? `reg:${String(s.reg_no).trim()}` : '';
      const row = (modelSheet as any)[rowKeyById] || (rowKeyByReg ? (modelSheet as any)[rowKeyByReg] : null) || null;
      if (!row || typeof row !== 'object') return { co1: null, co2: null, co3: null, co4: null, co5: null, max };

      const absent = Boolean((row as any).absent);
      const absentKind = String((row as any).absentKind || 'AL').toUpperCase();
      const q = (row as any).q && typeof (row as any).q === 'object' ? (row as any).q : {};
      const labRaw = toNumOrNull((row as any).lab);

      let hasAny = false;
      const sums = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
      for (let i = 0; i < modelQuestions.length; i++) {
        const def = modelQuestions[i];
        const raw = (q as any)[def.key];
        const n = toNumOrNull(raw);
        if (n == null) continue;
        hasAny = true;
        const mark = clamp(n, 0, def.max);
        const co = modelCosRow[i] ?? 1;
        if (co === 1) sums.co1 += mark;
        else if (co === 2) sums.co2 += mark;
        else if (co === 3) sums.co3 += mark;
        else if (co === 4) sums.co4 += mark;
        else if (co === 5) sums.co5 += mark;
      }

      if (modelIsTcplLike && labRaw != null) {
        hasAny = true;
        const lab = clamp(labRaw, 0, 30);
        if (modelIsTcpr) {
          sums.co5 += lab;
        } else {
          const share = lab / 5;
          sums.co1 += share;
          sums.co2 += share;
          sums.co3 += share;
          sums.co4 += share;
          sums.co5 += share;
        }
      }

      if (!hasAny) {
        if (absent && absentKind === 'AL') return { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0, max };
        return { co1: null, co2: null, co3: null, co4: null, co5: null, max };
      }
      if (absent && absentKind === 'AL') return { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0, max };
      return {
        co1: clamp(sums.co1, 0, max.co1),
        co2: clamp(sums.co2, 0, max.co2),
        co3: clamp(sums.co3, 0, max.co3),
        co4: clamp(sums.co4, 0, max.co4),
        co5: clamp(sums.co5, 0, max.co5),
        max,
      };
    };

    const scale = (mark: number | null, max: number, outOf: number) => {
      if (mark == null) return null;
      if (!max || !Number.isFinite(max)) return null;
      return clamp((mark / max) * outOf, 0, outOf);
    };

    // LAB/PRACTICAL: compute from lab-style sheets only
    if (ct === 'LAB' || ct === 'PRACTICAL') {
      const HALF = 30 / 2;
      const readCoPair = (snapshot: any | null, coA: number, coB: number | null) => {
        const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
        const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
        const cfgs = sheet?.coConfigs && typeof sheet.coConfigs === 'object' ? (sheet.coConfigs as any) : null;
        const cfgA = cfgs ? cfgs[String(coA)] : null;
        const cfgB = coB != null && cfgs ? cfgs[String(coB)] : null;
        const legacyExpCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
        const legacyExpCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
        const legacyCoAEnabled = Boolean(sheet?.coAEnabled);
        const legacyCoBEnabled = coB != null ? Boolean(sheet?.coBEnabled !== false) : false;

        const coAEnabled = cfgA ? Boolean(cfgA.enabled) : legacyCoAEnabled;
        const coBEnabled = coB != null ? (cfgB ? Boolean(cfgB.enabled) : legacyCoBEnabled) : false;

        const expCountA = cfgA ? clamp(Number(cfgA.expCount ?? 0), 0, 12) : legacyExpCountA;
        const expCountB = coB != null ? (cfgB ? clamp(Number(cfgB.expCount ?? 0), 0, 12) : legacyExpCountB) : 0;

        const expMaxA = cfgA && Number.isFinite(Number(cfgA.expMax)) ? Number(cfgA.expMax)
          : Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25;
        const expMaxB = coB != null
          ? (cfgB && Number.isFinite(Number(cfgB.expMax)) ? Number(cfgB.expMax)
            : Number.isFinite(Number((sheet as any)?.expMaxB)) ? Number((sheet as any).expMaxB) : 25)
          : 0;

        const ciaEnabled = Boolean((sheet as any)?.ciaExamEnabled !== false);
        const CO_MAX_A = expMaxA + (ciaEnabled ? HALF : 0);
        const CO_MAX_B = coB != null ? expMaxB + (ciaEnabled ? HALF : 0) : 0;

        const normalizeMarksArray = (raw: any) => {
          if (!Array.isArray(raw)) return [] as Array<number | null>;
          return raw.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null));
        };
        const avgMarks = (arr: Array<number | null>) => {
          const nums = (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x)) as number[];
          if (!nums.length) return null;
          return nums.reduce((s, n) => s + n, 0) / nums.length;
        };

        const get = (sid: number) => {
          const row = rowsByStudentId[String(sid)] || {};
          const marksByCo = (row as any)?.marksByCo && typeof (row as any).marksByCo === 'object' ? (row as any).marksByCo : {};
          const rawA = marksByCo?.[String(coA)] ?? (row as any).marksA;
          const rawB = coB != null ? (marksByCo?.[String(coB)] ?? (row as any).marksB) : [];

          const marksA = normalizeMarksArray(rawA).slice(0, coAEnabled ? expCountA : 0);
          const marksB = normalizeMarksArray(rawB).slice(0, coBEnabled ? expCountB : 0);
          const avgA = avgMarks(marksA);
          const avgB = avgMarks(marksB);
          const ciaExamRaw = (row as any)?.ciaExam;
          const ciaExamNum = typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;
          const pairEnabled = coB != null && coBEnabled;
          const ciaDivisor = ciaEnabled ? (pairEnabled ? 2 : 1) : 1;
          const ciaShare = ciaEnabled ? (ciaExamNum ?? 0) / ciaDivisor : 0;
          const ciaShareMax = ciaEnabled ? 30 / ciaDivisor : 0;
          const expTotalA = Math.max(0, expMaxA);
          const expTotalB = Math.max(0, expMaxB);
          const totalA = expTotalA + (coAEnabled ? ciaShareMax : 0);
          const totalB = expTotalB + (pairEnabled ? ciaShareMax : 0);
          const hasAny = avgA != null || avgB != null || ciaExamNum != null;

          const a = !hasAny || !coAEnabled ? null : (avgA ?? 0) + ciaShare;
          const b = !hasAny || !pairEnabled ? null : (avgB ?? 0) + ciaShare;

          return {
            a: a == null ? null : clamp(a, 0, totalA),
            b: b == null ? null : clamp(b, 0, totalB),
          };
        };

        return { get, CO_MAX_A, CO_MAX_B };
      };

      const c1 = readCoPair(publishedLab.cia1, 1, 2);
      const c2 = readCoPair(publishedLab.cia2, 3, 4);
      const m5 = readCoPair(publishedLab.model, 5, null);

      const scale = (mark: number | null, max: number, outOf: number) => {
        if (mark == null) return null;
        if (!max || !Number.isFinite(max)) return null;
        return clamp((mark / max) * outOf, 0, outOf);
      };

      return students.map((s, idx) => {
        const r1 = c1.get(s.id);
        const r2 = c2.get(s.id);
        const r5 = m5.get(s.id);

        const co1Ssa = null;
        const co1Cia = scale(r1.a, c1.CO_MAX_A, wCo1Cia);
        const co1Fa = null;
        const co2Ssa = null;
        const co2Cia = scale(r1.b, c1.CO_MAX_B, wCo2Cia);
        const co2Fa = null;

        const co3Ssa = null;
        const co3Cia = scale(r2.a, c2.CO_MAX_A, wCo3Cia);
        const co3Fa = null;
        const co4Ssa = null;
        const co4Cia = scale(r2.b, c2.CO_MAX_B, wCo4Cia);
        const co4Fa = null;

        const model = getModelCoMarks(s);
        const meCo1 = scale(model.co1, model.max.co1, wMeCo1);
        const meCo2 = scale(model.co2, model.max.co2, wMeCo2);
        const meCo3 = scale(model.co3, model.max.co3, wMeCo3);
        const meCo4 = scale(model.co4, model.max.co4, wMeCo4);
        const meCo5 = scale(model.co5, model.max.co5, wMeCo5);

        const partsFull = [
          co1Ssa,
          co1Cia,
          co1Fa,
          co2Ssa,
          co2Cia,
          co2Fa,
          co3Ssa,
          co3Cia,
          co3Fa,
          co4Ssa,
          co4Cia,
          co4Fa,
          meCo1,
          meCo2,
          meCo3,
          meCo4,
          meCo5,
        ];

        const parts = effMapping.visible.map((i) => partsFull[i]);
        const any = parts.some((p) => typeof p === 'number' && Number.isFinite(p));
        const total = any ? round2(parts.reduce((s0, p) => s0 + (typeof p === 'number' && Number.isFinite(p) ? p : 0), 0)) : null;
        const pct = total == null || !maxTotal ? null : round2((total / maxTotal) * 100);

        return {
          sno: idx + 1,
          ...s,
          cells: parts,
          total,
          pct,
        };
      });
    }

    // ── QP1 FINAL YEAR: 3 COs, CO2 from both cycles ───────────────────
    if (isQp1Final) {
      // Fixed QP1FINAL target weights (15 slots matching the schema).
      const qfW = QP1FINAL_WEIGHTS; // [2,4,3,1,2,2,1,2,2,2,4,3,4,4,4]

      return students.map((s, idx) => {
        const ssa1Total = toNumOrNull(published.ssa1[String(s.id)]);
        const ssa2Total = toNumOrNull(published.ssa2[String(s.id)]);

        // SSA1 → CO1 + CO2 (same as normal).
        const ssa1Split = ssaCoSplits.ssa1[String(s.id)];
        let ssa1Co1Mark: number | null = null;
        let ssa1Co2Mark: number | null = null;
        if (ssa1Split) {
          const c1 = toNumOrNull(ssa1Split.co1);
          const c2 = toNumOrNull(ssa1Split.co2);
          if (c1 != null) ssa1Co1Mark = clamp(c1, 0, maxes.ssa1.co1);
          if (c2 != null) ssa1Co2Mark = clamp(c2, 0, maxes.ssa1.co2);
        }
        if (ssa1Co1Mark == null && ssa1Total != null) ssa1Co1Mark = clamp(Number(ssa1Total) / 2, 0, maxes.ssa1.co1);
        if (ssa1Co2Mark == null && ssa1Total != null) ssa1Co2Mark = clamp(Number(ssa1Total) / 2, 0, maxes.ssa1.co2);

        // SSA2 → "first CO" (CO2 in QP1FINAL) + "second CO" (CO3 in QP1FINAL).
        // Backend co_splits may use co3/co4 keys (legacy naming).
        const ssa2Split = ssaCoSplits.ssa2[String(s.id)];
        let ssa2FirstMark: number | null = null;  // CO2's contribution from SSA2
        let ssa2SecondMark: number | null = null;  // CO3's contribution from SSA2
        if (ssa2Split) {
          // Try QP1FINAL keys first (co2/co3), then legacy keys (co3/co4).
          const firstV = toNumOrNull(ssa2Split.co2) ?? toNumOrNull(ssa2Split.co3);
          const secondV = toNumOrNull(ssa2Split.co3 != null && ssa2Split.co2 != null ? ssa2Split.co3 : ssa2Split.co4);
          if (firstV != null) ssa2FirstMark = clamp(firstV, 0, maxes.ssa2.co3);
          if (secondV != null) ssa2SecondMark = clamp(secondV, 0, maxes.ssa2.co4);
        }
        if (ssa2FirstMark == null && ssa2Total != null) ssa2FirstMark = clamp(Number(ssa2Total) / 2, 0, maxes.ssa2.co3);
        if (ssa2SecondMark == null && ssa2Total != null) ssa2SecondMark = clamp(Number(ssa2Total) / 2, 0, maxes.ssa2.co4);

        // CIA1 → CO1 + CO2.
        const cia1Row = cia1ById[String(s.id)] || {};
        const cia1Absent = Boolean((cia1Row as any)?.absent);
        let ciaCo1: number | null = null;
        let ciaCo2: number | null = null;
        if (!cia1Absent) {
          const q = (cia1Row as any)?.q && typeof (cia1Row as any).q === 'object' ? (cia1Row as any).q : {};
          let hasAny = false;
          let c1 = 0; let c2 = 0;
          for (let i = 0; i < cia1Questions.length; i++) {
            const qq = cia1Questions[i];
            const n = toNumOrNull(q?.[qq.key]);
            if (n == null) continue;
            hasAny = true;
            const mark = clamp(n, 0, qq.max || n);
            if (isQp1Final) {
              // QP1FINAL: read raw CO number directly (bypass parseCo12 '1&2' splitting)
              const rawCoVal = (qq as any)?.co;
              const rawCoNum = typeof rawCoVal === 'number'
                ? rawCoVal
                : Number(String(rawCoVal ?? '').replace(/[^0-9]/g, '') || '0');
              if (rawCoNum === 1) c1 += mark;
              else if (rawCoNum === 2) c2 += mark;
            } else {
              const w12 = effectiveCoWeights12ForQuestion(cia1Questions, i);
              c1 += mark * w12.co1;
              c2 += mark * w12.co2;
            }
          }
          if (hasAny) {
            ciaCo1 = clamp(c1, 0, maxes.cia1.co1);
            ciaCo2 = clamp(c2, 0, maxes.cia1.co2);
          }
        }

        // CIA2 → For QP1FINAL use direct IQAC CO numbers (CO2/CO3), not parseCo34 slot mapping.
        const cia2Row = cia2ById[String(s.id)] || {};
        const cia2Absent = Boolean((cia2Row as any)?.absent);
        let cia2Co2Part: number | null = null;  // CO2's contribution from CIA2
        let cia2Co3Part: number | null = null;  // CO3's contribution from CIA2
        if (!cia2Absent) {
          const q = (cia2Row as any)?.q && typeof (cia2Row as any).q === 'object' ? (cia2Row as any).q : {};
          let hasAny = false;
          let c2 = 0; let c3 = 0;
          for (let i = 0; i < cia2Questions.length; i++) {
            const qq = cia2Questions[i];
            const n = toNumOrNull(q?.[qq.key]);
            if (n == null) continue;
            hasAny = true;
            const mark = clamp(n, 0, qq.max || n);
            if (isQp1Final) {
              c2 += mark * qp1FinalQuestionWeight(qq, 2, qp1FinalCia2Offset);
              c3 += mark * qp1FinalQuestionWeight(qq, 3, qp1FinalCia2Offset);
            } else {
              const w34 = effectiveCoWeights34ForQuestion(cia2Questions, i);
              c3 += mark * w34.co3;
              c2 += mark * w34.co4;
            }
          }
          if (hasAny) {
            cia2Co2Part = clamp(c2, 0, isQp1Final ? cia2MaxCo3 : maxes.cia2.co4);
            cia2Co3Part = clamp(c3, 0, isQp1Final ? cia2MaxCo4 : maxes.cia2.co3);
          }
        }

        // FA1 → CO1 + CO2.
        const f1Row = (published.f1 || {})[String(s.id)] || {};
        const f1Co1 = toNumOrNull((f1Row as any)?.skill1) != null && toNumOrNull((f1Row as any)?.att1) != null
          ? clamp(Number((f1Row as any).skill1) + Number((f1Row as any).att1), 0, maxes.f1.co1) : null;
        const f1Co2 = toNumOrNull((f1Row as any)?.skill2) != null && toNumOrNull((f1Row as any)?.att2) != null
          ? clamp(Number((f1Row as any).skill2) + Number((f1Row as any).att2), 0, maxes.f1.co2) : null;

        // FA2 → skill1+att1 = first CO (CO2 in QP1FINAL), skill2+att2 = second CO (CO3 in QP1FINAL).
        const f2Row = (published.f2 || {})[String(s.id)] || {};
        const f2Co2Part = toNumOrNull((f2Row as any)?.skill1) != null && toNumOrNull((f2Row as any)?.att1) != null
          ? clamp(Number((f2Row as any).skill1) + Number((f2Row as any).att1), 0, maxes.f2.co3) : null;
        const f2Co3Part = toNumOrNull((f2Row as any)?.skill2) != null && toNumOrNull((f2Row as any)?.att2) != null
          ? clamp(Number((f2Row as any).skill2) + Number((f2Row as any).att2), 0, maxes.f2.co4) : null;

        // Model → CO1, CO2, CO3 only (CO4/CO5 = 0 for QP1FINAL via IQAC pattern).
        const model = getModelCoMarks(s);

        // Build QP1FINAL 15-slot partsFull:
        // [CO1-SSA, CO1-CIA, CO1-FA,  CO2-SSA(C1), CO2-CIA(C1), CO2-FA(C1),
        //  CO2-SSA(C2), CO2-CIA(C2), CO2-FA(C2),  CO3-SSA, CO3-CIA, CO3-FA,
        //  ME-CO1, ME-CO2, ME-CO3]
        const partsFull = [
          scale(ssa1Co1Mark, maxes.ssa1.co1, qfW[0]),       // CO1-SSA → 2
          scale(ciaCo1, maxes.cia1.co1, qfW[1]),            // CO1-CIA → 4
          scale(f1Co1, maxes.f1.co1, qfW[2]),               // CO1-FA  → 3
          scale(ssa1Co2Mark, maxes.ssa1.co2, qfW[3]),       // CO2-SSA(C1) → 1
          scale(ciaCo2, maxes.cia1.co2, qfW[4]),            // CO2-CIA(C1) → 2
          scale(f1Co2, maxes.f1.co2, qfW[5]),               // CO2-FA(C1)  → 2
          scale(ssa2FirstMark, maxes.ssa2.co3, qfW[6]),     // CO2-SSA(C2) → 1
          scale(cia2Co2Part, isQp1Final ? cia2MaxCo3 : maxes.cia2.co4, qfW[7]),       // CO2-CIA(C2) → 2
          scale(f2Co2Part, maxes.f2.co3, qfW[8]),           // CO2-FA(C2)  → 2
          scale(ssa2SecondMark, maxes.ssa2.co4, qfW[9]),    // CO3-SSA → 2
          scale(cia2Co3Part, isQp1Final ? cia2MaxCo4 : maxes.cia2.co3, qfW[10]),      // CO3-CIA → 4
          scale(f2Co3Part, maxes.f2.co4, qfW[11]),          // CO3-FA  → 3
          scale(model.co1, model.max.co1, qfW[12]),         // ME-CO1 → 4
          scale(model.co2, model.max.co2, qfW[13]),         // ME-CO2 → 4
          scale(model.co3, model.max.co3, qfW[14]),         // ME-CO3 → 4
        ];

        const parts = effMapping.visible.map((i: number) => partsFull[i]);
        const any = parts.some((p) => typeof p === 'number' && Number.isFinite(p));
        const total = any ? round2(parts.reduce((s0, p) => s0 + (typeof p === 'number' && Number.isFinite(p) ? p : 0), 0)) : null;
        const pct = total == null || !maxTotal ? null : round2((total / maxTotal) * 100);

        return {
          sno: idx + 1,
          ...s,
          cells: parts,
          total,
          pct,
        };
      });
    }

    return students.map((s, idx) => {
      const ssa1Total = toNumOrNull(published.ssa1[String(s.id)]);
      const ssa2Total = toNumOrNull(published.ssa2[String(s.id)]);

      // Prefer per-CO split from backend co_splits (from SSA draft data),
      // matching how the CQI Entry page computes CO totals.
      // Only fall back to total/2 when per-CO data is unavailable.
      const ssa1Split = ssaCoSplits.ssa1[String(s.id)];
      const ssa2Split = ssaCoSplits.ssa2[String(s.id)];

      let ssa1Co1Mark: number | null = null;
      let ssa1Co2Mark: number | null = null;
      if (ssa1Split) {
        const co1v = toNumOrNull(ssa1Split.co1);
        const co2v = toNumOrNull(ssa1Split.co2);
        if (co1v != null) ssa1Co1Mark = clamp(co1v, 0, maxes.ssa1.co1);
        if (co2v != null) ssa1Co2Mark = clamp(co2v, 0, maxes.ssa1.co2);
      }
      if (ssa1Co1Mark == null && ssa1Total != null) {
        ssa1Co1Mark = clamp(Number(ssa1Total) / 2, 0, maxes.ssa1.co1);
      }
      if (ssa1Co2Mark == null && ssa1Total != null) {
        ssa1Co2Mark = clamp(Number(ssa1Total) / 2, 0, maxes.ssa1.co2);
      }

      let ssa2Co3Mark: number | null = null;
      let ssa2Co4Mark: number | null = null;
      if (ssa2Split) {
        const co3v = toNumOrNull(ssa2Split.co3);
        const co4v = toNumOrNull(ssa2Split.co4);
        if (co3v != null) ssa2Co3Mark = clamp(co3v, 0, maxes.ssa2.co3);
        if (co4v != null) ssa2Co4Mark = clamp(co4v, 0, maxes.ssa2.co4);
      }
      if (ssa2Co3Mark == null && ssa2Total != null) {
        ssa2Co3Mark = clamp(Number(ssa2Total) / 2, 0, maxes.ssa2.co3);
      }
      if (ssa2Co4Mark == null && ssa2Total != null) {
        ssa2Co4Mark = clamp(Number(ssa2Total) / 2, 0, maxes.ssa2.co4);
      }

      // FA columns depend on class type:
      // - TCPR: Review1/Review2
      // - TCPL: LAB1/LAB2 (lab-style sheets)
      // - THEORY/SPECIAL: Formatives

      const f1Row = (published.f1 || {})[String(s.id)] || {};
      const f2Row = (published.f2 || {})[String(s.id)] || {};

      const f1Co1 = toNumOrNull((f1Row as any)?.skill1) != null && toNumOrNull((f1Row as any)?.att1) != null ? clamp(Number((f1Row as any).skill1) + Number((f1Row as any).att1), 0, maxes.f1.co1) : null;
      const f1Co2 = toNumOrNull((f1Row as any)?.skill2) != null && toNumOrNull((f1Row as any)?.att2) != null ? clamp(Number((f1Row as any).skill2) + Number((f1Row as any).att2), 0, maxes.f1.co2) : null;
      const f2Co3 = toNumOrNull((f2Row as any)?.skill1) != null && toNumOrNull((f2Row as any)?.att1) != null ? clamp(Number((f2Row as any).skill1) + Number((f2Row as any).att1), 0, maxes.f2.co3) : null;
      const f2Co4 = toNumOrNull((f2Row as any)?.skill2) != null && toNumOrNull((f2Row as any)?.att2) != null ? clamp(Number((f2Row as any).skill2) + Number((f2Row as any).att2), 0, maxes.f2.co4) : null;

      const review1Total = toNumOrNull(publishedReview.r1[String(s.id)]);
      const review2Total = toNumOrNull(publishedReview.r2[String(s.id)]);
      const review1Half = review1Total == null ? null : Number(review1Total) / 2;
      const review2Half = review2Total == null ? null : Number(review2Total) / 2;

      // Use backend co_splits if they exist
      const r1Splits = (publishedReview.r1 as any)?.co_splits?.[String(s.id)];
      const r2Splits = (publishedReview.r2 as any)?.co_splits?.[String(s.id)];

      const getR1Co1 = () => {
        if (r1Splits?.co1 != null) return clamp(r1Splits.co1, 0, maxes.review1.co1);
        return review1Half == null ? null : clamp(review1Half, 0, maxes.review1.co1);
      };
      
      const getR1Co2 = () => {
        if (r1Splits?.co2 != null) return clamp(r1Splits.co2, 0, maxes.review1.co2);
        return review1Half == null ? null : clamp(review1Half, 0, maxes.review1.co2);
      };

      const getR2Co3 = () => {
        if (r2Splits?.co3 != null) return clamp(r2Splits.co3, 0, maxes.review2.co3);
        return review2Half == null ? null : clamp(review2Half, 0, maxes.review2.co3);
      };

      const getR2Co4 = () => {
        if (r2Splits?.co4 != null) return clamp(r2Splits.co4, 0, maxes.review2.co4);
        return review2Half == null ? null : clamp(review2Half, 0, maxes.review2.co4);
      };

      const review1Co1 = ct === 'PROJECT'
        ? scale(review1Total, 50, 30)
        : getR1Co1();
      const review1Co2 = ct === 'PROJECT'
        ? null
        : getR1Co2();
      const review2Co3 = ct === 'PROJECT'
        ? scale(review2Total, 50, 30)
        : getR2Co3();
      const review2Co4 = ct === 'PROJECT'
        ? null
        : getR2Co4();

      const readTcplLabPair = (snapshot: any | null, coA: number, coB: number | null) => {
        const sheet = snapshot?.sheet && typeof snapshot.sheet === 'object' ? snapshot.sheet : {};
        const rowsByStudentId = sheet?.rowsByStudentId && typeof sheet.rowsByStudentId === 'object' ? sheet.rowsByStudentId : {};
        const HALF = 30 / 2;

        // Support both legacy flat format and newer coConfigs-keyed format.
        const cfgs = sheet?.coConfigs && typeof sheet.coConfigs === 'object' ? (sheet.coConfigs as any) : null;
        const cfgA = cfgs ? cfgs[String(coA)] : null;
        const cfgB = coB != null && cfgs ? cfgs[String(coB)] : null;

        const legacyExpCountA = clamp(Number(sheet?.expCountA ?? 0), 0, 12);
        const legacyExpCountB = clamp(Number(sheet?.expCountB ?? 0), 0, 12);
        const legacyCoAEnabled = Boolean(sheet?.coAEnabled !== false);
        const legacyCoBEnabled = coB != null ? Boolean(sheet?.coBEnabled !== false) : false;

        const coAEnabled = cfgA ? Boolean(cfgA.enabled) : legacyCoAEnabled;
        const coBEnabled = coB != null ? (cfgB ? Boolean(cfgB.enabled) : legacyCoBEnabled) : false;

        const expCountA = cfgA ? clamp(Number(cfgA.expCount ?? 0), 0, 12) : legacyExpCountA;
        const expCountB = coB != null ? (cfgB ? clamp(Number(cfgB.expCount ?? 0), 0, 12) : legacyExpCountB) : 0;

        const expMaxA = cfgA && Number.isFinite(Number(cfgA.expMax)) ? Number(cfgA.expMax)
          : Number.isFinite(Number(sheet?.expMaxA)) ? Number(sheet.expMaxA) : 25;
        const expMaxB = coB != null
          ? (cfgB && Number.isFinite(Number(cfgB.expMax)) ? Number(cfgB.expMax)
            : Number.isFinite(Number((sheet as any)?.expMaxB)) ? Number((sheet as any).expMaxB) : 25)
          : 0;

        const ciaEnabled = Boolean((sheet as any)?.ciaExamEnabled !== false);
        const CO_MAX_A = expMaxA + (ciaEnabled ? HALF : 0);
        const CO_MAX_B = coB != null ? expMaxB + (ciaEnabled ? HALF : 0) : 0;

        const normalizeMarksArray = (raw: any) => {
          if (!Array.isArray(raw)) return [] as Array<number | null>;
          return raw.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null));
        };
        const avgMarks = (arr: Array<number | null>) => {
          const nums = (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x)) as number[];
          if (!nums.length) return null;
          return nums.reduce((s0, n) => s0 + n, 0) / nums.length;
        };

        const get = (sid: number) => {
          const row = rowsByStudentId[String(sid)] || {};
          // Prefer per-CO keyed format (marksByCo), fallback to legacy marksA/marksB.
          const marksByCo = (row as any)?.marksByCo && typeof (row as any).marksByCo === 'object' ? (row as any).marksByCo : {};
          const rawA = marksByCo?.[String(coA)] ?? (row as any)?.marksA;
          const rawB = coB != null ? (marksByCo?.[String(coB)] ?? (row as any)?.marksB) : [];

          const marksA = normalizeMarksArray(rawA).slice(0, coAEnabled ? expCountA : 0);
          const marksB = normalizeMarksArray(rawB).slice(0, coBEnabled ? expCountB : 0);
          const avgA = avgMarks(marksA);
          const avgB = avgMarks(marksB);
          const ciaExamRaw = (row as any)?.ciaExam;
          const ciaExamNum = typeof ciaExamRaw === 'number' && Number.isFinite(ciaExamRaw) ? ciaExamRaw : null;
          const pairEnabled = coB != null && coBEnabled;
          // Experiment average only (0-2); CIA Exam is returned separately.
          const expPartA = avgA == null || !expMaxA ? null : clamp((avgA / expMaxA) * 2, 0, 2);
          const expPartB = avgB == null || !expMaxB ? null : clamp((avgB / expMaxB) * 2, 0, 2);

          const a = !coAEnabled || expPartA == null ? null : expPartA;
          const b = !pairEnabled || expPartB == null ? null : expPartB;
          // Raw CIA exam mark (0-30); null when disabled or not entered.
          const ciaExam = ciaEnabled ? ciaExamNum : null;

          return {
            a: a == null ? null : clamp(a, 0, 2),
            b: b == null ? null : clamp(b, 0, 2),
            ciaExam,
          };
        };

        return { get, CO_MAX_A: 2, CO_MAX_B: 2 };
      };

      const tcplLab1 = ct === 'TCPL' ? readTcplLabPair(publishedTcplLab.lab1, 1, 2) : null;
      const tcplLab2 = ct === 'TCPL' ? readTcplLabPair(publishedTcplLab.lab2, 3, 4) : null;
      const tcpl1 = tcplLab1 ? tcplLab1.get(s.id) : null;
      const tcpl2 = tcplLab2 ? tcplLab2.get(s.id) : null;
      const tcplLab1Co1 = tcpl1?.a ?? null;
      const tcplLab1Co2 = tcpl1?.b ?? null;
      const tcplLab2Co3 = tcpl2?.a ?? null;
      const tcplLab2Co4 = tcpl2?.b ?? null;
      // Separate CIA Exam marks per lab sheet (shared between the two COs in each lab).
      const tcplCiaExam1 = tcpl1?.ciaExam ?? null; // lab1 CIA Exam (CO1 & CO2)
      const tcplCiaExam2 = tcpl2?.ciaExam ?? null; // lab2 CIA Exam (CO3 & CO4)

      const cia1Row = cia1ById[String(s.id)] || {};
      const cia2Row = cia2ById[String(s.id)] || {};

      const cia1Absent = Boolean((cia1Row as any)?.absent);
      const cia2Absent = Boolean((cia2Row as any)?.absent);

      let ciaCo1: number | null = null;
      let ciaCo2: number | null = null;
      if (!cia1Absent) {
        const q = (cia1Row as any)?.q && typeof (cia1Row as any).q === 'object' ? (cia1Row as any).q : {};
        let hasAny = false;
        let c1 = 0;
        let c2 = 0;
        for (let i = 0; i < cia1Questions.length; i++) {
          const qq = cia1Questions[i];
          const n = toNumOrNull(q?.[qq.key]);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, qq.max || n);
          const w12 = effectiveCoWeights12ForQuestion(cia1Questions, i);
          c1 += mark * w12.co1;
          c2 += mark * w12.co2;
        }
        if (hasAny) {
          ciaCo1 = clamp(c1, 0, maxes.cia1.co1);
          ciaCo2 = clamp(c2, 0, maxes.cia1.co2);
        }
      }

      let ciaCo3: number | null = null;
      let ciaCo4: number | null = null;
      if (!cia2Absent) {
        const q = (cia2Row as any)?.q && typeof (cia2Row as any).q === 'object' ? (cia2Row as any).q : {};
        let hasAny = false;
        let c3 = 0;
        let c4 = 0;
        for (let i = 0; i < cia2Questions.length; i++) {
          const qq = cia2Questions[i];
          const n = toNumOrNull(q?.[qq.key]);
          if (n == null) continue;
          hasAny = true;
          const mark = clamp(n, 0, qq.max || n);
          const w34 = effectiveCoWeights34ForQuestion(cia2Questions, i);
          c3 += mark * w34.co3;
          c4 += mark * w34.co4;
        }
        if (hasAny) {
          ciaCo3 = clamp(c3, 0, maxes.cia2.co3);
          ciaCo4 = clamp(c4, 0, maxes.cia2.co4);
        }
      }

      // CO1/CO2 split into SSA/CIA/FA columns.
      const co1Ssa = ct === 'PROJECT' ? (isPrbl ? scale(ssa1Total, 20, 3) : null) : scale(ssa1Co1Mark, maxes.ssa1.co1, wCo1Ssa);
      const co1Cia = ct === 'PROJECT' ? null : scale(ciaCo1, maxes.cia1.co1, wCo1Cia);
      const co1Fa = (ct === 'TCPR' || ct === 'PROJECT')
        ? (isPrbl ? scale(review1Total, 50, 12) : scale(review1Co1, maxes.review1.co1, wCo1Fa))
        : ct === 'TCPL'
          ? scale(tcplLab1Co1, tcplLab1?.CO_MAX_A ?? 2, wCo1Fa)
          : scale(f1Co1, maxes.f1.co1, wCo1Fa);
      // TCPL CIA Exam: raw mark out of 30, one per lab sheet (CO1&CO2 share lab1, CO3&CO4 share lab2).
      const co1CiaExam = ct === 'TCPL' ? scale(tcplCiaExam1, 30, wCo1CiaExam) : null;
      const co2Ssa = ct === 'PROJECT' ? (isPrbl ? scale(ssa2Total, 20, 3) : null) : scale(ssa1Co2Mark, maxes.ssa1.co2, wCo2Ssa);
      const co2Cia = ct === 'PROJECT' ? null : scale(ciaCo2, maxes.cia1.co2, wCo2Cia);
      const co2Fa = (ct === 'TCPR' || ct === 'PROJECT')
        ? scale(review1Co2, maxes.review1.co2, wCo2Fa)
        : ct === 'TCPL'
          ? scale(tcplLab1Co2, tcplLab1?.CO_MAX_B ?? 2, wCo2Fa)
          : scale(f1Co2, maxes.f1.co2, wCo2Fa);
      const co2CiaExam = ct === 'TCPL' ? scale(tcplCiaExam1, 30, wCo2CiaExam) : null;

      const co3Ssa = ct === 'PROJECT' ? null : scale(ssa2Co3Mark, maxes.ssa2.co3, wCo3Ssa);
      const co3Cia = ct === 'PROJECT' ? null : scale(ciaCo3, maxes.cia2.co3, wCo3Cia);
      const co3Fa = (ct === 'TCPR' || ct === 'PROJECT')
        ? (isPrbl ? scale(review2Total, 50, 12) : scale(review2Co3, maxes.review2.co3, wCo3Fa))
        : ct === 'TCPL'
          ? scale(tcplLab2Co3, tcplLab2?.CO_MAX_A ?? 2, wCo3Fa)
          : scale(f2Co3, maxes.f2.co3, wCo3Fa);
      const co3CiaExam = ct === 'TCPL' ? scale(tcplCiaExam2, 30, wCo3CiaExam) : null;
      const co4Ssa = ct === 'PROJECT' ? null : scale(ssa2Co4Mark, maxes.ssa2.co4, wCo4Ssa);
      const co4Cia = ct === 'PROJECT' ? null : scale(ciaCo4, maxes.cia2.co4, wCo4Cia);
      const co4Fa = (ct === 'TCPR' || ct === 'PROJECT')
        ? scale(review2Co4, maxes.review2.co4, wCo4Fa)
        : ct === 'TCPL'
          ? scale(tcplLab2Co4, tcplLab2?.CO_MAX_B ?? 2, wCo4Fa)
          : scale(f2Co4, maxes.f2.co4, wCo4Fa);
      const co4CiaExam = ct === 'TCPL' ? scale(tcplCiaExam2, 30, wCo4CiaExam) : null;

      const model = getModelCoMarks(s);
      const prblModelTotal = isPrbl ? toNumOrNull(publishedPrblModel[String(s.id)]) : null;
      const meCo1 = ct === 'PROJECT' ? null : scale(model.co1, model.max.co1, wMeCo1);
      const meCo2 = ct === 'PROJECT' ? null : scale(model.co2, model.max.co2, wMeCo2);
      const meCo3 = ct === 'PROJECT' ? null : scale(model.co3, model.max.co3, wMeCo3);
      const meCo4 = ct === 'PROJECT' ? null : scale(model.co4, model.max.co4, wMeCo4);
      const meCo5 = ct === 'PROJECT' ? (isPrbl ? scale(prblModelTotal, 50, 30) : null) : scale(model.co5, model.max.co5, wMeCo5);

      // TCPL uses 21-slot partsFull (SSA/CIA/LAB/CIAExam per CO + ME×5).
      // All other class types use the standard 17-slot layout.
      const partsFull = ct === 'TCPL' ? [
        co1Ssa, co1Cia, co1Fa, co1CiaExam,
        co2Ssa, co2Cia, co2Fa, co2CiaExam,
        co3Ssa, co3Cia, co3Fa, co3CiaExam,
        co4Ssa, co4Cia, co4Fa, co4CiaExam,
        meCo1, meCo2, meCo3, meCo4, meCo5,
      ] : [
        co1Ssa,
        co1Cia,
        co1Fa,
        co2Ssa,
        co2Cia,
        co2Fa,
        co3Ssa,
        co3Cia,
        co3Fa,
        co4Ssa,
        co4Cia,
        co4Fa,
        meCo1,
        meCo2,
        meCo3,
        meCo4,
        meCo5,
      ];
      const parts = effMapping.visible.map((i: number) => partsFull[i]);
      const any = parts.some((p) => typeof p === 'number' && Number.isFinite(p));
      const total = any ? round2(parts.reduce((s0, p) => s0 + (typeof p === 'number' && Number.isFinite(p) ? p : 0), 0)) : null;
      const pct = total == null || !maxTotal ? null : round2((total / maxTotal) * 100);

      return {
        sno: idx + 1,
        ...s,
        cells: parts,
        total,
        pct,
      };
    });
  }, [effMapping, published, publishedReview, publishedPrblModel, publishedLab, publishedTcplLab, publishedModel, students, weights, maxTotal, courseId, selectedTaId, masterCfg, effectiveClassType, isPrbl, isQp1Final, iqacCiaPattern, iqacModelPattern, ssaCoSplits]);

  const header = displayCols.map((c) => c.header);
  const cycles = displayCols.map((c) => c.cycle);
  const weightsRow = displayCols.map((c) => c.weight);

  // ── Export state ──────────────────────────────────────────
  type ExportStep = 'closed' | 'type' | 'columns';
  const [exportStep, setExportStep] = useState<ExportStep>('closed');
  const [exportingPdf, setExportingPdf] = useState(false);

  // Each selectable column: fixed ones + all display cols
  type ExportCol = { key: string; label: string; enabled: boolean };
  const allExportCols: ExportCol[] = useMemo(() => [
    { key: '__sno', label: 'S.No', enabled: true },
    { key: '__reg', label: 'Register No.', enabled: true },
    { key: '__name', label: 'Name', enabled: true },
    ...displayCols.map((c, i) => ({
      key: c.key || `col-${i}`,
      label: c.header + (c.cycle ? ` (${c.cycle})` : ''),
      enabled: true,
    })),
    { key: '__total', label: `Total (${round2(maxTotal)})`, enabled: true },
    { key: '__pct', label: '% (100)', enabled: true },
  ], [displayCols, maxTotal]);

  const [exportCols, setExportCols] = useState<ExportCol[]>([]);
  // Sync when displayCols change
  const exportColsRef = useRef<ExportCol[]>([]);
  useMemo(() => {
    exportColsRef.current = allExportCols;
    setExportCols(allExportCols.map((c) => ({ ...c })));
  }, [allExportCols]);

  const toggleExportCol = (key: string) => {
    setExportCols((prev) => prev.map((c) => c.key === key ? { ...c, enabled: !c.enabled } : c));
  };
  const toggleAllExportCols = (val: boolean) => {
    setExportCols((prev) => prev.map((c) => ({ ...c, enabled: val })));
  };

  // ── PDF generation helpers (same pattern as CardsDataPage) ──
  async function toBase64Img(src: string): Promise<string> {
    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function imgNaturalSize(b64: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = b64;
    });
  }

  // Compute effective row values respecting the active tab / CQI
  const computeEffectiveRows = () => {
    const entries = (cqiPublished?.entries && typeof cqiPublished.entries === 'object') ? cqiPublished.entries : {};
    const projectPages = Array.isArray(cqiPublished?.pages) ? cqiPublished.pages : [];

    if (effectiveClassType === 'PROJECT' && !isPrbl) {
      const getProjectPageInput = (studentId: number, assessment: 'review1' | 'review2') => {
        const page = projectPages.find((pg) => String(pg?.assessmentType || '').toLowerCase() === assessment);
        if (!page || !page.entries || typeof page.entries !== 'object') return null;
        const row = (page.entries as any)?.[studentId] ?? (page.entries as any)?.[String(studentId)] ?? null;
        if (!row || typeof row !== 'object') return null;
        const raw = (row as any)?.co1;
        return raw == null ? null : Number(raw);
      };

      return computedRows.map((r: any) => {
        const review1Base = typeof r.cells?.[0] === 'number' && Number.isFinite(r.cells[0]) ? Number(r.cells[0]) : null;
        const review2Base = typeof r.cells?.[1] === 'number' && Number.isFinite(r.cells[1]) ? Number(r.cells[1]) : null;

        const addFromProjectCqi = (base: number | null, input: number | null) => {
          if (base == null || input == null || !Number.isFinite(input)) return 0;
          return computeCqiAdd({ coValue: base, coMax: 30, input });
        };

        const add1 = activeTab === 'after-cqi' ? addFromProjectCqi(review1Base, getProjectPageInput(Number(r.id), 'review1')) : 0;
        const add2 = activeTab === 'after-cqi' ? addFromProjectCqi(review2Base, getProjectPageInput(Number(r.id), 'review2')) : 0;

        const colVals = [
          review1Base == null ? null : clamp(round2(review1Base + add1), 0, 30),
          review2Base == null ? null : clamp(round2(review2Base + add2), 0, 30),
        ];
        let effTotal = colVals.some((v) => typeof v === 'number' && Number.isFinite(v))
          ? round2(colVals.reduce((sum, v) => sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0))
          : r.total;
        // Cap total at 58% if original total was below 58%.
        const originalProjectPct = (r.total != null && maxTotal > 0) ? (r.total / maxTotal) * 100 : 0;
        if (effTotal != null && originalProjectPct < THRESHOLD_PERCENT) {
          const totalCap = round2((maxTotal * THRESHOLD_PERCENT) / 100);
          effTotal = Math.min(effTotal, totalCap);
        }
        if (effTotal != null) effTotal = clamp(effTotal, 0, maxTotal);
        const effPct = effTotal != null && maxTotal ? round2((effTotal / maxTotal) * 100) : r.pct;
        return { ...r, colVals, effTotal, effPct };
      });
    }

    return computedRows.map((r: any) => {
      const studentEntry: any = (entries as any)?.[r.id] || {};
      let cqiAdded = 0;
      if (activeTab === 'after-cqi') {
        for (const col of displayCols) {
          if (col.isMerged && col.co != null && publishedCoSet.has(Number(col.co))) {
            const base = getDisplayValue(r.cells, col);
            const coMax = Number(col.weight) || 0;
            const input = studentEntry?.[`co${col.co}`];
            if (base != null && Number.isFinite(base) && coMax > 0) {
              const add = computeCqiAdd({ coValue: Number(base), coMax, input: input == null ? null : Number(input) });
              if (add > 0) cqiAdded = round2(cqiAdded + add);
            }
          }
        }
      }
      const colVals = displayCols.map((col) => {
        let val = getDisplayValue(r.cells, col);
        if (activeTab === 'after-cqi' && col.isMerged && col.co != null && publishedCoSet.has(Number(col.co))) {
          const base = val;
          const coMax = Number(col.weight) || 0;
          const input = studentEntry?.[`co${col.co}`];
          if (base != null && Number.isFinite(base) && coMax > 0) {
            const add = computeCqiAdd({ coValue: Number(base), coMax, input: input == null ? null : Number(input) });
            if (add > 0) val = clamp(round2(Number(base) + add), 0, coMax);
          }
        }
        return val;
      });
      let effTotal = r.total != null && cqiAdded > 0 ? round2(r.total + cqiAdded) : r.total;
      // Cap total at 58% if original total was below 58%.
      const originalTotalPct = (r.total != null && maxTotal > 0) ? (r.total / maxTotal) * 100 : 0;
      if (effTotal != null && originalTotalPct < THRESHOLD_PERCENT) {
        const totalCap = round2((maxTotal * THRESHOLD_PERCENT) / 100);
        effTotal = Math.min(effTotal, totalCap);
      }
      if (effTotal != null) effTotal = clamp(effTotal, 0, maxTotal);
      const effPct = effTotal != null && maxTotal ? round2((effTotal / maxTotal) * 100) : r.pct;
      return { ...r, colVals, effTotal, effPct };
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const selectedKeys = new Set(exportCols.filter((c) => c.enabled).map((c) => c.key));
      const showSno = selectedKeys.has('__sno');
      const showReg = selectedKeys.has('__reg');
      const showName = selectedKeys.has('__name');
      const showTotal = selectedKeys.has('__total');
      const showPct = selectedKeys.has('__pct');
      const colIdxEnabled = displayCols.map((c, i) => selectedKeys.has(c.key || `col-${i}`));

      const sectionLabel = (() => {
        const ta = tas.find((t) => t.id === selectedTaId);
        if (!ta) return '';
        const dept = (ta as any).department;
        const deptLabel = dept?.short_name || dept?.code || dept?.name || (ta as any).department_name || '';
        const sem = (ta as any).semester;
        return `${ta.section_name || `TA ${ta.id}`}${sem ? ` · Sem ${sem}` : ''}${deptLabel ? ` · ${deptLabel}` : ''}`;
      })();

      const [b64Banner, b64Kr, b64Idcs] = await Promise.all([
        toBase64Img(newBannerSrc).catch(() => ''),
        toBase64Img(krLogoSrc).catch(() => ''),
        toBase64Img(idcsLogoSrc).catch(() => ''),
      ]);

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const PW = 297;
      const PH = 210;
      const ML = 10;
      const MR = 10;
      const UW = PW - ML - MR;
      const HEADER_H = 24;
      let curY = 10;

      const wm = await (async () => {
        if (!b64Kr) return null;
        const { w, h } = await imgNaturalSize(b64Kr);
        const wmW = 120;
        const wmH = (h / w) * wmW;
        return { wmW, wmH };
      })();

      const applyWatermark = () => {
        if (!b64Kr || !wm) return;
        const pageCount = doc.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) {
          doc.setPage(page);
          const cx = (PW - wm.wmW) / 2;
          const cy = (PH - wm.wmH) / 2;
          doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
          doc.addImage(b64Kr, 'PNG', cx, cy, wm.wmW, wm.wmH);
          doc.setGState(new (doc as any).GState({ opacity: 1 }));
        }
      };

      const drawHeader = async () => {
        let maxY = curY;
        if (b64Banner) {
          const { w, h } = await imgNaturalSize(b64Banner);
          let bh = HEADER_H;
          let bw = (w / h) * bh;
          if (bw > UW - 35) { bw = UW - 35; bh = (h / w) * bw; }
          doc.addImage(b64Banner, 'PNG', ML, curY, bw, bh);
          maxY = Math.max(maxY, curY + bh);
        }
        if (b64Kr) {
          const krWg = 16;
          const { w, h } = await imgNaturalSize(b64Kr);
          const krHg = (h / w) * krWg;
          doc.addImage(b64Kr, 'PNG', PW - MR - krWg - 13, curY, krWg, krHg);
        }
        if (b64Idcs) {
          doc.addImage(b64Idcs, 'PNG', PW - MR - 11, curY + 2, 11, 11);
        }
        curY = maxY + 4;
        doc.setLineWidth(0.3);
        doc.setDrawColor(200, 200, 200);
        doc.line(ML, curY, PW - MR, curY);
        curY += 6;
      };

      await drawHeader();

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('INTERNAL MARK REPORT', PW / 2, curY, { align: 'center' });
      curY += 7;

      // Meta row
      autoTable(doc, {
        startY: curY,
        theme: 'plain',
        tableWidth: 140,
        margin: { left: PW / 2 - 70 },
        styles: { fontSize: 9, cellPadding: 1, textColor: [50, 50, 50] },
        columnStyles: { 0: { fontStyle: 'bold', minCellWidth: 35 }, 1: { minCellWidth: 105 } },
        body: [
          ['Course:', courseId],
          ['Section:', sectionLabel],
          ['View:', activeTab === 'after-cqi' ? 'Final (With CQI)' : 'Before CQI'],
          ['Date:', new Date().toLocaleDateString('en-GB')],
        ],
      });
      curY = (doc as any).lastAutoTable.finalY + 6;

      // Build table columns & rows
      // Three header rows: CO label, weightage, cycle
      const headRow1: string[] = [];
      const headRow2: string[] = [];
      const headRow3: string[] = [];

      if (showSno) { headRow1.push('S.No'); headRow2.push(''); headRow3.push(''); }
      if (showReg) { headRow1.push('Register No.'); headRow2.push(''); headRow3.push(''); }
      if (showName) { headRow1.push('Name'); headRow2.push(''); headRow3.push(''); }
      displayCols.forEach((c, i) => {
        if (!colIdxEnabled[i]) return;
        headRow1.push(c.header);
        headRow2.push(Number(c.weight).toFixed(1));
        headRow3.push(c.cycle);
      });
      if (showTotal) { headRow1.push(String(round2(maxTotal))); headRow2.push(''); headRow3.push(''); }
      if (showPct) { headRow1.push('100'); headRow2.push(''); headRow3.push(''); }

      const effRows = computeEffectiveRows();
      const tableBody = effRows.map((r: any) => {
        const row: string[] = [];
        if (showSno) row.push(String(r.sno));
        if (showReg) row.push(String(r.reg_no));
        if (showName) row.push(String(r.name));
        displayCols.forEach((_, i) => {
          if (!colIdxEnabled[i]) return;
          const v = r.colVals[i];
          row.push(v == null ? '' : Number(v).toFixed(2));
        });
        if (showTotal) row.push(r.effTotal == null ? '' : Number(r.effTotal).toFixed(2));
        if (showPct) row.push(r.effPct == null ? '' : Number(r.effPct).toFixed(2));
        return row;
      });

      autoTable(doc, {
        startY: curY,
        head: [headRow1, headRow2, headRow3],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
        columnStyles: showName ? { [showSno ? 2 : showReg ? 1 : 0]: { halign: 'left', minCellWidth: 30 } } : {},
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: (data) => {
          if (data.section === 'head' && data.row.index === 0) {
            data.cell.styles.fillColor = [29, 78, 216];
          } else if (data.section === 'head' && data.row.index === 1) {
            data.cell.styles.fillColor = [99, 102, 241];
            data.cell.styles.fontSize = 6;
          } else if (data.section === 'head' && data.row.index === 2) {
            data.cell.styles.fillColor = [165, 180, 252];
            data.cell.styles.textColor = [30, 27, 75];
            data.cell.styles.fontSize = 6;
          }
        },
      });

      applyWatermark();

      const filename = `InternalMark_${courseId}_${sectionLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${activeTab === 'after-cqi' ? 'AfterCQI_' : ''}${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF');
    } finally {
      setExportingPdf(false);
      setExportStep('closed');
    }
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>INTERNAL MARK</h3>
          <div style={{ color: '#6b7280', marginTop: 4 }}>Summative + Formative (based on IQAC mapping)</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setExportStep('type')}
            style={{ padding: '8px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ↓ Export
          </button>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#374151', fontWeight: 700 }}>Section</span>
            <select value={selectedTaId ?? ''} onChange={(e) => setSelectedTaId(e.target.value ? Number(e.target.value) : null)} style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              <option value="" disabled>—</option>
              {tas.map((t) => {
                const dept = (t as any).department;
                const deptLabel = dept?.short_name || dept?.code || dept?.name || (t as any).department_name || '';
                const sem = (t as any).semester;
                const label = `${t.section_name || `TA ${t.id}`} ${sem ? `· Sem ${sem}` : ''} ${deptLabel ? `· ${deptLabel}` : ''}`;
                return (
                  <option key={t.id} value={t.id}>{label}</option>
                );
              })}
            </select>
          </label>
        </div>
      </div>

      {/* Slider Tab Bar */}
      <div style={{ position: 'relative', display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 16, width: 'fit-content' }}>
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: activeTab === 'actual' ? 4 : 'calc(50% + 2px)',
            width: 'calc(50% - 6px)',
            height: 'calc(100% - 8px)',
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            transition: 'left 0.25s cubic-bezier(.4,0,.2,1)',
          }}
        />
        <button
          onClick={() => setActiveTab('actual')}
          style={{
            position: 'relative', zIndex: 1, padding: '8px 28px', border: 'none',
            background: 'transparent', cursor: 'pointer',
            fontWeight: activeTab === 'actual' ? 600 : 400,
            color: activeTab === 'actual' ? '#1d4ed8' : '#6b7280',
            borderRadius: 8, fontSize: 14, transition: 'color 0.2s', whiteSpace: 'nowrap',
          }}
        >
          Before CQI
        </button>
        <button
          onClick={() => setActiveTab('after-cqi')}
          style={{
            position: 'relative', zIndex: 1, padding: '8px 28px', border: 'none',
            background: 'transparent', cursor: 'pointer',
            fontWeight: activeTab === 'after-cqi' ? 600 : 400,
            color: activeTab === 'after-cqi' ? '#1d4ed8' : '#6b7280',
            borderRadius: 8, fontSize: 14, transition: 'color 0.2s', whiteSpace: 'nowrap',
          }}
        >
          Final (With CQI)
        </button>
      </div>

      {taError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{taError}</div> : null}
      {rosterError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{rosterError}</div> : null}
      {dataError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{dataError}</div> : null}
      {loadingRoster || loadingData ? <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading…</div> : null}

      {activeTab === 'after-cqi' && !cqiPublished && (
        <div style={{ padding: '12px 16px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', color: '#0c4a6e', marginBottom: 12, fontSize: 13 }}>
          CQI has not been published yet for this section. Once CQI is published, the combined marks will appear here.
        </div>
      )}
      {activeTab === 'actual' && cqiPublished && (
        <div style={{ padding: '12px 16px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fcd34d', color: '#92400e', marginBottom: 12, fontSize: 13 }}>
          <strong>Note:</strong> You are viewing marks <em>before</em> CQI. CQI has been published for this section.
          Switch to <strong>Final (With CQI)</strong> tab to see the CQI-adjusted marks that are the official final values.
        </div>
      )}
      {activeTab === 'after-cqi' && cqiPublished && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          {(cqiPublished.pages && cqiPublished.pages.length > 0)
            ? cqiPublished.pages.map((pg) => {
                const coLabel = (pg.coNumbers || []).map((n) => `CO${n}`).join(', ');
                const typeLabel = pg.assessmentType ? pg.assessmentType.toUpperCase() : '';
                const label = typeLabel && coLabel ? `${typeLabel} (${coLabel})` : coLabel || typeLabel || pg.key;
                return (
                  <span key={pg.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '4px 14px', fontWeight: 600, fontSize: 12, border: '1px solid #86efac' }}>
                    ✓ {label} Published
                    {pg.publishedAt && (
                      <span style={{ fontWeight: 400, color: '#4b5563', fontSize: 11 }}>
                        · {new Date(pg.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </span>
                );
              })
            : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '4px 14px', fontWeight: 600, fontSize: 12, border: '1px solid #86efac' }}>
                ✓ CQI Published
                {cqiPublished.publishedAt && (
                  <span style={{ fontWeight: 400, color: '#4b5563', fontSize: 11 }}>· {new Date(cqiPublished.publishedAt).toLocaleDateString()}</span>
                )}
              </span>
            )
          }
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>S.No</th>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>Register No.</th>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>Name</th>
              {header.map((h: any, i: number) => (
                <th
                  key={displayCols[i]?.key || i}
                  style={{
                    border: '1px solid #e5e7eb',
                    padding: 8,
                    background: '#f3f4f6',
                  }}
                >
                  {String(h)}
                </th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>{round2(maxTotal)}</th>
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>100</th>
            </tr>
            <tr>
              <th colSpan={3} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff', textAlign: 'left', fontWeight: 800 }}>internal weightage</th>
              {weightsRow.map((w0: any, i: number) => (
                <th
                  key={`w-${displayCols[i]?.key || i}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    padding: 8,
                    background: '#f3f4f6',
                  }}
                >
                  {Number(w0).toFixed(1)}
                </th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
            </tr>
            <tr>
              <th colSpan={3} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff', textAlign: 'left', fontWeight: 800 }}>cycle</th>
              {cycles.map((c: any, i: number) => (
                <th
                  key={`c-${displayCols[i]?.key || i}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    padding: 8,
                    background: '#fff',
                  }}
                >
                  {String(c)}
                </th>
              ))}
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
              <th style={{ border: '1px solid #e5e7eb', padding: 8, background: '#fff' }} />
            </tr>
          </thead>
          <tbody>
            {computedRows.map((r: any) => (
              <tr key={r.id}>
                <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{r.sno}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{r.reg_no}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{r.name}</td>
                {(() => {
                  const entries = (cqiPublished?.entries && typeof cqiPublished.entries === 'object') ? cqiPublished.entries : {};
                  const studentEntry: any = (entries as any)?.[r.id] || {};

                  // Pre-compute total CQI addition for this row (so total/pct cols can reflect it).
                  let cqiTotalAdded = 0;
                  if (activeTab === 'after-cqi') {
                    for (const col of displayCols) {
                      if (col.isMerged && col.co != null && publishedCoSet.has(Number(col.co))) {
                        const base = getDisplayValue(r.cells, col);
                        const coMax = Number(col.weight) || 0;
                        const input = studentEntry?.[`co${col.co}`];
                        if (base != null && Number.isFinite(base) && coMax > 0) {
                          const add = computeCqiAdd({ coValue: Number(base), coMax, input: input == null ? null : Number(input) });
                          if (add > 0) cqiTotalAdded = round2(cqiTotalAdded + add);
                        }
                      }
                    }
                  }

                  let effectiveTotal = (r.total != null && cqiTotalAdded > 0)
                    ? round2(r.total + cqiTotalAdded)
                    : r.total;
                  // Cap total at 58% if original total was below 58%.
                  const originalTotalPct = (r.total != null && maxTotal > 0) ? (r.total / maxTotal) * 100 : 0;
                  if (effectiveTotal != null && originalTotalPct < THRESHOLD_PERCENT) {
                    const totalCap = round2((maxTotal * THRESHOLD_PERCENT) / 100);
                    effectiveTotal = Math.min(effectiveTotal, totalCap);
                  }
                  if (effectiveTotal != null) effectiveTotal = clamp(effectiveTotal, 0, maxTotal);
                  const effectivePct = (effectiveTotal != null && maxTotal)
                    ? round2((effectiveTotal / maxTotal) * 100)
                    : r.pct;
                  const totalChanged = cqiTotalAdded > 0;

                  return (
                    <>
                      {displayCols.map((col, i) => {
                        let val = getDisplayValue(r.cells, col);
                        let changed = false;

                        if (activeTab === 'after-cqi' && col.isMerged && col.co != null && publishedCoSet.has(Number(col.co))) {
                          const base = val;
                          const coMax = Number(col.weight) || 0;
                          const input = studentEntry?.[`co${col.co}`];
                          if (base != null && Number.isFinite(base) && coMax > 0) {
                            const add = computeCqiAdd({ coValue: Number(base), coMax, input: input == null ? null : Number(input) });
                            if (add > 0) {
                              changed = true;
                              val = clamp(round2(Number(base) + add), 0, coMax);
                            }
                          }
                        }

                        return (
                          <td
                            key={col.key || i}
                            style={{
                              border: '1px solid #e5e7eb',
                              padding: 6,
                              textAlign: 'center',
                              fontWeight: changed ? 900 : undefined,
                              color: changed ? '#16a34a' : undefined,
                              background: changed ? '#f0fdf4' : undefined,
                            }}
                          >
                            {val == null ? '' : Number(val).toFixed(2)}
                          </td>
                        );
                      })}
                      <td style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center', fontWeight: 800, color: totalChanged ? '#16a34a' : undefined, background: totalChanged ? '#f0fdf4' : undefined }}>
                        {effectiveTotal == null ? '' : Number(effectiveTotal).toFixed(2)}
                      </td>
                      <td style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'center', color: totalChanged ? '#16a34a' : undefined, background: totalChanged ? '#f0fdf4' : undefined }}>
                        {effectivePct == null ? '' : Number(effectivePct).toFixed(2)}
                      </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Export Modal ── */}
      {exportStep !== 'closed' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, minWidth: 360, maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', position: 'relative' }}>
            <button onClick={() => setExportStep('closed')} style={{ position: 'absolute', top: 12, right: 14, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>

            {exportStep === 'type' && (
              <>
                <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Export As</h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setExportStep('columns')}
                    style={{ flex: 1, padding: '14px 0', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                  >
                    📄 PDF
                  </button>
                  <button
                    disabled
                    title="Coming soon"
                    style={{ flex: 1, padding: '14px 0', background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'not-allowed', fontWeight: 700, fontSize: 14 }}
                  >
                    📊 Excel
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>Coming Soon</div>
                  </button>
                </div>
              </>
            )}

            {exportStep === 'columns' && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Select Columns</h3>
                <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>Choose which columns to include in the PDF</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => toggleAllExportCols(true)} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: '#f9fafb' }}>Select All</button>
                  <button onClick={() => toggleAllExportCols(false)} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: '#f9fafb' }}>Deselect All</button>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                  {exportCols.map((col) => (
                    <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={col.enabled} onChange={() => toggleExportCol(col.key)} />
                      {col.label}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setExportStep('type')} style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', background: '#fff', fontSize: 13 }}>Back</button>
                  <button
                    onClick={handleExportPdf}
                    disabled={exportingPdf || exportCols.every((c) => !c.enabled)}
                    style={{ padding: '8px 20px', background: exportingPdf ? '#93c5fd' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, cursor: exportingPdf ? 'default' : 'pointer', fontWeight: 700, fontSize: 13 }}
                  >
                    {exportingPdf ? 'Generating…' : '↓ Download PDF'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
