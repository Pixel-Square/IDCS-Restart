import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types matching backend build_question_rows() output ──────────────────────

export interface AuditReportQuestion {
  question_id: number;
  sl_no: number;
  details: string;
  documents_checklist?: string;
  detailed_description?: string;
  max_marks: string | number;
  marks?: string | number | null;
  comments?: string | null;
  below_60?: boolean;
  atr_action_taken?: string;
  atr_status?: string;
  score_updated_at?: string | null;
  atr_submitted_at?: string | null;
  // Legacy aliases (ignored safely)
  question_text?: string;
  category?: string;
  atr?: string;
  atr_status_legacy?: string;
}

export interface AuditReportData {
  assignment_id: number;
  cycle: string | number;
  cycle_label: string;
  department: {
    id: number;
    code: string;
    name: string;
    short_name?: string;
  };
  auditors: { staff_id: string; name: string; designation: string }[];
  status: string;
  remarks?: string | null;
  total_marks: number;
  max_marks: number;
  percentage: number | null;
  below_60_count: number;
  marks_submitted_on?: string | null;
  atr_submitted_on?: string | null;
  questions: AuditReportQuestion[];
}

// ─── Types for consolidated view ──────────────────────────────────────────────

export interface ConsolidatedDept {
  department_code: string;
  department_name: string;
  score_pct: number | null;
  status: string;
}

export interface AuditConsolidatedData {
  cycle: string | number;
  cycle_label?: string;
  departments: ConsolidatedDept[];
  [key: string]: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(val: number | null | undefined): string {
  if (val === undefined || val === null) return '—';
  return `${Number(val).toFixed(1)}%`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Safely get the display text for a question — handles both old and new API shapes. */
function qText(q: AuditReportQuestion): string {
  return (q.details || q.question_text || '').trim() || '—';
}

/** Safely get the ATR action taken — handles both old and new API shapes. */
function qAtr(q: AuditReportQuestion): string {
  return (q.atr_action_taken || q.atr || '').trim() || '—';
}

/** Safely get the ATR status. */
function qAtrStatus(q: AuditReportQuestion): string {
  return (q.atr_status || '').trim() || '—';
}

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageW = doc.internal.pageSize.getWidth();

  // Top color bar
  doc.setFillColor(30, 64, 175); // blue-800
  doc.rect(0, 0, pageW, 16, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('Academic Audit Report', pageW / 2, 10, { align: 'center' });

  // Subtitle row
  doc.setFillColor(239, 246, 255); // blue-50
  doc.rect(0, 16, pageW, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  doc.text(title, 14, 22);
  doc.text(subtitle, pageW - 14, 22, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  return 30; // y cursor after header
}

// ─── Individual Audit Report PDF ──────────────────────────────────────────────

export function downloadAuditReportPdf(report: AuditReportData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();

  const deptLabel = `${report.department?.code ?? ''} – ${report.department?.name ?? ''}`;
  const cycleLabel = report.cycle_label || `Cycle ${report.cycle}`;

  let y = addHeader(doc, deptLabel, cycleLabel);

  // ── Meta section ──────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const col1 = 14, col2 = pageW / 2 + 5;

  const metaLeft: [string, string][] = [
    ['Department', deptLabel],
    ['Cycle', cycleLabel],
    ['Status', report.status || '—'],
    ['Marks Submitted', fmtDate(report.marks_submitted_on)],
    ['ATR Submitted', fmtDate(report.atr_submitted_on)],
  ];

  const metaRight: [string, string][] = [
    ['Total Marks', `${report.total_marks} / ${report.max_marks}`],
    ['Score', pct(report.percentage)],
    ['Below 60% Count', String(report.below_60_count ?? '—')],
    ['Auditors', (report.auditors ?? []).map((a) => a.name || a.staff_id).join(', ') || '—'],
    ['Remarks', report.remarks || '—'],
  ];

  metaLeft.forEach(([label, value], i) => {
    const rowY = y + i * 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, col1, rowY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value ?? '—'), col1 + 38, rowY);
  });

  metaRight.forEach(([label, value], i) => {
    const rowY = y + i * 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, col2, rowY);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(value ?? '—'), 70);
    doc.text(lines, col2 + 35, rowY);
  });

  y += metaLeft.length * 6 + 8;

