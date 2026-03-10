import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Trash2, Calendar, MapPin, Users, RefreshCw, Send } from 'lucide-react';
import ApprovalStatusBadge from './ApprovalStatusBadge';
import {
  getAllEvents,
  deleteEvent,
  submitEventToIqac,
  type CollegeEvent,
  type EventStatus,
} from '../../../store/eventStore';

const STATUS_FILTERS: Array<{ label: string; value: 'all' | EventStatus }> = [
  { label: 'All',                value: 'all'                       },
  { label: 'Draft',              value: 'Draft'                     },
  { label: 'Pending IQAC',       value: 'Pending IQAC Approval'     },
  { label: 'Pending Branding',   value: 'Pending Branding Approval' },
  { label: 'Approved',           value: 'Approved'                  },
  { label: 'Rejected by IQAC',   value: 'Rejected by IQAC'          },
  { label: 'Rejected by Branding', value: 'Rejected by Branding'    },
];

export default function HodEventsListPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CollegeEvent[]>(getAllEvents);
  const [filter, setFilter] = useState<'all' | EventStatus>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refresh() { setEvents(getAllEvents()); }

  function handleDelete(id: string) {
    deleteEvent(id);
    refresh();
    setDeletingId(null);
  }

  function handleForward(id: string) {
    submitEventToIqac(id);
    refresh();
  }

  const visible = filter === 'all' ? events : events.filter((e) => e.status === filter);

  const counts: Record<string, number> = {};
  events.forEach((e) => { counts[e.status] = (counts[e.status] ?? 0) + 1; });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Events</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage events you've created and track their approval status.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            to="/hod/events/create"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" /> New Event
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Draft',                    color: 'bg-gray-100 text-gray-700'   },
          { label: 'Pending IQAC Approval',    color: 'bg-amber-50 text-amber-700'  },
          { label: 'Pending Branding Approval', color: 'bg-indigo-50 text-indigo-700' },
          { label: 'Approved',                 color: 'bg-green-50 text-green-700'  },
        ].map(({ label, color }) => (
          <div key={label} className={`rounded-2xl p-4 ${color}`}>
            <p className="text-2xl font-bold">{counts[label] ?? 0}</p>
            <p className="text-xs font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all
              ${filter === value ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'}`}
          >
            {label}{value !== 'all' && counts[value] !== undefined ? ` (${counts[value]})` : ''}
          </button>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">Delete Event?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deletingId)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Event cards */}
      <div className="space-y-3">
        {visible.map((event) => (
          <div key={event.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-gray-900 text-base">{event.title}</h3>
                  <ApprovalStatusBadge status={event.status} size="sm" />
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                  {event.venue && (
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{event.venue}</span>
                  )}
                  {event.dateTime && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(event.dateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  )}
                  {event.coordinatorCount > 0 && (
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{event.coordinatorCount} coordinator{event.coordinatorCount !== 1 ? 's' : ''}</span>
                  )}
                </div>

                {event.iqacReviewNote && (
                  <p className="mt-2 text-xs bg-amber-50 rounded-xl px-3 py-2 text-amber-800 italic">
                    IQAC note: {event.iqacReviewNote}
                  </p>
                )}

                {event.brandingReviewNote && (
                  <p className="mt-2 text-xs bg-indigo-50 rounded-xl px-3 py-2 text-indigo-800 italic">
                    Branding note: {event.brandingReviewNote}
                  </p>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  Created {new Date(event.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  {event.createdAt !== event.updatedAt && ` · Updated ${new Date(event.updatedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`}
                </p>
              </div>

              {/* Row actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {event.status === 'Draft' && (
                  <>
                    <button
                      onClick={() => navigate('/hod/events/create', { state: { editId: event.id } })}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleForward(event.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" /> Forward to IQAC
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDeletingId(event.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {visible.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No events found. <Link to="/hod/events/create" className="text-indigo-600 hover:underline font-medium">Create one →</Link></p>
          </div>
        )}
      </div>
    </div>
  );
}
