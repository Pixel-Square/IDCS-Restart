import React, { useEffect, useState } from 'react';
import { fetchExternalStaff, assignExternalCodes, type ExternalStaffProfile } from '../../services/coe';

export default function ExternalManagementPage() {
  const [staff, setStaff] = useState<ExternalStaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadStaff = async () => {
    try {
      setLoading(true);
      const data = await fetchExternalStaff();
      setStaff(data);
      setError(null);
    } catch (err) {
      setError('Failed to connect to the database and load external staff members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleAssignCodes = async () => {
    if (!confirm('Are you sure you want to assign random 6-digit codes to all external faculties for ESV portal login?')) return;
    try {
      setProcessing(true);
      const res = await assignExternalCodes();
      alert(res.message || 'Login codes assigned successfully.');
      await loadStaff();
    } catch (err) {
      alert('Failed to assign codes. Please check backend connectivity.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">External Management</h1>
          <p className="text-sm text-gray-500">Manage external faculty ESV portal access</p>
        </div>
        <button
          onClick={handleAssignCodes}
          disabled={processing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md shadow-md disabled:opacity-50 transition-all font-semibold"
        >
          {processing ? 'Generating Codes...' : 'Assign Number'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      <div className="bg-white shadow-sm border border-gray-200 overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff ID</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Faculty Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ESV Login Code</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                    Connecting to Database...
                  </div>
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">No valid external faculty records found in database.</td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id || s.staff_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.staff_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {s.first_name} {s.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.department_name || 'General'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${s.login_code ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                      {s.login_code || 'NOT ASSIGNED'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