  // ── Score Table ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Question-wise Scores', col1, y);
  y += 4;

  const questions: AuditReportQuestion[] = report.questions || [];

  const rows: any[] = questions.map((q) => {
    const marksVal = q.marks !== undefined && q.marks !== null ? String(q.marks) : '—';
    const maxVal = q.max_marks !== undefined && q.max_marks !== null ? String(q.max_marks) : '—';
    const below = q.below_60 === true;
    return [
      { content: String(q.sl_no ?? q.question_id ?? ''), styles: { halign: 'center' as const } },
      { content: qText(q), styles: { cellWidth: 'wrap' as const } },
      { content: maxVal, styles: { halign: 'center' as const } },
      {
        content: marksVal,
        styles: {
          halign: 'center' as const,
          textColor: below ? [220, 38, 38] : [0, 0, 0],
          fontStyle: (below ? 'bold' : 'normal') as 'bold' | 'normal',
        },
      },
      { content: q.comments || '—' },
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['S.No', 'Details / Parameter', 'Max', 'Marks', 'Auditor\'s Comment']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 75 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 55 },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      // Re-draw header on each page
      addHeader(doc, deptLabel, cycleLabel);
    },
  });

  // ── ATR section if present ────────────────────────────────────────────────
  const atrRows = questions.filter(
    (q) => (q.atr_action_taken && q.atr_action_taken.trim()) || (q.atr && (q.atr as string).trim()),
  );
  if (atrRows.length > 0) {
    doc.addPage();
    let ay = addHeader(doc, deptLabel, cycleLabel);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Action Taken Report (ATR)', 14, ay);
    ay += 4;

    autoTable(doc, {
      startY: ay,
      head: [['S.No', 'Parameter / Question', 'Marks', 'Action Taken', 'ATR Status']],
      body: atrRows.map((q) => [
        { content: String(q.sl_no ?? q.question_id ?? ''), styles: { halign: 'center' as const } },
        qText(q),
        { content: q.marks !== undefined && q.marks !== null ? String(q.marks) : '—', styles: { halign: 'center' as const } },
        qAtr(q),
        { content: qAtrStatus(q), styles: { halign: 'center' as const } },
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 60 },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 70 },
        4: { cellWidth: 24, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Generated on ${new Date().toLocaleString('en-IN')} · Page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' },
    );
  }

  const fileName = `AuditReport_${report.department?.code ?? 'dept'}_${cycleLabel.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}

// ─── Consolidated Audit PDF ───────────────────────────────────────────────────

export function downloadConsolidatedAuditPdf(consolidated: any[]): void {
  if (!consolidated || consolidated.length === 0) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageW, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('Academic Audit – Consolidated Report', pageW / 2, 10, { align: 'center' });

  doc.setFillColor(239, 246, 255);
  doc.rect(0, 16, pageW, 9, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, 14, 22);
  doc.setTextColor(0, 0, 0);

  let y = 30;

  consolidated.forEach((c, ci) => {
    // Backend returns { cycle_id, cycle, label, departments: [...] }
    const cycleLabel = c.label || c.cycle_label || `Cycle ${c.cycle}`;
    const depts: any[] = c.departments || [];

    if (ci > 0) {
      doc.addPage();
      y = 30;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text(cycleLabel, 14, y);
    doc.setTextColor(0, 0, 0);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Dept Code', 'Department Name', 'Total Marks', 'Max Marks', 'Score %', 'Status', 'ATR Submitted']],
      body: depts.map((d) => [
        d.department_code || '—',
        d.department_name || '—',
        d.total_marks ?? '—',
        d.max_marks ?? '—',
        pct(d.percentage ?? d.score_pct),
        d.status || '—',
        d.atr_submitted !== undefined
          ? `${d.atr_submitted} / ${(d.atr_submitted || 0) + (d.atr_pending || 0)}`
          : '—',
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 80 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 35, halign: 'center' },
        6: { cellWidth: 30, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const val = parseFloat(String(depts[data.row.index]?.percentage ?? depts[data.row.index]?.score_pct ?? ''));
          if (!isNaN(val)) {
            data.cell.styles.textColor = val >= 60 ? [5, 150, 105] : [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 30;
  });

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' },
    );
  }

  doc.save(`AuditConsolidated_${new Date().toISOString().slice(0, 10)}.pdf`);
}
