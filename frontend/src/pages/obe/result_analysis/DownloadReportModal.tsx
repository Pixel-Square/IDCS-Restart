import React, { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { RANGES, computeRangeCounts } from './BellGraphPage';
import { SheetCol, SheetRow } from './MarkAnalysisSheetPage';
import newBannerSrc from '../../../assets/new_banner.png';
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
  year?: string;
  department?: string;
  semester?: number | string | null;
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
  year,
  department,
  semester,
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
      const xlsxAttended  = totals.length;
      const xlsxAbsent    = studentCount - xlsxAttended;
      const xlsxPass      = totals.filter((v) => v >= 50).length;
      const xlsxFail      = xlsxAttended - xlsxPass;
      const xlsxPassRate  = xlsxAttended > 0 ? `${Math.round((xlsxPass / xlsxAttended) * 100)}%` : '0%';
      const xlsxAvg       = xlsxAttended > 0 ? (totals.reduce((a, b) => a + b, 0) / xlsxAttended).toFixed(1) : '—';
      const xlsxHighest   = xlsxAttended > 0 ? Math.max(...totals) : '—';
      const xlsxLowest    = xlsxAttended > 0 ? Math.min(...totals) : '—';
      const ws2 = XLSX.utils.aoa_to_sheet([
        [`Range Analysis — ${cycleName}`, '', ''],
        ['Range', 'Count', 'Strength (%)'],
        ...rangeCounts.map((r) => [
          r.label,
          r.count,
          totals.length > 0 ? `${((r.count / totals.length) * 100).toFixed(1)}%` : '0%',
        ]),
        [],
        ['CLASS STATISTICS', '', ''],
        ['Attended',  xlsxAttended,  ''],
        ['Absent',    xlsxAbsent,    ''],
        ['Pass',      xlsxPass,      ''],
        ['Fail',      xlsxFail,      ''],
        ['Pass Rate', xlsxPassRate,  ''],
        ['Average',   xlsxAvg,       ''],
        ['Highest',   xlsxHighest,   ''],
        ['Lowest',    xlsxLowest,    ''],
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
      const [b64NewBanner, b64Kr, b64Idcs] = await Promise.all([
        toBase64(newBannerSrc).catch(() => ''),
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
         HELPER: draw page header — new_banner left, logos right
         ───────────────────────────────────────────────────────── */
      const HEADER_H = 26; // fixed header row height in mm

      /* ─────────────────────────────────────────────────────────
         HELPER: draw watermark — krlogo centred, semi-transparent
         ───────────────────────────────────────────────────────── */
      const drawWatermark = async () => {
        if (!b64Kr) return;
        const { w: kw, h: kh } = await imgSize(b64Kr);
        const wmSize = 100; // mm
        const wmW = wmSize;
        const wmH = (kh / kw) * wmW;
        const wmX = (PW - wmW) / 2;
        const wmY = (PH - wmH) / 2;
        doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
        doc.addImage(b64Kr, 'PNG', wmX, wmY, wmW, wmH);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
      };

      const drawPageBanner = async () => {
        // Left: new_banner.png — generous size
        if (b64NewBanner) {
          const { w: bw, h: bh } = await imgSize(b64NewBanner);
          const bannerAR = bw / bh;
          const bannerDrawH = HEADER_H;
          const bannerDrawW = Math.min(UW * 0.90
            , bannerAR * bannerDrawH);
          doc.addImage(b64NewBanner, 'PNG', ML, curY, bannerDrawW, bannerDrawH);
        }
        // Right: logos side-by-side, right-aligned and vertically centred
        const logoH2 = 18;
        const logoW2 = 22;
        const logoGap2 = 4;
        const logosBlockW = logoW2 * 2 + logoGap2;
        const logosX = PW - MR - logosBlockW;
        if (b64Kr) {
          const { w: kw, h: kh } = await imgSize(b64Kr);
          const kDrawH = Math.min(logoH2, (kh / kw) * logoW2);
          const kDrawY = curY + (HEADER_H - kDrawH) / 2;
          doc.addImage(b64Kr, 'PNG', logosX, kDrawY, logoW2, kDrawH);
        }
        if (b64Idcs) {
          const { w: iw, h: ih } = await imgSize(b64Idcs);
          const iDrawH = Math.min(logoH2, (ih / iw) * logoW2);
          const iDrawY = curY + (HEADER_H - iDrawH) / 2;
          doc.addImage(b64Idcs, 'PNG', logosX + logoW2 + logoGap2, iDrawY, logoW2, iDrawH);
        }
        curY += HEADER_H + 2;
        // Thin accent line below header
        doc.setDrawColor(30, 58, 95);
        doc.setLineWidth(0.6);
        doc.line(ML, curY, PW - MR, curY);
        curY += 4;
      };

      /* ── Page 1 Banner ─── */
      setStatus('Placing banner…');
      await drawPageBanner();

      /* ─────────────────────────────────────────────────────────
         INFO SECTION: professional 3-column bordered grid
         ───────────────────────────────────────────────────────── */
      const colW3 = UW / 3;
      const labelW3 = 26; // space reserved for label text in each 3rd-column
      const rowH = 6.5;

      // Build info cells as a flat list: [label, value] pairs.
      // We'll flow them into 3 columns, left-to-right across each row.
      const semLabel = semester != null ? `Semester ${semester}` : '';
      const infoCells: [string, string][] = [
        ...(!isClassReport ? [['Course Code', courseId] as [string, string]] : []),
        ...(!isClassReport ? [['Course Name', courseName || '—'] as [string, string]] : []),
        ['Section', sectionName || '—'],
        [staffLabel, staffName || '—'],
        ['Students', String(studentCount)],
        ['Cycle', cycleName],
        ...(semLabel ? [['Semester', semLabel] as [string, string]] : []),
        ...(year ? [['Acad. Year', year] as [string, string]] : []),
        ...(department ? [['Department', department] as [string, string]] : []),
      ];

      // Pad to a multiple of 3 so we get complete rows
      while (infoCells.length % 3 !== 0) infoCells.push(['', '']);

      const numInfoRows = infoCells.length / 3;
      const gridH = numInfoRows * rowH;

      // Draw light background
      doc.setFillColor(248, 250, 253);
      doc.roundedRect(ML, curY, UW, gridH, 1.5, 1.5, 'F');
      // Draw outer border
      doc.setDrawColor(200, 210, 225);
      doc.setLineWidth(0.35);
      doc.roundedRect(ML, curY, UW, gridH, 1.5, 1.5, 'S');

      // Draw horizontal row separators
      for (let i = 1; i < numInfoRows; i++) {
        const ly = curY + i * rowH;
        doc.setDrawColor(220, 228, 238);
        doc.setLineWidth(0.2);
        doc.line(ML + 1, ly, PW - MR - 1, ly);
      }
      // Draw 2 vertical dividers (at 1/3 and 2/3)
      doc.setDrawColor(200, 210, 225);
      doc.setLineWidth(0.3);
      doc.line(ML + colW3,     curY + 1, ML + colW3,     curY + gridH - 1);
      doc.line(ML + colW3 * 2, curY + 1, ML + colW3 * 2, curY + gridH - 1);

      // Render text per cell
      doc.setFontSize(8);
      for (let ri = 0; ri < numInfoRows; ri++) {
        const baselineY = curY + ri * rowH + 4.5;
        for (let ci = 0; ci < 3; ci++) {
          const [lbl, val] = infoCells[ri * 3 + ci];
          const cellX = ML + ci * colW3;
          if (lbl) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 58, 95);
            doc.text(`${lbl}:`, cellX + 3, baselineY);
          }
          if (val) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(55, 65, 81);
            doc.text(val, cellX + 3 + labelW3, baselineY);
          }
        }
      }

      curY += gridH + 4;

      /* divider */
      doc.setDrawColor(210, 215, 220);
      doc.setLineWidth(0.4);
      doc.line(ML, curY, PW - MR, curY);
      curY += 5;

      /* ─────────────────────────────────────────────────────────
         MARK ANALYSIS TABLE
         • Staff view   → two side-by-side half-tables (compact, 1-page)
         • Class report (Advisor / HOD) → single full-width table, multi-page
         ───────────────────────────────────────────────────────── */
      setStatus('Building mark sheet…');

      const sheetHead = [
        ['S.No', 'Roll No.', 'Name', ...cols.map((c) => `${c.label}\n/ ${c.max}`), 'Total\n/ 100'],
      ];

      const mkBody = (subset: typeof rows, startIdx = 0) =>
        subset.map((r, i) => [
          String(startIdx + i + 1),
          r.regNo,
          r.name,
          ...cols.map((c) => (r.marks[c.key] != null ? String(r.marks[c.key]) : '—')),
          r.total100 != null ? String(r.total100) : '—',
        ]);

      const sheetStartY = curY;
      let afterSheet = sheetStartY;

      if (isClassReport) {
        /* ── FULL-WIDTH single table (Advisor / HOD) ── */
        const fSnoW   = 8;
        const fRollW  = 28;
        const fTotalW = 16;
        const fMarkW  = cols.length > 0 ? Math.max(10, Math.floor((UW - fSnoW - fRollW - 40 - fTotalW) / cols.length)) : 14;
        const fNameW  = Math.max(24, UW - fSnoW - fRollW - fTotalW - cols.length * fMarkW);

        const totalColIdx = cols.length + 3;
        autoTable(doc, {
          startY: sheetStartY,
          head: sheetHead,
          body: mkBody(rows),
          margin: { left: ML, right: MR },
          tableWidth: UW,
          theme: 'grid',
          headStyles: {
            fillColor: [30, 58, 95] as [number, number, number],
            textColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'center',
            cellPadding: 2,
          },
          bodyStyles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            0: { halign: 'center' as const, cellWidth: fSnoW },
            1: { halign: 'center' as const, cellWidth: fRollW },
            2: { halign: 'left'   as const, cellWidth: fNameW },
            ...Object.fromEntries(cols.map((_, i) => [i + 3, { halign: 'center' as const, cellWidth: fMarkW }])),
            [totalColIdx]: {
              halign: 'center' as const,
              cellWidth: fTotalW,
              fontStyle: 'bold' as const,
              fillColor: [254, 240, 138] as [number, number, number],
              textColor: [31, 41, 55]   as [number, number, number],
            },
          },
          alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === totalColIdx) {
              const val = Number(data.cell.raw);
              if (!isNaN(val)) {
                if      (val >= 75) data.cell.styles.textColor = [5, 150, 105];
                else if (val >= 50) data.cell.styles.textColor = [37, 99, 235];
                else if (val >= 40) data.cell.styles.textColor = [217, 119, 6];
                else                data.cell.styles.textColor = [220, 38, 38];
              }
            }
          },
        });
        afterSheet = (doc as any).lastAutoTable?.finalY ?? sheetStartY + 50;
      } else {
        /* ── SPLIT two side-by-side half-tables (Staff, compact 1-page) ── */
        const halfGap = 4;
        const halfW   = (UW - halfGap) / 2;

        const half1 = Math.ceil(rows.length / 2);
        const col1Rows = rows.slice(0, half1);
        const col2Rows = rows.slice(half1);

        const tSnoW   = 6;
        const tRollW  = 22;
        const tTotalW = 12;
        const tMarkW  = cols.length > 0 ? Math.max(8, Math.floor((halfW - tSnoW - tRollW - 22 - tTotalW) / cols.length)) : 10;
        const tNameW  = Math.max(14, halfW - tSnoW - tRollW - tTotalW - cols.length * tMarkW);

        const halfTableStyles = {
          theme: 'grid' as const,
          headStyles: {
            fillColor: [30, 58, 95] as [number, number, number],
            textColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold' as const,
            fontSize: 6.5,
            halign: 'center' as const,
            cellPadding: 1.2,
          },
          bodyStyles: { fontSize: 6.2, cellPadding: 0.9 },
          columnStyles: {
            0: { halign: 'center' as const, cellWidth: tSnoW },
            1: { halign: 'center' as const, cellWidth: tRollW },
            2: { halign: 'left'   as const, cellWidth: tNameW },
            ...Object.fromEntries(cols.map((_, i) => [i + 3, { halign: 'center' as const, cellWidth: tMarkW }])),
            [cols.length + 3]: {
              halign: 'center' as const,
              cellWidth: tTotalW,
              fontStyle: 'bold' as const,
              fillColor: [254, 240, 138] as [number, number, number],
              textColor: [31, 41, 55]   as [number, number, number],
            },
          },
          alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
          didParseCell: (data: any) => {
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
        };

        const col1X = ML;
        const col2X = ML + halfW + halfGap;

        // Column 1 (left half)
        autoTable(doc, {
          startY: sheetStartY,
          head: sheetHead,
          body: mkBody(col1Rows, 0),
          margin: { left: col1X, right: PW - col1X - halfW },
          tableWidth: halfW,
          ...halfTableStyles,
        });
        const afterCol1 = (doc as any).lastAutoTable?.finalY ?? sheetStartY + 50;

        // Column 2 (right half)
        if (col2Rows.length > 0) {
          autoTable(doc, {
            startY: sheetStartY,
            head: sheetHead,
            body: mkBody(col2Rows, half1),
            margin: { left: col2X, right: MR },
            tableWidth: halfW,
            ...halfTableStyles,
          });
        }
        const afterCol2 = (doc as any).lastAutoTable?.finalY ?? sheetStartY;
        afterSheet = Math.max(afterCol1, afterCol2);
      }

      /* ═══════════════════════════════════════════════════════════
         SHARED STATS DATA — computed once, used on page 1 (staff)
         or page 2 (class report)
         ═══════════════════════════════════════════════════════════ */
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
      const rangeCounts        = computeRangeCounts(totals);
      const absent             = studentCount - totals.length;

      /* ── For STAFF view: place stats + bell on PAGE 1 below the mark table ── */
      /* ── For CLASS report: add a new PAGE 2 with full-width stats + bell    ── */
      if (!isClassReport) {
        curY = afterSheet + 6;
      } else {
        doc.addPage();
        curY = 10;
        await drawPageBanner();
      }

      setStatus('Building statistics & ranking page…');

      /* ── Layout: left = stats panel (2-col compact), right = bell curve ── */
      const panelGap  = 5;
      const statsW    = Math.round(UW * (isClassReport ? 0.38 : 0.30));
      const bellW     = UW - statsW - panelGap;
      const bellX     = ML + statsW + panelGap;
      const topRowY   = curY;

      /* ── Class Statistics panel (left) ── */
      {
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

        // Staff view: 2-column compact table (4 rows × 2 cols)
        // Class report: original single-column tall panel
        const sHeaderH = 8;
        let panelH: number;

        if (!isClassReport) {
          // Compact 2-col grid: 4 rows — stretch to fill remaining page space
          const numCols2  = 2;
          const numRows2  = Math.ceil(statsList.length / numCols2);
          const availH    = PH - 18 - topRowY;              // remaining page space
          panelH          = Math.max(sHeaderH + numRows2 * 7 + 2, availH);
          const sRowH2    = (panelH - sHeaderH - 2) / numRows2;
          const sFontSz   = Math.min(9.5, Math.max(6.5, sRowH2 * 0.52));
          const colW2s    = statsW / numCols2;

          doc.setFillColor(248, 250, 253);
          doc.roundedRect(ML, topRowY, statsW, panelH, 2, 2, 'F');
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.35);
          doc.roundedRect(ML, topRowY, statsW, panelH, 2, 2, 'S');
          // Header bar
          doc.setFillColor(...NAVY);
          doc.roundedRect(ML, topRowY, statsW, sHeaderH, 2, 2, 'F');
          doc.rect(ML, topRowY + sHeaderH - 3, statsW, 3, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('Class Statistics', ML + statsW / 2, topRowY + 5.5, { align: 'center' });
          // Vertical divider between 2 cols
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.2);
          doc.line(ML + colW2s, topRowY + sHeaderH, ML + colW2s, topRowY + panelH - 1);

          for (let si = 0; si < statsList.length; si++) {
            const col = si % numCols2;
            const row = Math.floor(si / numCols2);
            const [lbl, val, valColor] = statsList[si];
            const rx = ML + col * colW2s;
            const ry = topRowY + sHeaderH + row * sRowH2;
            if (row % 2 === 0 && col === 0) {
              doc.setFillColor(239, 246, 255);
              doc.rect(ML + 1, ry, statsW - 2, sRowH2, 'F');
            }
            // Row separator
            if (col === 0 && row > 0) {
              doc.setDrawColor(220, 230, 242); doc.setLineWidth(0.15);
              doc.line(ML + 2, ry, ML + statsW - 2, ry);
            }
            doc.setFont('helvetica', 'normal'); doc.setFontSize(sFontSz); doc.setTextColor(55, 65, 81);
            doc.text(lbl, rx + 3, ry + sRowH2 * 0.55);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(sFontSz); doc.setTextColor(...valColor);
            doc.text(val, rx + colW2s - 3, ry + sRowH2 * 0.55, { align: 'right' });
          }
        } else {
          const sRowH    = 7.5;
          const sRowGap  = 0.4;
          panelH = sHeaderH + statsList.length * (sRowH + sRowGap) + 2;

          doc.setFillColor(248, 250, 253);
          doc.roundedRect(ML, topRowY, statsW, panelH, 2.5, 2.5, 'F');
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.4);
          doc.roundedRect(ML, topRowY, statsW, panelH, 2.5, 2.5, 'S');
          doc.setFillColor(...NAVY);
          doc.roundedRect(ML, topRowY, statsW, sHeaderH, 2.5, 2.5, 'F');
          doc.rect(ML, topRowY + sHeaderH - 3, statsW, 3, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('Class Statistics', ML + statsW / 2, topRowY + 6, { align: 'center' });
          statsList.forEach(([lbl, val, valColor], i) => {
            const ry = topRowY + sHeaderH + i * (sRowH + sRowGap);
            if (i % 2 === 0) { doc.setFillColor(239, 246, 255); doc.rect(ML + 1, ry, statsW - 2, sRowH, 'F'); }
            if (lbl === 'Pass Rate') { doc.setFillColor(...valColor); doc.rect(ML + 1, ry, 2, sRowH, 'F'); }
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(55, 65, 81);
            doc.text(lbl, ML + 5, ry + 5);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...valColor);
            doc.text(val, ML + statsW - 4, ry + 5, { align: 'right' });
            if (i < statsList.length - 1) { doc.setDrawColor(220, 230, 242); doc.setLineWidth(0.15); doc.line(ML + 3, ry + sRowH + sRowGap / 2, ML + statsW - 3, ry + sRowH + sRowGap / 2); }
          });
        }

        // Record height for aligning the bell graph
        curY = topRowY + panelH;
      }

      /* ── Bell Curve (right) — match stats panel height ── */
      setStatus('Drawing bell graph…');

      // Subject colors palette (used when isClassReport with multiple subjects)
      const SUBJECT_COLORS: [number, number, number][] = [
        [37,  99,  235],  // blue
        [220, 38,  38 ],  // red
        [5,   150, 105],  // green
        [217, 119, 6  ],  // amber
        [124, 58,  237],  // purple
        [8,   145, 178],  // cyan
        [190, 24,  93 ],  // pink
        [194, 65,  12 ],  // orange
        [6,   95,  70 ],  // dark green
        [29,  78,  216],  // indigo
      ];

      // Build per-subject range data when isClassReport
      type SubjectCurve = { code: string; label: string; subLabel?: string; color: [number, number, number]; rangeCts: { label: string; count: number }[] };
      const subjectCurves: SubjectCurve[] = [];
      if (isClassReport && cols.length > 1) {
        cols.forEach((col, ci) => {
          const subjectMarks = rows.map((r) => r.marks[col.key]).filter((v): v is number => v != null);
          const cts = RANGES.map((rng) => ({
            label: rng.label,
            count: subjectMarks.filter((v) => v >= rng.min && v <= rng.max).length,
          }));
          subjectCurves.push({
            code: col.key,
            label: col.key,
            subLabel: col.label !== col.key ? col.label : undefined,
            color: SUBJECT_COLORS[ci % SUBJECT_COLORS.length],
            rangeCts: cts,
          });
        });
      }
      const useMultiCurve = subjectCurves.length > 1;

      {
        const bellH   = curY - topRowY; // match the stats panel height
        const padL = 14;
        const padR = 4;
        const padT = 14;
        const padB = 16;
        const chartX  = bellX + padL;
        const chartW  = bellW - padL - padR;
        const chartTopY = topRowY + padT;
        const chartH    = bellH - padT - padB;
        const chartBotY = chartTopY + chartH;

        const n      = rangeCounts.length;
        const barGap = chartW / n;

        // Global max count for Y-axis scale
        let globalMax = Math.max(1, ...rangeCounts.map((r) => r.count));
        if (useMultiCurve) {
          for (const sc of subjectCurves)
            globalMax = Math.max(globalMax, ...sc.rangeCts.map((r) => r.count));
        }

        // Panel background
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(bellX, topRowY, bellW, bellH, 2, 2, 'F');
        doc.setDrawColor(220, 230, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(bellX, topRowY, bellW, bellH, 2, 2, 'S');

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 58, 95);
        doc.text('Bell Curve Distribution', bellX + bellW / 2, topRowY + 8, { align: 'center' });

        // Axes
        doc.setDrawColor(180, 190, 200);
        doc.setLineWidth(0.5);
        doc.line(chartX, chartTopY, chartX, chartBotY);
        doc.line(chartX, chartBotY, chartX + chartW, chartBotY);

        // Horizontal grid lines
        doc.setDrawColor(220, 230, 240);
        doc.setLineWidth(0.2);
        for (let g = 1; g <= 4; g++) {
          const gy = chartBotY - (chartH * g) / 4;
          doc.line(chartX, gy, chartX + chartW, gy);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.setTextColor(140, 150, 165);
          doc.text(String(Math.round((globalMax * g) / 4)), chartX - 2, gy + 1, { align: 'right' });
        }

        // X-axis labels (vertical, stacked: high\nto\nlow)
        rangeCounts.forEach((r, i) => {
          const bx = chartX + i * barGap + barGap / 2;
          const parts = r.label.replace('–', '-').split('-').map(s => s.trim());
          const lines = parts.length === 2 ? [parts[1], 'to', parts[0]] : [r.label];
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(4.5);
          doc.setTextColor(75, 85, 99);
          lines.forEach((ln, li) => {
            doc.text(ln, bx, chartBotY + 3 + li * 3.2, { align: 'center' });
          });
        });

        // Helper: draw a single bell curve
        const drawCurve = (cts: { label: string; count: number }[], color: [number, number, number], lineW: number, fillAlpha: boolean) => {
          const pts = cts.map((r, i) => ({
            x: chartX + i * barGap + barGap / 2,
            y: chartBotY - (chartH > 0 ? (r.count / globalMax) * chartH : 0),
          }));
          if (pts.length < 2) return;
          const tension = 0.45;
          const tan = pts.map((p, i) => {
            const prev = pts[Math.max(0, i - 1)];
            const next = pts[Math.min(pts.length - 1, i + 1)];
            return { x: (next.x - prev.x) * tension, y: (next.y - prev.y) * tension };
          });
          const bezSegs: number[][] = [];
          for (let i = 0; i < pts.length - 1; i++) {
            const cp1x = pts[i].x + tan[i].x / 3;
            const cp1y = pts[i].y + tan[i].y / 3;
            const cp2x = pts[i + 1].x - tan[i + 1].x / 3;
            const cp2y = pts[i + 1].y - tan[i + 1].y / 3;
            bezSegs.push([
              cp1x - pts[i].x, cp1y - pts[i].y,
              cp2x - pts[i].x, cp2y - pts[i].y,
              pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y,
            ]);
          }
          // Filled area (only for single curve)
          if (fillAlpha) {
            const areaSegs: number[][] = [...bezSegs];
            areaSegs.push([0, chartBotY - pts[pts.length - 1].y]);
            areaSegs.push([pts[0].x - pts[pts.length - 1].x, 0]);
            doc.setFillColor(color[0], color[1], color[2]);
            doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
            doc.setDrawColor(color[0], color[1], color[2]);
            doc.setLineWidth(0);
            doc.lines(areaSegs, pts[0].x, pts[0].y, [1, 1], 'F', true);
            doc.setGState(new (doc as any).GState({ opacity: 1 }));
          }
          // Curve line
          doc.setDrawColor(...color);
          doc.setLineWidth(lineW);
          doc.lines(bezSegs, pts[0].x, pts[0].y, [1, 1], 'S');
          // Dots
          doc.setFillColor(...color);
          doc.setDrawColor(...color);
          pts.forEach((p) => { doc.circle(p.x, p.y, 0.6, 'F'); });
        };

        if (useMultiCurve) {
          // Draw each subject curve
          subjectCurves.forEach((sc) => {
            drawCurve(sc.rangeCts, sc.color, 0.8, false);
          });
        } else {
          // Single overall curve (staff view)
          drawCurve(rangeCounts, [37, 99, 235], 1, true);

          // Data point count labels
          const pts = rangeCounts.map((r, i) => ({
            x: chartX + i * barGap + barGap / 2,
            y: chartBotY - (chartH > 0 ? (r.count / globalMax) * chartH : 0),
          }));
          pts.forEach((p, i) => {
            if (rangeCounts[i].count > 0) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(5.5);
              doc.setTextColor(37, 99, 235);
              doc.text(String(rangeCounts[i].count), p.x, p.y - 2, { align: 'center' });
            }
          });
        }

        // Y-axis label
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(100, 116, 139);
        doc.text('#', chartX - 2, chartTopY - 1, { align: 'right' });

        // Subtitle
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(107, 114, 128);
        doc.text(
          `${totals.length} attended · ${absent} absent · Avg: ${_statsAvg} / 100`,
          bellX + bellW / 2,
          topRowY + bellH - 3,
          { align: 'center' },
        );
      }

      /* ── Subject Legend (below graph, for multi-subject class report) ── */
      if (subjectCurves.length > 1) {
        curY += 2;
        const legendCols = Math.min(subjectCurves.length, 4);
        const legendColW = UW / legendCols;
        const legendRows = Math.ceil(subjectCurves.length / legendCols);
        // Draw a light background box for the legend
        const legendH = legendRows * 5 + 3;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(ML, curY, UW, legendH, 1.5, 1.5, 'F');
        doc.setDrawColor(220, 230, 240);
        doc.setLineWidth(0.25);
        doc.roundedRect(ML, curY, UW, legendH, 1.5, 1.5, 'S');
        subjectCurves.forEach((sc, si) => {
          const col = si % legendCols;
          const row = Math.floor(si / legendCols);
          const lx = ML + 4 + col * legendColW;
          const ly = curY + 2.5 + row * 5;
          // Color swatch
          doc.setFillColor(...sc.color);
          doc.roundedRect(lx, ly, 4, 2, 0.5, 0.5, 'F');
          // Subject code label
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5);
          doc.setTextColor(...sc.color);
          const drawLabel = sc.subLabel ? `${sc.label} (${sc.subLabel})` : sc.label;
          doc.text(drawLabel, lx + 5.5, ly + 1.6);
        });
        curY += legendH;
      }

      curY += 6;

      /* ── Ranking Table (class report only — staff PDF is single page, no ranking) ── */
      if (isClassReport) {
        setStatus('Building ranking table…');

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

        // Section heading
        doc.setFillColor(5, 150, 105);
        doc.rect(ML, curY, UW, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('Ranking Table', ML + 4, curY + 4.2);
        curY += 8;

        const rankTableHead = [
          ['Rank', 'Roll No.', 'Name', ...cols.map((c) => `${c.label}\n/ ${c.max}`), 'Total\n/ 100'],
        ];
        const top3Rows = rankedRows.filter((r) => r.rank <= 3);
        const rankTableBody = top3Rows.map((r) => [
          String(r.rank),
          r.regNo,
          r.name,
          ...cols.map((c) => (r.marks[c.key] != null ? String(r.marks[c.key]) : '—')),
          r.total100 != null ? String(r.total100) : '—',
        ]);

        const rankRollW  = 28;
        const rankTotalW = 14;
        const rankRankW  = 10;
        const rankMarkW  = cols.length > 0 ? Math.max(8, Math.floor((UW - rankRankW - rankRollW - 30 - rankTotalW) / cols.length)) : 14;
        const rankNameW  = Math.max(20, UW - rankRankW - rankRollW - rankTotalW - cols.length * rankMarkW);

        autoTable(doc, {
          startY: curY,
          head: rankTableHead,
          body: rankTableBody,
          margin: { left: ML, right: MR },
          tableWidth: UW,
          theme: 'grid',
          headStyles: {
            fillColor: [5, 150, 105] as [number, number, number],
            textColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'center',
            cellPadding: 1.5,
          },
          bodyStyles: { fontSize: 6.5, cellPadding: 1.2 },
          columnStyles: {
            0: { halign: 'center', cellWidth: rankRankW,  fontStyle: 'bold' },
            1: { halign: 'center', cellWidth: rankRollW },
            2: { halign: 'left',   cellWidth: rankNameW },
            ...Object.fromEntries(cols.map((_, i) => [i + 3, { halign: 'center' as const, cellWidth: rankMarkW }])),
            [cols.length + 3]: {
              halign: 'center' as const,
              cellWidth: rankTotalW,
              fontStyle: 'bold' as const,
              fillColor: [209, 250, 229] as [number, number, number],
              textColor: [5, 150, 105] as [number, number, number],
            },
          },
          alternateRowStyles: { fillColor: [240, 253, 244] as [number, number, number] },
          didParseCell: (data: any) => {
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
      }

      /* ── Footer and Watermark on each page ── */
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        // Draw watermark on top of all content
        await drawWatermark();
        // Draw footer
        doc.setDrawColor(200, 205, 210);
        doc.setLineWidth(0.3);
        doc.line(ML, PH - 9, PW - MR, PH - 9);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(156, 163, 175);
        const semStr = semester != null ? `  ·  Semester ${semester}` : '';
        doc.text(
          `Generated: ${new Date().toLocaleString()}  |  ${courseId} · ${sectionName}${semStr} · ${cycleName}  |  Page ${p} / ${pageCount}`,
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
