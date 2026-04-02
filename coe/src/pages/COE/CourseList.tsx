import React, { useEffect, useMemo, useState } from 'react';

import { CoeStudentsMapResponse, fetchCoeStudentsMap } from '../../services/coe';
import fetchWithAuth from '../../services/fetchAuth';
import { getCachedMe } from '../../services/auth';
import {
  CourseSelection,
  EseType,
  QpType,
  getCourseKey,
  readCourseSelectionMap,
  writeCourseSelectionMap,
} from './courseSelectionStorage';
import { readTTScheduleMap, setTTDateForCourse } from './ttScheduleStore';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import krLogoSrc from '../../assets/krlogo.png';

async function imageUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image as data URL.'));
    };
    reader.onerror = () => reject(new Error('Failed to load image.'));
    reader.readAsDataURL(blob);
  });
}

const COURSE_SELECTION_LOCK_KEY = 'coe-course-selection-lock-v1';

type CourseRow = {
  department: string;
  semester: string;
  courseCode: string;
  courseName: string;
  key: string;
};

function sanitizeFileName(name: string) {
  // replace path separators and other unsafe chars, trim, collapse spaces
  return name
    .replace(/[\\/:"*?<>|]+/g, '-') // common illegal filename chars
    .replace(/\s+/g, ' ')
    .trim();
}

export default function CourseList() {
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [department, setDepartment] = useState('ALL');
  const [semester, setSemester] = useState('SEM1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CoeStudentsMapResponse | null>(null);
  const [selectionMap, setSelectionMap] = useState<Record<string, CourseSelection>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'save' | 'edit'>('save');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [validatingPassword, setValidatingPassword] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [ttScheduleMap, setTtScheduleMap] = useState<Record<string, string>>({});
  const [showTtModal, setShowTtModal] = useState(false);
  const [ttTargetCourseKey, setTtTargetCourseKey] = useState('');
  const [ttDateInput, setTtDateInput] = useState('');
  const [ttDateInput2, setTtDateInput2] = useState('');
  const [ttSessionInput, setTtSessionInput] = useState<'FN' | 'AN'>('FN');
  const [ttSessionInput2, setTtSessionInput2] = useState<'FN' | 'AN'>('FN');
  const [ttTargetQpType, setTtTargetQpType] = useState<QpType>('QP1');
  const [cdapLoadingRow, setCdapLoadingRow] = useState<string | null>(null);
  const [showCdapModal, setShowCdapModal] = useState(false);
  const [cdapPdfUrl, setCdapPdfUrl] = useState<string | null>(null);
  const [cdapCurrentRow, setCdapCurrentRow] = useState<CourseRow | null>(null);
  const [cdapBulkLoading, setCdapBulkLoading] = useState(false);

  // Fetch departments on mount
  useEffect(() => {
    let active = true;
    setLoadingDeps(true);

    (async () => {
      try {
        const res = await fetchWithAuth('/api/academics/departments/');
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          const depts = data.results || data || [];
          const deptNames = depts
            .map((d: any) => {
              const label = d?.short_name || d?.code || d?.name || d;
              return label ? String(label).trim().toUpperCase() : null;
            })
            .filter(Boolean);
          setDepartments(['ALL', ...(deptNames as string[])]);
          setDepartment('ALL');
        } else {
          console.warn('Failed to fetch departments, using defaults');
          setDepartments(['ALL']);
        }
      } catch (err) {
        if (active) console.warn('Error fetching departments:', err);
      } finally {
        if (active) setLoadingDeps(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Fetch semesters on mount
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetchWithAuth('/api/academics/semesters/');
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          const sems = data.results || data || [];
          const semNames = sems.map((s: any) => s.name || s.code || s).filter(Boolean);
          setSemesters(semNames.length > 0 ? semNames : ['SEM1']);
          setSemester(semNames[0] || 'SEM1');
        } else {
          console.warn('Failed to fetch semesters, using defaults');
          setSemesters(['SEM1']);
        }
      } catch (err) {
        if (active) console.warn('Error fetching semesters:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const getCurrentFilterKey = () => `${department}::${semester}`;

  const readLocks = (): Record<string, boolean> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(COURSE_SELECTION_LOCK_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeLocks = (locks: Record<string, boolean>) => {
    if (typeof window === 'undefined') return;
    const keys = Object.keys(locks || {}).filter((k) => Boolean(locks[k]));
    if (keys.length > 0) {
      window.localStorage.setItem(COURSE_SELECTION_LOCK_KEY, JSON.stringify(locks));
      return;
    }
    window.localStorage.removeItem(COURSE_SELECTION_LOCK_KEY);
  };

  const setFilterLock = (filterKey: string, lock: boolean) => {
    const locks = readLocks();
    if (lock) {
      locks[filterKey] = true;
    } else if (locks[filterKey]) {
      delete locks[filterKey];
    }
    writeLocks(locks);
  };

  const isFilterLocked = (filterKey: string) => Boolean(readLocks()[filterKey]);

  useEffect(() => {
    setSelectionMap(readCourseSelectionMap());
  }, []);

  useEffect(() => {
    setIsLocked(isFilterLocked(getCurrentFilterKey()));
    setHasUnsavedChanges(false);
    setTtScheduleMap(readTTScheduleMap(getCurrentFilterKey()));
  }, [department, semester]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchCoeStudentsMap({ department, semester });
        if (!active) return;
        setData(res);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load courses.';
        setError(message);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [department, semester]);

  const rows = useMemo(() => {
    if (!data) return [] as CourseRow[];

    const list: CourseRow[] = [];
    for (const deptBlock of data.departments) {
      for (const course of deptBlock.courses) {
        list.push({
          department: deptBlock.department,
          semester,
          courseCode: course.course_code || '',
          courseName: course.course_name || 'Unnamed Course',
          key: getCourseKey({
            department: deptBlock.department,
            semester,
            courseCode: course.course_code || '',
            courseName: course.course_name || '',
          }),
        });
      }
    }

    return list;
  }, [data, semester]);

  useEffect(() => {
    if (rows.length === 0) return;

    const next = { ...selectionMap };
    let changed = false;

    for (const row of rows) {
      if (!next[row.key]) {
        next[row.key] = {
          selected: true,
          qpType: 'QP1',
          eseType: 'ESE',
        };
        changed = true;
      } else if (!next[row.key].selected) {
        next[row.key] = {
          ...next[row.key],
          selected: true,
        };
        changed = true;
      }
    }

    if (changed) {
      setSelectionMap(next);
      setHasUnsavedChanges(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function updateSelection(key: string, patch: Partial<CourseSelection>) {
    if (isLocked) return;
    setSelectionMap((prev) => {
      const current = prev[key] || { selected: true, qpType: 'QP1' as QpType, eseType: 'ESE' as EseType };
      const normalizedPatch =
        patch.eseType === 'NON_ESE' ? { ...patch, qpType: 'QP1' as QpType } : patch;
      const next = {
        ...prev,
        [key]: {
          ...current,
          ...normalizedPatch,
        },
      };
      setHasUnsavedChanges(true);
      return next;
    });
  }

  const openSaveConfirm = () => {
    setPasswordMode('save');
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const openEditConfirm = () => {
    setPasswordMode('edit');
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const handlePasswordConfirm = async () => {
    if (!passwordInput) {
      setPasswordError('Password is required');
      return;
    }

    setValidatingPassword(true);
    setPasswordError('');
    try {
      const me = getCachedMe();
      const identifier = me?.email || me?.username || me?.staff_profile?.staff_id;
      if (!identifier) {
        throw new Error('User identifier not found. Please log in again.');
      }

      const res = await fetchWithAuth('/api/accounts/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password: passwordInput }),
      });

      if (!res.ok) {
        throw new Error('Invalid password');
      }

      if (passwordMode === 'save') {
        writeCourseSelectionMap(selectionMap);
        setFilterLock(getCurrentFilterKey(), true);
        setIsLocked(true);
        setHasUnsavedChanges(false);
      } else {
        setFilterLock(getCurrentFilterKey(), false);
        setIsLocked(false);
      }

      setShowPasswordModal(false);
      setPasswordInput('');
    } catch (err: any) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setValidatingPassword(false);
    }
  };

  // Revoke any created object URL when it changes or on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (cdapPdfUrl) {
        try {
          URL.revokeObjectURL(cdapPdfUrl);
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdapPdfUrl]);

  const handleCdapClick = async (e: React.MouseEvent, row: CourseRow) => {
    e.preventDefault();
    if (cdapLoadingRow) return;
    setCdapLoadingRow(row.key);
    try {
      const res = await fetchWithAuth(`/api/obe/cdap-revision/${encodeURIComponent(row.courseCode)}`);
      const cdap = await res.json();

      if (!res.ok) {
        throw new Error(cdap.detail || 'Failed to fetch CDAP data');
      }

      if (!cdap.rows || cdap.rows.length === 0) {
        alert(`No CDAP data uploaded for ${row.courseCode} yet.`);
        return;
      }

      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();

      let krLogoDataUrl = '';
      try {
        krLogoDataUrl = await imageUrlToDataUrl(krLogoSrc);
        
        const logoHeight = 12;
        const logoX = 210 - 14 - 20; // Position at top right
        const logoY = 8;
        
        if (krLogoDataUrl) {
          const imgProps = doc.getImageProperties(krLogoDataUrl);
          const pdfWidth = (imgProps.width * logoHeight) / imgProps.height;
          doc.addImage(krLogoDataUrl, 'PNG', logoX, logoY, pdfWidth, logoHeight);
        }
      } catch (err) {
        console.error('Failed to load logo', err);
      }

      doc.setFontSize(14);
      doc.text(`SYLLABUS - ${row.courseCode} ${row.courseName}`, pageWidth / 2, 25, { align: 'center' });

      // Build rows
      const tableBody = (cdap.rows || []).map((r: any, idx: number) => {
        return [
          idx + 1,
          r.content_type || '-',
          r.part_no || '-',
          r.topics || '-',
          r.sub_topics || '-',
          r.bt_level || '-'
        ];
      });

      autoTable(doc, {
        startY: 32,
        head: [['#', 'Content type', 'PART NO.', 'TOPICS TO BE COVERED (SYLLBUS TOPICS)', 'SUB TOPICS (WHAT TO BE TAUGHT)', 'BT LEVEL']],
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [63, 81, 181], textColor: [255, 255, 255] },
        columnStyles: {
           3: { cellWidth: 50 },
           4: { cellWidth: 50 },
        },
        margin: { left: 14, right: 14 }
      });

      let finalY = (doc as any).lastAutoTable?.finalY || 50;

      // Add References
      if (cdap.books) {
         if (finalY + 30 > doc.internal.pageSize.getHeight()) {
            doc.addPage();
            finalY = 20;
         }
         doc.setFontSize(12);
         doc.setFont('helvetica', 'bold');
         doc.text('Reference Materials', 14, finalY + 15);
         doc.setFontSize(10);
         doc.setFont('helvetica', 'normal');
         let currentY = finalY + 22;

         if (cdap.books.textbook) {
            doc.setFont('helvetica', 'bold');
            doc.text('Textbooks:', 14, currentY);
            doc.setFont('helvetica', 'normal');
            
            const tbLines = doc.splitTextToSize(cdap.books.textbook || '', pageWidth - 28);
            currentY += 6;
            doc.text(tbLines, 14, currentY);
            currentY += (tbLines.length * 5) + 5;
         }

         if (cdap.books.reference) {
            if (currentY + 20 > doc.internal.pageSize.getHeight()) {
                doc.addPage();
                currentY = 20;
            }
            doc.setFont('helvetica', 'bold');
            doc.text('References:', 14, currentY);
            doc.setFont('helvetica', 'normal');
            
            const refLines = doc.splitTextToSize(cdap.books.reference || '', pageWidth - 28);
            currentY += 6;
            doc.text(refLines, 14, currentY);
         }
      }

      // Create blob and object URL for preview, so we can revoke it later
      const pdfBlob = doc.output('blob');
      const objectUrl = URL.createObjectURL(pdfBlob);

      // Revoke previous url if present
      if (cdapPdfUrl) {
        try {
          URL.revokeObjectURL(cdapPdfUrl);
        } catch {
          // ignore
        }
      }

      setCdapPdfUrl(objectUrl);
      setCdapCurrentRow(row);
      setShowCdapModal(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to fetch CDAP data');
    } finally {
      setCdapLoadingRow(null);
    }
  };

  const downloadCdapPdf = async () => {
    if (!cdapCurrentRow) return;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    try {
      const res = await fetchWithAuth(`/api/obe/cdap-revision/${encodeURIComponent(cdapCurrentRow.courseCode)}`);
      const cdap = await res.json();

      let krLogoDataUrl = '';
      try {
        krLogoDataUrl = await imageUrlToDataUrl(krLogoSrc);
        
        const logoHeight = 12;
        const logoX = 210 - 14 - 20; // Position at top right
        const logoY = 8;
        
        if (krLogoDataUrl) {
          const imgProps = doc.getImageProperties(krLogoDataUrl);
          const pdfWidth = (imgProps.width * logoHeight) / imgProps.height;
          doc.addImage(krLogoDataUrl, 'PNG', logoX, logoY, pdfWidth, logoHeight);
        }
      } catch (err) {
        console.error('Failed to load logo', err);
      }

      doc.setFontSize(14);
      doc.text(`SYLLABUS - ${cdapCurrentRow.courseCode} ${cdapCurrentRow.courseName}`, pageWidth / 2, 25, { align: 'center' });

      const tableBody = (cdap.rows || []).map((r: any, idx: number) => {
        return [
          idx + 1,
          r.content_type || '-',
          r.part_no || '-',
          r.topics || '-',
          r.sub_topics || '-',
          r.bt_level || '-'
        ];
      });

      autoTable(doc, {
        startY: 32,
        head: [['#', 'Content type', 'PART NO.', 'TOPICS TO BE COVERED (SYLLBUS TOPICS)', 'SUB TOPICS (WHAT TO BE TAUGHT)', 'BT LEVEL']],
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [63, 81, 181], textColor: [255, 255, 255] },
        columnStyles: {
           3: { cellWidth: 50 },
           4: { cellWidth: 50 },
        },
        margin: { left: 14, right: 14 }
      });

      let finalY = (doc as any).lastAutoTable?.finalY || 32;

      if (cdap.books) {
         if (finalY + 30 > doc.internal.pageSize.getHeight()) {
            doc.addPage();
            finalY = 20;
         }
         doc.setFontSize(12);
         doc.setFont('helvetica', 'bold');
         doc.text('Reference Materials', 14, finalY + 15);
         doc.setFontSize(10);
         doc.setFont('helvetica', 'normal');
         let currentY = finalY + 22;

         if (cdap.books.textbook) {
            doc.setFont('helvetica', 'bold');
            doc.text('Textbooks:', 14, currentY);
            doc.setFont('helvetica', 'normal');
            
            const tbLines = doc.splitTextToSize(cdap.books.textbook || '', pageWidth - 28);
            currentY += 6;
            doc.text(tbLines, 14, currentY);
            currentY += (tbLines.length * 5) + 5;
         }

         if (cdap.books.reference) {
            if (currentY + 20 > doc.internal.pageSize.getHeight()) {
                doc.addPage();
                currentY = 20;
            }
            doc.setFont('helvetica', 'bold');
            doc.text('References:', 14, currentY);
            doc.setFont('helvetica', 'normal');
            
            const refLines = doc.splitTextToSize(cdap.books.reference || '', pageWidth - 28);
            currentY += 6;
            doc.text(refLines, 14, currentY);
         }
      }

      const cleanName = sanitizeFileName(`${cdapCurrentRow.courseCode}-${cdapCurrentRow.courseName}`);
      doc.save(`${cleanName}.pdf`);
    } catch (err) {
      console.error('Failed to download CDAP PDF', err);
    }
  };

  const downloadBulkCdapPdfs = async () => {
    if (!data || !data.departments || rows.length === 0) {
      alert('No courses available to download.');
      return;
    }

    setCdapBulkLoading(true);
    const zip = new JSZip();
    let successCount = 0;
    let failureCount = 0;

    try {
      // Pre-load KR logo once
      let krLogoDataUrl = '';
      try {
        krLogoDataUrl = await imageUrlToDataUrl(krLogoSrc);
      } catch (err) {
        console.warn('Failed to load logo for bulk download', err);
      }

      // Create a folder for department and semester
      const folderName = `${department}_${semester}`;
      const folder = zip.folder(folderName);
      if (!folder) {
        throw new Error('Failed to create zip folder');
      }

      // Download CDAP for each course
      for (const row of rows) {
        try {
          const res = await fetchWithAuth(`/api/obe/cdap-revision/${encodeURIComponent(row.courseCode)}`);
          const cdap = await res.json();

          if (!res.ok) {
            console.warn(`Failed to fetch CDAP for ${row.courseCode}: ${cdap.detail || 'Unknown error'}`);
            failureCount++;
            continue;
          }

          if (!cdap.rows || cdap.rows.length === 0) {
            console.warn(`No CDAP data for ${row.courseCode}`);
            failureCount++;
            continue;
          }

          // Generate PDF
          const doc = new jsPDF('portrait', 'mm', 'a4');
          const pageWidth = doc.internal.pageSize.getWidth();

          const logoHeight = 12;
          const logoX = 210 - 14 - 20; // Position at top right
          const logoY = 8;

          if (krLogoDataUrl) {
            const imgProps = doc.getImageProperties(krLogoDataUrl);
            const pdfWidth = (imgProps.width * logoHeight) / imgProps.height;
            doc.addImage(krLogoDataUrl, 'PNG', logoX, logoY, pdfWidth, logoHeight);
          }

          doc.setFontSize(14);
          doc.text(`SYLLABUS - ${row.courseCode} ${row.courseName}`, pageWidth / 2, 25, { align: 'center' });

          const tableBody = (cdap.rows || []).map((r: any, idx: number) => {
            return [
              idx + 1,
              r.content_type || '-',
              r.part_no || '-',
              r.topics || '-',
              r.sub_topics || '-',
              r.bt_level || '-'
            ];
          });

          autoTable(doc, {
            startY: 32,
            head: [['#', 'Content type', 'PART NO.', 'TOPICS TO BE COVERED (SYLLBUS TOPICS)', 'SUB TOPICS (WHAT TO BE TAUGHT)', 'BT LEVEL']],
            body: tableBody,
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [63, 81, 181], textColor: [255, 255, 255] },
            columnStyles: {
              3: { cellWidth: 50 },
              4: { cellWidth: 50 },
            },
            margin: { left: 14, right: 14 }
          });

          let finalY = (doc as any).lastAutoTable?.finalY || 32;

          if (cdap.books) {
            if (finalY + 30 > doc.internal.pageSize.getHeight()) {
              doc.addPage();
              finalY = 20;
            }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Reference Materials', 14, finalY + 15);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            let currentY = finalY + 22;

            if (cdap.books.textbook) {
              doc.setFont('helvetica', 'bold');
              doc.text('Textbooks:', 14, currentY);
              doc.setFont('helvetica', 'normal');

              const tbLines = doc.splitTextToSize(cdap.books.textbook || '', pageWidth - 28);
              currentY += 6;
              doc.text(tbLines, 14, currentY);
              currentY += (tbLines.length * 5) + 5;
            }

            if (cdap.books.reference) {
              if (currentY + 20 > doc.internal.pageSize.getHeight()) {
                doc.addPage();
                currentY = 20;
              }
              doc.setFont('helvetica', 'bold');
              doc.text('References:', 14, currentY);
              doc.setFont('helvetica', 'normal');

              const refLines = doc.splitTextToSize(cdap.books.reference || '', pageWidth - 28);
              currentY += 6;
              doc.text(refLines, 14, currentY);
            }
          }

          // Add PDF to zip
          const cleanName = sanitizeFileName(`${row.courseCode}-${row.courseName}`);
          const pdfBlob = doc.output('blob');
          folder.file(`${cleanName}.pdf`, pdfBlob);
          successCount++;
        } catch (err) {
          console.error(`Error processing ${row.courseCode}:`, err);
          failureCount++;
        }
      }

      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `${department}-${semester}-CDAP.zip`;
      link.click();
      URL.revokeObjectURL(zipUrl);

      if (failureCount > 0) {
        alert(`Bulk download complete. ${successCount} PDFs downloaded, ${failureCount} failed.`);
      } else {
        alert(`Bulk download complete. ${successCount} PDFs downloaded successfully.`);
      }
    } catch (err: any) {
      console.error('Bulk download failed', err);
      alert(`Bulk download failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setCdapBulkLoading(false);
    }
  };

  const openTtCalendar = (courseKey: string, qpType: QpType) => {
    const current = ttScheduleMap[courseKey] || '';
    const parts = current.split('|');
    setTtTargetCourseKey(courseKey);
    setTtTargetQpType(qpType);
    setTtDateInput(parts[0] || '');
    setTtDateInput2(parts[1] || '');
    setTtSessionInput('FN');
    setTtSessionInput2('FN');
    setShowTtModal(true);
  };

  const saveTtDate = () => {
    const filterKey = getCurrentFilterKey();
    const isTcpr = ttTargetQpType === 'TCPR';
    const dateValue = isTcpr ? `${ttDateInput}|${ttDateInput2}` : ttDateInput;
    setTTDateForCourse(filterKey, ttTargetCourseKey, dateValue);
    setTtScheduleMap(readTTScheduleMap(filterKey));
    setShowTtModal(false);
    setTtTargetCourseKey('');
    setTtDateInput('');
    setTtDateInput2('');
    setTtSessionInput('FN');
    setTtSessionInput2('FN');
    setTtTargetQpType('QP1');
  };

  const clearTtDate = () => {
    const filterKey = getCurrentFilterKey();
    setTTDateForCourse(filterKey, ttTargetCourseKey, '');
    setTtScheduleMap(readTTScheduleMap(filterKey));
    setShowTtModal(false);
    setTtTargetCourseKey('');
    setTtDateInput('');
    setTtDateInput2('');
    setTtSessionInput('FN');
    setTtSessionInput2('FN');
    setTtTargetQpType('QP1');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {showPasswordModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96">
            <h2 className="text-lg font-bold mb-2">{passwordMode === 'save' ? 'Confirm Save' : 'Confirm Edit'}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please enter your login password to {passwordMode === 'save' ? 'save and lock' : 'unlock editing'}.
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePasswordConfirm();
                }
              }}
              className="w-full border border-gray-300 p-2 rounded mb-2 focus:outline-none focus:border-blue-500"
              placeholder="Password"
            />
            {passwordError ? <p className="text-red-600 text-xs mb-4">{passwordError}</p> : null}
            <div className="flex justify-end space-x-3 mt-2">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError('');
                  setPasswordInput('');
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordConfirm}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={validatingPassword}
              >
                {validatingPassword ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCdapModal && cdapCurrentRow && cdapPdfUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-lg w-11/12 h-5/6 max-w-5xl flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 p-4 gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">{cdapCurrentRow.courseName}</h2>
                <p className="text-sm text-gray-600 truncate">{cdapCurrentRow.courseCode}</p>
              </div>
              <button
                onClick={() => {
                  if (cdapPdfUrl) {
                    try { URL.revokeObjectURL(cdapPdfUrl); } catch {}
                  }
                  setShowCdapModal(false);
                  setCdapPdfUrl(null);
                  setCdapCurrentRow(null);
                }}
                className="flex-shrink-0 text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={cdapPdfUrl || undefined}
                className="w-full h-full border-0"
                title="CDAP PDF Preview"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 p-4">
              <button
                onClick={() => {
                  if (cdapPdfUrl) {
                    try { URL.revokeObjectURL(cdapPdfUrl); } catch {}
                  }
                  setShowCdapModal(false);
                  setCdapPdfUrl(null);
                  setCdapCurrentRow(null);
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Close
              </button>
              <button
                onClick={downloadCdapPdf}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">COE Course List</h1>
          <p className="mt-2 text-sm text-gray-600">Choose QP type and ESE mode. Students List will use this selection.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={downloadBulkCdapPdfs}
            disabled={loading || rows.length === 0 || cdapBulkLoading}
            className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download all CDAP PDFs for this department and semester as a zip file"
          >
            {cdapBulkLoading ? 'Downloading...' : 'Bulk CDAP'}
          </button>
          {isLocked ? (
            <button
              onClick={openEditConfirm}
              className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-yellow-600 hover:bg-yellow-700 focus:outline-none"
            >
              Edit
            </button>
          ) : (
            <button
              onClick={openSaveConfirm}
              disabled={loading || rows.length === 0 || !hasUnsavedChanges}
              className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="coe-course-department">
              Department
            </label>
            <select
              id="coe-course-department"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={loadingDeps}
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="coe-course-semester">
              Semester
            </label>
            <select
              id="coe-course-semester"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              {semesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading courses...</div> : null}

      {!loading && error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-600">No courses found for the selected department and semester.</p>
          ) : (
            rows.map((row) => {
              const conf = selectionMap[row.key] || { selected: true, qpType: 'QP1' as QpType, eseType: 'ESE' as EseType };

              return (
                <div key={row.key} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-gray-900 truncate">{row.courseName}</p>
                      <p className="text-xs font-medium text-gray-500 truncate">{row.courseCode || 'NO_CODE'} | {row.department} | {row.semester}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <div className="inline-flex items-center gap-3 rounded-md border border-gray-200 bg-white px-2 py-1">
                        <span className="text-xs font-semibold uppercase text-gray-500">QP</span>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`qp-${row.key}`}
                            checked={conf.qpType === 'QP1'}
                            disabled={isLocked || conf.eseType === 'NON_ESE'}
                            onChange={() => updateSelection(row.key, { qpType: 'QP1' })}
                          />
                          QP1
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`qp-${row.key}`}
                            checked={conf.qpType === 'QP2'}
                            disabled={isLocked || conf.eseType === 'NON_ESE'}
                            onChange={() => updateSelection(row.key, { qpType: 'QP2' })}
                          />
                          QP2
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`qp-${row.key}`}
                            checked={conf.qpType === 'TCPR'}
                            disabled={isLocked || conf.eseType === 'NON_ESE'}
                            onChange={() => updateSelection(row.key, { qpType: 'TCPR' })}
                          />
                          TCPR
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`qp-${row.key}`}
                            checked={conf.qpType === 'TCPL'}
                            disabled={isLocked || conf.eseType === 'NON_ESE'}
                            onChange={() => updateSelection(row.key, { qpType: 'TCPL' })}
                          />
                          TCPL
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`qp-${row.key}`}
                            checked={conf.qpType === 'OE'}
                            disabled={isLocked || conf.eseType === 'NON_ESE'}
                            onChange={() => updateSelection(row.key, { qpType: 'OE' })}
                          />
                          OE
                        </label>
                      </div>

                      <div className="inline-flex items-center gap-3 rounded-md border border-gray-200 bg-white px-2 py-1">
                        <span className="text-xs font-semibold uppercase text-gray-500">Type</span>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`ese-${row.key}`}
                            checked={conf.eseType === 'ESE'}
                            disabled={isLocked}
                            onChange={() => updateSelection(row.key, { eseType: 'ESE' })}
                          />
                          ESE
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`ese-${row.key}`}
                            checked={conf.eseType === 'NON_ESE'}
                            disabled={isLocked}
                            onChange={() => updateSelection(row.key, { eseType: 'NON_ESE' })}
                          />
                          NON-ESE
                        </label>
                      </div>

                      <div className="relative inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 whitespace-nowrap">
                        <span className="text-xs font-semibold uppercase text-indigo-700">TT</span>
                        {(conf.qpType === 'TCPR' || conf.qpType === 'TCPL') ? (
                          <>
                            <button
                              onClick={() => openTtCalendar(row.key, conf.qpType)}
                              className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              Calendar 1
                            </button>
                            <button
                              onClick={() => openTtCalendar(row.key, conf.qpType)}
                              className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              Calendar 2
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => openTtCalendar(row.key, conf.qpType)}
                            className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            Calendar
                          </button>
                        )}
                        <span className="text-xs text-indigo-700">
                          {(() => {
                            const dates = (ttScheduleMap[row.key] || '').split('|');
                            if ((conf.qpType === 'TCPR' || conf.qpType === 'TCPL') && dates.length === 2) {
                              return `${dates[0] || 'Not Set'} / ${dates[1] || 'Not Set'}`;
                            }
                            return dates[0] || 'Not Set';
                          })()}
                        </span>

                        {showTtModal && ttTargetCourseKey === row.key && (
                          <div className="absolute right-0 top-full mt-2 z-[60] bg-white p-4 rounded-xl shadow-xl w-72 border border-gray-200">
                            <h2 className="text-base font-bold text-gray-900 mb-1">Set TT Date{ttTargetQpType === 'TCPR' || ttTargetQpType === 'TCPL' ? 's' : ''}</h2>
                            <p className="text-xs text-gray-500 mb-3 whitespace-normal">Choose the attendance date{ttTargetQpType === 'TCPR' || ttTargetQpType === 'TCPL' ? 's' : ''} for this course.</p>
                            <input
                              type="date"
                              value={ttDateInput}
                              onChange={(e) => setTtDateInput(e.target.value)}
                              onKeyDown={(e) => e.preventDefault()}
                              onPaste={(e) => e.preventDefault()}
                              className="w-full border border-gray-300 p-2 text-sm rounded mb-4 focus:outline-none focus:border-indigo-500"
                            />
                            <div className="mb-4 flex items-center gap-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
                              <span className="text-gray-500">Session</span>
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="radio"
                                  name="tt-session-1"
                                  checked={ttSessionInput === 'FN'}
                                  onChange={() => setTtSessionInput('FN')}
                                />
                                FN
                              </label>
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="radio"
                                  name="tt-session-1"
                                  checked={ttSessionInput === 'AN'}
                                  onChange={() => setTtSessionInput('AN')}
                                />
                                AN
                              </label>
                            </div>
                            {(ttTargetQpType === 'TCPR' || ttTargetQpType === 'TCPL') && (
                              <>
                                <input
                                  type="date"
                                  value={ttDateInput2}
                                  onChange={(e) => setTtDateInput2(e.target.value)}
                                  onKeyDown={(e) => e.preventDefault()}
                                  onPaste={(e) => e.preventDefault()}
                                  className="w-full border border-gray-300 p-2 text-sm rounded mb-4 focus:outline-none focus:border-indigo-500"
                                />
                                <div className="mb-4 flex items-center gap-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
                                  <span className="text-gray-500">Session</span>
                                  <label className="inline-flex items-center gap-1">
                                    <input
                                      type="radio"
                                      name="tt-session-2"
                                      checked={ttSessionInput2 === 'FN'}
                                      onChange={() => setTtSessionInput2('FN')}
                                    />
                                    FN
                                  </label>
                                  <label className="inline-flex items-center gap-1">
                                    <input
                                      type="radio"
                                      name="tt-session-2"
                                      checked={ttSessionInput2 === 'AN'}
                                      onChange={() => setTtSessionInput2('AN')}
                                    />
                                    AN
                                  </label>
                                </div>
                              </>
                            )}
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => {
                                  setShowTtModal(false);
                                  setTtTargetCourseKey('');
                                  setTtDateInput('');
                                  setTtDateInput2('');
                                  setTtSessionInput('FN');
                                  setTtSessionInput2('FN');
                                  setTtTargetQpType('QP1');
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={clearTtDate}
                                className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md transition-colors"
                              >
                                Clear
                              </button>
                              <button
                                onClick={saveTtDate}
                                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
                        <button
                          onClick={(e) => handleCdapClick(e, row)}
                          disabled={cdapLoadingRow === row.key}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                        >
                          {cdapLoadingRow === row.key ? 'Loading...' : 'CDAP'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
