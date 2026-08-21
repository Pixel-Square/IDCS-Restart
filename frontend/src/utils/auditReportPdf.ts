import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { AuditConsolidated, AuditReport } from '../services/audits'

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`
}

const COLLEGE = 'K.RAMAKRISHNAN COLLEGE OF TECHNOLOGY'
const SUBTITLE = 'Department of Internal Quality Assurance (IQAC)'
const MARGIN = 14
const PAGE_W = 210 // A4 portrait width (mm)
const CONTENT_W = PAGE_W - MARGIN * 2 // 182

function drawPageHeader(doc: jsPDF, title: string, report: AuditReport, startY: number) {
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(COLLEGE, PAGE_W / 2, 14, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`${SUBTITLE} - ${title}`, PAGE_W / 2, 20, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`Department: ${report.department.code} - ${report.department.name}`, MARGIN, startY)
  doc.text(`Cycle: ${report.cycle_label}`, PAGE_W - MARGIN, startY, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  const auditorNames = (report.auditors || []).map((a) => `${a.name} (${a.staff_id})`).join(', ') || '—'
  doc.text(`Auditor(s): ${auditorNames}`, MARGIN, startY + 6)
  doc.text(`Status: ${report.status}`, PAGE_W - MARGIN, startY + 6, { align: 'right' })
}

/** Download audit marks (page 1) + ATR (page 2) as a portrait A4 PDF. */
export function downloadAuditReportPdf(report: AuditReport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const questions = report.questions || []
  const atrQuestions = questions.filter((q) => q.below_60)

  // ─── PAGE 1: Audit Report (marks) ──────────────────────────────────────
  drawPageHeader(doc, 'Academic Audit Report', report, 28)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Marks entered on: ${fmtDate(report.marks_submitted_on)}`, MARGIN, 40)

  autoTable(doc, {
    startY: 44,
    head: [['S.No', 'Details', 'Max', 'Score', "Auditor's Comment"]],
    body: questions.map((q) => [
      q.sl_no,
      q.details,
      q.max_marks,
      q.marks ?? '—',
      q.comments || '—',
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.6, valign: 'top', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: CONTENT_W - 12 - 16 - 18 - 38 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 38 },
    },
    margin: { left: MARGIN, right: MARGIN },
  })

  const summaryY = ((doc as any).lastAutoTable?.finalY ?? 44) + 7
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `Total: ${report.total_marks} / ${report.max_marks}    |    Percentage: ${report.percentage}%    |    Parameters below 60%: ${report.below_60_count}`,
    MARGIN,
    summaryY,
  )
  if (report.remarks) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Remarks: ${report.remarks}`, MARGIN, summaryY + 6)
  }

  // ─── PAGE 2: ATR Report ────────────────────────────────────────────────
  if (atrQuestions.length > 0) {
    doc.addPage()
    drawPageHeader(doc, 'Action Taken Report (ATR)', report, 28)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`ATR submitted on: ${fmtDate(report.atr_submitted_on)}`, MARGIN, 40)

    autoTable(doc, {
      startY: 44,
      head: [['S.No', 'Details', 'Max', 'Score', 'ATR Action Taken', 'ATR', 'ATR Date']],
      body: atrQuestions.map((q) => [
        q.sl_no,
        q.details,
        q.max_marks,
        q.marks ?? '—',
        q.atr_action_taken || '—',
        q.atr_status === 'SUBMITTED' ? 'Submitted' : 'Pending',
        fmtDate(q.atr_submitted_at),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.6, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [180, 40, 40], textColor: 255, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: CONTENT_W - 12 - 14 - 16 - 50 - 16 - 24 },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 50 },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 24, halign: 'center' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })

    const atrSummaryY = ((doc as any).lastAutoTable?.finalY ?? 44) + 7
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total ATR parameters: ${atrQuestions.length}`, MARGIN, atrSummaryY)
  }

  doc.save(`Audit_ATR_Report_${report.department.code}_Cycle_${report.cycle}.pdf`)
}

function todayStr(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

type ChartPoint = { label: string; pct: number }

/** Interpolate a smooth (Catmull-Rom) curve through the given points. */
function smoothCurvePoints(points: { x: number; y: number }[], samplesPerSegment = 16): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    for (let s = 0; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment
      const t2 = t * t
      const t3 = t2 * t
      const x = 0.5 * (
        2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      )
      const y = 0.5 * (
        2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      )
      if (i === 0 || s > 0) out.push({ x, y })
    }
  }
  return out
}

/**
 * Draw a department-wise score comparison line chart (mirrors the on-screen
 * consolidated review graph) into the PDF using jsPDF primitives.
 */
function drawConsolidatedChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  points: ChartPoint[],
) {
  if (points.length < 2) return
  const padL = 16
  const padR = 6
  const padT = 4
  const padB = 14
  const chartW = w - padL - padR
  const chartH = h - padT - padB
  const minPct = 0
  const maxPct = 100

  const px = (i: number) => x + padL + (i / (points.length - 1)) * chartW
  const py = (pct: number) => y + padT + ((maxPct - pct) / (maxPct - minPct)) * chartH

  // Horizontal gridlines + y-axis labels (0, 20, …, 100)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  for (let g = 0; g <= 100; g += 20) {
    const gy = py(g)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.line(x + padL, gy, x + padL + chartW, gy)
    doc.setTextColor(148, 163, 184)
    doc.text(`${g}%`, x + padL - 1.5, gy + 1.5, { align: 'right' })
  }

  // 60% threshold reference line
  const y60 = py(60)
  doc.setDrawColor(239, 68, 68)
  doc.setLineWidth(0.3)
  doc.setLineDashPattern([1.5, 1.5], 0)
  doc.line(x + padL, y60, x + padL + chartW, y60)
  doc.setLineDashPattern([], 0)
  doc.setTextColor(239, 68, 68)
  doc.text('60%', x + padL + chartW - 1, y60 - 1.5, { align: 'right' })

  // X-axis department labels
  doc.setFontSize(6.5)
  doc.setTextColor(71, 85, 105)
  for (let i = 0; i < points.length; i++) {
    doc.text(points[i].label, px(i), y + padT + chartH + 4, { align: 'center' })
  }

  // Smooth curved line
  const pts = points.map((p, i) => ({ x: px(i), y: py(p.pct) }))
  const curve = smoothCurvePoints(pts, 16)
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(0.55)
  for (let i = 0; i < curve.length - 1; i++) {
    doc.line(curve[i].x, curve[i].y, curve[i + 1].x, curve[i + 1].y)
  }

  // Data-point dots (green ≥60%, red <60%)
  for (let i = 0; i < pts.length; i++) {
    const color = pts[i].y <= y60 ? [16, 185, 129] : [239, 68, 68]
    doc.setFillColor(color[0], color[1], color[2])
    doc.circle(pts[i].x, pts[i].y, 1.2, 'F')
  }

  // Reset drawing defaults
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
}

/** Download a consolidated table of all departments' audit scores (per cycle) as a portrait A4 PDF. */
export function downloadConsolidatedAuditPdf(consolidated: AuditConsolidated[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(COLLEGE, PAGE_W / 2, 14, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`${SUBTITLE} - Consolidated Academic Audit Scores`, PAGE_W / 2, 20, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated on: ${todayStr()}`, PAGE_W / 2, 26, { align: 'center' })

  let startY = 32
  consolidated.forEach((cycle, idx) => {
    if (idx > 0) {
      doc.addPage()
      startY = 20
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(cycle.label, MARGIN, startY)
    startY += 6

    // Graph: department-wise score comparison (mirrors the consolidated review chart)
    const chartPoints = cycle.departments.map((d) => ({ label: d.department_code, pct: d.percentage }))
    if (chartPoints.length > 1) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(51, 65, 85)
      doc.text('Department-wise Score Comparison (%)', MARGIN, startY)
      doc.setTextColor(0, 0, 0)
      startY += 2
      const chartH = 64
      drawConsolidatedChart(doc, MARGIN, startY, CONTENT_W, chartH, chartPoints)
      startY += chartH + 6
    }

    autoTable(doc, {
      startY,
      head: [['Department', 'Auditors', 'Status', 'Total', 'Max', '%', 'Below 60%', 'ATR (D/P)']],
      body: cycle.departments.map((d) => [
        `${d.department_code} - ${d.department_name}`,
        d.auditors.map((a) => a.name).join(', ') || '—',
        d.status.replace('_', ' '),
        String(d.total_marks),
        String(d.max_marks),
        `${d.percentage}%`,
        String(d.below_60_count),
        `${d.atr_submitted}/${d.atr_pending}`,
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 40 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 14, halign: 'center' },
        6: { cellWidth: 14, halign: 'center' },
        7: { cellWidth: 12, halign: 'center' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })

    const tableEnd = ((doc as any).lastAutoTable?.finalY ?? startY) + 6
    const pcts = cycle.departments.map((d) => d.percentage).filter((p) => typeof p === 'number')
    const avg = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0
    const maxTotal = cycle.departments.reduce((s, d) => s + d.max_marks, 0)
    const scoredTotal = cycle.departments.reduce((s, d) => s + d.total_marks, 0)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `Departments: ${cycle.departments.length}   |   Average: ${avg}%   |   Combined: ${scoredTotal} / ${maxTotal}`,
      MARGIN,
      tableEnd,
    )
    startY = tableEnd + 6
  })

  doc.save(`Audit_Consolidated_Scores_${todayStr()}.pdf`)
}
