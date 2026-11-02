import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Search,
  CheckCircle, 
  Clock, 
  Eye, 
  AlertCircle, 
  Loader2, 
  Filter,
  User,
  Shield,
  RotateCcw
} from 'lucide-react';
import { fetchAllQueries, updateQuery, UserQuery } from '../services/queries';

const STATUS_CONFIG = {
  SENT: { label: 'Sent', icon: AlertCircle, color: 'bg-blue-100 text-blue-700', borderColor: 'border-blue-300' },
  VIEWED: { label: 'Viewed', icon: Eye, color: 'bg-indigo-100 text-indigo-700', borderColor: 'border-indigo-300' },
  REVIEWED: { label: 'Reviewed', icon: CheckCircle, color: 'bg-purple-100 text-purple-700', borderColor: 'border-purple-300' },
  PENDING: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700', borderColor: 'border-yellow-300' },
  IN_PROGRESS: { label: 'In Progress', icon: AlertCircle, color: 'bg-orange-100 text-orange-700', borderColor: 'border-orange-300' },
  FIXED: { label: 'Fixed', icon: CheckCircle, color: 'bg-green-100 text-green-700', borderColor: 'border-green-300' },
  LATER: { label: 'Later', icon: Clock, color: 'bg-gray-100 text-gray-700', borderColor: 'border-gray-300' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: 'bg-slate-100 text-slate-700', borderColor: 'border-slate-300' },
};

export default function AdminRequestsPage() {
  const [queries, setQueries] = useState<UserQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadQueries();
  }, []);

  async function loadQueries() {
    setLoading(true);
    setError('');
    try {
      // Fetching all queries from the shared service
      const data = await fetchAllQueries(); 
      // Sort by latest first
      const sorted = [...data.queries].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setQueries(sorted);
    } catch (err) {
      setError('Failed to load requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const filteredQueries = queries.filter(q => 
    q.query_text.toLowerCase().includes(search.toLowerCase()) ||
    q.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleApproveReset = async (query: UserQuery) => {
    const facultyCodeMatch = query.query_text.match(/\(([^)]+)\)/);
    const facultyCode = facultyCodeMatch ? facultyCodeMatch[1] : '';
    
    if (!facultyCode) {
      alert('Could not extract Faculty Code from request text.');
      return;
    }

    if (!window.confirm(`APPROVE RESET: This will signal ESV to clear all valuation data for Faculty ${facultyCode}. Proceed?`)) {
      return;
    }

    setSaving(true);
    try {
      // 1. Update status to FIXED (Approved)
      await updateQuery(query.id, { 
        status: 'FIXED', 
        admin_notes: `[SYSTEM] Reset approved by Admin. Local data cleared for ${facultyCode}.` 
      });
      
      // 2. Broadcast the reset signal (Cross-tab notification)
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('idcs-marks-sync');
        channel.postMessage({ type: 'RESET_FACULTY_DATA', facultyCode });
        channel.close();
      }

      setSuccess(`Reset request approved for ${facultyCode}`);
      await loadQueries();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to approve reset request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-[#ead7d0] p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#6f1d34] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#6f1d34]/20">
              <MessageSquare size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#5a192f]">Management Requests</h1>
              <p className="text-sm font-medium text-[#6f4a3f]/70">Review and approve faculty reset requests and tokens</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6f4a3f]/40" size={18} />
            <input 
              type="text"
              placeholder="Search faculty or request..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-[#faf4f0] border border-[#ead7d0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6f1d34]/20 w-full md:w-64"
            />
          </div>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <CheckCircle size={18} />
          <p className="text-sm font-bold">{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center gap-3">
          <AlertCircle size={18} />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-2xl border border-[#ead7d0] p-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-[#6f1d34]" size={32} />
            <p className="text-[#6f4a3f] font-bold text-sm uppercase tracking-widest">Fetching Requests...</p>
          </div>
        ) : filteredQueries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#ead7d0] p-12 text-center">
            <p className="text-[#6f4a3f]/50 font-medium italic">No requests found matching your search.</p>
          </div>
        ) : (
          filteredQueries.map((query) => {
            const isResetRequest = query.query_text.includes('[ESV_RESET_REQUEST]');
            const statusCfg = STATUS_CONFIG[query.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.SENT;
            const StatusIcon = statusCfg.icon;

            return (
              <div 
                key={query.id} 
                className={`bg-white rounded-2xl border-2 p-5 transition-all hover:shadow-lg ${
                  isResetRequest && query.status !== 'FIXED' 
                    ? 'border-rose-200 shadow-md shadow-rose-50' 
                    : 'border-[#ead7d0]'
                }`}
              >
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#faf4f0] rounded-lg flex items-center justify-center text-[#6f1d34] border border-[#ead7d0]">
                        <User size={20} />
                      </div>
                      <div>
                        <p className="font-black text-[#5a192f] text-lg leading-tight">{query.username}</p>
                        <p className="text-[10px] font-black text-[#6f4a3f]/50 uppercase tracking-[0.15em]">
                          Serial #{query.serial_number} &middot; {new Date(query.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl text-sm leading-relaxed ${
                      isResetRequest 
                        ? 'bg-rose-50 text-rose-900 border border-rose-100' 
                        : 'bg-[#faf4f0] text-[#6f4a3f] border border-[#ead7d0]'
                    }`}>
                      {isResetRequest && query.status !== 'FIXED' && (
                        <div className="flex items-center gap-2 mb-2 font-black uppercase text-[10px] tracking-widest text-rose-600">
                          <RotateCcw size={14} className="animate-pulse" />
                          Critical: ESV Data Reset
                        </div>
                      )}
                      {query.query_text}
                    </div>

                    {query.admin_notes && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 italic">
                        <span className="font-bold not-italic mr-2">Admin Notes:</span>
                        {query.admin_notes}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3 min-w-[200px]">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${statusCfg.color}`}>
                      <StatusIcon size={14} />
                      {statusCfg.label}
                    </div>

                    {isResetRequest && query.status !== 'FIXED' && (
                      <button
                        onClick={() => handleApproveReset(query)}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-3 rounded-xl font-black text-xs uppercase tracking-[0.1em] transition-all shadow-lg shadow-rose-200 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        Approve & Clear Marks
                      </button>
                    )}

                    {query.status !== 'FIXED' && !isResetRequest && (
                       <button
                         onClick={async () => {
                            if (window.confirm('Mark this request as FIXED?')) {
                               await updateQuery(query.id, { status: 'FIXED' });
                               loadQueries();
                            }
                         }}
                         className="w-full flex items-center justify-center gap-2 bg-[#6f1d34] hover:bg-[#5a192f] text-white px-4 py-3 rounded-xl font-black text-xs uppercase tracking-[0.1em] transition-all"
                       >
                         Mark as Fixed
                       </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
