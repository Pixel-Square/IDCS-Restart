import React, { useState, useEffect } from 'react';
import { Plus, Loader, AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';
import AnnouncementItem from '../../components/AnnouncementItem';
import AnnouncementCreate from '../../components/AnnouncementCreate';

interface Announcement {
  id: string;
  title: string;
  content: string;
  source: 'hod' | 'iqac';
  created_by_name: string;
  created_at: string;
  is_read: boolean;
  course_count: number;
}

interface AnnouncementsPageProps {
  user?: { username: string; profile_type?: string; profile?: any; roles?: any[] } | null;
}

export default function AnnouncementsPage({ user }: AnnouncementsPageProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Check if user is HOD or IQAC
  const isHodOrIqac = user?.roles?.some((role: any) =>
    role.name === 'HOD' || role.name === 'IQAC'
  ) || user?.profile?.designation?.toUpperCase().includes('HOD');

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${getApiBase()}/api/announcements/announcements/`;
      const response = await apiClient.get(url);
      setAnnouncements(response.data.results || response.data);
    } catch (err) {
      console.error('Failed to fetch announcements:', err);
      setError('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = (announcementId: string) => {
    setAnnouncements((prevAnnouncements) =>
      prevAnnouncements.map((ann) =>
        ann.id === announcementId ? { ...ann, is_read: true } : ann
      )
    );
  };

  const handleRemoveAnnouncement = (announcementId: string) => {
    setAnnouncements((prevAnnouncements) =>
      prevAnnouncements.filter((ann) => ann.id !== announcementId)
    );
  };

  const handleCreateSuccess = () => {
    fetchAnnouncements();
  };

  const filteredAnnouncements =
    filter === 'unread'
      ? announcements.filter((ann) => !ann.is_read)
      : announcements;

  const unreadCount = announcements.filter((ann) => !ann.is_read).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Announcements</h1>
              <p className="text-gray-600 mt-2">
                Stay updated with important announcements from HOD and IQAC
              </p>
            </div>
            {isHodOrIqac && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg whitespace-nowrap"
              >
                <Plus className="w-5 h-5" />
                Create Announcement
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              All Announcements
            </button>
            {unreadCount > 0 && (
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors relative ${
                  filter === 'unread'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Unread ({unreadCount})
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader className="w-8 h-8 text-blue-600 animate-spin mb-3" />
            <p className="text-gray-600">Loading announcements...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-red-900 font-semibold">Error Loading Announcements</h3>
              <p className="text-red-700 mt-1">{error}</p>
              <button
                onClick={fetchAnnouncements}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredAnnouncements.length === 0 && !error && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No Announcements</h3>
            <p className="text-gray-600 mt-2">
              {filter === 'unread'
                ? 'All announcements have been read!'
                : 'No announcements available at this time.'}
            </p>
          </div>
        )}

        {/* Announcements List */}
        {!loading && filteredAnnouncements.length > 0 && (
          <div className="space-y-4">
            {filteredAnnouncements.map((announcement) => (
              <AnnouncementItem
                key={announcement.id}
                announcement={announcement}
                onMarkAsRead={handleMarkAsRead}
                onClose={() => handleRemoveAnnouncement(announcement.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Announcement Modal */}
      {showCreateModal && (
        <AnnouncementCreate
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
          user={user}
        />
      )}
    </div>
  );
}
