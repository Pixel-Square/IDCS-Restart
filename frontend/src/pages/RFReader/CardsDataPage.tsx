import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Download, Search, FileText, FileSpreadsheet, Trash2, X, Upload } from 'lucide-react';
import { fetchCardsData, CardDataRow, unassignStaffUID, unassignUID, assignUID, assignStaffUID } from '../../services/idscan';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getCachedMe, getMe } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';

// Assets
import newBannerSrc from '../../assets/new_banner.png';
import krLogoSrc from '../../assets/krlogo.png';
import idcsLogoSrc from '../../assets/idcs-logo.png';

type MeLite = {
  college?: {
    name?: string;
  };
};

function displayUsername(row: CardDataRow): string {
  const u = String((row as any)?.username ?? '').trim();
  return u || row.identifier;
}

/* ——— helpers ——————— */
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
    img.src = b64;
  });
}

function resolveProfileImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBase()}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function RFReaderCardsDataPage() {
  const [me, setMe] = useState<MeLite | null>(() => (getCachedMe() as any) ?? null);
  const [data, setData] = useState<CardDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [photoFilter, setPhotoFilter] = useState('ALL');

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<CardDataRow | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (tooltipRef.current) {
        const x = Math.min(e.clientX, window.innerWidth - 300);
        const y = Math.min(e.clientY, window.innerHeight - 150);
        tooltipRef.current.style.left = `${x}px`;
        tooltipRef.current.style.top = `${y}px`;
      }
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);

  const handleMouseEnter = (row: CardDataRow) => {
    setHoveredRow(row);
  };

  const handleMouseLeave = () => {
    setHoveredRow(null);
  };

  useEffect(() => {
    // Keep header/export details up to date.
    getMe()
      .then((fresh) => setMe((fresh as any) ?? null))
      .catch(() => {});

    fetchCardsData()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const departments = useMemo(() => {
    const depts = new Set(data.map((d) => d.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [data]);

  const byRoleAndIdentifier = useMemo(() => {
    const map = new Map<string, CardDataRow>();
    for (const row of data) {
      const role = String(row.role || '').trim().toUpperCase();
      const identifier = String(row.identifier || '').trim().toUpperCase();
      if (!role || !identifier) continue;
      map.set(`${role}::${identifier}`, row);
    }
    return map;
  }, [data]);

  const normalizeHeader = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  async function handleImportFile(file: File) {
    try {
      setImporting(true);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error('No sheets found in the Excel file');
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error('Failed to read Excel sheet');

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any;
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('Excel sheet is empty');

      // Find the header row (expects: Role, Identifier, RFID UID)
      const headerRowIndex = rows.findIndex((r) => {
        if (!Array.isArray(r)) return false;
        const headers = r.map(normalizeHeader);
        const hasRole = headers.includes('role');
        const hasIdentifier = headers.includes('identifier') || headers.includes('register number') || headers.includes('reg no') || headers.includes('staff id');
        const hasUid = headers.includes('rfid uid') || headers.includes('rfid_uid') || headers.includes('uid');
        return hasRole && hasIdentifier && hasUid;
      });

      if (headerRowIndex < 0) {
        throw new Error('Invalid template. Required headers: Role, Identifier, RFID UID');
      }

      const header = rows[headerRowIndex].map(normalizeHeader);
      const idxRole = header.indexOf('role');
      const idxIdentifier = (() => {
        const candidates = ['identifier', 'register number', 'reg no', 'staff id'];
        for (const c of candidates) {
          const i = header.indexOf(c);
          if (i >= 0) return i;
        }
        return -1;
      })();
      const idxUid = (() => {
        const candidates = ['rfid uid', 'rfid_uid', 'uid'];
        for (const c of candidates) {
          const i = header.indexOf(c);
          if (i >= 0) return i;
        }
        return -1;
      })();

      if (idxRole < 0 || idxIdentifier < 0 || idxUid < 0) {
        throw new Error('Invalid template. Required headers: Role, Identifier, RFID UID');
      }

      const records = rows.slice(headerRowIndex + 1)
        .filter((r) => Array.isArray(r) && r.some((x) => String(x ?? '').trim() !== ''))
        .map((r) => {
          const role = String(r[idxRole] ?? '').trim().toUpperCase();
          const identifier = String(r[idxIdentifier] ?? '').trim();
          const uid = String(r[idxUid] ?? '').trim();
          return { role, identifier, uid };
        })
        .filter((x) => x.role && x.identifier);

      if (records.length === 0) {
        throw new Error('No valid rows found to import');
      }

      const errors: string[] = [];
      let okCount = 0;

      for (const rec of records) {
        const role = rec.role === 'STUDENT' || rec.role === 'STAFF' ? rec.role : '';
        const identifierKey = String(rec.identifier || '').trim().toUpperCase();
        const uid = String(rec.uid || '').trim();

        if (!role) {
          errors.push(`Invalid role for identifier ${rec.identifier}`);
          continue;
        }
        if (!uid) {
          // Treat empty UID as "no change" (template can be partially filled)
          continue;
        }

        const row = byRoleAndIdentifier.get(`${role}::${identifierKey}`);
        if (!row) {
          errors.push(`No match found for ${role} identifier ${rec.identifier}`);
          continue;
        }

        try {
          if (role === 'STUDENT') {
            await assignUID(row.id, uid);
          } else {
            await assignStaffUID(row.id, uid);
          }
          okCount += 1;
        } catch (e: any) {
          errors.push(`${role} ${rec.identifier}: ${String(e?.message || e || 'Failed')}`);
        }
      }

      // Refresh table after import.
      try {
        const refreshed = await fetchCardsData();
        setData(refreshed);
      } catch {
        // ignore refresh failures; user can reload
      }

      const summary = `Import complete. Assigned: ${okCount}. Errors: ${errors.length}.`;
      if (errors.length) {
        window.alert(`${summary}\n\n${errors.slice(0, 20).join('\n')}${errors.length > 20 ? `\n...and ${errors.length - 20} more` : ''}`);
      } else {
        window.alert(summary);
      }
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  function handleImportClick() {
    if (importing) return;
    importInputRef.current?.click();
  }

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (roleFilter !== 'ALL' && row.role !== roleFilter) return false;
      if (deptFilter !== 'ALL' && row.department !== deptFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (photoFilter !== 'ALL') {
        const hasPhoto = Boolean(row.profile_image_url);
        if (photoFilter === 'UPLOADED' && !hasPhoto) return false;
        if (photoFilter === 'NOT_UPLOADED' && hasPhoto) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !String(row.username || '').toLowerCase().includes(q) &&
          !row.identifier.toLowerCase().includes(q) &&
          !(row.rfid_uid || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data, search, roleFilter, deptFilter, statusFilter, photoFilter]);

  // Export PDF
  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const [b64Banner, b64Kr, b64Idcs] = await Promise.all([
        toBase64(newBannerSrc).catch(() => ''),
        toBase64(krLogoSrc).catch(() => ''),
        toBase64(idcsLogoSrc).catch(() => ''),
      ]);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = 210;
      const PH = 297;
      const ML = 10;
      const MR = 10;
      const UW = PW - ML - MR;

      const HEADER_H = 26;
      let curY = 10;

      // Watermark (KR logo) - compute once and apply to all pages for consistency
      const wm = await (async () => {
        if (!b64Kr) return null;
        const { w, h } = await imgSize(b64Kr);
        const wmW = 100;
        const wmH = (h / w) * wmW;
        return { wmW, wmH };
      })();

      const drawHeader = async () => {
        let maxLogoY = curY;
        if (b64Banner) {
          const { w, h } = await imgSize(b64Banner);
          let bh = HEADER_H;
          let bw = (w / h) * bh;
          if (bw > UW - 35) {
            bw = UW - 35;
            bh = (h / w) * bw;
          }
          doc.addImage(b64Banner, 'PNG', ML, curY, bw, bh);
          maxLogoY = Math.max(maxLogoY, curY + bh);
        }
        if (b64Kr) {
          const rawW = 35;
          const rawH = 35;
          const krWg = 17;
          const krHg = (rawH / rawW) * krWg;
          doc.addImage(b64Kr, 'PNG', PW - MR - krWg - 12 - krWg, curY, krWg, krHg);
        }
        if (b64Idcs) {
          const wg = 12;
          const hg = 12;
          doc.addImage(b64Idcs, 'PNG', PW - MR - wg, curY + 2.5, wg, hg);
        }
        curY = maxLogoY + 4;
        doc.setLineWidth(0.3);
        doc.setDrawColor(200, 200, 200);
        doc.line(ML, curY, PW - MR, curY);
        curY += 6;
      };

      const applyWatermarkAllPages = () => {
        if (!b64Kr || !wm) return;
        const pageCount = doc.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) {
          doc.setPage(page);
          const cx = (PW - wm.wmW) / 2;
          const cy = (PH - wm.wmH) / 2;
          doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
          doc.addImage(b64Kr, 'PNG', cx, cy, wm.wmW, wm.wmH);
          doc.setGState(new (doc as any).GState({ opacity: 1 }));
        }
      };

      await drawHeader();

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('RFID Cards Data Report', PW / 2, curY, { align: 'center' });
      curY += 8;

      // Details Table
      doc.setFontSize(10);
      autoTable(doc, {
        startY: curY,
        theme: 'plain',
        tableWidth: 100,
        margin: { left: PW / 2 - 50 },
        styles: { fontSize: 10, cellPadding: 1, textColor: [50, 50, 50] },
        columnStyles: {
          0: { fontStyle: 'bold', minCellWidth: 30 },
          1: { minCellWidth: 70 },
        },
        body: [
          ['Total Users:', `${filteredData.length}`],
          ['College:', me?.college?.name || 'IDCS College'],
          ['Role Filter:', roleFilter],
          ['Date:', new Date().toLocaleDateString('en-GB')],
        ],
      });
      curY = (doc as any).lastAutoTable.finalY + 8;

      const tableData = filteredData.map((row) => [
        row.identifier,
        displayUsername(row),
        row.role,
        row.department || '—',
        row.status,
        row.rfid_uid || '—',
      ]);

      const headers = [['ID / Roll', 'Name', 'Role', 'Department', 'Status', 'RFID UID']];

      autoTable(doc, {
        startY: curY,
        head: headers,
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
      });

      // Ensure watermark is present on page 1 and consistent across all pages.
      applyWatermarkAllPages();

      doc.save('Cards_Data_Report.pdf');
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF');
    }
    setDownloading(false);
    setDownloadModalOpen(false);
  };

  const removeRfid = async (row: CardDataRow) => {
    if (!row.rfid_uid) return;
    const ok = window.confirm(`Remove RFID UID for ${displayUsername(row)}?`);
    if (!ok) return;

    const key = `${row.role}-${row.id}`;
    setRemovingKey(key);
    try {
      if (row.role === 'STUDENT') {
        await unassignUID(row.id);
      } else {
        await unassignStaffUID(row.id);
      }

      setData((prev) =>
        prev.map((r) => {
          if (r.id !== row.id || r.role !== row.role) return r;
          return {
            ...r,
            rfid_uid: null,
            status: 'Not Connected',
          };
        }),
      );
    } catch (e: any) {
      alert(e?.message || 'Failed to remove RFID UID');
    } finally {
      setRemovingKey(null);
    }
  };

  // Export Excel
  const downloadExcel = () => {
    setDownloading(true);
    try {
      // Export a clean import template: Role + Identifier + RFID UID.
      // Identifier must be Register No (student) or Staff ID (staff).
      const wsData: any[][] = [];
      wsData.push(['Role', 'Identifier', 'RFID UID']);

      filteredData.forEach(row => {
        wsData.push([
          row.role,
          row.identifier,
          row.rfid_uid || '',
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'RFID Import Template');
      XLSX.writeFile(wb, 'RFID_Import_Template.xlsx');
    } catch (e) {
      console.error(e);
      alert('Failed to generate Excel');
    }
    setDownloading(false);
    setDownloadModalOpen(false);
  };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50/50 space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin shadow-sm"></div>
        <div className="text-sm font-semibold text-gray-500 animate-[pulse_1.5s_ease-in-out_infinite]">
          Gathering card data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="p-4 bg-red-100 text-red-800 rounded-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-gray-50/50">
      {/* Floating Hover Card */}
      <div
        ref={tooltipRef}
        className="fixed z-50 pointer-events-none p-5 rounded-2xl shadow-2xl bg-white/95 backdrop-blur-sm border border-gray-200 flex flex-col min-w-[280px] w-max"
        style={{
          left: -1000,
          top: -1000,
          transform: `translate(16px, 16px) scale(${hoveredRow ? 1 : 0.95})`,
          opacity: hoveredRow ? 1 : 0,
          transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {hoveredRow && (() => {
          const row = hoveredRow;
          const profileImg = resolveProfileImageUrl(row.profile_image_url);
          const fallback = displayUsername(row).split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
          return (
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden border-2 border-white shadow-md bg-gray-100 flex justify-center items-center">
                {profileImg ? (
                  <img src={profileImg} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-gray-400">{fallback}</span>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-500 tracking-widest uppercase mb-1">{row.role}</span>
                <span className="text-sm font-bold text-gray-900 leading-tight">{displayUsername(row)}</span>
                <span className="text-xs font-semibold text-gray-500 mt-0.5">{row.identifier}</span>
                <span className="text-xs text-gray-400 mt-1">{row.department || '—'}</span>
                <div className="mt-2 text-xs font-bold leading-none">
                  {row.status === 'Connected' ? (
                    <span className="text-emerald-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm"></span> Connected</span>
                  ) : (
                    <span className="text-rose-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-sm"></span> Not Connected</span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cards Data</h1>
          <p className="mt-1 text-sm text-gray-500">View and export RFID card assignments for all users.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <div className="flex items-center gap-3">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                handleImportFile(f).catch((err: any) => {
                  window.alert(String(err?.message || err || 'Import failed'));
                  setImporting(false);
                });
              }}
            />
            <button
              onClick={handleImportClick}
              disabled={importing || downloading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-700 border border-indigo-200 rounded-xl text-sm font-semibold hover:bg-indigo-50 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              title="Import RFID UIDs from Excel template"
            >
              <Upload className="w-4 h-4" />
              {importing ? 'Importing…' : 'Import'}
            </button>
            <button
              onClick={() => setDownloadModalOpen(true)}
              disabled={importing}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Search</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="Search ID, name, UID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full sm:w-48">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Role</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="ALL">All Roles</option>
            <option value="STUDENT">Student</option>
            <option value="STAFF">Staff</option>
          </select>
        </div>
        <div className="w-full sm:w-48">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Department</label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="ALL">All Depts</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-48">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="ALL">All Status</option>
            <option value="Connected">Connected</option>
            <option value="Not Connected">Not Connected</option>
          </select>
        </div>
        <div className="w-full sm:w-48">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Profile Photo</label>
          <select
            value={photoFilter}
            onChange={(e) => setPhotoFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="ALL">All</option>
            <option value="UPLOADED">Uploaded</option>
            <option value="NOT_UPLOADED">Not Uploaded</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Identifier</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Photo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">RFID UID</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                    No records found matching filters.
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  (() => {
                    const key = `${row.role}-${row.id}`;
                    const busy = removingKey === key;
                    const disabled = busy || !row.rfid_uid;
                    const profileImageUrl = resolveProfileImageUrl(row.profile_image_url);
                    const initials = displayUsername(row)
                      .split(' ')
                      .filter(Boolean)
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);
                    return (
                  <tr 
                    key={`${row.role}-${row.id}`} 
                    className="hover:bg-gray-50 transition cursor-pointer"
                    onMouseEnter={() => handleMouseEnter(row)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.role === 'STAFF' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {row.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {row.identifier}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="relative w-9 h-9 hover:scale-110 transition-transform duration-300">
                        <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-600">{initials}</span>
                        </div>
                        {profileImageUrl && (
                          <img
                            src={profileImageUrl}
                            alt={displayUsername(row)}
                            className="absolute inset-0 w-9 h-9 rounded-full object-cover border border-gray-200 shadow-sm"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 hover:text-indigo-600 transition-colors">
                      {String(row.username || '').trim() || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {row.department || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {row.status === 'Connected' ? (
                        <span className="text-green-600 font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Connected
                        </span>
                      ) : (
                        <span className="text-red-500 font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Not Connected
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                      {row.rfid_uid || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => removeRfid(row)}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={row.rfid_uid ? 'Remove RFID UID' : 'No RFID UID assigned'}
                      >
                        <Trash2 className="w-4 h-4" />
                        {busy ? 'Removing…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                    );
                  })()
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-gray-500">
          Showing <span className="font-semibold text-gray-900">{filteredData.length}</span> records
        </div>
      </div>

      {downloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Download Report</h3>
              <button
                onClick={() => !downloading && setDownloadModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-3">
              <button
                disabled={downloading}
                onClick={downloadPdf}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-indigo-100 hover:border-indigo-500 hover:bg-indigo-50 transition group"
              >
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-indigo-900">Download PDF</div>
                  <div className="text-xs text-indigo-600/70 mt-0.5">Formal report layout with logos</div>
                </div>
              </button>

              <button
                disabled={downloading}
                onClick={downloadExcel}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-100 hover:border-emerald-500 hover:bg-emerald-50 transition group"
              >
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-emerald-900">Download Excel</div>
                  <div className="text-xs text-emerald-600/70 mt-0.5">Spreadsheet format for data analysis</div>
                </div>
              </button>

              {downloading && (
                <div className="text-center text-sm text-gray-500 animate-pulse mt-4">
                  Generating report...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
