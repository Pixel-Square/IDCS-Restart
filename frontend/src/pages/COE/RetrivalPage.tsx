import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  clearRetrivalEntries,
  readRetrivalEntries,
  retrivalUpdateEventName,
  RetrivalEntry,
  stageRetrivalApplyPayload,
} from '../../utils/retrivalStore';

export default function RetrivalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<RetrivalEntry[]>([]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');

  useEffect(() => {
    const sync = () => {
      setEntries(readRetrivalEntries());
    };

    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(retrivalUpdateEventName, sync as EventListener);

    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(retrivalUpdateEventName, sync as EventListener);
    };
  }, []);

  const totals = useMemo(() => {
    let records = 0;
    entries.forEach((entry) => {
      records += entry.records.length;
    });
    return { events: entries.length, records };
  }, [entries]);

  const selectedEntryId = searchParams.get('event');

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  useEffect(() => {
    if (!selectedEntryId) return;
    if (entries.some((entry) => entry.id === selectedEntryId)) return;
    setSearchParams({}, { replace: true });
  }, [entries, selectedEntryId, setSearchParams]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) || null,
    [entries, selectedEntryId]
  );

  const selectedColumns = useMemo(() => {
    if (!selectedEntry || selectedEntry.records.length === 0) return [] as string[];
    const first = selectedEntry.records[0] || {};
    return Object.keys(first);
  }, [selectedEntry]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const closePdfPreview = () => {
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPdfPreviewFileName('');
  };

  const previewPdf = (doc: jsPDF, fileName: string) => {
    const blob = doc.output('blob');
    const previewUrl = URL.createObjectURL(blob);
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
    setPdfPreviewFileName(fileName);
  };

  const downloadFromPreview = () => {
    if (!pdfPreviewUrl || !pdfPreviewFileName) return;
    const anchor = document.createElement('a');
    anchor.href = pdfPreviewUrl;
    anchor.download = pdfPreviewFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const buildEntryPdf = (entry: RetrivalEntry) => {
    const columns = entry.records.length > 0 ? Object.keys(entry.records[0]) : [];
    const orientation = columns.length > 6 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;

    const formatPdfCell = (value: unknown) => {
      if (value === null || value === undefined) return '-';
      if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(', ');
      }
      return String(value);
    };

    const addHeaderBlock = () => {
      doc.setFillColor(15, 76, 129);
      doc.roundedRect(margin, margin, pageWidth - margin * 2, 18, 2, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Retrieval Event Report', margin + 4, margin + 7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated: ${formatTime(new Date().toISOString())}`, margin + 4, margin + 13);
      doc.text(`Entry ID: ${entry.id}`, pageWidth - margin - 4, margin + 13, { align: 'right' });
      doc.setTextColor(33, 37, 41);
    };

    const metadataTop = margin + 22;
    const metadataGap = 3;
    const metadataRowHeight = 7;

    addHeaderBlock();

    const metadataRows: Array<[string, string]> = [
      ['Action', `${entry.action} - ${entry.source}`],
      ['Page', entry.page],
      ['Created', formatTime(entry.createdAt)],
      ['Records', String(entry.records.length)],
    ];

    metadataRows.forEach(([label, value], index) => {
      const y = metadataTop + index * (metadataRowHeight + metadataGap);
      doc.setFillColor(245, 248, 252);
      doc.roundedRect(margin, y, pageWidth - margin * 2, metadataRowHeight, 1.5, 1.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 76, 129);
      doc.text(`${label}:`, margin + 3, y + 4.7);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(52, 58, 64);
      const maxTextWidth = pageWidth - margin * 2 - 26;
      const line = doc.splitTextToSize(value || '-', maxTextWidth) as string[];
      doc.text(line[0] || '-', margin + 23, y + 4.7);
    });

    const startY = metadataTop + metadataRows.length * (metadataRowHeight + metadataGap) + 2;
    const tableHeaders = ['#', ...columns];
    const tableBody = entry.records.map((record, index) => [
      String(index + 1),
      ...columns.map((column) => formatPdfCell(record[column])),
    ]);

    autoTable(doc, {
      startY,
      margin: { left: margin, right: margin, bottom: margin + 6 },
      head: [tableHeaders],
      body: tableBody,
      showHead: 'everyPage',
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 1.8,
        overflow: 'linebreak',
        textColor: [44, 52, 64],
        lineColor: [220, 226, 235],
        lineWidth: 0.1,
        valign: 'top',
      },
      headStyles: {
        fillColor: [15, 76, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: {
          halign: 'center',
          cellWidth: 10,
          fontStyle: 'bold',
        },
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(15, 76, 129);
          doc.text('Retrieval Event Report', margin, margin);
          doc.setTextColor(33, 37, 41);
        }

        doc.setDrawColor(220, 226, 235);
        doc.line(margin, pageHeight - margin + 1, pageWidth - margin, pageHeight - margin + 1);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(108, 117, 125);
        doc.text(`Page ${data.pageNumber}`, pageWidth - margin, pageHeight - margin + 5, { align: 'right' });
      },
    });

    return doc;
  };

  const previewEntryPdf = (entry: RetrivalEntry) => {
    const doc = buildEntryPdf(entry);
    const safeSegment = (value: string) => value.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_').toLowerCase();
    const fileName = `retrival_${safeSegment(entry.action)}_${safeSegment(entry.source)}_${safeSegment(entry.id)}.pdf`;
    previewPdf(doc, fileName);
  };

  const getApplyTarget = (entry: RetrivalEntry): { target: 'coe_arrears' | 'coe_students'; route: string } | null => {
    const page = String(entry.page || '').trim().toLowerCase();
    if (page.includes('arrear')) {
      return { target: 'coe_arrears', route: '/coe/arrears' };
    }
    if (page.includes('student')) {
      return { target: 'coe_students', route: '/coe/students' };
    }
    return null;
  };

  const renderValue = (value: unknown) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(', ');
    }
    return String(value);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Retrival</h1>
            <p className="mt-1 text-sm text-gray-600">Deleted and reset data collected from across pages.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Clear all retrival history?')) return;
              clearRetrivalEntries();
            }}
            disabled={entries.length === 0}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
        </div>

        <div className="mt-4 text-sm text-gray-700">
          Events: <span className="font-semibold text-gray-900">{totals.events}</span> | Records: <span className="font-semibold text-gray-900">{totals.records}</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">No retrival records yet.</div>
      ) : !selectedEntry ? (
        <div className="space-y-3">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSearchParams({ event: entry.id })}
              className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-left hover:bg-gray-50"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold uppercase text-gray-900">{entry.action} - {entry.source}</div>
                <div className="text-xs text-gray-500">{formatTime(entry.createdAt)}</div>
              </div>
              <div className="mt-1 text-sm text-gray-600">Page: <span className="font-medium text-gray-800">{entry.page}</span></div>
              <div className="mt-1 text-sm text-gray-600">Records: <span className="font-medium text-gray-800">{entry.records.length}</span></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              className="px-3 py-1.5 rounded-md bg-gray-200 text-gray-800 text-sm font-medium hover:bg-gray-300"
            >
              Back To Events
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase text-gray-900">{selectedEntry.action} - {selectedEntry.source}</div>
              <div className="text-sm text-gray-600 mt-1">Page: <span className="font-medium text-gray-800">{selectedEntry.page}</span></div>
              <div className="text-xs text-gray-500">{formatTime(selectedEntry.createdAt)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => previewEntryPdf(selectedEntry)}
                className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                Preview PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  const applyTarget = getApplyTarget(selectedEntry);
                  if (!applyTarget) return;
                  stageRetrivalApplyPayload({ entry: selectedEntry, target: applyTarget.target });
                  navigate(applyTarget.route);
                }}
                disabled={!getApplyTarget(selectedEntry)}
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-700">Records: <span className="font-semibold text-gray-900">{selectedEntry.records.length}</span></div>

          <div className="mt-3 max-h-[28rem] overflow-auto rounded-md border border-gray-100">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">#</th>
                  {selectedColumns.map((column) => (
                    <th key={column} className="px-3 py-2 text-left font-semibold text-gray-700">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedEntry.records.map((record, idx) => (
                  <tr key={`${selectedEntry.id}-${idx}`}>
                    <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                    {selectedColumns.map((column) => (
                      <td key={`${selectedEntry.id}-${idx}-${column}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {renderValue(record[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pdfPreviewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">PDF Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadFromPreview}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Download PDF
                </button>
                <button
                  onClick={closePdfPreview}
                  className="px-3 py-1.5 rounded-md bg-gray-200 text-gray-800 text-sm font-medium hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="h-[80vh] bg-gray-100">
              <iframe title="Retrival PDF Preview" src={pdfPreviewUrl} className="w-full h-full" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
