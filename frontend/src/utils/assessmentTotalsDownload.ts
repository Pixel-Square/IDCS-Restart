import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import fetchWithAuth from '../services/fetchAuth';
import logoUrl from '../../assets/logo.jpg';

const DEFAULT_COLLEGE_NAME = 'K RAMAKRISHNAN COLLEGE OF TECHNOLOGY, Autonomous';

export type DownloadFormat = 'excel' | 'pdf';

export type TotalsRow = {
  sno: number;
  regNo: string;
  name: string;
  total: string | number;
};

export type TotalsHeaderMeta = {
  collegeName?: string;
  courseName?: string;
  courseCode?: string;
  staffName?: string;
  className?: string;
  bannerUrl?: string;
};

function safeFilePart(raw: string) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
}

function truncateTextToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  const s = String(text ?? '');
  if (!s) return '';
  if (doc.getTextWidth(s) <= maxWidth) return s;
  const ell = '…';
  const ellW = doc.getTextWidth(ell);
  if (ellW >= maxWidth) return '';
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const part = s.slice(0, mid);
    if (doc.getTextWidth(part) + ellW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, Math.max(0, lo)) + ell;
}

function saveBlobAs(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function getCurrentStaffDisplayName(): Promise<string> {
  try {
    const res = await fetchWithAuth('/api/accounts/me/', { method: 'GET' });
    if (!res.ok) return '';
    const me = (await res.json()) as { username?: unknown; profile?: { staff_id?: unknown } };
    const username = String(me?.username ?? '').trim();
    const staffId = String(me?.profile?.staff_id ?? '').trim();
    return username || staffId || '';
  } catch {
    return '';
  }
}

function headerLines(meta: TotalsHeaderMeta): string[] {
  const collegeName = String(meta.collegeName || DEFAULT_COLLEGE_NAME).trim();
  const courseName = String(meta.courseName || '').trim();
  const courseCode = String(meta.courseCode || '').trim();
  const staffName = String(meta.staffName || '').trim();
  const className = String(meta.className || '').trim();

  return [
    collegeName,
    `Course Name: ${courseName || '-'}`,
    `Course Code: ${courseCode || '-'}`,
    `Staff Name: ${staffName || '-'}`,
    `Class Name: ${className || '-'}`,
  ];
}

function rowsToAoa(meta: TotalsHeaderMeta, rows: TotalsRow[]): Array<Array<string | number>> {
  const lines = headerLines(meta);
  const header = ['S.No', 'Reg No', 'Name', 'Total'];
  const body = rows.map((r) => [r.sno, r.regNo, r.name, r.total]);
  return [...lines.map((l) => [l, '', '', '']), [''], [header[0], header[1], header[2], header[3]], ...body];
}

function writeExcel(filenameBase: string, meta: TotalsHeaderMeta, rows: TotalsRow[]) {
  const maxRowsPerSheet = 45;
  const wb = XLSX.utils.book_new();

  const pages: TotalsRow[][] = [];
  for (let i = 0; i < rows.length; i += maxRowsPerSheet) pages.push(rows.slice(i, i + maxRowsPerSheet));
  if (pages.length === 0) pages.push([]);

  pages.forEach((pageRows, idx) => {
    const ws = XLSX.utils.aoa_to_sheet(rowsToAoa(meta, pageRows));
    ws['!freeze'] = { xSplit: 0, ySplit: 7 }; // header lines + blank + table header
    ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 34 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, pages.length > 1 ? `Page_${idx + 1}` : 'Sheet1');
  });

  const filename = `${safeFilePart(filenameBase) || 'marks'}_totals.xlsx`;
  XLSX.writeFile(wb, filename);
}

type PdfLayout = {
  doc: jsPDF;
  marginX: number;
  topY: number;
  bottomY: number;
  tableTopY: number;
  availableW: number;
  availableH: number;
  tableFont: number;
  headerFont: number;
  rowH: number;
  headerRowH: number;
  colGap: number;
  colsNeeded: number;
  rowsPerCol: number;
  colW: number;
};

