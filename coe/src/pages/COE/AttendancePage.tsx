import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';

import { fetchCoeStudentsMap } from '../../services/coe';
import { getCourseKey, readCourseSelectionMap } from './courseSelectionStorage';
import { getAttendanceFilterKey, getAttendanceSessionKey, readAttendanceStatusMap, writeAttendanceStatus, readAttendanceLock, writeAttendanceLock } from './attendanceStore';
import { readTTScheduleMap } from './ttScheduleStore';
import { getCachedMe } from '../../services/auth';
import fetchWithAuth from '../../services/fetchAuth';
import krLogoSrc from '../../assets/krlogo.png';
import newBannerSrc from '../../assets/new_banner.png';

type AttendanceRow = {
  reg_no: string;
  name: string;
  department: string;
};

type CourseMeta = {
  key: string;
  courseCode: string;
  courseName: string;
  department: string;
  examDate: string;
  examSession: 'FN' | 'AN' | '-';
};

type CourseBlock = {
  meta: CourseMeta;
  rows: AttendanceRow[];
  sessionKey: string;
};

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

function parseTtSlot(raw: string): Array<{ date: string; session: 'FN' | 'AN' | '-' }> {
  const text = String(raw || '').trim();
  if (!text) return [];

  return text
    .split('|')
    .map((part, idx) => {
      const [datePartRaw, sessionPartRaw] = part.split('#');
      const datePart = String(datePartRaw || '').trim();
      if (!datePart) return null;

      const sessionPart = String(sessionPartRaw || '').trim().toUpperCase();
      const inferred = idx === 0 ? 'FN' : 'AN';
      const session = sessionPart === 'FN' || sessionPart === 'AN' ? sessionPart : inferred;

      return { date: datePart, session } as { date: string; session: 'FN' | 'AN' | '-' };
    })
    .filter((slot): slot is { date: string; session: 'FN' | 'AN' | '-' } => Boolean(slot));
}

