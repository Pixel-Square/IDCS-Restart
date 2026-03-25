import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { getCachedMe } from '../../services/auth';

type QpType = 'QP1' | 'QP2' | 'TCPR';

type StudentDetails = {
  id: number;
  reg_no: string;
  name: string;
  department: string;
  batch: string;
  section: string;
  status: string;
  dummy_number: string | null;
  qp_type: QpType;
  semester?: string;
};

type Question = { key: string; label: string; max: number };

function getQuestions(qpType: QpType): Question[] {
  if (qpType === 'TCPR') {
    return Array.from({ length: 12 }, (_, i) => {
      const idx = i + 1;
      return { key: `q${idx}`, label: `Q${idx}`, max: idx <= 8 ? 2 : 16 };
    });
  }

  if (qpType === 'QP2') {
    return [
      { key: 'q1', label: 'Q1', max: 2 },
      { key: 'q2', label: 'Q2', max: 2 },
      { key: 'q3', label: 'Q3', max: 2 },
      { key: 'q4', label: 'Q4', max: 2 },
      { key: 'q5', label: 'Q5', max: 2 },
      { key: 'q6', label: 'Q6', max: 2 },
      { key: 'q7', label: 'Q7', max: 2 },
      { key: 'q8', label: 'Q8', max: 2 },
      { key: 'q9', label: 'Q9', max: 2 },
      { key: 'q10', label: 'Q10', max: 2 },
      { key: 'q11', label: 'Q11', max: 14 },
      { key: 'q12', label: 'Q12', max: 14 },
      { key: 'q13', label: 'Q13', max: 14 },
      { key: 'q14', label: 'Q14', max: 14 },
      { key: 'q15', label: 'Q15', max: 14 },
      { key: 'q16', label: 'Q16', max: 10 },
    ];
  }

  return [
    { key: 'q1', label: 'Q1', max: 2 },
    { key: 'q2', label: 'Q2', max: 2 },
    { key: 'q3', label: 'Q3', max: 2 },
    { key: 'q4', label: 'Q4', max: 2 },
    { key: 'q5', label: 'Q5', max: 2 },
    { key: 'q6', label: 'Q6', max: 2 },
    { key: 'q7', label: 'Q7', max: 2 },
    { key: 'q8', label: 'Q8', max: 2 },
    { key: 'q9', label: 'Q9', max: 2 },
    { key: 'q10', label: 'Q10', max: 2 },
    { key: 'q11', label: 'Q11', max: 16 },
    { key: 'q12', label: 'Q12', max: 16 },
    { key: 'q13', label: 'Q13', max: 16 },
    { key: 'q14', label: 'Q14', max: 16 },
    { key: 'q15', label: 'Q15', max: 16 },
  ];
}

