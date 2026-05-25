/**
 * CO Summary Export — Excel (HTML-XLS) & PDF (jsPDF + autoTable)
 *
 * Excel : Generates a styled HTML workbook that Excel opens natively.
 *         Uses covered_cos per exam (fixes the "unwanted COs" bug).
 * PDF   : jsPDF landscape with autoTable, banner logo, course details bar.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '../../../assets/idcs-logo.png';
import * as XLSXStyle from 'xlsx-js-style';

/* ─── shared types (mirrors InternalMarkPage) ─── */
export interface ExportCOExam {
  id: string;
  name: string;
  short_name: string;
  max_marks: number;
  weight: number;
  co_weights: Record<string, number>;
  cia_enabled?: boolean;
  cia_weight?: number;
  cia_weight_per_co?: boolean;
  exam_max_marks?: number;
  covered_cos: number[];
  weight_per_co: number;
  max_per_co: number;
  co_max_map: Record<string, number>;
  combo_questions?: Array<{ key: string; co_list: number[]; max_marks: number }>;
  status: string;
  kind?: string;
}

export interface ExportCOStudent {
  reg_no: string;
  name: string;
  exam_marks: Record<string, Record<string, number | boolean>>;
  weighted_marks: Record<string, number>;
  co_totals: number[];
  final_mark: number;
}

export interface ExportCOSummary {
  course_code: string;
  course_name: string;
  co_count: number;
  total_internal_marks: number;
  exams: ExportCOExam[];
  students: ExportCOStudent[];
}

export interface ExportCourseInfo {
  course_code: string;
  course_name: string;
  class_name: string;
  section: string;
  semester: number;
  department: string;
  student_count: number;
  class_type: { id: string; name: string; total_internal_marks: number };
  qp_type: string | null;
  faculty_name?: string;
}

/* ─── helpers ─── */

const COLLEGE_NAME = 'K RAMAKRISHNAN COLLEGE OF TECHNOLOGY, Autonomous';

function fmt(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined) return '';
  return v.toFixed(dp);
}

/** Returns covered COs for an exam (falls back to all COs). */
function examCOs(ex: ExportCOExam, co_count: number): number[] {
  return ex.covered_cos && ex.covered_cos.length > 0
    ? ex.covered_cos
    : Array.from({ length: co_count }, (_, i) => i + 1);
}

/** Returns a cell value from a student row. */
function getCellVal(
  s: ExportCOStudent,
  ex: ExportCOExam,
  view: 'raw' | 'weighted',
  co_count: number,
  type: 'co' | 'exam_split' | 'combo' | 'total' | 'co_total' | 'final',
  co?: number,
  comboKey?: string,
  coTotalIdx?: number,
): string {
  const em = s.exam_marks[ex.id] || {};
  const absent = em.is_absent as boolean;

  if (absent) return 'AB';

  if (type === 'total') {
    const v = (em as any).total;
    return typeof v === 'number' ? fmt(v) : '';
  }

  if (type === 'combo' && comboKey) {
    const v = (em as any)[comboKey];
    return typeof v === 'number' ? fmt(v) : '';
  }

  if (type === 'co_total' && coTotalIdx !== undefined) {
    const v = s.co_totals[coTotalIdx];
    return typeof v === 'number' && v > 0 ? fmt(v) : '';
  }

  if (type === 'final') {
    return s.final_mark > 0 ? fmt(s.final_mark) : '';
  }

  if (view === 'raw') {
    if (type === 'exam_split') {
      const n = examCOs(ex, co_count).length || 1;
      const raw = (em.exam as number) ?? 0;
      return raw > 0 ? fmt(Math.round((raw / n) * 100) / 100) : '';
    }
    // co
    const v = (em as any)[`co${co}`];
    return typeof v === 'number' ? fmt(v) : '';
  }

  // weighted
  if (type === 'exam_split') {
    const key = `${ex.id}_exam_CO${co}`;
    const v = s.weighted_marks[key];
    return typeof v === 'number' && v > 0 ? fmt(v) : '';
  }
  // weighted co
  const key = `${ex.id}_CO${co}`;
  const v = s.weighted_marks[key];
  return typeof v === 'number' && v > 0 ? fmt(v) : '';
}

/* ════════════════════════════════════════════════════════
   EXCEL  (HTML workbook — opens in Excel with full styles)
   ════════════════════════════════════════════════════════ */

