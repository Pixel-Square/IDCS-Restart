import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckCircle, Clock, MessageCircle, RefreshCw, Send, UserCircle, XCircle, Calendar, MapPin, Users } from 'lucide-react';
import { getCachedMe } from '../../services/auth';
import {
  approveEventByIqac,
  getIqacEvents,
  rejectEventByIqac,
  type CollegeEvent,
  type EventStatus,
} from '../../store/eventStore';

const STATUS_INFO: Record<EventStatus, { label: string; color: string; dot: string }> = {
  Draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  'Pending IQAC Approval': { label: 'Pending IQAC Approval', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  'Pending Branding Approval': { label: 'Forwarded to Branding', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  Approved: { label: 'Approved', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  'Rejected by IQAC': { label: 'Rejected by IQAC', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  'Rejected by Branding': { label: 'Rejected by Branding', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

type FilterValue = 'all' | 'Pending IQAC Approval' | 'Pending Branding Approval' | 'Rejected by IQAC' | 'Approved';

export default function IQACEventApprovalPage() {
  const me = getCachedMe();
  const roleNames = Array.isArray(me?.roles) ? me.roles.map((r: any) => String(r || '').toUpperCase()) : [];
  const permCodes = Array.isArray(me?.permissions) ? me.permissions.map((p: any) => String(p || '').toLowerCase()) : [];
  const isIqacMain = Boolean(
    me?.is_iqac_main === true
    || String(me?.username || '').trim() === '000000'
    || roleNames.includes('IQAC')
    || permCodes.includes('obe.master.manage')
  );

  const [events, setEvents] = useState<CollegeEvent[]>(getIqacEvents);
  const [filter, setFilter] = useState<FilterValue>('Pending IQAC Approval');
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refresh = () => setEvents(getIqacEvents());

  const counts = useMemo(() => {
    const next: Partial<Record<FilterValue, number>> = { all: events.length };
    events.forEach((event) => {
      if (event.status === 'Pending IQAC Approval' || event.status === 'Pending Branding Approval' || event.status === 'Rejected by IQAC' || event.status === 'Approved') {
        next[event.status as FilterValue] = (next[event.status as FilterValue] ?? 0) + 1;
      }
    });
    return next;
  }, [events]);

  const filtered = filter === 'all' ? events : events.filter((event) => event.status === filter);

  if (!isIqacMain) {
    return <Navigate to="/dashboard" replace />;
  }

  function respond(id: string, action: 'approve' | 'reject') {
    if (action === 'approve') approveEventByIqac(id, noteInput[id]);
    else rejectEventByIqac(id, noteInput[id]);
    refresh();
    setNoteInput((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IQAC Event Approvals</h1>
          <p className="text-gray-500 text-sm mt-1">HOD event requests land here first. Approve them to forward the event to Branding, or reject them with a note.</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { label: `All (${events.length})`, value: 'all' as FilterValue },
          { label: `Pending (${counts['Pending IQAC Approval'] ?? 0})`, value: 'Pending IQAC Approval' as FilterValue },
          { label: `Forwarded (${counts['Pending Branding Approval'] ?? 0})`, value: 'Pending Branding Approval' as FilterValue },
          { label: `Rejected (${counts['Rejected by IQAC'] ?? 0})`, value: 'Rejected by IQAC' as FilterValue },
          { label: `Approved (${counts['Approved'] ?? 0})`, value: 'Approved' as FilterValue },
        ].map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filter === value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map((event) => {
          const statusInfo = STATUS_INFO[event.status];
          const isOpen = expanded[event.id];

          return (
            <div key={event.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded((prev) => ({ ...prev, [event.id]: !isOpen }))}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusInfo.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm">{event.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    {event.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.venue}</span>}
                    <span className="flex items-center gap-1"><UserCircle className="w-3 h-3" />HOD: {event.createdByName || event.createdBy}</span>
                    {event.submittedToIqacAt && <span className="flex items-center gap-1"><Send className="w-3 h-3" />Submitted {new Date(event.submittedToIqacAt).toLocaleString('en-IN')}</span>}
                  </div>
                </div>
                {event.dateTime && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(event.dateTime).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 text-xs text-gray-600">
                    {event.dateTime && <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-gray-400" />{new Date(event.dateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
                    {event.coordinatorCount > 0 && <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-gray-400" />{event.coordinatorCount} coordinator{event.coordinatorCount !== 1 ? 's' : ''}</div>}
                  </div>

                  {event.iqacReviewNote && (
                    <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5 text-sm text-amber-800">
                      <MessageCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                      IQAC note: {event.iqacReviewNote}
                    </div>
                  )}

                  {event.brandingReviewNote && (
                    <div className="flex items-start gap-2 bg-indigo-50 rounded-xl px-3 py-2.5 text-sm text-indigo-800">
                      <MessageCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-500" />
                      Branding note: {event.brandingReviewNote}
                    </div>
                  )}

                  {event.status === 'Pending IQAC Approval' && (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={2}
                        placeholder="Optional IQAC review note for the HOD and Branding team..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        value={noteInput[event.id] || ''}
                        onChange={(e) => setNoteInput((prev) => ({ ...prev, [event.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => respond(event.id, 'approve')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                          <CheckCircle className="w-4 h-4" /> Approve & Forward to Branding
                        </button>
                        <button onClick={() => respond(event.id, 'reject')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {event.status !== 'Pending IQAC Approval' && (
                    <p className="text-xs text-gray-400">
                      {event.status === 'Pending Branding Approval' && `Forwarded to Branding on ${event.forwardedToBrandingAt ? new Date(event.forwardedToBrandingAt).toLocaleString('en-IN') : '—'}`}
                      {event.status === 'Rejected by IQAC' && `Rejected by IQAC on ${event.iqacReviewedAt ? new Date(event.iqacReviewedAt).toLocaleString('en-IN') : '—'}`}
                      {event.status === 'Approved' && `Branding approved this event on ${event.brandingReviewedAt ? new Date(event.brandingReviewedAt).toLocaleString('en-IN') : '—'}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {filter === 'Pending IQAC Approval' ? 'No HOD event requests are waiting for IQAC approval.' : 'No events in this category.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}