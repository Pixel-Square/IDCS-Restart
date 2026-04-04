import React, { useState, useEffect, useRef, useMemo } from 'react';
import fetchWithAuth from '../services/fetchAuth';
import { getQuestions, type QpType, type Question } from '../stores/qpStore';

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

function readStoredMarkQpType(dummyNumber: string): QpType | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(`marks_type_${dummyNumber}`);
  const qpType = String(stored || '').trim().toUpperCase();
  return qpType === 'QP1' || qpType === 'QP2' || qpType === 'TCPR' || qpType === 'TCPL' || qpType === 'OE' ? (qpType as QpType) : null;
}

function getCachedMe(): any | null {
  try {
    const raw = localStorage.getItem('me');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface BarScanMarkEntryProps {
  embeddedCode?: string;
  embeddedRegNo?: string;
  embeddedName?: string;
  embeddedQpType?: string;
  embeddedDept?: string;
  embeddedSem?: string;
  embeddedDummy?: string;
  onClose?: () => void;
  onNextScan?: (code: string) => void;
}

export default function BarScanMarkEntry({ 
  embeddedCode, 
  embeddedRegNo,
  embeddedName,
  embeddedQpType,
  embeddedDept,
  embeddedSem,
  embeddedDummy,
  onClose, 
  onNextScan 
}: BarScanMarkEntryProps = {}) {
  const code = embeddedCode || '';
  const queryRegNo = embeddedRegNo;
  const queryName = embeddedName;
  const queryDummy = embeddedDummy;
  const queryDept = embeddedDept;
  const querySem = embeddedSem;
  const storedQpType = queryDummy ? readStoredMarkQpType(queryDummy) : null;
  const queryQpType = storedQpType || embeddedQpType;

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
  
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const entryScannerRef = React.useRef<HTMLInputElement>(null);
  const [backgroundScanCode, setBackgroundScanCode] = useState<string>('');

  useEffect(() => {
    const focusScanner = () => {
      if (!isLocked && document.activeElement?.tagName === 'INPUT' && document.activeElement?.getAttribute('type') === 'number') {
        return;
      }
      if (showPasswordModal) return;
      entryScannerRef.current?.focus();
    };
    
    focusScanner();
    window.addEventListener('click', focusScanner);
    return () => window.removeEventListener('click', focusScanner);
  }, [isLocked, showPasswordModal]);

  const handleBackgroundScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (backgroundScanCode && onNextScan) {
      onNextScan(backgroundScanCode);
      setBackgroundScanCode('');
    }
  };

  const loadSavedMarks = (dummy: string, fallbackQp: QpType = 'QP1'): QpType => {
    const stored = localStorage.getItem(`marks_${dummy}`);
    const storedQp = localStorage.getItem(`marks_type_${dummy}`);
    const finalQp = (storedQp === 'QP2' || storedQp === 'TCPR' || storedQp === 'TCPL' || storedQp === 'OE' || storedQp === 'QP1') ? storedQp as QpType : fallbackQp;

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

    if (queryRegNo && queryName && queryQpType) {
       const qpTypeRaw = String(queryQpType).toUpperCase();
       const qpType: QpType = (qpTypeRaw === 'QP2' || qpTypeRaw === 'TCPR' || qpTypeRaw === 'TCPL' || qpTypeRaw === 'OE') ? qpTypeRaw as QpType : 'QP1';
       setStudent({
          id: 0,
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
    }

    let active = true;
    (async () => {
      if (!queryRegNo) setLoading(true);
      setError(null);
      try {
        const lookupCode = queryRegNo || code;
        const res = await fetchWithAuth(`/api/academics/student/lookup/${encodeURIComponent(lookupCode)}/`);
        if (!active) return;
        if (!res.ok) {
           if (!queryRegNo) {
             const fallbackQp = loadSavedMarks(lookupCode, (queryQpType as QpType) || 'QP1');
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
        const dbQpType = String(data.qp_type || 'QP1').toUpperCase();
        const urlQpType = queryQpType ? String(queryQpType).toUpperCase() : null;

        let qpTypeRaw = 'QP1';
        if (urlQpType === 'QP1' || urlQpType === 'QP2' || urlQpType === 'TCPR' || urlQpType === 'TCPL' || urlQpType === 'OE') {
          qpTypeRaw = urlQpType;
        } else {
          qpTypeRaw = dbQpType;
        }

        const qpType: QpType = (qpTypeRaw === 'QP2' || qpTypeRaw === 'TCPR' || qpTypeRaw === 'TCPL' || qpTypeRaw === 'OE') ? qpTypeRaw as QpType : 'QP1';
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
           const fallbackQp = loadSavedMarks(code, (queryQpType as QpType) || 'QP1');
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

    return () => { active = false; };
  }, [code, queryRegNo, queryName, queryQpType, queryDummy]);

  const handleSaveMarks = async () => {
    if (!student) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const dummyKey = student.dummy_number || student.reg_no;
      localStorage.setItem(`marks_${dummyKey}`, JSON.stringify(marks));
      localStorage.setItem(`marks_type_${dummyKey}`, student.qp_type);

      // Interconnectivity: Dispatch event for ESV main table
      window.dispatchEvent(new CustomEvent('esv-marks-updated'));
      
      // Interconnectivity: Dispatch event for COE pages
      window.dispatchEvent(new CustomEvent('coe-marks-updated', { 
        detail: { dummy: dummyKey, marks, qpType: student.qp_type } 
      }));

      // Broadcast to other tabs
      const bc = new BroadcastChannel('idcs-marks-sync');
      bc.postMessage({ type: 'UPDATE', dummy: dummyKey, marks, qpType: student.qp_type });
      bc.close();

      setSaved(true);
      setIsLocked(true);
      setTimeout(() => { entryScannerRef.current?.focus(); }, 0);
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
      if (!identifier) throw new Error('User identifier not found. Please log in again.');
      
      const res = await fetchWithAuth('/api/accounts/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password: passwordInput })
      });
      if (!res.ok) throw new Error('Invalid password');
      
      setIsLocked(false);
      setSaved(false);
      setShowPasswordModal(false);
      setPasswordInput('');
    } catch (err: any) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setValidatingPassword(false);
    }
  };

  const questions = useMemo(() => getQuestions(student?.qp_type || 'QP1'), [student?.qp_type]);

  const handleMarkChange = (key: string, value: string, max: number) => {
    if (isLocked) return;
    const num = value === '' ? null : parseInt(value, 10);
    if (num !== null && (isNaN(num) || num < 0 || num > max)) {
       setValidationNote(`Max mark for ${key.toUpperCase()} is ${max}`);
       setTimeout(() => setValidationNote(null), 2000);
       return;
    }
    setMarks(prev => ({ ...prev, [key]: value }));
  };

  const calculateTotal = () => {
    return questions.reduce((sum, q) => {
      const val = parseInt(marks[q.key] || '0', 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-4 space-y-4">
      <form onSubmit={handleBackgroundScan} className="absolute left-[-9999px] top-0 m-0 p-0 overflow-hidden">
         <input ref={entryScannerRef} type="text" value={backgroundScanCode} onChange={(e) => setBackgroundScanCode(e.target.value)} autoComplete="off" className="opacity-0 w-0 h-0" tabIndex={-1} />
      </form>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96">
            <h2 className="text-lg font-bold mb-2">Confirm Edit</h2>
            <p className="text-sm text-gray-600 mb-4">Please enter your login password to edit marks.</p>
            <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePasswordConfirm(); } }} className="w-full border border-gray-300 p-2 rounded mb-2 focus:outline-none focus:border-blue-500" placeholder="Password" />
            {passwordError && <p className="text-red-600 text-xs mb-4">{passwordError}</p>}
            <div className="flex justify-end space-x-3 mt-2">
              <button onClick={() => { setShowPasswordModal(false); setPasswordError(''); setPasswordInput(''); }} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">Cancel</button>
              <button onClick={handlePasswordConfirm} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50" disabled={validatingPassword}>{validatingPassword ? 'Verifying...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-900">Barcode Mark Entry</h1>
        </div>
        {student && (
          <div>
            {isLocked ? (
              <button onClick={() => setShowPasswordModal(true)} className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors bg-yellow-600 hover:bg-yellow-700 focus:outline-none">Edit Marks</button>
            ) : (
              <button ref={saveButtonRef} onClick={handleSaveMarks} disabled={saving} className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${saving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>{saving ? 'Saving...' : 'Save Marks'}</button>
            )}
          </div>
        )}
      </div>

      {saved && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 font-medium">Marks saved successfully for Dummy: {student?.dummy_number || student?.reg_no}</div>}
      {validationNote && <div className="fixed bottom-4 right-4 z-50 rounded shadow-lg bg-gray-800 text-white px-4 py-3 text-sm font-medium transition-opacity duration-300">{validationNote}</div>}

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading scanned details...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!loading && !error && student && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-gray-500 uppercase font-semibold">Dummy Number</p><p className="font-mono text-lg font-bold text-blue-600">{student.dummy_number}</p></div>
              <div><p className="text-xs text-gray-500 uppercase font-semibold">QP Type</p><p className="font-bold">{student.qp_type}</p></div>
              <div><p className="text-xs text-gray-500 uppercase font-semibold">Status</p><p className={`font-bold ${student.status === 'Active' ? 'text-green-600' : 'text-gray-600'}`}>{student.status}</p></div>
              <div><p className="text-xs text-gray-500 uppercase font-semibold">Department</p><p className="font-bold">{student.department}</p></div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
              {questions.map((q) => (
                <div key={q.key} className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase">{q.label} <span className="text-gray-400 normal-case">(Max {q.max})</span></label>
                  <input
                    type="number"
                    value={marks[q.key] || ''}
                    onChange={(e) => handleMarkChange(q.key, e.target.value, q.max)}
                    disabled={isLocked}
                    className="w-full p-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none disabled:bg-gray-100 font-bold"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600 uppercase">Total</label>
                <div className="w-full p-2 bg-blue-50 border border-blue-200 rounded text-blue-700 font-black text-center">{calculateTotal()}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