function recomputePdfTableLayout(layout: PdfLayout, rows: TotalsRow[]) {
  layout.availableH = Math.max(60, layout.bottomY - layout.tableTopY);

  // Requirement: arrange students split half on left and right.
  // So always render in two columns (except trivial lists).
  if (rows.length <= 1) {
    layout.colsNeeded = 1;
    layout.rowsPerCol = Math.max(1, rows.length);
    layout.colW = layout.availableW;
    return;
  }

  layout.colsNeeded = 2;
  layout.colW = (layout.availableW - layout.colGap) / 2;
  const targetRowsPerCol = Math.max(1, Math.ceil(rows.length / 2));

  const canFitTwoCols = () => layout.headerRowH + targetRowsPerCol * layout.rowH <= layout.availableH;
  let guard = 0;
  while (guard++ < 30 && !canFitTwoCols() && layout.rowH > 6) {
    layout.tableFont = Math.max(5.0, layout.tableFont - 0.25);
    layout.rowH = Math.max(6, layout.rowH - 1);
    layout.headerRowH = Math.max(9, layout.headerRowH - 1);
  }

  layout.rowsPerCol = targetRowsPerCol;
}

function buildPdfLayout(orientation: 'portrait' | 'landscape', meta: TotalsHeaderMeta, rows: TotalsRow[]): PdfLayout {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const marginX = 32;
  const topY = 34;
  const bottomY = pageH - 28;
  const availableW = pageW - marginX * 2;

  // Header (banner + details) is drawn separately; do not reserve static header lines here.
  const headerFont = 12;
  const tableTopY = topY;
  const availableH = Math.max(60, bottomY - tableTopY);

  // Start conservative; if too many columns needed, we will shrink.
  let tableFont = 8;
  let rowH = 12;
  let headerRowH = 14;
  const colGap = 10;

  const compute = () => {
    const rowsPerCol = Math.max(1, Math.floor((availableH - headerRowH) / rowH));
    const colsNeeded = Math.max(1, Math.ceil(rows.length / rowsPerCol));
    const colW = (availableW - colGap * (colsNeeded - 1)) / colsNeeded;
    return { rowsPerCol, colsNeeded, colW };
  };

  let { rowsPerCol, colsNeeded, colW } = compute();

  // Shrink to fit more columns if needed.
  // Goal: keep everything on a single page without adding pages.
  const minColW = 150;
  let guard = 0;
  while (guard++ < 12 && colW < minColW && colsNeeded > 1) {
    tableFont = Math.max(6, tableFont - 0.5);
    rowH = Math.max(9, rowH - 1);
    headerRowH = Math.max(11, headerRowH - 1);
    ({ rowsPerCol, colsNeeded, colW } = compute());
  }

  return {
    doc,
    marginX,
    topY,
    bottomY,
    tableTopY,
    availableW,
    availableH,
    tableFont,
    headerFont,
    rowH,
    headerRowH,
    colGap,
    colsNeeded,
    rowsPerCol,
    colW,
  };
}

