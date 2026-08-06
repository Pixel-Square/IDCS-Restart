import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { Download, Upload, FileSpreadsheet, Check, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';

interface Props {
  collegeId: number;
  collegeName: string;
  onImportComplete: () => void;
}

type Step = 'select-role' | 'upload' | 'result';

interface ImportResult {
  created: number;
  updated: number;
  total_rows: number;
  failed: { row: number; error: string; data?: string[] }[];
}

export default function CollegeUsersImport({ collegeId, collegeName, onImportComplete }: Props) {
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('STUDENT');
  const [step, setStep] = useState<Step>('select-role');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/accounts/roles/');
        if (res.ok) {
          const data = await res.json();
          setRoles(data.roles || []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const primaryRoles = ['STUDENT', 'FACULTY'];
  const otherRoles = roles.filter(r => !primaryRoles.includes(r));

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await fetchWithAuth(`/api/college/colleges/${collegeId}/users/import-template/?role=${selectedRole}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${collegeName.replace(/\s+/g, '_')}_${selectedRole}_template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || 'Download failed');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.xlsx')) setFile(f);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('role', selectedRole);
      const res = await fetchWithAuth(`/api/college/colleges/${collegeId}/users/import/`, {
        method: 'POST',
        body: formData,
        headers: {},  // let browser set multipart boundary
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ created: 0, updated: 0, total_rows: 0, failed: [{ row: 0, error: data.detail || 'Import failed' }] });
      } else {
        setResult(data);
      }
      setStep('result');
    } catch (e: any) {
      setResult({ created: 0, updated: 0, total_rows: 0, failed: [{ row: 0, error: e.message || 'Network error' }] });
      setStep('result');
    } finally {
      setUploading(false);
    }
  };

  const resetFlow = () => {
    setStep('select-role');
    setFile(null);
    setResult(null);
    setSelectedRole('STUDENT');
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-0 mb-8">
        {['Select Role', 'Upload File', 'Results'].map((label, i) => {
          const stepIdx = i;
          const currentIdx = step === 'select-role' ? 0 : step === 'upload' ? 1 : 2;
          const isActive = stepIdx === currentIdx;
          const isDone = stepIdx < currentIdx;
          return (
            <React.Fragment key={label}>
              {i > 0 && (
                <div className={`w-16 h-0.5 ${isDone ? 'bg-blue-500' : 'bg-gray-200'}`} />
              )}
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' :
                  isDone ? 'bg-blue-500 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {isDone ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${isActive ? 'text-blue-700' : 'text-gray-400'}`}>{label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: Select Role */}
      {step === 'select-role' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Select Role to Import</h2>
          <p className="text-sm text-gray-500 mb-6">Choose the user type you want to import. The Excel template will be customized based on this selection.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {/* Primary roles */}
            {primaryRoles.map(r => (
              <button
                key={r}
                onClick={() => setSelectedRole(r)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selectedRole === r
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold text-gray-900">{r}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {r === 'STUDENT' ? 'Import students with register number, batch, degree, branch' :
                   'Import faculty/staff with staff ID, department, designation'}
                </div>
              </button>
            ))}
          </div>

          {/* Others */}
          {otherRoles.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Other Roles</label>
              <div className="relative">
                <select
                  value={primaryRoles.includes(selectedRole) ? '' : selectedRole}
                  onChange={e => { if (e.target.value) setSelectedRole(e.target.value); }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm appearance-none"
                >
                  <option value="">Choose another role...</option>
                  {otherRoles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors border border-blue-200"
            >
              {downloadingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Template
            </button>
            <button
              onClick={() => setStep('upload')}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md"
            >
              Next: Upload File
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload */}
      {step === 'upload' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Upload {selectedRole} Data</h2>
          <p className="text-sm text-gray-500 mb-6">
            Upload the filled Excel template. Passwords will be set to the Register Number (students) or Staff ID (staff).
            Users will be prompted to change their password on first login.
          </p>

          {/* Drop zone */}
          <div
            onDrop={handleFileDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
              dragOver ? 'border-blue-500 bg-blue-50' :
              file ? 'border-green-400 bg-green-50' :
              'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <FileSpreadsheet className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-green-800">{file.name}</p>
                  <p className="text-xs text-green-600">{(file.size / 1024).toFixed(1)} KB • Ready to upload</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="text-xs text-gray-500 hover:text-red-500 underline"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-gray-100 rounded-xl">
                  <Upload className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-700">Drag & drop your .xlsx file here</p>
                  <p className="text-xs text-gray-400">or click to browse</p>
                </div>
              </div>
            )}
            <input
              id="file-input"
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="flex items-center justify-between pt-6">
            <button
              onClick={() => { setStep('select-role'); setFile(null); }}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
              ) : (
                <><Upload className="w-4 h-4" /> Import Users</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 'result' && result && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Import Results</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{result.created}</p>
              <p className="text-xs text-green-600 font-medium">Created / Updated</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-red-700">{result.failed.length}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{result.total_rows}</p>
              <p className="text-xs text-blue-600 font-medium">Total Rows</p>
            </div>
          </div>

          {result.created > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Password Notice</p>
                  <p className="text-xs text-amber-700 mt-1">
                    All imported users have their {selectedRole === 'STUDENT' ? 'Register Number' : 'Staff ID'} set as their initial password.
                    They will be prompted to change it on their first login.
                  </p>
                </div>
              </div>
            </div>
          )}

          {result.failed.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-red-700 mb-2">Failed Rows</h3>
              <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-red-100">
                      <th className="text-left px-3 py-2 font-semibold text-red-800">Row</th>
                      <th className="text-left px-3 py-2 font-semibold text-red-800">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.failed.map((f, i) => (
                      <tr key={i} className="border-t border-red-100">
                        <td className="px-3 py-2 text-red-700">{f.row}</td>
                        <td className="px-3 py-2 text-red-600">{f.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              onClick={resetFlow}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Import More
            </button>
            <button
              onClick={onImportComplete}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md"
            >
              <Check className="w-4 h-4" /> View Users
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