export default function BarScanMarkEntry() {
  const [searchParams] = useSearchParams();
  const code = String(searchParams.get('code') || '').trim();
  const queryRegNo = searchParams.get('reg_no');
  const queryName = searchParams.get('name');
  const queryQpType = searchParams.get('qp_type');
  const queryDummy = searchParams.get('dummy_number');
  const queryDept = searchParams.get('dept');
  const querySem = searchParams.get('sem');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [validationNote, setValidationNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [validatingPassword, setValidatingPassword] = useState(false);

  const loadSavedMarks = (dummy: string, fallbackQp: QpType = 'QP1'): QpType => {
    const stored = localStorage.getItem(`marks_${dummy}`);
    const storedQp = localStorage.getItem(`marks_type_${dummy}`);
    const finalQp = (storedQp === 'QP2' || storedQp === 'TCPR' || storedQp === 'QP1') ? storedQp as QpType : fallbackQp;

    if (stored) {
      setMarks(JSON.parse(stored));
      setIsLocked(true);
      setSaved(true);
    }
    
    return finalQp;
  };

  useEffect(() => {
    if (!code && !queryRegNo) {
      setError('Missing barcode code.');
      return;
    }

    // Use query params immediately if we have enough info to render the form.
    // This avoids "Unable to load student details" for unsaved dummies.
    if (queryRegNo && queryName && queryQpType) {
       const qpTypeRaw = String(queryQpType).toUpperCase();
       const qpType: QpType = qpTypeRaw === 'QP2' || qpTypeRaw === 'TCPR' ? qpTypeRaw as QpType : 'QP1';
       setStudent({
          id: 0, // Mock ID
          reg_no: queryRegNo,
          name: queryName,
          department: queryDept || '-',
          batch: '-',
          section: '-',
          status: 'Active',
          dummy_number: queryDummy || code,
          qp_type: qpType,
          semester: querySem || '-',
       });
       loadSavedMarks(queryDummy || code);
       // Optional: We can still fetch details in background to fill department/batch/etc
       // but we don't throw an error if it fails since we have enough to show the form.
    }

    let active = true;
    (async () => {
      // Only show loading if we don't have basic student info already
      if (!queryRegNo) setLoading(true);
      setError(null);
      try {
        const lookupCode = queryRegNo || code;
        const res = await fetchWithAuth(`/api/academics/student/lookup/${encodeURIComponent(lookupCode)}/`);
        if (!active) return;
        if (!res.ok) {
          if (!queryRegNo) {
             // Form fallback for unknown/unsaved scanned dummy numbers
             const fallbackQp = loadSavedMarks(lookupCode, 'QP1');
             setStudent({
                id: 0,
                reg_no: '-',
                name: '-',
                department: '-',
                batch: '-',
                section: '-',
                status: 'Unknown',
                dummy_number: lookupCode,
                qp_type: fallbackQp,
                semester: '-',
             });
          }
          return;
        }
        const data = await res.json();
        
        // URL qp_type is the source of truth for mark-entry layout when provided.
        const dbQpType = String(data.qp_type || 'QP1').toUpperCase();
        const urlQpType = queryQpType ? String(queryQpType).toUpperCase() : null;

        let qpTypeRaw = 'QP1';
        if (urlQpType === 'QP1' || urlQpType === 'QP2' || urlQpType === 'TCPR') {
          qpTypeRaw = urlQpType;
        } else {
          qpTypeRaw = dbQpType;
        }

        const qpType: QpType = (qpTypeRaw === 'QP2' || qpTypeRaw === 'TCPR') ? qpTypeRaw as QpType : 'QP1';

        const finalDummy = queryDummy || data.dummy_number || code;
        setStudent({
          id: data.id,
          reg_no: data.reg_no,
          name: data.name,
          department: queryDept || data.department,
          batch: data.batch,
          section: data.section,
          status: data.status,
          dummy_number: finalDummy,
          qp_type: qpType,
          semester: querySem || '-',
        });
        loadSavedMarks(finalDummy);
      } catch {
        if (!active) return;
        if (!queryRegNo) {
           // Provide fallback on network error so table is still usable
           const fallbackQp = loadSavedMarks(code, 'QP1');
           setStudent({
              id: 0,
              reg_no: '-',
              name: '-',
              department: '-',
              batch: '-',
              section: '-',
              status: 'Network Error',
              dummy_number: code,
              qp_type: fallbackQp,
              semester: '-',
           });
        }
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [code, queryRegNo, queryName, queryQpType, queryDummy]);

  const handleSaveMarks = async () => {
    if (!student) return;

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // In a real implementation, we would send this to the backend endpoint.
      // E.g., await fetchWithAuth('/api/coe/marks/save', { method: 'POST', body: JSON.stringify(...) });
      
      // Simulating network delay for save
      await new Promise(resolve => setTimeout(resolve, 800));
      
      localStorage.setItem(`marks_${student.dummy_number || student.reg_no}`, JSON.stringify(marks));
      localStorage.setItem(`marks_type_${student.dummy_number || student.reg_no}`, student.qp_type);
      
      console.log('Saved marks for', student.dummy_number || student.reg_no, ':', marks);
      setSaved(true);
      setIsLocked(true);
    } catch (err) {
      setError('Failed to save marks. Please try again.');
    } finally {
      setSaving(false);
    }
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
        body: JSON.stringify({ identifier, password: passwordInput })
      });
      
      if (!res.ok) {
        throw new Error('Invalid password');
      }
      
      setIsLocked(false);
      setSaved(false); // Enable editing again
      setShowPasswordModal(false);
      setPasswordInput('');
    } catch (err: any) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setValidatingPassword(false);
    }
  };

  const questions = useMemo(() => getQuestions(student?.qp_type || 'QP1'), [student?.qp_type]);

  return (
    <>
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96">
            <h2 className="text-lg font-bold mb-2">Confirm Edit</h2>
            <p className="text-sm text-gray-600 mb-4">Please enter your login password to edit marks.</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full border border-gray-300 p-2 rounded mb-2 focus:outline-none focus:border-blue-500"
              placeholder="Password"
            />
            {passwordError && <p className="text-red-600 text-xs mb-4">{passwordError}</p>}
            <div className="flex justify-end space-x-3 mt-2">
              <button
                onClick={() => { setShowPasswordModal(false); setPasswordError(''); setPasswordInput(''); }}
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
      )}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Barcode Mark Entry</h1>
            <p className="mt-2 text-sm text-gray-600">Dummy-based mark entry sheet generated from QP type.</p>
          </div>
          {student && (
            <div>
              {isLocked ? (
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-yellow-600 hover:bg-yellow-700 focus:outline-none"
                >
                  Edit Marks
                </button>
              ) : (
                <button
                  onClick={handleSaveMarks}
                  disabled={saving}
                  className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
                    saving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {saving ? 'Saving...' : 'Save Marks'}
                </button>
              )}
            </div>
          )}
        </div>

      {saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 font-medium">
          Marks saved successfully for Dummy: {student?.dummy_number || student?.reg_no}
        </div>
      )}

      {validationNote && (
        <div className="fixed bottom-4 right-4 z-50 rounded shadow-lg bg-gray-800 text-white px-4 py-3 text-sm font-medium transition-opacity duration-300">
          {validationNote}
        </div>
      )}

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading scanned details...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!loading && !error && student ? (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
              <div>
                <span className="block text-gray-500 mb-1">Dummy Number</span>
                <span className="font-mono text-lg font-bold text-blue-700">{student.dummy_number || '-'}</span>
              </div>
              <div>
                <span className="block text-gray-500 mb-1">QP Type</span>
                <span className="font-semibold text-gray-900">{student.qp_type}</span>
              </div>
              <div>
                <span className="block text-gray-500 mb-1">Department</span>
                <span className="font-semibold text-gray-900">{student.department}</span>
              </div>
              <div>
                <span className="block text-gray-500 mb-1">Semester</span>
                <span className="font-semibold text-gray-900">{student.semester || '-'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border border-gray-200 bg-white text-sm text-gray-700">
              <thead>
                <tr className="bg-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <th className="px-3 py-2">Dummy No</th>
                  {questions.map((q) => (
                    <th key={`head-${q.key}`} className="px-3 py-2 text-center">{q.label}</th>
                  ))}
                  <th className="px-3 py-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 font-semibold font-mono text-blue-700">{student.dummy_number || '-'}</td>
                  {questions.map((q) => (
                    <td key={`input-${q.key}`} className="px-2 py-2 text-center relative group">
                      <input
                        type="number"
                        min={0}
                        max={q.max}
                        value={marks[q.key] || ''}
                        disabled={isLocked}
                        onChange={(e) => {
                          let val = e.target.value;
                          
                          if (val !== '') {
                            const num = Number(val);
                            if (num < 0) return;
                            if (num > q.max) {
                              setValidationNote(`Note: Maximum marks allowed for ${q.label} is ${q.max}`);
                              setTimeout(() => setValidationNote(null), 3000);
                              return; // Don't take the mark inside the box
                            }
                          }
                          setValidationNote(null);
                          setMarks((prev) => ({ ...prev, [q.key]: val }));
                        }}
                        className={`w-20 rounded border px-2 py-1 text-center focus:outline-none focus:border-blue-500 ${
                          isLocked 
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200' 
                            : 'border-gray-300'
                        }`}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold">
                    {questions.reduce((sum, q) => {
                      const n = Number(marks[q.key]);
                      return Number.isFinite(n) ? sum + n : sum;
                    }, 0)}
                  </td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-3 py-2 font-semibold">Max</td>
                  {questions.map((q) => (
                    <td key={`max-${q.key}`} className="px-3 py-2 text-center font-semibold text-gray-700">{q.max}</td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold text-gray-700">
                    {questions.reduce((sum, q) => sum + q.max, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
    </>
  );
}
