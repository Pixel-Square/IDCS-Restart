import React, { useEffect, useState } from 'react';
import {
  CoeArrearRecord,
  bulkUpsertCoeArrears,
  deleteCoeArrear,
  fetchCoeArrears,
} from '../../services/coe';
import {
  appendRetrivalEntry,
  clearRetrivalApplyPayload,
  readRetrivalApplyPayload,
} from '../../utils/retrivalStore';

type ArrearStudent = {
  id?: number;
  batch: string;
  dept: string;
  sem: string;
  courseCode: string;
  courseName: string;
  registerNumber: string;
  studentName: string;
};

const defaultRow: ArrearStudent = {
  batch: '',
  dept: '',
  sem: '',
  courseCode: '',
  courseName: '',
  registerNumber: '',
  studentName: '',
};

const isEmptyArrearRow = (row: ArrearStudent) =>
  [row.batch, row.dept, row.sem, row.courseCode, row.courseName, row.registerNumber, row.studentName]
    .every((value) => String(value ?? '').trim() === '');

const arrearLocationKey = (row: ArrearStudent) =>
  [row.batch, row.dept, row.sem, row.courseCode, row.courseName, row.registerNumber]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('::');

const arrearDeptSemKey = (row: ArrearStudent) =>
  [row.dept, row.sem]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('::');

