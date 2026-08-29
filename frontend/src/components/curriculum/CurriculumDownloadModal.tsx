import React, { useState, useMemo } from 'react';
import { X, FileText, FileSpreadsheet, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable, { applyPlugin } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import fetchWithAuth from '../../services/fetchAuth';

// Explicitly register the autotable plugin with jsPDF
applyPlugin(jsPDF);

interface CurriculumDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
  schemas: any[];
  batchYears: any[];
  departments?: any[];
  type: 'master' | 'department';
}

export default function CurriculumDownloadModal({
  isOpen,
  onClose,
  data,
  schemas,
  batchYears,
  departments = [],
  type
}: CurriculumDownloadModalProps) {
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv'>('excel');
  const [regulation, setRegulation] = useState<string>('all');
  const [semester, setSemester] = useState<string>('all');
  const [batchId, setBatchId] = useState<string>('all');
  const [departmentId, setDepartmentId] = useState<string>('all');
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const validDeptIds = useMemo(() => {
    if (!departments || departments.length === 0) return null;
    return new Set(departments.map(d => String(d.id)));
  }, [departments]);

  const uniqueRegs = useMemo(() => Array.from(new Set(data.map(d => d.regulation).filter(Boolean))), [data]);
  const uniqueSems = useMemo(() => Array.from(new Set(data.map(d => d.semester).filter(Boolean))).sort((a: any, b: any) => a - b), [data]);
  
  const uniqueDepts = useMemo(() => {
    if (type !== 'department') return [];
    if (departments && departments.length > 0) {
      return departments.map(d => ({
        id: String(d.id),
        name: d.short_name || d.code || d.name
      }));
    }
    const deptsMap = new Map();
    data.forEach(d => {
      if (d.department && d.department.id) {
        deptsMap.set(String(d.department.id), d.department.short_name || d.department.code || d.department.name);
      }
    });
    return Array.from(deptsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [data, departments, type]);
  
  if (!isOpen) return null;

  const handleDownload = async () => {
    setErrorAlert(null);
    setIsDownloading(true);

    try {
      // Filter data
      const filteredData = data.filter(row => {
        const rowBatchId = row?.batch?.id ?? row?.batch_id ?? null;
        if (regulation !== 'all' && row.regulation !== regulation) return false;
        if (semester !== 'all' && String(row.semester) !== semester) return false;
        if (batchId !== 'all' && String(rowBatchId) !== batchId) return false;
        if (type === 'department') {
          if (validDeptIds && row?.department?.id && !validDeptIds.has(String(row.department.id))) {
            return false;
          }
          if (departmentId !== 'all' && String(row?.department?.id) !== departmentId) return false;
        }
        return true;
      });

      if (filteredData.length === 0) {
        setErrorAlert('No data matches the selected filters.');
        setIsDownloading(false);
        return;
      }

      // ─── Schema visibility resolution ────────────────────────────────────────
      // Strictly mirrors what is shown on screen via the "Manage Dept Fields" feature.
      // Rules applied (in order):
      //   1. Field must be is_active=true (globally active — respects master hidden toggle)
      //   2. For department curriculum: field scope must be 'department' or 'both'
      //   3. For department curriculum: field must NOT be in hidden_for_department_ids
      //      for the relevant department(s) — respects per-dept hidden toggle
      //   4. For master curriculum: field scope must be 'master' or 'both'
      // When "All Departments" is selected, a field is only exported if it is visible
      // for EVERY department present in the filtered data (strictest intersection).
      // This applies even for super admin logins.
      const resolveVisibleSchemas = (deptIdStr: string): any[] => {
        if (type === 'master') {
          // Master: only is_active + master/both scope
          return schemas.filter(c =>
            c.is_active !== false &&
            (c.scope === 'master' || c.scope === 'both')
          );
        }

        // Department curriculum
        const baseSchemas = schemas.filter(c =>
          c.is_active !== false &&
          (c.scope === 'department' || c.scope === 'both')
        );

        if (deptIdStr !== 'all') {
          // Single department selected — strictly apply its hidden fields
          const deptIdNum = Number(deptIdStr);
          return baseSchemas.filter(c => {
            const hiddenFor: number[] = c.hidden_for_department_ids || [];
            return !hiddenFor.includes(deptIdNum);
          });
        }

        // "All departments" — compute the set of dept IDs in filtered data
        const presentDeptIds = Array.from(
          new Set(filteredData.map((r: any) => Number(r?.department?.id)).filter(Boolean))
        ) as number[];

        if (presentDeptIds.length === 0) return baseSchemas;

        // Keep only fields that are visible in EVERY represented department
        // (a field hidden for any one dept is excluded from the combined export)
        return baseSchemas.filter(c => {
          const hiddenFor: number[] = c.hidden_for_department_ids || [];
          return !presentDeptIds.some(id => hiddenFor.includes(id));
        });
      };

      const visibleSchemas = resolveVisibleSchemas(departmentId);

      const isFieldVisible = (key: string) => visibleSchemas.some(c => c.key === key);
      const showCourseName = isFieldVisible('course_name');
      const showElective = isFieldVisible('is_elective');
      const mappedSchemas = visibleSchemas.filter(c => c.key !== 'course_name' && c.key !== 'is_elective');
      // ─────────────────────────────────────────────────────────────────────────

      // Headers
      const headers = type === 'department' ? ['Department', 'Code', 'Sem', 'Batch'] : ['Code', 'Sem', 'Batch'];
      if (showCourseName) headers.push('Course');
      if (showElective) headers.push('Elective');
      mappedSchemas.forEach(c => headers.push(c.label || c.key));
      if (type === 'master') {
        headers.push('Depts');
      }

      // Helper to build array of cell strings for a row
      const buildRowData = (row: any) => {
        const rowBatchName = row.batch ? row.batch.name : '-';
        const rowData: string[] = [];

        if (type === 'department') {
          const deptName = row.department ? (row.department.short_name || row.department.code || row.department.name) : '-';
          rowData.push(deptName);
        }

        rowData.push(
          row.course_code || '-',
          row.semester != null ? String(row.semester) : '-',
          rowBatchName
        );
        
        if (showCourseName) {
          rowData.push((row.dynamic_data || {}).course_name ?? row.course_name ?? '-');
        }
        
        if (showElective) {
          rowData.push(row.is_elective ? 'Yes' : 'No');
        }

        mappedSchemas.forEach(c => {
          const rawVal = c.is_core ? row[c.key] : (row.dynamic_data || {})[c.key];
          if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
            if (c.data_type === 'bool') {
              rowData.push((rawVal === true || rawVal === 'true' || rawVal === 1) ? 'Yes' : 'No');
            } else {
              rowData.push(String(rawVal));
            }
          } else {
            rowData.push(c.data_type === 'bool' ? 'No' : '-');
          }
        });

        if (type === 'master') {
          const deps = row.for_all_departments 
            ? 'ALL' 
            : ((row.departments_display || []).map((d: any) => d.short_name || d.code || d.name).join(', ') || 'No Depts');
          rowData.push(deps);
        }

        return rowData;
      };

      // Group rows by semester
      const semesterGroups: { [sem: string]: any[] } = {};
      filteredData.forEach(row => {
        const s = row.semester != null ? String(row.semester) : 'Unassigned';
        if (!semesterGroups[s]) semesterGroups[s] = [];
        semesterGroups[s].push(row);
      });

      const sortedSemKeys = Object.keys(semesterGroups).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });

      let deptNameLabel = '';
      let deptFileNamePart = '';
      if (type === 'department') {
         if (departmentId !== 'all') {
            const selectedDept = uniqueDepts.find(d => String(d.id) === departmentId);
            if (selectedDept) {
               deptNameLabel = selectedDept.name;
               deptFileNamePart = `_${selectedDept.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            } else {
               deptNameLabel = 'Department';
            }
         } else {
            deptNameLabel = 'All Departments';
            deptFileNamePart = '_All_Departments';
         }
      }

      const fileName = `${type}_curriculum_${regulation}_${semester}_${batchId}${deptFileNamePart}`;

      if (format === 'csv') {
        const allTableData = filteredData.map(buildRowData);
        const csvContent = [
          headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
          ...allTableData.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${fileName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
      } else if (format === 'excel') {
        const wb = XLSX.utils.book_new();

        if (type === 'department') {
          // Group rows by department, ordered by college's departments if available
          const deptGroupsMap = new Map<string, { name: string; rows: any[] }>();

          // Pre-populate keys in the order of the college's departments
          if (departments && departments.length > 0) {
            departments.forEach(d => {
              const dId = String(d.id);
              const name = d.short_name || d.code || d.name;
              deptGroupsMap.set(dId, { name, rows: [] });
            });
          }

          filteredData.forEach(row => {
            if (!row.department || !row.department.id) return;
            const dId = String(row.department.id);
            if (validDeptIds && !validDeptIds.has(dId)) return;

            const name = row.department.short_name || row.department.code || row.department.name || `Dept ${dId}`;
            if (!deptGroupsMap.has(dId)) {
              deptGroupsMap.set(dId, { name, rows: [] });
            }
            deptGroupsMap.get(dId)!.rows.push(row);
          });

          // Only keep departments that actually have filtered rows
          const activeDepts = Array.from(deptGroupsMap.values()).filter(g => g.rows.length > 0);

          if (activeDepts.length > 1 || (departmentId === 'all' && activeDepts.length > 0)) {
            // 1. All Departments sheet
            const allTableData = filteredData.map(buildRowData);
            const wsAll = XLSX.utils.aoa_to_sheet([headers, ...allTableData]);
            XLSX.utils.book_append_sheet(wb, wsAll, "All Departments");

            // 2. Individual Department sheets
            const usedSheetNames = new Set<string>(["all departments"]);

            activeDepts.forEach(deptGroup => {
              const wsDept = XLSX.utils.aoa_to_sheet([headers, ...deptGroup.rows.map(buildRowData)]);

              let safeName = deptGroup.name.replace(/[:\\/?*\[\]]/g, '_').trim().slice(0, 31);
              if (!safeName) safeName = "Dept";

              let finalSheetName = safeName;
              let counter = 1;
              while (usedSheetNames.has(finalSheetName.toLowerCase())) {
                const suffix = `_${counter}`;
                finalSheetName = `${safeName.slice(0, 31 - suffix.length)}${suffix}`;
                counter++;
              }
              usedSheetNames.add(finalSheetName.toLowerCase());

              XLSX.utils.book_append_sheet(wb, wsDept, finalSheetName);
            });
          } else if (sortedSemKeys.length > 1) {
            // Single department, multiple semesters
            const allTableData = filteredData.map(buildRowData);
            const wsAll = XLSX.utils.aoa_to_sheet([headers, ...allTableData]);
            const mainSheetName = (activeDepts[0]?.name || "All Semesters").replace(/[:\\/?*\[\]]/g, '_').trim().slice(0, 31);
            XLSX.utils.book_append_sheet(wb, wsAll, mainSheetName || "All Semesters");

            sortedSemKeys.forEach(semKey => {
              const semRows = semesterGroups[semKey];
              const semTableData = semRows.map(buildRowData);
              const wsSem = XLSX.utils.aoa_to_sheet([headers, ...semTableData]);
              const sheetName = `Sem ${semKey}`.slice(0, 31);
              XLSX.utils.book_append_sheet(wb, wsSem, sheetName);
            });
          } else {
            // Single department, single semester
            const tableData = filteredData.map(buildRowData);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...tableData]);
            const rawName = activeDepts[0]?.name || (semester !== 'all' ? `Sem ${semester}` : "Curriculum");
            const sheetName = rawName.replace(/[:\\/?*\[\]]/g, '_').trim().slice(0, 31) || "Curriculum";
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
          }
        } else {
          // Master Curriculum: Group by Semester
          if (sortedSemKeys.length > 1) {
            // 1. All Semesters sheet
            const allTableData = filteredData.map(buildRowData);
            const wsAll = XLSX.utils.aoa_to_sheet([headers, ...allTableData]);
            XLSX.utils.book_append_sheet(wb, wsAll, "All Semesters");

            // 2. Individual Semester sheets
            sortedSemKeys.forEach(semKey => {
              const semRows = semesterGroups[semKey];
              const semTableData = semRows.map(buildRowData);
              const wsSem = XLSX.utils.aoa_to_sheet([headers, ...semTableData]);
              const sheetName = `Sem ${semKey}`.slice(0, 31);
              XLSX.utils.book_append_sheet(wb, wsSem, sheetName);
            });
          } else {
            // Single semester
            const tableData = filteredData.map(buildRowData);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...tableData]);
            const sheetName = semester !== 'all' ? `Sem ${semester}` : (sortedSemKeys[0] ? `Sem ${sortedSemKeys[0]}` : "Curriculum");
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
          }
        }

        XLSX.writeFile(wb, `${fileName}.xlsx`);
        onClose();
      } else if (format === 'pdf') {
        // Fetch college details for logo and banner
        let collegeId = localStorage.getItem('selectedCollegeId') || '';
        if (!collegeId) {
          try {
            const listRes = await fetchWithAuth('/api/college/colleges/');
            if (listRes.ok) {
              const listData = await listRes.json();
              const colleges = Array.isArray(listData) ? listData : (listData.results || []);
              if (colleges.length > 0) {
                collegeId = String(colleges[0].id);
              }
            }
          } catch (_) {}
        }

        if (!collegeId) {
          setErrorAlert('Unable to determine college context for PDF header.');
          setIsDownloading(false);
          return;
        }

        const res = await fetchWithAuth(`/api/college/colleges/${collegeId}/`);
        if (!res.ok) {
          setErrorAlert('Failed to fetch college details for the PDF template.');
          setIsDownloading(false);
          return;
        }
        
        const college = await res.json();
        
        if (!college.logo_url || !college.banner_url) {
          setErrorAlert('Please contact the college admin to update the college logo and banner.');
          setIsDownloading(false);
          return;
        }

        // Load image as Data URL with natural dimensions
        const loadImageWithDetails = (url: string): Promise<{ dataUrl: string; w: number; h: number }> =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0);
                resolve({
                  dataUrl: canvas.toDataURL('image/png'),
                  w: img.naturalWidth || img.width || 1,
                  h: img.naturalHeight || img.height || 1,
                });
              } catch (e) {
                reject(e);
              }
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
          });

        const [logoInfo, bannerInfo] = await Promise.all([
          loadImageWithDetails(college.logo_url),
          loadImageWithDetails(college.banner_url),
        ]);

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth(); // 297 mm
        const marginX = 14;
        const headerY = 10;
        const maxH = 24; // mm

        // Helper to draw college header
        const drawHeader = () => {
          const logoRatio = logoInfo.w / logoInfo.h;
          const logoH = maxH;
          const logoW = logoH * logoRatio;
          doc.addImage(logoInfo.dataUrl, 'PNG', marginX, headerY, logoW, logoH);

          const bannerGap = 6;
          const bannerStartX = marginX + logoW + bannerGap;
          const availBannerW = pageWidth - marginX - bannerStartX;
          const bannerRatio = bannerInfo.w / bannerInfo.h;
          let bannerH = maxH;
          let bannerW = bannerH * bannerRatio;

          if (bannerW > availBannerW) {
            bannerW = availBannerW;
            bannerH = bannerW / bannerRatio;
          }

          const bannerY = headerY + (maxH - bannerH) / 2;
          doc.addImage(bannerInfo.dataUrl, 'PNG', bannerStartX, bannerY, bannerW, bannerH);

          const lineY = headerY + maxH + 3;
          doc.setDrawColor(203, 213, 225); // slate-300
          doc.setLineWidth(0.5);
          doc.line(marginX, lineY, pageWidth - marginX, lineY);
          return lineY + 6;
        };

        let isFirstPage = true;

        sortedSemKeys.forEach((semKey) => {
          if (!isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;

          let curY = drawHeader();

          // Title & Semester Header
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 41, 59); // slate-800
          const pdfTitle = type === 'master' ? 'Master Curriculum' : `${deptNameLabel} Curriculum`;
          doc.text(`${pdfTitle} — Semester ${semKey}`, marginX, curY);

          let filterText = [];
          if (regulation !== 'all') filterText.push(`Reg: ${regulation}`);
          if (batchId !== 'all') filterText.push(`Batch: ${batchYears.find(b => String(b.id) === batchId)?.name || batchId}`);

          if (filterText.length > 0) {
            curY += 5;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139); // slate-500
            doc.text(`Filters: ${filterText.join(' | ')}`, marginX, curY);
          }

          const semRows = semesterGroups[semKey];
          const semTableData = semRows.map(buildRowData);
          const tableStartY = curY + 5;

          autoTable(doc, {
            head: [headers],
            body: semTableData,
            startY: tableStartY,
            styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
            headStyles: { fillColor: [49, 46, 129], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: marginX, right: marginX, top: 42 },
            didDrawPage: (data) => {
              if (data.pageNumber > 1) {
                drawHeader();
              }
            }
          });
        });

        doc.save(`${fileName}.pdf`);
        onClose();
      }
    } catch (err: any) {
      console.error('Download error:', err);
      setErrorAlert('An error occurred during generation: ' + (err.message || String(err)));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-900">Download Curriculum</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {errorAlert && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
              {errorAlert}
            </div>
          )}

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Format</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  format === 'pdf' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-200 text-gray-600'
                }`}
              >
                <FileText className="w-6 h-6" />
                <span className="text-sm font-medium">PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('excel')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  format === 'excel' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-200 text-gray-600'
                }`}
              >
                <FileSpreadsheet className="w-6 h-6" />
                <span className="text-sm font-medium">Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  format === 'csv' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-200 text-gray-600'
                }`}
              >
                <FileText className="w-6 h-6" />
                <span className="text-sm font-medium">CSV</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Filters</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Regulation</label>
                <select
                  value={regulation}
                  onChange={(e) => setRegulation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="all">All Regulations</option>
                  {uniqueRegs.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="all">All Semesters</option>
                  {uniqueSems.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Batch</label>
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="all">All Batches</option>
                  {batchYears.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {type === 'department' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="all">All Departments</option>
                    {uniqueDepts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="inline-flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isDownloading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
