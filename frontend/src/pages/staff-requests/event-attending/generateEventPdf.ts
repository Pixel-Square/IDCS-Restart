/**
 * generateEventPdf.ts
 * Generates a PDF for an approved event-attending expense form.
 *
 * Page 1 – Event (On Duty) Information + Expense Claim (continuous, no page break)
 * Pages 2+ – Proof documents (one per page, image or PDF embed)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EventAttendingFormDetail } from '../../../types/eventAttending';

const INSTITUTION = 'K RAMAKRISHNAN GROUP OF INSTITUTION';
const LOGO_PATH = '/favicon.png';

// jsPDF built-in fonts (Helvetica/Times/Courier) do NOT include the Rs. (₹) glyph.
// Use the ASCII-safe "Rs." prefix throughout the PDF.
function rs(amount: number | string): string {
  return `Rs. ${Number(amount).toLocaleString()}`;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN');
}

function getApplicantName(applicant: EventAttendingFormDetail['applicant']): string {
  const candidate = (applicant as any)?.name || (applicant as any)?.full_name || (applicant as any)?.username;
  return String(candidate || 'Faculty');
}

function getApplicantField(applicant: EventAttendingFormDetail['applicant'], key: string): string {
  const value = (applicant as any)?.[key];
  return String(value || '—');
}

// ── helper: load image as base64 ─────────────────────────────────────
async function loadImageBase64(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── helper: fetch remote url as blob then base64 ─────────────────────
async function fetchFileAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, mimeType: blob.type };
  } catch {
    return null;
  }
}

// ── Page header (logo left + institution name + page title) ──────────
function addPageHeader(
  doc: jsPDF,
  logoBase64: string | null,
  title: string,
  subtitle: string,
) {
  const W = doc.internal.pageSize.getWidth();

  // Logo (top-left)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 10, 8, 18, 18);
    } catch { /* ignore */ }
  }

  // Heading block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(INSTITUTION, W / 2, 14, { align: 'center' });

  doc.setFontSize(11);
  doc.text(title, W / 2, 22, { align: 'center' });

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, W / 2, 28, { align: 'center' });
  }

  // Divider line
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.5);
  doc.line(10, 32, W - 10, 32);
}

// ── Signature block (stacked, full-width) ─────────────────────────────
// Draws each label on its own line with an underline above it.
// Returns the Y position after the last label.
function addSignatureBlock(doc: jsPDF, startY: number, labels: string[]): number {
  const W = doc.internal.pageSize.getWidth();
  const lineW = 55; // width of each underline
  const cx = W / 2;
  let y = startY;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  for (const lbl of labels) {
    y += 8;
    // underline
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.4);
    doc.line(cx - lineW / 2, y, cx + lineW / 2, y);
    y += 5;
    doc.text(lbl, cx, y, { align: 'center' });
  }

  return y + 4;
}

