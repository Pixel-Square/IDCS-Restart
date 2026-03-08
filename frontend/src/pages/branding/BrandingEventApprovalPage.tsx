import React, { useState } from 'react';
import { CheckCircle, XCircle, Clock, Calendar, MapPin, Users, MessageCircle, RefreshCw, UserCircle } from 'lucide-react';
import {
  approveEventByBranding,
  getBrandingEvents,
  rejectEventByBranding,
  type CollegeEvent,
  type EventStatus,
} from '../../store/eventStore';

// ── Status display config ────────────────────────────────────────────────────
const STATUS_INFO: Record<EventStatus, { label: string; color: string; dot: string }> = {
  Draft:                     { label: 'Draft',                 color: 'bg-gray-100 text-gray-700',   dot: 'bg-gray-400'   },
  'Pending IQAC Approval':   { label: 'Waiting for IQAC',      color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400'  },
  'Pending Branding Approval': { label: 'Pending Branding',   color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  Approved:                  { label: 'Approved',              color: 'bg-green-100 text-green-700', dot: 'bg-green-500'  },
  'Rejected by IQAC':        { label: 'Rejected by IQAC',      color: 'bg-rose-100 text-rose-700',   dot: 'bg-rose-500'   },
  'Rejected by Branding':    { label: 'Rejected by Branding',  color: 'bg-red-100 text-red-600',     dot: 'bg-red-500'    },
};

type FilterValue = 'all' | 'Pending Branding Approval' | 'Approved' | 'Rejected by Branding';

export default function BrandingEventApprovalPage() {
  const [events, setEvents] = useState<CollegeEvent[]>(getBrandingEvents);
  const [filter, setFilter] = useState<FilterValue>('Pending Branding Approval');
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function refresh() { setEvents(getBrandingEvents()); }

  function respond(id: string, action: 'Approved' | 'Rejected by Branding') {
    if (action === 'Approved') approveEventByBranding(id, noteInput[id]);
    else rejectEventByBranding(id, noteInput[id]);
    refresh();
    setNoteInput((p) => { const n = { ...p }; delete n[id]; return n; });
  }

  const counts: Partial<Record<FilterValue, number>> = { all: events.length };
  events.forEach((e) => {
    if (e.status === 'Pending Branding Approval' || e.status === 'Approved' || e.status === 'Rejected by Branding') {
      counts[e.status] = (counts[e.status] ?? 0) + 1;
    }
  });

  const filterOptions: Array<{ label: string; value: FilterValue }> = [
    { label: `All (${events.length})`,                                               value: 'all'               },
    { label: `Pending (${counts['Pending Branding Approval'] ?? 0})`,                value: 'Pending Branding Approval'  },
    { label: `Approved (${counts['Approved'] ?? 0})`,                                value: 'Approved'          },
    { label: `Rejected (${counts['Rejected by Branding'] ?? 0})`,                    value: 'Rejected by Branding'          },
  ];

  const filtered = filter === 'all' ? events : events.filter((e) => e.status === filter);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Approval</h1>
          <p className="text-gray-500 text-sm mt-1">Review only the events that IQAC has approved and forwarded to Branding.</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-xl border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {filterOptions.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all
              ${filter === value ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-purple-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map((event) => {
          const si = STATUS_INFO[event.status] ?? STATUS_INFO['Pending Branding Approval'];
          const isOpen = expanded[event.id];

          return (
            <div key={event.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header row */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded((p) => ({ ...p, [event.id]: !isOpen }))}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${si.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm">{event.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.color}`}>{si.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    {event.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.venue}</span>}
                    {(event.createdByName || event.createdBy) && (
                      <span className="flex items-center gap-1">
                        <UserCircle className="w-3 h-3" />HOD: {event.createdByName || event.createdBy}
                      </span>
                    )}
                  </div>
                </div>
                {event.dateTime && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(event.dateTime).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </div>
                )}
              </div>

              {/* Expanded details */}
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
                  {/* Event details grid */}
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    {event.dateTime && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{new Date(event.dateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      </div>
                    )}
                    {event.coordinatorCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span>{event.coordinatorCount} coordinator{event.coordinatorCount !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>

                  {/* Chief guests */}
                  {event.hasChiefGuest && event.chiefGuests.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Chief Guests</p>
                      <div className="flex flex-wrap gap-3">
                        {event.chiefGuests.map((g, i) => (
                          <div key={i} className="flex items-center gap-2 bg-purple-50 rounded-xl px-3 py-2">
                            {g.imageDataUrl
                              ? <img src={g.imageDataUrl} alt={g.name} className="w-8 h-8 rounded-full object-cover" />
                              : <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 text-xs font-bold">{g.name?.[0]?.toUpperCase() ?? '?'}</div>
                            }
                            <span className="text-xs font-medium text-gray-700">{g.name || `Guest ${i + 1}`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    Forwarded: {new Date(event.forwardedToBrandingAt || event.updatedAt).toLocaleString()}
                  </p>

                  {/* Existing review note */}
                  {event.iqacReviewNote && (
                    <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5 text-sm text-amber-800">
                      <MessageCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                      IQAC note: {event.iqacReviewNote}
                    </div>
                  )}

                  {event.brandingReviewNote && (
                    <div className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-600">
                      <MessageCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
                      Branding note: {event.brandingReviewNote}
                    </div>
                  )}

                  {/* Actions for Pending Branding Approval */}
                  {event.status === 'Pending Branding Approval' && (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={2}
                        placeholder="Optional branding review note for HOD..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                        value={noteInput[event.id] || ''}
                        onChange={(e) => setNoteInput((p) => ({ ...p, [event.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => respond(event.id, 'Approved')}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => respond(event.id, 'Rejected by Branding')}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
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
              {filter === 'Pending Branding Approval'
                ? 'No IQAC-approved events are waiting for branding review.'
                : 'No events in this category.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
