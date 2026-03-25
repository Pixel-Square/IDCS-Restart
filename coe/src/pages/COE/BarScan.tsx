import React, { useState, useEffect, useRef } from 'react';
import { ScanLine, User, CreditCard, School } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';

interface StudentDetails {
  id: number;
  reg_no: string;
  name: string;
  department: string;
  batch: string;
  section: string;
  status: string;
  mobile: string;
  email: string;
  profile_image: string | null;
  dummy_number?: string | null;
  qp_type?: 'QP1' | 'QP2' | 'TCPR';
}

export default function BarScan() {
  const [scannedCode, setScannedCode] = useState<string>('');
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  
  // This input captures the barcode scanner output
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount/click to ensure scanner input is captured
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    window.addEventListener('click', focusInput);
    return () => window.removeEventListener('click', focusInput);
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedCode.trim()) return;

    setLoading(true);
    setError(null);
    setStudent(null);
    const code = scannedCode.trim();
    const targetUrl = new URL(`/coe/bar-scan/entry?code=${encodeURIComponent(code)}`, window.location.origin).toString();

    // Open the mark entry page immediately so each scan gets its own tab.
    const popup = window.open(targetUrl, '_blank');
    if (!popup) {
      setError('Popup blocked. Please allow popups for this site.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/academics/student/lookup/${encodeURIComponent(code)}/`);
      if (res.ok) {
        const data = await res.json();
        setStudent(data);
        setLastScanned(code);
      } else {
        if (res.status === 404) {
          setError(`Student with code "${code}" not found.`);
        } else {
          setError('Error fetching student details.');
        }
      }
    } catch (err) {
      setError('Network error occurred.');
    } finally {
      setLoading(false);
      setScannedCode(''); // Clear input for next scan
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-140px)]">
        
        {/* Left Panel: Scanner Input & Status */}
        <div className="w-full md:w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <ScanLine className="w-8 h-8 text-blue-600" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-800 mb-2">Barcode Scanner</h2>
          <p className="text-sm text-gray-500 text-center mb-8">
            Ensure the scanner is connected. Click anywhere on this page to activate scan mode.
          </p>

          <form onSubmit={handleScan} className="w-full">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={scannedCode}
                onChange={(e) => setScannedCode(e.target.value)}
                className="w-full p-4 text-center text-lg font-mono border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors bg-blue-50"
                placeholder="Ready to Scan..."
                autoFocus
                autoComplete="off"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                   <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
            
            {/* Hidden submit button to allow Enter key to submit */}
            <button type="submit" className="hidden" />
          </form>

          <div className="mt-8 w-full">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Scanner Status</h3>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded border border-green-100">
               <span className="flex items-center gap-2 text-sm text-green-700 font-medium">
                 <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                 Active / Listening
               </span>
               <span className="text-xs text-green-600">Keyboard Mode</span>
            </div>
          </div>

          {lastScanned && (
            <div className="mt-4 w-full text-center">
               <span className="text-xs text-gray-400">Last Scanned:</span>
               <div className="font-mono text-gray-600 font-medium">{lastScanned}</div>
            </div>
          )}
          
          {error && (
            <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm text-center w-full animate-fade-in">
              {error}
            </div>
          )}
        </div>

        {/* Right Panel: Student Details */}
        <div className="w-full md:w-2/3 bg-white rounded-xl shadow-sm border border-gray-200 p-0 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
             <h2 className="text-lg font-semibold text-gray-700">Student Details</h2>
             {student && (
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {student.status}
                </span>
             )}
          </div>

          <div className="flex-1 p-8 flex flex-col justify-center items-center">
            {student ? (
              <div className="w-full max-w-2xl bg-white animate-fade-in-up">
                 <div className="flex flex-col md:flex-row gap-8 items-start">
                    {/* Profile Image */}
                    <div className="w-32 h-32 md:w-48 md:h-48 rounded-lg overflow-hidden border-4 border-white shadow-md bg-gray-200 flex-shrink-0 mx-auto md:mx-0">
                      {student.profile_image ? (
                        <img src={student.profile_image} alt={student.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <User size={64} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-4 text-center md:text-left">
                       <div>
                         <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{student.name}</h1>
                         <p className="text-lg text-blue-600 font-medium font-mono mt-1">{student.reg_no}</p>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-6">
                          <div className="flex items-center gap-3 md:justify-start justify-center">
                             <School className="w-5 h-5 text-gray-400" />
                             <div>
                               <p className="text-xs text-gray-500 uppercase">Department</p>
                               <p className="font-medium text-gray-800">{student.department || '-'}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-3 md:justify-start justify-center">
                             <CreditCard className="w-5 h-5 text-gray-400" />
                             <div>
                               <p className="text-xs text-gray-500 uppercase">Batch / Section</p>
                               <p className="font-medium text-gray-800">{student.batch} / {student.section}</p>
                             </div>
                          </div>
                          
                          {/* Additional fields can be added here */}
                       </div>
                    </div>
                 </div>
              </div>
            ) : (
               <div className="text-center py-20 opacity-50">
                  <User className="w-24 h-24 mx-auto text-gray-300 mb-4" />
                  <p className="text-xl text-gray-400 font-medium">No student data loaded</p>
                  <p className="text-sm text-gray-400">Scan a barcode to view details</p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