// ── Main page: EVENT INFORMATION + EXPENSE CLAIM (continuous) ─────────
function buildMainContent(
  doc: jsPDF,
  form: EventAttendingFormDetail,
  logoBase64: string | null,
) {
  addPageHeader(doc, logoBase64, 'EVENT INFORMATION', '');

  const W = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Date :', W - 12, 14, { align: 'right' });

  // ── Faculty Details (compact: 2 per row) ──────────────────────────
  const applicantName = getApplicantName(form.applicant);
  const applicantId = getApplicantField(form.applicant, 'staff_id');
  const applicantJoinDate = formatDate((form.applicant as any)?.date_of_join);
  const applicantDepartment = getApplicantField(form.applicant, 'department');

  // 2-column layout: left col = label+value, right col = label+value
  // We use a 4-column autoTable: [label, value, label, value]
  autoTable(doc, {
    startY: 36,
    body: [
      [
        { content: 'Name of the Faculty', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: applicantName },
        { content: 'Faculty ID', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: applicantId },
      ],
      [
        { content: 'Date of Joining', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: applicantJoinDate },
        { content: 'Department', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: applicantDepartment },
      ],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 32 },
      3: { cellWidth: 'auto' },
    },
    theme: 'grid',
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
    margin: { left: 10, right: 10 },
  });

  let curY = ((doc as any).lastAutoTable?.finalY ?? 60) + 6;

  // ── On Duty / Event Details (compact: 2 fields per row) ─────────
  const EVENT_LABELS: Record<string, string> = {
    event_title: 'Event Title',
    host_institution_name: 'Host Institution',
    mode_of_event: 'Mode of Event',
    nature_of_event: 'Nature of Event',
    platform_if_online: 'Platform (if Online)',
    purpose: 'Purpose',
    expected_outcome: 'Expected Outcome',
    type: 'Type',
    reason: 'Reason',
    from_date: 'From Date',
    to_date: 'To Date',
    from_noon: 'From Session',
    to_noon: 'To Session',
  };

  const rawData = form.on_duty_form_data || {};
  const flatRows: [string, string][] = [];

  const ordered = [
    ...Object.keys(EVENT_LABELS).filter(k => rawData[k] != null && rawData[k] !== ''),
    ...Object.keys(rawData).filter(
      k =>
        !EVENT_LABELS[k] &&
        rawData[k] != null &&
        rawData[k] !== '' &&
        !String(rawData[k]).startsWith('{'),
    ),
  ];

  ordered.forEach(k => {
    const val = rawData[k];
    if (typeof val === 'object') return;
    flatRows.push([EVENT_LABELS[k] || k.replace(/_/g, ' '), String(val)]);
  });

  // Pair into 4-column rows: [label1, value1, label2, value2]
  const pairedRows: any[][] = [];
  for (let i = 0; i < flatRows.length; i += 2) {
    if (flatRows[i + 1]) {
      pairedRows.push([
        { content: flatRows[i][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i][1] },
        { content: flatRows[i + 1][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i + 1][1] },
      ]);
    } else {
      pairedRows.push([
        { content: flatRows[i][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i][1], colSpan: 3 },
      ]);
    }
  }

  autoTable(doc, {
    startY: curY,
    body: pairedRows,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 38 },
      3: { cellWidth: 'auto' },
    },
    theme: 'grid',
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
    margin: { left: 10, right: 10 },
  });

  curY = ((doc as any).lastAutoTable?.finalY ?? curY + 30) + 8;

  // ── Expense Claim section (continuous on same page flow) ──────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('EXPENSE CLAIM FORM', W / 2, curY, { align: 'center' });
  doc.setLineWidth(0.5);
  doc.setDrawColor(60, 60, 60);
  doc.line(10, curY + 2, W - 10, curY + 2);
  curY += 8;

  // Travel Expenses
  if (form.travel_expenses?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('A. Travel Expenses', 12, curY + 4);
    autoTable(doc, {
      startY: curY + 7,
      head: [['Date', 'Bill No.', 'Mode of Travel', 'From', 'To', 'Amount (Rs.)']],
      body: [
        ...form.travel_expenses.map(r => [
          r.date,
          r.bill_no || '-',
          r.mode_of_travel,
          r.from,
          r.to,
          rs(r.amount),
        ]),
        [{ content: 'Travel Sub-Total', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [235, 240, 255] } }, { content: rs(form.travel_total), styles: { fontStyle: 'bold', fillColor: [235, 240, 255] } }],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 80, 160], textColor: 255, fontStyle: 'bold' },
      theme: 'grid',
      margin: { left: 10, right: 10 },
    });
    curY = ((doc as any).lastAutoTable?.finalY ?? curY + 30) + 4;
  }

  // Food Expenses
  if (form.food_expenses?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('B. Food Expenses', 12, curY + 4);
    autoTable(doc, {
      startY: curY + 7,
      head: [['Date', 'Bill No.', 'Breakfast', 'Lunch', 'Dinner', 'Amount (Rs.)']],
      body: [
        ...form.food_expenses.map(r => [
          r.date,
          r.bill_no || '-',
          r.breakfast || '-',
          r.lunch || '-',
          r.dinner || '-',
          rs(r.amount),
        ]),
        [{ content: 'Food Sub-Total', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [235, 240, 255] } }, { content: rs(form.food_total), styles: { fontStyle: 'bold', fillColor: [235, 240, 255] } }],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 80, 160], textColor: 255, fontStyle: 'bold' },
      theme: 'grid',
      margin: { left: 10, right: 10 },
    });
    curY = ((doc as any).lastAutoTable?.finalY ?? curY + 30) + 4;
  }

  // Other Expenses
  if (form.other_expenses?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('C. Other Expenses', 12, curY + 4);
    autoTable(doc, {
      startY: curY + 7,
      head: [['S.No', 'Date', 'Bill No.', 'Details', 'Amount (Rs.)']],
      body: [
        ...form.other_expenses.map((r, i) => [
          String(i + 1),
          r.date,
          r.bill_no || '-',
          r.expense_details,
          rs(r.amount),
        ]),
        [{ content: 'Other Sub-Total', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', fillColor: [235, 240, 255] } }, { content: rs(form.other_total), styles: { fontStyle: 'bold', fillColor: [235, 240, 255] } }],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 80, 160], textColor: 255, fontStyle: 'bold' },
      theme: 'grid',
      margin: { left: 10, right: 10 },
    });
    curY = ((doc as any).lastAutoTable?.finalY ?? curY + 30) + 4;
  }

  // Registration / Fees Spent
  if (form.total_fees_spend) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`D. Registration / Fees Spend: ${rs(form.total_fees_spend)}`, 12, curY + 5);
    curY += 9;
  }

  // Totals summary — right-aligned mini table
  curY += 4;
  autoTable(doc, {
    startY: curY,
    body: [
      ['Grand Total', rs(form.grand_total)],
      ['Advance Amount Received', rs(form.advance_amount_received)],
      [
        form.balance >= 0 ? 'Balance to be Received' : 'Amount to be Refunded',
        rs(Math.abs(form.balance)),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left', fillColor: [245, 247, 250] },
      1: { fontStyle: 'bold', halign: 'right' },
    },
    theme: 'grid',
    tableWidth: 100,
    margin: { left: W - 110, right: 10 },
  });

  curY = ((doc as any).lastAutoTable?.finalY ?? curY + 24) + 10;

  // ── Signature block (horizontal, 2 rows) ─────────────────────────
  curY += 8;
  const balanceLabel = form.balance >= 0 ? 'Balance Received' : 'Refunded';

  // Helper: draw one horizontal signature row with evenly-spaced labels
  function drawHorizSigRow(labels: string[], y: number) {
    const usableW = W - 20;
    const colW = usableW / labels.length;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.4);
    labels.forEach((lbl, i) => {
      const cx = 10 + i * colW + colW / 2;
      const lineHalfW = Math.min(colW * 0.7, 28) / 2;
      doc.line(cx - lineHalfW, y, cx + lineHalfW, y);
      doc.text(lbl, cx, y + 5, { align: 'center', maxWidth: colW - 4 });
    });
  }

  // Row 1: Faculty | HOD | IQAC | HAA | PRINCIPAL
  drawHorizSigRow(['Faculty', 'HOD', 'IQAC', 'HAA', 'PRINCIPAL'], curY);
  // Row 2: Administrative Officer / Manager | Balance Received
  drawHorizSigRow(['Administrative Officer / Manager', balanceLabel], curY + 18);
}

