import React, { useState } from 'react';
import { Clock, CheckCircle, PlusCircle, Image, Megaphone, Video, FileText, Filter } from 'lucide-react';

type ActivityType = 'Approved' | 'Created' | 'Rejected';

interface RecentActivity {
  id: string;
  activityType: ActivityType;
  title: string;
  details: string;
  contentType: string;
  timestamp: string;
}

const DUMMY_ACTIVITIES: RecentActivity[] = [
  { id: '1',  activityType: 'Approved', title: 'Alumni Meet 2024',           contentType: 'Event',        details: 'Event approved for branding support.',          timestamp: '2024-03-02T11:20:00Z' },
  { id: '2',  activityType: 'Created',  title: 'Annual Day 2024 Poster',     contentType: 'Poster',       details: 'Poster created for Annual Day celebrations.',    timestamp: '2024-12-01T09:00:00Z' },
  { id: '3',  activityType: 'Created',  title: 'Tech Fest Highlights Video', contentType: 'Media',        details: 'Media entry created for Tech Fest 2024.',        timestamp: '2024-11-10T14:00:00Z' },
  { id: '4',  activityType: 'Rejected', title: 'Inter-College Debate',       contentType: 'Event',        details: 'Rejected due to late submission.',               timestamp: '2024-03-25T10:00:00Z' },
  { id: '5',  activityType: 'Created',  title: 'Freshers Welcome Notice',    contentType: 'Announcement', details: 'Announcement drafted for freshers event.',       timestamp: '2024-08-01T10:30:00Z' },
  { id: '6',  activityType: 'Approved', title: 'Pongal Cultural Week',       contentType: 'Event',        details: 'Event approved with branding material package.', timestamp: '2024-01-08T09:45:00Z' },
  { id: '7',  activityType: 'Created',  title: 'Sports Day Banner',          contentType: 'Poster',       details: 'Large format banner designed for sports day.',   timestamp: '2024-02-14T13:00:00Z' },
  { id: '8',  activityType: 'Approved', title: 'Research Symposium 2024',    contentType: 'Event',        details: 'Branding package approved for symposium.',       timestamp: '2024-04-05T16:00:00Z' },
];

const ACTIVITY_STYLES: Record<ActivityType, { color: string; bg: string; icon: React.ElementType }> = {
  Approved: { color: 'text-green-700',  bg: 'bg-green-100',  icon: CheckCircle  },
  Created:  { color: 'text-purple-700', bg: 'bg-purple-100', icon: PlusCircle   },
  Rejected: { color: 'text-red-600',    bg: 'bg-red-100',    icon: Clock        },
};

const CONTENT_ICONS: Record<string, React.ElementType> = {
  Poster:       Image,
  Announcement: Megaphone,
  Media:        Video,
  Article:      FileText,
  Event:        CheckCircle,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function BrandingRecentsPage() {
  const [filter, setFilter] = useState<'All' | ActivityType>('All');

  const filtered =
    filter === 'All'
      ? DUMMY_ACTIVITIES
      : DUMMY_ACTIVITIES.filter((a) => a.activityType === filter);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recents</h1>
        <p className="text-gray-500 text-sm mt-1">Recently approved or created branding activities.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {(['Approved', 'Created', 'Rejected'] as ActivityType[]).map((type) => {
          const s = ACTIVITY_STYLES[type];
          const count = DUMMY_ACTIVITIES.filter((a) => a.activityType === type).length;
          return (
            <div key={type} className={`rounded-2xl p-4 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.color}`}>{count}</p>
              <p className={`text-xs font-medium mt-0.5 ${s.color}`}>{type}</p>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        {(['All', 'Approved', 'Created', 'Rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
              ${filter === f ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-purple-300'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Activity feed */}
      <div className="relative">
        {/* vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

        <div className="space-y-4">
          {filtered.map((activity) => {
            const s = ACTIVITY_STYLES[activity.activityType];
            const ActivityIcon = s.icon;
            const ContentIcon = CONTENT_ICONS[activity.contentType] || FileText;
            return (
              <div key={activity.id} className="flex items-start gap-4 relative">
                {/* Icon dot on timeline */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${s.bg}`}>
                  <ActivityIcon className={`w-5 h-5 ${s.color}`} />
                </div>

                {/* Card */}
                <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm">{activity.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.color}`}>
                          {activity.activityType}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{activity.details}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
                      <ContentIcon className="w-3.5 h-3.5" />
                      <span>{activity.contentType}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(activity.timestamp).toLocaleString()}</span>
                    <span className="text-gray-300">·</span>
                    <span>{timeAgo(activity.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400 pl-10">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No recent activities found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