export function exportCOSummaryToExcel(
  data: ExportCOSummary,
  view: 'raw' | 'weighted',
  courseInfo: ExportCourseInfo,
) {
  const { exams, students, co_count, total_internal_marks } = data;
  const isW = view === 'weighted';

  /* ── Build column definitions (only covered_cos per exam) ── */
  type ColDef = {
    examId: string;
    examIdx: number;
    label: string;
    sub: string;
    co: number; // 0 = total, -1 = exam_split, -2 = combo
    type: 'co' | 'exam_split' | 'combo' | 'total';
    comboKey?: string;
    isCqi: boolean;
    weightNotSet?: boolean;
  };

  const cols: ColDef[] = [];

  exams.forEach((ex, ei) => {
    const isCqi = String(ex.kind || 'exam').toLowerCase() === 'cqi';
    const eCos = examCOs(ex, co_count);

    // Per-CO columns
    for (const co of eCos) {
      if (isW) {
        const w = (ex.co_weights?.[String(co)] ?? (ex.co_weights as any)?.[co] ?? ex.weight_per_co ?? 0) as number;
        const notSet = !isCqi && (!w || w <= 0);
        cols.push({
          examId: ex.id, examIdx: ei,
          label: `CO${co}`,
          sub: isCqi ? 'CQI' : notSet ? 'wt: NOT SET' : `wt: ${w}`,
          co, type: 'co', isCqi, weightNotSet: notSet,
        });
      } else {
        const coMax = ex.co_max_map?.[String(co)] ?? ex.max_per_co;
        cols.push({
          examId: ex.id, examIdx: ei,
          label: `CO${co}`, sub: `/${coMax}`,
          co, type: 'co', isCqi,
        });
      }
    }

    // Combo columns (raw only)
    if (!isW && Array.isArray(ex.combo_questions)) {
      ex.combo_questions.forEach((cq) => {
        cols.push({
          examId: ex.id, examIdx: ei,
          label: (cq.co_list || []).map((c) => `CO${c}`).join(' & ') || 'Combo',
          sub: `/${cq.max_marks || 0}`,
          co: -2, type: 'combo', isCqi: false, comboKey: cq.key,
        });
      });
    }

    // CIA exam-split columns
    if (ex.cia_enabled) {
      const ciaCos = eCos;
      const n = ciaCos.length || 1;
      const perCo = !!ex.cia_weight_per_co;
      for (const co of ciaCos) {
        const effectiveW = ex.cia_weight
          ? (perCo ? ex.cia_weight : Math.round((ex.cia_weight / n) * 100) / 100)
          : 0;
        const maxSplit = ex.exam_max_marks ? Math.round((ex.exam_max_marks / n) * 100) / 100 : 0;
        const sub = isW
          ? (effectiveW > 0 ? (perCo ? `E× wt:${effectiveW}` : `E wt:${effectiveW}`) : 'E wt: NOT SET')
          : `E /${maxSplit || '?'}`;
        cols.push({
          examId: ex.id, examIdx: ei,
          label: `CO${co}`, sub,
          co, type: 'exam_split', isCqi: true,
        });
      }
    }

    // Total column (raw only)
    if (!isW) {
      cols.push({
        examId: ex.id, examIdx: ei,
        label: 'Total', sub: `/${ex.max_marks}`,
        co: 0, type: 'total', isCqi,
      });
    }
  });

  /* ── Build exam groups for header row ── */
  const examGroups = exams.map((ex) => ({
    exam: ex,
    colCount: cols.filter((c) => c.examId === ex.id).length,
  }));

  /* ── CSS styles ── */
  const css = `
    table { border-collapse: collapse; font-family: Arial, Calibri, sans-serif; font-size: 9pt; }
    td, th { border: 1px solid #9ca3af; padding: 3px 6px; }
    .h-college { background:#1e3a8a; color:#ffffff; font-size:13pt; font-weight:bold; text-align:center; padding:8px; }
    .h-report  { background:#3730a3; color:#ffffff; font-size:10pt; font-weight:bold; text-align:center; padding:5px; }
    .h-info    { background:#f8fafc; color:#1e293b; font-size:8.5pt; padding:5px 8px; }
    .h-blank   { background:#ffffff; }
    .ex-hdr    { background:#1d4ed8; color:#ffffff; font-weight:bold; text-align:center; font-size:9pt; }
    .ex-hdr-cqi{ background:#7c3aed; color:#ffffff; font-weight:bold; text-align:center; font-size:9pt; }
    .co-sub    { background:#dbeafe; color:#1e3a8a; font-weight:bold; text-align:center; font-size:8pt; }
    .co-sub-cqi{ background:#ede9fe; color:#6d28d9; font-weight:bold; text-align:center; font-size:8pt; }
    .co-sub-tot{ background:#e2e8f0; color:#1e293b; font-weight:bold; text-align:center; font-size:8pt; }
    .col-total { background:#f0fdf4; color:#166534; font-weight:bold; text-align:center; }
    .col-final { background:#f0fdf4; color:#166534; font-weight:bold; text-align:center; }
    .col-p100  { background:#f5f3ff; color:#5b21b6; font-weight:bold; text-align:center; }
    .co-tot-h  { background:#4338ca; color:#ffffff; font-weight:bold; text-align:center; font-size:8pt; }
    .final-h   { background:#15803d; color:#ffffff; font-weight:bold; text-align:center; font-size:8pt; }
    .p100-h    { background:#7c3aed; color:#ffffff; font-weight:bold; text-align:center; font-size:8pt; }
    .sno       { text-align:center; background:#f8fafc; }
    .reg       { font-family:Courier New, monospace; font-size:8pt; }
    .absent    { color:#ef4444; font-style:italic; }
    .avg-row   { background:#fef3c7; color:#92400e; font-weight:bold; }
    .avg-co    { background:#e0e7ff; color:#3730a3; font-weight:bold; text-align:center; }
    .avg-final { background:#dcfce7; color:#14532d; font-weight:bold; text-align:center; }
    .avg-p100  { background:#ede9fe; color:#4c1d95; font-weight:bold; text-align:center; }
    .wt-notset { background:#fef2f2; color:#b91c1c; font-style:italic; }
    .num       { text-align:center; }
  `;

  /* ── Fixed left columns count ── */
  const leftCols = 3; // #, Reg No, Name
  const totalCols = leftCols + cols.length + (isW ? co_count + 2 : 0);

  /* ── Build header rows ── */
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8">
  <style>${css}</style>
  </head><body><table>`;

  // Row 1: College name
  html += `<tr><td colspan="${totalCols}" class="h-college">${COLLEGE_NAME}</td></tr>`;

  // Row 2: Report title
  const reportTitle = `Internal Marks — CO Summary (${isW ? 'Weighted' : 'Raw'} Marks)`;
  html += `<tr><td colspan="${totalCols}" class="h-report">${reportTitle}</td></tr>`;

  // Row 3: Single, simple course info line
  html += `<tr>
    <td colspan="${totalCols}" class="h-info">
      <b>${courseInfo.course_code}</b> — ${courseInfo.course_name}
      &nbsp;|&nbsp; <b>Class:</b> ${courseInfo.class_name}-${courseInfo.section}
      &nbsp;|&nbsp; <b>Sem:</b> ${courseInfo.semester}
      &nbsp;|&nbsp; <b>QP:</b> ${courseInfo.qp_type || 'N/A'}
      &nbsp;|&nbsp; <b>Total:</b> ${total_internal_marks}
      &nbsp;|&nbsp; <b>Students:</b> ${courseInfo.student_count}
    </td>
  </tr>`;

  // Row 4: blank
  html += `<tr><td colspan="${totalCols}" class="h-blank">&nbsp;</td></tr>`;

  /* ── Exam group header (row 6) ── */
  html += '<tr>';
  html += `<th rowspan="2" class="sno">#</th>`;
  html += `<th rowspan="2" class="reg">Reg No</th>`;
  html += `<th rowspan="2">Name</th>`;
  examGroups.forEach(({ exam, colCount }) => {
    const isCqi = String(exam.kind || 'exam').toLowerCase() === 'cqi';
    const cls = isCqi ? 'ex-hdr-cqi' : 'ex-hdr';
    html += `<th colspan="${colCount}" class="${cls}">${exam.short_name || exam.name} (Max:${exam.max_marks})${isCqi ? ' — CQI' : ''}</th>`;
  });
  if (isW) {
    for (let c = 1; c <= co_count; c++) {
      html += `<th rowspan="2" class="co-tot-h">CO${c}<br>Total</th>`;
    }
    html += `<th rowspan="2" class="final-h">Final<br>/${total_internal_marks}</th>`;
    html += `<th rowspan="2" class="p100-h">Total<br>/100</th>`;
  }
  html += '</tr>';

  /* ── CO sub-header (row 7) ── */
  html += '<tr>';
  cols.forEach((col) => {
    let cls = col.isCqi || col.type === 'exam_split' ? 'co-sub-cqi' : 'co-sub';
    if (col.type === 'total') cls = 'co-sub-tot';
    if (col.weightNotSet) cls = 'wt-notset';
    html += `<th class="${cls}">${col.label}<br><span style="font-size:7pt;font-weight:normal">${col.sub}</span></th>`;
  });
  html += '</tr>';

  /* ── Student rows ── */
  students.forEach((s, si) => {
    html += '<tr>';
    html += `<td class="sno">${si + 1}</td>`;
    html += `<td class="reg">${s.reg_no}</td>`;
    html += `<td>${s.name}</td>`;

    cols.forEach((col) => {
      const ex = exams[col.examIdx];
      const em = s.exam_marks[ex.id] || {};
      const absent = em.is_absent as boolean;
      if (absent) {
        html += `<td class="absent num">AB</td>`;
        return;
      }
      const val = getCellVal(s, ex, view, co_count, col.type, col.co > 0 ? col.co : undefined, col.comboKey);
      const cellCls = col.type === 'total' ? 'col-total num' : (col.isCqi || col.type === 'exam_split' ? 'num' : 'num');
      html += `<td class="${cellCls}">${val !== '' ? val : ''}</td>`;
    });

    if (isW) {
      s.co_totals.forEach((ct) => {
        html += `<td class="col-total num">${ct > 0 ? fmt(ct) : ''}</td>`;
      });
      html += `<td class="col-final num">${s.final_mark > 0 ? fmt(s.final_mark) : ''}</td>`;
      html += `<td class="col-p100 num">${s.final_mark > 0 ? fmt((s.final_mark / total_internal_marks) * 100) : ''}</td>`;
    }

    html += '</tr>';
  });

  /* ── Average row ── */
  const colAvgs = cols.map((col) => {
    const vals: number[] = [];
    students.forEach((s) => {
      const em = s.exam_marks[exams[col.examIdx].id] || {};
      if (em.is_absent) return;
      const v = getCellVal(s, exams[col.examIdx], view, co_count, col.type, col.co > 0 ? col.co : undefined, col.comboKey);
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) vals.push(n);
    });
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  html += '<tr class="avg-row">';
  html += `<td colspan="2" class="avg-row" style="text-align:center">Avg</td>`;
  html += `<td class="avg-row">Class Average</td>`;
  colAvgs.forEach((avg) => {
    html += `<td class="avg-row num">${avg !== null ? fmt(avg) : ''}</td>`;
  });
  if (isW) {
    for (let c = 0; c < co_count; c++) {
      const vals = students.map((s) => s.co_totals[c]).filter((v) => typeof v === 'number' && v > 0) as number[];
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      html += `<td class="avg-co">${avg !== null ? fmt(avg) : ''}</td>`;
    }
    const fVals = students.map((s) => s.final_mark).filter((v) => v > 0);
    const fAvg = fVals.length ? fVals.reduce((a, b) => a + b, 0) / fVals.length : null;
    html += `<td class="avg-final">${fAvg !== null ? fmt(fAvg) : ''}</td>`;
    html += `<td class="avg-p100">${fAvg !== null ? fmt((fAvg / total_internal_marks) * 100) : ''}</td>`;
  }
  html += '</tr>';

  html += '</table></body></html>';

  /* ── Trigger download ── */
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.course_code}_co_summary_${view}.xls`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/* ════════════════════════════════════════════════════════
   PDF   (jsPDF + autoTable — landscape A4)
   ════════════════════════════════════════════════════════ */

async function toBase64(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportCOSummaryToPDF(
  data: ExportCOSummary,
  view: 'raw' | 'weighted',
  courseInfo: ExportCourseInfo,
) {
  const { exams, students, co_count, total_internal_marks } = data;
  const isW = view === 'weighted';

  /* ── Build columns (same as Excel, using covered_cos) ── */
  type PdfCol = {
    examId: string;
    examIdx: number;
    label: string;
    sub: string;
    co: number;
    type: 'co' | 'exam_split' | 'combo' | 'total';
    isCqi: boolean;
    comboKey?: string;
  };

  const cols: PdfCol[] = [];

  exams.forEach((ex, ei) => {
    const isCqi = String(ex.kind || 'exam').toLowerCase() === 'cqi';
    const eCos = examCOs(ex, co_count);

    for (const co of eCos) {
      if (isW) {
        const w = (ex.co_weights?.[String(co)] ?? (ex.co_weights as any)?.[co] ?? ex.weight_per_co ?? 0) as number;
        cols.push({ examId: ex.id, examIdx: ei, label: `CO${co}`, sub: isCqi ? 'CQI' : (w > 0 ? `w:${w}` : 'N/S'), co, type: 'co', isCqi });
      } else {
        const coMax = ex.co_max_map?.[String(co)] ?? ex.max_per_co;
        cols.push({ examId: ex.id, examIdx: ei, label: `CO${co}`, sub: `/${coMax}`, co, type: 'co', isCqi });
      }
    }

    if (!isW && Array.isArray(ex.combo_questions)) {
      ex.combo_questions.forEach((cq) => {
        cols.push({ examId: ex.id, examIdx: ei, label: (cq.co_list || []).map((c) => `CO${c}`).join('&') || 'Combo', sub: `/${cq.max_marks || 0}`, co: -2, type: 'combo', isCqi: false, comboKey: cq.key });
      });
    }

    if (ex.cia_enabled) {
      const ciaCos = eCos;
      const n = ciaCos.length || 1;
      const perCo = !!ex.cia_weight_per_co;
      for (const co of ciaCos) {
        const effectiveW = ex.cia_weight ? (perCo ? ex.cia_weight : Math.round((ex.cia_weight / n) * 100) / 100) : 0;
        const maxSplit = ex.exam_max_marks ? Math.round((ex.exam_max_marks / n) * 100) / 100 : 0;
        const sub = isW ? (effectiveW > 0 ? `E${perCo ? '×' : ''}w:${effectiveW}` : 'E:N/S') : `E/${maxSplit || '?'}`;
        cols.push({ examId: ex.id, examIdx: ei, label: `CO${co}`, sub, co, type: 'exam_split', isCqi: true });
      }
    }

    if (!isW) {
      cols.push({ examId: ex.id, examIdx: ei, label: 'Total', sub: `/${ex.max_marks}`, co: 0, type: 'total', isCqi });
    }
  });

  /* ── Color palette ── */
  const DARK_BLUE: [number, number, number] = [30, 58, 138];
  const INDIGO: [number, number, number] = [55, 48, 163];
  const ROYAL_BLUE: [number, number, number] = [29, 78, 216];
  const PURPLE: [number, number, number] = [124, 58, 237];
  const TEAL: [number, number, number] = [21, 128, 61];
  const AMBER_BG: [number, number, number] = [254, 243, 199];
  const AMBER_FG: [number, number, number] = [146, 64, 14];
  const WHITE: [number, number, number] = [255, 255, 255];
  const LIGHT_GRAY: [number, number, number] = [241, 245, 249];

  /* ── PDF setup ── */
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 28;

  /* ── Banner ── */
  let contentY = 20;
  const logoB64 = await toBase64(logoUrl);
  if (logoB64) {
    try {
      const img = new Image();
      img.src = logoB64;
      await new Promise((res) => { img.onload = res; img.onerror = res; });
      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      const maxW = pageW - marginX * 2;
      const maxH = 110;
      let dw = maxW;
      let dh = dw / (iw / ih);
      if (dh > maxH) { dh = maxH; dw = dh * (iw / ih); }
      const bx = (pageW - dw) / 2;
      doc.addImage(logoB64, 'PNG', bx, contentY, dw, dh);
      contentY += dh + 8;
    } catch { /* ignore */ }
  }

  /* ── Details bar ── */
  const detailsBarH = 54;
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(marginX, contentY, pageW - marginX * 2, detailsBarH, 3, 3, 'F');
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.8);
  doc.roundedRect(marginX, contentY, pageW - marginX * 2, detailsBarH, 3, 3, 'S');

  const textX = marginX + 10;
  const line1Y = contentY + 15;
  const line2Y = contentY + 28;
  const line3Y = contentY + 41;

  doc.setFontSize(8);
  doc.setTextColor(...DARK_BLUE);
  doc.setFont('helvetica', 'bold');
  doc.text(`Course: ${courseInfo.course_code} — ${courseInfo.course_name}`, textX, line1Y);
  doc.text(
    `Class: ${courseInfo.class_name}   |   Section: ${courseInfo.section}   |   Semester: ${courseInfo.semester}   |   Dept: ${courseInfo.department}`,
    textX, line2Y,
  );
  doc.text(
    `Class Type: ${courseInfo.class_type.name}   |   QP Type: ${courseInfo.qp_type || 'N/A'}   |   Total Internal Marks: ${total_internal_marks}   |   Students: ${courseInfo.student_count}`,
    textX, line3Y,
  );

  // Report type badge (right side)
  const badge = isW ? 'Weighted Marks' : 'Raw Marks';
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);
  doc.setFillColor(...INDIGO);
  const bw = doc.getTextWidth(badge) + 12;
  const bx2 = pageW - marginX - 10 - bw;
  doc.roundedRect(bx2, contentY + 8, bw, 14, 2, 2, 'F');
  doc.text(badge, bx2 + 6, contentY + 17.5);

  contentY += detailsBarH + 8;

  /* ── Table headers ── */
  // Row 1: exam group spans
  const leftColLabels = ['#', 'Reg No', 'Name'];
  const coTotalLabels = isW ? Array.from({ length: co_count }, (_, i) => `CO${i + 1}\nTotal`) : [];
  const rightLabels = isW ? [`Final\n/${total_internal_marks}`, 'Total\n/100'] : [];

  // Build head array for autoTable (two header rows)
  type CellDef = { content: string; rowSpan?: number; colSpan?: number; styles?: Record<string, unknown> };

  const headerRow1: CellDef[] = [
    { content: '#', rowSpan: 2, styles: { fillColor: DARK_BLUE, textColor: WHITE, fontStyle: 'bold', halign: 'center', fontSize: 7 } },
    { content: 'Reg No', rowSpan: 2, styles: { fillColor: DARK_BLUE, textColor: WHITE, fontStyle: 'bold', halign: 'center', fontSize: 7 } },
    { content: 'Name', rowSpan: 2, styles: { fillColor: DARK_BLUE, textColor: WHITE, fontStyle: 'bold', halign: 'left', fontSize: 7 } },
  ];

  exams.forEach((ex) => {
    const isCqi = String(ex.kind || 'exam').toLowerCase() === 'cqi';
    const colCount = cols.filter((c) => c.examId === ex.id).length;
    if (colCount === 0) return;
    const wInfo = isCqi ? 'CQI'
      : Object.entries(ex.co_weights || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([co, w]) => `CO${co}:${w}`).join(' ') || 'Wt N/S';
    headerRow1.push({
      content: `${ex.short_name} — ${ex.name} (Max:${ex.max_marks}) ${wInfo}`,
      colSpan: colCount,
      styles: { fillColor: isCqi ? PURPLE : ROYAL_BLUE, textColor: WHITE, fontStyle: 'bold', halign: 'center', fontSize: 6.5 },
    });
  });

  if (isW) {
    for (let c = 1; c <= co_count; c++) {
      headerRow1.push({ content: `CO${c}\nTotal`, rowSpan: 2, styles: { fillColor: [67, 56, 202] as [number, number, number], textColor: WHITE, fontStyle: 'bold', halign: 'center', fontSize: 6.5 } });
    }
    headerRow1.push({ content: `Final\n/${total_internal_marks}`, rowSpan: 2, styles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', halign: 'center', fontSize: 6.5 } });
    headerRow1.push({ content: 'Total\n/100', rowSpan: 2, styles: { fillColor: PURPLE, textColor: WHITE, fontStyle: 'bold', halign: 'center', fontSize: 6.5 } });
  }

  const headerRow2: CellDef[] = cols.map((col) => {
    const bg = col.type === 'total' ? [226, 232, 240] as [number, number, number]
      : col.isCqi || col.type === 'exam_split' ? [237, 233, 254] as [number, number, number]
      : [219, 234, 254] as [number, number, number];
    const fg = col.type === 'total' ? [30, 41, 59] as [number, number, number]
      : col.isCqi || col.type === 'exam_split' ? [109, 40, 217] as [number, number, number]
      : [30, 58, 138] as [number, number, number];
    return {
      content: `${col.label}\n${col.sub}`,
      styles: { fillColor: bg, textColor: fg, fontStyle: 'bold', halign: 'center', fontSize: 6 },
    };
  });

  /* ── Table body rows ── */
  const body: (string | { content: string; styles: Record<string, unknown> })[][] = [];

  students.forEach((s, si) => {
    const row: (string | { content: string; styles: Record<string, unknown> })[] = [
      String(si + 1),
      s.reg_no,
      s.name,
    ];

    cols.forEach((col) => {
      const ex = exams[col.examIdx];
      const em = s.exam_marks[ex.id] || {};
      if (em.is_absent) {
        row.push({ content: 'AB', styles: { textColor: [239, 68, 68] as [number, number, number], fontStyle: 'italic', halign: 'center' } });
        return;
      }
      const val = getCellVal(s, ex, view, co_count, col.type, col.co > 0 ? col.co : undefined, col.comboKey);
      row.push(val || '-');
    });

    if (isW) {
      s.co_totals.forEach((ct) => row.push(ct > 0 ? fmt(ct) : '-'));
      row.push(s.final_mark > 0 ? fmt(s.final_mark) : '-');
      row.push(s.final_mark > 0 ? fmt((s.final_mark / total_internal_marks) * 100) : '-');
    }

    body.push(row);
  });

  /* ── Average row ── */
  const avgRow: (string | { content: string; styles: Record<string, unknown> })[] = [
    { content: 'Avg', styles: { fontStyle: 'bold', textColor: AMBER_FG, fillColor: AMBER_BG, halign: 'center' } },
    { content: '', styles: { fillColor: AMBER_BG } },
    { content: 'Class Average', styles: { fontStyle: 'bold', textColor: AMBER_FG, fillColor: AMBER_BG } },
  ];
  cols.forEach((col) => {
    const vals: number[] = [];
    students.forEach((s) => {
      const em = s.exam_marks[exams[col.examIdx].id] || {};
      if (em.is_absent) return;
      const v = getCellVal(s, exams[col.examIdx], view, co_count, col.type, col.co > 0 ? col.co : undefined, col.comboKey);
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) vals.push(n);
    });
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    avgRow.push({ content: avg !== null ? fmt(avg) : '-', styles: { fontStyle: 'bold', textColor: AMBER_FG, fillColor: AMBER_BG, halign: 'center' } });
  });
  if (isW) {
    for (let c = 0; c < co_count; c++) {
      const vals = students.map((s) => s.co_totals[c]).filter((v) => v > 0) as number[];
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      avgRow.push({ content: avg !== null ? fmt(avg) : '-', styles: { fontStyle: 'bold', textColor: [55, 48, 163] as [number, number, number], fillColor: [224, 231, 255] as [number, number, number], halign: 'center' } });
    }
    const fVals = students.map((s) => s.final_mark).filter((v) => v > 0);
    const fAvg = fVals.length ? fVals.reduce((a, b) => a + b, 0) / fVals.length : null;
    avgRow.push({ content: fAvg !== null ? fmt(fAvg) : '-', styles: { fontStyle: 'bold', textColor: [20, 83, 45] as [number, number, number], fillColor: [220, 252, 231] as [number, number, number], halign: 'center' } });
    avgRow.push({ content: fAvg !== null ? fmt((fAvg / total_internal_marks) * 100) : '-', styles: { fontStyle: 'bold', textColor: [76, 29, 149] as [number, number, number], fillColor: [237, 233, 254] as [number, number, number], halign: 'center' } });
  }
  body.push(avgRow as string[][]);

  /* ── Compute column widths ── */
  const totalDataCols = 3 + cols.length + (isW ? co_count + 2 : 0);
  const availW = pageW - marginX * 2;
  const nameW = 90;
  const snoW = 22;
  const regW = 58;
  const totalW = 40;
  const finalW = 38;
  const p100W = 38;
  const coTotW = 36;
  const examColW = Math.max(
    22,
    Math.floor(
      (availW - snoW - regW - nameW - (isW ? co_count * coTotW + finalW + p100W : 0)) /
      Math.max(1, cols.length),
    ),
  );
  const columnStyles: Record<number, { cellWidth: number; halign?: string }> = {
    0: { cellWidth: snoW, halign: 'center' },
    1: { cellWidth: regW },
    2: { cellWidth: nameW },
  };
  cols.forEach((_, i) => { columnStyles[3 + i] = { cellWidth: examColW, halign: 'center' }; });
  if (isW) {
    for (let c = 0; c < co_count; c++) columnStyles[3 + cols.length + c] = { cellWidth: coTotW, halign: 'center' };
    columnStyles[3 + cols.length + co_count] = { cellWidth: finalW, halign: 'center' };
    columnStyles[3 + cols.length + co_count + 1] = { cellWidth: p100W, halign: 'center' };
  }

  /* ── Draw table ── */
  autoTable(doc, {
    head: [headerRow1 as any[], headerRow2 as any[]],
    body: body as any[][],
    startY: contentY,
    margin: { left: marginX, right: marginX },
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      overflow: 'linebreak',
      lineColor: [209, 213, 219] as [number, number, number],
      lineWidth: 0.3,
    },
    headStyles: { minCellHeight: 14 },
    bodyStyles: { textColor: [31, 41, 55] as [number, number, number] },
    alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
    columnStyles: columnStyles as any,
    didDrawPage: (hookData) => {
      // Page number footer
      const pageNum = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Page ${hookData.pageNumber}  |  ${COLLEGE_NAME}  |  Generated: ${new Date().toLocaleDateString()}`,
        marginX,
        pageH - 12,
      );
    },
  });

  /* ── Save ── */
  const filename = `${data.course_code}_co_summary_${view}.pdf`;
  doc.save(filename);
}

