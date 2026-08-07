import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchEventAnalytics,
  getEventAnalyticsExcelUrl,
} from '../../../services/eventAttending';
import type { EventAnalyticsResponse } from '../../../services/eventAttending';
import { BarChart3, Download, RefreshCw, FileSpreadsheet, IndianRupee, FileCheck2, Building2, ChevronDown } from 'lucide-react';

export default function AnalyticsTab() {
  const [data, setData] = useState<EventAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const [deptFilter, setDeptFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchEventAnalytics({
        department: deptFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setData(res);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load analytics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [deptFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = getEventAnalyticsExcelUrl({
        department: deptFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      const { apiClient } = await import('../../../services/auth');
      const res = await apiClient.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'event_analytics.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      console.error('Download error:', err);
      let msg = err.message || String(err);
      if (err.response && err.response.data && err.response.data instanceof Blob) {
         try {
             const text = await err.response.data.text();
             msg = text;
         } catch(e) {}
      }
      alert('Failed to download: ' + msg);
    } finally {
      setDownloading(false);
    }
  };

  const forms = data?.forms ?? [];
  const totalAmount = data?.total_amount ?? 0;

  const summaryCards = [
    {
      label: 'Total Forms Approved',
      value: data?.total_count ?? 0,
      icon: <FileCheck2 size={22} />,
      gradient: 'from-blue-500 to-blue-700',
      textColor: 'text-blue-50',
    },
    {
      label: 'Total Amount Disbursed',
      value: `₹${totalAmount.toLocaleString('en-IN')}`,
      icon: <IndianRupee size={22} />,
      gradient: 'from-emerald-500 to-emerald-700',
      textColor: 'text-emerald-50',
    },
    {
      label: 'Departments',
      value: new Set(forms.map((f) => f.department)).size,
      icon: <Building2 size={22} />,
      gradient: 'from-violet-500 to-violet-700',
      textColor: 'text-violet-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" />
          Event Analytics Report
        </h3>
        <button
          onClick={handleDownload}
          disabled={downloading || loading || forms.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
        >
          {downloading
            ? <><RefreshCw size={14} className="animate-spin" /> Preparing…</>
            : <><FileSpreadsheet size={14} /> Download Excel</>}
        </button>
      </div>

      {/* Filters card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filters</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Department */}
          <div className="relative">
            <label className="block text-xs text-gray-500 font-medium mb-1">Department</label>
            <div className="relative">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 pr-8 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-gray-800"
              >
                <option value="">All Departments</option>
                {(data?.departments ?? []).map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
          {/* From date */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {/* To date */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-sm">Loading analytics…</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className={`bg-gradient-to-br ${card.gradient} rounded-2xl p-5 shadow-md`}
              >
                <div className={`flex items-center gap-2 mb-3 ${card.textColor} opacity-80`}>
                  {card.icon}
                  <span className="text-xs font-semibold uppercase tracking-wide">{card.label}</span>
                </div>
                <p className={`text-3xl font-extrabold ${card.textColor}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {forms.length === 0 ? (
            <div className="flex flex-col items-center py-20 bg-white border border-gray-200 rounded-2xl text-gray-400">
              <BarChart3 size={48} className="mb-3 opacity-20" />
              <p className="font-semibold text-gray-500">No approved forms found</p>
              <p className="text-xs mt-1">Try adjusting the filters above</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Scrollable container with sticky header */}
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-sm border-collapse min-w-[640px]">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-14">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Staff Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">OD Type</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Approved Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Approved Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forms.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-100 transition-colors hover:bg-blue-50/50 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                        }`}
                      >
                        <td className="px-4 py-3.5 text-gray-400 text-xs font-mono">{idx + 1}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-gray-800">{row.staff_name}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-gray-600">{row.department}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-semibold">
                            {row.od_type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="font-bold text-emerald-700 text-sm">
                            ₹{row.grand_total.toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg font-medium">
                            {row.approved_at}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Sticky totals footer */}
                  <tfoot className="sticky bottom-0 bg-slate-800 text-white">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-300 text-right">
                        TOTAL ({forms.length} {forms.length === 1 ? 'form' : 'forms'})
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-extrabold text-emerald-300 text-base">
                          ₹{totalAmount.toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
