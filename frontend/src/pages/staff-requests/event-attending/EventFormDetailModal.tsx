import React from 'react';
import { X, CheckCircle, XCircle, Clock, FileText, DollarSign, User } from 'lucide-react';
import type { EventAttendingFormDetail } from '../../../types/eventAttending';

interface Props {
  form: EventAttendingFormDetail;
  onClose: () => void;
}

function buildLabelMap(schema: Array<{ name: string; label: string; [k: string]: any }> = []): Record<string, string> {
  const map: Record<string, string> = { kss_link: 'KSS Link' };
  schema.forEach(f => {
    map[f.name] = f.label || f.name.replace(/_/g, ' ');
    if (f.conditional_fields) {
      Object.values(f.conditional_fields).forEach((children: any[]) => {
        children.forEach(cf => { map[cf.name] = cf.label || cf.name.replace(/_/g, ' '); });
      });
    }
  });
  return map;
}

export default function EventFormDetailModal({ form, onClose }: Props) {
  const statusConfig: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    approved: { icon: <CheckCircle size={14} />, bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved' },
    pending:  { icon: <Clock size={14} />,       bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Pending'  },
    rejected: { icon: <XCircle size={14} />,     bg: 'bg-red-100',     text: 'text-red-700',     label: 'Rejected' },
  };
  const badge = statusConfig[form.status] ?? statusConfig['pending'];

  const labelMap = buildLabelMap(form.on_duty_form_schema);
  const eventSource =
    form.on_duty_form_data && Object.keys(form.on_duty_form_data).length > 0
      ? form.on_duty_form_data
      : form.custom_event_details || {};

  const eventRows = Object.entries(eventSource)
    .filter(([k, v]) => v != null && v !== '' && typeof v !== 'object' && k !== 'proof')
    .map(([k, v]) => ({
      label: labelMap[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value: String(v),
    }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Event Attending Form Details</h2>
            <p className="text-sm text-gray-500 mt-1">
              {form.applicant?.name && (
                <>Submitted by <span className="font-medium text-gray-700">{form.applicant.name}</span></>
              )}
              {form.applicant?.department && (
                <> · <span className="text-blue-600">{form.applicant.department}</span></>
              )}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                {badge.icon} {badge.label}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(form.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-xl transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Event Details */}
          {eventRows.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText size={14} className="text-blue-500" /> Event Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                {eventRows.map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 break-words">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Expense Summary */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <DollarSign size={14} className="text-emerald-500" /> Expense Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded-xl p-3 border bg-blue-50 border-blue-100">
                <p className="text-xs text-gray-500">Travel</p>
                <p className="text-lg font-bold text-gray-800">₹{(form.travel_total || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-xl p-3 border bg-orange-50 border-orange-100">
                <p className="text-xs text-gray-500">Food</p>
                <p className="text-lg font-bold text-gray-800">₹{(form.food_total || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-xl p-3 border bg-purple-50 border-purple-100">
                <p className="text-xs text-gray-500">Other</p>
                <p className="text-lg font-bold text-gray-800">₹{(form.other_total || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-xl p-3 border bg-teal-50 border-teal-100">
                <p className="text-xs text-gray-500">Fees Spent</p>
                <p className="text-lg font-bold text-gray-800">₹{(form.total_fees_spend || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[140px] rounded-xl p-3 bg-blue-600 text-white">
                <p className="text-xs opacity-75">Grand Total</p>
                <p className="text-2xl font-black">₹{(form.grand_total || 0).toLocaleString('en-IN')}</p>
              </div>
              {(form.advance_amount_received > 0) && (
                <div className="flex-1 min-w-[120px] rounded-xl p-3 bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-600">Advance Received</p>
                  <p className="text-lg font-bold text-amber-700">₹{form.advance_amount_received.toLocaleString('en-IN')}</p>
                  {form.advance_date && (
                    <p className="text-xs text-amber-400 mt-0.5">{new Date(form.advance_date).toLocaleDateString('en-IN')}</p>
                  )}
                </div>
              )}
              <div className={`flex-1 min-w-[120px] rounded-xl p-3 border ${form.balance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <p className={`text-xs ${form.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {form.balance >= 0 ? 'Balance Receivable' : 'Amount to Refund'}
                </p>
                <p className={`text-lg font-bold ${form.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  ₹{Math.abs(form.balance || 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </section>

          {/* Travel Expenses Table */}
          {form.travel_expenses?.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Travel Expenses</h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm min-w-[540px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Date', 'Bill No.', 'Mode', 'From', 'To', 'Amount (₹)'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.travel_expenses.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                        <td className="px-3 py-2 text-gray-700">{row.date}</td>
                        <td className="px-3 py-2 text-gray-500">{row.bill_no || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.mode_of_travel}</td>
                        <td className="px-3 py-2 text-gray-700">{row.from}</td>
                        <td className="px-3 py-2 text-gray-700">{row.to}</td>
                        <td className="px-3 py-2 font-semibold text-blue-700">₹{Number(row.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Food Expenses Table */}
          {form.food_expenses?.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Food Expenses</h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm min-w-[540px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Date', 'Bill No.', 'Breakfast', 'Lunch', 'Dinner', 'Amount (₹)'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.food_expenses.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                        <td className="px-3 py-2 text-gray-700">{row.date}</td>
                        <td className="px-3 py-2 text-gray-500">{row.bill_no || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.breakfast || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.lunch || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.dinner || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-blue-700">₹{Number(row.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Other Expenses Table */}
          {form.other_expenses?.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Other Expenses</h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['S.No', 'Date', 'Bill No.', 'Details', 'Amount (₹)'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.other_expenses.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-700">{row.date}</td>
                        <td className="px-3 py-2 text-gray-600">{row.bill_no}</td>
                        <td className="px-3 py-2 text-gray-700">{row.expense_details}</td>
                        <td className="px-3 py-2 font-semibold text-blue-700">₹{Number(row.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Approval Timeline */}
          {form.workflow_progress && form.workflow_progress.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <User size={14} className="text-violet-500" /> Approval Timeline
              </h3>
              <div className="space-y-2">
                {form.workflow_progress.map((step, idx) => (
                  <div key={idx} className={`flex gap-3 p-4 rounded-xl border transition-colors ${
                    step.status === 'approved' ? 'bg-emerald-50 border-emerald-200' :
                    step.status === 'rejected' ? 'bg-red-50 border-red-200' :
                    step.is_current ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {step.status === 'approved' ? <CheckCircle size={18} className="text-emerald-500" /> :
                       step.status === 'rejected' ? <XCircle size={18} className="text-red-500" /> :
                       step.is_current ? <Clock size={18} className="text-blue-500 animate-pulse" /> :
                       <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 mt-0.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800">Step {step.step_order}: {step.approver_role}</p>
                        {step.is_completed && step.status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                            step.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {step.status === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        )}
                        {!step.is_completed && step.is_current && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Awaiting</span>
                        )}
                        {!step.is_completed && !step.is_current && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Pending</span>
                        )}
                      </div>
                      {step.approver?.full_name && (
                        <p className="text-xs text-gray-600 mt-0.5">{step.approver.full_name}</p>
                      )}
                      {step.action_date && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(step.action_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })},
                          {' '}
                          {new Date(step.action_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </p>
                      )}
                      {step.comments && (
                        <p className="text-xs italic text-gray-600 mt-1 bg-white/70 rounded-lg px-2 py-1 border border-gray-100">
                          "{step.comments}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Approval Logs fallback */}
          {(!form.workflow_progress || form.workflow_progress.length === 0) &&
           form.approval_logs && form.approval_logs.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Approval History</h3>
              <div className="space-y-2">
                {form.approval_logs.map(log => (
                  <div key={log.id} className={`p-4 rounded-xl border ${log.action === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">Step {log.step_order}: {log.approver?.full_name}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${log.action === 'approved' ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'}`}>
                        {log.action.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.action_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })},{' '}
                      {new Date(log.action_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                    {log.comments && <p className="text-xs italic text-gray-600 mt-1">"{log.comments}"</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end bg-gray-50/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-800 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