/* ════════════════════════════════════════════════════════
   INTERNAL MARKS EXCEL  (.xlsx — xlsx-js-style, 2 sheets)
   Sheet 1: Full Summary (per-exam CO marks + FIM Before/After CQI)
   Sheet 2: Internal Marks (Reg No, Name, /100)
   ════════════════════════════════════════════════════════ */

type XCell = XLSXStyle.CellObject & { s?: Record<string, unknown> };

function mkStyle(
  bg: string,
  fg: string,
  bold: boolean,
  sz: number,
  halign: string,
  wrapText: boolean,
  borderColor: string,
  patternType = 'solid',
) {
  const border = {
    left:   { style: 'thin', color: { rgb: borderColor } },
    right:  { style: 'thin', color: { rgb: borderColor } },
    top:    { style: 'thin', color: { rgb: borderColor } },
    bottom: { style: 'thin', color: { rgb: borderColor } },
  };
  return {
    font:      { bold, sz, color: { rgb: fg }, name: 'Calibri' },
    fill:      bg ? { patternType, fgColor: { rgb: bg } } : undefined,
    alignment: { horizontal: halign, vertical: 'center', wrapText },
    border,
  };
}

const S = {
  col:   mkStyle('1E3A8A', 'FFFFFF', true,  13, 'center', true,  'CBD5E1'),
  title: mkStyle('3730A3', 'FFFFFF', true,  11, 'center', false, 'CBD5E1'),
  info:  mkStyle('F8FAFC', '1E293B', false, 9,  'center', true,  'CBD5E1'),
  grp:   mkStyle('1D4ED8', 'FFFFFF', true,  9,  'center', true,  '93C5FD'),
  sub:   mkStyle('DBEAFE', '1E3A8A', true,  8,  'center', false, '93C5FD'),
  co:    mkStyle('DBEAFE', '1E3A8A', true,  8,  'center', false, '93C5FD'),
  fb:    mkStyle('065F46', 'FFFFFF', true,  9,  'center', true,  '6EE7B7'),
  fa:    mkStyle('4338CA', 'FFFFFF', true,  9,  'center', true,  'A5B4FC'),
  num:   mkStyle('',       '000000', false, 9,  'center', false, 'D1D5DB'),
  str:   mkStyle('',       '000000', false, 9,  'left',   false, 'D1D5DB'),
  ab:    mkStyle('FEF2F2', 'B91C1C', true,  9,  'center', false, 'FECACA'),
};