function drawPdfTotalsSinglePage(doc: jsPDF, layout: PdfLayout, meta: TotalsHeaderMeta, rows: TotalsRow[]) {
  const startY = layout.tableTopY;
  const colFractions = { sno: 0.12, reg: 0.30, name: 0.43, total: 0.15 };
  const snoW = layout.colW * colFractions.sno;
  const regW = layout.colW * colFractions.reg;
  const nameW = layout.colW * colFractions.name;
  const totalW = layout.colW * colFractions.total;
  const cellPadX = 3;

  doc.setFontSize(layout.tableFont);

  const headBg = [17, 24, 39] as const;
  const headText = [255, 255, 255] as const;
  const grid = [180, 180, 180] as const;

  for (let col = 0; col < layout.colsNeeded; col++) {
    const x0 = layout.marginX + col * (layout.colW + layout.colGap);
    let yy = startY;

    // Header row
    doc.setFillColor(headBg[0], headBg[1], headBg[2]);
    doc.rect(x0, yy, layout.colW, layout.headerRowH, 'F');
    doc.setTextColor(headText[0], headText[1], headText[2]);
    const headerBaseline = yy + layout.headerRowH - 4;
    doc.text('S.No', x0 + cellPadX, headerBaseline);
    doc.text('Reg No', x0 + snoW + cellPadX, headerBaseline);
    doc.text('Name', x0 + snoW + regW + cellPadX, headerBaseline);
    doc.text('Total', x0 + snoW + regW + nameW + cellPadX, headerBaseline);

    // Grid outline for header
    doc.setDrawColor(grid[0], grid[1], grid[2]);
    doc.rect(x0, yy, layout.colW, layout.headerRowH);
    doc.line(x0 + snoW, yy, x0 + snoW, yy + layout.headerRowH);
    doc.line(x0 + snoW + regW, yy, x0 + snoW + regW, yy + layout.headerRowH);
    doc.line(x0 + snoW + regW + nameW, yy, x0 + snoW + regW + nameW, yy + layout.headerRowH);

    yy += layout.headerRowH;
    doc.setTextColor(0, 0, 0);

    const startIdx = col * layout.rowsPerCol;
    const endIdx = Math.min(rows.length, startIdx + layout.rowsPerCol);
    for (let i = startIdx; i < endIdx; i++) {
      const r = rows[i];
      const rowY = yy + (i - startIdx) * layout.rowH;

      // Row border
      doc.rect(x0, rowY, layout.colW, layout.rowH);
      doc.line(x0 + snoW, rowY, x0 + snoW, rowY + layout.rowH);
      doc.line(x0 + snoW + regW, rowY, x0 + snoW + regW, rowY + layout.rowH);
      doc.line(x0 + snoW + regW + nameW, rowY, x0 + snoW + regW + nameW, rowY + layout.rowH);

      const textY = rowY + layout.rowH - 3;
      const snoText = truncateTextToWidth(doc, String(r?.sno ?? ''), Math.max(0, snoW - cellPadX * 2));
      const regText = truncateTextToWidth(doc, String(r?.regNo ?? ''), Math.max(0, regW - cellPadX * 2));
      const nameText = truncateTextToWidth(doc, String(r?.name ?? ''), Math.max(0, nameW - cellPadX * 2));
      const totalText = truncateTextToWidth(doc, String(r?.total ?? ''), Math.max(0, totalW - cellPadX * 2));

      doc.text(snoText, x0 + cellPadX, textY);
      doc.text(regText, x0 + snoW + cellPadX, textY);
      doc.text(nameText, x0 + snoW + regW + cellPadX, textY);
      doc.text(totalText, x0 + snoW + regW + nameW + cellPadX, textY);
    }
  }
}

async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function drawPdfTotalsSinglePageWithBanner(doc: jsPDF, layout: PdfLayout, meta: TotalsHeaderMeta, rows: TotalsRow[]) {
  // Attempt to load banner image. Prefer meta.bannerUrl if provided.
  const defaultBanner = String(meta.bannerUrl || logoUrl);
  const bannerUrl = meta.bannerUrl || defaultBanner;
  const dataUrl = await fetchImageDataUrl(bannerUrl);

  // If image available, draw it perfectly centered and auto-resized as a banner.
  const dense = rows.length >= 55;
  if (dataUrl) {
    try {
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(true);
      });
      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;
      const pageW = layout.doc.internal.pageSize.getWidth();
      const maxBannerH = dense ? 135 : 170; // Leave more room for the table when dense
      const maxBannerW = pageW - 2 * layout.marginX; // Align with table margins
      const aspect = iw / ih;
      let drawW = maxBannerW;
      let drawH = drawW / aspect;
      if (drawH > maxBannerH) {
        drawH = maxBannerH;
        drawW = drawH * aspect;
      }
      const x = (pageW - drawW) / 2;
      const y = 12; // Top margin
      layout.doc.addImage(dataUrl, 'PNG', x, y, drawW, drawH);
      layout.tableTopY = y + drawH + (dense ? 10 : 14); // Space below banner
    } catch {
      // ignore image errors
    }
  } else {
    layout.tableTopY = layout.topY; // fallback
  }

  // Draw course details below the banner, single instance only
  const detailsY = layout.tableTopY;
  doc.setFontSize(dense ? 8 : 9);
  doc.setTextColor(0, 0, 0);
  const details = [];
  if (meta.courseName) details.push(`Course Name: ${meta.courseName}`);
  if (meta.courseCode) details.push(`Course Code: ${meta.courseCode}`);
  if (meta.staffName) details.push(`Staff Name: ${meta.staffName}`);
  if (meta.className) details.push(`Class Name: ${meta.className}`);
  const detailLineH = dense ? 10 : 11;
  for (let i = 0; i < details.length; i++) {
    doc.text(details[i], layout.marginX, detailsY + i * detailLineH);
  }

  layout.tableTopY = detailsY + details.length * detailLineH + (dense ? 6 : 10);

  // IMPORTANT: table layout must be recomputed after changing tableTopY.
  recomputePdfTableLayout(layout, rows);

  // Now draw rest of content (skipping college name)
  return drawPdfTotalsSinglePage(doc, layout, meta, rows);
}

