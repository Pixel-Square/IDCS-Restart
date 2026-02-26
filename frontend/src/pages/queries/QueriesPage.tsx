import React, { useState, useEffect } from 'react';
import UserQueriesComponent from '../../components/UserQueriesComponent';
import QueriesReceiverComponent from '../../components/QueriesReceiverComponent';
import { getMe } from '../../services/auth';
import { Loader2 } from 'lucide-react';

export default function QueriesPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-queries' | 'all-queries'>('my-queries');

  useEffect(() => {
    async function loadUser() {
      try {
        const userData = await getMe();
        setUser(userData);
      } catch (err) {
        console.error('Failed to load user:', err);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="text-slate-600">Loading...</span>
        </div>
      </div>
    );
  }

  const canManageQueries = user?.permissions?.includes('queries.manage');

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto">
        {canManageQueries && (
          <div className="mb-6 flex gap-2 bg-white rounded-lg p-2 shadow-sm border border-slate-200">
            <button
              onClick={() => setActiveTab('my-queries')}
              className={`flex-1 px-6 py-3 rounded-md font-medium transition-all ${
                activeTab === 'my-queries'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              My Tokens
            </button>
            <button
              onClick={() => setActiveTab('all-queries')}
              className={`flex-1 px-6 py-3 rounded-md font-medium transition-all ${
                activeTab === 'all-queries'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Tokens (Admin)
            </button>
          </div>
        )}

        {activeTab === 'my-queries' ? (
          <UserQueriesComponent user={user} />
        ) : (
          <QueriesReceiverComponent />
        )}
      </div>
    </div>
  );
}
