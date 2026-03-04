import React, { useState } from 'react';
import { FileSpreadsheet, FileText, ImageIcon, LayoutGrid, Sheet, BarChart2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { RANGES, computeRangeCounts } from './BellGraphPage';
import { SheetCol, SheetRow } from './MarkAnalysisSheetPage';
import bannerSrc from '../../../assets/banner.png';
import krLogoSrc from '../../../assets/krlogo.png';
import idcsLogoSrc from '../../../assets/idcs-logo.png';

/* ── helpers ───────────────────────────────────────────────────── */
async function toBase64(src: string): Promise<string> {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imgSize(b64: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = b64;
  });
}

/* ── types ─────────────────────────────────────────────────────── */
export type DownloadReportModalProps = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseName: string;
  ct: string;
  sectionName: string;
  staffName: string;
  studentCount: number;
  cycleName: string;
  cols: SheetCol[];
  rows: SheetRow[];
  totals: number[];
  isClassReport?: boolean;
  staffLabel?: string;
};

/* ─────────────────────────────────────────────────────────────── */
export default function DownloadReportModal({
  open,
  onClose,
  courseId,
  courseName,
  ct,
  sectionName,
  staffName,
  studentCount,
  cycleName,
  cols,
  rows,
  totals,
  isClassReport = false,
  staffLabel = 'Staff',
}: DownloadReportModalProps): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  if (!open) return null;

  /* ── Excel Export ─────────────────────────────────────────────── */
  const handleExcel = () => {
    setBusy(true);
    setStatus('Building Excel…');
    try {
      const wb = XLSX.utils.book_new();

      /* ── Sheet 1: Mark Analysis ── */
      const header1 = [
        [`Course: ${courseId}`, '', `Class Type: ${ct}`, '', `Section: ${sectionName}`],
        [`${staffLabel}: ${staffName || '—'}`, '', `Students: ${studentCount}`, '', `Cycle: ${cycleName}`],
        [],
        ['Roll No.', 'Name', ...cols.map((c) => `${c.label} / ${c.max}`), 'Total / 100'],
      ];
      const dataRows = rows.map((r) => [
        r.regNo,
        r.name,
        ...cols.map((c) => (r.marks[c.key] != null ? r.marks[c.key] : '')),
        r.total100 != null ? r.total100 : '',
      ]);
      const ws1 = XLSX.utils.aoa_to_sheet([...header1, ...dataRows]);
      ws1['!cols'] = [{ wch: 14 }, { wch: 36 }, ...cols.map(() => ({ wch: 14 })), { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Mark Analysis');

      /* ── Sheet 2: Range Analysis ── */
      const rangeCounts = computeRangeCounts(totals);
      const ws2 = XLSX.utils.aoa_to_sheet([
        [`Range Analysis — ${cycleName}`, '', ''],
        ['Range', 'Count', 'Strength (%)'],
        ...rangeCounts.map((r) => [
          r.label,
          r.count,
          totals.length > 0 ? `${((r.count / totals.length) * 100).toFixed(1)}%` : '0%',
        ]),
        [],
        ['Total Attended', totals.length, ''],
        ['Total Absent', studentCount - totals.length, ''],
      ]);
      ws2['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Range Analysis');

      /* ── Sheet 3: Bell Distribution ── */
      const bellCounts = computeRangeCounts(totals);
      const ws3 = XLSX.utils.aoa_to_sheet([
        [`Bell Graph Data — ${cycleName}`, ''],
        ['Range Bucket', 'Count'],
        ...bellCounts.map((r) => [r.label, r.count]),
      ]);
      ws3['!cols'] = [{ wch: 16 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Bell Graph');

      XLSX.writeFile(wb, `Result_Analysis_${courseId}_${sectionName}_${cycleName}.xlsx`);
    } catch (e: any) {
      alert('Excel export failed: ' + (e?.message || e));
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  /* ── PDF Export ───────────────────────────────────────────────── */
  const handlePDF = async () => {
    setBusy(true);
    setStatus('Loading assets…');
    try {
      /* load images */
      const [b64Banner, b64Kr, b64Idcs] = await Promise.all([
        toBase64(bannerSrc).catch(() => ''),
        toBase64(krLogoSrc).catch(() => ''),
        toBase64(idcsLogoSrc).catch(() => ''),
      ]);

      /* Portrait A4: 210 × 297 mm */
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = 210;
      const PH = 297;
      const ML = 10;   // margin left
      const MR = 10;   // margin right
      const UW = PW - ML - MR; // usable width = 190

      let curY = 10;

      /* ─────────────────────────────────────────────────────────
         HELPER: draw a page-level banner that spans full UW
         ───────────────────────────────────────────────────────── */
      const drawPageBanner = async () => {
        if (b64Banner) {
          const { w: bw, h: bh } = await imgSize(b64Banner);
          // Fill the entire usable width; calculate height proportionally
          const bannerH = Math.round((bh / bw) * UW);
          const clampedH = Math.min(45, bannerH); // cap at 35 mm (slightly taller)
          doc.addImage(b64Banner, 'PNG', ML, curY, UW, clampedH);
          curY += clampedH + 4;
        } else {
          doc.setFillColor(30, 58, 95);
          doc.rect(ML, curY, UW, 15, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.text('K.RAMAKRISHNAN COLLEGE OF TECHNOLOGY', PW / 2, curY + 9.5, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          curY += 19;
        }
      };

      /* ── Page 1 Banner ─── */
      setStatus('Placing banner…');
      await drawPageBanner();

      /* ─────────────────────────────────────────────────────────
         INFO SECTION: 3 × 2 grid (two columns of 3 rows each)
         + Logos pinned to far right
         ───────────────────────────────────────────────────────── */
      const infoY = curY;
      const logoW  = 28;
      const logoGap = 4;
      const logoAreaW = logoW * 2 + logoGap;
      const infoAreaW = UW - logoAreaW - 6; // space for two label columns
      const colW = infoAreaW / 2;

      // Left column (3 rows): Course Code | Section | Students
      // Right column (3 rows): Course Name | Staff | Cycle
      const leftCol: [string, string][] = [
        ['Course Code', courseId],
        ['Section',     sectionName || '—'],
        ['Students',    String(studentCount)],
      ];
      const rightCol: [string, string][] = [
        ['Course Name', courseName || '—'],
        [staffLabel,     staffName || '—'],
        ['Cycle',        cycleName],
      ];

      const baseRowH = 6.8;
      doc.setFontSize(9);

      // precompute wrapped lines
      const leftLines = leftCol.map(([,v]) => {
        const maxW = colW - 28;
        return doc.splitTextToSize(v, maxW);
      });
      const rightLines = rightCol.map(([,v]) => {
        const maxW = colW - 28;
        return doc.splitTextToSize(v, maxW);
      });

      let curInfoY = infoY;
      for (let i = 0; i < leftCol.length; i++) {
        const nlines = Math.max(leftLines[i].length, rightLines[i].length);
        const cellH = Math.max(baseRowH, nlines * 5 + 2);

        // left label + values
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 95);
        doc.text(`${leftCol[i][0]}:`, ML, curInfoY + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 65, 81);
        leftLines[i].forEach((ln, li) => {
          doc.text(ln, ML + 26, curInfoY + 4 + li * 5);
        });

        // right side
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 95);
        doc.text(`${rightCol[i][0]}:`, ML + colW, curInfoY + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 65, 81);
        rightLines[i].forEach((ln, li) => {
          doc.text(ln, ML + colW + 26, curInfoY + 4 + li * 5);
        });

        curInfoY += cellH;
      }

      /* Logos: right-aligned, vertically centred in the info block */
      const infoBlockH = curInfoY - infoY; // actual used height
      const logoY = infoY + (infoBlockH - 16) / 2;
      const logoStartX = PW - MR - logoAreaW;

      if (b64Kr) {
        const { w: kw, h: kh } = await imgSize(b64Kr);
        const kScaled = Math.min(16, (kh / kw) * logoW);
        doc.addImage(b64Kr, 'PNG', logoStartX, logoY, logoW, kScaled);
      }
      if (b64Idcs) {
        const { w: iw, h: ih } = await imgSize(b64Idcs);
        const iScaled = Math.min(16, (ih / iw) * logoW);
        doc.addImage(b64Idcs, 'PNG', logoStartX + logoW + logoGap, logoY, logoW, iScaled);
      }

      /* divider */
      curY = infoY + infoBlockH + 4;
      doc.setDrawColor(210, 215, 220);
      doc.setLineWidth(0.4);
      doc.line(ML, curY, PW - MR, curY);
      curY += 5;

      /* ─────────────────────────────────────────────────────────
         MARK ANALYSIS TABLE  (left 65%)  +  stats panel (right 32%)
         ───────────────────────────────────────────────────────── */
      setStatus('Building mark sheet…');

      const tableW   = isClassReport ? UW : Math.round(UW * 0.63);
      const panelGap = 5;
      const panelX   = ML + tableW + panelGap;
      const panelW   = isClassReport ? 0 : UW - tableW - panelGap;

      // Compute column widths to fill exactly tableW
      const rollW  = 32;  // roll number column (wider for full reg no)
      const totalW = 16;
      const nameW  = Math.max(24, tableW - rollW - totalW - cols.length * 16);
      const markW  = cols.length > 0 ? Math.floor((tableW - rollW - nameW - totalW) / cols.length) : 18;

      const sheetHead = [
        ['Roll No.', 'Name', ...cols.map((c) => `${c.label}\n/ ${c.max}`), 'Total\n/ 100'],
      ];
      const sheetBody = rows.map((r) => [
        r.regNo,
        r.name,
        ...cols.map((c) => (r.marks[c.key] != null ? String(r.marks[c.key]) : '—')),
        r.total100 != null ? String(r.total100) : '—',
      ]);

      const sheetStartY = curY;
      autoTable(doc, {
        startY: sheetStartY,
        head: sheetHead,
        body: sheetBody,
        margin: { left: ML, right: isClassReport ? MR : MR + panelW + panelGap },
        tableWidth: tableW,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 58, 95],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          cellPadding: 2,
        },
        bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
        columnStyles: {
          0: { halign: 'center', cellWidth: rollW },
          1: { halign: 'left',   cellWidth: nameW },
          ...Object.fromEntries(cols.map((_, i) => [i + 2, { halign: 'center', cellWidth: markW }])),
          [cols.length + 2]: {
            halign: 'center',
            cellWidth: totalW,
            fontStyle: 'bold',
            fillColor: [254, 240, 138],
            textColor: [31, 41, 55],
          },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const totalIdx = cols.length + 2;
            if (data.column.index === totalIdx) {
              const val = Number(data.cell.raw);
              if (!isNaN(val)) {
                if      (val >= 75) data.cell.styles.textColor = [5, 150, 105];
                else if (val >= 50) data.cell.styles.textColor = [37, 99, 235];
                else if (val >= 40) data.cell.styles.textColor = [217, 119, 6];
                else                data.cell.styles.textColor = [220, 38, 38];
              }
            }
          }
        },
      });

      const afterSheet = (doc as any).lastAutoTable?.finalY ?? sheetStartY + 50;

      /* ── Stats panel: right-side for staff view, below table for class report ── */
      const _statsValidTotals  = totals.filter((v) => v != null);
      const _statsAttended     = _statsValidTotals.length;
      const _statsAbsent       = studentCount - _statsAttended;
      const _statsPassCount    = _statsValidTotals.filter((v) => v >= 50).length;
      const _statsFailCount    = _statsAttended - _statsPassCount;
      const _statsAvg          = _statsAttended > 0 ? (_statsValidTotals.reduce((a, b) => a + b, 0) / _statsAttended).toFixed(1) : '—';
      const _statsMax          = _statsAttended > 0 ? Math.max(..._statsValidTotals) : 0;
      const _statsMin          = _statsAttended > 0 ? Math.min(..._statsValidTotals) : 0;
      const _statsPassRateNum  = _statsAttended > 0 ? Math.round((_statsPassCount / _statsAttended) * 100) : 0;
      const _statsPassRate     = String(_statsPassRateNum);

      const _drawStatsPanel = (startX: number, startY: number, pw2: number) => {
        type RGB = [number, number, number];
        const NAVY:  RGB = [30,  58,  95];
        const GREEN: RGB = [5,   150, 105];
        const RED:   RGB = [220, 38,  38];
        const AMBER: RGB = [217, 119, 6];
        const BLUE:  RGB = [37,  99,  235];
        const GREY:  RGB = [100, 116, 139];
        const statsList: [string, string, RGB][] = [
          ['Attended',  String(_statsAttended),  NAVY],
          ['Absent',    String(_statsAbsent),    _statsAbsent > 0 ? RED : GREY],
          ['Pass',      String(_statsPassCount), GREEN],
          ['Fail',      String(_statsFailCount), _statsFailCount > 0 ? RED : GREY],
          ['Pass Rate', `${_statsPassRate}%`,    _statsPassRateNum >= 75 ? GREEN : _statsPassRateNum >= 50 ? AMBER : RED],
          ['Average',   `${_statsAvg}`,          BLUE],
          ['Highest',   String(_statsMax),       GREEN],
          ['Lowest',    String(_statsMin),       Number(_statsMin) >= 50 ? GREEN : Number(_statsMin) >= 40 ? AMBER : RED],
        ];
        const rowH    = 8;
        const rowGap  = 0.5;
        const headerH = 10;
        const panelH  = headerH + statsList.length * (rowH + rowGap) + 3;
        doc.setFillColor(248, 250, 253);
        doc.roundedRect(startX, startY, pw2, panelH, 2.5, 2.5, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.roundedRect(startX, startY, pw2, panelH, 2.5, 2.5, 'S');
        doc.setFillColor(...NAVY);
        doc.roundedRect(startX, startY, pw2, headerH, 2.5, 2.5, 'F');
        doc.rect(startX, startY + headerH - 4, pw2, 4, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Class Statistics', startX + pw2 / 2, startY + 6.8, { align: 'center' });
        statsList.forEach(([lbl, val, valColor], i) => {
          const ry = startY + headerH + i * (rowH + rowGap);
          if (ry + rowH > PH - 12) return;
          if (i % 2 === 0) { doc.setFillColor(239, 246, 255); doc.rect(startX + 1, ry, pw2 - 2, rowH, 'F'); }
          if (lbl === 'Pass Rate') { doc.setFillColor(...valColor); doc.rect(startX + 1, ry, 2, rowH, 'F'); }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(55, 65, 81);
          doc.text(lbl, startX + 5, ry + 5.4);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...valColor);
          doc.text(val, startX + pw2 - 4, ry + 5.4, { align: 'right' });
          if (i < statsList.length - 1) { doc.setDrawColor(220, 230, 242); doc.setLineWidth(0.2); doc.line(startX + 3, ry + rowH + rowGap / 2, startX + pw2 - 3, ry + rowH + rowGap / 2); }
        });
        return panelH;
      };

      if (!isClassReport) {
        /* ── Right-side stats panel (staff view) ── */
        _drawStatsPanel(panelX, sheetStartY, panelW - 2);
      } // end if (!isClassReport)

      // Stats panel height (8 rows × (8+0.5) + header 10 + padding 3)
      const statsCardH = 10 + 8 * (8 + 0.5) + 3; // ≈ 81 mm
      if (!isClassReport) {
        curY = Math.max(afterSheet, sheetStartY + statsCardH) + 6;
      } else {
        // Class report: place stats panel below the mark table
        curY = afterSheet + 6;
        const belowPanelH = _drawStatsPanel(ML, curY, UW);
        curY += belowPanelH + 6;
      }

      /* ─────────────────────────────────────────────────────────
         ANALYSIS SUMMARY — place on this page if enough space
         remains, otherwise always start fresh on a new page.
         Never push down: let it sit naturally at curY so autoTable
         never overflows mid-section onto the next page.
         ───────────────────────────────────────────────────────── */
      // 12 data rows + 1 total row, ~6.2 mm each + 7 mm header + section
      // heading (10 mm) + generous buffer = 120 mm safe envelope
      const analysisEstH = 120;
      const pageBottom   = PH - 12; // 285 mm (above footer)
      if (curY + analysisEstH > pageBottom) {
        // not enough room — move to next page top
        doc.addPage();
        curY = 10;
        setStatus('Placing banner on analysis page…');
        await drawPageBanner();
      }
      // else: enough space — place at current curY, no forced push-down

      // Section heading
      doc.setFillColor(30, 58, 95);
      doc.rect(ML, curY, UW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('Analysis Summary', ML + 4, curY + 4.8);
      curY += 10;

      /* ── Range Analysis table (left 46%) ── */
      const rangeW  = Math.round(UW * 0.46);
      const bellGap = 5;
      const bellX   = ML + rangeW + bellGap;
      const bellW   = UW - rangeW - bellGap;

      const rangeCounts = computeRangeCounts(totals);
      const absent      = studentCount - totals.length;
      const analysisSY  = curY;

      setStatus('Building range table…');
      autoTable(doc, {
        startY: analysisSY,
        head: [['RANGE', 'COUNT', 'STRENGTH %', 'ATTENDED', 'ABSENT']],
        body: [
          ...rangeCounts.map((r) => [
            r.label,
            String(r.count),
            totals.length > 0 ? `${((r.count / totals.length) * 100).toFixed(1)}%` : '0%',
            String(totals.length),
            String(absent),
          ]),
          ['Total', String(totals.length), '100%', String(totals.length), String(absent)],
        ],
        margin: { left: ML, right: bellX + bellW - ML },
        tableWidth: rangeW,
        theme: 'grid',
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          cellPadding: 2,
        },
        bodyStyles: { fontSize: 7.5, cellPadding: 1.8, halign: 'center' },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === rangeCounts.length) {
            data.cell.styles.fontStyle  = 'bold';
            data.cell.styles.fillColor  = [220, 252, 231] as any;
          }
        },
      });

      const afterRange = (doc as any).lastAutoTable?.finalY ?? analysisSY + 50;

      /* ── Bell Graph (right side) — drawn with jsPDF primitives ── */
      setStatus('Drawing bell graph…');
      {
        // Layout constants
        const padL = 14;  // left padding (Y-axis space)
        const padR = 4;
        const padT = 14;  // room for title
        const padB = 16;  // room for X-axis labels
        const chartX  = bellX + padL;
        const chartW  = bellW - padL - padR;
        const chartTopY = analysisSY + padT;
        const chartH    = Math.min(55, afterRange - analysisSY - padB - padT);
        const chartBotY = chartTopY + chartH;

        const maxCount = Math.max(1, ...rangeCounts.map((r) => r.count));
        const n        = rangeCounts.length;
        const barW     = (chartW / n) * 0.7;
        const barGap   = chartW / n;

        // Bar colours keyed by index
        const barColors: [number, number, number][] = [
          [220, 38,  38 ],  // 0–9   deep red
          [239, 68,  68 ],  // 10–19 red
          [249, 115, 22 ],  // 20–29 orange
          [234, 179, 8  ],  // 30–39 amber
          [253, 224, 71 ],  // 40–49 yellow
          [163, 230, 53 ],  // 50–59 lime
          [52,  211, 153],  // 60–69 teal-green
          [16,  185, 129],  // 70–79 green
          [5,   150, 105],  // 80–89 dark green
          [4,   120, 87 ],  // 90–100 deepest green
        ];

        // Panel background
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(bellX, analysisSY, bellW, afterRange - analysisSY, 2, 2, 'F');
        doc.setDrawColor(220, 230, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(bellX, analysisSY, bellW, afterRange - analysisSY, 2, 2, 'S');

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 58, 95);
        doc.text('Bell Curve Distribution', bellX + bellW / 2, analysisSY + 8, { align: 'center' });

        // Axes
        doc.setDrawColor(180, 190, 200);
        doc.setLineWidth(0.5);
        doc.line(chartX, chartTopY, chartX, chartBotY);             // Y-axis
        doc.line(chartX, chartBotY, chartX + chartW, chartBotY);    // X-axis

        // Horizontal grid lines (4 lines)
        doc.setDrawColor(220, 230, 240);
        doc.setLineWidth(0.2);
        for (let g = 1; g <= 4; g++) {
          const gy = chartBotY - (chartH * g) / 4;
          doc.line(chartX, gy, chartX + chartW, gy);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(140, 150, 165);
          doc.text(String(Math.round((maxCount * g) / 4)), chartX - 2, gy + 1, { align: 'right' });
        }

        // Draw bars
        rangeCounts.forEach((r, i) => {
          const bx    = chartX + i * barGap + (barGap - barW) / 2;
          const bh    = chartH > 0 ? (r.count / maxCount) * chartH : 0;
          const by    = chartBotY - bh;
          const color = barColors[Math.min(i, barColors.length - 1)];

          doc.setFillColor(...color);
          doc.setDrawColor(...color);
          if (bh > 0) doc.rect(bx, by, barW, bh, 'F');

          // Count label on top of bar
          if (r.count > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.setTextColor(...color);
            doc.text(String(r.count), bx + barW / 2, by - 1, { align: 'center' });
          }

          // X-axis label (range bucket)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(75, 85, 99);
          const labelText = r.label.length > 6 ? r.label.replace('–', '-') : r.label;
          doc.text(labelText, bx + barW / 2, chartBotY + 4.5, { align: 'center' });
        });

        // Connect dots with a smooth overlay line (bell curve effect)
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.8);
        const pts = rangeCounts.map((r, i) => ({
          x: chartX + i * barGap + barGap / 2,
          y: chartBotY - (chartH > 0 ? (r.count / maxCount) * chartH : 0),
        }));
        for (let i = 0; i < pts.length - 1; i++) {
          const cp = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
          doc.lines([[pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y]], pts[i].x, pts[i].y);
        }
        // Dots at data points
        doc.setFillColor(37, 99, 235);
        pts.forEach((p) => {
          doc.circle(p.x, p.y, 0.8, 'F');
        });

        // Y-axis label
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text('#', chartX - 2, chartTopY - 1, { align: 'right' });

        // Subtitle: totals attended
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(107, 114, 128);
        doc.text(
          `${totals.length} attended · ${absent} absent · Class Avg: ${totals.length > 0 ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1) : '—'} / 100`,
          bellX + bellW / 2,
          afterRange - 3,
          { align: 'center' },
        );
      }

      curY = afterRange + 6;

      /* ═══════════════════════════════════════════════════════════
         RANKING PAGE — always on a fresh page
         ═══════════════════════════════════════════════════════════ */
      doc.addPage();
      curY = 10;
      setStatus('Building ranking page…');
      await drawPageBanner();

      /* ── Build ranked data ── */
      const PASS_PCT = 0.5;
      const isPassed = (row: SheetRow): boolean => {
        for (const col of cols) {
          const mark = row.marks[col.key];
          if (mark == null) return false;
          if (mark < col.max * PASS_PCT) return false;
        }
        return true;
      };

      const rankedRows = (() => {
        const passed = rows.filter((r) => isPassed(r) && r.total100 != null);
        const sorted = [...passed].sort((a, b) => (b.total100 ?? 0) - (a.total100 ?? 0));
        let rank = 1;
        return sorted.map((r, i) => {
          if (i > 0 && r.total100 !== sorted[i - 1].total100) rank = i + 1;
          return { ...r, rank };
        });
      })();
      const failedCount = rows.length - rankedRows.length;

      /* ── Section heading ── */
      doc.setFillColor(30, 58, 95);
      doc.rect(ML, curY, UW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('Class Toppers', PW / 2, curY + 4.8, { align: 'center' });
      curY += 10;

      /* ── Stats pills — corporate style ── */
      type RGB3 = [number, number, number];
      const summaryPills: { label: string; val: string; accent: RGB3; lightBg: RGB3 }[] = [
        { label: cycleName,           val: cols.map(c => c.label).join(' + '), accent: [30, 58, 95],  lightBg: [236, 241, 250] },
        { label: 'Total Students',    val: String(studentCount),               accent: [71, 85, 105], lightBg: [241, 244, 248] },
        { label: 'Ranked Students',   val: String(rankedRows.length),          accent: [5, 150, 105], lightBg: [236, 253, 245] },
        { label: 'Not Ranked (Fail)', val: String(failedCount),                accent: [220, 38, 38], lightBg: [254, 242, 242] },
      ];
      const pillW2 = 44;
      const pillH2 = 17;
      const pillGap2 = 4;
      const pillsTotalW = summaryPills.length * pillW2 + (summaryPills.length - 1) * pillGap2;
      let pillX2 = PW / 2 - pillsTotalW / 2;
      summaryPills.forEach(({ label, val, accent, lightBg }) => {
        // Card background
        doc.setFillColor(...lightBg);
        doc.roundedRect(pillX2, curY, pillW2, pillH2, 2.5, 2.5, 'F');
        // Colored left accent bar (3 mm wide)
        doc.setFillColor(...accent);
        doc.roundedRect(pillX2, curY, 3, pillH2, 1.5, 1.5, 'F');
        doc.rect(pillX2 + 1.5, curY, 1.5, pillH2, 'F'); // ensure flat right edge
        // Thin border
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.3);
        doc.roundedRect(pillX2, curY, pillW2, pillH2, 2.5, 2.5, 'S');
        // Label
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(label, pillX2 + pillW2 / 2 + 1, curY + 5.5, { align: 'center' });
        // Value
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...accent);
        doc.text(val, pillX2 + pillW2 / 2 + 1, curY + 13.5, { align: 'center' });
        pillX2 += pillW2 + pillGap2;
      });
      curY += pillH2 + 7;

      /* ══════════════════════════════════════════════════════════
         CORPORATE LEADERBOARD — Top 3 cards + ranked rows 4+
         No trophies. Flat, data-forward design.
         ══════════════════════════════════════════════════════════ */
      const LB: Record<number, { base: RGB3; dark: RGB3; ring: RGB3 }> = {
        1: { base: [192, 148,  40], dark: [140, 100,  15], ring: [254, 243, 199] },
        2: { base: [ 94, 115, 143], dark: [ 65,  85, 110], ring: [226, 232, 240] },
        3: { base: [153,  88,  48], dark: [115,  60,  25], ring: [254, 237, 218] },
      };

      // Helper: draw a filled circle for rank badge
      const drawRankCircle = (cx: number, cy: number, r: number, fill: RGB3, ring: RGB3) => {
        doc.setFillColor(...ring);
        doc.circle(cx, cy, r + 1.2, 'F');  // outer ring
        doc.setFillColor(...fill);
        doc.circle(cx, cy, r, 'F');
      };


      // ── TOP 3 CARDS ──────────────────────────────────────────
      const top3CardH = 56;
      const top3SlotW = UW / 3;
      const cardPad   = 5;

      // Panel background
      doc.setFillColor(245, 248, 252);
      doc.roundedRect(ML, curY, UW, top3CardH + cardPad * 2, 3, 3, 'F');
      doc.setDrawColor(210, 220, 232);
      doc.setLineWidth(0.35);
      doc.roundedRect(ML, curY, UW, top3CardH + cardPad * 2, 3, 3, 'S');

      // Vertical dividers between slots
      doc.setDrawColor(218, 228, 240);
      doc.setLineWidth(0.25);
      doc.line(ML + top3SlotW,     curY + 6, ML + top3SlotW,     curY + top3CardH + cardPad * 2 - 6);
      doc.line(ML + top3SlotW * 2, curY + 6, ML + top3SlotW * 2, curY + top3CardH + cardPad * 2 - 6);

      // Order: 2nd left, 1st center, 3rd right
      const top3slots: { rank: 1 | 2 | 3; slotX: number }[] = [
        { rank: 2, slotX: ML },
        { rank: 1, slotX: ML + top3SlotW },
        { rank: 3, slotX: ML + top3SlotW * 2 },
      ];

      top3slots.forEach(({ rank, slotX }) => {
        const student = rankedRows.find((r) => r.rank === rank) ?? null;
        const c       = LB[rank];
        const cx3     = slotX + top3SlotW / 2;
        const topY    = curY + cardPad;
        const cw      = top3SlotW - 12;

        // Rank circle (large, centered)
        const circR  = rank === 1 ? 7.5 : 6.5;
        const circCY = topY + circR + 1;
        drawRankCircle(cx3, circCY, circR, c.base, c.ring);

        if (student) {
          // Initials inside avatar circle
          const initials = student.name.trim().split(/\s+/).map((w: string) => w[0] ?? '').slice(0, 2).join('').toUpperCase();
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(rank === 1 ? 8 : 7);
          doc.setTextColor(255, 255, 255);
          doc.text(initials, cx3, circCY + (rank === 1 ? 2.8 : 2.4), { align: 'center' });

          // Small rank badge bottom-right of avatar
          const bdR  = 2.6;
          const bdX  = cx3 + circR * 0.62;
          const bdY  = circCY + circR * 0.62;
          doc.setFillColor(255, 255, 255);
          doc.circle(bdX, bdY, bdR + 0.7, 'F');
          doc.setFillColor(...c.dark);
          doc.circle(bdX, bdY, bdR, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5);
          doc.setTextColor(255, 255, 255);
          doc.text(String(rank), bdX, bdY + 1.7, { align: 'center' });

          // Name
          const nameLines3 = doc.splitTextToSize(student.name, cw);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(rank === 1 ? 8 : 7.5);
          doc.setTextColor(22, 36, 58);
          const nameBaseY = topY + circR * 2 + 7;
          nameLines3.slice(0, 2).forEach((ln: string, li: number) => {
            doc.text(ln, cx3, nameBaseY + li * 5, { align: 'center' });
          });
          const nlCount3 = Math.min(nameLines3.length, 2);

          // Reg No
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(130, 148, 168);
          doc.text(student.regNo, cx3, nameBaseY + nlCount3 * 5 + 1, { align: 'center' });

          // Score (large) + label
          const scoreY = topY + top3CardH - 13;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(rank === 1 ? 18 : 14);
          doc.setTextColor(...c.base);
          doc.text(String(student.total100 ?? '—'), cx3, scoreY, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(165, 178, 195);
          doc.text('/ 100', cx3, scoreY + 5, { align: 'center' });

        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(195, 208, 220);
          doc.text('—', cx3, topY + top3CardH / 2, { align: 'center' });
        }
      });

      curY += top3CardH + cardPad * 2 + 5;

      /* ── Ranking table ── */
      // new page if not enough room
      if (curY + 60 > PH - 12) {
        doc.addPage();
        curY = 10;
        setStatus('Placing banner on ranking table page…');
        await drawPageBanner();
      }

      // Sub-heading
      doc.setFillColor(5, 150, 105);
      doc.rect(ML, curY, UW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('Ranking Table', ML + 4, curY + 4.8);
      curY += 10;

      const rankTableHead = [
        ['Rank', 'Roll No.', 'Name', ...cols.map((c) => `${c.label}\n/ ${c.max}`), 'Total\n/ 100'],
      ];
      const rankTableBody = rankedRows.map((r) => [
        String(r.rank),
        r.regNo,
        r.name,
        ...cols.map((c) => (r.marks[c.key] != null ? String(r.marks[c.key]) : '—')),
        r.total100 != null ? String(r.total100) : '—',
      ]);

      const rankRollW  = 32;
      const rankTotalW = 16;
      const rankRankW  = 10;
      const rankNameW  = Math.max(24, UW - rankRankW - rankRollW - rankTotalW - cols.length * 16 - 2);
      const rankMarkW  = cols.length > 0 ? Math.floor((UW - rankRankW - rankRollW - rankNameW - rankTotalW) / cols.length) : 16;

      setStatus('Building ranking table…');
      autoTable(doc, {
        startY: curY,
        head: rankTableHead,
        body: rankTableBody,
        margin: { left: ML, right: MR },
        tableWidth: UW,
        theme: 'grid',
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          cellPadding: 2,
        },
        bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
        columnStyles: {
          0: { halign: 'center', cellWidth: rankRankW,  fontStyle: 'bold' },
          1: { halign: 'center', cellWidth: rankRollW },
          2: { halign: 'left',   cellWidth: rankNameW },
          ...Object.fromEntries(cols.map((_, i) => [i + 3, { halign: 'center', cellWidth: rankMarkW }])),
          [cols.length + 3]: {
            halign: 'center',
            cellWidth: rankTotalW,
            fontStyle: 'bold',
            fillColor: [209, 250, 229],
            textColor: [5, 150, 105],
          },
        },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const v = Number(data.cell.raw);
            if (v === 1) data.cell.styles.textColor = [217, 119, 6];
            else if (v === 2) data.cell.styles.textColor = [100, 116, 139];
            else if (v === 3) data.cell.styles.textColor = [194, 65, 12];
          }
          if (data.section === 'body') {
            const totalIdx = cols.length + 3;
            if (data.column.index === totalIdx) {
              const val = Number(data.cell.raw);
              if (!isNaN(val)) {
                if      (val >= 75) data.cell.styles.textColor = [5, 150, 105];
                else if (val >= 50) data.cell.styles.textColor = [37, 99, 235];
                else if (val >= 40) data.cell.styles.textColor = [217, 119, 6];
                else                data.cell.styles.textColor = [220, 38, 38];
              }
            }
          }
        },
      });

      curY = (doc as any).lastAutoTable?.finalY ?? curY + 40;
      curY += 6;

      /* ── Footer on each page ── */
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(200, 205, 210);
        doc.setLineWidth(0.3);
        doc.line(ML, PH - 9, PW - MR, PH - 9);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(156, 163, 175);
        doc.text(
          `Generated: ${new Date().toLocaleString()}  |  ${courseId} · ${sectionName} · ${cycleName}  |  Page ${p} / ${pageCount}`,
          PW / 2,
          PH - 5,
          { align: 'center' },
        );
      }

      setStatus('Saving PDF…');
      doc.save(`Result_Analysis_${courseId}_${sectionName}_${cycleName}.pdf`);
    } catch (e: any) {
      alert('PDF export failed: ' + (e?.message || e));
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          padding: '32px 36px',
          width: 420,
          maxWidth: '90vw',
        }}
      >
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e3a5f' }}>Download Report</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {courseId} · {sectionName || ct} · {cycleName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#9ca3af', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Info pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {[
            { label: 'Course', val: courseName || courseId },
            { label: staffLabel,  val: staffName || '—' },
            { label: 'Students', val: String(studentCount) },
            { label: 'With Data', val: String(totals.length) },
          ].map(({ label, val }) => (
            <span
              key={label}
              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}
            >
              {label}: {val}
            </span>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {/* Excel */}
          <button
            onClick={handleExcel}
            disabled={busy}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              background: busy ? '#d1fae5' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              opacity: busy ? 0.6 : 1,
              transition: 'opacity 0.2s, transform 0.1s',
              boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
            }}
          >
            <FileSpreadsheet size={30} />
            <span>Excel</span>
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Sheets + Range data</span>
          </button>

          {/* PDF */}
          <button
            onClick={handlePDF}
            disabled={busy}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              background: busy ? '#dbeafe' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              opacity: busy ? 0.6 : 1,
              transition: 'opacity 0.2s, transform 0.1s',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
            }}
          >
            <FileText size={30} />
            <span>PDF</span>
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Full report layout</span>
          </button>
        </div>



        {/* Status / spinner */}
        {busy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2563eb', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
              <circle cx="12" cy="12" r="10" fill="none" stroke="#bfdbfe" strokeWidth="4" />
              <path d="M12 2A10 10 0 0 1 22 12" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {status || 'Processing…'}
          </div>
        )}

        {/* Cancel */}
        <button
          onClick={onClose}
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#6b7280',
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
