import React, { useState, useEffect, useMemo } from 'react';
import Barcode from 'react-barcode';
import JsBarcode from 'jsbarcode';
import {
  Search,
  Filter,
  QrCode,
  Printer,
  Download,
  Users,
  GraduationCap,
  Building2,
  Layers,
  RefreshCw,
  User,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Check,
  FileText,
  X,
  Eye,
  Trash2,
  FolderArchive
} from 'lucide-react';
import { getApiBase } from '../../../services/apiBase';
import { getCachedMe } from '../../../services/auth';
import {
  DisciplineStudent,
  fetchDisciplineStudents,
  exportDisciplineStudentsExcel,
  exportDisciplineStudentsBarcodeZip
} from '../../../services/discipline';

function resolveProfileImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBase()}${url.startsWith('/') ? '' : '/'}${url}`;
}

function getUserDefaultDepartment(): string {
  try {
    const me = getCachedMe();
    const roles: string[] = Array.isArray(me?.roles)
      ? me.roles.map((r: any) => (typeof r === 'string' ? r : r?.name || '')).filter(Boolean)
      : [];
    const rolesUpper = roles.map((r) => r.toUpperCase());
    const isGlobalAdmin = rolesUpper.some((r) =>
      ['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINECOMMITTEEADMIN'].includes(r)
    );
    if (isGlobalAdmin) return 'ALL';

    const dept = me?.profile?.department;
    if (dept) {
      return (typeof dept === 'object' ? (dept.short_name || dept.name || dept.code) : dept) || 'ALL';
    }
  } catch {
    /* ignore */
  }
  return 'ALL';
}

/**
 * Extracts pure numeric barcode string or cleaned digits from student register number.
 */
function extractBarcodeValue(regNo: string): string {
  const clean = String(regNo || '').trim();
  if (!clean) return '000000';
  const digits = clean.replace(/[^0-9]/g, '');
  return digits.length > 0 ? digits : clean;
}

export default function StudentsBarCode() {
  const [students, setStudents] = useState<DisciplineStudent[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Pinned Toolbar Filters — default department auto-selected for HOD, AHOD, and Staff
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>(() => getUserDefaultDepartment());
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');

  // Multi-selection state (stored as set of student IDs or reg_no)
  const [selectedStudentKeys, setSelectedStudentKeys] = useState<Set<string | number>>(new Set());

  // Modal to inspect and review the selected students list
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState<boolean>(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 20;

  // Load real active students from DB via discipline/students/ endpoint
  const loadRealStudents = async () => {
    setLoading(true);
    try {
      const data = await fetchDisciplineStudents({
        department: selectedDept,
        batch: selectedBatch,
        section: selectedSection,
        search: searchQuery,
      });

      setStudents(data.results || []);
      if (data.departments && data.departments.length > 0) {
        setDepartments(data.departments);
      }
      if (data.batches && data.batches.length > 0) {
        setBatches(data.batches);
      }
    } catch (err) {
      console.error('Error fetching real student records from DB:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    setSelectedStudentKeys(new Set()); // Reset selections on filter change
    loadRealStudents();
  }, [selectedDept, selectedBatch, selectedSection]);

  // Handle live search with debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      loadRealStudents();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Derived sections list from currently active students
  const sectionOptions = useMemo(() => {
    const secs = new Set<string>();
    students.forEach((s) => {
      if (s.section) secs.add(s.section);
    });
    return Array.from(secs).sort();
  }, [students]);

  // Pagination Slice
  const totalPages = Math.ceil(students.length / itemsPerPage) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return students.slice(start, start + itemsPerPage);
  }, [students, currentPage]);

  const handlePageChange = (p: number) => {
    if (p >= 1 && p <= totalPages) setCurrentPage(p);
  };

  // ── Selected Students Object Array ──
  const selectedStudentsList = useMemo(() => {
    return students.filter(
      (s) =>
        selectedStudentKeys.has(s.id) ||
        selectedStudentKeys.has(s.reg_no) ||
        selectedStudentKeys.has(String(s.id))
    );
  }, [students, selectedStudentKeys]);

  // ── Selection Handlers ──
  const isAllSelected = students.length > 0 && selectedStudentKeys.size === students.length;
  const isPageSelected =
    paginatedStudents.length > 0 &&
    paginatedStudents.every(
      (s) =>
        selectedStudentKeys.has(s.id) ||
        selectedStudentKeys.has(s.reg_no) ||
        selectedStudentKeys.has(String(s.id))
    );

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedStudentKeys(new Set());
    } else {
      const allKeys = new Set<string | number>(students.map((s) => s.id || s.reg_no));
      setSelectedStudentKeys(allKeys);
    }
  };

  const handleToggleSelectPage = () => {
    const next = new Set(selectedStudentKeys);
    if (isPageSelected) {
      paginatedStudents.forEach((s) => {
        next.delete(s.id);
        next.delete(s.reg_no);
        next.delete(String(s.id));
      });
    } else {
      paginatedStudents.forEach((s) => next.add(s.id || s.reg_no));
    }
    setSelectedStudentKeys(next);
  };

  const handleToggleStudent = (key: string | number) => {
    const next = new Set(selectedStudentKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedStudentKeys(next);
  };

  const handleRemoveFromSelected = (studentKey: string | number) => {
    const next = new Set(selectedStudentKeys);
    next.delete(studentKey);
    setSelectedStudentKeys(next);
  };

  // ── Render Barcode image as Data URL using JsBarcode on an offscreen canvas ──
  const getBarcodeDataUrl = (value: string): string => {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 12,
        textMargin: 2,
        margin: 4,
        width: 1.5,
        height: 40,
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error generating barcode canvas:', e);
      return '';
    }
  };

  // ── Export to PDF with actual rendered Barcode Images ──
  const handleExportPdfWithBarcodes = async () => {
    const targetStudents =
      selectedStudentKeys.size > 0 ? selectedStudentsList : students;

    if (targetStudents.length === 0) {
      alert('No students selected to export.');
      return;
    }

    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Title & Headers
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(30, 41, 59);
      doc.text('Discipline Committee - Student Barcode Directory', 14, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const filterSummary = `Dept: ${selectedDept} | Batch: ${selectedBatch} | Sec: ${selectedSection} | Total: ${targetStudents.length} Students`;
      doc.text(filterSummary, 14, 22);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });

      // Table Rows
      const tableData = targetStudents.map((st, idx) => {
        const barcodeVal = extractBarcodeValue(st.reg_no);
        return [
          idx + 1,
          st.name || st.username,
          st.reg_no,
          st.department || '-',
          `${st.batch || '-'}${st.section ? ` (${st.section})` : ''}`,
          barcodeVal,
        ];
      });

      // Render table with autoTable
      // @ts-ignore
      autoTable(doc, {
        head: [['#', 'Student Name', 'Register Number', 'Department', 'Batch / Sec', 'Barcode (CODE128)']],
        body: tableData,
        startY: 26,
        theme: 'grid',
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left',
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: [30, 41, 59],
          minCellHeight: 16,
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 46 },
          2: { cellWidth: 36, fontStyle: 'bold' },
          3: { cellWidth: 26 },
          4: { cellWidth: 24 },
          5: { cellWidth: 40, halign: 'center' },
        },
        didDrawCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 5) {
            const rowIdx = data.row.index;
            const st = targetStudents[rowIdx];
            if (st) {
              const bVal = extractBarcodeValue(st.reg_no);
              const bImg = getBarcodeDataUrl(bVal);
              if (bImg) {
                const cellW = data.cell.width;
                const cellH = data.cell.height;
                const imgW = 34;
                const imgH = 12;
                const imgX = data.cell.x + (cellW - imgW) / 2;
                const imgY = data.cell.y + (cellH - imgH) / 2;
                doc.addImage(bImg, 'PNG', imgX, imgY, imgW, imgH);
              }
            }
          }
        },
        margin: { left: 14, right: 14, bottom: 14 },
      });

      const filename = `student_barcodes_${selectedDept}_${targetStudents.length}_${Date.now()}.pdf`;
      doc.save(filename);
    } catch (e) {
      console.error('Error generating PDF with barcodes:', e);
      alert('Failed to generate PDF. Exporting as Excel instead.');
      handleExportExcel();
    }
  };

  // ── Export Selected (or All) Students to Excel with embedded Barcode images ──
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [exportingZip, setExportingZip] = useState<boolean>(false);

  const handleExportExcel = async () => {
    const targetStudents =
      selectedStudentKeys.size > 0 ? selectedStudentsList : students;

    if (targetStudents.length === 0) {
      alert('No students available to export.');
      return;
    }

    setExportingExcel(true);
    try {
      const studentIds = targetStudents.map((s) => s.id).filter(Boolean);
      const regNos = targetStudents.map((s) => s.reg_no).filter(Boolean);

      const blob = await exportDisciplineStudentsExcel({
        student_ids: studentIds.length > 0 ? studentIds : undefined,
        reg_nos: studentIds.length === 0 ? regNos : undefined,
        department: selectedDept !== 'ALL' ? selectedDept : undefined,
        batch: selectedBatch !== 'ALL' ? selectedBatch : undefined,
        section: selectedSection !== 'ALL' ? selectedSection : undefined,
        search: searchQuery || undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        selectedStudentKeys.size > 0
          ? `selected_students_barcodes_${targetStudents.length}_${Date.now()}.xlsx`
          : `discipline_students_barcodes_${selectedDept}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export Excel with barcodes:', err);
      alert('Failed to generate Excel file with barcode images. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Export Separate Cropped Barcode Images as ZIP (Pure Barcode Bars Only, No Text) ──
  const handleExportZipWithBarcodeImages = async () => {
    const targetStudents =
      selectedStudentKeys.size > 0 ? selectedStudentsList : students;

    if (targetStudents.length === 0) {
      alert('No students available to export.');
      return;
    }

    setExportingZip(true);
    try {
      // 1. First attempt direct client-side generation to ensure 100% exact match with onscreen barcodes
      // Import JSZip dynamically or build via blobs
      let jszipModule: any = null;
      try {
        // @ts-ignore
        jszipModule = (window as any).JSZip;
      } catch (_) {}

      // If JSZip isn't in window, try loading it or use backend
      if (!jszipModule) {
        try {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
          document.head.appendChild(script);
          await new Promise((resolve) => {
            script.onload = resolve;
            script.onerror = resolve;
          });
          // @ts-ignore
          jszipModule = (window as any).JSZip;
        } catch (_) {}
      }

      if (jszipModule) {
        const zip = new jszipModule();

        for (const st of targetStudents) {
          const regNo = String(st.reg_no || '').trim() || `student_${st.id}`;
          const barcodeValue = extractBarcodeValue(regNo);

          // Render pure barcode on canvas (no text, pure bars)
          const canvas = document.createElement('canvas');
          try {
            JsBarcode(canvas, barcodeValue, {
              format: 'CODE128',
              displayValue: false, // Pure barcode bars ONLY, no text
              margin: 6,
              width: 2,
              height: 60,
              background: '#ffffff',
              lineColor: '#000000',
            });

            // Convert canvas to binary blob
            const dataUrl = canvas.toDataURL('image/png');
            const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
            const safeRegNo = regNo.replace(/[^a-zA-Z0-9_-]/g, '_');
            zip.file(`${safeRegNo}.png`, base64Data, { base64: true });
          } catch (err) {
            console.warn(`Failed to render barcode for ${regNo}`, err);
          }
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          selectedStudentKeys.size > 0
            ? `student_barcodes_images_${targetStudents.length}_${Date.now()}.zip`
            : `student_barcodes_images_${selectedDept}_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return;
      }

      // Fallback: Backend export
      const studentIds = targetStudents.map((s) => s.id).filter(Boolean);
      const regNos = targetStudents.map((s) => s.reg_no).filter(Boolean);

      const blob = await exportDisciplineStudentsBarcodeZip({
        student_ids: studentIds.length > 0 ? studentIds : undefined,
        reg_nos: studentIds.length === 0 ? regNos : undefined,
        department: selectedDept !== 'ALL' ? selectedDept : undefined,
        batch: selectedBatch !== 'ALL' ? selectedBatch : undefined,
        section: selectedSection !== 'ALL' ? selectedSection : undefined,
        search: searchQuery || undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        selectedStudentKeys.size > 0
          ? `student_barcodes_images_${targetStudents.length}_${Date.now()}.zip`
          : `student_barcodes_images_${selectedDept}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export barcode images ZIP:', err);
      alert('Failed to generate barcode images ZIP file. Please try again.');
    } finally {
      setExportingZip(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col">
      {/* ── PINNED TOOLBAR ── */}
      <div className="sticky top-[120px] z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs px-6 py-4">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 leading-tight">
                    Discipline Student Barcode Directory
                  </h1>
                  <p className="text-xs text-slate-500">
                    Real active student database records with automatic numeric barcode generation & multi-select export.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={loadRealStudents}
                disabled={loading}
                className="p-2 text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Refresh Students from DB"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                <span className="hidden sm:inline">Refresh DB</span>
              </button>

              <button
                onClick={handleExportPdfWithBarcodes}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm shadow-indigo-200 cursor-pointer"
                title="Export with actual visual barcode graphics into a printable PDF document"
              >
                <FileText className="w-4 h-4" />
                <span>
                  {selectedStudentKeys.size > 0
                    ? `Export PDF (${selectedStudentKeys.size}) with Barcodes`
                    : 'Export PDF with Barcodes'}
                </span>
              </button>

              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm shadow-emerald-200 cursor-pointer disabled:opacity-60"
                title="Export Excel spreadsheet with embedded barcode graphics"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>
                  {exportingExcel
                    ? 'Generating Excel...'
                    : selectedStudentKeys.size > 0
                    ? `Export Excel (${selectedStudentKeys.size}) with Barcodes`
                    : 'Export Excel with Barcodes'}
                </span>
              </button>

              {/* ZIP IMAGES EXPORT BUTTON */}
              <button
                onClick={handleExportZipWithBarcodeImages}
                disabled={exportingZip}
                className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm shadow-indigo-200 cursor-pointer disabled:opacity-60"
                title="Export separate cropped barcode PNG images named by register number (no text, barcode only) in a ZIP archive"
              >
                <FolderArchive className="w-4 h-4" />
                <span>
                  {exportingZip
                    ? 'Generating ZIP...'
                    : selectedStudentKeys.size > 0
                    ? `Export ZIP Images (${selectedStudentKeys.size})`
                    : 'Export ZIP Images'}
                </span>
              </button>

              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Barcodes</span>
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search real students (name, reg no, username)..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>

            {/* Department Filter */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition">
              <Building2 className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setSelectedSection('ALL');
                }}
                className="w-full bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Filter */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition">
              <GraduationCap className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <select
                value={selectedBatch}
                onChange={(e) => {
                  setSelectedBatch(e.target.value);
                  setSelectedSection('ALL');
                }}
                className="w-full bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Batches</option>
                {batches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition">
              <Layers className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Sections</option>
                {sectionOptions.map((s) => (
                  <option key={s} value={s}>
                    Section {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl w-full mx-auto p-6 sm:p-8 space-y-4">
        {/* Count and Multi-Select Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Select All Checkbox Action */}
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 select-none">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
              />
              <span>Select All ({students.length})</span>
            </label>

            {/* Select Current Page Checkbox Action */}
            <button
              onClick={handleToggleSelectPage}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition cursor-pointer"
            >
              {isPageSelected ? 'Deselect Page' : 'Select Current Page'}
            </button>

            {selectedStudentKeys.size > 0 && (
              <button
                onClick={() => setIsSelectionModalOpen(true)}
                className="font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-xl flex items-center gap-2 transition active:scale-95 cursor-pointer shadow-2xs"
                title="Click to view full list of selected students"
              >
                <Check className="w-3.5 h-3.5 text-indigo-600" />
                <span>{selectedStudentKeys.size} Students Selected</span>
                <Eye className="w-3.5 h-3.5 text-indigo-500 ml-0.5" />
                <span className="text-[10px] uppercase font-bold text-indigo-500">(View List)</span>
              </button>
            )}
          </div>

          <div className="text-slate-500 font-medium">
            Page <span className="font-bold text-slate-800">{currentPage}</span> of{' '}
            <span className="font-bold text-slate-800">{totalPages}</span> ({students.length} Total Students)
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-xs">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">Querying Database Student Records...</h3>
            <p className="text-xs text-slate-400 mt-1">Fetching active student profiles, avatars, and generating barcodes</p>
          </div>
        ) : students.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-xs">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Student Records Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              No matching records found in the database. Try adjusting your search query or department filters.
            </p>
          </div>
        ) : (
          /* Students Table with Selectable Checkboxes */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isPageSelected}
                        onChange={handleToggleSelectPage}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        title="Select/Deselect Page"
                      />
                    </th>
                    <th className="py-3.5 px-4 w-16 text-center">Profile</th>
                    <th className="py-3.5 px-4">Student Info</th>
                    <th className="py-3.5 px-4">Username</th>
                    <th className="py-3.5 px-4">Register Number</th>
                    <th className="py-3.5 px-4">Academic Dept / Section</th>
                    <th className="py-3.5 px-4 text-center">Barcode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {paginatedStudents.map((st) => {
                    const studentKey = st.id || st.reg_no;
                    const isSelected =
                      selectedStudentKeys.has(st.id) ||
                      selectedStudentKeys.has(st.reg_no) ||
                      selectedStudentKeys.has(String(st.id));
                    const barcodeValue = extractBarcodeValue(st.reg_no);
                    const avatarUrl = resolveProfileImageUrl(st.profile_image_url);

                    return (
                      <tr
                        key={studentKey}
                        onClick={() => handleToggleStudent(studentKey)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Selectable Checkbox */}
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleStudent(studentKey)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                          />
                        </td>

                        {/* Profile Image */}
                        <td className="py-3 px-4 text-center">
                          <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={st.name || st.username}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <User className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                        </td>

                        {/* Name & Basic Info */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {st.name || st.username}
                          </div>
                          {st.email && (
                            <div className="text-[11px] text-slate-400 mt-0.5">{st.email}</div>
                          )}
                        </td>

                        {/* Username */}
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-md font-semibold">
                            {st.username || '-'}
                          </span>
                        </td>

                        {/* Register Number */}
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900 text-xs">
                            {st.reg_no || '-'}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Digits: {barcodeValue}
                          </span>
                        </td>

                        {/* Department & Section */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">
                            {st.department || 'General'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {st.batch ? `Batch: ${st.batch}` : ''}{' '}
                            {st.section ? `• Sec: ${st.section}` : ''}
                          </div>
                        </td>

                        {/* Barcode Column */}
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex flex-col items-center justify-center p-2 bg-white rounded-xl border border-slate-100 shadow-2xs group-hover:border-indigo-200 transition">
                            <Barcode
                              value={barcodeValue}
                              format="CODE128"
                              width={1.2}
                              height={36}
                              displayValue={true}
                              fontSize={11}
                              margin={0}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-t border-slate-200 text-xs print:hidden">
                <span className="text-slate-500">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(currentPage * itemsPerPage, students.length)} of{' '}
                  {students.length} students
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = currentPage - 3 + i;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 rounded-lg font-semibold text-xs transition cursor-pointer ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SELECTED STUDENTS LIST MODAL ── */}
      {isSelectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Selected Students ({selectedStudentsList.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review and verify students selected for barcode document export.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsSelectionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Selected Students */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {selectedStudentsList.map((st, idx) => {
                const bVal = extractBarcodeValue(st.reg_no);
                const stKey = st.id || st.reg_no;
                return (
                  <div
                    key={stKey}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50/40 rounded-xl border border-slate-200/80 transition text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center font-bold text-slate-400">{idx + 1}</span>
                      <div>
                        <div className="font-bold text-slate-900">{st.name || st.username}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {st.reg_no} • {st.department || 'Dept'}{' '}
                          {st.section ? `(Sec ${st.section})` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-mono font-bold text-indigo-700 text-xs">
                        {bVal}
                      </div>

                      <button
                        onClick={() => handleRemoveFromSelected(stKey)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Remove from selection"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedStudentKeys(new Set());
                  setIsSelectionModalOpen(false);
                }}
                className="px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Clear All Selections
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsSelectionModalOpen(false);
                    handleExportPdfWithBarcodes();
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-200"
                >
                  <FileText className="w-4 h-4" />
                  <span>Export PDF ({selectedStudentsList.length})</span>
                </button>

                <button
                  onClick={() => {
                    setIsSelectionModalOpen(false);
                    handleExportExcel();
                  }}
                  disabled={exportingExcel}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-200 disabled:opacity-60"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{exportingExcel ? 'Generating Excel...' : 'Export Excel'}</span>
                </button>

                <button
                  onClick={() => {
                    setIsSelectionModalOpen(false);
                    handleExportZipWithBarcodeImages();
                  }}
                  disabled={exportingZip}
                  className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-200 disabled:opacity-60"
                >
                  <FolderArchive className="w-4 h-4" />
                  <span>{exportingZip ? 'Generating ZIP...' : `Export ZIP (${selectedStudentsList.length})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
