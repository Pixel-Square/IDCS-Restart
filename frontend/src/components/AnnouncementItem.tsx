import React, { useState } from 'react';
import { Bell, Clock, User, CheckCircle, X } from 'lucide-react';
import { apiClient } from '../services/auth';
import { getApiBase } from '../services/apiBase';

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

interface AnnouncementBoxProps {
  announcement: Announcement;
  onMarkAsRead?: (id: string) => void;
  onClose?: () => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getSourceBadgeColor = (source: string) => {
  return source === 'hod'
    ? 'bg-purple-100 text-purple-800 border-purple-300'
    : 'bg-blue-100 text-blue-800 border-blue-300';
};

const getSourceBadgeText = (source: string) => {
  return source === 'hod' ? 'HOD' : 'IQAC';
};

export default function AnnouncementBox({
  announcement,
  onMarkAsRead,
  onClose,
}: AnnouncementBoxProps) {
  const [isExpandable, setIsExpandable] = useState(false);
  const [isMarking, setIsMarking] = useState(false);

  const handleMarkAsRead = async () => {
    if (announcement.is_read) return;

    try {
      setIsMarking(true);
      const url = `${getApiBase()}/api/announcements/announcements/${announcement.id}/mark_as_read/`;
      await apiClient.post(url);
      onMarkAsRead?.(announcement.id);
    } catch (error) {
      console.error('Failed to mark announcement as read:', error);
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div
      className={`rounded-lg border-2 transition-all ${
        announcement.is_read
          ? 'bg-white border-gray-200'
          : 'bg-blue-50 border-blue-300 shadow-md'
      }`}
    >
      {/* Header */}
      <div className="p-4 sm:p-5 flex items-start gap-4 cursor-pointer hover:bg-opacity-80 transition"
        onClick={handleMarkAsRead}
      >
        {/* Icon */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
          announcement.is_read
            ? 'bg-gray-100'
            : 'bg-blue-200 animate-pulse'
        }`}>
          {announcement.is_read ? (
            <CheckCircle className="w-6 h-6 text-gray-600" />
          ) : (
            <Bell className="w-6 h-6 text-blue-600" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 break-words">
              {announcement.title}
            </h3>
            {onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-2">
            <span className={`px-2 py-1 rounded-full border font-medium text-xs ${getSourceBadgeColor(
              announcement.source
            )}`}>
              {getSourceBadgeText(announcement.source)}
            </span>
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>{announcement.created_by_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{formatDate(announcement.created_at)}</span>
            </div>
            {announcement.course_count > 0 && (
              <span className="text-gray-500">
                Sent to {announcement.course_count} course{announcement.course_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Status */}
          {!announcement.is_read && (
            <div className="text-xs font-medium text-blue-600">
              New • Click to mark as read
            </div>
          )}
        </div>
      </div>

      {/* Content Preview & Expandable */}
      {announcement.content && (
        <div className="px-4 sm:px-5 pb-4">
          <div
            className={`text-gray-700 text-sm leading-relaxed ${
              isExpandable ? '' : 'line-clamp-2'
            }`}
          >
            {announcement.content}
          </div>
          {announcement.content.length > 150 && (
            <button
              onClick={() => setIsExpandable(!isExpandable)}
              className="mt-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
            >
              {isExpandable ? 'Show Less' : 'Read More'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
