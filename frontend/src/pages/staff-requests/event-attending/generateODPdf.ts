/**
 * generateODPdf.ts
 * Generates a PDF for an approved On Duty form.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';
import type { StaffRequest } from '../../../types/staffRequests';

const INSTITUTION = 'K RAMAKRISHNAN GROUP OF INSTITUTIONS';
const LOGO_LEFT = '/logo left indent.png';
const LOGO_RIGHT = '/logo.png';

function rs(amount: number | string): string {
  return `Rs. ${Number(amount).toLocaleString()}`;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN');
}

function getApplicantName(applicant: StaffRequest['applicant']): string {
  const candidate = (applicant as any)?.name || (applicant as any)?.full_name || (applicant as any)?.username;
  return String(candidate || 'Faculty');
}

function getApplicantField(applicant: StaffRequest['applicant'], key: string): string {
  const value = (applicant as any)?.[key];
  return String(value || '—');
}

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

async function fetchFileAsData(url: string): Promise<{ buffer: ArrayBuffer; base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let mimeType = res.headers.get('content-type') || '';
    if (url.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
    else if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    else if (url.toLowerCase().endsWith('.jpg') || url.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
    
    const buffer = await res.arrayBuffer();
    
    let base64 = '';
    if (mimeType.startsWith('image/')) {
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      base64 = `data:${mimeType};base64,${btoa(binary)}`;
    }
    
    return { buffer, base64, mimeType };
  } catch (err) {
    console.error('Error fetching file', err);
    return null;
  }
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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('ON DUTY SETTLEMENT', startX + (blockWidth / 2), startY + 14, { align: 'center' });
    textY = startY + 20;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const expTypeLabel = (file.expense_type || 'Proof').toUpperCase();
  doc.text(`Proof Document - ${expTypeLabel}`, startX + (blockWidth / 2), textY, { align: 'center' });
  doc.text(`File: ${file.original_filename || 'attachment'}`, startX + (blockWidth / 2), textY + 6, { align: 'center' });

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.line(startX + 10, textY + 10, startX + blockWidth - 10, textY + 10);
  
  const headerSpace = textY + 13 - startY;

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
    const maxImgH = blockHeight - 40;
    try {
      const props = doc.getImageProperties(fetched.data);
      let imgW = props.width;
      let imgH = props.height;
      let angle = 0;
      let drawX, drawY, dw, dh;

      if (maxImgW > maxImgH && imgH > imgW) {
        angle = -90;
        const ratio = Math.min(maxImgW / imgH, maxImgH / imgW);
        dw = imgW * ratio;
        dh = imgH * ratio;
        drawX = startX + (blockWidth - dh) / 2;
        drawY = startY + headerSpace + 3 + (maxImgH - dw) / 2 + dw;
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

async function buildODProofPages(
  doc: jsPDF,
  proofFiles: any[],
  logoLeftBase64: string | null,
  logoRightBase64: string | null,
  layout: { signatureStartY: number, availableTopY: number },
  pdfDrawOps: PdfDrawOp[]
) {
  if (!proofFiles.length) return;

  const portraitFiles = proofFiles.filter(f => f.orientation !== 'landscape');
  const landscapeFiles = proofFiles.filter(f => f.orientation === 'landscape');

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const spaceLeft = H - 15 - layout.availableTopY;
  const halfH = H / 2;

  let i_landscape = 0;

  if (landscapeFiles.length > 0 && spaceLeft >= halfH - 5) {
    const file = landscapeFiles[0];
    
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(10, layout.availableTopY, W - 10, layout.availableTopY);
    await drawProofBlock(doc, file, logoLeftBase64, logoRightBase64, 0, layout.availableTopY, W, halfH - 14, pdfDrawOps, true);
    i_landscape = 1;
  }

  for (let i = 0; i < portraitFiles.length; i++) {
    doc.addPage('a4', 'portrait');
    await drawProofBlock(doc, portraitFiles[i], logoLeftBase64, logoRightBase64, 0, 0, W, H - 14, pdfDrawOps);
  }

  for (let i = i_landscape; i < landscapeFiles.length; i += 2) {
    doc.addPage('a4', 'portrait');
    const file1 = landscapeFiles[i];
    const file2 = landscapeFiles[i + 1];
    
    await drawProofBlock(doc, file1, logoLeftBase64, logoRightBase64, 0, 0, W, halfH, pdfDrawOps);
    
    if (file2) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(10, halfH, W - 10, halfH);
      await drawProofBlock(doc, file2, logoLeftBase64, logoRightBase64, 0, halfH, W, halfH - 14, pdfDrawOps, true);
    }
  }
}

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

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, W / 2, 38, { align: 'center' });

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, W / 2, 44, { align: 'center' });
  }

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.5);
  doc.line(10, subtitle ? 48 : 42, W - 10, subtitle ? 48 : 42);
}

function buildMainContent(
  doc: jsPDF,
  form: StaffRequest,
  logoLeftBase64: string | null,
  logoRightBase64: string | null,
): { signatureStartY: number, availableTopY: number } {
  addPageHeader(doc, logoLeftBase64, 'Event Participation Approval', '');

  const W = doc.internal.pageSize.getWidth();

  if (logoRightBase64) {
    try {
      doc.addImage(logoRightBase64, 'PNG', W - 25, 8, 12, 8);
    } catch {}
  }

  const applicantName = getApplicantName(form.applicant);
  const applicantId = getApplicantField(form.applicant, 'staff_id');
  const applicantJoinDate = formatDate((form.applicant as any)?.date_of_join);
  const applicantDepartment = getApplicantField(form.applicant, 'department');

  const b = (form as any).budget_details;
  const confAllocated = b?.allocated_conference ?? '-';
  const normalAllocated = b?.allocated_normal ?? '-';

  const combinedRows: any[][] = [
    [
      { content: 'Name of the Faculty', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
      { content: applicantName },
      { content: 'Date of Joining', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
      { content: applicantJoinDate },
    ],
    [
      { content: 'Faculty ID', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
      { content: applicantId },
      { content: 'Eligibility for Conference', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
      { content: confAllocated !== '-' ? `Rs. ${confAllocated}` : '-' },
    ],
    [
      { content: 'Department', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
      { content: applicantDepartment },
      { content: 'Eligibility for Normal Events', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
      { content: normalAllocated !== '-' ? `Rs. ${normalAllocated}` : '-' },
    ],
  ];

  const rawData = form.form_data || {};
  const schema: Array<any> = form.template?.form_schema || [];
  const flatRows: [string, string][] = [];

  const labelMap: Record<string, string> = {};
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

  const seen = new Set<string>();
  const walkAndCollect = (fields: typeof schema) => {
    fields.forEach(f => {
      if (f.type === 'file') return;
      
      const kl = f.name.toLowerCase();
      // Skip financial fields here, they will go to Financial Information section
      if (kl.includes('financial') || kl.includes('advance') || kl.includes('proposed') || kl.includes('total_fees')) {
          seen.add(f.name);
          return;
      }
      
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

  if (schema.length > 0) walkAndCollect(schema);

  Object.entries(rawData).forEach(([k, v]) => {
    if (seen.has(k) || v == null || v === '' || typeof v === 'object') return;
    
    const kl = k.toLowerCase();
    if (kl.includes('financial') || kl.includes('advance') || kl.includes('proposed') || kl.includes('total_fees')) return;
    
    flatRows.push([labelMap[k] || k.replace(/_/g, ' '), String(v)]);
  });

  for (let i = 0; i < flatRows.length; i += 2) {
    if (i + 1 < flatRows.length) {
      combinedRows.push([
        { content: flatRows[i][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i][1] },
        { content: flatRows[i+1][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i+1][1] },
      ]);
    } else {
      combinedRows.push([
        { content: flatRows[i][0], styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
        { content: flatRows[i][1], colSpan: 3 },
      ]);
    }
  }

  autoTable(doc, {
    startY: 50,
    body: combinedRows,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 50 },
      2: { cellWidth: 45 },
      3: { cellWidth: 50 },
    },
    theme: 'grid',
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
    margin: { left: 10, right: 10 },
  });

  let curY = ((doc as any).lastAutoTable?.finalY ?? 60) + 8;

  // ── FINANCIAL INFORMATION ─────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('FINANCIAL INFORMATION', W / 2, curY, { align: 'center' });
  curY += 4;
  
  // Extract financial data
  let isFin = 'No';
  let totalFees = '-';
  let amountProposed = '-';
  let isAdv = false;
  Object.entries(rawData).forEach(([k, v]) => {
      const kl = k.toLowerCase();
      if (kl.includes('financial')) isFin = String(v);
      if (kl.includes('advance') && String(v).trim().toUpperCase() === 'YES') isAdv = true;
      if (kl.includes('total_fees')) totalFees = String(v);
      if (kl.includes('proposed')) amountProposed = String(v);
  });
  
  let currentAdvanceDeducted = 0;
  if (form.status === 'approved' && isAdv && (isFin.trim().toUpperCase() === 'YES' || isFin.trim().toUpperCase() === 'TRUE')) {
      currentAdvanceDeducted = Number(amountProposed) || 0;
  }
  const alreadyClaimed = b ? Math.max(0, b.used - currentAdvanceDeducted) : 0;
  const openingBalance = b ? b.available + (Number(amountProposed) || 0) : 0;
  const closingBalance = openingBalance - (Number(amountProposed) || 0);
  
  const finRows: any[][] = [
      [{ content: 'Is Applying for Financial Support', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } }, { content: isFin, halign: 'center' }],
  ];
  
  if (isFin.trim().toUpperCase() === 'YES' || isFin.trim().toUpperCase() === 'TRUE') {
      finRows.push([
          { content: 'Already Claimed Amount (Current AY)', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } }, 
          { content: rs(alreadyClaimed), halign: 'center' }
      ]);
      finRows.push([
          { content: 'Amount Proposed', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } }, 
          { content: amountProposed, halign: 'center' }
      ]);
      finRows.push([
          { content: 'Opening Balance', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } }, 
          { content: rs(openingBalance), halign: 'center' }
      ]);
      finRows.push([
          { content: 'Closing Balance', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } }, 
          { content: rs(closingBalance), halign: 'center' }
      ]);
  }
  
  autoTable(doc, {
    startY: curY,
    body: finRows,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 90 },
    },
    theme: 'grid',
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
    margin: { left: 10, right: 10 },
  });
  
  curY = ((doc as any).lastAutoTable?.finalY ?? curY + 30) + 15;
  
  const H = doc.internal.pageSize.getHeight();
  const signatureHeight = 40;
  if (curY + signatureHeight > H - 15) {
      doc.addPage();
      curY = 20;
  }
  
  const signatureStartY = curY;
  
  // ── First Signature Block (Faculty and HOD) ─────────
  const getSigData = (role: string) => {
      if (role === 'Faculty') {
          return { name: applicantName, date: formatDate(form.created_at) };
      }
      const step = form.workflow_progress?.find((s: any) => s.approver_role === role && s.is_completed && s.status === 'approved');
      if (step) {
          const approverName = (step.approver as any)?.full_name || (step.approver as any)?.name || 'Approved';
          return {
              name: approverName,
              date: step.action_date ? new Date(step.action_date).toLocaleString('en-IN') : 'Approved'
          };
      }
      return null;
  };
  
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
      const lineHalfW = Math.min(colW * 0.7, 35) / 2;
      
      const sigData = getSigData(role);
      
      if (sigData) {
          doc.text(sigData.name, cx, y - 2, { align: 'center', maxWidth: colW - 4 });
      }
      
      doc.line(cx - lineHalfW, y, cx + lineHalfW, y);
      
      let displayRole = role;
      if (role === 'Faculty') displayRole = 'Applied By Faculty';
      else if (role === 'HOD') displayRole = 'Approved By HOD';
      else if (role === 'HAA') displayRole = 'Approved By HAA';
      else if (role === 'CFFA') displayRole = 'Approved By CFFA';

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

  drawHorizSigRow(['Faculty', 'HOD', 'HAA'], signatureStartY + 12);
  
  // ── Second Signature Block (CFFA, IQAC, Principal) ─────────
  drawHorizSigRow(['CFFA', 'IQAC', 'Principal'], signatureStartY + 37);
  
  return { signatureStartY, availableTopY: signatureStartY + 50 };
}

export async function generateODPdf(form: StaffRequest): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const logoLeftBase64 = await loadImageBase64(LOGO_LEFT);
  const logoRightBase64 = await loadImageBase64(LOGO_RIGHT);

  const layout = buildMainContent(doc, form, logoLeftBase64, logoRightBase64);

  const proofFiles: any[] = [];
  const rawData = form.form_data || {};
  const schema: Array<any> = form.template?.form_schema || [];
  
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

  const pdfDrawOps: PdfDrawOp[] = [];
  await buildODProofPages(doc, proofFiles, logoLeftBase64, logoRightBase64, layout, pdfDrawOps);

  const totalPages = (doc as any).internal.getNumberOfPages();
  const downloadDateStr = `Downloaded: ${new Date().toLocaleString('en-IN')}`;
  
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    
    doc.text(
      downloadDateStr,
      10,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'left' }
    );
    
    doc.text(
      `Page ${i} of ${totalPages}  |  ${INSTITUTION}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' },
    );
    doc.setTextColor(0, 0, 0);
  }

  const eventTitle = (form.form_data?.event_title || 'od-form').replace(
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
              const [embeddedPage] = await mergedPdf.embedPdf(pdfToEmbed, [0]);
              
              const page = allPages[op.pageIndex];
              const pageHeight = page.getSize().height;
              
              const pt = 2.83465;
              const boxX = op.x * pt;
              const boxY = op.y * pt;
              const boxW = op.width * pt;
              const boxH = op.height * pt;
              
              const scale = Math.min(boxW / embeddedPage.width, boxH / embeddedPage.height);
              const drawW = embeddedPage.width * scale;
              const drawH = embeddedPage.height * scale;
              
              const finalX = boxX + (boxW - drawW) / 2;
              const finalY = pageHeight - boxY - boxH + (boxH - drawH) / 2;
              
              page.drawPage(embeddedPage, { x: finalX, y: finalY, width: drawW, height: drawH });
          } catch (err) {
              console.error('Failed to embed a PDF proof', err);
          }
      }
      
      const finalPdfBytes = await mergedPdf.save();
      const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${eventTitle}_participation_approval.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return;
    } catch (err) {
      console.error('Error embedding PDFs with pdf-lib, falling back to basic jsPDF', err);
    }
  }

  doc.save(`${eventTitle}_participation_approval.pdf`);
}
