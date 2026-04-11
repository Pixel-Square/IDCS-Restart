import React, { useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';

export default function AddStudentModal({ open, elective, onClose, onStudentAdded }: {
  open: boolean,
  elective: any,
  onClose: () => void,
  onStudentAdded: () => void
}) {
  const [regNo, setRegNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  React.useEffect(() => {
    setRegNo('');
    setError(null);
    setSuccess(null);
  }, [open, elective]);

  if (!open || !elective) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const regNoTrimmed = regNo.trim();
      // 1. Proceed to add the student; backend enforces all validations:
      // - student existence
      // - batch-wise allowed parent groups
      // - one elective per parent group
      const resp = await fetchWithAuth('/api/curriculum/elective-choices/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elective_subject_id: elective.id,
          student_reg_no: regNoTrimmed,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || data?.detail || 'Failed to add student');
      }

      // 2. Verify that the student now appears in the selected elective list.
      const verifyResp = await fetchWithAuth(
        `/api/curriculum/elective-choices/?elective_subject_id=${encodeURIComponent(String(elective.id))}&student_reg_no=${encodeURIComponent(regNoTrimmed)}&include_inactive=true&page_size=10`,
      );
      if (!verifyResp.ok) {
        throw new Error('Student was saved but verification failed. Please refresh and verify.');
      }
      const verifyData = await verifyResp.json();
      const verifyResults = Array.isArray(verifyData?.results) ? verifyData.results : (Array.isArray(verifyData) ? verifyData : []);
      const existsInElectiveList = verifyResults.some(
        (row: any) =>
          String(row?.student_reg_no || '').trim().toLowerCase() === regNoTrimmed.toLowerCase() &&
          Number(row?.elective_subject_id) === Number(elective.id),
      );
      if (!existsInElectiveList) {
        throw new Error('Student was saved but not visible in elective list yet. Please refresh and verify.');
      }

      setSuccess('Student added successfully');
      setRegNo('');
      onStudentAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
        <h2 className="text-xl font-bold mb-4">Add Elective Student</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-1">Elective</label>
              <input type="text" value={elective.course_name} disabled className="w-full rounded border border-slate-300 px-3 py-2 bg-slate-100 text-slate-700" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-1">Course Code</label>
              <input type="text" value={elective.course_code} disabled className="w-full rounded border border-slate-300 px-3 py-2 bg-slate-100 text-slate-700" />
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-semibold mb-1">Student Reg No</label>
            <input
              type="text"
              value={regNo}
              onChange={e => setRegNo(e.target.value)}
              placeholder="Enter Registration Number"
              className="w-full rounded border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div className="col-span-2 flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >Cancel</button>
            <button
              type="submit"
              disabled={loading || !regNo.trim()}
              className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60"
            >{loading ? 'Adding...' : 'Submit'}</button>
          </div>
          {error && <div className="col-span-2 text-red-600 text-sm mt-2">{error}</div>}
          {success && <div className="col-span-2 text-green-600 text-sm mt-2">{success}</div>}
        </form>
      </div>
    </div>
  );
}