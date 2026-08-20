/**
 * generateODPdf.ts
 * Generates a PDF for an approved On Duty form.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

  drawHorizSigRow(['Faculty', 'HOD', 'HAA'], curY);
  curY += 25;
  
  // ── Second Signature Block (CFFA, IQAC, Principal) ─────────
  drawHorizSigRow(['CFFA', 'IQAC', 'Principal'], curY);
  
  return { signatureStartY: curY, availableTopY: curY };
}

export async function generateODPdf(form: StaffRequest): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const logoLeftBase64 = await loadImageBase64(LOGO_LEFT);
  const logoRightBase64 = await loadImageBase64(LOGO_RIGHT);

  buildMainContent(doc, form, logoLeftBase64, logoRightBase64);

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
  doc.save(`${eventTitle}_participation_approval.pdf`);
}