const ArrearList: React.FC = () => {
  const [rows, setRows] = useState<ArrearStudent[]>([defaultRow]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<CoeArrearRecord[]>([]);
  const GENERAL_REMOVE_CONFIRM_MESSAGE = 'Are you sure you want to remove this item?';

  const toArrearStudent = (record: Record<string, unknown>): ArrearStudent => ({
    id: typeof record.id === 'number' ? record.id : undefined,
    batch: String(record.batch ?? ''),
    dept: String(record.dept ?? record.department ?? ''),
    sem: String(record.sem ?? record.semester ?? ''),
    courseCode: String(record.courseCode ?? record.course_code ?? ''),
    courseName: String(record.courseName ?? record.course_name ?? ''),
    registerNumber: String(record.registerNumber ?? record.student_register_number ?? record.reg_no ?? ''),
    studentName: String(record.studentName ?? record.student_name ?? record.name ?? ''),
  });

  const normalizeLogRecord = (item: CoeArrearRecord): ArrearStudent => ({
    id: item.id,
    batch: String(item.batch ?? ''),
    dept: String(item.department ?? ''),
    sem: String(item.semester ?? ''),
    courseCode: String(item.course_code ?? ''),
    courseName: String(item.course_name ?? ''),
    registerNumber: String(item.student_register_number ?? ''),
    studentName: String(item.student_name ?? ''),
  });

  const requestPasswordConfirmation = (actionLabel: string): boolean => {
    const password = window.prompt(`Enter your login password to confirm ${actionLabel}:`);
    if (password === null) return false;
    if (!password.trim()) {
      window.alert('Password is required.');
      return false;
    }
    return true;
  };

  useEffect(() => {
    // Initialize with empty row for user data entry
    setLoading(false);
    setError(null);
    setRows([defaultRow]);
  }, []);

  useEffect(() => {
    const payload = readRetrivalApplyPayload();
    if (!payload || payload.target !== 'coe_arrears') return;

    const restoredRows = (payload.entry.records || [])
      .map((record) => toArrearStudent(record))
      .filter((row) =>
      [
        row.batch,
        row.dept,
        row.sem,
        row.courseCode,
        row.courseName,
        row.registerNumber,
        row.studentName,
      ].some((value) => String(value).trim() !== '')
      );

    clearRetrivalApplyPayload();
    if (!restoredRows.length) return;

    setRows(restoredRows.length ? restoredRows : [{ ...defaultRow }]);
  }, []);

  const addRow = () => {
    setRows((prev) => [...prev, { ...defaultRow }]);
  };

  const btnPrimary: React.CSSProperties = {
    backgroundColor: '#2563eb',
    color: '#fff',
    padding: '6px 10px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const btnSuccess: React.CSSProperties = {
    backgroundColor: '#16a34a',
    color: '#fff',
    padding: '6px 10px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const btnDanger: React.CSSProperties = {
    backgroundColor: '#ef4444',
    color: '#fff',
    padding: '6px 8px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const btnNeutral: React.CSSProperties = {
    backgroundColor: '#374151',
    color: '#fff',
    padding: '6px 10px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await fetchCoeArrears();
      setLogs(res.results || []);
    } catch (err: any) {
      setLogsError(String(err?.message || err));
    } finally {
      setLogsLoading(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const xlsx = await import('xlsx');
      const wb = xlsx.read(arrayBuffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rowsRaw: any[] = xlsx.utils.sheet_to_json(ws, { header: 1 });
      if (!rowsRaw || rowsRaw.length < 2) {
        setError('Excel must have a header row and at least one data row');
        setLoading(false);
        return;
      }

      const headers: string[] = rowsRaw[0].map((h: any) => String(h || '').trim().toLowerCase());

      const findIndex = (candidates: string[]) => {
        for (const cand of candidates) {
          const idx = headers.findIndex((h) => h.includes(cand));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const idxBatch = findIndex(['batch']);
      const idxDept = findIndex(['dept', 'department']);
      const idxSem = findIndex(['sem', 'semester']);
      const idxCourseCode = findIndex(['course code', 'coursecode', 'course_code']);
      const idxCourseName = findIndex(['course name', 'coursename', 'course_name']);
      const idxRegister = findIndex(['register', 'register no', 'register no.', 'registernumber', 'regno']);
      const idxStudentName = findIndex(['student name', 'studentname', 'name']);

      const parsed: typeof defaultRow[] = [];
      for (let i = 1; i < rowsRaw.length; i++) {
        const r = rowsRaw[i];
        if (!r || r.every((c: any) => c === undefined || c === null || String(c).trim() === '')) continue;
        const rowObj: any = { ...defaultRow };
        if (idxBatch >= 0) rowObj.batch = String(r[idxBatch] ?? '').trim();
        if (idxDept >= 0) rowObj.dept = String(r[idxDept] ?? '').trim();
        if (idxSem >= 0) rowObj.sem = String(r[idxSem] ?? '').trim();
        if (idxCourseCode >= 0) rowObj.courseCode = String(r[idxCourseCode] ?? '').trim();
        if (idxCourseName >= 0) rowObj.courseName = String(r[idxCourseName] ?? '').trim();
        if (idxRegister >= 0) rowObj.registerNumber = String(r[idxRegister] ?? '').trim();
        if (idxStudentName >= 0) rowObj.studentName = String(r[idxStudentName] ?? '').trim();
        parsed.push(rowObj);
      }

      if (parsed.length === 0) {
        setError('No valid rows found in Excel');
      } else {
        setRows(parsed);
      }
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const uploadToServer = async () => {
    if (!requestPasswordConfirmation('upload to server')) return;
    setLoading(true);
    setError(null);
    try {
      // transform rows into expected payload shape (if backend expects different keys, adapt here)
      const payload = rows.map((r) => ({
        batch: r.batch,
        department: r.dept,
        semester: r.sem,
        course_code: r.courseCode,
        course_name: r.courseName,
        student_register_number: r.registerNumber,
        student_name: r.studentName,
      }));
      await bulkUpsertCoeArrears(payload);
      // simple success behaviour: reload empty row
      setRows([defaultRow]);
      if (logsOpen) {
        await fetchLogs();
      }
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLogs = async () => {
    const nextOpen = !logsOpen;
    if (nextOpen && !requestPasswordConfirmation('view logs')) return;
    setLogsOpen(nextOpen);
    if (nextOpen) {
      await fetchLogs();
    }
  };

  const removeAllLogs = async () => {
    if (!window.confirm(GENERAL_REMOVE_CONFIRM_MESSAGE)) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      const deletedRecords = logs.map(normalizeLogRecord);
      const ids = logs.map((item) => item.id).filter((id) => typeof id === 'number');
      await Promise.all(ids.map((id) => deleteCoeArrear(id)));
      appendRetrivalEntry({
        action: 'deleted',
        source: 'all_logs',
        page: 'COE Arrear List',
        records: deletedRecords,
      });
      setLogs([]);
    } catch (err: any) {
      setLogsError(String(err?.message || err));
    } finally {
      setLogsLoading(false);
    }
  };

  const handleResetAll = async () => {
    if (!requestPasswordConfirmation('reset')) return;
    setLoading(true);
    setError(null);
    try {
      setRows([defaultRow]);
      const res = await fetchCoeArrears();
      const deletedRecords = (res.results || []).map(normalizeLogRecord);
      const ids = (res.results || []).map((item) => item.id).filter((id) => typeof id === 'number');
      await Promise.all(ids.map((id) => deleteCoeArrear(id)));
      appendRetrivalEntry({
        action: 'reset',
        source: 'reset_all',
        page: 'COE Arrear List',
        records: deletedRecords,
      });
      setLogs([]);
      setLogsError(null);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (index: number, field: keyof ArrearStudent, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeRow = (index: number) => {
    if (!window.confirm(GENERAL_REMOVE_CONFIRM_MESSAGE)) return;
    setRows((prev) => {
      const removed = prev[index];
      if (removed) {
        appendRetrivalEntry({
          action: 'deleted',
          source: 'draft_row',
          page: 'COE Arrear List',
          records: [{ ...removed, draft_index: index }],
        });
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div style={{ padding: 16, maxHeight: 'calc(100vh - 96px)', overflow: 'auto' }}>
      <h1>COE Arrear List</h1>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {loading && <div>Loading...</div>}
      {!loading && (
        <>
          <div style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, padding: '8px 0' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={addRow} style={btnPrimary}>
                Add student
              </button>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFile(e.target.files ? e.target.files[0] : null)}
              />
              <button type="button" onClick={uploadToServer} disabled={rows.length === 0} style={btnSuccess}>
                Upload to server
              </button>
              <button type="button" onClick={handleToggleLogs} style={btnNeutral}>
                {logsOpen ? 'Hide Logs' : 'Logs'}
              </button>
              <button type="button" onClick={handleResetAll} style={btnDanger}>
                Reset
              </button>
            </div>
          </div>
          {logsOpen ? (
            <div style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, background: '#f9fafb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Added Arrear Logs ({logs.length})</strong>
                <button
                  type="button"
                  onClick={removeAllLogs}
                  style={btnDanger}
                  disabled={logsLoading || logs.length === 0}
                >
                  Remove All
                </button>
              </div>
              {logsError ? <div style={{ color: '#b91c1c', marginBottom: 8 }}>{logsError}</div> : null}
              {logsLoading ? (
                <div>Loading logs...</div>
              ) : logs.length === 0 ? (
                <div>No arrear logs found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #d1d5db', padding: 6 }}>Dept</th>
                        <th style={{ border: '1px solid #d1d5db', padding: 6 }}>Sem</th>
                        <th style={{ border: '1px solid #d1d5db', padding: 6 }}>Course Code</th>
                        <th style={{ border: '1px solid #d1d5db', padding: 6 }}>Reg No</th>
                        <th style={{ border: '1px solid #d1d5db', padding: 6 }}>Name</th>
                        <th style={{ border: '1px solid #d1d5db', padding: 6 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((item) => (
                        <tr key={item.id}>
                          <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{item.department}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{item.semester}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{item.course_code}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{item.student_register_number}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>{item.student_name}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: 6 }}>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm(GENERAL_REMOVE_CONFIRM_MESSAGE)) return;
                                try {
                                  setLogsLoading(true);
                                  await deleteCoeArrear(item.id as number);
                                  appendRetrivalEntry({
                                    action: 'deleted',
                                    source: 'single_log',
                                    page: 'COE Arrear List',
                                    records: [normalizeLogRecord(item)],
                                  });
                                  setLogs((prev) => prev.filter((l) => l.id !== item.id));
                                } catch (err: any) {
                                  setLogsError(String(err?.message || err));
                                } finally {
                                  setLogsLoading(false);
                                }
                              }}
                              style={{ ...btnDanger, padding: '4px 8px', fontSize: 12 }}
                              disabled={logsLoading}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
          <div style={{ marginTop: 16, overflow: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc' }}>Batch</th>
                <th style={{ border: '1px solid #ccc' }}>Dept</th>
                <th style={{ border: '1px solid #ccc' }}>Sem</th>
                <th style={{ border: '1px solid #ccc' }}>Course Code</th>
                <th style={{ border: '1px solid #ccc' }}>Course Name</th>
                <th style={{ border: '1px solid #ccc' }}>Register No</th>
                <th style={{ border: '1px solid #ccc' }}>Student Name</th>
                <th style={{ border: '1px solid #ccc' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #ccc' }}>
                    <input
                      value={row.batch}
                      onChange={(e) => updateRow(idx, 'batch', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc' }}>
                    <input
                      value={row.dept}
                      onChange={(e) => updateRow(idx, 'dept', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc' }}>
                    <input
                      value={row.sem}
                      onChange={(e) => updateRow(idx, 'sem', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc' }}>
                    <input
                      value={row.courseCode}
                      onChange={(e) => updateRow(idx, 'courseCode', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc' }}>
                    <input
                      value={row.courseName}
                      onChange={(e) => updateRow(idx, 'courseName', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc' }}>
                    <input
                      value={row.registerNumber}
                      onChange={(e) => updateRow(idx, 'registerNumber', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc' }}>
                    <input
                      value={row.studentName}
                      onChange={(e) => updateRow(idx, 'studentName', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc' }}>
                    <button type="button" onClick={() => removeRow(idx)} style={btnDanger}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default ArrearList;