export default function AttendancePage() {
  const [departments, setDepartments] = useState<string[]>(['ALL']);
  const [semesters, setSemesters] = useState<string[]>(['SEM1']);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [department, setDepartment] = useState('ALL');
  const [semester, setSemester] = useState('SEM1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseBlocks, setCourseBlocks] = useState<CourseBlock[]>([]);
  const [attendanceDate, setAttendanceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [statusMaps, setStatusMaps] = useState<Record<string, Record<string, 'present' | 'absent'>>>({});
  const [lockMaps, setLockMaps] = useState<Record<string, boolean>>({});
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [unlockTargetSession, setUnlockTargetSession] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [validatingPassword, setValidatingPassword] = useState(false);
  const [selectedCourseKey, setSelectedCourseKey] = useState<string>('');
  const [searchRegNo, setSearchRegNo] = useState<string>('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');

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

  const filterKey = useMemo(() => getAttendanceFilterKey(department, semester), [department, semester]);

  // Filtered blocks based on course dropdown and search
  const visibleBlocks = useMemo(() => {
    let blocks = courseBlocks;
    if (selectedCourseKey) {
      blocks = blocks.filter((b) => b.meta.key === selectedCourseKey);
    }
    if (searchRegNo.trim()) {
      const query = searchRegNo.trim().toLowerCase();
      blocks = blocks
        .map((b) => ({
          ...b,
          rows: b.rows.filter((r) => r.reg_no.toLowerCase().includes(query)),
        }))
        .filter((b) => b.rows.length > 0);
    }
    return blocks;
  }, [courseBlocks, selectedCourseKey, searchRegNo]);

  // Load status and lock for all course blocks
  useEffect(() => {
    const newStatusMaps: Record<string, Record<string, 'present' | 'absent'>> = {};
    const newLockMaps: Record<string, boolean> = {};
    courseBlocks.forEach((block) => {
      newStatusMaps[block.sessionKey] = readAttendanceStatusMap(block.sessionKey);
      newLockMaps[block.sessionKey] = readAttendanceLock(block.sessionKey);
    });
    setStatusMaps(newStatusMaps);
    setLockMaps(newLockMaps);
  }, [courseBlocks]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchCoeStudentsMap({ department, semester });
        if (!active) return;

        const selectionMap = readCourseSelectionMap();
        const ttMap = readTTScheduleMap(filterKey);
        const blocks: CourseBlock[] = [];

        response.departments.forEach((deptBlock) => {
          deptBlock.courses
            .filter((course) => {
              const courseKey = getCourseKey({
                department: deptBlock.department,
                semester,
                courseCode: course.course_code || '',
                courseName: course.course_name || '',
              });
              const selection = selectionMap[courseKey];
              if (selection && selection.eseType !== 'ESE') return false;
              const slots = parseTtSlot(ttMap[courseKey] || '');
              return slots.some((slot) => slot.date === attendanceDate);
            })
            .forEach((course) => {
              const courseKey = getCourseKey({
                department: deptBlock.department,
                semester,
                courseCode: course.course_code || '',
                courseName: course.course_name || '',
              });
              const slots = parseTtSlot(ttMap[courseKey] || '');
              const matchedSlot = slots.find((slot) => slot.date === attendanceDate);

              const list = (course.students || [])
                .map((student) => ({
                  reg_no: String(student.reg_no || '').trim(),
                  name: String(student.name || ''),
                  department: deptBlock.department,
                }))
                .filter((student) => Boolean(student.reg_no))
                .sort((a, b) => a.reg_no.localeCompare(b.reg_no, undefined, { numeric: true, sensitivity: 'base' }));

              blocks.push({
                meta: {
                  key: courseKey,
                  courseCode: course.course_code || '',
                  courseName: course.course_name || 'Unnamed Course',
                  department: deptBlock.department,
                  examDate: matchedSlot?.date || attendanceDate,
                  examSession: matchedSlot?.session || '-',
                },
                rows: list,
                sessionKey: getAttendanceSessionKey(filterKey, courseKey, attendanceDate),
              });
            });
        });

        setCourseBlocks(blocks);
        setSelectedCourseKey('');
        setSearchRegNo('');
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load attendance students.';
        setError(message);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [department, semester, attendanceDate, filterKey]);

  const totalRows = useMemo(() => courseBlocks.reduce((acc, b) => acc + b.rows.length, 0), [courseBlocks]);
  const totalPresent = useMemo(() => courseBlocks.reduce((acc, block) => {
    const sm = statusMaps[block.sessionKey] || {};
    return acc + block.rows.filter((row) => (sm[row.reg_no] || 'present') === 'present').length;
  }, 0), [courseBlocks, statusMaps]);
  const totalAbsent = useMemo(() => courseBlocks.reduce((acc, block) => {
    const sm = statusMaps[block.sessionKey] || {};
    return acc + block.rows.filter((row) => sm[row.reg_no] === 'absent').length;
  }, 0), [courseBlocks, statusMaps]);

  const setStatus = (sessionKey: string, regNo: string, status: 'present' | 'absent') => {
    if (!sessionKey || lockMaps[sessionKey]) return;
    writeAttendanceStatus(sessionKey, regNo, status);
    setStatusMaps((prev) => ({
      ...prev,
      [sessionKey]: { ...(prev[sessionKey] || {}), [regNo]: status },
    }));
  };

  const handleSaveAttendance = (sessionKey: string) => {
    if (!sessionKey || lockMaps[sessionKey]) return;
    if (window.confirm('Are you sure you want to save the attendance? Once saved, absent students will not be in the dummy generation list.')) {
      writeAttendanceLock(sessionKey, true);
      setLockMaps((prev) => ({ ...prev, [sessionKey]: true }));
    }
  };

  const openUnlockConfirm = (sessionKey: string) => {
    if (!sessionKey || !lockMaps[sessionKey]) return;
    setUnlockTargetSession(sessionKey);
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

      writeAttendanceLock(unlockTargetSession, false);
      setLockMaps((prev) => ({ ...prev, [unlockTargetSession]: false }));
      setShowPasswordModal(false);
      setPasswordInput('');
      setUnlockTargetSession('');
    } catch (err: any) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setValidatingPassword(false);
    }
  };

  const closePdfPreview = () => {
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPdfPreviewFileName('');
    setPdfPreviewTitle('');
  };

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const sanitizeFileName = (value: string) =>
    String(value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 120);

  const downloadFromPreview = () => {
    if (!pdfPreviewUrl || !pdfPreviewFileName) return;
    const anchor = document.createElement('a');
    anchor.href = pdfPreviewUrl;
    anchor.download = pdfPreviewFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const previewAttendancePdf = async (block: CourseBlock) => {
    const sm = statusMaps[block.sessionKey] || {};
    const presentRows = block.rows.filter((row) => (sm[row.reg_no] || 'present') === 'present');

    if (presentRows.length === 0) {
      alert('No present students to include in PDF for this course.');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const headerTop = 5;
    const detailsTop = 43;
    const tableTop = 50;
    const footerY = pageHeight - 14;
    const rowsPerColumn = 20;
    const columnsPerPage = 3;
    const rowsPerPage = rowsPerColumn * columnsPerPage;
    const totalPages = Math.max(1, Math.ceil(presentRows.length / rowsPerPage));

    let bannerDataUrl = '';
    let logoDataUrl = '';
    try {
      bannerDataUrl = await imageUrlToDataUrl(newBannerSrc);
    } catch {
      bannerDataUrl = '';
    }
    try {
      logoDataUrl = await imageUrlToDataUrl(krLogoSrc);
    } catch {
      logoDataUrl = '';
    }

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      if (pageIndex > 0) doc.addPage();

      if (bannerDataUrl) {
        const props = doc.getImageProperties(bannerDataUrl);
        const bannerHeight = 36;
        const bannerWidth = (props.width * bannerHeight) / props.height;
        doc.addImage(bannerDataUrl, 'PNG', margin, headerTop, bannerWidth, bannerHeight);
      }

      if (logoDataUrl) {
        const props = doc.getImageProperties(logoDataUrl);
        const logoHeight = 16;
        const logoWidth = (props.width * logoHeight) / props.height;
        doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - logoWidth, headerTop, logoWidth, logoHeight);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Examination Date: ${block.meta.examDate || attendanceDate}`, margin, detailsTop);
      doc.text(`Session: ${block.meta.examSession}`, margin + 95, detailsTop);
      doc.text(`Course Code: ${block.meta.courseCode || 'NO_CODE'}`, margin + 135, detailsTop);
      doc.text(`Course Name: ${block.meta.courseName}`, margin, detailsTop + 6);

      const usableWidth = pageWidth - margin * 2;
      const groupGap = 4;
      const groupWidth = (usableWidth - groupGap * 2) / 3;
      const snoWidth = 12;
      const attendanceWidth = 22;
      const regWidth = groupWidth - snoWidth - attendanceWidth;

      const tableBottom = footerY - 10;
      const headerHeight = 7;
      const rowHeight = (tableBottom - tableTop - headerHeight) / rowsPerColumn;

      for (let group = 0; group < columnsPerPage; group += 1) {
        const groupX = margin + group * (groupWidth + groupGap);
        const groupStartIndex = pageIndex * rowsPerPage + group * rowsPerColumn;
        const remainingForGroup = presentRows.length - groupStartIndex;
        const rowsInGroup = Math.min(rowsPerColumn, Math.max(remainingForGroup, 0));

        if (rowsInGroup <= 0) {
          continue;
        }

        doc.setFillColor(245, 245, 245);
        doc.rect(groupX, tableTop, groupWidth, headerHeight, 'F');
        doc.rect(groupX, tableTop, groupWidth, headerHeight);
        doc.line(groupX + snoWidth, tableTop, groupX + snoWidth, tableTop + headerHeight);
        doc.line(groupX + snoWidth + regWidth, tableTop, groupX + snoWidth + regWidth, tableTop + headerHeight);

        doc.setFontSize(9);
        doc.text('S.No', groupX + 3, tableTop + 4.7);
        doc.text('Register Number', groupX + snoWidth + 2, tableTop + 4.7);
        doc.text('Attendance', groupX + snoWidth + regWidth + 2, tableTop + 4.7);

        for (let r = 0; r < rowsInGroup; r += 1) {
          const y = tableTop + headerHeight + r * rowHeight;
          doc.rect(groupX, y, groupWidth, rowHeight);
          doc.line(groupX + snoWidth, y, groupX + snoWidth, y + rowHeight);
          doc.line(groupX + snoWidth + regWidth, y, groupX + snoWidth + regWidth, y + rowHeight);

          const absoluteIndex = pageIndex * rowsPerPage + group * rowsPerColumn + r;
          if (absoluteIndex < presentRows.length) {
            const serialNo = absoluteIndex + 1;
            const regNo = presentRows[absoluteIndex].reg_no;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text(String(serialNo), groupX + 2.5, y + rowHeight * 0.67);
            doc.text(regNo, groupX + snoWidth + 2, y + rowHeight * 0.67);
          }
        }
      }

      const lineY = footerY - 4;
      doc.line(margin, lineY, margin + 55, lineY);
      doc.line(pageWidth - margin - 55, lineY, pageWidth - margin, lineY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Chief Superintendent', margin, footerY + 2);
      doc.text('COE', pageWidth - margin - 10, footerY + 2);
    }

    const fileName = sanitizeFileName(
      `attendance_${block.meta.courseCode || 'NO_CODE'}_${block.meta.examDate || attendanceDate}_${block.meta.examSession}.pdf`
    );

    const blob = doc.output('blob');
    const previewUrl = URL.createObjectURL(blob);
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
    setPdfPreviewFileName(fileName);
    setPdfPreviewTitle(`${block.meta.courseCode} - ${block.meta.courseName}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {showPasswordModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96">
            <h2 className="text-lg font-bold mb-2">Confirm Edit</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please enter your login password to unlock editing.
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
                {validatingPassword ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pdfPreviewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-6xl rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Attendance PDF Preview{pdfPreviewTitle ? ` - ${pdfPreviewTitle}` : ''}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadFromPreview}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Download
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
              <iframe title="Attendance PDF Preview" src={pdfPreviewUrl} className="w-full h-full" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#deb9ac] bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#5b1a30]">COE Attendance</h1>
          <p className="mt-2 text-sm text-[#6a4a40]">
            Mark students as Present or Absent. Attendance opens only for courses with TT date matching the selected date.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-department">
              Department
            </label>
            <select
              id="coe-attendance-department"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
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
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-semester">
              Semester
            </label>
            <select
              id="coe-attendance-semester"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
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

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-date">
              Attendance Date
            </label>
            <input
              id="coe-attendance-date"
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-course">
              Course
            </label>
            <select
              id="coe-attendance-course"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              value={selectedCourseKey}
              onChange={(e) => setSelectedCourseKey(e.target.value)}
            >
              <option value="">All Courses ({courseBlocks.length})</option>
              {courseBlocks.map((block) => (
                <option key={block.meta.key} value={block.meta.key}>
                  {block.meta.courseName} ({block.meta.courseCode})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="coe-attendance-search">
              Search Register Number
            </label>
            <div className="flex gap-2">
              <input
                id="coe-attendance-search"
                type="text"
                value={searchRegNo}
                onChange={(e) => setSearchRegNo(e.target.value)}
                placeholder="Enter register number..."
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              />
              {searchRegNo && (
                <button
                  onClick={() => setSearchRegNo('')}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-[#ead7d0] bg-[#faf4f0] px-3 py-2 text-sm text-[#6a4a40]">
          {courseBlocks.length > 0
            ? `${courseBlocks.length} course(s) scheduled for ${attendanceDate}: ${courseBlocks.map((b) => b.meta.courseName).join(', ')}`
            : 'No TT course found for this date. Please set TT date from Course List.'}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-700">Present: {totalPresent}</span>
          <span className="rounded-md bg-red-50 px-3 py-1.5 text-red-700">Absent: {totalAbsent}</span>
          <span className="rounded-md bg-slate-50 px-3 py-1.5 text-slate-700">Total: {totalRows}</span>
        </div>
      </div>

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading students...</div> : null}
      {!loading && error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!loading && !error ? (
        courseBlocks.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <p className="text-sm text-gray-600">No TT-enabled course is open for attendance on {attendanceDate}.</p>
          </div>
        ) : visibleBlocks.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <p className="text-sm text-gray-600">No matching students found{searchRegNo ? ` for "${searchRegNo}"` : ''}.</p>
          </div>
        ) : (
          visibleBlocks.map((block) => {
            const sm = statusMaps[block.sessionKey] || {};
            const locked = lockMaps[block.sessionKey] || false;
            const blockPresent = block.rows.filter((r) => (sm[r.reg_no] || 'present') === 'present').length;
            const blockAbsent = block.rows.filter((r) => sm[r.reg_no] === 'absent').length;

            return (
              <div key={block.sessionKey} className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{block.meta.courseName}</h3>
                    <p className="text-xs font-medium text-gray-500">{block.meta.courseCode || 'NO_CODE'} | {block.meta.department} | {block.meta.examDate} | {block.meta.examSession}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">{blockPresent} P</span>
                    <span className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">{blockAbsent} A</span>
                    <button
                      onClick={() => void previewAttendancePdf(block)}
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-700"
                    >
                      PDF Preview
                    </button>
                    {locked ? (
                      <button
                        onClick={() => openUnlockConfirm(block.sessionKey)}
                        className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm bg-yellow-600 hover:bg-yellow-700"
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSaveAttendance(block.sessionKey)}
                        className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm bg-blue-600 hover:bg-blue-700"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>

                {block.rows.length === 0 ? (
                  <p className="text-sm text-gray-600">No students found for this course.</p>
                ) : (
                  block.rows.map((row) => {
                    const status = sm[row.reg_no] || 'present';
                    const radioName = `attendance-${block.sessionKey}-${row.reg_no}`;
                    return (
                      <div key={`${row.reg_no}-${block.meta.key}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-base font-semibold text-gray-900">{row.name || 'Unnamed Student'}</p>
                            <p className="text-xs font-medium text-gray-500">{row.reg_no} | {row.department} | {semester}</p>
                          </div>
                          <div className="inline-flex items-center gap-4 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="radio"
                                name={radioName}
                                checked={status === 'present'}
                                onChange={() => setStatus(block.sessionKey, row.reg_no, 'present')}
                                disabled={locked}
                              />
                              Present
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="radio"
                                name={radioName}
                                checked={status === 'absent'}
                                onChange={() => setStatus(block.sessionKey, row.reg_no, 'absent')}
                                disabled={locked}
                              />
                              Absent
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        )
      ) : null}
    </div>
  );
}