// ── Pages 2+: Proof Documents ─────────────────────────────────────────
async function buildProofPages(
  doc: jsPDF,
  form: EventAttendingFormDetail,
  logoBase64: string | null,
) {
  const proofFiles = (form.files || []).filter(f => f.file_url);
  if (!proofFiles.length) return;

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  for (const file of proofFiles) {
    doc.addPage();

    // Logo top-left
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 10, 8, 18, 18);
      } catch { }
    }

    // Page mini-header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(INSTITUTION, W / 2, 14, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const expType = (file.expense_type || '').replace(/_/g, ' ').toUpperCase();
    doc.text(`Proof Document - ${expType}`, W / 2, 20, { align: 'center' });
    doc.text(`File: ${file.original_filename || 'attachment'}`, W / 2, 26, { align: 'center' });

    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.4);
    doc.line(10, 30, W - 10, 30);

    // Fetch the proof file
    const fetched = await fetchFileAsBase64(file.file_url!);
    if (!fetched) {
      doc.setFontSize(10);
      doc.setTextColor(180, 0, 0);
      doc.text('(File could not be loaded)', W / 2, H / 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      continue;
    }

    const mime = fetched.mimeType.toLowerCase();

    if (mime.startsWith('image/')) {
      const imgType = mime.includes('png') ? 'PNG' : 'JPEG';
      const maxW = W - 20;
      const maxH = H - 44; // leave room for header (30mm) + footer (14mm)
      try {
        const props = doc.getImageProperties(fetched.data);
        const ratio = Math.min(maxW / props.width, maxH / props.height);
        const dw = props.width * ratio;
        const dh = props.height * ratio;
        const x = (W - dw) / 2;
        doc.addImage(fetched.data, imgType, x, 33, dw, dh);
      } catch {
        doc.addImage(fetched.data, imgType, 10, 33, maxW, maxH);
      }
    } else if (mime === 'application/pdf') {
      // jsPDF cannot embed PDF pages directly — show a notice + link
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text('(PDF proof - please open the link below)', W / 2, H / 2 - 6, { align: 'center' });
      if (file.file_url) {
        doc.setTextColor(0, 0, 200);
        doc.textWithLink('Open PDF File', W / 2, H / 2 + 4, { url: file.file_url, align: 'center' } as any);
        doc.setTextColor(0, 0, 0);
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(`(Unsupported file type: ${mime})`, W / 2, H / 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  }
}

// ── Main export ───────────────────────────────────────────────────────
export async function generateEventPdf(form: EventAttendingFormDetail): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Load logo once
  const logoBase64 = await loadImageBase64(LOGO_PATH);

  // Build content — event info + expense claim on same continuous page flow
  buildMainContent(doc, form, logoBase64);
  await buildProofPages(doc, form, logoBase64);

  // Page numbers footer on every page
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Page ${i} of ${totalPages}  |  ${INSTITUTION}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' },
    );
    doc.setTextColor(0, 0, 0);
  }

  const eventTitle = (form.on_duty_form_data?.event_title || 'event-form').replace(
    /[^a-zA-Z0-9\-_]/g,
    '_',
  );
  doc.save(`${eventTitle}_expense_claim.pdf`);
}
