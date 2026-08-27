/**
 * generateEventPdf.ts
 * Generates a PDF for an approved event-attending expense form.
 *
 * Page 1 – Event (On Duty) Information + Expense Claim (continuous, no page break)
 * Pages 2+ – Proof documents (one per page, image or PDF embed)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { EventAttendingFormDetail } from '../../../types/eventAttending';

const INSTITUTION = 'K RAMAKRISHNAN GROUP OF INSTITUTION';
const LOGO_LEFT = '/logo left indent.png';
const LOGO_RIGHT = '/logo.png';

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

// ── helper: fetch remote url as blob then base64 and buffer ─────────────────────
async function fetchFileAsData(url: string): Promise<{ base64: string; buffer: ArrayBuffer; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { base64, buffer, mimeType: blob.type };
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

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 10, 8, 65, 24);
    } catch { /* ignore */ }
  }

  // Heading block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
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
  logoLeftBase64: string | null,
  logoRightBase64: string | null,
): { signatureStartY: number, availableTopY: number } {
  addPageHeader(doc, logoLeftBase64, 'EVENT SETTLEMENT', '');

  const W = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date : ${formatDate(form.created_at)}`, W / 2, 28, { align: 'center' });
  // Logo (right)
  if (logoRightBase64) {
    try {
      doc.addImage(logoRightBase64, 'PNG', W - 25, 8, 12, 8);
    } catch {}
  }

  // ── Faculty Details (compact: 2 per row) ──────────────────────────
  const applicantName = getApplicantName(form.applicant);
  const applicantId = getApplicantField(form.applicant, 'staff_id');
  const applicantJoinDate = formatDate((form.applicant as any)?.date_of_join);
  const applicantDepartment = getApplicantField(form.applicant, 'department');

  // 2-column layout: left col = label+value, right col = label+value
  // We build a single paired array for both Faculty Details and Event Details to avoid gaps
  const combinedRows: any[][] = [
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
  ];

  // ── On Duty / Event Details (compact: 2 fields per row) ─────────
  // Labels are now resolved dynamically from form.on_duty_form_schema

  const rawData = form.on_duty_form_data || {};
  const schema: Array<{ name: string; label: string; type: string; can_change_form_fields?: boolean; conditional_fields?: Record<string, any[]> }> = form.on_duty_form_schema || [];
  const flatRows: [string, string][] = [];

  // Build dynamic label map from schema (including conditional child fields)
  const labelMap: Record<string, string> = {
    kss_link: 'KSS Link'
  };
  const walkSchemaForLabels = (fields: typeof schema) => {
    fields.forEach(f => {
      labelMap[f.name] = f.label || f.name.replace(/_/g, ' ');
      if (f.conditional_fields) {
        Object.values(f.conditional_fields).forEach((children: any[]) => {
          children.forEach(cf => { labelMap[cf.name] = cf.label || cf.name.replace(/_/g, ' '); });
        });
      }
    });
  };
  walkSchemaForLabels(schema);

  // Walk schema in order, respecting conditional_fields
  const seen = new Set<string>();
  const walkAndCollect = (fields: typeof schema) => {
    fields.forEach(f => {
      if (f.type === 'file') return;
      const val = rawData[f.name];
      if (val != null && val !== '' && typeof val !== 'object') {
        flatRows.push([labelMap[f.name] || f.name.replace(/_/g, ' '), String(val)]);
        seen.add(f.name);
      }
      if (f.can_change_form_fields && f.conditional_fields && val) {
        const children = (f.conditional_fields[String(val)] || []) as typeof schema;
        walkAndCollect(children);
      }
    });
  };

  if (schema.length > 0) {
    walkAndCollect(schema);
  }

  // Fallback: any remaining keys not covered by schema
  Object.entries(rawData).forEach(([k, v]) => {
    if (seen.has(k) || v == null || v === '' || typeof v === 'object') return;
    if (k === 'proof') return;
    flatRows.push([labelMap[k] || k.replace(/_/g, ' '), String(v)]);
  });

  // Pair into 4-column rows: [label1, value1, label2, value2]
  for (let i = 0; i < flatRows.length; i += 2) {
    if (flatRows[i + 1]) {
      combinedRows.push([
        { content: flatRows[i][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i][1] },
        { content: flatRows[i + 1][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i + 1][1] },
      ]);
    } else {
      combinedRows.push([
        { content: flatRows[i][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i][1], colSpan: 3 },
      ]);
    }
  }

  autoTable(doc, {
    startY: 38,
    body: combinedRows,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 55 },
      2: { cellWidth: 40 },
      3: { cellWidth: 55 },
    },
    theme: 'grid',
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
    margin: { left: 10, right: 10 },
  });

  let curY = ((doc as any).lastAutoTable?.finalY ?? 60) + 8;

  // ── Expense Claim section (continuous on same page flow) ──────────
  // Removed "EXPENSE CLAIM FORM" header as requested.
  // curY is untouched here so spacing remains reasonable.

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

  const totalsStartY = curY;

  // Budget details block
  if ((form as any).budget_details) {
    const b = (form as any).budget_details;
    const eligibleText = b.is_conference ? 'Eligible Amount for Conference' : 'Eligible Amount for Events';
    
    autoTable(doc, {
      startY: totalsStartY,
      body: [
        [`Available Amount\n(${eligibleText})`, rs(b.allocated)],
        ['Amount Received During AY', rs(b.used)],
        ['Balance Amount\n(Available Balance)', rs(b.available)],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left', fillColor: [245, 247, 250] },
        1: { halign: 'right' },
      },
      theme: 'grid',
      tableWidth: 90,
      margin: { left: 10 },
    });
  }

  // Totals summary — right-aligned mini table
  autoTable(doc, {
    startY: totalsStartY,
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
    tableWidth: 90,
    margin: { left: W - 100, right: 10 },
  });

  curY = ((doc as any).lastAutoTable?.finalY ?? curY + 24) + 5;

  // ── Signature block (horizontal, 2 rows) ─────────────────────────
  const H = doc.internal.pageSize.getHeight();
  const signatureHeight = 40; // Space needed for signature block
  
  if (curY + signatureHeight > H - 15) {
      doc.addPage();
      curY = 20; // Top of the new page is available
  }
  
  // Place signature directly after the content
  const signatureStartY = curY;
  
  const balanceLabel = form.balance >= 0 ? 'Balance Received' : 'Refunded';
  
  const getSigData = (role: string) => {
      if (role === 'Faculty') {
          return { name: applicantName, date: formatDate(form.created_at) };
      }
      const step = form.workflow_progress?.find(s => s.approver_role === role && s.is_completed && s.status === 'approved');
      if (step) {
          const approverName = (step.approver as any)?.full_name || (step.approver as any)?.name || 'Approved';
          return {
              name: approverName,
              date: step.action_date ? new Date(step.action_date).toLocaleString('en-IN') : 'Approved'
          };
      }
      return null;
  };

  // Helper: draw one horizontal signature row with evenly-spaced labels
  function drawHorizSigRow(roles: string[], y: number) {
    const usableW = W - 20;
    const colW = usableW / roles.length;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.4);
    
    roles.forEach((role, i) => {
      const cx = 10 + i * colW + colW / 2;
      const lineHalfW = Math.min(colW * 0.7, 28) / 2;
      
      const sigData = getSigData(role);
      
      if (sigData) {
          doc.text(sigData.name, cx, y - 2, { align: 'center', maxWidth: colW - 4 });
      }
      
      doc.line(cx - lineHalfW, y, cx + lineHalfW, y);
      
      let displayRole = role;
      if (role === 'Faculty') displayRole = 'Applied By Faculty';
      else if (role === 'HOD') displayRole = 'Approved By HOD';
      else if (role === 'HAA') displayRole = 'Approved By HAA';

      doc.setFont('helvetica', 'bold');
      doc.text(displayRole, cx, y + 4, { align: 'center', maxWidth: colW - 4 });
      doc.setFont('helvetica', 'normal');
      
      if (sigData && sigData.date) {
          doc.setFontSize(7);
          doc.setTextColor(80, 80, 80);
          doc.text(sigData.date, cx, y + 8, { align: 'center', maxWidth: colW - 4 });
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
      }
    });
  }

  // Dynamically extract roles from workflow (including inactive steps)
  const workflowRoles = (form.full_workflow || form.workflow_progress || [])
    .sort((a: any, b: any) => a.step_order - b.step_order)
    .map((step: any) => step.approver_role);

  // Row 1: Faculty | <dynamic roles from workflow>
  const firstRowRoles = ['Faculty', ...workflowRoles];
  drawHorizSigRow(firstRowRoles, signatureStartY + 12);
  // Row 2: Administrative Officer / Manager | Balance Received
  drawHorizSigRow(['Administrative Officer / Manager', balanceLabel], signatureStartY + 34);

  return { signatureStartY, availableTopY: signatureStartY + 50 };
}

export interface PdfDrawOp {
  pageIndex: number;
  buffer: ArrayBuffer;
  x: number;
  y: number;
  width: number;
  height: number;
}

async function drawProofBlock(
  doc: jsPDF,
  file: any,
  logoLeftBase64: string | null,
  logoRightBase64: string | null,
  startX: number,
  startY: number,
  blockWidth: number,
  blockHeight: number,
  pdfDrawOps: PdfDrawOp[],
  hideLogos: boolean = false
) {
  let textY = startY + 14;

  if (!hideLogos) {
    if (logoLeftBase64) {
      try { doc.addImage(logoLeftBase64, 'PNG', startX + 10, startY + 8, 55, 15); } catch { }
    }
    if (logoRightBase64) {
      try { doc.addImage(logoRightBase64, 'PNG', startX + blockWidth - 25, startY + 8, 12, 12); } catch { }
    }

    // Page mini-header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('EVENT SETTLEMENT', startX + (blockWidth / 2), startY + 14, { align: 'center' });
    textY = startY + 20;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const expTypeRaw = (file.expense_type || '').toLowerCase();
  const expTypeLabel = expTypeRaw === 'advance'
    ? 'ADVANCE RECEIPT'
    : expTypeRaw.replace(/_/g, ' ').toUpperCase();
  doc.text(`Proof Document - ${expTypeLabel}`, startX + (blockWidth / 2), textY, { align: 'center' });
  doc.text(`File: ${file.original_filename || 'attachment'}`, startX + (blockWidth / 2), textY + 6, { align: 'center' });

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.line(startX + 10, textY + 10, startX + blockWidth - 10, textY + 10);
  
  const headerSpace = textY + 13 - startY;

  // Fetch the proof file
  const fetched = await fetchFileAsData(file.file_url!);
  if (!fetched) {
    doc.setFontSize(10);
    doc.setTextColor(180, 0, 0);
    doc.text('(File could not be loaded)', startX + (blockWidth / 2), startY + (blockHeight / 2), { align: 'center' });
    doc.setTextColor(0, 0, 0);
    return;
  }

  const mime = fetched.mimeType.toLowerCase();

  if (mime.startsWith('image/')) {
    const imgType = mime.includes('png') ? 'PNG' : 'JPEG';
    const maxImgW = blockWidth - 20;
    const maxImgH = blockHeight - 40; // 30 for header, 10 for bottom padding
    try {
      const props = doc.getImageProperties(fetched.data);
      let imgW = props.width;
      let imgH = props.height;
      let angle = 0;
      let drawX, drawY, dw, dh;

      // If the block is wide (Landscape) and the image is tall (Portrait)
      if (maxImgW > maxImgH && imgH > imgW) {
        // Rotate -90 degrees
        angle = -90;
        // Bounding box for rotated image is imgH (width) x imgW (height)
        const ratio = Math.min(maxImgW / imgH, maxImgH / imgW);
        dw = imgW * ratio;
        dh = imgH * ratio;
        
        const boxX = startX + (blockWidth - dh) / 2;
        const boxY = startY + headerSpace + 3 + (maxImgH - dw) / 2;
        
        drawX = boxX;
        drawY = boxY + dw;
      } else {
        const ratio = Math.min(maxImgW / imgW, maxImgH / imgH);
        dw = imgW * ratio;
        dh = imgH * ratio;
        
        drawX = startX + (blockWidth - dw) / 2;
        drawY = startY + headerSpace + 3 + (maxImgH - dh) / 2;
      }
      
      doc.addImage(fetched.base64, imgType, drawX, drawY, dw, dh, undefined, 'FAST', angle);
    } catch {
      doc.addImage(fetched.base64, imgType, startX + 10, startY + headerSpace + 3, maxImgW, maxImgH);
    }
  } else if (mime === 'application/pdf') {
    const pageIndex = (doc as any).internal.getNumberOfPages() - 1;
    const maxImgW = blockWidth - 20;
    const maxImgH = blockHeight - 40;
    const drawX = startX + 10;
    const drawY = startY + headerSpace + 3;

    pdfDrawOps.push({
        pageIndex,
        buffer: fetched.buffer,
        x: drawX,
        y: drawY,
        width: maxImgW,
        height: maxImgH,
    });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`(Unsupported file type: ${mime})`, startX + (blockWidth / 2), startY + (blockHeight / 2), { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }
}

async function buildProofPages(
  doc: jsPDF,
  form: EventAttendingFormDetail,
  logoLeftBase64: string | null,
  logoRightBase64: string | null,
  layout: { signatureStartY: number, availableTopY: number },
  pdfDrawOps: PdfDrawOp[]
) {
  const rawFiles = (form.files || []).filter(f => f.file_url);
  const proofFiles: any[] = [...rawFiles];

  if (form.event_proof) {
    let proofUrl = form.event_proof;
    if (!proofUrl.startsWith('http') && !proofUrl.startsWith('/')) {
        proofUrl = `/media/${proofUrl}`;
    }
    proofFiles.push({
      file_url: proofUrl,
      original_filename: proofUrl.split('/').pop() || 'Event_Proof',
      expense_type: 'Event Proof',
      orientation: 'portrait'
    });
  }

  const rawData = form.on_duty_form_data || {};
  const schema: Array<any> = form.on_duty_form_schema || [];
  
  const extractSchemaFiles = (fields: any[]) => {
    fields.forEach(f => {
      let val = rawData[f.name];
      if (Array.isArray(val) && val.length > 0) val = val[0];

      if (f.type === 'file' && val) {
        if (typeof val === 'string') {
          let url = val;
          if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:')) url = `/media/${url}`;
          proofFiles.push({
            file_url: url,
            original_filename: url.split('/').pop() || f.label || f.name,
            expense_type: f.label || f.name.replace(/_/g, ' '),
            orientation: 'portrait'
          });
        } else if (typeof val === 'object' && val.content) {
          proofFiles.push({
            file_url: val.content,
            original_filename: val.filename || f.label || f.name,
            expense_type: f.label || f.name.replace(/_/g, ' '),
            orientation: 'portrait'
          });
        }
      }
      if (f.can_change_form_fields && f.conditional_fields && val) {
        const children = f.conditional_fields[String(val)] || [];
        extractSchemaFiles(children);
      }
    });
  };
  extractSchemaFiles(schema);

  // fallback for any unhandled strings containing 'proof' or '/media/'
  Object.entries(rawData).forEach(([k, v]) => {
    if (typeof v === 'string' && (v.includes('/media/') || v.startsWith('http') || v.startsWith('data:')) && k.toLowerCase().includes('proof')) {
      const exists = proofFiles.some(p => p.file_url === v);
      if (!exists) {
        proofFiles.push({
          file_url: v,
          original_filename: v.split('/').pop() || k,
          expense_type: k.replace(/_/g, ' '),
          orientation: 'portrait'
        });
      }
    } else if (typeof v === 'object' && v && (v as any).content && (v as any).content.startsWith('data:') && k.toLowerCase().includes('proof')) {
      const content = (v as any).content;
      const exists = proofFiles.some(p => p.file_url === content);
      if (!exists) {
        proofFiles.push({
          file_url: content,
          original_filename: (v as any).filename || k,
          expense_type: k.replace(/_/g, ' '),
          orientation: 'portrait'
        });
      }
    }
  });

  if (!proofFiles.length) return;

  const portraitFiles = proofFiles.filter(f => f.orientation !== 'landscape');
  const landscapeFiles = proofFiles.filter(f => f.orientation === 'landscape');

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const spaceLeft = H - 15 - layout.availableTopY;
  const halfH = H / 2;

  let i_landscape = 0;

  // Try to fit one landscape file in the remaining space of the signature page
  if (landscapeFiles.length > 0 && spaceLeft >= halfH - 5) {
    const file = landscapeFiles[0];
    
    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(10, layout.availableTopY, W - 10, layout.availableTopY);
    await drawProofBlock(doc, file, logoLeftBase64, logoRightBase64, 0, layout.availableTopY, W, halfH - 14, pdfDrawOps, true);
    i_landscape = 1;
  }

  // Draw remaining portrait files (1 per page)
  for (let i = 0; i < portraitFiles.length; i++) {
    doc.addPage('a4', 'portrait');
    await drawProofBlock(doc, portraitFiles[i], logoLeftBase64, logoRightBase64, 0, 0, W, H - 14, pdfDrawOps);
  }

  // Draw remaining landscape files (2 per page top-and-bottom)
  for (let i = i_landscape; i < landscapeFiles.length; i += 2) {
    doc.addPage('a4', 'portrait');
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    
    const file1 = landscapeFiles[i];
    const file2 = landscapeFiles[i + 1];
    const halfH = H / 2;
    
    // Top half
    await drawProofBlock(doc, file1, logoLeftBase64, logoRightBase64, 0, 0, W, halfH, pdfDrawOps);
    
    // Bottom half (if there's a second file)
    if (file2) {
      // Separator line
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(10, halfH, W - 10, halfH);
      
      await drawProofBlock(doc, file2, logoLeftBase64, logoRightBase64, 0, halfH, W, halfH - 14, pdfDrawOps, true);
    }
  }
}

// ── Main export ───────────────────────────────────────────────────────
export async function generateEventPdf(form: EventAttendingFormDetail): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Load logos once
  const logoLeftBase64 = await loadImageBase64(LOGO_LEFT);
  const logoRightBase64 = await loadImageBase64(LOGO_RIGHT);

  // Build content — event info + expense claim on same continuous page flow
  const layout = buildMainContent(doc, form, logoLeftBase64, logoRightBase64);
  const pdfDrawOps: PdfDrawOp[] = [];
  await buildProofPages(doc, form, logoLeftBase64, logoRightBase64, layout, pdfDrawOps);

  const jsPdfPages = (doc as any).internal.getNumberOfPages();
  const downloadDateStr = `Downloaded: ${new Date().toLocaleString('en-IN')}`;
  
  for (let i = 1; i <= jsPdfPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    
    // Left footer
    doc.text(
      downloadDateStr,
      10,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'left' }
    );
    
    // Center footer
    doc.text(
      `Page ${i} of ${jsPdfPages}  |  ${INSTITUTION}`,
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

  if (pdfDrawOps.length > 0) {
    try {
      const mainPdfBytes = doc.output('arraybuffer');
      const mergedPdf = await PDFDocument.load(mainPdfBytes);
      const allPages = mergedPdf.getPages();
      
      for (const op of pdfDrawOps) {
          try {
              const pdfToEmbed = await PDFDocument.load(op.buffer);
              const [embeddedPage] = await mergedPdf.embedPdf(pdfToEmbed, [0]); // embed the first page
              
              const page = allPages[op.pageIndex];
              const pageHeight = page.getSize().height;
              
              // Convert mm to points (1 mm = 2.83465 points)
              const pt = 2.83465;
              const boxX = op.x * pt;
              const boxY = op.y * pt;
              const boxW = op.width * pt;
              const boxH = op.height * pt;
              
              // Calculate scale to fit within box while preserving aspect ratio
              const scale = Math.min(boxW / embeddedPage.width, boxH / embeddedPage.height);
              const drawW = embeddedPage.width * scale;
              const drawH = embeddedPage.height * scale;
              
              // Center within the box
              const finalX = boxX + (boxW - drawW) / 2;
              const finalY = pageHeight - boxY - boxH + (boxH - drawH) / 2;
              
              page.drawPage(embeddedPage, {
                  x: finalX,
                  y: finalY,
                  width: drawW,
                  height: drawH,
              });
          } catch (err) {
              console.error('Failed to embed a PDF proof', err);
          }
      }
      
      const finalPdfBytes = await mergedPdf.save();
      const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${eventTitle}_expense_claim.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return;
    } catch (err) {
      console.error('Error embedding PDFs with pdf-lib, falling back to basic jsPDF', err);
    }
  }

  doc.save(`${eventTitle}_expense_claim.pdf`);
}