export async function buildPdfBlob(filenameBase: string, meta: TotalsHeaderMeta, rows: TotalsRow[]) {
  // Try portrait first; if too many columns, switch to landscape.
  const portrait = buildPdfLayout('portrait', meta, rows);
  const useLandscape = portrait.colsNeeded >= 4;
  const layout = useLandscape ? buildPdfLayout('landscape', meta, rows) : portrait;
  await drawPdfTotalsSinglePageWithBanner(layout.doc, layout, meta, rows);
  const blob = layout.doc.output('blob');
  const filename = `${safeFilePart(filenameBase) || 'marks'}_totals.pdf`;
  return { blob, filename };
}

function renderExcelPreview(container: HTMLElement, meta: TotalsHeaderMeta, rows: TotalsRow[]) {
  container.innerHTML = '';
  const lines = headerLines(meta);

  const headerBox = document.createElement('div');
  headerBox.style.display = 'flex';
  headerBox.style.flexDirection = 'column';
  headerBox.style.gap = '2px';
  headerBox.style.marginBottom = '10px';
  lines.forEach((l) => {
    const div = document.createElement('div');
    div.textContent = l;
    div.style.fontWeight = l === lines[0] ? '900' : '700';
    div.style.fontSize = l === lines[0] ? '14px' : '12px';
    headerBox.appendChild(div);
  });
  container.appendChild(headerBox);

  const wrapper = document.createElement('div');
  wrapper.className = 'obe-table-wrapper';
  wrapper.style.maxHeight = '420px';
  wrapper.style.overflow = 'auto';

  const table = document.createElement('table');
  table.className = 'obe-table';
  table.style.minWidth = 'unset';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['S.No', 'Reg No', 'Name', 'Total'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    [r.sno, r.regNo, r.name, r.total].forEach((v) => {
      const td = document.createElement('td');
      td.textContent = String(v ?? '');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function renderPdfPreview(container: HTMLElement, blob: Blob) {
  container.innerHTML = '';
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.width = '100%';
  iframe.style.height = '520px';
  iframe.style.border = '1px solid rgba(226,232,240,0.9)';
  iframe.style.borderRadius = '10px';
  container.appendChild(iframe);
  return () => URL.revokeObjectURL(url);
}

async function openPreviewAndDownloadDialog(params: {
  filenameBase: string;
  meta: TotalsHeaderMeta;
  rows: TotalsRow[];
}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    // Non-browser environment: default to PDF and download directly.
    const { blob, filename } = await buildPdfBlob(params.filenameBase, params.meta, params.rows);
    saveBlobAs(filename, blob);
    return;
  }

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.35)';
  overlay.style.display = 'grid';
  overlay.style.placeItems = 'center';
  overlay.style.padding = '16px';
  overlay.style.zIndex = '9999';

  const card = document.createElement('div');
  card.className = 'obe-card';
  card.style.width = 'min(980px, 100%)';
  card.style.maxHeight = 'min(92vh, 900px)';
  card.style.overflow = 'auto';

  const title = document.createElement('div');
  title.textContent = 'Preview totals before download';
  title.style.fontWeight = '950';
  title.style.fontSize = '14px';
  title.style.marginBottom = '10px';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.gap = '8px';
  topRow.style.flexWrap = 'wrap';
  topRow.style.alignItems = 'center';
  topRow.style.justifyContent = 'space-between';
  topRow.style.marginBottom = '10px';

  const formatGroup = document.createElement('div');
  formatGroup.style.display = 'flex';
  formatGroup.style.gap = '8px';
  formatGroup.style.flexWrap = 'wrap';

  const excelBtn = document.createElement('button');
  excelBtn.className = 'obe-btn obe-btn-secondary';
  excelBtn.textContent = 'Excel preview';

  const pdfBtn = document.createElement('button');
  pdfBtn.className = 'obe-btn obe-btn-primary';
  pdfBtn.textContent = 'PDF preview';

  formatGroup.appendChild(excelBtn);
  formatGroup.appendChild(pdfBtn);

  const actionGroup = document.createElement('div');
  actionGroup.style.display = 'flex';
  actionGroup.style.gap = '8px';
  actionGroup.style.flexWrap = 'wrap';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'obe-btn';
  closeBtn.textContent = 'Close';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'obe-btn obe-btn-success';
  downloadBtn.textContent = 'Download';

  actionGroup.appendChild(closeBtn);
  actionGroup.appendChild(downloadBtn);

  topRow.appendChild(formatGroup);
  topRow.appendChild(actionGroup);

  const preview = document.createElement('div');

  card.appendChild(title);
  card.appendChild(topRow);
  card.appendChild(preview);
  overlay.appendChild(card);

  let currentFmt: DownloadFormat = 'pdf';
  let cleanupPreviewUrl: null | (() => void) = null;
  let cachedPdf: null | { blob: Blob; filename: string } = null;

  const setActive = () => {
    excelBtn.className = currentFmt === 'excel' ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary';
    pdfBtn.className = currentFmt === 'pdf' ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary';
  };

  const render = async () => {
    if (cleanupPreviewUrl) {
      cleanupPreviewUrl();
      cleanupPreviewUrl = null;
    }
    preview.innerHTML = '';
    setActive();
    if (currentFmt === 'excel') {
      cachedPdf = null;
      renderExcelPreview(preview, params.meta, params.rows);
      return;
    }
    cachedPdf = await buildPdfBlob(params.filenameBase, params.meta, params.rows);
    cleanupPreviewUrl = renderPdfPreview(preview, cachedPdf.blob);
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (cleanupPreviewUrl) cleanupPreviewUrl();
    try {
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    } catch {
      // ignore
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  excelBtn.addEventListener('click', () => {
    currentFmt = 'excel';
    render();
  });
  pdfBtn.addEventListener('click', () => {
    currentFmt = 'pdf';
    render();
  });

  downloadBtn.addEventListener('click', async () => {
    if (currentFmt === 'excel') {
      writeExcel(params.filenameBase, params.meta, params.rows);
      return;
    }
    const pdf = cachedPdf || (await buildPdfBlob(params.filenameBase, params.meta, params.rows));
    saveBlobAs(pdf.filename, pdf.blob);
  });

  window.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
  render();
}

export async function downloadTotalsWithPrompt(params: {
  filenameBase: string;
  meta: TotalsHeaderMeta;
  rows: TotalsRow[];
}) {
  const resolvedMeta: TotalsHeaderMeta = { ...params.meta };
  if (!resolvedMeta.staffName) {
    resolvedMeta.staffName = await getCurrentStaffDisplayName();
  }

  const rows = (params.rows || []).filter((r) => r && r.regNo);

  await openPreviewAndDownloadDialog({
    filenameBase: params.filenameBase,
    meta: resolvedMeta,
    rows,
  });
}
