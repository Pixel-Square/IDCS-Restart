import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { Camera, Check, X, Clock, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type RequestRow = {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  requested_at?: string | null;
  user?: {
    id?: number;
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    profile_image_updated?: boolean;
  } | null;
};

export default function ProfileImageUpdateRequestsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);

  async function loadRows() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth('/api/accounts/profile-image-update-requests/review/');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.detail || 'Failed to load requests'));
      }
      setRows(Array.isArray(data?.results) ? data.results : []);
    } catch (e: any) {
      setError(String(e?.message || e || 'Failed to load requests'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function reviewRequest(requestId: number, action: 'approve' | 'reject') {
    const review_note = window.prompt(
      action === 'approve'
        ? 'Optional note for approval:'
        : 'Optional reason for rejection:',
      '',
    );

    if (review_note === null) {
      return;
    }

    try {
      setSavingId(requestId);
      setError(null);
      const res = await fetchWithAuth(`/api/accounts/profile-image-update-requests/${requestId}/review/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, review_note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.detail || 'Failed to review request'));
      }
      await loadRows();
    } catch (e: any) {
      setError(String(e?.message || e || 'Failed to review request'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-sm text-white">
            <Camera className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">Profile Image Unlocks</h1>
            <p className="mt-1 text-sm sm:text-base text-slate-500 font-medium">
              Approve or reject requests to unlock one-time profile image updates.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex gap-3 items-center shadow-sm">
            <div className="p-1 bg-red-100 rounded-md"><X className="h-4 w-4" /></div>
            <span className="font-medium">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-slate-500 shadow-sm">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
            <p className="font-medium">Loading requests...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-slate-500 shadow-sm">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">All Caught Up!</h3>
            <p className="mt-1">No pending profile image update requests found.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Requested At</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((row) => {
                    const fullName = String(`${row.user?.first_name || ''} ${row.user?.last_name || ''}`).trim();
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                              <UserIcon className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-bold text-slate-900">{fullName || row.user?.username || 'Unknown User'}</div>
                              <div className="text-xs font-medium text-slate-500">{row.user?.email || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-400" />
                            {row.requested_at ? new Date(row.requested_at).toLocaleString() : '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          <div className="max-w-xs truncate font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100" title={row.reason || '-'}>
                            {row.reason || <span className="text-slate-400 italic">No reason provided</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => reviewRequest(row.id, 'approve')}
                              disabled={savingId === row.id}
                              className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-500 hover:text-white hover:border-emerald-600 transition-all font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <Check className="h-4 w-4" />
                              Approve
                            </button>
                            <button
                              onClick={() => reviewRequest(row.id, 'reject')}
                              disabled={savingId === row.id}
                              className="px-4 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-500 hover:text-white hover:border-rose-600 transition-all font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <X className="h-4 w-4" />
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
