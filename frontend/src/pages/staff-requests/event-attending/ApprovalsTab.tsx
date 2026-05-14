import React, { useState } from 'react';
import type { EventAttendingFormDetail } from '../../../types/eventAttending';
import { processEventApproval } from '../../../services/eventAttending';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, FileText, Download } from 'lucide-react';
import { FilePreviewLink } from '../formValueUtils';

interface Props {
  pendingForms: EventAttendingFormDetail[];
  processedForms: EventAttendingFormDetail[];
  onProcessed: () => void;
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
};

export default function ApprovalsTab({ pendingForms, processedForms, onProcessed }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'processed'>('pending');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const forms = activeSubTab === 'pending' ? pendingForms : processedForms;

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    if (action === 'reject' && !comments.trim()) {
      setError('Please provide a reason (comments) for rejection.');
      return;
    }
    setProcessing(true); setError('');
    try {
      await processEventApproval(id, action, comments);
      setComments(''); setExpandedId(null);
      onProcessed();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed');
    } finally { setProcessing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button onClick={() => { setActiveSubTab('pending'); setExpandedId(null); }} className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeSubTab === 'pending' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
          Pending Review ({pendingForms.length})
        </button>
        <button onClick={() => { setActiveSubTab('processed'); setExpandedId(null); }} className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeSubTab === 'processed' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
          Processed ({processedForms.length})
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="text-center py-12 text-gray-500"><Clock size={32} className="mx-auto mb-2 text-gray-300" /><p>No {activeSubTab} approvals</p></div>
      ) : (
        forms.map(form => {
        const expanded = expandedId === form.id;
        const badge = STATUS_BADGE[form.status] || STATUS_BADGE.pending;
        return (
          <div key={form.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(expanded ? null : form.id)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {(form.applicant.name || 'U')[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{form.applicant.name}</p>
                  <p className="text-xs text-gray-500">{form.on_duty_form_data?.event_title || 'Event'} • ₹{form.grand_total.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {expanded && (
              <div className="border-t p-4 space-y-4">
                {/* OD Details */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">On Duty Details</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {Object.entries(form.on_duty_form_data || {}).filter(([, v]) => v).map(([k, v]) => {
                      let parsedV = v;
                      if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
                         try { parsedV = JSON.parse(v); } catch(e) {}
                      }
                      
                      const extractFiles = (obj: any): {url: string, name: string}[] => {
                        if (!obj || typeof obj !== 'object') return [];
                        if (Array.isArray(obj)) return obj.flatMap(extractFiles);
                        if (obj.url) return [{ url: obj.url, name: obj.name || 'View File' }];
                        if (obj.file_url) return [{ url: obj.file_url, name: obj.original_filename || 'View File' }];
                        if (obj.content && typeof obj.content === 'string' && obj.content.startsWith('data:')) return [{ url: obj.content, name: obj.name || 'View File' }];
                        const files = [];
                        for (const val of Object.values(obj)) {
                           if (val && typeof val === 'object') {
                              files.push(...extractFiles(val));
                           }
                        }
                        return files;
                      };

                      const files = extractFiles(parsedV);
                      
                      if (files.length > 0) {
                        return (
                          <div key={k}><span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}:</span>
                            {files.map((f, i) => (
                              <FilePreviewLink key={i} filename={f.name} href={f.url} className="text-blue-600 hover:underline inline-flex items-center gap-1 ml-2">
                                <FileText size={12}/> {f.name}
                              </FilePreviewLink>
                            ))}
                          </div>
                        );
                      }
                      
                      const displayVal = typeof parsedV === 'object' ? JSON.stringify(parsedV) : String(v);
                      return (
                        <div key={k}><span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}:</span> <span className="font-medium truncate max-w-full inline-block align-bottom" title={displayVal}>{displayVal}</span></div>
                      );
                    })}
                  </div>
                </div>

                {/* Expenses Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryCard label="Travel" amount={form.travel_total} />
                  <SummaryCard label="Food" amount={form.food_total} />
                  <SummaryCard label="Other" amount={form.other_total} />
                  <SummaryCard label="Grand Total" amount={form.grand_total} highlight />
                </div>

                {/* Expense Tables */}
                {form.travel_expenses?.length > 0 && (
                  <ExpenseTable title="Travel Expenses" headers={['Date', 'Bill No.', 'Mode', 'From', 'To', 'Amount', 'Proof']}
                    rows={form.travel_expenses.map((r, i) => {
                      const proof = form.files?.find(f => f.expense_type === 'travel' && f.expense_index === i);
                      return [r.date, r.bill_no, r.mode_of_travel, r.from, r.to, `₹${r.amount}`, proof ? <FilePreviewLink filename={proof.original_filename || 'View File'} href={proof.file_url || '#'} className="text-blue-600 hover:underline flex items-center gap-1"><FileText size={14}/> View</FilePreviewLink> : '-'];
                    })} />
                )}
                {form.food_expenses?.length > 0 && (
                  <ExpenseTable title="Food Expenses" headers={['Date', 'Bill No.', 'Breakfast', 'Lunch', 'Dinner', 'Amount', 'Proof']}
                    rows={form.food_expenses.map((r, i) => {
                      const proof = form.files?.find(f => f.expense_type === 'food' && f.expense_index === i);
                      return [r.date, r.bill_no, r.breakfast, r.lunch, r.dinner, `₹${r.amount}`, proof ? <FilePreviewLink filename={proof.original_filename || 'View File'} href={proof.file_url || '#'} className="text-blue-600 hover:underline flex items-center gap-1"><FileText size={14}/> View</FilePreviewLink> : '-'];
                    })} />
                )}
                {form.other_expenses?.length > 0 && (
                  <ExpenseTable title="Other Expenses" headers={['S.No', 'Date', 'Bill No.', 'Details', 'Amount', 'Proof']}
                    rows={form.other_expenses.map((r, i) => {
                      const proof = form.files?.find(f => f.expense_type === 'other' && f.expense_index === i);
                      return [String(i + 1), r.date, r.bill_no, r.expense_details, `₹${r.amount}`, proof ? <FilePreviewLink filename={proof.original_filename || 'View File'} href={proof.file_url || '#'} className="text-blue-600 hover:underline flex items-center gap-1"><FileText size={14}/> View</FilePreviewLink> : '-'];
                    })} />
                )}

                {/* Files */}
                {form.files?.filter(f => f.expense_type === 'fees').length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Overall Event / Fees Proof</h5>
                    <div className="flex flex-wrap gap-2">
                      {form.files.filter(f => f.expense_type === 'fees').map(f => (
                        <FilePreviewLink key={f.id} filename={f.original_filename || 'Proof'} href={f.file_url || '#'} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100">
                          <FileText size={12} /> {f.original_filename}
                        </FilePreviewLink>
                      ))}
                    </div>
                  </div>
                )}

                {/* Balance */}
                <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
                  <div className="text-sm">
                    <span className="text-gray-600">Advance: </span><span className="font-semibold">₹{form.advance_amount_received}</span>
                  </div>
                  <div className={`text-sm font-bold ${form.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {form.balance >= 0 ? `Balance to Receive: ₹${form.balance}` : `Refund: ₹${Math.abs(form.balance)}`}
                  </div>
                </div>

                {/* Workflow */}
                {form.workflow_progress?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Approval Workflow</h5>
                    <div className="flex items-center gap-1 flex-wrap">
                      {form.workflow_progress.map((s, i) => (
                        <React.Fragment key={i}>
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            s.is_completed ? (s.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
                            : s.is_current ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {s.is_completed ? (s.status === 'approved' ? <CheckCircle size={12} /> : <XCircle size={12} />) : <Clock size={12} />}
                            {s.approver_role}
                          </div>
                          {i < form.workflow_progress.length - 1 && <span className="text-gray-300">→</span>}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Logs */}
                    {form.approval_logs?.length > 0 && (
                      <div className="space-y-2 mt-3 border-t pt-3">
                        <h6 className="text-xs font-semibold text-gray-500 uppercase">Approval Logs</h6>
                        {form.approval_logs.map(log => (
                          <div key={log.id} className="text-xs bg-white border border-gray-100 rounded p-2">
                            <span className="font-semibold text-gray-800">{log.approver.name} ({log.action})</span> 
                            <span className="text-gray-400 ml-2">{new Date(log.action_date).toLocaleString()}</span>
                            {log.comments && <p className="text-gray-600 mt-1 italic">"{log.comments}"</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Action Buttons */}
                {activeSubTab === 'pending' && form.status === 'pending' && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs text-blue-600 font-medium">Action Required as: <span className="font-bold">{form.current_approver_role}</span></p>
                    <textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="Comments (optional)" rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    {error && <p className="text-red-600 text-xs">{error}</p>}
                    <div className="flex gap-3">
                      <button onClick={() => handleAction(form.id, 'approve')} disabled={processing}
                        className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1">
                        <CheckCircle size={16} /> Approve
                      </button>
                      <button onClick={() => handleAction(form.id, 'reject')} disabled={processing}
                        className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1">
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })
      )}
    </div>
  );
}

function SummaryCard({ label, amount, highlight }: { label: string; amount: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>₹{amount.toLocaleString()}</p>
    </div>
  );
}

function ExpenseTable({ title, headers, rows }: { title: string; headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div>
      <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</h5>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50">{headers.map((h, i) => <th key={i} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="px-2 py-1.5 text-gray-700">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
