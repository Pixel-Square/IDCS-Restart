import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchApprovedODForms, fetchMyEventForms, fetchMyEventBudget,
  fetchPendingEventApprovals, fetchProcessedEventApprovals,
  fetchEventFormDetail, fetchMyEventApproverRoles, deleteEventForm
} from '../../services/eventAttending';
import type { ApprovedODForm, EventAttendingFormListItem, EventAttendingFormDetail, MyEventBudget } from '../../types/eventAttending';
import ExpenseFormTab from './event-attending/ExpenseFormTab';
import ApprovalsTab from './event-attending/ApprovalsTab';
import StaffDeclarationTab from './event-attending/StaffDeclarationTab';
import WorkflowSettingsTab from './event-attending/WorkflowSettingsTab';
import AnalyticsTab from './event-attending/AnalyticsTab';
import { generateEventPdf } from './event-attending/generateEventPdf';
import ConditionsTab from './event-attending/ConditionsTab';
import { ClipboardList, CheckSquare, BookOpen, Settings, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Download, Loader2, ListPlus, BarChart3, Trash2, Eye } from 'lucide-react';
import EventFormDetailModal from './event-attending/EventFormDetailModal';

export default function EventAttendingPage() {
  const [activeTab, setActiveTab] = useState<'forms' | 'approvals' | 'declarations' | 'conditions' | 'settings' | 'analytics'>('forms');
  const [odForms, setOdForms] = useState<ApprovedODForm[]>([]);
  const [myForms, setMyForms] = useState<EventAttendingFormListItem[]>([]);
  const [budget, setBudget] = useState<MyEventBudget | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<EventAttendingFormDetail[]>([]);
  const [processedApprovals, setProcessedApprovals] = useState<EventAttendingFormDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedForm, setExpandedForm] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [viewingFormDetail, setViewingFormDetail] = useState<import('../../types/eventAttending').EventAttendingFormDetail | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Dynamic role checks
  const [isApprover, setIsApprover] = useState(false);

  const userStr = localStorage.getItem('me');
  const user = userStr ? JSON.parse(userStr) : null;
  const userRoles: string[] = (user?.roles || []).map((r: any) => typeof r === 'string' ? r.toUpperCase() : (r?.name || '').toUpperCase());
  const isIQAC = userRoles.includes('IQAC');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Check dynamic approver status from backend (based on active workflow roles)
      let approver = false;
      try {
        const approverInfo = await fetchMyEventApproverRoles();
        approver = approverInfo.is_approver;
        setIsApprover(approver);
      } catch {
        // Fallback to static check on error
        approver = ['HOD', 'AHOD', 'IQAC', 'HAA', 'PRINCIPAL', 'HR'].some(r => userRoles.includes(r));
        setIsApprover(approver);
      }

      const [od, forms, b] = await Promise.all([
        fetchApprovedODForms(),
        fetchMyEventForms(),
        fetchMyEventBudget(),
      ]);
      setOdForms(od); setMyForms(forms); setBudget(b);

      if (approver) {
        try {
          const [pending, processed] = await Promise.all([
            fetchPendingEventApprovals(),
            fetchProcessedEventApprovals(),
          ]);
          setPendingApprovals(pending);
          setProcessedApprovals(processed);
        } catch { }
      }
    } catch { }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const handleDownloadPdf = async (id: number) => {
    setDownloadingId(id);
    try {
      const detail = await fetchEventFormDetail(id);
      await generateEventPdf(detail);
    } catch (e: any) {
      alert('Failed to generate PDF: ' + (e?.response?.data?.error || e.message));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleViewForm = async (id: number) => {
    setViewLoadingId(id);
    try {
      const detail = await fetchEventFormDetail(id);
      setViewingFormDetail(detail);
    } catch (e: any) {
      alert('Failed to load form details: ' + (e?.response?.data?.error || e.message));
    } finally {
      setViewLoadingId(null);
    }
  };

  const handleDeleteForm = async (id: number) => {
    setDeleteConfirmId(null);
    try {
      await deleteEventForm(id);
      loadData();
    } catch (e: any) {
      alert('Failed to delete form: ' + (e?.response?.data?.error || e.message));
    }
  };

  const STATUS_BADGE: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    pending: { icon: <Clock size={14} />, bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
    approved: { icon: <CheckCircle size={14} />, bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
    rejected: { icon: <XCircle size={14} />, bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  };

  const TABS = [
    { key: 'forms' as const, label: 'My Forms', icon: <ClipboardList size={16} />, show: true },
    { key: 'approvals' as const, label: 'Approvals', icon: <CheckSquare size={16} />, show: isApprover, badge: pendingApprovals.length },
    { key: 'declarations' as const, label: 'Staff Declaration', icon: <BookOpen size={16} />, show: isIQAC },
    { key: 'conditions' as const, label: 'Conditions', icon: <ListPlus size={16} />, show: isIQAC },
    { key: 'analytics' as const, label: 'Analytics', icon: <BarChart3 size={16} />, show: isIQAC },
    { key: 'settings' as const, label: 'Settings', icon: <Settings size={16} />, show: isIQAC },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Event Attending</h1>
        <p className="text-sm text-gray-500 mt-1">Submit and manage event expense reimbursement forms</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.filter(t => t.show).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {tab.icon} {tab.label}
            {tab.badge ? <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{tab.badge}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16"><div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /><p className="text-gray-500 mt-3">Loading...</p></div>
      ) : (
        <>
          {activeTab === 'forms' && (
            <div className="space-y-6">
              {/* Submitted Forms List */}
              {myForms.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold text-gray-800 mb-3">Submitted Forms</h3>
                  <div className="space-y-2">
                    {myForms.map(form => {
                      const badge = STATUS_BADGE[form.status];
                      const expanded = expandedForm === form.id;
                      const isFullyApproved = form.status === 'approved';
                      const isDownloading = downloadingId === form.id;
                      return (
                        <div key={form.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between p-4">
                            {/* Left: clickable expand area */}
                            <div className="flex-1 cursor-pointer hover:bg-gray-50 rounded-lg pr-2" onClick={() => setExpandedForm(expanded ? null : form.id)}>
                              <p className="text-sm font-semibold text-gray-900">{form.on_duty_form_data?.event_title || 'Event Form'}</p>
                              <p className="text-xs text-gray-500">
                                Submitted {new Date(form.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} • Grand Total: ₹{form.grand_total.toLocaleString()}
                              </p>
                            </div>
                            {/* Right: status badge + download btn + chevron */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge?.bg} ${badge?.text}`}>{badge?.icon} {badge?.label}</span>
                              {/* View button */}
                              <button
                                onClick={() => handleViewForm(form.id)}
                                disabled={viewLoadingId === form.id}
                                title="View Details"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
                              >
                                {viewLoadingId === form.id
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <Eye size={12} />}
                                View
                              </button>
                              {isFullyApproved && (
                                <button
                                  onClick={() => handleDownloadPdf(form.id)}
                                  disabled={isDownloading}
                                  title="Download PDF"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                                >
                                  {isDownloading
                                    ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
                                    : <><Download size={13} /> Download PDF</>
                                  }
                                </button>
                              )}
                              {form.status === 'pending' && (
                                <button
                                  onClick={() => setDeleteConfirmId(form.id)}
                                  title="Delete Pending Form"
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                              <div className="cursor-pointer p-1 hover:bg-gray-100 rounded-md ml-1" onClick={() => setExpandedForm(expanded ? null : form.id)}>
                                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </div>
                            </div>
                          </div>
                          {expanded && (
                            <div className="border-t p-4 bg-gray-50 space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-white rounded-lg p-3 border"><p className="text-xs text-gray-500">Travel</p><p className="text-lg font-bold">₹{form.travel_total.toLocaleString()}</p></div>
                                <div className="bg-white rounded-lg p-3 border"><p className="text-xs text-gray-500">Food</p><p className="text-lg font-bold">₹{form.food_total.toLocaleString()}</p></div>
                                <div className="bg-white rounded-lg p-3 border"><p className="text-xs text-gray-500">Other</p><p className="text-lg font-bold">₹{form.other_total.toLocaleString()}</p></div>
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200"><p className="text-xs text-blue-600">Grand Total</p><p className="text-lg font-bold text-blue-700">₹{form.grand_total.toLocaleString()}</p></div>
                              </div>
                              <div className={`flex justify-between items-center p-3 rounded-lg ${form.balance >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                <span className="text-sm text-gray-700">{form.balance >= 0 ? 'Balance to be Received' : 'Amount to Refund'}</span>
                                <span className={`font-bold ${form.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>₹{Math.abs(form.balance).toLocaleString()}</span>
                              </div>
                              {isFullyApproved && (
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => handleDownloadPdf(form.id)}
                                    disabled={isDownloading}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-semibold rounded-lg transition-colors"
                                  >
                                    {isDownloading
                                      ? <><Loader2 size={15} className="animate-spin" /> Generating PDF…</>
                                      : <><Download size={15} /> Download Full PDF</>
                                    }
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* New Expense Form */}
              <div className="border-t pt-6">
                <h3 className="text-base font-semibold text-gray-800 mb-3">Submit New Expense Form</h3>
                <ExpenseFormTab odForms={odForms} budget={budget} onSubmitted={loadData} />
              </div>
            </div>
          )}

          {activeTab === 'approvals' && <ApprovalsTab pendingForms={pendingApprovals} processedForms={processedApprovals} onProcessed={loadData} />}
          {activeTab === 'declarations' && <StaffDeclarationTab />}
          {activeTab === 'conditions' && <ConditionsTab />}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'settings' && <WorkflowSettingsTab />}
        </>
      )}

      {/* View Form Detail Modal */}
      {viewingFormDetail && (
        <EventFormDetailModal form={viewingFormDetail} onClose={() => setViewingFormDetail(null)} />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Form?</h3>
            <p className="text-sm text-gray-500 mb-6">This pending form will be permanently deleted. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >Cancel</button>
              <button
                onClick={() => handleDeleteForm(deleteConfirmId)}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors text-sm"
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
