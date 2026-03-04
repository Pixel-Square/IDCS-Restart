import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import idcsLogoDataUrl from '../assets/idcs-logo.png?inline';
import collegeBannerDataUrl from '../assets/banner.png?inline';

export type CqiPdfStudentRow = {
  regNo?: string;
  name: string;
  section?: string | null;
  flaggedCos: string[];
  total?: string | number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function safeText(v: any): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function drawCqiHeader(doc: jsPDF, marginX: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  const y = 4;
  const maxW = pageW - marginX * 2;
  const gap = 6;

  // Layout: college banner full-width; IDCS logo below at right.
  const bannerMaxH = 200;
  const idcsMaxH = 38;
  const idcsMaxW = 110;

  let bottomY = y;

  // Draw college banner (full-width)
  try {
    const props: any = (doc as any).getImageProperties ? (doc as any).getImageProperties(collegeBannerDataUrl) : null;
    const iw = Number(props?.width) || 1;
    const ih = Number(props?.height) || 1;
    const aspect = iw / ih;

    // Prefer spanning the full page width. The source banner is very wide, so height stays reasonable.
    const drawW = pageW;
    const drawH = Math.min(drawW / aspect, bannerMaxH);
    doc.addImage(collegeBannerDataUrl, 'PNG', 0, y, drawW, drawH);
    bottomY = y + drawH;
  } catch {
    bottomY = y;
  }

  // Draw IDCS logo (below banner, right aligned)
  try {
    const props: any = (doc as any).getImageProperties ? (doc as any).getImageProperties(idcsLogoDataUrl) : null;
    const iw = Number(props?.width) || 1;
    const ih = Number(props?.height) || 1;
    const aspect = iw / ih;

    let drawW = Math.min(idcsMaxW, maxW);
    let drawH = drawW / aspect;
    if (drawH > idcsMaxH) {
      drawH = idcsMaxH;
      drawW = drawH * aspect;
    }

    const lx = pageW - marginX - drawW;
    const ly = bottomY + gap;
    doc.addImage(idcsLogoDataUrl, 'PNG', lx, ly, drawW, drawH);
    bottomY = ly + drawH;
  } catch {
    // ignore
  }

  return bottomY + 18;
}

function drawPillButton(doc: jsPDF, args: { x: number; y: number; w: number; h: number; label: string; tone: 'neutral' | 'danger'; pageNumber?: number | null }) {
  const { x, y, w, h, label, tone, pageNumber } = args;
  const fill = tone === 'danger' ? [254, 226, 226] : [224, 242, 254];
  const border = tone === 'danger' ? [248, 113, 113] : [56, 189, 248];
  const text = tone === 'danger' ? [153, 27, 27] : [11, 74, 111];

  doc.setDrawColor(border[0], border[1], border[2]);
  doc.setFillColor(fill[0], fill[1], fill[2]);
  (doc as any).roundedRect(x, y, w, h, h / 2, h / 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(text[0], text[1], text[2]);
  doc.text(label, x + 10, y + h / 2 + 3);
  if (typeof pageNumber === 'number' && Number.isFinite(pageNumber) && pageNumber >= 1) {
    (doc as any).link(x, y, w, h, { pageNumber });
  }
}

function addTablePage(doc: jsPDF, args: {
  title: string;
  subjectLine: string;
  rows: CqiPdfStudentRow[];
  marginX: number;
  includeTotal: boolean;
  summaryPageNumber?: number;
  cosMask?: string[] | null;
}) {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(args.title, args.marginX, y);

  if (typeof args.summaryPageNumber === 'number' && Number.isFinite(args.summaryPageNumber)) {
    const label = 'Back to Summary';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(11, 116, 184);
    const tw = doc.getTextWidth(label);
    const x = pageW - args.marginX - tw;
    const linkY = y - 10;
    doc.text(label, x, y);
    (doc as any).link(x, linkY, tw, 14, { pageNumber: args.summaryPageNumber });
  }

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(args.subjectLine, args.marginX, y);
  y += 14;
  doc.text(`Generated: ${new Date().toLocaleString()}`, args.marginX, y);
  y += 12;

  const head = args.includeTotal
    ? [['S.No', 'Sec', 'Reg No', 'Student Name', "CO's", '100']]
    : [['S.No', 'Sec', 'Reg No', 'Student Name', "CO's"]];

  const body = args.rows.map((r, idx) => {
    const shownCos = Array.isArray(args.cosMask) && args.cosMask.length
      ? (r.flaggedCos || []).filter((c) => args.cosMask!.includes(c))
      : (r.flaggedCos || []);
    const base = [
      String(idx + 1),
      safeText(r.section || ''),
      safeText(r.regNo || ''),
      safeText(r.name || ''),
      safeText(shownCos.join(', ')),
    ];
    if (!args.includeTotal) return base;
    const t = r.total;
    base.push(t == null ? '' : safeText(typeof t === 'number' ? round1(t) : t));
    return base;
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: {
      fontSize: 9,
      cellPadding: 4,
      overflow: 'linebreak',
      valign: 'middle',
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [234, 246, 255],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: args.marginX, right: args.marginX },
    tableWidth: pageW - args.marginX * 2,
    columnStyles: args.includeTotal
      ? {
          0: { cellWidth: 34 },
          1: { cellWidth: 38 },
          2: { cellWidth: 98 },
          3: { cellWidth: 190 },
          4: { cellWidth: 'auto' },
          5: { cellWidth: 44, halign: 'center' },
        }
      : {
          0: { cellWidth: 34 },
          1: { cellWidth: 38 },
          2: { cellWidth: 98 },
          3: { cellWidth: 220 },
          4: { cellWidth: 'auto' },
        },
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      const row = args.rows[data.row.index];
      const flagged = Array.isArray(row?.flaggedCos) && row.flaggedCos.length > 0;
      if (!flagged) return;

      // Highlight flagged students like the UI screenshot
      data.cell.styles.fillColor = [254, 242, 242];
      if (data.column.index === (args.includeTotal ? 4 : 4)) {
        data.cell.styles.textColor = [153, 27, 27];
        data.cell.styles.fontStyle = 'bold';
      }
      if (args.includeTotal && data.column.index === 5) {
        data.cell.styles.textColor = [153, 27, 27];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
}

export function exportCqiPdf(args: {
  subjectCode: string;
  subjectName?: string | null;
  coNumbers: number[];
  rows: CqiPdfStudentRow[];
  title?: string;
  filename?: string;
  includeAllStudentsPage?: boolean;
  instructorName?: string | null;
}): void {
  const subjectCode = safeText(args.subjectCode || '') || '—';
  const subjectName = safeText(args.subjectName || '');
  const subjectLine = `Subject: ${subjectCode}${subjectName ? ` — ${subjectName}` : ''}`;
  const instructorName = safeText(args.instructorName || '');
  const coNumbers = (Array.isArray(args.coNumbers) ? args.coNumbers : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  const rowsAll = (Array.isArray(args.rows) ? args.rows : []).map((r) => ({
    regNo: safeText(r.regNo || ''),
    name: safeText(r.name || ''),
    section: r.section ?? null,
    flaggedCos: Array.isArray(r.flaggedCos) ? r.flaggedCos.map((c) => safeText(c)).filter(Boolean) : [],
    total: r.total ?? null,
  }));

  const includeTotal = rowsAll.some((r) => r.total != null && safeText(r.total) !== '');
  const rowsFlagged = rowsAll.filter((r) => r.flaggedCos.length > 0);

  const includeAllStudentsPage = Boolean(args.includeAllStudentsPage);

  // Prefer CO1+CO2 split pills/pages when available.
  const hasCo1 = coNumbers.includes(1);
  const hasCo2 = coNumbers.includes(2);
  const pair = hasCo1 && hasCo2 ? [1, 2] : coNumbers.slice(0, 2);
  const coA = pair.length >= 1 ? pair[0] : null;
  const coB = pair.length >= 2 ? pair[1] : null;
  const coAKey = coA != null ? `CO${coA}` : null;
  const coBKey = coB != null ? `CO${coB}` : null;

  const pairLists = (() => {
    if (!coAKey || !coBKey) return null;
    const both = rowsFlagged.filter((r) => r.flaggedCos.includes(coAKey) && r.flaggedCos.includes(coBKey));
    const onlyA = rowsFlagged.filter((r) => r.flaggedCos.includes(coAKey) && !r.flaggedCos.includes(coBKey));
    const onlyB = rowsFlagged.filter((r) => !r.flaggedCos.includes(coAKey) && r.flaggedCos.includes(coBKey));
    return { both, onlyA, onlyB };
  })();

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 36;
  const title = safeText(args.title || 'CQI Export') || 'CQI Export';

  // Page 1: Summary header (IDCS banner + details)
  const headerBottomY = drawCqiHeader(doc, marginX);
  let headerY = headerBottomY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(11, 74, 111);
  doc.text(title, marginX, headerY);

  headerY += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(subjectLine, marginX, headerY);
  headerY += 14;
  if (instructorName) {
    doc.text(`Course Instructor: ${instructorName}`, marginX, headerY);
    headerY += 14;
  }
  const totalStudents = rowsAll.length;
  const flaggedStudents = rowsFlagged.length;
  const clearedStudents = totalStudents - flaggedStudents;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Students: ${totalStudents}    |    Cleared: ${clearedStudents}    |    Flagged: ${flaggedStudents}`, marginX, headerY);
  headerY += 14;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, headerY);

  // Cleared students (not flagged on any CO)
  const rowsCleared = rowsAll.filter((r) => r.flaggedCos.length === 0);

  // Build sections first so autoTable pagination doesn't break link targets
  const pageStart: {
    all?: number;
    cleared?: number;
    onlyA?: number;
    onlyB?: number;
    bothAB?: number;
  } = {};

  // Page 2: All students (flagged highlighted)
  if (includeAllStudentsPage) {
    doc.addPage();
    pageStart.all = doc.getNumberOfPages();
    addTablePage(doc, {
      title: 'All Students (flagged highlighted)',
      subjectLine,
      rows: rowsAll,
      marginX,
      includeTotal,
      summaryPageNumber: 1,
      cosMask: null,
    });
  }

  // Cleared students page
  doc.addPage();
  pageStart.cleared = doc.getNumberOfPages();
  addTablePage(doc, {
    title: 'Students Cleared (All COs Above Threshold)',
    subjectLine,
    rows: rowsCleared,
    marginX,
    includeTotal,
    summaryPageNumber: 1,
    cosMask: null,
  });

  // Pair combo pages (for first two selected COs)
  if (pairLists && coA != null && coB != null) {
    doc.addPage();
    pageStart.onlyA = doc.getNumberOfPages();
    addTablePage(doc, {
      title: `Students Below Threshold — CO${coA} only (not CO${coB})`,
      subjectLine,
      rows: pairLists.onlyA,
      marginX,
      includeTotal,
      summaryPageNumber: 1,
      cosMask: coAKey ? [coAKey] : null,
    });

    doc.addPage();
    pageStart.onlyB = doc.getNumberOfPages();
    addTablePage(doc, {
      title: `Students Below Threshold — CO${coB} only (not CO${coA})`,
      subjectLine,
      rows: pairLists.onlyB,
      marginX,
      includeTotal,
      summaryPageNumber: 1,
      cosMask: coBKey ? [coBKey] : null,
    });

    doc.addPage();
    pageStart.bothAB = doc.getNumberOfPages();
    addTablePage(doc, {
      title: `Students Below Threshold — CO${coA} and CO${coB}`,
      subjectLine,
      rows: pairLists.both,
      marginX,
      includeTotal,
      summaryPageNumber: 1,
      cosMask: [coAKey as string, coBKey as string].filter(Boolean),
    });
  }

  // Now draw buttons on page 1 using the real start pages
  doc.setPage(1);
  const pageW = doc.internal.pageSize.getWidth();
  const usableW = pageW - marginX * 2;
  let y = headerY + 24;
  const h = 22;
  const pillGap = 12;

  // Row 1: Cleared pill (centered)
  const clearedW = 170;
  const clearedX = (pageW - clearedW) / 2;
  drawPillButton(doc, {
    x: clearedX,
    y,
    w: clearedW,
    h,
    label: `Cleared: ${clearedStudents}`,
    tone: 'neutral',
    pageNumber: pageStart.cleared ?? null,
  });

  // Row 2: CO split pills (evenly distributed)
  if (pairLists && coA != null && coB != null) {
    y += h + 14;
    const pillCount = 3;
    const pillW = Math.floor((usableW - pillGap * (pillCount - 1)) / pillCount);
    let px = marginX;

    drawPillButton(doc, {
      x: px,
      y,
      w: pillW,
      h,
      label: `CO${coA} only: ${pairLists.onlyA.length}`,
      tone: pairLists.onlyA.length ? 'danger' : 'neutral',
      pageNumber: pageStart.onlyA ?? null,
    });
    px += pillW + pillGap;
    drawPillButton(doc, {
      x: px,
      y,
      w: pillW,
      h,
      label: `CO${coB} only: ${pairLists.onlyB.length}`,
      tone: pairLists.onlyB.length ? 'danger' : 'neutral',
      pageNumber: pageStart.onlyB ?? null,
    });
    px += pillW + pillGap;
    drawPillButton(doc, {
      x: px,
      y,
      w: pillW,
      h,
      label: `CO${coA} + CO${coB}: ${pairLists.both.length}`,
      tone: pairLists.both.length ? 'danger' : 'neutral',
      pageNumber: pageStart.bothAB ?? null,
    });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text('Tip: Click the pills above to jump to filtered lists.', marginX, y + 38);

  const filename = safeText(args.filename || `CQI_${subjectCode}.pdf`) || 'CQI.pdf';
  doc.save(filename);
}

export type CqiPdfFilter =
  | { kind: 'flagged' }
  | { kind: 'co'; coNum: number }
  | { kind: 'only'; coNum: number; notCoNum: number }
  | { kind: 'both'; coA: number; coB: number };

export function exportCqiPdfFiltered(args: {
  subjectCode: string;
  subjectName?: string | null;
  rows: CqiPdfStudentRow[];
  filter: CqiPdfFilter;
  title?: string;
  filename?: string;
}): void {
  const subjectCode = safeText(args.subjectCode || '') || '—';
  const subjectName = safeText(args.subjectName || '');
  const subjectLine = `Subject: ${subjectCode}${subjectName ? ` — ${subjectName}` : ''}`;
  const title = safeText(args.title || 'CQI Export') || 'CQI Export';

  const rowsAll = (Array.isArray(args.rows) ? args.rows : []).map((r) => ({
    regNo: safeText(r.regNo || ''),
    name: safeText(r.name || ''),
    section: r.section ?? null,
    flaggedCos: Array.isArray(r.flaggedCos) ? r.flaggedCos.map((c) => safeText(c)).filter(Boolean) : [],
    total: r.total ?? null,
  }));

  const includeTotal = rowsAll.some((r) => r.total != null && safeText(r.total) !== '');

  const filter = args.filter;
  const keyOf = (n: number) => `CO${n}`;

  let filtered: CqiPdfStudentRow[] = [];
  let cosMask: string[] | null = null;
  let pageTitle = title;

  if (filter.kind === 'flagged') {
    filtered = rowsAll.filter((r) => r.flaggedCos.length > 0);
    pageTitle = `${title} — Flagged Students`;
    cosMask = null;
  } else if (filter.kind === 'co') {
    const k = keyOf(filter.coNum);
    filtered = rowsAll.filter((r) => r.flaggedCos.includes(k));
    pageTitle = `${title} — ${k} below`;
    cosMask = [k];
  } else if (filter.kind === 'only') {
    const a = keyOf(filter.coNum);
    const b = keyOf(filter.notCoNum);
    filtered = rowsAll.filter((r) => r.flaggedCos.includes(a) && !r.flaggedCos.includes(b));
    pageTitle = `${title} — ${a} only (not ${b})`;
    cosMask = [a];
  } else if (filter.kind === 'both') {
    const a = keyOf(filter.coA);
    const b = keyOf(filter.coB);
    filtered = rowsAll.filter((r) => r.flaggedCos.includes(a) && r.flaggedCos.includes(b));
    pageTitle = `${title} — ${a} + ${b}`;
    cosMask = [a, b];
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  addTablePage(doc, {
    title: pageTitle,
    subjectLine,
    rows: filtered,
    marginX: 36,
    includeTotal,
    summaryPageNumber: undefined,
    cosMask,
  });

  const filename = safeText(args.filename || `CQI_${subjectCode}.pdf`) || 'CQI.pdf';
  doc.save(filename);
}
