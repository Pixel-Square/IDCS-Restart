/**
 * ExportService.ts
 *
 * Handles exporting poster elements to PNG, PDF, and Word (.doc) formats.
 * Uses html2canvas (dynamic import) for raster capture and jsPDF for PDF creation.
 */
import jsPDF from 'jspdf';
import type { CollegeEvent } from '../../../store/eventStore';
import type { BrandingTemplate } from '../../../store/templateStore';

// ── PNG ──────────────────────────────────────────────────────────────────────

/**
 * Export a DOM element as a PNG file download.
 */
export async function exportAsPNG(el: HTMLElement, filename = 'poster.png'): Promise<void> {
  const h2c = await import('html2canvas').catch(() => null);
  if (!h2c) {
    console.warn('html2canvas not available; falling back to alert.');
    alert('html2canvas is required for PNG export. Please install it.');
    return;
  }
  const canvas = await h2c.default(el, { useCORS: true, scale: 2, logging: false });
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

/**
 * Capture a DOM element as a PNG data-URL (no download).
 * Useful for persisting poster previews in the DB.
 */
export async function captureAsPNGDataUrl(el: HTMLElement): Promise<string> {
  const h2c = await import('html2canvas').catch(() => null);
  if (!h2c) return '';
  const canvas = await h2c.default(el, { useCORS: true, scale: 2, logging: false });
  return canvas.toDataURL('image/png');
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/**
 * Export a DOM element as a PDF file download.
 * Falls back to text-only PDF if html2canvas is unavailable.
 */
export async function exportAsPDF(
  el: HTMLElement,
  options: { filename?: string; title?: string } = {},
): Promise<void> {
  const filename = options.filename ?? `${options.title ?? 'poster'}.pdf`;

  const h2c = await import('html2canvas').catch(() => null);
  if (h2c) {
    const canvas = await h2c.default(el, { useCORS: true, scale: 2, logging: false });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pxW = canvas.width;
    const pxH = canvas.height;

    // Choose page orientation based on aspect ratio
    const isLandscape = pxW > pxH;
    const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm' });

    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgAspect  = pxW / pxH;
    const pageAspect = pageWidth / pageHeight;

    let drawW = pageWidth;
    let drawH = pageWidth / imgAspect;
    if (drawH > pageHeight) {
      drawH = pageHeight;
      drawW = pageHeight * imgAspect;
    }
    const offsetX = (pageWidth  - drawW) / 2;
    const offsetY = (pageHeight - drawH) / 2;

    doc.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH);
    doc.save(filename);
    return;
  }

  // Fallback: text-only PDF
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(options.title ?? 'Event Poster', 20, 30);
  doc.setFontSize(11);
  doc.text('(Image capture unavailable — install html2canvas for full export)', 20, 50, { maxWidth: 170 });
  doc.save(filename);
}

// ── Word / .doc ──────────────────────────────────────────────────────────────

function formatDate(dt: string): string {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Export event poster data as an HTML-backed .doc Word file.
 * Optionally incorporates template background via a base64-inlined image.
 */
export function exportAsDoc(
  event: CollegeEvent,
  template?: BrandingTemplate | null,
): void {
  const bgStyle = template?.backgroundDataUrl
    ? `background-image:url('${template.backgroundDataUrl}'); background-size:cover; background-position:center;`
    : 'background: linear-gradient(135deg,#312e81 0%,#7c3aed 50%,#db2777 100%);';

  const guestRows = event.hasChiefGuest && event.chiefGuests.length > 0
    ? event.chiefGuests.map((g) => `
        <tr>
          <td style="padding:6px 12px; font-size:13px; color:#374151;">
            ${g.imageDataUrl ? `<img src="${g.imageDataUrl}" style="width:40px;height:40px;border-radius:50%;margin-right:8px;vertical-align:middle;"/>` : ''}
            ${g.name}
          </td>
        </tr>`).join('')
    : '<tr><td style="padding:6px 12px;color:#9ca3af;font-size:13px;">No chief guests listed</td></tr>';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${event.title}</title></head>
<body style="margin:0;padding:40px;font-family:Arial,sans-serif;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.15);">
    <div style="${bgStyle}padding:40px 36px 32px;">
      <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 8px;letter-spacing:2px;text-transform:uppercase;">Official Event</p>
      <h1 style="color:#fff;font-size:28px;font-weight:900;margin:0 0 4px;line-height:1.2;">${event.title}</h1>
      <hr style="border:none;border-top:2px solid rgba(255,255,255,0.3);margin:16px 0;"/>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:rgba(255,255,255,0.75);font-size:12px;padding:4px 0;width:50%;">📍 Venue</td>
            <td style="color:#fff;font-size:14px;font-weight:bold;padding:4px 0;">${event.venue}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.75);font-size:12px;padding:4px 0;">📅 Date &amp; Time</td>
            <td style="color:#fff;font-size:14px;font-weight:bold;padding:4px 0;">${formatDate(event.dateTime)}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.75);font-size:12px;padding:4px 0;">👥 Coordinators</td>
            <td style="color:#fff;font-size:14px;font-weight:bold;padding:4px 0;">${event.coordinatorCount}</td></tr>
      </table>
    </div>
    ${event.hasChiefGuest ? `
    <div style="padding:24px 36px;background:#fff;">
      <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;">Chief Guest${event.chiefGuests.length > 1 ? 's' : ''}</h3>
      <table style="width:100%;border-collapse:collapse;">${guestRows}</table>
    </div>` : ''}
    <div style="padding:16px 36px;background:#f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;margin:0;text-align:center;">
        Generated by IDCS ERP — Branding Module
      </p>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${event.title.trim().replace(/\s+/g, '_') || 'event_poster'}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}
