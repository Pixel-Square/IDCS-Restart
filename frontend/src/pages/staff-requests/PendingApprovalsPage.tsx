import React, { useState, useEffect, useRef } from 'react';
import { Eye, RefreshCw, CheckCircle, XCircle, Clock, Search, Filter, ChevronLeft, ChevronRight, ChevronDown, Download, RotateCcw } from 'lucide-react';
import { getPendingApprovals, getMyApprovals, processApproval, getRequest } from '../../services/staffRequests';

const MultiSelectDropdown = ({ options, selectedValues, onChange, placeholder }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter((v: string) => v !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  return (
    <div className="relative inline-block w-full sm:w-48" ref={dropdownRef}>
      <div 
        className="border border-gray-300 rounded-lg text-sm py-2 px-3 bg-white cursor-pointer flex justify-between items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate pr-2 text-gray-700">
          {selectedValues.length === 0 ? placeholder : `${selectedValues.length} selected`}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No options available</div>
          ) : (
            options.map((opt: string) => (
              <label key={opt} className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedValues.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm truncate text-gray-700">{opt}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
};
import type { StaffRequest } from '../../types/staffRequests';
import RequestDetailsModal from './RequestDetailsModal';
import { formatShortFormValue } from './formValueUtils';

interface QuickAction {
  request: StaffRequest;
  type: 'approve' | 'reject';
}

export default function PendingApprovalsPage() {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewRequest, setViewRequest] = useState<StaffRequest | null>(null);
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyViewRequest, setHistoryViewRequest] = useState<StaffRequest | null>(null);
  const [loadingHistoryRequest, setLoadingHistoryRequest] = useState(false);

  const [pendingSearchQuery, setPendingSearchQuery] = useState('');
  const [pendingFilterTypes, setPendingFilterTypes] = useState<string[]>([]);
  const [pendingFilterDepartments, setPendingFilterDepartments] = useState<string[]>([]);
  const [pendingFilterFromDate, setPendingFilterFromDate] = useState('');
  const [pendingFilterToDate, setPendingFilterToDate] = useState('');
  const [pendingCurrentPage, setPendingCurrentPage] = useState(1);

  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyFilterTypes, setHistoryFilterTypes] = useState<string[]>([]);
  const [historyFilterDepartments, setHistoryFilterDepartments] = useState<string[]>([]);
  const [historyFilterStatus, setHistoryFilterStatus] = useState('all');
  const [historyFilterFromDate, setHistoryFilterFromDate] = useState('');
  const [historyFilterToDate, setHistoryFilterToDate] = useState('');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 10;

  const load = async (showRefresh = false) => {
    showRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await getPendingApprovals();
      setRequests([...data].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load pending approvals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadHistory = async () => {
    try {
      const h = await getMyApprovals();
      setHistory([...h].sort((a: any, b: any) =>
        new Date(b.action_date).getTime() - new Date(a.action_date).getTime()
      ));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadHistory();
  }, []);

  const getFirstTextFieldValue = (req: StaffRequest): string => {
    // Find first text or textarea field
    if (req.template?.form_schema?.length > 0) {
      const textField = req.template.form_schema.find(f => f.type === 'text' || f.type === 'textarea');
      if (textField && req.form_data[textField.name]) {
        return formatShortFormValue(req.form_data[textField.name]);
      }
    }
    return '—';
  };

  const getFirstTextFieldLabel = (req: StaffRequest): string => {
    // Find first text or textarea field in template schema
    if (req.template?.form_schema?.length > 0) {
      const textField = req.template.form_schema.find(f => f.type === 'text' || f.type === 'textarea');
      if (textField) return textField.label;
    }
    return 'Details';
  };

  const openQuickAction = (req: StaffRequest, type: 'approve' | 'reject') => {
    setQuickAction({ request: req, type });
    setActionComment('');
    setActionError(null);
  };

  const submitQuickAction = async () => {
    if (!quickAction) return;
    if (quickAction.type === 'reject' && !actionComment.trim()) {
      setActionError('Rejection reason is required');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await processApproval(quickAction.request.id, {
        action: quickAction.type,
        comments: actionComment.trim(),
      });
      setQuickAction(null);
      await Promise.all([load(), loadHistory()]);
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || `Failed to ${quickAction.type} request`);
    } finally {
      setSubmitting(false);
    }
  };

  const openHistoryRequest = async (id: number) => {
    setLoadingHistoryRequest(true);
    try {
      const req = await getRequest(id);
      setHistoryViewRequest(req);
    } catch (e) {
      alert('Failed to load request details');
    } finally {
      setLoadingHistoryRequest(false);
    }
  };

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-600">
        Loading pending approvals…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* ── Pending Approvals ── */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pending Approvals</h2>
            <p className="text-sm text-gray-500 mt-1">
              {requests.length} request{requests.length !== 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by name, ID, or form content..."
                value={pendingSearchQuery}
                onChange={(e) => { setPendingSearchQuery(e.target.value); setPendingCurrentPage(1); }}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <MultiSelectDropdown
              options={Array.from(new Set(requests.map(r => r.template?.name).filter(Boolean)))}
              selectedValues={pendingFilterTypes}
              onChange={(vals: string[]) => { setPendingFilterTypes(vals); setPendingCurrentPage(1); }}
              placeholder="Request Types"
            />
            <MultiSelectDropdown
              options={Array.from(new Set(requests.map(r => (r.applicant as any).department).filter(Boolean)))}
              selectedValues={pendingFilterDepartments}
              onChange={(vals: string[]) => { setPendingFilterDepartments(vals); setPendingCurrentPage(1); }}
              placeholder="Departments"
            />
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">From:</label>
              <input
                type="date"
                value={pendingFilterFromDate}
                onChange={(e) => { setPendingFilterFromDate(e.target.value); setPendingCurrentPage(1); }}
                className="border border-gray-300 rounded-lg text-sm py-2 px-3 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">To:</label>
              <input
                type="date"
                value={pendingFilterToDate}
                min={pendingFilterFromDate || undefined}
                onChange={(e) => { setPendingFilterToDate(e.target.value); setPendingCurrentPage(1); }}
                className="border border-gray-300 rounded-lg text-sm py-2 px-3 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {(pendingSearchQuery || pendingFilterTypes.length > 0 || pendingFilterDepartments.length > 0 || pendingFilterFromDate || pendingFilterToDate) && (
              <button
                onClick={() => { setPendingSearchQuery(''); setPendingFilterTypes([]); setPendingFilterDepartments([]); setPendingFilterFromDate(''); setPendingFilterToDate(''); setPendingCurrentPage(1); }}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            )}
            <div className="ml-auto relative group">
              <button className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <Download className="w-4 h-4" /> Download
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover:block group-focus-within:block">
                <button
                  onClick={async () => {
                    const lq = pendingSearchQuery.toLowerCase();
                    const fr = requests.filter(req => {
                      const mT = pendingFilterTypes.length === 0 || (req.template?.name && pendingFilterTypes.includes(req.template.name));
                      const reqDept = (req.applicant as any).department ? String((req.applicant as any).department) : null;
                      const mD = pendingFilterDepartments.length === 0 || (reqDept && pendingFilterDepartments.includes(reqDept));
                      let mS = true;
                      if (lq) {
                        const sid = (req.applicant.staff_id || '').toLowerCase();
                        const nm = (req.applicant.full_name || req.applicant.username || '').toLowerCase();
                        const tp = (req.template?.name || '').toLowerCase();
                        const fd = Object.values(req.form_data || {}).join(' ').toLowerCase();
                        mS = sid.includes(lq) || nm.includes(lq) || tp.includes(lq) || fd.includes(lq);
                      }
                      let mDate = true;
                      if (pendingFilterFromDate || pendingFilterToDate) {
                        const c = req.created_at.slice(0, 10);
                        if (pendingFilterFromDate && c < pendingFilterFromDate) mDate = false;
                        if (pendingFilterToDate && c > pendingFilterToDate) mDate = false;
                      }
                      return mT && mD && mS && mDate;
                    });
                    const XLSX = await import('xlsx');
                    const headers = ['#', 'Staff ID', 'Name', 'Department', 'Form', 'Submitted'];
                    const rows = fr.map((r, i) => [i+1, r.applicant.staff_id||'', r.applicant.full_name||r.applicant.username, (r.applicant as any).department||'', r.template?.name||'', new Date(r.created_at).toLocaleDateString('en-IN')]);
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Pending Approvals');
                    XLSX.writeFile(wb, 'pending_approvals.xlsx');
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >📊 Download as Excel</button>
                <button
                  onClick={() => {
                    const lq = pendingSearchQuery.toLowerCase();
                    const fr = requests.filter(req => {
                      const mT = pendingFilterTypes.length === 0 || (req.template?.name && pendingFilterTypes.includes(req.template.name));
                      const reqDept = (req.applicant as any).department ? String((req.applicant as any).department) : null;
                      const mD = pendingFilterDepartments.length === 0 || (reqDept && pendingFilterDepartments.includes(reqDept));
                      let mS = true;
                      if (lq) {
                        const sid = (req.applicant.staff_id || '').toLowerCase();
                        const nm = (req.applicant.full_name || req.applicant.username || '').toLowerCase();
                        const tp = (req.template?.name || '').toLowerCase();
                        const fd = Object.values(req.form_data || {}).join(' ').toLowerCase();
                        mS = sid.includes(lq) || nm.includes(lq) || tp.includes(lq) || fd.includes(lq);
                      }
                      let mDate = true;
                      if (pendingFilterFromDate || pendingFilterToDate) {
                        const c = req.created_at.slice(0, 10);
                        if (pendingFilterFromDate && c < pendingFilterFromDate) mDate = false;
                        if (pendingFilterToDate && c > pendingFilterToDate) mDate = false;
                      }
                      return mT && mD && mS && mDate;
                    });
                    const base = window.location.origin;
                    const logoLeft = `${base}/logo left indent.png`;
                    const logoRight = `${base}/logo.png`;
                    const win = window.open('', '_blank')!;
                    win.document.write(`<html><head><title>Pending Approvals</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f3f4f6}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px}.header img{height:60px;object-fit:contain}.report-title{text-align:center;flex:1}</style></head><body>`);
                    win.document.write(`<div class="header"><img src="${logoLeft}" alt="Logo Left"/><div class="report-title"><h2 style="margin:0;font-size:18px">Pending Approvals Report</h2><p style="margin:4px 0 0;color:#6b7280;font-size:13px">Generated: ${new Date().toLocaleString('en-IN')}</p></div><img src="${logoRight}" alt="Logo Right"/></div>`);
                    win.document.write(`<table><thead><tr><th>#</th><th>Staff ID</th><th>Name</th><th>Department</th><th>Form</th><th>Submitted</th></tr></thead><tbody>`);
                    fr.forEach((r, i) => { win.document.write(`<tr><td>${i+1}</td><td>${r.applicant.staff_id||''}</td><td>${r.applicant.full_name||r.applicant.username}</td><td>${(r.applicant as any).department||''}</td><td>${r.template?.name||''}</td><td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td></tr>`); });
                    win.document.write(`</tbody></table></body></html>`);
                    win.document.close(); win.print();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
                >🖨️ Download as PDF</button>
              </div>
            </div>
          </div>
        </div>

        {(() => {
          const lowerQuery = pendingSearchQuery.toLowerCase();
          const filteredPending = requests.filter(req => {
            const matchesType = pendingFilterTypes.length === 0 || (req.template?.name && pendingFilterTypes.includes(req.template.name));
            const reqDept = (req.applicant as any).department ? String((req.applicant as any).department) : null;
            const matchesDept = pendingFilterDepartments.length === 0 || (reqDept && pendingFilterDepartments.includes(reqDept));
            let matchesSearch = true;
            if (lowerQuery) {
              const staffId = (req.applicant.staff_id || '').toLowerCase();
              const name = (req.applicant.full_name || req.applicant.username || '').toLowerCase();
              const typeName = (req.template?.name || '').toLowerCase();
              const formDataStr = Object.values(req.form_data || {}).join(' ').toLowerCase();
              const dateStr = new Date(req.created_at).toLocaleDateString('en-IN').toLowerCase();
              matchesSearch = staffId.includes(lowerQuery) || name.includes(lowerQuery) || typeName.includes(lowerQuery) || formDataStr.includes(lowerQuery) || dateStr.includes(lowerQuery);
            }
            let matchesDate = true;
            if (pendingFilterFromDate || pendingFilterToDate) {
              const created = req.created_at.slice(0, 10);
              if (pendingFilterFromDate && created < pendingFilterFromDate) matchesDate = false;
              if (pendingFilterToDate && created > pendingFilterToDate) matchesDate = false;
            }
            return matchesType && matchesDept && matchesSearch && matchesDate;
          });
          
          const totalPages = Math.ceil(filteredPending.length / ITEMS_PER_PAGE) || 1;
          const paginatedPending = filteredPending.slice((pendingCurrentPage - 1) * ITEMS_PER_PAGE, pendingCurrentPage * ITEMS_PER_PAGE);

          if (filteredPending.length === 0) {
            return (
              <div className="text-center py-16 text-gray-500">
                <Clock size={48} className="mx-auto mb-4 text-gray-300" />
                <p>No pending approvals found.</p>
              </div>
            );
          }

          return (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Staff ID</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Form</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Reason</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Submitted</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Actions</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedPending.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {req.applicant.staff_id || req.applicant.username}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {req.applicant.full_name || req.applicant.username}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{req.template.name}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="block text-xs text-gray-400 mb-0.5">{getFirstTextFieldLabel(req)}</span>
                      <span>{getFirstTextFieldValue(req)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(req.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openQuickAction(req, 'approve')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle size={13} /> Approve
                        </button>
                        <button
                          onClick={() => openQuickAction(req, 'reject')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setViewRequest(req)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View full details"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-gray-50 px-6 py-3 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{(pendingCurrentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium">{Math.min(pendingCurrentPage * ITEMS_PER_PAGE, filteredPending.length)}</span> of <span className="font-medium">{filteredPending.length}</span> requests
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPendingCurrentPage(p => Math.max(1, p - 1))}
                  disabled={pendingCurrentPage === 1}
                  className="p-1.5 rounded-md border text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600">
                  Page {pendingCurrentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setPendingCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={pendingCurrentPage === totalPages}
                  className="p-1.5 rounded-md border text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      );
    })()}
      </div>

      {/* ── Approval History ── */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-900">Your Approval History</h3>
        </div>
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search history by name, ID, or reason..."
                value={historySearchQuery}
                onChange={(e) => { setHistorySearchQuery(e.target.value); setHistoryCurrentPage(1); }}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <MultiSelectDropdown
              options={Array.from(new Set(history.map(l => l.request_summary?.template_name).filter(Boolean)))}
              selectedValues={historyFilterTypes}
              onChange={(vals: string[]) => { setHistoryFilterTypes(vals); setHistoryCurrentPage(1); }}
              placeholder="Request Types"
            />
            <MultiSelectDropdown
              options={Array.from(new Set(history.map(l => l.request_summary?.applicant_department).filter(Boolean)))}
              selectedValues={historyFilterDepartments}
              onChange={(vals: string[]) => { setHistoryFilterDepartments(vals); setHistoryCurrentPage(1); }}
              placeholder="Departments"
            />
            <select
              value={historyFilterStatus}
              onChange={(e) => { setHistoryFilterStatus(e.target.value); setHistoryCurrentPage(1); }}
              className="w-full sm:w-32 border border-gray-300 rounded-lg text-sm py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Actions</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">From:</label>
              <input
                type="date"
                value={historyFilterFromDate}
                onChange={(e) => { setHistoryFilterFromDate(e.target.value); setHistoryCurrentPage(1); }}
                className="border border-gray-300 rounded-lg text-sm py-2 px-3 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">To:</label>
              <input
                type="date"
                value={historyFilterToDate}
                min={historyFilterFromDate || undefined}
                onChange={(e) => { setHistoryFilterToDate(e.target.value); setHistoryCurrentPage(1); }}
                className="border border-gray-300 rounded-lg text-sm py-2 px-3 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {(historySearchQuery || historyFilterTypes.length > 0 || historyFilterDepartments.length > 0 || historyFilterStatus !== 'all' || historyFilterFromDate || historyFilterToDate) && (
              <button
                onClick={() => { setHistorySearchQuery(''); setHistoryFilterTypes([]); setHistoryFilterDepartments([]); setHistoryFilterStatus('all'); setHistoryFilterFromDate(''); setHistoryFilterToDate(''); setHistoryCurrentPage(1); }}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            )}
            <div className="ml-auto relative group">
              <button className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <Download className="w-4 h-4" /> Download
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover:block group-focus-within:block">
                <button
                  onClick={async () => {
                    const lq = historySearchQuery.toLowerCase();
                    const fh = history.filter(log => {
                      const mS = historyFilterStatus === 'all' || log.action === historyFilterStatus;
                      const logDept = log.request_summary?.applicant_department;
                      const mD = historyFilterDepartments.length === 0 || (logDept && historyFilterDepartments.includes(logDept));
                      const logType = log.request_summary?.template_name;
                      const mT = historyFilterTypes.length === 0 || (logType && historyFilterTypes.includes(logType));
                      let mSr = true;
                      if (lq) {
                        const sid = (log.request_summary?.applicant_staff_id || '').toLowerCase();
                        const nm = (log.request_summary?.applicant_name || '').toLowerCase();
                        const rs = (log.request_summary?.form_reason || '').toLowerCase();
                        mSr = sid.includes(lq) || nm.includes(lq) || rs.includes(lq);
                      }
                      let mDate = true;
                      if (historyFilterFromDate || historyFilterToDate) {
                        const d = log.action_date.slice(0, 10);
                        if (historyFilterFromDate && d < historyFilterFromDate) mDate = false;
                        if (historyFilterToDate && d > historyFilterToDate) mDate = false;
                      }
                      return mS && mD && mT && mSr && mDate;
                    });
                    const XLSX = await import('xlsx');
                    const headers = ['#', 'Staff ID', 'Applicant', 'Form', 'Action', 'Date', 'Comments'];
                    const rows = fh.map((l, i) => [i+1, l.request_summary?.applicant_staff_id||'', l.request_summary?.applicant_name||'', l.request_summary?.template_name||'', l.action, new Date(l.action_date).toLocaleDateString('en-IN'), l.comments||'']);
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Approval History');
                    XLSX.writeFile(wb, 'approval_history.xlsx');
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >📊 Download as Excel</button>
                <button
                  onClick={() => {
                    const lq = historySearchQuery.toLowerCase();
                    const fh = history.filter(log => {
                      const mS = historyFilterStatus === 'all' || log.action === historyFilterStatus;
                      const logDept = log.request_summary?.applicant_department;
                      const mD = historyFilterDepartments.length === 0 || (logDept && historyFilterDepartments.includes(logDept));
                      const logType = log.request_summary?.template_name;
                      const mT = historyFilterTypes.length === 0 || (logType && historyFilterTypes.includes(logType));
                      let mSr = true;
                      if (lq) {
                        const sid = (log.request_summary?.applicant_staff_id || '').toLowerCase();
                        const nm = (log.request_summary?.applicant_name || '').toLowerCase();
                        const rs = (log.request_summary?.form_reason || '').toLowerCase();
                        mSr = sid.includes(lq) || nm.includes(lq) || rs.includes(lq);
                      }
                      let mDate = true;
                      if (historyFilterFromDate || historyFilterToDate) {
                        const d = log.action_date.slice(0, 10);
                        if (historyFilterFromDate && d < historyFilterFromDate) mDate = false;
                        if (historyFilterToDate && d > historyFilterToDate) mDate = false;
                      }
                      return mS && mD && mT && mSr && mDate;
                    });
                    const base = window.location.origin;
                    const logoLeft = `${base}/logo left indent.png`;
                    const logoRight = `${base}/logo.png`;
                    const win = window.open('', '_blank')!;
                    win.document.write(`<html><head><title>Approval History</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f3f4f6}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px}.header img{height:60px;object-fit:contain}.report-title{text-align:center;flex:1}</style></head><body>`);
                    win.document.write(`<div class="header"><img src="${logoLeft}" alt="Logo Left"/><div class="report-title"><h2 style="margin:0;font-size:18px">Approval History Report</h2><p style="margin:4px 0 0;color:#6b7280;font-size:13px">Generated: ${new Date().toLocaleString('en-IN')}</p></div><img src="${logoRight}" alt="Logo Right"/></div>`);
                    win.document.write(`<table><thead><tr><th>#</th><th>Staff ID</th><th>Applicant</th><th>Form</th><th>Action</th><th>Date</th></tr></thead><tbody>`);
                    fh.forEach((l, i) => {
                      const color = l.action === 'approved' ? '#16a34a' : '#dc2626';
                      win.document.write(`<tr><td>${i+1}</td><td>${l.request_summary?.applicant_staff_id||''}</td><td>${l.request_summary?.applicant_name||''}</td><td>${l.request_summary?.template_name||''}</td><td style="color:${color};font-weight:600">${l.action}</td><td>${new Date(l.action_date).toLocaleDateString('en-IN')}</td></tr>`);
                    });
                    win.document.write(`</tbody></table></body></html>`);
                    win.document.close(); win.print();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
                >🖨️ Download as PDF</button>
              </div>
            </div>
          </div>
        </div>

        {(() => {
          const lowerQuery = historySearchQuery.toLowerCase();
          const filteredHistory = history.filter(log => {
            const matchesStatus = historyFilterStatus === 'all' || log.action === historyFilterStatus;
            const logDept = log.request_summary?.applicant_department;
            const matchesDept = historyFilterDepartments.length === 0 || (logDept && historyFilterDepartments.includes(logDept));
            const logType = log.request_summary?.template_name;
            const matchesType = historyFilterTypes.length === 0 || (logType && historyFilterTypes.includes(logType));
            
            let matchesSearch = true;
            if (lowerQuery) {
              const staffId = (log.request_summary?.applicant_staff_id || '').toLowerCase();
              const name = (log.request_summary?.applicant_name || '').toLowerCase();
              const reason = (log.request_summary?.form_reason || '').toLowerCase();
              const dateStr = new Date(log.action_date).toLocaleDateString('en-IN').toLowerCase();
              matchesSearch = staffId.includes(lowerQuery) || name.includes(lowerQuery) || reason.includes(lowerQuery) || dateStr.includes(lowerQuery);
            }
            let matchesDate = true;
            if (historyFilterFromDate || historyFilterToDate) {
              const d = log.action_date.slice(0, 10);
              if (historyFilterFromDate && d < historyFilterFromDate) matchesDate = false;
              if (historyFilterToDate && d > historyFilterToDate) matchesDate = false;
            }
            return matchesStatus && matchesDept && matchesType && matchesSearch && matchesDate;
          });
          
          const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE) || 1;
          const paginatedHistory = filteredHistory.slice((historyCurrentPage - 1) * ITEMS_PER_PAGE, historyCurrentPage * ITEMS_PER_PAGE);

          if (filteredHistory.length === 0) {
            return (
              <div className="px-6 py-8 text-sm text-gray-500 text-center">
                No matching approval history found.
              </div>
            );
          }

          return (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Staff ID</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Applicant</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Reason</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedHistory.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {log.request_summary?.applicant_staff_id || log.request_summary?.applicant_username || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {log.request_summary?.applicant_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span>{log.request_summary?.form_reason || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          log.action === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.action === 'approved' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(log.action_date).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openHistoryRequest(log.request_id)}
                        disabled={loadingHistoryRequest}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                        title="View full request"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-gray-50 px-6 py-3 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{(historyCurrentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium">{Math.min(historyCurrentPage * ITEMS_PER_PAGE, filteredHistory.length)}</span> of <span className="font-medium">{filteredHistory.length}</span> requests
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryCurrentPage(p => Math.max(1, p - 1))}
                  disabled={historyCurrentPage === 1}
                  className="p-1.5 rounded-md border text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600">
                  Page {historyCurrentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setHistoryCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={historyCurrentPage === totalPages}
                  className="p-1.5 rounded-md border text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      );
    })()}
      </div>

      {/* ── Quick Action Modal ── */}
      {quickAction && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3
              className={`text-lg font-bold mb-1 ${
                quickAction.type === 'approve' ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {quickAction.type === 'approve' ? '✓ Approve Request' : '✗ Reject Request'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">
                {quickAction.request.applicant.full_name || quickAction.request.applicant.username}
              </span>{' '}
              — {quickAction.request.template.name}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comments{' '}
                {quickAction.type === 'reject' ? (
                  <span className="text-red-500">*</span>
                ) : (
                  <span className="text-gray-400 font-normal">(optional)</span>
                )}
              </label>
              <textarea
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                rows={3}
                placeholder={
                  quickAction.type === 'reject' ? 'Reason for rejection…' : 'Optional comments…'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {actionError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setQuickAction(null)}
                disabled={submitting}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitQuickAction}
                disabled={submitting}
                className={`px-4 py-2 text-sm text-white rounded transition-colors disabled:opacity-50 ${
                  quickAction.type === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {submitting
                  ? 'Processing…'
                  : quickAction.type === 'approve'
                  ? 'Confirm Approve'
                  : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Details Modal ── */}
      {viewRequest && (
        <RequestDetailsModal request={viewRequest} onClose={() => setViewRequest(null)} />
      )}

      {/* ── View History Request Modal ── */}
      {historyViewRequest && (
        <RequestDetailsModal request={historyViewRequest} onClose={() => setHistoryViewRequest(null)} />
      )}
    </div>
  );
}
