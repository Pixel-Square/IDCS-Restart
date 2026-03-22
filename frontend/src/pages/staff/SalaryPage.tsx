import React, { useEffect, useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { getMySalaryReceipts } from '../../services/staffSalary';

function monthToken(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SalaryPage() {
  const [month, setMonth] = useState(monthToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);

  const loadReceipts = async (targetMonth?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMySalaryReceipts(targetMonth || month);
      setReceipts(data?.results || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load salary receipts');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts(month);
  }, [month]);

  const activeReceipt = receipts[0] || null;
  const r = activeReceipt?.receipt || {};

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-sm text-slate-700">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="block border rounded px-3 py-2"
              />
            </div>
            <button
              onClick={() => loadReceipts(month)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Salary Receipt</h2>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading receipt...
            </div>
          ) : !activeReceipt ? (
            <div className="text-slate-600">No published salary receipt for {month}.</div>
          ) : !activeReceipt.is_salary_included ? (
            <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              Salary was not processed for this month.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">Staff ID:</span> <span className="font-semibold">{r.staff_id}</span></div>
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">Name:</span> <span className="font-semibold">{r.staff_name}</span></div>
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">Department:</span> <span className="font-semibold">{r.department?.name || 'N/A'}</span></div>
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">Published At:</span> <span className="font-semibold">{new Date(activeReceipt.published_at).toLocaleString()}</span></div>
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">Basic Salary:</span> <span className="font-semibold">{Number(r.basic_salary || 0).toFixed(2)}</span></div>
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">Allowance:</span> <span className="font-semibold">{Number(r.allowance || 0).toFixed(2)}</span></div>
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">PF Amount:</span> <span className="font-semibold">{Number(r.pf_amount || 0).toFixed(2)}</span></div>
              <div className="p-3 rounded bg-slate-50"><span className="text-slate-500">Total Salary:</span> <span className="font-semibold">{Number(r.total_salary || 0).toFixed(2)}</span></div>
              <div className="p-3 rounded bg-blue-50 md:col-span-2 text-blue-900 border border-blue-100">
                <span className="text-blue-700">Net Salary:</span> <span className="font-bold text-lg ml-2">{Number(r.net_salary || 0).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