function cell(v: string | number | null | undefined, s: Record<string, unknown>): XCell {
  if (v === null || v === undefined || v === '') return { v: '', t: 's', s };
  if (typeof v === 'number') return { v, t: 'n', s };
  return { v: String(v), t: 's', s };
}

function buildSheet(
  rows: (XCell | null)[][],
  merges: XLSXStyle.Range[],
): XLSXStyle.WorkSheet {
  const ws: XLSXStyle.WorkSheet = {};
  let maxR = 0, maxC = 0;
  rows.forEach((row, r) => {
    row.forEach((cellObj, c) => {
      if (!cellObj) return;
      const ref = XLSXStyle.utils.encode_cell({ r, c });
      ws[ref] = cellObj as XLSXStyle.CellObject;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    });
  });
  ws['!ref'] = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  ws['!merges'] = merges;
  return ws;
}

export function exportInternalMarksExcel(
  data: ExportCOSummary,
  courseInfo: ExportCourseInfo,
) {
  const { exams, students, co_count, total_internal_marks } = data;

  const isLabExam = (ex: ExportCOExam) =>
    String(ex.kind || '').toLowerCase() === 'lab' ||
    /lab/i.test(ex.short_name || ex.name || '');

  const isCqiExam = (ex: ExportCOExam) =>
    String(ex.kind || 'exam').toLowerCase() === 'cqi';

  const nonCqiExams = exams.filter((ex) => !isCqiExam(ex));
  const coNums = Array.from({ length: co_count }, (_, i) => i + 1);

  const r2 = (v: number) => Math.round(v * 100) / 100;

  // Per-exam: only CO columns with at least one non-zero, non-absent value
  const examActiveCOs = new Map<string, number[]>();
  for (const ex of nonCqiExams) {
    if (!isLabExam(ex)) {
      const active = coNums.filter((co) =>
        students.some((s) => {
          const em = (s.exam_marks[ex.id] || {}) as Record<string, number | boolean>;
          if ((em as any).is_absent) return false;
          const v = (em as any)[`co${co}`];
          return typeof v === 'number' && v !== 0;
        }),
      );
      examActiveCOs.set(ex.id, active.length > 0 ? active : coNums);
    }
  }

  const examColCount = (ex: ExportCOExam) => {
    if (isLabExam(ex)) return 1;
    return (examActiveCOs.get(ex.id) || coNums).length + 1; // active COs + Total
  };
  const totalExamCols = nonCqiExams.reduce((s, ex) => s + examColCount(ex), 0);
  const fimCols = co_count + 2; // CO1..N + /TIM + /100
  const totalCols = 3 + totalExamCols + fimCols * 2;
  const dtStr = new Date().toLocaleDateString('en-IN');

  const infoStr =
    `${courseInfo.course_code} - ${courseInfo.course_name} | ` +
    `${courseInfo.class_name} ${courseInfo.section} | ` +
    `Sem ${courseInfo.semester} | ${courseInfo.department}` +
    (courseInfo.faculty_name ? ` | Faculty: ${courseInfo.faculty_name}` : '') +
    ` | Generated: ${dtStr}`;

  /* ══════════════════════════════════════════════════════
     Sheet 1 — Full Summary
     ══════════════════════════════════════════════════════ */
  const sumData: (XCell | null)[][] = [];
  const sumMerges: XLSXStyle.Range[] = [];

  const merge = (merges: XLSXStyle.Range[], r: number, cs: number, ce: number) => {
    if (ce > cs) merges.push({ s: { r, c: cs }, e: { r, c: ce } });
  };

  // Row 0 – college name
  const row0: (XCell | null)[] = [cell(COLLEGE_NAME, S.col)];
  for (let i = 1; i < totalCols; i++) row0.push(cell('', S.col));
  merge(sumMerges, 0, 0, totalCols - 1);
  sumData.push(row0);

  // Row 1 – sheet title
  const row1: (XCell | null)[] = [cell('INTERNAL MARKS — FULL SUMMARY', S.title)];
  for (let i = 1; i < totalCols; i++) row1.push(cell('', S.title));
  merge(sumMerges, 1, 0, totalCols - 1);
  sumData.push(row1);

  // Row 2 – info
  const row2: (XCell | null)[] = [cell(infoStr, S.info)];
  for (let i = 1; i < totalCols; i++) row2.push(cell('', S.info));
  merge(sumMerges, 2, 0, totalCols - 1);
  sumData.push(row2);

  // Row 3 – spacer
  sumData.push([]);

  // Row 4 – exam group headers
  const row4: (XCell | null)[] = [];
  row4.push(cell('S.No', S.grp));
  row4.push(cell("Student's Name", S.grp));
  row4.push(cell('Register Number', S.grp));
  let col4 = 3;
  for (const ex of nonCqiExams) {
    const span = examColCount(ex);
    row4.push(cell(ex.name || ex.short_name || 'Exam', S.grp));
    for (let i = 1; i < span; i++) row4.push(cell('', S.grp));
    merge(sumMerges, 4, col4, col4 + span - 1);
    col4 += span;
  }
  row4.push(cell('FIM (Before CQI)', S.fb));
  for (let i = 1; i < fimCols; i++) row4.push(cell('', S.fb));
  merge(sumMerges, 4, col4, col4 + fimCols - 1);
  col4 += fimCols;
  row4.push(cell('FIM (After CQI)', S.fa));
  for (let i = 1; i < fimCols; i++) row4.push(cell('', S.fa));
  merge(sumMerges, 4, col4, col4 + fimCols - 1);
  sumData.push(row4);

  // Row 5 – sub-headers
  const row5: (XCell | null)[] = [];
  row5.push(cell('', S.sub));
  row5.push(cell('', S.sub));
  row5.push(cell('', S.sub));
  for (const ex of nonCqiExams) {
    if (isLabExam(ex)) {
      row5.push(cell('Total', S.sub));
    } else {
      const exCOs = examActiveCOs.get(ex.id) || coNums;
      for (const co of exCOs) row5.push(cell(`CO${co}`, S.co));
      row5.push(cell('Total', S.sub));
    }
  }
  for (const co of coNums) row5.push(cell(`CO${co}`, S.co));
  row5.push(cell(`/${total_internal_marks}`, S.sub));
  row5.push(cell('/100', S.sub));
  for (const co of coNums) row5.push(cell(`CO${co}`, S.co));
  row5.push(cell(`/${total_internal_marks}`, S.sub));
  row5.push(cell('/100', S.sub));
  sumData.push(row5);

  // Data rows
  students.forEach((s, idx) => {
    const em = s.exam_marks || {};
    const rowN: (XCell | null)[] = [];
    rowN.push(cell(idx + 1, S.num));
    rowN.push(cell(s.name || '', S.str));
    rowN.push(cell(s.reg_no || '', S.str));

    for (const ex of nonCqiExams) {
      const examEM = (em[ex.id] || {}) as Record<string, number | boolean>;
      const absent = (examEM as any).is_absent as boolean;
      if (isLabExam(ex)) {
        const tot = absent ? null : ((examEM as any).total as number | null | undefined) ?? null;
        rowN.push(absent ? cell('AB', S.ab) : cell(tot ?? '', S.num));
      } else {
        const exCOs = examActiveCOs.get(ex.id) || coNums;
        for (const co of exCOs) {
          const v = absent ? null : ((examEM as any)[`co${co}`] as number | null | undefined) ?? null;
          rowN.push(absent ? cell('AB', S.ab) : cell(v ?? '', S.num));
        }
        const tot = absent ? null : ((examEM as any).total as number | null | undefined) ?? null;
        rowN.push(absent ? cell('AB', S.ab) : cell(tot ?? '', S.num));
      }
    }

    // FIM Before CQI
    const fimBefore = coNums.map((co) =>
      nonCqiExams.reduce((sum, ex) => sum + (s.weighted_marks[`${ex.id}_CO${co}`] || 0), 0),
    );
    const before50 = r2(fimBefore.reduce((a, b) => a + b, 0));
    const before100 = total_internal_marks > 0
      ? Math.round((before50 / total_internal_marks) * 100) : 0;
    for (const co of coNums) rowN.push(cell(r2(fimBefore[co - 1]), S.num));
    rowN.push(cell(before50, S.num));
    rowN.push(cell(before100, S.num));

    // FIM After CQI
    const after50 = r2(s.final_mark || 0);
    const after100 = total_internal_marks > 0
      ? Math.round((after50 / total_internal_marks) * 100) : 0;
    for (const co of coNums) rowN.push(cell(r2(s.co_totals[co - 1] || 0), S.num));
    rowN.push(cell(after50, S.num));
    rowN.push(cell(after100, S.num));

    sumData.push(rowN);
  });

  /* ══════════════════════════════════════════════════════
     Sheet 2 — Internal Marks
     ══════════════════════════════════════════════════════ */
  const imCols = 4;
  const imData: (XCell | null)[][] = [];
  const imMerges: XLSXStyle.Range[] = [];

  const imInfoStr =
    `${courseInfo.course_code} - ${courseInfo.course_name} | ` +
    `${courseInfo.class_name} ${courseInfo.section} | Sem ${courseInfo.semester} | ${courseInfo.department}` +
    (courseInfo.faculty_name ? ` | Faculty: ${courseInfo.faculty_name}` : '');

  const imMergeRow = (r: number) => merge(imMerges, r, 0, imCols - 1);

  const imRow0 = [cell(COLLEGE_NAME, S.col), ...Array(imCols - 1).fill(cell('', S.col))];
  imMergeRow(0); imData.push(imRow0);

  const imRow1 = [cell('INTERNAL MARKS', S.title), ...Array(imCols - 1).fill(cell('', S.title))];
  imMergeRow(1); imData.push(imRow1);

  const imRow2 = [cell(imInfoStr, S.info), ...Array(imCols - 1).fill(cell('', S.info))];
  imMergeRow(2); imData.push(imRow2);

  imData.push([]); // spacer

  imData.push([
    cell('S.No', S.grp),
    cell('Register Number', S.grp),
    cell("Student's Name", S.grp),
    cell('Internal Marks (/100)', S.grp),
  ]);

  students.forEach((s, idx) => {
    const after50 = r2(s.final_mark || 0);
    const after100 = total_internal_marks > 0
      ? Math.round((after50 / total_internal_marks) * 100) : 0;
    imData.push([
      cell(idx + 1, S.num),
      cell(s.reg_no || '', S.str),
      cell(s.name || '', S.str),
      cell(after100, S.num),
    ]);
  });

  /* ─── Assemble & download ─── */
  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, buildSheet(sumData, sumMerges), 'Full Summary');
  XLSXStyle.utils.book_append_sheet(wb, buildSheet(imData, imMerges), 'Internal Marks');

  const wbout = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.course_code}_internal_marks_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
