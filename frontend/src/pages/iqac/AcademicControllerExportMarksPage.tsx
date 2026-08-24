import React, { useEffect, useState } from 'react';
import {
  Download,
  FolderArchive,
  CheckSquare,
  Square,
  Layers,
  FolderTree,
  BookOpen,
  Info,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';
import { fetchDepartments, DepartmentRow } from '../../services/academics';

type PreviewData = {
  semesters_selected: number[];
  total_teaching_assignments: number;
  total_unique_courses: number;
  total_course_sections: number;
  total_departments: number;
  department_names: string[];
};

export default function AcademicControllerExportMarksPage(): JSX.Element {
  const [selectedSemesters, setSelectedSemesters] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Available semesters 1..8
  const allSemesters = [1, 2, 3, 4, 5, 6, 7, 8];

  // Fetch departments on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const depts = await fetchDepartments();
        if (mounted) setDepartments(depts || []);
      } catch {
        // silent fail
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch preview counts whenever selection changes
  useEffect(() => {
    let mounted = true;
    if (selectedSemesters.length === 0) {
      setPreview(null);
      return;
    }

    (async () => {
      try {
        setLoadingPreview(true);
        const params = new URLSearchParams();
        params.set('semesters', selectedSemesters.sort((a, b) => a - b).join(','));
        if (selectedDeptId !== 'all') {
          params.set('department_id', selectedDeptId);
        }
        const res = await fetchWithAuth(`/api/academics/iqac/marks/export-preview/?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch preview stats');
        const data = await res.json();
        if (mounted) setPreview(data);
      } catch {
        if (mounted) setPreview(null);
      } finally {
        if (mounted) setLoadingPreview(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedSemesters, selectedDeptId]);

  const toggleSemester = (sem: number) => {
    setSelectedSemesters((prev) =>
      prev.includes(sem) ? prev.filter((s) => s !== sem) : [...prev, sem].sort((a, b) => a - b)
    );
    setError(null);
    setSuccessMessage(null);
  };

  const handleSelectAll = () => {
    setSelectedSemesters([1, 2, 3, 4, 5, 6, 7, 8]);
    setError(null);
    setSuccessMessage(null);
  };

  const handleClearAll = () => {
    setSelectedSemesters([]);
    setError(null);
    setSuccessMessage(null);
  };

  const handleSelectOdd = () => {
    setSelectedSemesters([1, 3, 5, 7]);
    setError(null);
    setSuccessMessage(null);
  };

  const handleSelectEven = () => {
    setSelectedSemesters([2, 4, 6, 8]);
    setError(null);
    setSuccessMessage(null);
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const handleExportZip = async () => {
    if (selectedSemesters.length === 0) {
      setError('Please select at least one semester to export.');
      return;
    }

    try {
      setDownloading(true);
      setError(null);
      setSuccessMessage(null);

      const params = new URLSearchParams();
      params.set('semesters', selectedSemesters.sort((a, b) => a - b).join(','));
      if (selectedDeptId !== 'all') {
        params.set('department_id', selectedDeptId);
      }

      const res = await fetchWithAuth(`/api/academics/iqac/marks/export-semesters-zip/?${params.toString()}`);
      if (!res.ok) {
        let errDetail = 'Failed to generate marks export ZIP';
        try {
          const errJson = await res.json();
          if (errJson?.detail) errDetail = errJson.detail;
        } catch {
          // ignore
        }
        throw new Error(errDetail);
      }

      const blob = await res.blob();
      const semSuffix = selectedSemesters.length === 8 ? 'all_semesters' : `sem_${selectedSemesters.sort((a, b) => a - b).join('_')}`;
      const filename = `marks_export_${semSuffix}_${new Date().toISOString().slice(0, 10)}.zip`;
      triggerDownload(blob, filename);

      setSuccessMessage(`Successfully generated and downloaded ${filename}!`);
    } catch (e: any) {
      setError(e?.message || 'Failed to download marks ZIP');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
          borderRadius: 14,
          padding: '24px 28px',
          color: '#fff',
          boxShadow: '0 4px 14px rgba(30, 58, 138, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <FolderArchive className="w-8 h-8 text-blue-200" />
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Export Marks (All Courses & Exams)
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: '#dbeafe', maxWidth: 850, lineHeight: 1.5 }}>
          Export comprehensive course marks across departments packaged into a structured ZIP file organized by
          <strong> Semesters &rarr; Departments &rarr; Course Excel Workbooks</strong>. Each Excel file contains individual
          sheets for every exam (SSA1, CIA1, Formative1, SSA2, CIA2, Formative2, Model Exam, and Final Internal Marks).
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: 8,
            color: '#991b1b',
            fontSize: 14,
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            background: '#ecfdf5',
            border: '1px solid #34d399',
            borderRadius: 8,
            color: '#065f46',
            fontSize: 14,
          }}
        >
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Grid: Selection Controls on Left, Preview & Structure on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* Semester Selection Panel */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers className="w-5 h-5 text-blue-600" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                Select Semesters
              </h3>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 9999,
                background: selectedSemesters.length > 0 ? '#dbeafe' : '#f3f4f6',
                color: selectedSemesters.length > 0 ? '#1e40af' : '#6b7280',
              }}
            >
              {selectedSemesters.length} / 8 Selected
            </span>
          </div>

          {/* Quick Selection Shortcuts */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              Select All
            </button>
            <button
              onClick={handleSelectOdd}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              Odd (1, 3, 5, 7)
            </button>
            <button
              onClick={handleSelectEven}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              Even (2, 4, 6, 8)
            </button>
            <button
              onClick={handleClearAll}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: '1px solid #fee2e2',
                background: '#fff5f5',
                color: '#b91c1c',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>

          {/* Semester Checkbox Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
              marginBottom: 20,
            }}
          >
            {allSemesters.map((sem) => {
              const isChecked = selectedSemesters.includes(sem);
              const isOdd = sem % 2 !== 0;
              return (
                <div
                  key={sem}
                  onClick={() => toggleSemester(sem)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: isChecked ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isChecked ? '#eff6ff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                  }}
                >
                  {isChecked ? (
                    <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isChecked ? '#1e3a8a' : '#374151' }}>
                      Semester {sem}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      Year {Math.ceil(sem / 2)} &bull; {isOdd ? 'Odd' : 'Even'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Optional Department Filter */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Filter by Department (Optional):
            </label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 13,
                color: '#111827',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.short_name || d.code || d.name} - {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Export Action Button */}
          <div style={{ marginTop: 20 }}>
            <button
              onClick={handleExportZip}
              disabled={selectedSemesters.length === 0 || downloading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '12px 18px',
                borderRadius: 10,
                border: 'none',
                background: selectedSemesters.length > 0 && !downloading ? '#2563eb' : '#9ca3af',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                cursor: selectedSemesters.length > 0 && !downloading ? 'pointer' : 'not-allowed',
                boxShadow: selectedSemesters.length > 0 && !downloading ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {downloading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Generating Multi-Exam Excels & ZIP…</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Export ZIP ({selectedSemesters.length} Semesters)</span>
                </>
              )}
            </button>
            <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 8 }}>
              {selectedSemesters.length === 0
                ? 'Select at least one semester above to enable export'
                : 'Generates structured ZIP with all course Excels & exam sheets'}
            </div>
          </div>
        </div>

        {/* Right Column: Live Statistics & Folder Structure */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Live Preview Stats */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                Scope & Estimated Scope
              </h3>
            </div>

            {loadingPreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13, padding: 12 }}>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Estimating courses & sections…</span>
              </div>
            ) : preview ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#166534' }}>Semesters</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#14532d', marginTop: 2 }}>
                    {preview.semesters_selected.length}
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1e40af' }}>Total Courses</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a', marginTop: 2 }}>
                    {preview.total_unique_courses}
                  </div>
                </div>

                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b21a8' }}>Course Excels</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#581c87', marginTop: 2 }}>
                    {preview.total_course_sections}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 13, padding: 10 }}>
                Select semesters to view estimated courses and output statistics.
              </div>
            )}
          </div>

          {/* Folder & Sheet Hierarchy Visualizer */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <FolderTree className="w-5 h-5 text-emerald-600" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                ZIP Structure & Multi-Exam Tabs
              </h3>
            </div>

            <div
              style={{
                background: '#0f172a',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '14px 16px',
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: 'auto',
              }}
            >
              <div style={{ color: '#38bdf8', fontWeight: 700 }}>
                📁 marks_export_semesters_{selectedSemesters.sort((a, b) => a - b).join('_') || 'selected'}.zip
              </div>
              <div style={{ color: '#cbd5e1' }}>
                &nbsp;&nbsp;├── 📁 Semester 1 / Semester 2 / ...
              </div>
              <div style={{ color: '#cbd5e1' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📁 CSE / ECE / MECH / AIDS / ...
              </div>
              <div style={{ color: '#a7f3d0' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📊 CS101_Programming_in_C_CSE-A.xlsx
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📑 Sheet: SSA1 (Assignment 1)
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📑 Sheet: CIA1 (Continuous Internal Assessment 1)
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📑 Sheet: Formative1 (Formative Assessment 1)
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📑 Sheet: SSA2 (Assignment 2)
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📑 Sheet: CIA2 (Continuous Internal Assessment 2)
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📑 Sheet: Formative2 (Formative Assessment 2)
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;├── 📑 Sheet: Model Exam (Model Examination)
              </div>
              <div style={{ color: '#fde047' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;└── 📑 Sheet: Final Internal Marks
              </div>
              <div style={{ color: '#cbd5e1' }}>
                &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;&nbsp;└── 📊 ... (All course sections)
              </div>
              <div style={{ color: '#cbd5e1' }}>
                &nbsp;&nbsp;└── ...
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: '#4b5563' }}>
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>
                Each course Excel workbook preserves full question-level mark breakdowns and total marks per student.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
